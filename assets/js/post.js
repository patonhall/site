/* Renders a single Updates post (identified by ?uid=) from
   assets/data/posts.json into the shared post-detail markup. Never shows
   stale or fabricated data: a missing post or fetch failure shows a plain
   "not found" state instead. */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function uidFromQuery() {
    var params = new URLSearchParams(window.location.search);
    return params.get('uid');
  }

  function renderBody(container, text) {
    container.innerHTML = '';
    text.split(/\n\s*\n/).forEach(function (para) {
      if (!para.trim()) return;
      var p = document.createElement('p');
      p.textContent = para.trim();
      container.appendChild(p);
    });
  }

  function showNotFound() {
    byId('post-title').textContent = 'Post not found';
    byId('post-date').textContent = '';
    byId('post-author').textContent = '';
    byId('post-body').innerHTML = '';
  }

  function init() {
    var uid = uidFromQuery();
    if (!uid) {
      showNotFound();
      return;
    }

    fetch('assets/data/posts.json')
      .then(function (r) {
        if (!r.ok) throw new Error('bad response');
        return r.json();
      })
      .then(function (posts) {
        var post = posts.filter(function (p) { return p.uid === uid; })[0];
        if (!post) {
          showNotFound();
          return;
        }
        byId('post-title').textContent = post.title;
        byId('post-date').textContent = post.date;
        byId('post-author').textContent = post.author;
        renderBody(byId('post-body'), post.body);
      })
      .catch(showNotFound);
  }

  init();
})();
