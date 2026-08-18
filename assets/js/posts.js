/* Renders Updates' live post list from assets/data/posts.json, grouped by
   date (newest first), each entry linking to post.html?uid=... for the
   full body. Never shows stale or fabricated data: a fetch failure or
   disabled JS shows a plain "unavailable" message instead. */
(function () {
  'use strict';

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                      'August', 'September', 'October', 'November', 'December'];

  function parseDateOnly(value) {
    var parts = value.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  /* Same shape kit-posts.js produces, so the two columns' dates match. */
  function formatDate(date) {
    return MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function renderTopics(topics) {
    var wrap = el('span', 'tags', null);
    topics.forEach(function (topic) {
      wrap.appendChild(el('span', 'tag', topic));
    });
    return wrap;
  }

  function render(container, posts) {
    container.innerHTML = '';

    /* Render nothing at all when there are no posts. This column sits beside
       the live Mailing List archive, so an empty-state message here read as
       though the whole page had nothing on it. The container stays wired, so
       member posts appear the moment posts.json has any. A fetch *failure*
       still reports itself below -- a different situation from having
       nothing yet. */
    if (!posts.length) return;

    var sorted = posts.slice().sort(function (a, b) {
      return parseDateOnly(b.date) - parseDateOnly(a.date);
    });

    /* No date grouping. Posts used to sit under a bold display-face heading
       per day, which made this column look nothing like the mailing list
       beside it. Each entry now carries its own date under its title, in the
       same markup kit-posts.js emits. */
    var list = el('ul', 'feed', null);

    sorted.forEach(function (post) {
      var item = el('li', 'feed__item', null);
      var body = el('div', 'feed__body', null);

      var heading = el('h3', 'feed__title', null);
      var link = el('a', '', post.title);
      link.href = 'post.html?uid=' + encodeURIComponent(post.uid);
      heading.appendChild(link);
      body.appendChild(heading);

      body.appendChild(el('p', 'feed__meta', formatDate(parseDateOnly(post.date))));

      var byline = el('p', 'feed__byline', post.author);
      if (post.topics && post.topics.length) {
        byline.appendChild(renderTopics(post.topics));
      }
      body.appendChild(byline);

      item.appendChild(body);
      list.appendChild(item);
    });

    container.appendChild(list);
  }

  function init() {
    var container = document.getElementById('posts-list');
    if (!container) return;

    fetch('assets/data/posts.json')
      .then(function (r) {
        if (!r.ok) throw new Error('bad response');
        return r.json();
      })
      .then(function (posts) {
        render(container, posts);
      })
      .catch(function () {
        container.innerHTML = '';
        container.appendChild(el('p', 'cal__empty', 'Updates unavailable.'));
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
