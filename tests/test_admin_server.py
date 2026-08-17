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


class SaveLoadItemsTests(unittest.TestCase):
    def test_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'events.json')
            admin_server.save_items(path, [{'uid': 'x'}])
            self.assertEqual(admin_server.load_items(path), [{'uid': 'x'}])

    def test_load_missing_file_returns_empty_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'missing.json')
            self.assertEqual(admin_server.load_items(path), [])

    def test_save_is_atomic_no_leftover_tmp_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'events.json')
            admin_server.save_items(path, [])
            leftovers = [f for f in os.listdir(tmp) if f != 'events.json']
            self.assertEqual(leftovers, [])


class ValidateCourseTests(unittest.TestCase):
    def valid_payload(self):
        return {
            'title': 'IPC-A-610 Specialist',
            'category': 'EPTAC (Electronics Specialists)',
            'startDate': '2026-10-20',
            'endDate': '2026-10-23',
            'cost': '$500',
            'registrationMode': 'capacity',
            'seatsTotal': 26,
            'seatsFilled': 22,
        }

    def test_valid_capacity_payload_has_no_errors(self):
        self.assertEqual(admin_server.validate_course(self.valid_payload()), [])

    def test_valid_door_payload_has_no_errors(self):
        payload = self.valid_payload()
        payload['registrationMode'] = 'door'
        del payload['seatsTotal']
        del payload['seatsFilled']
        self.assertEqual(admin_server.validate_course(payload), [])

    def test_missing_title(self):
        payload = self.valid_payload()
        payload['title'] = '   '
        self.assertIn('title is required', admin_server.validate_course(payload))

    def test_missing_category_and_no_new_category(self):
        payload = self.valid_payload()
        payload['category'] = ''
        self.assertIn('category is required', admin_server.validate_course(payload))

    def test_missing_category_but_new_category_present_is_valid(self):
        payload = self.valid_payload()
        payload['category'] = ''
        payload['newCategory'] = 'Woodworking'
        self.assertEqual(admin_server.validate_course(payload), [])

    def test_end_before_start(self):
        payload = self.valid_payload()
        payload['startDate'] = '2026-10-23'
        payload['endDate'] = '2026-10-20'
        self.assertIn('endDate must not be before startDate',
                       admin_server.validate_course(payload))

    def test_bad_date_format(self):
        payload = self.valid_payload()
        payload['startDate'] = 'not-a-date'
        self.assertIn('startDate must be a valid date (YYYY-MM-DD)',
                       admin_server.validate_course(payload))

    def test_missing_cost(self):
        payload = self.valid_payload()
        payload['cost'] = ''
        self.assertIn('cost is required', admin_server.validate_course(payload))

    def test_bad_registration_mode(self):
        payload = self.valid_payload()
        payload['registrationMode'] = 'whenever'
        self.assertIn('registrationMode must be "capacity" or "door"',
                       admin_server.validate_course(payload))

    def test_capacity_mode_requires_positive_seats_total(self):
        payload = self.valid_payload()
        payload['seatsTotal'] = 0
        self.assertIn('seatsTotal must be a positive integer',
                       admin_server.validate_course(payload))

    def test_capacity_mode_seats_filled_cannot_exceed_total(self):
        payload = self.valid_payload()
        payload['seatsFilled'] = 30
        self.assertIn('seatsFilled must not exceed seatsTotal',
                       admin_server.validate_course(payload))


class ResolveCategoryTests(unittest.TestCase):
    def test_new_category_wins_over_existing_category_field(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'course-categories.json')
            admin_server.save_items(path, ['Existing Category'])
            payload = {'category': 'Existing Category', 'newCategory': 'Woodworking'}
            result = admin_server.resolve_category(payload, path)
            self.assertEqual(result, 'Woodworking')

    def test_new_category_is_appended_and_saved_when_absent(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'course-categories.json')
            admin_server.save_items(path, ['Existing Category'])
            payload = {'category': '', 'newCategory': 'Woodworking'}
            admin_server.resolve_category(payload, path)
            self.assertEqual(admin_server.load_items(path),
                              ['Existing Category', 'Woodworking'])

    def test_new_category_matching_existing_is_not_duplicated(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'course-categories.json')
            admin_server.save_items(path, ['Woodworking'])
            payload = {'category': '', 'newCategory': 'Woodworking'}
            admin_server.resolve_category(payload, path)
            self.assertEqual(admin_server.load_items(path), ['Woodworking'])

    def test_empty_new_category_uses_existing_category_with_no_file_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'course-categories.json')
            # Deliberately do not create the file: if resolve_category tried
            # to write to it, save_items would create it and this assertion
            # would catch that.
            payload = {'category': 'EPTAC (Electronics Specialists)', 'newCategory': ''}
            result = admin_server.resolve_category(payload, path)
            self.assertEqual(result, 'EPTAC (Electronics Specialists)')
            self.assertFalse(os.path.exists(path))

    def test_missing_new_category_key_uses_existing_category(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'course-categories.json')
            payload = {'category': 'EPTAC (Electronics Specialists)'}
            result = admin_server.resolve_category(payload, path)
            self.assertEqual(result, 'EPTAC (Electronics Specialists)')
            self.assertFalse(os.path.exists(path))


if __name__ == '__main__':
    unittest.main()
