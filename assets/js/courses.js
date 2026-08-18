/* Renders Training's live course list + category filter from
   assets/data/courses.json and assets/data/course-categories.json.
   Past courses (endDate before today) are excluded — a "what's coming up"
   list that includes finished courses would misrepresent the schedule.
   Never shows stale or fabricated data: a fetch failure or disabled JS
   shows a plain "unavailable" message instead. */
(function () {
  'use strict';

  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
                      'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var allCourses = [];
  var activeCategory = '';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function parseDateOnly(value) {
    var parts = value.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function formatDate(date) {
    return MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
  }

  function formatDateRange(course) {
    var start = parseDateOnly(course.startDate);
    var end = parseDateOnly(course.endDate);
    if (course.startDate === course.endDate) {
      return formatDate(start);
    }
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      return MONTH_NAMES[start.getMonth()] + ' ' + start.getDate() + '–' + end.getDate()
        + ', ' + start.getFullYear();
    }
    return formatDate(start) + ' – ' + formatDate(end);
  }

  function indicatorFor(course) {
    if (course.registrationMode === 'capacity' &&
        typeof course.seatsTotal === 'number' && typeof course.seatsFilled === 'number') {
      if (course.seatsFilled >= course.seatsTotal) {
        return '🔴 Closed ' + course.seatsFilled + '/' + course.seatsTotal;
      }
      return '🟢 Open ' + course.seatsFilled + '/' + course.seatsTotal;
    }
    // Door mode, or any malformed/unexpected data (e.g. a hand-edited
    // courses.json with a typo'd registrationMode or missing seat counts),
    // falls through to this neutral text rather than ever rendering a
    // fabricated-looking "undefined/undefined" count.
    return '🚪 Register at Door';
  }

  function renderTable() {
    var tbody = document.getElementById('courses-tbody');
    tbody.innerHTML = '';

    var visible = activeCategory
      ? allCourses.filter(function (c) { return c.category === activeCategory; })
      : allCourses;

    if (!visible.length) {
      var row = document.createElement('tr');
      var cell = el('td', '', 'No courses' + (activeCategory ? ' in this category.' : ' scheduled yet.'));
      cell.colSpan = 4;
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    visible.forEach(function (course) {
      var tr = document.createElement('tr');
      var titleCell = el('td', '', null);

      /* A course with a description gets an expander rather than the prose
         inline: descriptions run to paragraphs and lists, and dropping that
         into a four-column row destroys the table's rhythm for every other
         course. Courses without one look exactly as they always did. */
      if (course.description && window.PatonMarkdown) {
        var toggle = el('button', 'courses__toggle', course.title);
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'false');
        titleCell.appendChild(toggle);
        tr.appendChild(titleCell);
        tr.appendChild(el('td', '', formatDateRange(course)));
        tr.appendChild(el('td', '', course.cost));
        tr.appendChild(el('td', '', indicatorFor(course)));
        tbody.appendChild(tr);

        var detail = document.createElement('tr');
        detail.className = 'courses__detail';
        detail.hidden = true;
        var cell = el('td', 'post-body', null);
        cell.colSpan = 4;
        /* Safe: markdown.js escapes the entire source before adding any tag
           of its own. Same renderer, same guarantee, as a post body. */
        cell.innerHTML = window.PatonMarkdown.toHtml(course.description);
        detail.appendChild(cell);
        tbody.appendChild(detail);

        toggle.addEventListener('click', function () {
          var open = detail.hidden;
          detail.hidden = !open;
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          toggle.classList.toggle('is-open', open);
        });
        return;
      }

      titleCell.textContent = course.title;
      tr.appendChild(titleCell);
      tr.appendChild(el('td', '', formatDateRange(course)));
      tr.appendChild(el('td', '', course.cost));
      tr.appendChild(el('td', '', indicatorFor(course)));
      tbody.appendChild(tr);
    });
  }

  function renderFilters(categories) {
    var list = document.getElementById('course-filters');
    categories.forEach(function (name) {
      var li = document.createElement('li');
      var link = el('a', '', name);
      link.href = '#';
      link.setAttribute('data-category', name);
      li.appendChild(link);
      list.appendChild(li);
    });

    list.addEventListener('click', function (evt) {
      var link = evt.target.closest('a');
      if (!link) return;
      evt.preventDefault();
      activeCategory = link.getAttribute('data-category');
      list.querySelectorAll('a').forEach(function (a) {
        a.classList.toggle('is-current', a === link);
      });
      renderTable();
    });
  }

  function showUnavailable() {
    var tbody = document.getElementById('courses-tbody');
    tbody.innerHTML = '';
    var row = document.createElement('tr');
    var cell = el('td', '', 'Course list unavailable.');
    cell.colSpan = 4;
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  function init() {
    var tbody = document.getElementById('courses-tbody');
    var filters = document.getElementById('course-filters');
    if (!tbody || !filters) return;

    Promise.all([
      fetch('assets/data/courses.json').then(function (r) {
        if (!r.ok) throw new Error('bad response');
        return r.json();
      }),
      fetch('assets/data/course-categories.json').then(function (r) {
        if (!r.ok) throw new Error('bad response');
        return r.json();
      })
    ]).then(function (results) {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      allCourses = results[0]
        .filter(function (c) { return parseDateOnly(c.endDate) >= today; })
        .sort(function (a, b) { return parseDateOnly(a.startDate) - parseDateOnly(b.startDate); });
      renderFilters(results[1]);
      renderTable();
    }).catch(function () {
      showUnavailable();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
