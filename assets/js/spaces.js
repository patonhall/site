/* Shared A-I space list. Labels are blank until real one/two-word names are
   assigned; both admin-events.html and calendar.html read this same list,
   so adding names later is a one-file edit. */
window.PATON_SPACES = [
  { id: 'A', label: '' },
  { id: 'B', label: '' },
  { id: 'C', label: '' },
  { id: 'D', label: '' },
  { id: 'E', label: '' },
  { id: 'F', label: '' },
  { id: 'G', label: '' },
  { id: 'H', label: '' },
  { id: 'I', label: '' }
];

/* "A" alone until a label exists, then "A — <label>". */
window.PatonSpaceText = function (id) {
  var space = window.PATON_SPACES.filter(function (s) { return s.id === id; })[0];
  if (!space) return id;
  return space.label ? space.id + ' — ' + space.label : space.id;
};
