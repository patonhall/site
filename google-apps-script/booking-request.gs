/**
 * Paton Hall — Book Space request processor.
 *
 * Bound to the Book Space Sheet. Kept here for version control; paste it
 * into that Sheet's Apps Script editor (Extensions > Apps Script) to
 * deploy — this file is not executed by anything in this repo.
 *
 * Two entry points:
 *   onFormSubmit(e)  — installable trigger, fires when the linked Google
 *                      Form is submitted. Updates Kit, checks the request
 *                      against the repo's live events.json, and opens a
 *                      GitHub Issue (closed immediately if there's no
 *                      same-space conflict).
 *   doGet(e)         — deploy separately as a Web App (Anyone access).
 *                      Live same-space availability check the public
 *                      booking form calls before submission.
 *
 * Design: docs/superpowers/specs/2026-08-18-patonhall-booking-training-requests-design.md
 *
 * Script Properties required (Project Settings (gear icon) > Script
 * Properties > Add script property):
 *   KIT_API_KEY     — Kit v4 API key
 *   GITHUB_TOKEN    — a GitHub PAT scoped to `repo` on patonhall/site
 *
 * onFormSubmit must be added as an INSTALLABLE trigger (Triggers icon in
 * the left sidebar > + Add Trigger > choose function onFormSubmit > event
 * source "From spreadsheet" > event type "On form submit" > Save). The
 * default *simple* trigger of the same name does NOT work here — simple
 * triggers run in a restricted sandbox that can't call UrlFetchApp at all.
 *
 * UNVERIFIED, flag for a real test: e.namedValues' exact string format for
 * the Date/Time questions. isoFromParts_() assumes Google's typical
 * "9/1/2026" / "2:30:00 PM" formatting (JS's built-in Date parser handles
 * both directly) — this is the standard behavior, but locale settings on
 * the account could shift it. Submit one real test booking after deploying
 * and confirm the GitHub Issue's "Requested:" line shows the date/time you
 * actually entered, not something garbled.
 */

var REPO = 'patonhall/site';
var KIT_TAG_REQUEST = 'booking-request';
var KIT_TAG_APPROVED = 'booking-approved';
var KIT_TAG_CONFLICT = 'booking-conflict';
var CONCURRENT_BUFFER_MINUTES = 60;

function onFormSubmit(e) {
  var props = PropertiesService.getScriptProperties();
  var kitApiKey = props.getProperty('KIT_API_KEY');
  var githubToken = props.getProperty('GITHUB_TOKEN');

  var values = e.namedValues; // { "Name": ["..."], "Email Address": ["..."], ... }
  var name = firstValue_(values, 'Name');
  var email = firstValue_(values, 'Email Address');
  var space = firstValue_(values, 'Space / Zone').split(' - ')[0]; // "A - Blackboard" -> "A"
  var start = isoFromParts_(firstValue_(values, 'Start Date'), firstValue_(values, 'Start Time'));
  var end = isoFromParts_(firstValue_(values, 'End Date'), firstValue_(values, 'End Time'));
  var purpose = firstValue_(values, 'Purpose / Nature of Activity');

  Logger.log('onFormSubmit: %s <%s> space=%s %s - %s', name, email, space, start, end);

  var events = fetchRepoJson_('assets/data/events.json');
  var sameSpaceConflicts = events.filter(function (ev) {
    return ev.location === space && overlaps_(ev.start, ev.end, start, end, 0);
  });
  var concurrent = events.filter(function (ev) {
    return ev.location !== space && overlaps_(ev.start, ev.end, start, end, CONCURRENT_BUFFER_MINUTES);
  });

  var hasConflict = sameSpaceConflicts.length > 0;
  var body = buildIssueBody_(name, email, space, start, end, purpose, sameSpaceConflicts, concurrent);
  var requestData = {
    kind: 'booking',
    title: purpose ? (purpose.length > 60 ? purpose.slice(0, 60) + '…' : purpose) : ('Booking — Space ' + space),
    space: space,
    start: start,
    end: end,
    purpose: purpose
  };
  body += '\n\n<!-- request-data: ' + JSON.stringify(requestData) + ' -->';

  var title = (hasConflict ? '[Book Space] CONFLICT — ' : '[Book Space] Approved — ')
    + 'Space ' + space + ', ' + start;
  var labels = ['type:booking'];
  if (hasConflict) labels.push('booking-conflict');

  /* The issue comes first and Kit second, deliberately. Kit tagging used to
     run before this and threw on a missing tag, which meant a Kit
     misconfiguration silently destroyed the request instead of merely
     failing to tag someone. The issue is what an admin acts on; it must not
     be hostage to the mailing list. */
  var issue = openGithubIssue_(title, body, labels, githubToken);
  Logger.log('opened issue #%s (conflict=%s)', issue.number, hasConflict);
  if (!hasConflict) closeGithubIssue_(issue.number, githubToken);

  tagQuietly_(email, name, KIT_TAG_REQUEST, kitApiKey);
  tagQuietly_(email, name, hasConflict ? KIT_TAG_CONFLICT : KIT_TAG_APPROVED, kitApiKey);
}

