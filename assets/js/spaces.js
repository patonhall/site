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

/* The Book Space Google Form's own option strings ("A - Blackboard") — a
   PLAIN HYPHEN, not PatonSpaceText's em dash, and the label spelled exactly
   as the form spells it. That question is multiple-choice with no "Other"
   option, so Google validates the answer against its option list and rejects
   the entire response on a mismatch; because the page submits with
   mode:'no-cors' the rejection is invisible to the visitor. Editing a label
   above therefore means editing the Google Form's option to match, or
   bookings stop arriving with no error anywhere. PatonSpaceText is for
   display only and must never be submitted. */
window.PatonSpaceFormValue = function (id) {
  var space = window.PATON_SPACES.filter(function (s) { return s.id === id; })[0];
  if (!space || !space.label) return id;
  return space.id + ' - ' + space.label;
};

/* The inverse: "A - Blackboard" -> "A". The availability check and
   events.json both key on the bare id, so the form value is converted back
   here rather than the separator being re-spelled at each call site. */
window.PatonSpaceId = function (formValue) {
  return String(formValue).split(' - ')[0];
};
