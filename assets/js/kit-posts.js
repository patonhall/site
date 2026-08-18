/* Renders the mailing list archive from patonhall.kit.com natively on the
   Updates page.

   Kit publishes no RSS feed and no public JSON for a creator profile, but it
   does serve the profile page with `access-control-allow-origin: *`, and that
   page embeds its own state as `window.__PROPS__` — including `recentPosts`
   with title, metaDescription, thumbnailUrl and url for each post. Reading it
   needs no API key and no server, so nothing here is proxied.

   That blob is Kit's INTERNAL page state, not a documented API: it can be
   renamed or reshaped by any Kit deploy, without notice. Every step below is
   therefore defensive, and any failure falls back to a plain link to the
   archive rather than an error or a half-rendered list — the same convention
   calendar.js and posts.js use. A broken upstream should cost the visitor a
   nicer layout, never the ability to reach the posts. */
(function () {
  'use strict';

  var ARCHIVE_URL = 'https://patonhall.kit.com/';
  var MARKER = 'window.__PROPS__ =';

  /* post.url and post.thumbnailUrl come from a third party we do not control.
     Assigning an attacker-controlled string to href or src would accept
     javascript: and data: URLs, so only http(s) is allowed through. */
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

  /* Brace-matches the object literal after the marker, respecting strings and
     escapes. A regex cannot do this: the blob contains braces inside post
     content, so any non-greedy match truncates and any greedy one overshoots. */
  function extractProps(html) {
    var i = html.indexOf(MARKER);
    if (i === -1) return null;
    var depth = 0, start = -1, inString = false, escaped = false;

    for (var j = i + MARKER.length; j < html.length; j++) {
      var c = html.charAt(j);
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '{') { if (depth === 0) start = j; depth++; }
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(html.slice(start, j + 1)); }
          catch (e) { return null; }
        }
      }
    }
    return null;
  }

  function postsFrom(props) {
    if (!props || !Array.isArray(props.recentPosts)) return null;
    return props.recentPosts.filter(function (p) {
      return p && p.title && safeUrl(p.url);
    });
  }

  function formatDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function renderPost(post) {
    var item = el('li', 'kit-post', null);

    var thumb = safeUrl(post.thumbnailUrl);
    if (thumb) {
      var img = document.createElement('img');
      img.className = 'kit-post__thumb';
      img.src = thumb;
      /* Decorative unless Kit gave real alt text; an empty alt is correct for
         a thumbnail whose meaning is already carried by the title beside it. */
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

    fetch(ARCHIVE_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('bad response');
        return r.text();
      })
      .then(function (html) {
        var posts = postsFrom(extractProps(html));
        if (!posts || !posts.length) return renderFallback(container);

        container.innerHTML = '';
        var list = el('ul', 'kit-posts', null);
        posts.forEach(function (post) { list.appendChild(renderPost(post)); });
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
