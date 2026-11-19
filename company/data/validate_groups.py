#!/usr/bin/env python3
"""company/data/groups.json 검증 — 공시대상기업집단(대기업 그룹) 자료 (2026-11-19).

    python3 validate_groups.py [groups.json]

검사 항목
  1. 최상위 구조(meta · groups · undesignated)와 meta.totals 가 실제 값과 같은지
  2. 집단 102곳 · 순위 1~102 중복 없음 · 이름 중복 없음
  3. 공정자산총액이 0보다 크고, 상호출자제한(mutual) 표시가 12조 원 기준과 맞는지
  4. members 의 id 가 companies.json 에 실제로 있고, 그 회사의 group 값이 이 집단을 가리키는지
  5. 계열회사 수(공시)가 1 이상이고, 두 집단에 함께 올라 있는 법인은 양쪽 모두에 있는지
  6. undesignated(SPC)에 근거(basis)·설명(note)·계열사가 있는지, 계열사 id 가 원자료에 있는지
  7. 정해지지 않은 칸이 없는지(지어낸 필드 방지)
오류가 있으면 목록을 찍고 종료코드 1로 끝난다.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'groups.json')
COMPANIES = os.path.join(HERE, 'companies.json')
MUTUAL_MIN = 12000 * 10 ** 9          # 상호출자제한 = 공정자산 12조 원 이상(2026년 기준)
GROUP_KEYS = {'id', 'name', 'owner', 'rank', 'rank_2025', 'affiliates', 'assets',
              'assets_billion', 'mutual', 'members', 'aliases'}
UNDES_KEYS = {'id', 'name', 'owner', 'basis', 'note', 'members', 'aliases'}

errors = []


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def norm_group(s):
    s = str(s or '')
    i = s.find('(舊')
    return s[:i].strip() if i > 0 else s.strip()


try:
    doc = load(PATH)
    raw = load(COMPANIES)
except Exception as e:
    sys.exit('JSON 파싱 실패: %s' % e)

items = {x['id']: x for x in (raw.get('companies') or [])}
groups = doc.get('groups')
undes = doc.get('undesignated')
meta = doc.get('meta') or {}
if not isinstance(groups, list) or not isinstance(undes, list):
    sys.exit('groups · undesignated 배열이 없습니다')

ranks = set()
names = set()
member_of = {}
for i, g in enumerate(groups):
    tag = 'groups[%d](%s)' % (i, g.get('name'))
    extra = set(g) - GROUP_KEYS
    if extra:
        errors.append('%s: 정해지지 않은 칸 %s' % (tag, sorted(extra)))
    if not g.get('id') or not g.get('name'):
        errors.append('%s: id·name 누락' % tag)
    if g.get('name') in names:
        errors.append('%s: 집단명 중복' % tag)
    names.add(g.get('name'))
    if g.get('rank') in ranks:
        errors.append('%s: 순위 중복 %s' % (tag, g.get('rank')))
    ranks.add(g.get('rank'))
    if not isinstance(g.get('affiliates'), int) or g['affiliates'] < 1:
        errors.append('%s: 계열회사 수가 이상합니다' % tag)
    if not isinstance(g.get('assets'), int) or g['assets'] <= 0:
        errors.append('%s: 공정자산총액이 없습니다' % tag)
    if g.get('assets') != g.get('assets_billion', 0) * 10 ** 9:
        errors.append('%s: assets 와 assets_billion 이 맞지 않습니다' % tag)
    if bool(g.get('mutual')) != (g.get('assets', 0) >= MUTUAL_MIN):
        errors.append('%s: 상호출자제한 표시가 12조 원 기준과 다릅니다' % tag)
    if not g.get('owner'):
        errors.append('%s: 동일인 누락' % tag)
    ids = g.get('members')
    if not isinstance(ids, list) or len(ids) != len(set(ids)):
        errors.append('%s: members 가 배열이 아니거나 중복이 있습니다' % tag)
        continue
    if not ids:
        errors.append('%s: 수록 계열사가 없습니다' % tag)
    for mid in ids:
        x = items.get(mid)
        if not x:
            errors.append('%s: 원자료에 없는 id %s' % (tag, mid))
            continue
        keys = [norm_group(k) for k in str(x.get('group') or '').split('/') if k.strip()]
        if not any(k == norm_group(g['name']) or k.startswith(norm_group(g['name'])) for k in keys):
            errors.append('%s: %s 의 group(%r)이 이 집단이 아닙니다' % (tag, x['name'], x.get('group')))
        member_of.setdefault(mid, []).append(g['name'])

for i, g in enumerate(undes):
    tag = 'undesignated[%d](%s)' % (i, g.get('name'))
    extra = set(g) - UNDES_KEYS
    if extra:
        errors.append('%s: 정해지지 않은 칸 %s' % (tag, sorted(extra)))
    for k in ('id', 'name', 'basis', 'note'):
        if not g.get(k):
            errors.append('%s: %s 누락' % (tag, k))
    ids = g.get('members') or []
    if not ids:
        errors.append('%s: 계열사가 없습니다' % tag)
    for mid in ids:
        if mid not in items:
            errors.append('%s: 원자료에 없는 id %s' % (tag, mid))

t = meta.get('totals') or {}
if len(groups) != 102:
    errors.append('집단이 102곳이 아닙니다: %d' % len(groups))
if sorted(ranks) != list(range(1, 103)):
    errors.append('순위가 1~102 가 아닙니다')
if t.get('groups') != len(groups):
    errors.append('meta.totals.groups 불일치')
if t.get('affiliates') != sum(g['affiliates'] for g in groups):
    errors.append('meta.totals.affiliates 불일치')
if t.get('mutual_groups') != sum(1 for g in groups if g.get('mutual')):
    errors.append('meta.totals.mutual_groups 불일치')
if t.get('mutual_affiliates') != sum(g['affiliates'] for g in groups if g.get('mutual')):
    errors.append('meta.totals.mutual_affiliates 불일치')
if t.get('members_in_book') != len(member_of):
    errors.append('meta.totals.members_in_book 불일치')

if not errors:
    print('집단 %d곳(상호출자제한 %d곳) · 공시 계열회사 %s곳 · 명함첩 수록 %d곳 · 비공시 %d곳'
          % (len(groups), t.get('mutual_groups'), format(t.get('affiliates'), ','),
             len(member_of), len(undes)))
    print('원자료에 없는 계열사 0곳, 집단과 무관한 계열사 0곳, 지어낸 칸 0개')

if errors:
    print('문제 %d건:' % len(errors), file=sys.stderr)
    for e in errors[:40]:
        print('  -', e, file=sys.stderr)
    sys.exit(1)
