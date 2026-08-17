import os
import tempfile
import unittest
from datetime import datetime

import admin_server


class GenerateUidTests(unittest.TestCase):
    def test_format(self):
        uid = admin_server.generate_uid(set())
        self.assertRegex(uid, r'^\d{8}T\d{6}-[0-9a-f]{4}$')

    def test_avoids_collision(self):
        now = datetime(2026, 8, 17, 14, 30, 22)
        first = admin_server.generate_uid(set(), now=now)
        second = admin_server.generate_uid({first}, now=now)
        self.assertNotEqual(first, second)


class ValidateEventTests(unittest.TestCase):
    def valid_payload(self):
        return {
            'title': 'Build Night',
            'location': 'C',
            'start': '2026-09-01T18:00',
            'end': '2026-09-01T21:00',
            'allDay': False,
            'description': 'Open bench time.',
        }

    def test_valid_payload_has_no_errors(self):
        self.assertEqual(admin_server.validate_event(self.valid_payload()), [])

    def test_missing_title(self):
        payload = self.valid_payload()
        payload['title'] = '   '
        self.assertIn('title is required', admin_server.validate_event(payload))

    def test_bad_location(self):
        payload = self.valid_payload()
        payload['location'] = 'Z'
        self.assertIn('location must be one of A-I', admin_server.validate_event(payload))

    def test_end_before_start(self):
        payload = self.valid_payload()
        payload['start'] = '2026-09-01T21:00'
        payload['end'] = '2026-09-01T18:00'
        self.assertIn('end must not be before start', admin_server.validate_event(payload))

    def test_bad_date_format(self):
        payload = self.valid_payload()
        payload['start'] = 'not-a-date'
        self.assertIn('start must be a valid ISO 8601 date/time',
                       admin_server.validate_event(payload))


class SaveLoadEventsTests(unittest.TestCase):
    def test_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'events.json')
            admin_server.save_events(path, [{'uid': 'x'}])
            self.assertEqual(admin_server.load_events(path), [{'uid': 'x'}])

    def test_load_missing_file_returns_empty_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'missing.json')
            self.assertEqual(admin_server.load_events(path), [])

    def test_save_is_atomic_no_leftover_tmp_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'events.json')
            admin_server.save_events(path, [])
            leftovers = [f for f in os.listdir(tmp) if f != 'events.json']
            self.assertEqual(leftovers, [])


if __name__ == '__main__':
    unittest.main()
