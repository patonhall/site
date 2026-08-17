#!/usr/bin/env python3
"""Poll Kit for new Book Space requests, check each one against
assets/data/events.json for a scheduling conflict, and open a GitHub Issue
summarizing the result. Never writes to events.json itself.

  - No conflict: the issue is opened and immediately closed (closed = "no
    conflict found, go ahead and add it"), and the Kit subscriber is tagged
    "booking-approved".
  - Conflict: the issue is left open for a human to resolve, and the
    subscriber is tagged "booking-conflict".

Either way, a real event only ever gets added to events.json by a human,
through admin-events.html — this script is a decision aid, not a writer.

Run by .github/workflows/booking-requests.yml on a schedule. Credentials
come from GitHub Actions secrets/environment and are never stored in this
repository:

  KIT_API_KEY        required — Kit v4 API Key
  GITHUB_TOKEN        required — provided automatically by Actions; the
                      workflow grants it `issues: write`
  GITHUB_REPOSITORY   required — provided automatically by Actions, "owner/repo"

Kit-side setup this script assumes (create these once, by hand, in Kit):
  - A booking-request form whose custom fields are keyed exactly:
      space        — one of A-I
      start_date   — YYYY-MM-DDTHH:MM
      end_date     — YYYY-MM-DDTHH:MM
      purpose      — free text (optional)
    and which applies the "booking-request" tag on submit.
  - Three tags: "booking-request", "booking-approved", "booking-conflict".
    This script moves a subscriber out of "booking-request" once it has
    opened an issue for their request, so it is never processed twice.

Standard library only, so the workflow needs no pip install.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

EVENTS_PATH = Path(__file__).parent.parent / "assets" / "data" / "events.json"
KIT_V4 = "https://api.kit.com/v4"
PENDING_TAG = "booking-request"
APPROVED_TAG = "booking-approved"
CONFLICT_TAG = "booking-conflict"
TIMEOUT = 30


def kit_request(method, path, api_key, params=None, body=None):
    url = f"{KIT_V4}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "X-Kit-Api-Key": api_key,
        "Accept": "application/json",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        if r.status == 204:
            return {}
        return json.loads(r.read().decode())


def find_tag_id(name, api_key):
    tags = kit_request("GET", "/tags", api_key, {"per_page": 100}).get("tags", [])
    match = next(
        (t for t in tags if str(t.get("name", "")).strip().lower() == name.lower()),
        None,
    )
    if match is None:
        raise SystemExit(f'Kit has no tag named "{name}" — create it first.')
    return match["id"]


def list_pending(tag_id, api_key):
    return kit_request(
        "GET", f"/tags/{tag_id}/subscribers", api_key, {"per_page": 500}
    ).get("subscribers", [])


def retag(email, from_id, to_id, api_key):
    kit_request("POST", f"/tags/{to_id}/subscribers", api_key,
                body={"email_address": email})
    kit_request("DELETE", f"/tags/{from_id}/subscribers", api_key,
                params={"email_address": email})


def parse_dt(value):
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def load_events():
    if not EVENTS_PATH.exists():
        return []
    return json.loads(EVENTS_PATH.read_text())


def find_conflicts(space, start, end, events):
    conflicts = []
    for event in events:
        if event.get("location") != space:
            continue
        ev_start = parse_dt(event.get("start", ""))
        ev_end = parse_dt(event.get("end", ""))
        if ev_start is None or ev_end is None:
            continue
        if ev_end < start or ev_start > end:
            continue
        conflicts.append(event)
    return conflicts


def github_request(method, path, github_token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"https://api.github.com{path}", data=data, method=method,
        headers={
            "Authorization": f"Bearer {github_token}",
            "Accept": "application/vnd.github+json",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        if r.status == 204 or not r.length:
            return {}
        return json.loads(r.read().decode())


def issue_body(subscriber, conflicts):
    fields = subscriber.get("fields") or {}
    space = fields.get("space", "?")
    start = fields.get("start_date", "?")
    end = fields.get("end_date", "?")
    purpose = fields.get("purpose") or "(none given)"
    email = subscriber.get("email_address", "?")
    name = subscriber.get("first_name") or "(no name given)"

    if conflicts:
        status = "**Conflicts with:**\n" + "\n".join(
            f"- {c.get('title', '(untitled)')}: {c.get('start')} – {c.get('end')}"
            for c in conflicts
        )
    else:
        status = "No conflicting events found for this space/time — approved automatically."

    return (
        f"**Requester:** {name} <{email}>\n"
        f"**Space:** {space}\n"
        f"**Requested:** {start} – {end}\n"
        f"**Purpose:** {purpose}\n\n"
        f"{status}\n\n"
        f"Add via `admin-events.html` once confirmed with the requester."
    )


def process(subscriber, repo, api_key, github_token, events, pending_id, approved_id, conflict_id):
    fields = subscriber.get("fields") or {}
    space = fields.get("space")
    start = parse_dt(fields.get("start_date", ""))
    end = parse_dt(fields.get("end_date", ""))
    email = subscriber["email_address"]

    if not space or start is None or end is None:
        print(f"  skipping {email}: missing/invalid space or dates in submitted fields")
        return False

    conflicts = find_conflicts(space, start, end, events)
    title_prefix = "[Book Space] CONFLICT" if conflicts else "[Book Space] Approved"
    issue = github_request("POST", f"/repos/{repo}/issues", github_token, body={
        "title": f"{title_prefix} — Space {space}, {start}",
        "body": issue_body(subscriber, conflicts),
        "labels": ["booking-conflict" if conflicts else "booking-approved"],
    })

    if conflicts:
        retag(email, pending_id, conflict_id, api_key)
        print(f"  opened issue #{issue.get('number')} for {email} (conflict, left open)")
    else:
        github_request("PATCH", f"/repos/{repo}/issues/{issue['number']}", github_token,
                        body={"state": "closed"})
        retag(email, pending_id, approved_id, api_key)
        print(f"  opened+closed issue #{issue.get('number')} for {email} (no conflict, approved)")

    return True


def main():
    api_key = os.environ.get("KIT_API_KEY", "").strip()
    github_token = os.environ.get("GITHUB_TOKEN", "").strip()
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()

    if not (api_key and github_token and repo):
        print("KIT_API_KEY, GITHUB_TOKEN, and GITHUB_REPOSITORY are all required",
              file=sys.stderr)
        return 2

    pending_id = find_tag_id(PENDING_TAG, api_key)
    approved_id = find_tag_id(APPROVED_TAG, api_key)
    conflict_id = find_tag_id(CONFLICT_TAG, api_key)

    subscribers = list_pending(pending_id, api_key)
    if not subscribers:
        print("No pending booking requests.")
        return 0

    events = load_events()
    processed = sum(
        1 for s in subscribers
        if process(s, repo, api_key, github_token, events, pending_id, approved_id, conflict_id)
    )
    print(f"Processed {processed} of {len(subscribers)} pending requests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
