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

  // { "Name": ["..."], "Email": ["..."], "Tier": ["List"|"Member"|"Founder"],
  //   "Interest": ["..."] } — keys must exactly match the Form's question
  //   titles, and Tier's answer must exactly match one of its multiple-
  //   choice option strings (List/Member/Founder, not the friendly button
  //   labels). A title mismatch makes firstValue_ silently return '' below.
  var values = e.namedValues;
  var name = firstValue_(values, 'Name');
  var email = firstValue_(values, 'Email');
  var tier = firstValue_(values, 'Tier');
  var interest = firstValue_(values, 'Interest');

  if (!email) {
    throw new Error('No email captured from this submission — check that the '
      + 'Form\'s "Email" question title matches exactly (namedValues keys '
      + 'are case- and text-sensitive).');
  }

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
