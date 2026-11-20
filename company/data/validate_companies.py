#!/usr/bin/env python3
"""company/data/companies.json 구조 검증.

    python3 validate_companies.py [companies.json]

검사 항목
  1. 최상위 구조(meta·companies), meta.counts·total과 실제 건수 일치
  2. 필수 필드·타입, id 중복
  3. meta.sources 참조(sources·source 필드)가 정의되어 있는지
  4. v1.3.0 business_tags·business_tags_detail 정합성
     (어휘 3종, detail의 tag 집합 = business_tags, source·as_of·match 필수)
오류가 있으면 목록을 찍고 종료코드 1로 끝난다.
"""
import json, re, sys, collections

PATH = sys.argv[1] if len(sys.argv) > 1 else 'companies.json'
TAGS = {'근로자파견', '유료직업소개', '직업정보제공'}
MATCH = {'exact', 'district'}
REQUIRED = {'id': str, 'name': str, 'search_name': str, 'category': str,
            'sub_category': str, 'coverage': str, 'source': str}
CATS = {'대기업', '중견기업', '공공기관'}
INT_FIELDS = {'revenue', 'total_assets', 'employees', 'established_year',
              'nps_workplaces', 'revenue_year'}
STR_FIELDS = {'biz_no', 'corp_reg_no', 'industry', 'industry_code', 'ksic_code', 'sector',
              'sector_code', 'headquarters', 'address_jibeon', 'location_sido', 'official_url',
              'ceo', 'corp_type', 'certificate_no', 'certificate_valid', 'nps_match',
              'official_url_checked', 'main_products', 'main_products_source', 'stock_code',
              'market', 'listed_at', 'market_sector', 'ministry', 'group', 'source_ref',
              'business_summary', 'nps_workplace_type', 'employees_as_of', 'employees_type',
              'revenue_unit', 'revenue_as_of', 'total_assets_as_of', 'listed_date'}

errors = []
raw = open(PATH, encoding='utf-8').read()
if raw.startswith('\ufeff'):
    errors.append('파일에 BOM이 있습니다')
try:
    data = json.loads(raw)
except Exception as e:
    sys.exit(f'JSON 파싱 실패: {e}')

meta = data.get('meta') or {}
companies = data.get('companies')
if not isinstance(companies, list):
    sys.exit('companies 배열이 없습니다')

src_ids = {s.get('id') for s in meta.get('sources', [])}
counts = collections.Counter(c.get('category') for c in companies)

for k in ('dataset', 'version', 'built_at', 'description', 'sources'):
    if k not in meta:
        errors.append(f'meta.{k} 누락')
if meta.get('counts') != dict(counts) and meta.get('counts') != {k: v for k, v in counts.items()}:
    if sum((meta.get('counts') or {}).values()) != len(companies):
        errors.append(f"meta.counts({meta.get('counts')})와 실제 건수({dict(counts)}) 불일치")
if meta.get('total') != len(companies):
    errors.append(f"meta.total({meta.get('total')}) != {len(companies)}")
for cat, n in counts.items():
    if cat not in CATS:
        errors.append(f'알 수 없는 category: {cat}')

