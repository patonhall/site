/* Renders Updates' live post list from assets/data/posts.json, grouped by
   date (newest first), each entry linking to post.html?uid=... for the
   full body. Never shows stale or fabricated data: a fetch failure or
   disabled JS shows a plain "unavailable" message instead. */
(function () {
  'use strict';

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                      'August', 'September', 'October', 'November', 'December'];

  function parseDateOnly(value) {
    var parts = value.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function dateHeading(date) {
    return DAY_NAMES[date.getDay()] + ' ' + MONTH_NAMES[date.getMonth()] + ' ' + date.getDate();
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

    if (!posts.length) {
      container.appendChild(el('p', 'cal__empty', 'No posts yet.'));
      return;
    }

    var sorted = posts.slice().sort(function (a, b) {
      return parseDateOnly(b.date) - parseDateOnly(a.date);
    });

    var currentKey = null;
    var list = null;

    sorted.forEach(function (post) {
      if (post.date !== currentKey) {
        currentKey = post.date;
        container.appendChild(el('h2', 'date-head', dateHeading(parseDateOnly(post.date))));
        list = el('ul', 'post-list', null);
        container.appendChild(list);
      }

      var item = document.createElement('li');
      var link = el('a', '', post.title);
      link.href = 'post.html?uid=' + encodeURIComponent(post.uid);
      item.appendChild(link);
      item.appendChild(el('span', 'footnote', ' — ' + post.author));
      if (post.topics && post.topics.length) {
        item.appendChild(renderTopics(post.topics));
      }
      list.appendChild(item);
    });
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
