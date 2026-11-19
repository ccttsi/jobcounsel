#!/usr/bin/env python3
"""이머징 데이터 계약 검사 (SCHEMA v1.2.0). 저장소 뿌리에서: python3 emerging/data/verify.py"""
import json, os, re, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'emerging', 'data')
TRACK = {'KOGL-0': 'A', 'KOGL-1': 'A', 'PUBLIC-DOMAIN': 'A', 'CC-BY-4.0': 'A', 'PRESS': 'B',
         'OECD': 'B', 'WEF': 'B', 'IAEA': 'B', 'FACTS-ONLY': 'B'}
WD = '월화수목금토일'
bad = []


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def err(m):
    bad.append(m)


top = load(os.path.join(DATA, 'emerging.json'))
dates = top.get('archive_dates') or []
files = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(DATA, 'archive', '*.json')))
if dates != files:
    err('archive_dates %s != 파일 %s' % (len(dates), len(files)))
if (top.get('archive_index') or [{}])[-1].get('date') != dates[-1] if dates else True:
    err('archive_index 마지막 날짜가 archive_dates 마지막과 다르다')

seen_ids = set()
for no, d in enumerate(dates, start=1):
    doc = load(os.path.join(DATA, 'archive', d + '.json'))
    lab = d
    ed = doc.get('edition') or {}
    if ed.get('date') != d:
        err('%s: edition.date %s' % (lab, ed.get('date')))
    if ed.get('no') != no:
        err('%s: edition.no %s (기대 %d)' % (lab, ed.get('no'), no))
    try:
        y, m, dd = map(int, d.split('-'))
    except ValueError:
        err('%s: 날짜 형식' % lab)
        continue
    import datetime
    if ed.get('weekday') != WD[datetime.date(y, m, dd).weekday()]:
        err('%s: weekday %s' % (lab, ed.get('weekday')))
    if not (3 <= int(ed.get('reading_minutes') or 0) <= 5):
        err('%s: reading_minutes' % lab)
    items = doc.get('items') or []
    if not (1 <= len(items) <= 9):
        err('%s: 기사 %d건(1~9)' % (lab, len(items)))
    if [i.get('order') for i in items] != list(range(1, len(items) + 1)):
        err('%s: order 빈틈' % lab)
    if sum(1 for i in items if i.get('lead')) != 1 or not items[0].get('lead'):
        err('%s: lead 1건/첫 기사' % lab)
    src_ids = {s['id']: s for s in doc.get('sources') or []}
    job_ids = {j['id'] for j in doc.get('jobs') or []}
    cat_ids = {c['id'] for c in doc.get('categories') or []}
    for it in items:
        if it.get('date') != d:
            err('%s/%s: date %s' % (lab, it.get('id'), it.get('date')))
        if it.get('id') in seen_ids:
            err('%s: 중복 id' % it.get('id'))
        seen_ids.add(it.get('id'))
        if not re.match(r'^ei-%s-\d+$' % d.replace('-', ''), str(it.get('id'))):
            err('%s: id 규칙 %s' % (lab, it.get('id')))
        if it.get('cat') not in cat_ids:
            err('%s/%s: cat %s' % (lab, it.get('id'), it.get('cat')))
        sub = str(it.get('subtitle') or '')
        if not (15 <= len(sub) <= 50):
            err('%s/%s: subtitle %d자' % (lab, it.get('id'), len(sub)))
        if sub.endswith('.'):
            err('%s/%s: subtitle 마침표' % (lab, it.get('id')))
        sid = it.get('source_id')
        if sid not in src_ids:
            err('%s/%s: source_id %s' % (lab, it.get('id'), sid))
            continue
        src = src_ids[sid]
        lic = src.get('license') or {}
        track = src.get('track') or TRACK.get(lic.get('type'))
        if track not in ('A', 'B'):
            err('%s: track %s' % (sid, track))
        if lic.get('type') in ('PRESS', 'FACTS-ONLY', 'KOGL-NONE') and track == 'A':
            err('%s: %s는 Track A 금지' % (sid, lic.get('type')))
        if not lic.get('verified'):
            err('%s: 라이선스 미확인' % sid)
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', str(src.get('published'))):
            err('%s: published 정밀도 %s' % (sid, src.get('published')))
        m = it.get('market')
        if m:
            if m.get('source_id') not in src_ids:
                err('%s/%s: market.source_id' % (lab, it.get('id')))
            if len(m.get('labels') or []) != len(((m.get('series') or [{}])[0].get('values') or [])):
                err('%s/%s: 도표 길이' % (lab, it.get('id')))
        for kind in ('legacy', 'new'):
            for jid in (it.get('jobs') or {}).get(kind, []):
                if jid not in job_ids:
                    err('%s/%s: jobs.%s %s' % (lab, it.get('id'), kind, jid))
    for s in doc.get('sources') or []:
        if s['id'] not in src_ids:
            err('%s: sources' % lab)
    size = os.path.getsize(os.path.join(DATA, 'archive', d + '.json'))
    if size > 100_000:
        err('%s: %d bytes(100KB 초과)' % (lab, size))

# 최신 호(emerging.json)와 마지막 아카이브가 같아야 한다
last = load(os.path.join(DATA, 'archive', dates[-1] + '.json'))
for k in ('edition', 'items', 'jobs', 'sources'):
    if json.dumps(top.get(k), sort_keys=True, ensure_ascii=False) != json.dumps(last.get(k), sort_keys=True, ensure_ascii=False):
        err('emerging.json의 %s가 마지막 지면과 다르다' % k)

if bad:
    print('실패 %d건' % len(bad))
    for b in bad:
        print(' -', b)
    sys.exit(1)
print('통과 — 지면 %d개 · 기사 %d건' % (len(dates), sum(len(load(os.path.join(DATA, 'archive', d + '.json'))['items']) for d in dates)))