ids = collections.Counter()
tagged = 0
tag_counter = collections.Counter()
for i, c in enumerate(companies):
    where = f"[{i}] {c.get('name') or c.get('id')}"
    ids[c.get('id')] += 1
    for f, t in REQUIRED.items():
        if f not in c:
            errors.append(f'{where}: 필수 필드 {f} 누락')
        elif not isinstance(c[f], t):
            errors.append(f'{where}: {f} 타입 {type(c[f]).__name__}')
    for f in INT_FIELDS:
        if f in c and not isinstance(c[f], int):
            errors.append(f'{where}: {f} 정수 아님({c[f]!r})')
    for f in STR_FIELDS:
        if f in c and not isinstance(c[f], str):
            errors.append(f'{where}: {f} 문자열 아님')
    if c.get('category') not in CATS:
        errors.append(f'{where}: category 값 이상')
    if c.get('source') and src_ids and c['source'] not in src_ids:
        errors.append(f'{where}: source {c["source"]} 정의 없음')
    for s in c.get('sources') or []:
        if src_ids and s not in src_ids:
            errors.append(f'{where}: sources {s} 정의 없음')
    # v1.4.0 검색 보강 필드 — 중견기업만, 형식과 근거(kw_source)를 함께 본다
    for f in ('kw', 'alias'):
        if f in c:
            v = c[f]
            if not isinstance(v, list) or not v:
                errors.append(f'{where}: {f} 는 비어 있지 않은 배열이어야 함')
            else:
                if len(set(v)) != len(v):
                    errors.append(f'{where}: {f} 중복')
                for x in v:
                    if not isinstance(x, str) or not x.strip() or '|' in x:
                        errors.append(f'{where}: {f} 값 이상 {x!r}')
                    elif len(x) > 40:
                        errors.append(f'{where}: {f} 값이 너무 김({len(x)}자) {x[:20]}')
            if c.get('category') != '중견기업':
                errors.append(f'{where}: {f} 는 중견기업에만 붙인다')
    if ('kw' in c or 'alias' in c) and not c.get('kw_source'):
        errors.append(f'{where}: kw·alias 가 있는데 kw_source(근거)가 없다')
    # v1.5.0 금융감독원 DART 전자공시 보강 — 법인 연결고리와 값의 출처를 함께 본다
    if 'dart' in c:
        d = c['dart']
        if not isinstance(d, dict):
            errors.append(f'{where}: dart 는 객체여야 함')
        else:
            for f in ('corp_code', 'checked_at', 'biz_no_verified'):
                if f not in d:
                    errors.append(f'{where}: dart.{f} 누락')
            if not re.fullmatch(r'\d{8}', str(d.get('corp_code') or '')):
                errors.append(f'{where}: dart.corp_code 형식 이상')
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(d.get('checked_at') or '')):
                errors.append(f'{where}: dart.checked_at 은 YYYY-MM-DD')
            if d.get('biz_no_verified') is not True:
                errors.append(f'{where}: dart.biz_no_verified 는 true 만 (사업자등록번호 대조를 통과한 법인만 붙인다)')
            r = d.get('report')
            if r is not None:
                if not isinstance(r, dict) or not re.fullmatch(r'\d{14}', str(r.get('rcept_no') or '')):
                    errors.append(f'{where}: dart.report.rcept_no 형식 이상')
        if c.get('category') != '중견기업':
            errors.append(f'{where}: dart 는 중견기업에만 붙인다')
    for f, ok in (('official_url_checked', {'site', 'sources', 'DART'}),
                  ('main_products_source', {'WIKI', 'DAUM', 'DART'})):
        if f in c and c[f] not in ok:
            errors.append(f'{where}: {f} 값 이상 {c[f]!r}')
    if ('business_tags' in c) != ('business_tags_detail' in c):
        errors.append(f'{where}: business_tags와 business_tags_detail 한쪽만 있음')
        continue
    if 'business_tags' in c:
        tagged += 1
        tags = c['business_tags']
        detail = c['business_tags_detail']
        if not isinstance(tags, list) or not tags:
            errors.append(f'{where}: business_tags 형식')
            continue
        if len(set(tags)) != len(tags):
            errors.append(f'{where}: business_tags 중복')
        for t in tags:
            if t not in TAGS:
                errors.append(f'{where}: business_tags 어휘 밖 {t}')
            tag_counter[t] += 1
        if not isinstance(detail, list) or len(detail) != len(tags):
            errors.append(f'{where}: detail 길이 불일치')
            continue
        if {d.get('tag') for d in detail} != set(tags):
            errors.append(f'{where}: detail tag 집합 불일치')
        for d in detail:
            for f in ('tag', 'source', 'as_of', 'match', 'official_name', 'official_address'):
                if not d.get(f):
                    errors.append(f'{where}: detail.{f} 누락')
            if d.get('source') and src_ids and d['source'] not in src_ids:
                errors.append(f'{where}: detail.source {d.get("source")} 정의 없음')
            if d.get('match') not in MATCH:
                errors.append(f'{where}: detail.match 값 이상 {d.get("match")!r}')

dups = [k for k, v in ids.items() if v > 1]
if dups:
    errors.append(f'id 중복 {len(dups)}건: {dups[:5]}')

print(f"파일 {PATH} · {len(companies)}건 ({dict(counts)}) · 태그 {tagged}건 {dict(tag_counter)}")
if errors:
    print(f'오류 {len(errors)}건')
    for e in errors[:40]:
        print('  -', e)
    sys.exit(1)
print('오류 0건')
