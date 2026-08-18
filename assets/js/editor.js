/* Markdown authoring for any textarea that opts in with data-editor.

   Attaches a formatting bar, a live preview and a full-screen mode. Used by
   the Updates post body and the Training course description, which is why it
   lives here rather than inside either page's own script: the two forms have
   nothing else in common, and the second one existing is exactly when a
   copy-paste would have started.

   The markup is built here rather than shipped in the HTML because none of it
   works without JS -- with scripting off each page keeps a plain textarea,
   which still accepts Markdown perfectly well. The toolbar only ever inserts
   characters a writer could have typed; there is no rich-text model and no
   hidden state, so the saved value is exactly what is in the box. */
(function () {
  'use strict';

  /* Each rule either wraps the selection (prefix/suffix) or prefixes every
     selected line. `placeholder` is inserted and left selected when nothing
     was highlighted, so a press on an empty cursor still leaves something
     obvious to type over. */
  var RULES = {
    bold:    { prefix: '**', suffix: '**', placeholder: 'bold text' },
    italic:  { prefix: '*',  suffix: '*',  placeholder: 'italic text' },
    code:    { prefix: '`',  suffix: '`',  placeholder: 'code' },
    heading: { linePrefix: '## ', placeholder: 'Heading' },
    bullet:  { linePrefix: '- ',  placeholder: 'List item' },
    quote:   { linePrefix: '> ',  placeholder: 'Quoted text' },
    number:  { numbered: true,    placeholder: 'List item' },
    link:    { link: true,        placeholder: 'link text' }
  };

  var BUTTONS = [
    ['bold', '<strong>B</strong>', 'Bold (Ctrl+B)'],
    ['italic', '<em>I</em>', 'Italic (Ctrl+I)'],
    ['heading', 'H2', 'Heading'],
    ['link', 'Link', 'Link (Ctrl+K)'],
    ['bullet', '&bull; List', 'Bullet list'],
    ['number', '1. List', 'Numbered list'],
    ['quote', '&ldquo;', 'Blockquote'],
    ['code', '&lt;/&gt;', 'Code']
  ];

  function make(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function attach(area) {
    var group = make('div', 'editor__group');
    var bar = make('div', 'editor__bar');
    var pane = make('div', 'editor__pane');
    var preview = make('div', 'editor__preview post-body');

    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Formatting');
    preview.hidden = true;

    area.parentNode.insertBefore(group, area);
    group.appendChild(bar);
    group.appendChild(pane);
    pane.appendChild(area);
    pane.appendChild(preview);

    BUTTONS.forEach(function (spec) {
      var button = make('button', 'editor__btn');
      button.type = 'button';
      button.innerHTML = spec[1];       /* fixed literals above, never input */
      button.title = spec[2];
      button.addEventListener('click', function () { apply(spec[0]); });
      bar.appendChild(button);
    });

    bar.appendChild(make('span', 'editor__bar-gap'));

    var previewButton = make('button', 'editor__btn');
    previewButton.type = 'button';
    previewButton.textContent = 'Preview';
    previewButton.setAttribute('aria-pressed', 'false');
    bar.appendChild(previewButton);

    var maxButton = make('button', 'editor__btn');
    maxButton.type = 'button';
    maxButton.textContent = 'Maximize';
    maxButton.title = 'Full screen (Esc to exit)';
    maxButton.setAttribute('aria-pressed', 'false');
    bar.appendChild(maxButton);

    function refresh() {
      if (preview.hidden || !window.PatonMarkdown) return;
      /* Safe: markdown.js escapes the whole source before inserting any tag
         of its own, so nothing here can arrive from the author as markup. */
      preview.innerHTML = window.PatonMarkdown.toHtml(area.value);
    }

    function apply(name) {
      var rule = RULES[name];
      if (!rule) return;

      var start = area.selectionStart;
      var end = area.selectionEnd;
      var selected = area.value.slice(start, end) || rule.placeholder;
      var replacement, selectFrom, selectTo;

      if (rule.link) {
        replacement = '[' + selected + '](https://)';
        selectFrom = selectTo = start + replacement.length - 1;
      } else if (rule.linePrefix || rule.numbered) {
        replacement = selected.split('\n').map(function (line, index) {
          return (rule.numbered ? (index + 1) + '. ' : rule.linePrefix) + line;
        }).join('\n');
        selectFrom = start;
        selectTo = start + replacement.length;
      } else {
        replacement = rule.prefix + selected + rule.suffix;
        selectFrom = start + rule.prefix.length;
        selectTo = selectFrom + selected.length;
      }

      /* setRangeText preserves the browser's native undo stack; assigning to
         .value wholesale would throw the writer's history away. */
      if (area.setRangeText) {
        area.setRangeText(replacement, start, end, 'end');
      } else {
        area.value = area.value.slice(0, start) + replacement + area.value.slice(end);
      }
      area.focus();
      area.setSelectionRange(selectFrom, selectTo);
      refresh();
    }

    function togglePreview() {
      var showing = preview.hidden;
      preview.hidden = !showing;
      pane.classList.toggle('is-split', showing);
      previewButton.setAttribute('aria-pressed', showing ? 'true' : 'false');
      previewButton.classList.toggle('is-current', showing);
      refresh();
    }

    /* A class on <body> rather than the Fullscreen API: this has to cover the
       site's own frame and rail, not the browser chrome, and Escape must
       always get back out without fighting the browser's own state. */
    function toggleMax(force) {
      var on = typeof force === 'boolean' ? force : !group.classList.contains('is-max');
      group.classList.toggle('is-max', on);
      document.body.classList.toggle('is-editor-max', on);
      maxButton.setAttribute('aria-pressed', on ? 'true' : 'false');
      maxButton.classList.toggle('is-current', on);
      maxButton.textContent = on ? 'Exit' : 'Maximize';
      if (on) area.focus();
    }

    previewButton.addEventListener('click', togglePreview);
    maxButton.addEventListener('click', function () { toggleMax(); });
    area.addEventListener('input', refresh);

    area.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && group.classList.contains('is-max')) {
        toggleMax(false);
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      var key = event.key.toLowerCase();
      if (key === 'b' || key === 'i' || key === 'k') {
        event.preventDefault();
        apply(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'link');
      }
    });
  }

  function init() {
    var areas = document.querySelectorAll('textarea[data-editor]');
    for (var i = 0; i < areas.length; i++) attach(areas[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