/* Kit problems are logged, never thrown: by the time this runs the request
   is already safely in front of an admin, and losing that to a tagging
   failure would be a far worse outcome than an untagged subscriber. */
function tagQuietly_(email, name, tagName, apiKey) {
  try {
    kitUpsertAndTag_(email, name, tagName, apiKey);
    Logger.log('kit: tagged %s with "%s"', email, tagName);
  } catch (err) {
    Logger.log('kit: FAILED to tag %s with "%s" — %s', email, tagName, err.message);
  }
}

function doGet(e) {
  var space = e.parameter.space;
  var start = e.parameter.start;
  var end = e.parameter.end;

  var result;
  if (!space || !start || !end) {
    result = { error: 'space, start, and end query parameters are required' };
  } else {
    var events = fetchRepoJson_('assets/data/events.json');
    var conflicts = events.filter(function (ev) {
      return ev.location === space && overlaps_(ev.start, ev.end, start, end, 0);
    }).map(function (ev) { return { title: ev.title, start: ev.start, end: ev.end }; });
    result = { available: conflicts.length === 0, conflicts: conflicts };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/* --- diagnostics ------------------------------------------------------- */

/**
 * Read-only health check. Run this straight from the Apps Script editor
 * (select runSelfTest, press Run) and read the Execution log — it creates
 * nothing, tags nobody, and opens no issue.
 *
 * It exists because every failure mode in this pipeline is otherwise
 * silent: the UrlFetchApp calls below all pass muteHttpExceptions, and a
 * form submission that never reaches onFormSubmit leaves no trace at all.
 * This turns "nothing happened" into a specific line item.
 */
function runSelfTest() {
  var props = PropertiesService.getScriptProperties();
  var kitApiKey = props.getProperty('KIT_API_KEY');
  var githubToken = props.getProperty('GITHUB_TOKEN');
  var problems = [];

  Logger.log('=== Paton Hall booking pipeline self-test ===');

  /* 1. Is the onFormSubmit trigger actually attached to THIS project, and
        is it spreadsheet-sourced? A form-sourced trigger hands the handler
        an event with no namedValues, so onFormSubmit throws immediately. */
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log('1. Triggers on this project: ' + triggers.length);
  var formSubmitTrigger = null;
  triggers.forEach(function (t) {
    Logger.log('   - handler=' + t.getHandlerFunction()
      + '  source=' + t.getTriggerSource()
      + '  event=' + t.getEventType());
    if (t.getHandlerFunction() === 'onFormSubmit') formSubmitTrigger = t;
  });
  if (!formSubmitTrigger) {
    problems.push('No trigger calling onFormSubmit on this project. Add one: '
      + 'Triggers (clock icon) > Add Trigger > function onFormSubmit, '
      + 'event source "From spreadsheet", event type "On form submit".');
  } else if (String(formSubmitTrigger.getTriggerSource()) !== 'SPREADSHEETS') {
    problems.push('The onFormSubmit trigger is sourced from '
      + formSubmitTrigger.getTriggerSource() + ', not SPREADSHEETS. It must be '
      + '"From spreadsheet" — a form-sourced event has no namedValues.');
  }

  /* 2. Script Properties. Absent is the common case on a fresh project. */
  Logger.log('2. KIT_API_KEY  ' + (kitApiKey ? 'set' : 'MISSING'));
  Logger.log('   GITHUB_TOKEN ' + (githubToken ? 'set' : 'MISSING'));
  if (!kitApiKey) problems.push('KIT_API_KEY script property is not set.');
  if (!githubToken) problems.push('GITHUB_TOKEN script property is not set.');

  /* 3. Kit reachable, and every tag the script uses already exists —
        kitUpsertAndTag_ throws on a missing tag. */
  if (kitApiKey) {
    var tagsResponse = UrlFetchApp.fetch('https://api.kit.com/v4/tags?per_page=100', {
      headers: { 'X-Kit-Api-Key': kitApiKey },
      muteHttpExceptions: true
    });
    Logger.log('3. Kit GET /v4/tags -> HTTP ' + tagsResponse.getResponseCode());
    if (tagsResponse.getResponseCode() !== 200) {
      problems.push('Kit API rejected the key: ' + tagsResponse.getContentText());
    } else {
      var names = (JSON.parse(tagsResponse.getContentText()).tags || [])
        .map(function (t) { return t.name.toLowerCase(); });
      [KIT_TAG_REQUEST, KIT_TAG_APPROVED, KIT_TAG_CONFLICT].forEach(function (tag) {
        var found = names.indexOf(tag.toLowerCase()) !== -1;
        Logger.log('   tag "' + tag + '" ' + (found ? 'exists' : 'MISSING'));
        if (!found) problems.push('Kit has no tag named "' + tag + '" — create it.');
      });
    }
  }

  /* 4. GitHub token valid and scoped to this repo. A bad token is the most
        invisible failure of all: openGithubIssue_ swallows it and returns an
        object with no .number. */
  if (githubToken) {
    var repoResponse = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO, {
      headers: { Authorization: 'Bearer ' + githubToken, Accept: 'application/vnd.github+json' },
      muteHttpExceptions: true
    });
    Logger.log('4. GitHub GET /repos/' + REPO + ' -> HTTP ' + repoResponse.getResponseCode());
    if (repoResponse.getResponseCode() !== 200) {
      problems.push('GITHUB_TOKEN cannot read ' + REPO + ': ' + repoResponse.getContentText());
    } else if (!JSON.parse(repoResponse.getContentText()).permissions.push) {
      problems.push('GITHUB_TOKEN can read ' + REPO + ' but has no write access, '
        + 'so it cannot open issues. It needs the `repo` scope.');
    }
  }

  /* 5. The schedule data the conflict check reads. */
  var rawResponse = UrlFetchApp.fetch(
    'https://raw.githubusercontent.com/' + REPO + '/main/assets/data/events.json',
    { muteHttpExceptions: true });
  Logger.log('5. raw events.json -> HTTP ' + rawResponse.getResponseCode());
  if (rawResponse.getResponseCode() !== 200) {
    problems.push('Cannot read events.json from the repo: HTTP '
      + rawResponse.getResponseCode());
  }

  Logger.log('');
  if (problems.length === 0) {
    Logger.log('RESULT: all checks passed.');
  } else {
    Logger.log('RESULT: ' + problems.length + ' problem(s) found:');
    problems.forEach(function (p, i) { Logger.log('  ' + (i + 1) + '. ' + p); });
  }
  return problems;
}

/* --- shared helpers --------------------------------------------------- */

function firstValue_(namedValues, key) {
  return (namedValues[key] && namedValues[key][0]) || '';
}

function isoFromParts_(dateStr, timeStr) {
  var date = new Date(dateStr + ' ' + timeStr);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function overlaps_(aStart, aEnd, bStart, bEnd, bufferMinutes) {
  var bufferMs = bufferMinutes * 60 * 1000;
  var a1 = new Date(aStart).getTime() - bufferMs;
  var a2 = new Date(aEnd).getTime() + bufferMs;
  var b1 = new Date(bStart).getTime();
  var b2 = new Date(bEnd).getTime();
  return a1 < b2 && b1 < a2;
}

function fetchRepoJson_(path) {
  var url = 'https://raw.githubusercontent.com/' + REPO + '/main/' + path;
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('could not read ' + path + ' from the repo (HTTP '
      + response.getResponseCode() + ') — cannot check for conflicts');
  }
  return JSON.parse(response.getContentText());
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
  if (response.getResponseCode() !== 201) {
    throw new Error('GitHub refused to open the issue (HTTP '
      + response.getResponseCode() + '): ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function closeGithubIssue_(issueNumber, token) {
  var response = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/issues/' + issueNumber, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ state: 'closed' }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    Logger.log('could not close issue #%s (HTTP %s) — it stays open, harmless',
      issueNumber, response.getResponseCode());
  }
}

function buildIssueBody_(name, email, space, start, end, purpose, sameSpaceConflicts, concurrent) {
  var lines = [];
  lines.push('**Requester:** ' + name + ' <' + email + '>');
  lines.push('**Space:** ' + space);
  lines.push('**Requested:** ' + start + ' – ' + end);
  lines.push('**Purpose:** ' + (purpose || '(none given)'));
  lines.push('');

  if (sameSpaceConflicts.length) {
    lines.push('**Conflicts in this space:**');
    sameSpaceConflicts.forEach(function (ev) {
      lines.push('- ' + ev.title + ': ' + ev.start + ' – ' + ev.end);
    });
  } else {
    lines.push('No conflicts in this space — approved automatically.');
  }
  lines.push('');

  if (concurrent.length) {
    lines.push('**Concurrent activity in other zones** (±' + CONCURRENT_BUFFER_MINUTES
      + ' min, for your judgment — not auto-flagged):');
    concurrent.forEach(function (ev) {
      lines.push('- Space ' + ev.location + ', ' + ev.start + ' – ' + ev.end + ': ' + ev.title);
    });
  } else {
    lines.push('Nothing else scheduled nearby.');
  }
  lines.push('');
  lines.push('Add the `approved` label to write this into `events.json` automatically, '
    + 'or edit the hidden data block above it first if anything needs correcting.');

  return lines.join('\n');
}
