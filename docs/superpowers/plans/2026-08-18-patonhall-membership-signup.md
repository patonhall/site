# Homepage Membership & Founders Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage's plain subscribe form with a tight pitch
followed by one tiered signup form (mailing list / Member pre-commit /
Founder), reusing the Google Form + Apps Script + Kit + GitHub Issue
pattern already built for Book Space / Training sign-up.

**Architecture:** `src/index.html` gets a new pitch paragraph and a
restyled `.signup` section whose form submits to a new Google Form
(background `fetch`, native-action no-JS fallback — same technique as
`book-space.html`/`training-signup.html`). A tier `<select>` shows/hides
the Interest field and changes the submit button's text via
`assets/js/homepage-signup.js`. A new Apps Script
(`google-apps-script/homepage-signup.gs`) processes each submission:
upserts and tags the subscriber in Kit, then opens a GitHub Issue as pure
notification — there is no repo data type for members, so unlike the
booking/training pipeline there is no embedded `request-data` block and no
`approved`-label write-back step.

**Tech Stack:** Vanilla ES5-compatible JavaScript, matching
`book-space.js`/`training-signup.js`'s existing style. No new CSS — the
tier chooser is a `<select>`, reusing `.signup-form select` styling
as-is. Apps Script (JS-like, Google's runtime) for the processor, matching
`booking-request.gs`'s established structure. No changes to
`admin_server.py` or any `assets/data/*.json` file — this pipeline never
writes to the repo.

**Spec:** `docs/superpowers/specs/2026-08-18-patonhall-membership-signup-design.md`

## Global Constraints

- No payment processing of any kind. Every tier is intent-capture only;
  the fixed fine print under the submit button ("Submitting reserves your
  spot — we'll follow up by email to arrange payment. Nothing is charged
  now.") must ship exactly as specified — this is the one piece of copy in
  this plan that isn't optional, since it's what keeps the form honest
  about what clicking it does.
- The Google Form for this (`homepage-signup`) does not exist yet — the
  user creates it after this plan lands. `src/index.html`'s form action URL
  and every `entry.` field name are therefore placeholders
  (`entry.REPLACE_WITH_...`), clearly marked as such, exactly as written in
  Task 1 — do not invent plausible-looking numeric IDs; a fabricated ID is
  worse than an obvious placeholder because it fails silently instead of
  being easy to find.
- No new CSS. The tier control is a `<select>`, not radio buttons, to reuse
  `.signup-form select` styling with zero changes to `assets/css/site.css`.
- The old `.signup-sub` "first twenty-five members" line is dropped, not
  kept — it's superseded by the new pitch and explicit tier pricing, and
  keeping both would contradict each other.
- Every field must have a native HTML `name` attribute (no JS-only
  fields) — this form has no date/time splitting requirement like Book
  Space's, so it can and must get a fully working no-JS fallback, matching
  `training-signup.html`.
- Nothing in this plan touches `babbworks/patonhall`'s existing Kit setup,
  `admin_server.py`, or any file under `assets/data/`.
- `python3 build.py --check` must pass after the `src/index.html` change.

---

### Task 1: Homepage restructure and signup form

**Files:**
- Modify: `src/index.html`
- Create: `assets/js/homepage-signup.js`

**Interfaces:**
- Consumes: nothing new (no dependency on Tasks 2/3).
- Produces: the built `index.html` with `#homepage-signup-form`,
  `#hs-tier`, `#hs-interest-row`, `#hs-submit`, `#hs-status` — not consumed
  by any other task in this plan, but the field `name`s
  (`entry.REPLACE_WITH_NAME`, `entry.REPLACE_WITH_EMAIL`,
  `entry.REPLACE_WITH_TIER`, `entry.REPLACE_WITH_INTEREST`) are the ones
  the user will replace with real IDs once the Google Form exists — note
  this clearly in your task report so it's easy to find later.

- [ ] **Step 1: Replace `src/index.html`'s content**

Replace the entire file with:

```html
<!--
title: Paton Hall — Industrial hub in downtown Hamilton
nav: home
class: page-home
-->
  <main class="main">
    <h1 class="page-title">Paton Hall</h1>

    <p>Paton Hall is a members-run industrial hub opening in downtown Hamilton —
    electronics, machinery, robotics, and hands-on training. We're raising our
    founding membership before we open: join the list, or help launch us as a
    Member or Founder.</p>

    <!-- Submits to the homepage-signup Google Form (see
         google-apps-script/homepage-signup.gs and
         docs/superpowers/specs/2026-08-18-patonhall-membership-signup-design.md)
         instead of posting to Kit directly — Kit still gets updated, via
         Apps Script's API calls, not a Kit-hosted form. Replace every
         entry.REPLACE_WITH_* name below, and the form's action URL, once
         the Google Form exists. -->
    <section class="signup">
      <p class="eyebrow">Join Us</p>
      <p>Receive progress updates, or help launch Paton Hall as a Member or Founder.</p>

      <form id="homepage-signup-form" class="signup-form"
            action="https://docs.google.com/forms/d/e/REPLACE_WITH_FORM_ID/formResponse"
            method="POST" target="_blank">
        <div>
          <label for="hs-name">Name</label>
          <input id="hs-name" type="text" name="entry.REPLACE_WITH_NAME" autocomplete="given-name" required>
        </div>
        <div>
          <label for="hs-email">Email</label>
          <input id="hs-email" type="email" name="entry.REPLACE_WITH_EMAIL" autocomplete="email" required>
        </div>

        <div class="full">
          <label for="hs-tier">I want to</label>
          <select id="hs-tier" name="entry.REPLACE_WITH_TIER">
            <option value="List">Join the list</option>
            <option value="Member">Become a Member</option>
            <option value="Founder">Become a Founder</option>
          </select>
        </div>

        <div class="full" id="hs-interest-row">
          <label for="hs-interest">What brings you here</label>
          <select id="hs-interest" name="entry.REPLACE_WITH_INTEREST">
            <option value="Build nights">Build nights</option>
            <option value="Learning days and talks">Learning days and talks</option>
            <option value="Certified electronics training">Certified electronics training</option>
            <option value="Just keeping an eye on it">Just keeping an eye on it</option>
          </select>
        </div>

        <div class="full">
          <button type="submit" id="hs-submit">Put me on the list</button>
        </div>
      </form>

      <p class="fineprint">Submitting reserves your spot — we'll follow up by email to
      arrange payment. Nothing is charged now. Questions:
      <a href="mailto:paton@babb.tel">paton@babb.tel</a>.</p>

      <p id="hs-status" class="form-status" role="status"></p>
    </section>

    <hr class="rule">

    <p>Hamilton has industrial heritage, technical culture, manufacturing capacity and a port.
    It's also the nexus for Toronto, Waterloo and Buffalo regions. Steeltown is the northern
    linchpin of the Great Lakes industrial corridor stretching from Ontario through the
    American Rust Belt.</p>

    <p>This corridor and the wider Rust Belt are home to the reindustrialization movement. It
    aims to revive hard industries and bring advanced manufacturing to old towns. It's being
    driven by big policy and 1000s of small actors. The Hammer is the best positioned place in
    North America to accelerate experiments.</p>

    <p class="note">All programming and events organized by the Membership. No expensive assets or agendas to maintain.<br>
    If you are a local business or organization interested in using the space or a membership, contact us!<br>
    Space re-organized every AM or PM to support in-demand activities.</p>

    <p class="colophon">Paton Hall Inc. is a Canadian corporation run by and for its local
    membership.</p>
  </main>

  <aside class="aside">
    <img class="building" src="assets/img/front.jpg"
         alt="The Paton Hall building: a single-storey white concrete-block garage with an open bay door and a Paton Hall sign.">

    <p class="address">4 Breadalbane St, Hamilton, Ontario L8R 3E9</p>

    <p class="directions">
      <a href="https://www.google.com/maps/place/4+Breadalbane+St,+Hamilton,+ON+L8R+3E9/@43.2628465,-79.8917116,605m/data=!3m2!1e3!4b1!4m6!3m5!1s0x882c9b6398111ba9:0xbb89c6be63d64137!8m2!3d43.2628465!4d-79.8891313!16s%2Fg%2F11c5bzyvbw"
         rel="noopener" target="_blank">DIRECTIONS</a>
    </p>

    <ul class="facilities">
      <li>Pool Table</li>
      <li>Work Tables &amp; Benches</li>
      <li>Assembly Zones</li>
      <li>Blackboard | Whiteboard</li>
      <li>Tools &amp; Storage Bins</li>
      <li>Certified Training</li>
      <li>Peer Education</li>
      <li>Talks &amp; Meetups</li>
      <li>Demos &amp; Launches</li>
    </ul>
  </aside>

  <script src="assets/js/homepage-signup.js" defer></script>
```

Note what changed from the previous version: the opening paragraph is
replaced with the new pitch; the old `.signup` section (which posted
directly to `action="https://app.kit.com/forms/9788991/subscriptions"`
with fields `fields[first_name]`/`email_address`/`fields[interest]`, and
had a `.signup-sub` "first twenty-five members" paragraph and an
`id="su-*"` field naming scheme) is fully replaced by the block above; the
two Hamilton/reindustrialization paragraphs and the `.note` paragraph move
from above the old form to below the new one, otherwise unchanged;
`<aside>` and the colophon are unchanged.

- [ ] **Step 2: Create the form handler script**

```js
/* Handles the homepage's combined signup form: shows/hides the Interest
   field and changes the submit button's text based on the chosen tier,
   then submits to the homepage-signup Google Form in the background.
   Every field has a native `name`, so a visitor with JS disabled can
   still submit — this script only upgrades the experience. */
(function () {
  'use strict';

  var BUTTON_TEXT = {
    List: 'Put me on the list',
    Member: 'Pre-commit — $50 first month',
    Founder: 'Become a Founder — $1000'
  };

  function byId(id) { return document.getElementById(id); }

  function updateTier() {
    var tier = byId('hs-tier').value;
    byId('hs-interest-row').style.display = tier === 'List' ? '' : 'none';
    byId('hs-submit').textContent = BUTTON_TEXT[tier] || BUTTON_TEXT.List;
  }

  function setStatus(message, kind) {
    var status = byId('hs-status');
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setStatus('Submitting…', '');

    var form = byId('homepage-signup-form');
    fetch(form.action, { method: 'POST', mode: 'no-cors', body: new FormData(form) })
      .then(function () {
        setStatus('Thanks — we’ll follow up by email.', 'success');
        form.reset();
        updateTier();
      })
      .catch(function () {
        setStatus('Could not submit automatically. Check your connection and try again.', 'error');
      });
  }

  function init() {
    updateTier();
    byId('hs-tier').addEventListener('change', updateTier);
    byId('homepage-signup-form').addEventListener('submit', onSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

Save as `assets/js/homepage-signup.js`.

- [ ] **Step 3: Build and verify**

Run: `python3 build.py && python3 build.py --check`
Expected: `up to date (20 pages)`.

- [ ] **Step 4: Manually verify**

Serve the site (`python3 -m http.server 8017` is sufficient — this task
needs no write server) and open `index.html`. Confirm: the new pitch and
form render where the old subscribe box was; the Hamilton/reindustrialization
paragraphs and the note now appear below the form; selecting each tier in
the dropdown correctly shows/hides the "What brings you here" field and
changes the button's text to match `BUTTON_TEXT`; the fine print under the
button reads exactly as specified. Submitting will fail silently (no-cors
against a placeholder URL) — that's expected until the real Google Form
exists; don't treat it as a bug in this task.

If no browser tool is available in your environment, verify by reading the
rendered HTML/JS carefully instead, and say so honestly in your report —
a prior task in this same repo established that no Chromium is available
anywhere in this environment; don't spend time rediscovering that.

- [ ] **Step 5: Commit**

```bash
git add src/index.html assets/js/homepage-signup.js index.html
git commit -m "Restructure the homepage around a tiered signup/membership form"
```

---

### Task 2: Apps Script processor

**Files:**
- Create: `google-apps-script/homepage-signup.gs`

**Interfaces:**
- Consumes: nothing in this repo (Apps Script is deployed outside it,
  matching `booking-request.gs`/`training-request.gs`'s existing pattern —
  this file is version-controlled here but executed by Google, not by
  anything in this repo).
- Produces: nothing consumed by another task — this is the last piece of
  the pipeline itself; Task 3 only documents it.

- [ ] **Step 1: Create the script**

```javascript
/**
 * Paton Hall — Homepage signup processor.
 *
 * Bound to the homepage-signup Sheet. Kept here for version control; paste
 * it into that Sheet's Apps Script editor (Extensions > Apps Script) to
 * deploy — this file is not executed by anything in this repo.
 *
 * Fires on form submit: upserts and tags the subscriber in Kit based on
 * their chosen tier, then opens a GitHub Issue as pure notification for an
 * admin to follow up on (arrange payment for Member/Founder; nothing
 * further for List). There is no repo data type for members, so unlike
 * the booking/training pipeline this issue carries no embedded
 * request-data block and nothing labels it "approved" — the admin closes
 * it by hand once they've followed up.
 *
 * Design: docs/superpowers/specs/2026-08-18-patonhall-membership-signup-design.md
 *
 * Script Properties required (Project Settings (gear icon) > Script
 * Properties > Add script property):
 *   KIT_API_KEY     — Kit v4 API key
 *   GITHUB_TOKEN    — a GitHub PAT scoped to `repo` on peers8862/patonhall-excalisite
 *
 * Install onFormSubmit as an INSTALLABLE trigger (Triggers icon in the
 * left sidebar > + Add Trigger > function onFormSubmit > event source
 * "From spreadsheet" > event type "On form submit" > Save) — the default
 * simple trigger of the same name can't call UrlFetchApp at all.
 */

var REPO = 'peers8862/patonhall-excalisite';

var TIER_TAGS = {
  List: 'list-subscriber',
  Member: 'member-precommit',
  Founder: 'founder-interest'
};

var TIER_LABELS = {
  List: 'tier:list',
  Member: 'tier:member',
  Founder: 'tier:founder'
};

function onFormSubmit(e) {
  var props = PropertiesService.getScriptProperties();
  var kitApiKey = props.getProperty('KIT_API_KEY');
  var githubToken = props.getProperty('GITHUB_TOKEN');

  var values = e.namedValues;
  var name = firstValue_(values, 'Name');
  var email = firstValue_(values, 'Email');
  var tier = firstValue_(values, 'Tier');
  var interest = firstValue_(values, 'Interest');

  var tag = TIER_TAGS[tier];
  if (!tag) {
    throw new Error('Unrecognized Tier value: "' + tier + '"');
  }
  kitUpsertAndTag_(email, name, tag, kitApiKey);

  var title = '[Signup] ' + tier + ' — ' + name;
  var body = buildIssueBody_(name, email, tier, interest);
  var labels = ['type:signup', TIER_LABELS[tier]];
  openGithubIssue_(title, body, labels, githubToken);
}

/* --- shared helpers (duplicated from booking-request.gs/training-request.gs
   — three separate Apps Script projects, no practical way to share code
   between them without a published Library) ---------------------------- */

function firstValue_(namedValues, key) {
  return (namedValues[key] && namedValues[key][0]) || '';
}

function kitUpsertAndTag_(email, firstName, tagName, apiKey) {
  UrlFetchApp.fetch('https://api.kit.com/v4/subscribers', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Kit-Api-Key': apiKey },
    payload: JSON.stringify({ email_address: email, first_name: firstName }),
    muteHttpExceptions: true
  });

  var tagsResponse = UrlFetchApp.fetch('https://api.kit.com/v4/tags?per_page=100', {
    headers: { 'X-Kit-Api-Key': apiKey },
    muteHttpExceptions: true
  });
  var tags = JSON.parse(tagsResponse.getContentText()).tags || [];
  var match = tags.filter(function (t) { return t.name.toLowerCase() === tagName.toLowerCase(); })[0];
  if (!match) {
    throw new Error('Kit has no tag named "' + tagName + '" — create it first.');
  }

  UrlFetchApp.fetch('https://api.kit.com/v4/tags/' + match.id + '/subscribers', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Kit-Api-Key': apiKey },
    payload: JSON.stringify({ email_address: email }),
    muteHttpExceptions: true
  });
}

