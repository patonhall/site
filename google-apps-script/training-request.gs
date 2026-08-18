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
 *   GITHUB_TOKEN    — a GitHub PAT scoped to `repo` on peers8862/patonhall-excalisite
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

var REPO = 'peers8862/patonhall-excalisite';
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

  kitUpsertAndTag_(email, name, KIT_TAG_REQUEST, kitApiKey);

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
  var issue = openGithubIssue_(title, body, ['type:training'], githubToken);

  if (hasOpen) {
    closeGithubIssue_(issue.number, githubToken);
  }
  kitUpsertAndTag_(email, name, KIT_TAG_REVIEWED, kitApiKey);
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
  return JSON.parse(response.getContentText());
}

function closeGithubIssue_(issueNumber, token) {
  UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/issues/' + issueNumber, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ state: 'closed' }),
    muteHttpExceptions: true
  });
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
