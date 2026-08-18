/* Handles admin-posts.html: builds the payload and submits new posts to
   admin_server.py's write endpoint. Never reports success it didn't get.

   The Markdown toolbar, preview and full-screen mode are not here -- they
   are assets/js/editor.js, attached to any textarea carrying data-editor, so
   the course description form gets the identical writing surface. */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  /* --- saving ------------------------------------------------------------ */

  function buildPayload() {
    var topics = byId('post-topics').value
      .split(',')
      .map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length > 0; });
    return {
      title: byId('post-title').value,
      date: byId('post-date').value,
      author: byId('post-author').value,
      topics: topics,
      body: byId('post-body').value
    };
  }

  function setStatus(message, kind) {
    var status = byId('post-status');
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setStatus('Saving…', '');

    fetch('/api/posts', {
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
        byId('post-form').reset();
      } else {
        setStatus('Not saved: ' + result.body.error, 'error');
      }
    }).catch(function () {
      setStatus('Could not reach the local write server. Run "python3 admin_server.py" and try again.', 'error');
    });
  }

  /* --- wiring ------------------------------------------------------------ */

  function init() {
    var form = byId('post-form');
    if (!form) return;
    form.addEventListener('submit', onSubmit);

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
