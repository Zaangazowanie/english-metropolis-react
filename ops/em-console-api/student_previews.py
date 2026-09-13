"""Read-only next-course-lesson previews. Never assign, publish, or render a PDF."""
import html
import os
import re
from urllib.parse import unquote, urlsplit

PREFIX = '/api/console/student/next-lesson'


def title_key(value):
    value = html.unescape(value or '').lower().strip()
    # Published cards can prepend a library identifier or append a subtitle.
    value = re.sub(r'^(?:gen|spec|sum|ind)-[a-z0-9-]+(?:\s+\d+)?\s*[-–—:]\s*', '', value)
    value = value.split(' — ')[0]
    return re.sub(r'[^\w]+', ' ', value, flags=re.UNICODE).strip()


def choose_lesson(context, rows):
    """Explicit curriculum order wins; the assigned track covers missing plans.

    Taught records, including prefixed publisher titles, override stale planned
    flags. Calendar time alone cannot prove a particular course deck was taught.
    """
    plan = sorted(context.get('plan') or [], key=lambda p: p.get('position') or 0)
    taught = [l for l in context.get('lessons') or [] if l.get('status') != 'planned']
    done = {title_key(l.get('title')) for l in taught}
    done.update(title_key(p.get('title')) for p in plan if p.get('status') == 'taught')
    taught_ids = {l.get('id') for l in taught}
    course_id = context.get('courseId')
    track = sorted([r for r in rows if r.get('course_id') == course_id],
                   key=lambda r: r.get('lesson_number') or 0)

    def match(p, pool):
        # Prefer an exact library ID in an assigned PDF name, then a unique title.
        pdf = unquote(p.get('pdfUrl') or '')
        by_id = [r for r in pool if re.search(r'(?<![\w-])' + re.escape(r['lesson_id']) + r'(?![\w-])', pdf)]
        hits = by_id or [r for r in pool if title_key(r.get('title')) == title_key(p.get('title'))]
        return hits[0] if len(hits) == 1 else None

    candidates, seen = [], set()
    for p in plan:
        if p.get('status') != 'planned' or (p.get('lessonId') and p['lessonId'] in taught_ids):
            continue
        r = match(p, track if track else rows)
        # A current library track must not surface a preserved PDF from an old course.
        if track and not r:
            continue
        candidate = dict(r or {}, slot=p)
        key = title_key(candidate.get('title') or p.get('title'))
        if key and key not in done and key not in seen:
            candidates.append(candidate)
            seen.add(key)
    for r in track:
        key = title_key(r.get('title'))
        if key not in done and key not in seen:
            candidates.append(dict(r, slot={}))
            seen.add(key)
    return candidates[0] if candidates else None


def material(candidate, library, webroot):
    slot = candidate.get('slot') or {}
    lid = candidate.get('lesson_id')
    entry = (library.get('by_id') or {}).get(lid) or {}
    pdf = os.path.join(entry['dir'], 'deck-web.pdf') if entry.get('dir') else None
    if not pdf:
        url = urlsplit(slot.get('pdfUrl') or '')
        if not url.netloc and url.path.startswith('/students/') and url.path.lower().endswith('.pdf'):
            resolved = os.path.realpath(os.path.join(webroot, unquote(url.path).lstrip('/')))
            root = os.path.realpath(os.path.join(webroot, 'students'))
            if os.path.commonpath([root, resolved]) == root:
                pdf = resolved
    pdf = pdf if pdf and os.path.isfile(pdf) else None
    keywords = entry.get('deck_keywords') or [
        {'word': k, 'ipa': '', 'pl': '', 'example': ''}
        for k in slot.get('keywords') or candidate.get('keywords') or [] if isinstance(k, str) and k.strip()
    ]
    # Never include server paths, other assignments, or teacher-only metadata.
    preview = {
        'id': lid or slot.get('id'), 'title': candidate.get('title') or slot.get('title'),
        'courseId': candidate.get('course_id'),
        'lessonNumber': candidate.get('lesson_number') or slot.get('position'),
        'level': candidate.get('level') or slot.get('level'),
        'topics': slot.get('topics') or ([candidate['topic']] if candidate.get('topic') else []),
        'keywords': [{k: html.unescape(str(row.get(k) or '')) for k in ('word', 'ipa', 'pl', 'example')} for row in keywords],
        'hasPdf': bool(pdf),
    }
    return preview, pdf


def handle(handler, path, params, query, build_index, library, webroot):
    if path not in (PREFIX, PREFIX + '/pdf'):
        return False
    private = {'Cache-Control': 'private, no-store', 'Vary': 'Authorization'}
    token = handler._bearer()
    if not token:
        handler._send(401, {'error': 'Student sign-in required'}, extra=private)
        return True
    try:
        context = query('coursePreviews:context', {'sessionToken': token})
    except Exception:
        handler._send(503, {'error': 'Could not load your next lesson. Please try again.'}, extra=private)
        return True
    if not context:
        handler._send(403, {'error': 'Student session invalid or expired'}, extra=private)
        return True
    try:
        build_index()
        candidate = choose_lesson(context, library['rows'])
        if not candidate:
            handler._send(200 if path == PREFIX else 404, {'lesson': None}, extra=private)
            return True
        preview, pdf = material(candidate, library, webroot)
        if path == PREFIX:
            handler._send(200, {'lesson': preview}, extra=private)
        elif params.get('lesson') != preview['id']:
            handler._send(409, {'error': 'Your next lesson has changed. Refresh the preview.'}, extra=private)
        elif not pdf:
            handler._send(404, {'error': 'The lesson PDF is not available yet.'}, extra=private)
        else:
            with open(pdf, 'rb') as f:
                data = f.read()
            if not data.startswith(b'%PDF-'):
                raise ValueError('Invalid PDF')
            name = re.sub(r'[^A-Za-z0-9_-]', '_', str(preview['id']))
            handler._send(200, data, 'application/pdf', {
                **private, 'Content-Disposition': f'inline; filename="{name}.pdf"',
                'X-Content-Type-Options': 'nosniff',
            })
    except Exception:
        handler._send(503, {'error': 'Could not load your next lesson. Please try again.'}, extra=private)
    return True
