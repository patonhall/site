/* Renders the mailing list archive on the Updates page from
   assets/data/kit-posts.json, which scripts/fetch_kit_posts.py writes from
   patonhall.kit.com (see .github/workflows/kit-posts.yml).

   The browser deliberately does NOT fetch Kit directly. Kit serves its
   profile page with TWO `Access-Control-Allow-Origin: *` headers; curl
   accepts that, but the CORS spec allows exactly one and browsers reject
   the response outright, so a client-side fetch can never work. Fetching at
   build time also makes this a local file (~60ms rather than a cross-origin
   round trip) and moves any Kit breakage into a workflow run we can see.

   Never shows stale or fabricated data: if the file is missing or empty,
   the page falls back to a plain link to the archive rather than an error
   or a half-built list — the same convention calendar.js and posts.js use.
   A broken upstream should cost the visitor a nicer layout, never access to
   the posts. */
(function () {
  'use strict';

  var ARCHIVE_URL = 'https://patonhall.kit.com/';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];

  /* These strings originate at Kit and become href and src attributes.
     fetch_kit_posts.py applies the same guard when writing the file; it is
     repeated here so the page is safe whatever the file happens to hold. */
  function safeUrl(value) {
    if (typeof value !== 'string') return null;
    return /^https?:\/\//i.test(value) ? value : null;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function formatDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function renderPost(post) {
    var item = el('li', 'kit-post', null);

    var thumb = safeUrl(post.thumbnailUrl);
    if (thumb) {
      var img = document.createElement('img');
      img.className = 'kit-post__thumb';
      img.src = thumb;
      /* Empty alt is correct for a thumbnail whose meaning is already
         carried by the title beside it. */
      img.alt = post.thumbnailAlt || '';
      img.loading = 'lazy';
      item.appendChild(img);
    }

    var body = el('div', 'kit-post__body', null);

    var heading = el('h3', 'kit-post__title', null);
    var link = el('a', '', post.title);
    link.href = safeUrl(post.url) || ARCHIVE_URL;
    link.rel = 'noopener';
    link.target = '_blank';
    heading.appendChild(link);
    body.appendChild(heading);

    var date = formatDate(post.publishedAt);
    if (date) body.appendChild(el('p', 'footnote', date));

    var summary = post.metaDescription || post.introContent;
    if (summary) body.appendChild(el('p', 'kit-post__summary', summary));

    item.appendChild(body);
    return item;
  }

  function renderFallback(container) {
    container.innerHTML = '';
    var p = el('p', 'cal__empty', null);
    var link = el('a', '', 'Read the mailing list archive');
    link.href = ARCHIVE_URL;
    link.rel = 'noopener';
    link.target = '_blank';
    p.appendChild(link);
    container.appendChild(p);
  }

  function init() {
    var container = document.getElementById('kit-posts');
    if (!container) return;

    fetch('assets/data/kit-posts.json')
      .then(function (r) {
        if (!r.ok) throw new Error('bad response');
        return r.json();
      })
      .then(function (posts) {
        if (!Array.isArray(posts) || !posts.length) return renderFallback(container);

        container.innerHTML = '';
        var list = el('ul', 'kit-posts', null);
        posts.forEach(function (post) {
          if (post && post.title) list.appendChild(renderPost(post));
        });
        container.appendChild(list);
      })
      .catch(function () { renderFallback(container); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