function openGithubIssue_(title, body, labels, token) {
  var response = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/issues', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ title: title, body: body, labels: labels }),
    muteHttpExceptions: true
  });
  return JSON.parse(response.getContentText());
}

function buildIssueBody_(name, email, tier, interest) {
  var lines = [];
  lines.push('**Requester:** ' + name + ' <' + email + '>');
  lines.push('**Tier:** ' + tier);
  if (tier === 'List') {
    lines.push('**Interest:** ' + (interest || '(none given)'));
    lines.push('');
    lines.push('No follow-up action needed beyond Kit\'s own welcome email.');
  } else if (tier === 'Member') {
    lines.push('');
    lines.push('Follow up to arrange the $50 first-month payment.');
  } else {
    lines.push('');
    lines.push('Follow up to arrange the $1000 Founding Membership payment.');
  }
  return lines.join('\n');
}
```

Save as `google-apps-script/homepage-signup.gs`.

- [ ] **Step 2: Syntax-check as plain JS**

Run:
```bash
cp google-apps-script/homepage-signup.gs /tmp/homepage-signup.js
node --check /tmp/homepage-signup.js
```
Expected: no output (success). If `node` isn't available in your
environment, note that in your report — this is a best-effort check, not
a hard requirement, since the file's real runtime is Google's, not Node's.

- [ ] **Step 3: Commit**

```bash
git add google-apps-script/homepage-signup.gs
git commit -m "Add the homepage signup Apps Script processor"
```

---

### Task 3: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1–2, for accuracy.
- Produces: nothing consumed by other tasks — last task in this plan.

- [ ] **Step 1: Update the "Booking & training request pipeline" section**

Find the `## Booking & training request pipeline` section in `README.md`
(added by the previous plan). Immediately after its existing paragraphs,
before the "Requires the `KIT_API_KEY`..." line, insert:

