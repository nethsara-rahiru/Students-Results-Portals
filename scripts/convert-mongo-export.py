#!/usr/bin/env python3
"""Offline, non-destructive MongoDB JSON -> LevelUp PostgreSQL import SQL.
Output contains student records/marks: keep it private. Never overwrites existing IDs.
"""
import argparse
from collections import Counter
import datetime
from decimal import Decimal
import json
import os
from pathlib import Path
import re

ID = re.compile(r'^([a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$')

def unwrap(value):
    if isinstance(value, dict):
        if '$date' in value:
            date = unwrap(value['$date'])
            if isinstance(date, (int, float)) or str(date).lstrip('-').isdigit():
                return datetime.datetime.fromtimestamp(float(date) / 1000, datetime.timezone.utc).isoformat()
            return date
        for key in ('$oid', '$numberInt', '$numberLong', '$numberDouble', '$numberDecimal', '$date'):
            if key in value:
                return unwrap(value[key])
        return {k: unwrap(v) for k, v in value.items()}
    if isinstance(value, list):
        return [unwrap(v) for v in value]
    return value

def records(directory, name, required=False):
    path = directory / (name + '.json')
    if not path.exists():
        if required:
            raise ValueError('Missing ' + path.name)
        return []
    raw = path.read_text()
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            data = [data]
    except json.JSONDecodeError:
        data = [json.loads(line) for line in raw.splitlines() if line.strip()]
    return unwrap(data)

def quote(value):
    if value is None:
        return 'NULL'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    return "'" + str(value).replace("'", "''") + "'"

def identity(value):
    value = str(value)
    if not ID.fullmatch(value):
        raise ValueError('Invalid legacy identifier')
    return value

def clean(value):
    return ' '.join(str(value).split())

def convert(directory, include_codes=False):
    students = records(directory, 'students', True)
    papers = records(directory, 'papers', True)
    marks = records(directory, 'marks', True)
    classes = records(directory, 'classes')
    groups = Counter((clean(s['name']).lower(), s.get('classId'), s.get('label') or '') for s in students if s.get('active', True))
    statements = ['-- Confidential student data. Import into a backed-up, prepared database.', 'begin;', 'set standard_conforming_strings = on;']
    def insert(table, fields):
        statements.append('insert into ' + table + ' (' + ','.join(fields) + ') values (' + ','.join(quote(v) for v in fields.values()) + ');')
    for c in classes:
        insert('public.levelup_classes', {'id': identity(c['_id']), 'name': clean(c['name'])})
    for s in students:
        name = clean(s['name'])
        label = s.get('label') or ''
        if groups[(name.lower(), s.get('classId'), label)] > 1:
            label = 'Imported profile ' + identity(s['_id'])
        insert('public.levelup_students', {'id': identity(s['_id']), 'name': name, 'label': label, 'class_id': identity(s['classId']) if s.get('classId') else None, 'active': s.get('active', True)})
        if include_codes and s.get('accessCodeHash'):
            if not re.fullmatch(r'\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}', s['accessCodeHash']):
                raise ValueError('Unsupported legacy access-code hash; reset this student code instead')
            insert('levelup_private.student_codes', {'student_id': identity(s['_id']), 'hash': s['accessCodeHash']})
    for index, p in enumerate(papers):
        date = str(p.get('date') or '')[:10]
        if date:
            datetime.date.fromisoformat(date)
        insert('public.levelup_papers', {'id': identity(p['_id']), 'name': clean(p['name']), 'subject': p.get('subject') or '', 'grade': p.get('grade') or '', 'date': date or None, 'max': p['max'], 'class_id': identity(p['classId']) if p.get('classId') else None, 'state': p.get('state') or ('published' if p.get('published') else 'draft'), 'position': p.get('order', index)})
    paper_map = {p['_id']: p for p in papers}
    student_ids = {s['_id'] for s in students}
    seen = set()
    for m in marks:
        pair = (m['studentId'], m['paperId'])
        if pair in seen or pair[0] not in student_ids or pair[1] not in paper_map:
            raise ValueError('Duplicate or orphan mark; correct the export before importing')
        seen.add(pair)
        status = m.get('status') or 'present'
        value = m.get('value') if status != 'absent' else None
        if value is not None:
            if isinstance(value, bool):
                raise ValueError('Boolean values are not marks')
            number = Decimal(str(value))
            if not number.is_finite() or number < 0 or number > Decimal(str(paper_map[pair[1]]['max'])) or number != number.quantize(Decimal('.01')):
                raise ValueError('Invalid mark in export')
        insert('public.levelup_marks', {'student_id': identity(pair[0]), 'paper_id': identity(pair[1]), 'value': value, 'status': status})
    for log in records(directory, 'auditLogs'):
        insert('public.levelup_audit_logs', {'actor': log.get('actor') or 'legacy-maintenance', 'action': log.get('action') or 'legacy-import', 'entity': log.get('entity') or 'legacy', 'changes': json.dumps({'legacyAuditId': log.get('_id'), 'changes': log.get('changes')}, ensure_ascii=False), 'created_at': log.get('createdAt') or datetime.datetime.now(datetime.timezone.utc).isoformat()})
    statements.append('commit;')
    return '\n'.join(statements) + '\n'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--include-access-codes', action='store_true')
    args = parser.parse_args()
    sql = convert(args.directory, args.include_access_codes)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Refuse to overwrite an existing export; create with owner-only permissions.
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(sql)
    print('Created private import SQL. Review it and back up the destination before importing.')

if __name__ == '__main__':
    main()
