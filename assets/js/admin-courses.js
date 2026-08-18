/* Handles admin-courses.html: populates the Category dropdown from
   course-categories.json, toggles the seat-count fields for capacity-mode
   registration, and submits new courses to admin_server.py's write
   endpoint. Never reports success it didn't get. */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function populateCategories(categories) {
    var select = byId('course-category');
    categories.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }

  function toggleRegistrationMode() {
    var isCapacity = byId('course-registration-mode').value === 'capacity';
    byId('course-seats-total-row').style.display = isCapacity ? '' : 'none';
    byId('course-seats-filled-row').style.display = isCapacity ? '' : 'none';
  }

  function buildPayload() {
    var payload = {
      title: byId('course-title').value,
      category: byId('course-category').value,
      newCategory: byId('course-new-category').value,
      startDate: byId('course-start-date').value,
      endDate: byId('course-end-date').value,
      cost: byId('course-cost').value,
      registrationMode: byId('course-registration-mode').value,
      description: byId('course-description').value
    };
    if (payload.registrationMode === 'capacity') {
      payload.seatsTotal = parseInt(byId('course-seats-total').value, 10);
      payload.seatsFilled = parseInt(byId('course-seats-filled').value, 10);
    }
    return payload;
  }

  function setStatus(message, kind) {
    var status = byId('course-status');
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setStatus('Saving…', '');

    fetch('/api/courses', {
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
        byId('course-form').reset();
        toggleRegistrationMode();
      } else {
        setStatus('Not saved: ' + result.body.error, 'error');
      }
    }).catch(function () {
      setStatus('Could not reach the local write server. Run "python3 admin_server.py" and try again.', 'error');
    });
  }

  function init() {
    toggleRegistrationMode();
    byId('course-registration-mode').addEventListener('change', toggleRegistrationMode);
    byId('course-form').addEventListener('submit', onSubmit);

    fetch('assets/data/course-categories.json')
      .then(function (response) { return response.json(); })
      .then(populateCategories)
      .catch(function () {
        setStatus('Could not load categories — is admin_server.py running?', 'error');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
