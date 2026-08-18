/**
 * Paton Hall — Training sign-up request processor.
 *
 * Bound to the Training sign-up Sheet. Kept here for version control;
 * paste it into that Sheet's Apps Script editor (Extensions > Apps Script)
 * to deploy — this file is not executed by anything in this repo.
 *
 * Fires on form submit: updates Kit, checks the requested category
 * against the repo's live courses.json for an open upcoming offering, and
 * opens a GitHub Issue with the result (closed immediately if at least one
 * open offering exists).
 *
 * Design: docs/superpowers/specs/2026-08-18-patonhall-booking-training-requests-design.md
 *
 * Script Properties required (Project Settings (gear icon) > Script
 * Properties > Add script property):
 *   KIT_API_KEY     — Kit v4 API key
 *   GITHUB_TOKEN    — a GitHub PAT scoped to `repo` on patonhall/site
 *
 * Install onFormSubmit as an INSTALLABLE trigger (Triggers icon in the
 * left sidebar > + Add Trigger > function onFormSubmit > event source
 * "From spreadsheet" > event type "On form submit" > Save) — the default
 * simple trigger of the same name can't call UrlFetchApp at all.
 *
 * A training sign-up is interest in a *category*, not a request for one
 * specific dated course — the embedded request-data block ships with
 * empty title/startDate/endDate/cost placeholders. Fill those in directly
 * in the issue body before adding the `approved` label; the approval
 * Action rejects an incomplete block with the specific missing fields
 * rather than writing a broken course record.
 */

var REPO = 'patonhall/site';
var KIT_TAG_REQUEST = 'training-requested';
var KIT_TAG_REVIEWED = 'training-reviewed';

function onFormSubmit(e) {
  var props = PropertiesService.getScriptProperties();
  var kitApiKey = props.getProperty('KIT_API_KEY');
  var githubToken = props.getProperty('GITHUB_TOKEN');

  var values = e.namedValues;
  var name = firstValue_(values, 'Name');
  var email = firstValue_(values, 'Email');
  var course = firstValue_(values, 'Course');
  var notes = firstValue_(values, 'Note / Comments');

  Logger.log('onFormSubmit: %s <%s> course=%s', name, email, course);

  var courses = fetchRepoJson_('assets/data/courses.json');
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var matching = courses.filter(function (c) {
    return c.category === course && new Date(c.endDate) >= today;
  });
  var open = matching.filter(function (c) {
    return c.registrationMode === 'door'
      || (c.registrationMode === 'capacity' && c.seatsFilled < c.seatsTotal);
  });

  var body = buildIssueBody_(name, email, course, notes, matching, open);
  var requestData = {
    kind: 'training',
    title: '',
    category: course,
    startDate: '',
    endDate: '',
    cost: '',
    registrationMode: 'capacity',
    seatsTotal: null,
    seatsFilled: null
  };
  body += '\n\n<!-- request-data: ' + JSON.stringify(requestData) + ' -->';

  var hasOpen = open.length > 0;
  var title = (hasOpen ? '[Training] Open offering exists — ' : '[Training] No upcoming offering — ')
    + course;
  /* Issue first, Kit second. Kit tagging used to run before this and threw
     on a missing tag or an unset KIT_API_KEY, which silently destroyed the
     whole request rather than merely failing to tag someone. The issue is
     what an admin acts on; it must not be hostage to the mailing list. */
  var issue = openGithubIssue_(title, body, ['type:training'], githubToken);
  Logger.log('opened issue #%s (openOffering=%s)', issue.number, hasOpen);
  if (hasOpen) {
    closeGithubIssue_(issue.number, githubToken);
  }

  tagQuietly_(email, name, KIT_TAG_REQUEST, kitApiKey);
  tagQuietly_(email, name, KIT_TAG_REVIEWED, kitApiKey);
}

/* Kit problems are logged, never thrown: by the time this runs the request
   is already in front of an admin, and losing that to a tagging failure
   would be far worse than an untagged subscriber. */
function tagQuietly_(email, name, tagName, apiKey) {
  try {
    kitUpsertAndTag_(email, name, tagName, apiKey);
    Logger.log('kit: tagged %s with "%s"', email, tagName);
  } catch (err) {
    Logger.log('kit: FAILED to tag %s with "%s" — %s', email, tagName, err.message);
  }
}

/* --- diagnostics ------------------------------------------------------- */

/**
 * Read-only health check. Run this straight from the Apps Script editor
 * (select runSelfTest, press Run) and read the Execution log — it creates
 * nothing, tags nobody, and opens no issue.
 *
 * The booking pipeline failed for days behind an unset KIT_API_KEY and an
 * unset GITHUB_TOKEN, both invisible from outside. This turns "nothing
 * happened" into a specific line item before that can happen here.
 */
