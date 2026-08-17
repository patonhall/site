/* Handles admin-events.html: populates the Location dropdown from the
   shared space list, toggles the time inputs for all-day events, and
   submits new events to admin_server.py's write endpoint. Never reports
   success it didn't get — a failed or unreachable request shows the real
   error, not a fake confirmation. */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function populateLocations() {
    var select = byId('admin-location');
    window.PATON_SPACES.forEach(function (space) {
      var option = document.createElement('option');
      option.value = space.id;
      option.textContent = window.PatonSpaceText(space.id);
      select.appendChild(option);
    });
  }

  function toggleAllDay() {
    var allDay = byId('admin-allday').checked;
    byId('admin-start-time-row').style.display = allDay ? 'none' : '';
    byId('admin-end-time-row').style.display = allDay ? 'none' : '';
    byId('admin-start-time').required = !allDay;
    byId('admin-end-time').required = !allDay;
  }

  function isoFrom(dateVal, timeVal) {
    return dateVal + 'T' + timeVal;
  }

  function buildPayload() {
    var allDay = byId('admin-allday').checked;
    var startDate = byId('admin-start-date').value;
    var endDate = byId('admin-end-date').value || startDate;
    var start, end;
    if (allDay) {
      start = isoFrom(startDate, '00:00');
      end = isoFrom(endDate, '23:59');
    } else {
      start = isoFrom(startDate, byId('admin-start-time').value);
      end = isoFrom(endDate, byId('admin-end-time').value);
    }
    return {
      title: byId('admin-title').value,
      location: byId('admin-location').value,
      allDay: allDay,
      start: start,
      end: end,
      description: byId('admin-description').value
    };
  }

  function setStatus(message, kind) {
    var status = byId('admin-status');
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setStatus('Saving…', '');

    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload())
    }).then(function (response) {
      return response.json().then(function (body) {
        return { ok: response.ok, body: body };
      });
    }).then(function (result) {
      if (result.ok) {
        setStatus('Saved: ' + result.body.title + ' (' + result.body.uid + ')', 'success');
        byId('admin-form').reset();
        toggleAllDay();
      } else {
        setStatus('Not saved: ' + result.body.error, 'error');
      }
    }).catch(function () {
      setStatus('Could not reach the local write server. Run "python3 admin_server.py" and try again.', 'error');
    });
  }

  function init() {
    populateLocations();
    toggleAllDay();
    byId('admin-allday').addEventListener('change', toggleAllDay);
    byId('admin-form').addEventListener('submit', onSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
