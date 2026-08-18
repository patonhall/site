"""Guards the one place the A-I space list is deliberately duplicated.

book-space.html hardcodes the Space / Zone <option>s instead of building them
in JS, so a visitor with JavaScript disabled still has something to select and
the native form POST carries a space. That duplicates the list owned by
assets/js/spaces.js, and the two drifting apart fails silently in the worst
way: the page submits with mode='no-cors', so a value Google rejects looks
identical to a value it accepts, and bookings just stop arriving.

Each <option value> must be the Google Form's own option string (PLAIN hyphen
-- Google validates multiple-choice answers against its list) and each label
must be the site's display form (em dash).
"""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SPACE_ENTRY = re.compile(r"\{\s*id:\s*'([^']+)'\s*,\s*label:\s*'([^']*)'\s*\}")
OPTION = re.compile(r'<option value="([^"]*)"[^>]*>([^<]*)</option>')


def spaces_from_js():
    js = (ROOT / 'assets/js/spaces.js').read_text(encoding='utf-8')
    body = js.split('window.PATON_SPACES')[1].split('];')[0]
    return SPACE_ENTRY.findall(body)


def options_from_html():
    html = (ROOT / 'src/book-space.html').read_text(encoding='utf-8')
    select = html.split('id="bs-space"')[1].split('</select>')[0]
    # Skip the empty placeholder option; it is not a space.
    return [(v, t) for v, t in OPTION.findall(select) if v]


class BookSpaceOptionsTests(unittest.TestCase):
    def setUp(self):
        self.spaces = spaces_from_js()
        self.options = options_from_html()

    def test_space_list_parsed(self):
        self.assertEqual(len(self.spaces), 9, 'expected A-I in spaces.js')

    def test_same_number_of_options(self):
        self.assertEqual(len(self.options), len(self.spaces))

    def test_values_are_the_google_form_strings(self):
        """Plain hyphen, label spelled exactly as the Google Form spells it."""
        expected = ['%s - %s' % (i, label) for i, label in self.spaces]
        self.assertEqual([v for v, _ in self.options], expected)

    def test_labels_are_the_display_form(self):
        """Em dash -- what PatonSpaceText renders, never what gets submitted."""
        expected = ['%s — %s' % (i, label) for i, label in self.spaces]
        self.assertEqual([t for _, t in self.options], expected)

    def test_values_never_use_the_display_dash(self):
        for value, _ in self.options:
            self.assertNotIn('—', value,
                             'em dash in a submitted value; Google will reject it')

    def test_placeholder_forces_a_choice(self):
        select = (ROOT / 'src/book-space.html').read_text(encoding='utf-8')
        select = select.split('id="bs-space"')[1].split('</select>')[0]
        self.assertIn('value="" selected disabled', select)


if __name__ == '__main__':
    unittest.main()
