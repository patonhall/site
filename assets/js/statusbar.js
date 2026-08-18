/* Fills in the persistent bottom bar (present on every page via
   src/_shell.html) with today's date and the next scheduled event, both
   computed from the browser's clock and assets/data/events.json at load
   time — never baked at build time, and never fabricated on failure. The
   bar's href to calendar.html is static markup and needs no JS. */
(function () {
  'use strict';

  var DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  var MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
                      'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

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

  function spaceText(id) {
    return window.PatonSpaceText ? window.PatonSpaceText(id) : id;
  }

  function renderDate(el) {
    var now = new Date();
    el.textContent = DAY_NAMES[now.getDay()] + ' ' + MONTH_NAMES[now.getMonth()] + ' '
      + ordinal(now.getDate()) + ' ' + now.getFullYear() + ' ';
    var sun = document.createElement('span');
    sun.setAttribute('aria-hidden', 'true');
    sun.textContent = '☀';
    el.appendChild(sun);
  }

  function nextEvent(events, now) {
    var upcoming = events.filter(function (event) {
      return new Date(event.end) >= now;
    });
    upcoming.sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
    return upcoming[0] || null;
  }

  function renderEvent(el, event) {
    el.innerHTML = '';
    var dot = document.createElement('span');
    dot.className = 'statusbar__dot';
    dot.setAttribute('aria-hidden', 'true');
    el.appendChild(dot);

    var text = document.createElement('span');
    text.className = 'statusbar__event-text';
    text.textContent = event
      ? timeRange(event) + ' — ' + event.title + ' @ ' + spaceText(event.location)
      : 'Nothing scheduled';
    el.appendChild(text);
  }

  function init() {
    var bar = document.querySelector('.statusbar');
    if (!bar) return;
    var eventEl = bar.querySelector('.statusbar__event');
    var dateEl = bar.querySelector('.statusbar__date');
    if (dateEl) renderDate(dateEl);
    if (!eventEl) return;

    fetch('assets/data/events.json')
      .then(function (response) {
        if (!response.ok) throw new Error('bad response');
        return response.json();
      })
      .then(function (events) {
        renderEvent(eventEl, nextEvent(events, new Date()));
      })
      .catch(function () {
        eventEl.innerHTML = '';
        var text = document.createElement('span');
        text.className = 'statusbar__event-text';
        text.textContent = 'Schedule unavailable';
        eventEl.appendChild(text);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
