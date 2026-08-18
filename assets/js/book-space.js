/* Handles book-space.html: populates the Space dropdown from spaces.js,
   submits the request to the Book Space Google Form in the background, and
   optionally shows a live same-space availability check via the Apps
   Script Web App (once deployed — see the design spec).

   The native <form action> still points at the Google Form directly, so a
   visitor with JS disabled can still submit — Name/Email/Space/Purpose are
   real named fields and go through; Start/End date & time have no native
   `name` (Google's date/time questions need year/month/day and hour/minute
   submitted as separate sub-fields, which only this script's JS can build)
   so a no-JS submission simply omits them rather than sending something
   malformed. JS-enabled submission fills in every field correctly. */
(function () {
  'use strict';

  /* Fill in after deploying the booking Apps Script's Web App (doGet) —
     until then this stays inert and the availability check is silently
     skipped, never blocking submission. */
  var LIVE_CHECK_URL = '';

  function byId(id) { return document.getElementById(id); }

  function populateSpaces() {
    var select = byId('bs-space');
    window.PATON_SPACES.forEach(function (space) {
      var option = document.createElement('option');
      option.value = space.id;
      option.textContent = window.PatonSpaceText(space.id);
      select.appendChild(option);
    });
  }

  function splitDate(value) {
    var parts = value.split('-');
    return { year: parts[0], month: parts[1], day: parts[2] };
  }

  function splitTime(value) {
    var parts = value.split(':');
    return { hour: parts[0], minute: parts[1] };
  }

  function buildFormData() {
    var fd = new FormData();
    fd.append('entry.1317811418', byId('bs-name').value);
    fd.append('entry.823169727', byId('bs-email').value);
    fd.append('entry.187152365', byId('bs-space').value);

    var sd = splitDate(byId('bs-start-date').value);
    fd.append('entry.1379081936_year', sd.year);
    fd.append('entry.1379081936_month', sd.month);
    fd.append('entry.1379081936_day', sd.day);

    var st = splitTime(byId('bs-start-time').value);
    fd.append('entry.1588425497_hour', st.hour);
    fd.append('entry.1588425497_minute', st.minute);

    var ed = splitDate(byId('bs-end-date').value);
    fd.append('entry.538228151_year', ed.year);
    fd.append('entry.538228151_month', ed.month);
    fd.append('entry.538228151_day', ed.day);

    var et = splitTime(byId('bs-end-time').value);
    fd.append('entry.1902716208_hour', et.hour);
    fd.append('entry.1902716208_minute', et.minute);

    fd.append('entry.673408033', byId('bs-purpose').value);
    return fd;
  }

  function setStatus(message, kind) {
    var status = byId('bs-status');
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setStatus('Submitting…', '');

    var form = byId('book-space-form');
    fetch(form.action, { method: 'POST', mode: 'no-cors', body: buildFormData() })
      .then(function () {
        /* no-cors gives back an opaque response — this only confirms the
           request was sent, not that Google accepted it. That's an
           inherent limit of the technique; the real confirmation is the
           admin's review, not this message. */
        setStatus('Request submitted — we’ll follow up by email once it’s reviewed.', 'success');
        form.reset();
        byId('bs-availability').textContent = '';
      })
      .catch(function () {
        setStatus('Could not submit automatically. Check your connection and try again.', 'error');
      });
  }

  function checkAvailability() {
    if (!LIVE_CHECK_URL) return;

    var space = byId('bs-space').value;
    var startDate = byId('bs-start-date').value;
    var startTime = byId('bs-start-time').value;
    var endDate = byId('bs-end-date').value;
    var endTime = byId('bs-end-time').value;
    if (!space || !startDate || !startTime || !endDate || !endTime) return;

    var url = LIVE_CHECK_URL + '?space=' + encodeURIComponent(space)
      + '&start=' + encodeURIComponent(startDate + 'T' + startTime)
      + '&end=' + encodeURIComponent(endDate + 'T' + endTime);

    var el = byId('bs-availability');
    fetch(url).then(function (r) { return r.json(); }).then(function (result) {
      if (result.available) {
        el.textContent = 'This space looks available at that time.';
        el.className = 'form-status is-success';
      } else {
        el.textContent = 'Heads up: this space already has something scheduled '
          + 'then. You can still submit — an admin will follow up.';
        el.className = 'form-status is-error';
      }
    }).catch(function () {
      /* Live check unavailable (not deployed yet, or offline) — a
         courtesy, not a requirement. Say nothing rather than show a
         confusing error for something that isn't the visitor's problem. */
      el.textContent = '';
    });
  }

  function init() {
    populateSpaces();
    byId('book-space-form').addEventListener('submit', onSubmit);
    ['bs-space', 'bs-start-date', 'bs-start-time', 'bs-end-date', 'bs-end-time']
      .forEach(function (id) {
        byId(id).addEventListener('change', checkAvailability);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
