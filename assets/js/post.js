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

  /* Post bodies are Markdown. assets/js/markdown.js escapes the whole
     source before it inserts any tag of its own, so the string handed to
     innerHTML here contains only markup that file wrote -- never anything
     the author could have injected. If it failed to load, fall back to the
     old plain-paragraph rendering rather than showing raw syntax. */
  function renderBody(container, text) {
    container.innerHTML = '';
    if (window.PatonMarkdown) {
      container.innerHTML = window.PatonMarkdown.toHtml(text);
      return;
    }
    text.split(/\n\s*\n/).forEach(function (para) {
      if (!para.trim()) return;
      var p = document.createElement('p');
      p.textContent = para.trim();
      container.appendChild(p);
    });
  }

  /* Ids come from the heading text so a copied link stays meaningful and
     stable across edits elsewhere in the post. Collisions get a numeric
     suffix -- two sections legitimately called "Notes" must not both answer
     to #notes, or the second one becomes unreachable. */
  function slugify(text, used) {
    var base = text.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
    var slug = base;
    var n = 2;
    while (used[slug]) { slug = base + '-' + n; n++; }
    used[slug] = true;
    return slug;
  }

  /* Every level the Markdown renderer can emit, h1 through h6. The post's
     own title is an <h2> outside .post-body, so nothing here competes with
     it and a body-level '# Heading' is the author's, not a duplicate. */
  function buildToc(body) {
    var nav = byId('post-toc');
    var list = byId('post-toc-list');
    if (!nav || !list) return;

    var headings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (!headings.length) return;      /* stays hidden; no empty rail */

    var used = {};
    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i];
      var text = heading.textContent.trim();
      if (!text) continue;
      if (!heading.id) heading.id = slugify(text, used);

      var item = document.createElement('li');
      item.className = 'toc__item toc__item--' + heading.tagName.toLowerCase();
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = text;
      item.appendChild(link);
      list.appendChild(item);
    }

    if (list.children.length) nav.hidden = false;
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
        buildToc(byId('post-body'));
      })
      .catch(showNotFound);
  }

  init();
})();
