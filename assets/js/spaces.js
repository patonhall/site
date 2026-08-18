/* Shared A-I space list, matching the real zone names from the Book Space
   Google Form. Both admin-events.html and calendar.html read this same
   list, so renaming a zone later is a one-file edit. */
window.PATON_SPACES = [
  { id: 'A', label: 'Blackboard' },
  { id: 'B', label: 'Assembly Zone' },
  { id: 'C', label: 'Whiteboard' },
  { id: 'D', label: 'Assembly Zone' },
  { id: 'E', label: 'Pool Table' },
  { id: 'F', label: 'Work Table 1' },
  { id: 'G', label: 'Work Table 2' },
  { id: 'H', label: 'Loading Area' },
  { id: 'I', label: 'Special Request' }
];

/* "A" alone until a label exists, then "A — <label>". */
window.PatonSpaceText = function (id) {
  var space = window.PATON_SPACES.filter(function (s) { return s.id === id; })[0];
  if (!space) return id;
  return space.label ? space.id + ' — ' + space.label : space.id;
};
