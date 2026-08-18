#!/usr/bin/env python3
"""Turns a labeled GitHub Issue into a real Calendar event or Training
course. Run by .github/workflows/approve-request.yml when the "approved"
label is added to an issue the booking/training request pipeline created
(see docs/superpowers/specs/2026-08-18-patonhall-booking-training-requests-design.md).

Reads the full event payload GitHub Actions provides at $GITHUB_EVENT_PATH
rather than any single field interpolated into a shell command, so nothing
from the issue body is ever spliced into a script's source text.

Writes its result to $GITHUB_OUTPUT for the workflow's later steps:

  status=skip                                    — label added wasn't "approved"
  status=error   message=<...>                   — the request block was
                  missing, malformed, or failed admin_server's validation;
                  the issue stays open
  status=created kind=<booking|training>
                 uid=<...> title=<...>            — a real record was
                  written to events.json/courses.json; the workflow commits,
                  pushes, comments, and closes the issue

Standard library only.
"""

import json
import os
import re
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import admin_server  # noqa: E402  (path must be set up first)

REQUEST_BLOCK = re.compile(r'<!--\s*request-data:\s*(\{.*?\})\s*-->', re.DOTALL)


def write_output(**fields):
    """Writes to $GITHUB_OUTPUT in its key=value (or key<<delimiter for
    multiline/special-char values) format. Falls back to stdout so the
    script is still runnable and inspectable outside Actions."""
    lines = []
    for key, value in fields.items():
        value = str(value)
        if '\n' in value or '=' in value:
            delimiter = 'ghadelim_' + uuid.uuid4().hex
            lines.append('%s<<%s\n%s\n%s' % (key, delimiter, value, delimiter))
        else:
            lines.append('%s=%s' % (key, value))
    text = '\n'.join(lines) + '\n'

    output_path = os.environ.get('GITHUB_OUTPUT')
    if output_path:
        with open(output_path, 'a', encoding='utf-8') as f:
            f.write(text)
    else:
        print(text, end='')


def to_event_payload(request):
    return {
        'title': request.get('title', ''),
        'location': request.get('space', ''),
        'start': request.get('start', ''),
        'end': request.get('end', ''),
        'allDay': False,
        'description': request.get('purpose', ''),
    }


def to_course_payload(request):
    return {
        'title': request.get('title', ''),
        'category': request.get('category', ''),
        'startDate': request.get('startDate', ''),
        'endDate': request.get('endDate', ''),
        'cost': request.get('cost', ''),
        'registrationMode': request.get('registrationMode', ''),
        'seatsTotal': request.get('seatsTotal'),
        'seatsFilled': request.get('seatsFilled'),
    }


def main():
    event_path = os.environ.get('GITHUB_EVENT_PATH')
    if not event_path:
        write_output(status='error', message='GITHUB_EVENT_PATH not set')
        return 1

    with open(event_path, 'r', encoding='utf-8') as f:
        event = json.load(f)

    label_name = (event.get('label') or {}).get('name', '')
    if label_name != 'approved':
        write_output(status='skip')
        return 0

    body = (event.get('issue') or {}).get('body') or ''
    match = REQUEST_BLOCK.search(body)
    if not match:
        write_output(status='error',
                      message='No request-data block found in the issue body')
        return 0

    try:
        request = json.loads(match.group(1))
    except ValueError as e:
        write_output(status='error',
                      message='request-data block is not valid JSON: %s' % e)
        return 0

    kind = request.get('kind')
    try:
        if kind == 'booking':
            record = admin_server.create_event(to_event_payload(request))
        elif kind == 'training':
            record = admin_server.create_course(to_course_payload(request))
        else:
            write_output(status='error',
                          message='request-data "kind" must be "booking" or '
                                  '"training", got %r' % kind)
            return 0
    except ValueError as e:
        write_output(status='error', message=str(e))
        return 0

    write_output(status='created', kind=kind, uid=record['uid'], title=record['title'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