function runSelfTest() {
  var props = PropertiesService.getScriptProperties();
  var kitApiKey = props.getProperty('KIT_API_KEY');
  var githubToken = props.getProperty('GITHUB_TOKEN');
  var problems = [];

  Logger.log('=== Paton Hall training pipeline self-test ===');

  /* 1. A form-sourced trigger hands the handler an event with no
        namedValues, so onFormSubmit throws on its first line. */
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

  Logger.log('2. KIT_API_KEY  ' + (kitApiKey ? 'set' : 'MISSING'));
  Logger.log('   GITHUB_TOKEN ' + (githubToken ? 'set' : 'MISSING'));
  if (!kitApiKey) problems.push('KIT_API_KEY script property is not set.');
  if (!githubToken) problems.push('GITHUB_TOKEN script property is not set.');

  if (kitApiKey) {
    var tagsResponse = UrlFetchApp.fetch('https://api.kit.com/v4/tags?per_page=1', {
      headers: { 'X-Kit-Api-Key': kitApiKey },
      muteHttpExceptions: true
    });
    Logger.log('3. Kit GET /v4/tags -> HTTP ' + tagsResponse.getResponseCode());
    if (tagsResponse.getResponseCode() !== 200) {
      problems.push('Kit rejected the key (HTTP ' + tagsResponse.getResponseCode()
        + '): ' + tagsResponse.getContentText()
        + ' -- a 401 here usually means a v3 key is being used against the v4 API. '
        + 'Create a V4 key: Kit > Settings > Developer > V4 Keys > Add a new key.');
    } else {
      [KIT_TAG_REQUEST, KIT_TAG_REVIEWED].forEach(function (tag) {
        var found = findKitTag_(tag, kitApiKey);
        Logger.log('   tag "' + tag + '" ' + (found ? 'exists' : 'MISSING'));
        if (!found) problems.push('Kit has no tag named "' + tag + '" — create it.');
      });
    }
  }

  if (githubToken) {
    var repoResponse = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO, {
      headers: { Authorization: 'Bearer ' + githubToken, Accept: 'application/vnd.github+json' },
      muteHttpExceptions: true
    });
    Logger.log('4. GitHub GET /repos/' + REPO + ' -> HTTP ' + repoResponse.getResponseCode());
    if (repoResponse.getResponseCode() !== 200) {
      problems.push('GITHUB_TOKEN cannot read ' + REPO + ': ' + repoResponse.getContentText());
    } else {
      /* Advisory only: a fine-grained token scoped to Issues can open issues
         while still reporting push=false here. */
      var perms = JSON.parse(repoResponse.getContentText()).permissions || {};
      Logger.log('   repo permissions seen by this token: push=' + perms.push
        + ' pull=' + perms.pull);
      if (!perms.push) {
        Logger.log('   NOTE: push=false. If this is a classic PAT it needs the '
          + '`repo` scope. If it is fine-grained with Issues: read and write, '
          + 'this is expected and fine.');
      }
    }
  }

  /* 5. The course data the open-offering check reads. */
  var rawResponse = UrlFetchApp.fetch(
    'https://raw.githubusercontent.com/' + REPO + '/main/assets/data/courses.json',
    { muteHttpExceptions: true });
  Logger.log('5. raw courses.json -> HTTP ' + rawResponse.getResponseCode());
  if (rawResponse.getResponseCode() !== 200) {
    problems.push('Cannot read courses.json from the repo: HTTP '
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

/* --- shared helpers (duplicated from booking-request.gs — these are two
   separate Apps Script projects with no practical way to share code
   between them short of a published Library, which isn't worth the
   deployment overhead at this scale) --------------------------------- */

function firstValue_(namedValues, key) {
  return (namedValues[key] && namedValues[key][0]) || '';
}

function fetchRepoJson_(path) {
  var url = 'https://raw.githubusercontent.com/' + REPO + '/main/' + path;
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('could not read ' + path + ' from the repo (HTTP '
      + response.getResponseCode() + ') — cannot check for open offerings');
  }
  return JSON.parse(response.getContentText());
}

/* Pages through every tag instead of assuming the first page holds them all.
   Kit's v4 list endpoint is cursor-paginated (max 1000 per page, follow
   pagination.end_cursor via ?after=). The previous single request capped at
   a hundred per page silently missed any tag past the first hundred and
   surfaced it as a bogus "Kit has no tag named X". */
function findKitTag_(tagName, apiKey) {
  var wanted = tagName.toLowerCase();
  var url = 'https://api.kit.com/v4/tags?per_page=1000';

  while (url) {
    var response = UrlFetchApp.fetch(url, {
      headers: { 'X-Kit-Api-Key': apiKey },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('Kit rejected the tags request (HTTP '
        + response.getResponseCode() + '): ' + response.getContentText());
    }
    var payload = JSON.parse(response.getContentText());
    var match = (payload.tags || []).filter(function (t) {
      return t.name.toLowerCase() === wanted;
    })[0];
    if (match) return match;

    var page = payload.pagination || {};
    url = (page.has_next_page && page.end_cursor)
      ? 'https://api.kit.com/v4/tags?per_page=1000&after=' + encodeURIComponent(page.end_cursor)
      : null;
  }
  return null;
}

function kitUpsertAndTag_(email, firstName, tagName, apiKey) {
  UrlFetchApp.fetch('https://api.kit.com/v4/subscribers', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Kit-Api-Key': apiKey },
    payload: JSON.stringify({ email_address: email, first_name: firstName }),
    muteHttpExceptions: true
  });

  var match = findKitTag_(tagName, apiKey);
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

function buildIssueBody_(name, email, course, notes, matching, open) {
  var lines = [];
  lines.push('**Requester:** ' + name + ' <' + email + '>');
  lines.push('**Course category:** ' + course);
  lines.push('**Notes:** ' + (notes || '(none given)'));
  lines.push('');

  if (open.length) {
    lines.push('**Open upcoming offering(s):**');
    open.forEach(function (c) {
      lines.push('- ' + c.title + ': ' + c.startDate + ' – ' + c.endDate);
    });
  } else if (matching.length) {
    lines.push('Upcoming ' + course + ' offering(s) exist but are full:');
    matching.forEach(function (c) {
      lines.push('- ' + c.title + ': ' + c.startDate + ' – ' + c.endDate);
    });
  } else {
    lines.push('No upcoming ' + course + ' offering scheduled yet.');
  }
  lines.push('');
  lines.push('To turn this into a real course, fill in the hidden data block above '
    + '(title, startDate, endDate, cost, seat counts) and add the `approved` label.');

  return lines.join('\n');
}
