import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('previews', Path(__file__).parents[1] / 'ops/em-console-api/student_previews.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
ROWS = [{'lesson_id': 'GEN-B2-IDEAS-01', 'course_id': 'GEN-B2-IDEAS', 'lesson_number': 1, 'title': 'First ideas'},
        {'lesson_id': 'GEN-B2-IDEAS-02', 'course_id': 'GEN-B2-IDEAS', 'lesson_number': 2, 'title': 'Second ideas'},
        {'lesson_id': 'GEN-C1-PLACES-01', 'course_id': 'GEN-C1-PLACES', 'lesson_number': 1, 'title': 'Other course'}]


class Previews(unittest.TestCase):
    def test_course_without_plan_or_booking(self):
        self.assertEqual(p.choose_lesson({'courseId': 'GEN-B2-IDEAS'}, ROWS)['lesson_id'], ROWS[0]['lesson_id'])

    def test_published_prefixed_title_skips_stale_planned_slot(self):
        context = {'courseId': 'GEN-B2-IDEAS', 'lessons': [
            {'id': 'taught1', 'title': 'GEN-B2-IDEAS 01 - First ideas', 'status': 'completed'}],
            'plan': [{'id': 'p1', 'title': 'First ideas', 'status': 'planned', 'position': 1}]}
        self.assertEqual(p.choose_lesson(context, ROWS)['lesson_id'], ROWS[1]['lesson_id'])

    def test_planned_card_is_not_taught(self):
        context = {'courseId': 'GEN-B2-IDEAS', 'lessons': [{'title': 'First ideas', 'status': 'planned'}]}
        self.assertEqual(p.choose_lesson(context, ROWS)['lesson_id'], ROWS[0]['lesson_id'])

    def test_explicit_course_order_and_other_course_isolation(self):
        context = {'courseId': 'GEN-B2-IDEAS', 'plan': [
            {'title': 'Other course', 'position': 1, 'status': 'planned'},
            {'title': 'Second ideas', 'position': 2, 'status': 'planned'}]}
        self.assertEqual(p.choose_lesson(context, ROWS)['lesson_id'], ROWS[1]['lesson_id'])

    def test_completed_course_and_unassigned(self):
        self.assertIsNone(p.choose_lesson({}, ROWS))
        self.assertIsNone(p.choose_lesson({'courseId': 'GEN-B2-IDEAS', 'lessons': ROWS[:2]}, ROWS))

    def test_legacy_plan_without_pdf_stays_honest_and_ordered(self):
        context = {'plan': [{'id': 'p1', 'title': 'Custom lesson', 'status': 'planned', 'position': 1, 'keywords': ['hello']},
                            {'id': 'p2', 'title': 'Second ideas', 'status': 'planned', 'position': 2}]}
        preview, pdf = p.material(p.choose_lesson(context, ROWS), {}, '/no-webroot')
        self.assertEqual(preview['id'], 'p1')
        self.assertEqual(preview['keywords'][0]['word'], 'hello')
        self.assertFalse(preview['hasPdf'])
        self.assertIsNone(pdf)

    def test_current_keyword_table_wins_over_plan(self):
        candidate = dict(ROWS[0], slot={'keywords': ['old']})
        lib = {'by_id': {ROWS[0]['lesson_id']: {'deck_keywords': [{'word': 'current', 'pl': 'aktualny'}]}}}
        preview, _ = p.material(candidate, lib, '/no-webroot')
        self.assertEqual(preview['keywords'][0]['word'], 'current')
        self.assertNotIn('dir', preview)

    def test_private_file_cannot_escape_student_root(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root, 'private.pdf').write_bytes(b'%PDF-secret')
            _, pdf = p.material({'slot': {'pdfUrl': '/students/%2e%2e/private.pdf'}}, {}, root)
            self.assertIsNone(pdf)

    def test_endpoint_requires_student_auth_and_current_lesson_id(self):
        class Handler:
            def __init__(self, token): self.token, self.result = token, None
            def _bearer(self): return self.token
            def _send(self, code, data, ctype='application/json', extra=None): self.result = (code, data, ctype, extra)
        library = {'rows': ROWS, 'by_id': {}}
        query = lambda _fn, args: {'courseId': 'GEN-B2-IDEAS'} if args['sessionToken'] == 'valid' else None
        for token, status in [(None, 401), ('expired', 403), ('valid', 200)]:
            handler = Handler(token)
            self.assertTrue(p.handle(handler, p.PREFIX, {}, query, lambda: None, library, '/none'))
            self.assertEqual(handler.result[0], status)
            self.assertEqual(handler.result[3]['Cache-Control'], 'private, no-store')
        handler = Handler('valid')
        p.handle(handler, p.PREFIX + '/pdf', {'lesson': ROWS[2]['lesson_id']}, query, lambda: None, library, '/none')
        self.assertEqual(handler.result[0], 409)
        p.handle(handler, p.PREFIX + '/pdf', {'lesson': ROWS[0]['lesson_id']}, query, lambda: None, library, '/none')
        self.assertEqual(handler.result[0], 404)

    def test_endpoint_returns_actual_pdf_bytes(self):
        class Handler:
            def _bearer(self): return 'valid'
            def _send(self, code, data, ctype='application/json', extra=None): self.result = (code, data, ctype)
        with tempfile.TemporaryDirectory() as root:
            Path(root, 'deck-web.pdf').write_bytes(b'%PDF-1.7\nverified bytes')
            lib = {'rows': ROWS, 'by_id': {ROWS[0]['lesson_id']: {'dir': root}}}
            handler = Handler()
            p.handle(handler, p.PREFIX + '/pdf', {'lesson': ROWS[0]['lesson_id']},
                     lambda *args: {'courseId': 'GEN-B2-IDEAS'}, lambda: None, lib, '/none')
            self.assertEqual(handler.result, (200, b'%PDF-1.7\nverified bytes', 'application/pdf'))


if __name__ == '__main__':
    unittest.main()
