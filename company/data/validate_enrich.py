#!/usr/bin/env python3
"""company/data/enrich.json 구조 검증 — 별칭·보강 설명(2026-11-19).

    python3 validate_enrich.py [enrich.json]

검사 항목
  1. 최상위 구조(meta·aliases·profiles)와 meta.counts 일치
  2. 별칭마다 a(보이는 이름)·n(찾기용 정규화 이름)·ids 가 있고, ids 가 실제 원자료(companies.json·
     local-public.json)에 있는 id 인지. 없는 법인을 가리키는 별칭은 0건이어야 한다.
  3. n 은 app.js 의 norm() 과 같은 규칙(법인 표기·공백·기호 제거, 소문자)으로 a 와 일치하는지
  4. 같은 별칭이 서로 다른 법인을 가리키는 것은 허용하되, ids 가 비었거나 중복된 항목은 오류
  5. profiles 의 키가 실제 id 이고, d(요약)·p(제품·서비스 목록)·c(고객층)가 비어 있지 않은지
  6. profiles 의 값에 정해진 키(b·d·p·c) 밖의 칸이 없는지(지어낸 필드 방지)
오류가 있으면 목록을 찍고 종료코드 1로 끝난다.
"""
import json
import re
import sys
import collections

import os
HERE = os.path.dirname(os.path.abspath(__file__))
PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'enrich.json')
STEM = os.path.dirname(PATH) + '/'
COMPANIES = STEM + 'companies.json'
LOCAL = STEM + 'local-public.json'

LEGAL = re.compile(r'\(\s*(주|유|재|사|합|사단|재단|학)\s*\)|㈜|주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인')
PUNC = re.compile(r"[\s\-_.,·ㆍ()\[\]{}&/'\"’`~!@#$%^*+=:;<>?|\\]+")
ALLOWED_PROFILE_KEYS = {'b', 'd', 'p', 'c'}

errors = []


def norm(s):
    return PUNC.sub('', LEGAL.sub('', str(s or '').lower()))


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


try:
    doc = load(PATH)
except Exception as e:
    sys.exit(f'JSON 파싱 실패: {e}')

raw_ids = set()
for path in (COMPANIES, LOCAL):
    d = load(path)
    for x in (d.get('companies') or []) + (d.get('institutions') or []):
        raw_ids.add(x['id'])
if not raw_ids:
    sys.exit('원자료 id를 읽지 못했습니다')

meta = doc.get('meta') or {}
aliases = doc.get('aliases')
profiles = doc.get('profiles')
if not isinstance(aliases, list):
    sys.exit('aliases 배열이 없습니다')
if not isinstance(profiles, dict):
    sys.exit('profiles 객체가 없습니다')

for k in ('dataset', 'version', 'built_at', 'description', 'basis'):
    if not meta.get(k):
        errors.append(f'meta.{k} 누락')
c = meta.get('counts') or {}
if c.get('aliases') != len(aliases):
    errors.append(f"meta.counts.aliases({c.get('aliases')}) != 실제 {len(aliases)}")
if c.get('profiles') != len(profiles):
    errors.append(f"meta.counts.profiles({c.get('profiles')}) != 실제 {len(profiles)}")

seen_alias = {}
targets = set()
for i, a in enumerate(aliases):
    tag = f'aliases[{i}]'
    if set(a) - {'a', 'n', 'ids', 'k'}:
        errors.append(f"{tag}: 알 수 없는 키 {sorted(set(a) - {'a', 'n', 'ids', 'k'})}")
    name, key, ids = a.get('a'), a.get('n'), a.get('ids')
    if not name or not isinstance(name, str):
        errors.append(f'{tag}: a(별칭)가 없습니다')
    if not key or key != norm(name):
        errors.append(f'{tag}: n 이 norm(a) 와 다릅니다 — {name!r} / {key!r} / {norm(name)!r}')
    if not isinstance(ids, list) or not ids:
        errors.append(f'{tag}: ids 가 비었습니다')
        continue
    if len(set(ids)) != len(ids):
        errors.append(f'{tag}: ids 중복 — {ids}')
    for x in ids:
        if x not in raw_ids:
            errors.append(f'{tag}: 원자료에 없는 id — {x} ({name})')
        targets.add(x)
    if key in seen_alias:
        errors.append(f'{tag}: 같은 별칭이 두 번 들어 있습니다 — {name}')
    seen_alias[key] = name

kinds = collections.Counter()
for pid, p in profiles.items():
    tag = f'profiles[{pid}]'
    if pid not in raw_ids:
        errors.append(f'{tag}: 원자료에 없는 id')
    if not isinstance(p, dict):
        errors.append(f'{tag}: 객체가 아닙니다')
        continue
    extra = set(p) - ALLOWED_PROFILE_KEYS
    if extra:
        errors.append(f'{tag}: 정해지지 않은 칸 {sorted(extra)}')
    if not p.get('d') or not str(p['d']).strip():
        errors.append(f'{tag}: d(요약) 누락')
    if not isinstance(p.get('p'), list) or not p.get('p'):
        errors.append(f'{tag}: p(주요 제품·서비스)가 비었습니다')
    else:
        if any((not isinstance(v, str)) or not v.strip() for v in p['p']):
            errors.append(f'{tag}: p 항목에 빈 값이 있습니다')
    if not p.get('c') or not str(p['c']).strip():
        errors.append(f'{tag}: c(주요 고객) 누락')
    kinds[pid[:3]] += 1

if not errors:
    print(f'별칭 {len(aliases)}개 → 법인 {len(targets)}곳, 설명 {len(profiles)}곳 {dict(kinds)}')
    print(f'원자료에 없는 법인을 가리키는 별칭 0건, 지어낸 칸 0건')

if errors:
    print(f'문제 {len(errors)}건:', file=sys.stderr)
    for e in errors[:40]:
        print('  -', e, file=sys.stderr)
    sys.exit(1)
