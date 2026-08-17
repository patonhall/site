/* Renders the Calendar's agenda + detail pane from assets/data/events.json.
   Computed from the browser's clock at every load — a build-time bake
   can't keep "today" current without a rebuild+deploy every single day.
   Never shows stale or fabricated data: a fetch failure or disabled JS
   shows a plain "unavailable" message instead. */
(function () {
  'use strict';

  var WINDOW_DAYS = 14;
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                      'August', 'September', 'October', 'November', 'December'];

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function dayKey(date) {
    return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
  }

  function dayHeading(date) {
    return DAY_NAMES[date.getDay()] + ' ' + MONTH_NAMES[date.getMonth()] + ' ' + date.getDate();
  }

  function ordinal(n) {
    var suffixes = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }

  function formatTime(date) {
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var period = hours >= 12 ? 'pm' : 'am';
    var h = hours % 12;
    if (h === 0) h = 12;
    var m = minutes < 10 ? '0' + minutes : String(minutes);
    return minutes === 0 ? h + period : h + ':' + m + period;
  }

  function timeRange(event) {
    if (event.allDay) return 'All day';
    return formatTime(new Date(event.start)) + '–' + formatTime(new Date(event.end));
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function spaceText(id) {
    return window.PatonSpaceText ? window.PatonSpaceText(id) : id;
  }

  function updateTodayHeading() {
    var heading = document.getElementById('cal-today');
    if (!heading) return;
    var today = new Date();
    var sun = heading.querySelector('span');
    heading.textContent = DAY_NAMES[today.getDay()] + ' ' + MONTH_NAMES[today.getMonth()]
      + ' ' + ordinal(today.getDate()) + ' ' + today.getFullYear() + ' ';
    if (sun) heading.appendChild(sun);
  }

  function renderDetail(container, event) {
    container.innerHTML = '';
    if (!event) {
      container.appendChild(el('p', 'cal__empty', 'Select an event to see its details.'));
      return;
    }

    container.appendChild(el('h2', 'cal__detail-title', event.title));
    container.appendChild(el('p', '', timeRange(event)));

    var location = el('p', '', null);
    var locationLabel = el('span', 'cal__label', 'Location: ');
    location.appendChild(locationLabel);
    location.appendChild(document.createTextNode(spaceText(event.location)));
    container.appendChild(location);

    if (event.description) {
      container.appendChild(el('p', '', null));
      container.lastChild.appendChild(el('span', 'cal__label', 'Description:'));
      container.appendChild(el('p', '', event.description));
    }
  }

  function renderAgenda(agendaEl, detailEl, days) {
    agendaEl.innerHTML = '';
    var hasAny = false;

    days.forEach(function (day) {
      if (!day.events.length) return;
      hasAny = true;

      agendaEl.appendChild(el('h2', 'cal__day', dayHeading(day.date)));
      var list = el('ul', 'cal__events', null);

      day.events.forEach(function (event) {
        var item = document.createElement('li');
        item.tabIndex = 0;
        item.textContent = timeRange(event) + ' — ' + event.title;
        item.addEventListener('click', function () { renderDetail(detailEl, event); });
        item.addEventListener('keydown', function (evt) {
          if (evt.key === 'Enter' || evt.key === ' ') renderDetail(detailEl, event);
        });
        list.appendChild(item);
      });

      agendaEl.appendChild(list);
    });

    if (!hasAny) {
      agendaEl.appendChild(el('p', 'cal__empty',
        'Nothing on the calendar for the next ' + WINDOW_DAYS + ' days.'));
    }
  }

  function bucketEvents(events, today) {
    var windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);

    var byDay = {};
    var days = [];
    for (var i = 0; i < WINDOW_DAYS; i++) {
      var date = new Date(today);
      date.setDate(date.getDate() + i);
      var key = dayKey(date);
      byDay[key] = { date: date, events: [] };
      days.push(byDay[key]);
    }

    events.forEach(function (event) {
      var start = new Date(event.start);
      if (start < today || start >= windowEnd) return;
      var bucket = byDay[dayKey(startOfDay(start))];
      if (bucket) bucket.events.push(event);
    });

    days.forEach(function (day) {
      day.events.sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
    });

    return days;
  }

  function init() {
    var agendaEl = document.getElementById('cal-agenda');
    var detailEl = document.getElementById('cal-detail');
    if (!agendaEl || !detailEl) return;

    updateTodayHeading();

    fetch('assets/data/events.json')
      .then(function (response) {
        if (!response.ok) throw new Error('bad response');
        return response.json();
      })
      .then(function (events) {
        var today = startOfDay(new Date());
        renderAgenda(agendaEl, detailEl, bucketEvents(events, today));
        renderDetail(detailEl, null);
      })
      .catch(function () {
        agendaEl.innerHTML = '';
        agendaEl.appendChild(el('p', 'cal__empty', 'Calendar unavailable.'));
        renderDetail(detailEl, null);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
