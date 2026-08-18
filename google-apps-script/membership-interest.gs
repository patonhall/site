/**
 * Paton Hall — Membership page interest processor.
 *
 * Bound to the membership-interest Sheet. Kept here for version control;
 * paste it into that Sheet's Apps Script editor (Extensions > Apps Script)
 * to deploy — this file is not executed by anything in this repo.
 *
 * Deliberately the simplest of the four signup/request pipelines: just
 * Name and Email, no tier, no category, no data-block written to the repo.
 * Fires on form submit: upserts the subscriber in Kit (double opt-in, tagged
 * "membership-interest"), then opens a GitHub Issue as pure notification for
 * an admin to follow up on. The admin closes it by hand once they've
 * followed up — same convention as homepage-signup.gs.
 *
 * Design: docs/superpowers/specs/2026-08-18-patonhall-membership-signup-design.md
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
 */

var REPO = 'patonhall/site';
/* Kit Form 9788991 ("Join the Newsletter") is configured for double
   opt-in — adding a subscriber to it is what makes Kit send its
   confirmation ("Incentive") email. See kitUpsertAndTag_. */
var DOUBLE_OPTIN_FORM_ID = 9788991;
var KIT_TAG_INTEREST = 'membership-interest';

function onFormSubmit(e) {
  var props = PropertiesService.getScriptProperties();
  var kitApiKey = props.getProperty('KIT_API_KEY');
  var githubToken = props.getProperty('GITHUB_TOKEN');

  // { "Name": ["..."], "Email Address": ["..."], "tier": ["..."] } — keys
  // must exactly match the Form's question titles. Note lowercase "tier",
  // not "Tier" — that's the Form's actual title. A title mismatch makes
  // firstValue_ silently return '' below. tier comes from a hidden field
  // the site sets when a visitor clicks one of the per-tier "LINK"s
  // (Bench/Shop/Keyholder/Patron/Champion) — it's free text here, not a
  // fixed set the way homepage-signup.gs's Reason is, so nothing throws
  // if it's blank (e.g. a no-JS submission from the plain form).
  var values = e.namedValues;
  var name = firstValue_(values, 'Name');
  var email = firstValue_(values, 'Email Address');
  var tier = firstValue_(values, 'tier');

  if (!email) {
    throw new Error('No email captured from this submission — check that the '
      + 'Form\'s "Email Address" question title matches exactly (namedValues '
      + 'keys are case- and text-sensitive).');
  }
  Logger.log('onFormSubmit: %s <%s> tier=%s', name, email, tier || '(none)');

  /* Issue first, Kit second — same reasoning as the other three pipelines:
     a Kit misconfiguration must not silently destroy a lead an admin never
     gets to see. */
  var title = '[Membership Interest] ' + (tier ? tier + ' — ' : '') + (name || email);
  var body = buildIssueBody_(name, email, tier);
  var issue = openGithubIssue_(title, body, ['type:membership-interest'], githubToken);
  Logger.log('opened issue #%s', issue.number);

  tagQuietly_(email, name, KIT_TAG_INTEREST, kitApiKey);
}

/* Kit problems are logged, never thrown: by the time this runs the lead is
   already safely in front of an admin, and losing that to a tagging
   failure would be a far worse outcome than an untagged subscriber. */
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
 */
function runSelfTest() {
  var props = PropertiesService.getScriptProperties();
  var kitApiKey = props.getProperty('KIT_API_KEY');
  var githubToken = props.getProperty('GITHUB_TOKEN');
  var problems = [];

  Logger.log('=== Paton Hall membership-interest self-test ===');

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
      var found = findKitTag_(KIT_TAG_INTEREST, kitApiKey);
      Logger.log('   tag "' + KIT_TAG_INTEREST + '" ' + (found ? 'exists' : 'MISSING'));
      if (!found) problems.push('Kit has no tag named "' + KIT_TAG_INTEREST + '" — create it.');
    }
  }

  /* 4. The double opt-in Form confirmation emails depend on. Both API calls
        in kitUpsertAndTag_ pass muteHttpExceptions, so a bad Form ID would
        otherwise fail invisibly — nobody gets a confirmation email and
        nothing anywhere says why. */
  if (kitApiKey) {
    var formResponse = UrlFetchApp.fetch(
      'https://api.kit.com/v4/forms/' + DOUBLE_OPTIN_FORM_ID + '/subscribers?per_page=1',
      { headers: { 'X-Kit-Api-Key': kitApiKey }, muteHttpExceptions: true });
    Logger.log('4. Kit GET /v4/forms/' + DOUBLE_OPTIN_FORM_ID + '/subscribers -> HTTP '
      + formResponse.getResponseCode());
    if (formResponse.getResponseCode() !== 200) {
      problems.push('Cannot reach double opt-in Form ' + DOUBLE_OPTIN_FORM_ID + ' (HTTP '
        + formResponse.getResponseCode() + ') — confirmation emails will silently not '
        + 'send. Check DOUBLE_OPTIN_FORM_ID matches a real Form in Kit.');
    }
  }

  if (githubToken) {
    var repoResponse = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO, {
      headers: { Authorization: 'Bearer ' + githubToken, Accept: 'application/vnd.github+json' },
      muteHttpExceptions: true
    });
    Logger.log('5. GitHub GET /repos/' + REPO + ' -> HTTP ' + repoResponse.getResponseCode());
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

  Logger.log('');
  if (problems.length === 0) {
    Logger.log('RESULT: all checks passed.');
  } else {
    Logger.log('RESULT: ' + problems.length + ' problem(s) found:');
    problems.forEach(function (p, i) { Logger.log('  ' + (i + 1) + '. ' + p); });
  }
  return problems;
}

/* --- shared helpers (duplicated from the other three .gs files — four
   separate Apps Script projects, no practical way to share code between
   them without a published Library) --------------------------------- */

function firstValue_(namedValues, key) {
  return (namedValues[key] && namedValues[key][0]) || '';
}

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
  /* state:'inactive' + adding to the double opt-in form is what actually
     triggers Kit's confirmation email — POST /v4/subscribers alone defaults
     a new subscriber to state:'active' (already confirmed, no email sent).
     Ignored for an existing subscriber: this endpoint does not update
     state on an upsert, per Kit's docs, so re-submission can't downgrade
     someone who already confirmed. */
  UrlFetchApp.fetch('https://api.kit.com/v4/subscribers', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Kit-Api-Key': apiKey },
    payload: JSON.stringify({ email_address: email, first_name: firstName, state: 'inactive' }),
    muteHttpExceptions: true
  });

  UrlFetchApp.fetch('https://api.kit.com/v4/forms/' + DOUBLE_OPTIN_FORM_ID + '/subscribers', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Kit-Api-Key': apiKey },
    payload: JSON.stringify({ email_address: email }),
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

function buildIssueBody_(name, email, tier) {
  var lines = [];
  lines.push('**Requester:** ' + (name || '(no name given)') + ' <' + email + '>');
  lines.push('**Tier of interest:** ' + (tier || '(not specified — used the plain form, not one of the tier LINKs)'));
  lines.push('');
  lines.push('Follow up to talk through what they\'re looking for, then close this issue.');
  return lines.join('\n');
}
