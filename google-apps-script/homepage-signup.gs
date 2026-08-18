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
 *   GITHUB_TOKEN    — a GitHub PAT scoped to `repo` on patonhall/site
 *
 * Install onFormSubmit as an INSTALLABLE trigger (Triggers icon in the
 * left sidebar > + Add Trigger > function onFormSubmit > event source
 * "From spreadsheet" > event type "On form submit" > Save) — the default
 * simple trigger of the same name can't call UrlFetchApp at all.
 */

var REPO = 'patonhall/site';

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

  // { "Name": ["..."], "Email Address": ["..."], "Reason": ["List"|"Member"|"Founder"],
  //   "Interest": ["..."] } — keys must exactly match the Form's question
  //   titles ("Reason" is this Form's actual title for what the rest of
  //   this pipeline calls "Tier" — the site's own copy and the other two
  //   Forms still say Tier), and Reason's answer must exactly match one of
  //   its multiple-choice option strings (List/Member/Founder, not the
  //   friendly button labels). A title mismatch makes firstValue_ silently
  //   return '' below.
  var values = e.namedValues;
  var name = firstValue_(values, 'Name');
  var email = firstValue_(values, 'Email Address');
  var tier = firstValue_(values, 'Reason');
  var interest = firstValue_(values, 'Interest');

  if (!email) {
    throw new Error('No email captured from this submission — check that the '
      + 'Form\'s "Email Address" question title matches exactly (namedValues '
      + 'keys are case- and text-sensitive).');
  }

  var tag = TIER_TAGS[tier];
  if (!tag) {
    throw new Error('Unrecognized Tier value: "' + tier + '"');
  }
  Logger.log('onFormSubmit: %s <%s> tier=%s', name, email, tier);

  /* Issue first, Kit second. Kit tagging used to run before this and threw
     on a missing tag or an unset KIT_API_KEY, which silently destroyed the
     whole signup rather than merely failing to tag someone. The tier guards
     above stay first because an unrecognised tier has no label to apply. */
  var title = '[Signup] ' + tier + ' — ' + name;
  var body = buildIssueBody_(name, email, tier, interest);
  var labels = ['type:signup', TIER_LABELS[tier]];
  var issue = openGithubIssue_(title, body, labels, githubToken);
  Logger.log('opened issue #%s', issue.number);

  tagQuietly_(email, name, tag, kitApiKey);
}

/* Kit problems are logged, never thrown: by the time this runs the signup
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

  Logger.log('=== Paton Hall homepage signup self-test ===');

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

  /* 3. All three tier tags must exist — a signup at any tier hits one of
        them, so a single missing tag breaks one third of submissions. */
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
      Object.keys(TIER_TAGS).forEach(function (tier) {
        var tag = TIER_TAGS[tier];
        var found = findKitTag_(tag, kitApiKey);
        Logger.log('   tier ' + tier + ' -> tag "' + tag + '" '
          + (found ? 'exists' : 'MISSING'));
        if (!found) problems.push('Kit has no tag named "' + tag + '" (tier '
          + tier + ') — create it.');
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

  /* No repo data read here: unlike booking/training there is no members
     data type, so this script never fetches events.json or courses.json. */

  Logger.log('');
  if (problems.length === 0) {
    Logger.log('RESULT: all checks passed.');
  } else {
    Logger.log('RESULT: ' + problems.length + ' problem(s) found:');
    problems.forEach(function (p, i) { Logger.log('  ' + (i + 1) + '. ' + p); });
  }
  return problems;
}

/* --- shared helpers (duplicated from booking-request.gs/training-request.gs
   — three separate Apps Script projects, no practical way to share code
   between them without a published Library) ---------------------------- */

function firstValue_(namedValues, key) {
  return (namedValues[key] && namedValues[key][0]) || '';
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
