/* Minimal Markdown -> HTML, shared by every place on this site that renders
   authored prose: post.html today, and anything else that grows a body field.

   Deliberately NOT the Calendar. Event titles and descriptions stay plain
   text so they round-trip to and from Google Calendar without acquiring
   syntax that Google would show literally.

   Why hand-rolled rather than vendored: the only untrusted-ish input here is
   text an admin typed, but this file is served to every visitor, and a
   general-purpose parser is a large dependency with its own escaping story.
   The rule below is simple enough to audit in one sitting:

     ESCAPE EVERYTHING FIRST, then add markup.

   escapeHtml runs over the whole source before any rule matches, so no
   authored '<' can ever reach the DOM as a tag. Every rule after that point
   only inserts tags this file wrote itself. The one place a raw value is
   interpolated is a link href, and safeUrl restricts that to http, https and
   mailto -- which is what keeps `javascript:` out.

   Supported: headings, bold, italic, inline code, fenced code, links,
   bullet and numbered lists, blockquotes, horizontal rules, paragraphs.
   Unsupported markup degrades to the literal characters the author typed,
   which is the right failure: visible and obviously wrong, never silent. */
(function () {
  'use strict';

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Only these schemes. Anything else -- javascript:, data:, vbscript: --
     returns null and the link renders as plain text instead. */
  function safeUrl(value) {
    return /^(https?:\/\/|mailto:|\/|#)/i.test(value.trim()) ? value.trim() : null;
  }

  /* Inline rules. Runs on already-escaped text, so the only '<' present are
     ones produced here. Code spans are extracted first and restored last, so
     `**not bold**` inside backticks stays literal. */
  function inline(text) {
    var spans = [];
    text = text.replace(/`([^`]+)`/g, function (_, code) {
      spans.push(code);
      return '\u0000' + (spans.length - 1) + '\u0000';
    });

    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (whole, label, url) {
      // The url arrives HTML-escaped; &amp; must go back to & to be a valid href.
      var href = safeUrl(url.replace(/&amp;/g, '&'));
      if (!href) return whole;
      var external = /^https?:\/\//i.test(href);
      return '<a href="' + escapeHtml(href) + '"'
        + (external ? ' rel="noopener" target="_blank"' : '') + '>' + label + '</a>';
    });

    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s.,;:!?)])/g, '$1<em>$2</em>');

    return text.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return '<code>' + spans[Number(i)] + '</code>';
    });
  }

  function toHtml(source) {
    if (!source) return '';

    var lines = escapeHtml(source).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var paragraph = [];
    var list = null;         /* 'ul' | 'ol' | null */
    var quote = [];
    var fence = null;        /* collected code lines while inside ``` */

    function flushParagraph() {
      if (!paragraph.length) return;
      out.push('<p>' + inline(paragraph.join(' ')) + '</p>');
      paragraph = [];
    }

    function flushList() {
      if (!list) return;
      out.push('</' + list + '>');
      list = null;
    }

    function flushQuote() {
      if (!quote.length) return;
      out.push('<blockquote>' + inline(quote.join(' ')) + '</blockquote>');
      quote = [];
    }

    function flushAll() {
      flushParagraph();
      flushList();
      flushQuote();
    }

    lines.forEach(function (line) {
      /* Fenced code. Everything inside is emitted verbatim (already escaped)
         with no inline processing at all. */
      if (/^\s*```/.test(line)) {
        if (fence === null) {
          flushAll();
          fence = [];
        } else {
          out.push('<pre><code>' + fence.join('\n') + '</code></pre>');
          fence = null;
        }
        return;
      }
      if (fence !== null) {
        fence.push(line);
        return;
      }

      if (!line.trim()) {
        flushAll();
        return;
      }

      var heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushAll();
        var level = heading[1].length;
        out.push('<h' + level + '>' + inline(heading[2].trim()) + '</h' + level + '>');
        return;
      }

      if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
        flushAll();
        out.push('<hr>');
        return;
      }

      var bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      if (bullet) {
        flushParagraph();
        flushQuote();
        if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; }
        out.push('<li>' + inline(bullet[1]) + '</li>');
        return;
      }

      var numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (numbered) {
        flushParagraph();
        flushQuote();
        if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; }
        out.push('<li>' + inline(numbered[1]) + '</li>');
        return;
      }

      /* '&gt;', not '>': escapeHtml has already run over the whole source
         by this point, so the raw character is never present here. */
      var quoted = line.match(/^\s*&gt;\s?(.*)$/);
      if (quoted) {
        flushParagraph();
        flushList();
        quote.push(quoted[1]);
        return;
      }

      flushList();
      flushQuote();
      paragraph.push(line.trim());
    });

    /* An unterminated fence is an authoring mistake, not a reason to drop
       the text on the floor -- emit what was collected. */
    if (fence !== null) out.push('<pre><code>' + fence.join('\n') + '</code></pre>');
    flushAll();

    return out.join('\n');
  }

  window.PatonMarkdown = { toHtml: toHtml, escapeHtml: escapeHtml };
})();