```markdown

The homepage's signup form (`index.html`) follows the same shape for a
third case — joining the mailing list, or pre-committing as a Member or
Founder — via `google-apps-script/homepage-signup.gs`. It's simpler than
the booking/training pipeline: there's no repo data type for members, so
this one only opens a notification GitHub Issue (tiered labels
`tier:list`/`tier:member`/`tier:founder`) for an admin to follow up on —
no embedded data block, no `approved`-label write-back. Design:
`docs/superpowers/specs/2026-08-18-patonhall-membership-signup-design.md`.
Email copy for Kit's own automations lives in `main-copy.md`, not this
README.
```

- [ ] **Step 2: Update the Kit tags line**

Find the line ending in "the tags `booking-request`, `booking-approved`,
`booking-conflict`, `training-requested`, `training-reviewed` already
existing." Replace it with:

```markdown
Requires the `KIT_API_KEY` and `GITHUB_TOKEN` Script Properties set on each
Apps Script project (not GitHub secrets — see the specs), and, in Kit, the
tags `booking-request`, `booking-approved`, `booking-conflict`,
`training-requested`, `training-reviewed`, `list-subscriber`,
`member-precommit`, `founder-interest` already existing.
```

(This replaces the old sentence that ended the section — check the exact
current wording in `README.md` before replacing, since it may not match
character-for-character; match on meaning; keep everything else in that
paragraph.)

- [ ] **Step 3: Final verification**

```bash
python3 build.py --check
python3 -m unittest discover -s tests -t . 2>&1 | tail -3
git status
```
Expected: `up to date (20 pages)`; 30 tests passing (this plan doesn't
touch `admin_server.py` or its tests, so the count is unchanged from
before this plan); `git status` shows only `README.md` unstaged
(everything else already committed in Tasks 1–2).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document the homepage signup pipeline"
```
