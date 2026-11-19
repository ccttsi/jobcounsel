#!/usr/bin/env python3
"""company/data/local-public.json 구조 검증 — 지방공공기관(4번째 분류).

    python3 validate_local_public.py [local-public.json]

검사 항목
  1. 최상위 구조(meta·institutions), meta.total·counts·sub_counts와 실제 건수 일치
  2. 필수 필드·타입, id 중복, 네 갈래(sub_category) 값
  3. meta.sources 참조(source 필드)가 정의되어 있는지
  4. 원자료에 없는 칸을 만들지 않았는지 — 매출·정원·설립일·홈페이지 같은 필드가 한 건도 없어야 한다
  5. 지역 값 정합성 — 시·도는 17개, 설립 단위는 광역/기초, 수도권은 서울·인천·경기만
오류가 있으면 목록을 찍고 종료코드 1로 끝난다.
"""
import json
import sys
import collections

PATH = sys.argv[1] if len(sys.argv) > 1 else 'local-public.json'
REQUIRED = {'id': str, 'name': str, 'search_name': str, 'category': str,
            'sub_category': str, 'coverage': str, 'source': str,
            'region_scope': str, 'metro': str, 'location_sido': str}
OPTIONAL = {'source_no': int, 'operating': str, 'type_detail': str, 'sigungu': str,
            'founder': str, 'note': str}
SUBS = {'지방직영기업', '지방공사·공단', '출자기관', '출연기관'}
SIDO = {'서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
        '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도',
        '전라남도', '경상북도', '경상남도', '제주특별자치도'}
METRO = {'수도권', '비수도권'}
METRO_SIDO = {'서울특별시', '인천광역시', '경기도'}
SCOPE = {'광역', '기초'}
# 원자료에 없는 값 — 이 파일에는 절대 있어서는 안 된다(지어내지 않기 규칙)
FORBIDDEN = {'revenue', 'total_assets', 'employees', 'established_year', 'official_url', 'ceo',
             'business_summary', 'certificate_no', 'biz_no', 'corp_reg_no', 'stock_code',
             'headquarters', 'industry', 'ksic_code', 'ministry', 'group'}

errors = []
raw = open(PATH, encoding='utf-8').read()
if raw.startswith('\ufeff'):
    errors.append('파일에 BOM이 있습니다')
try:
    data = json.loads(raw)
except Exception as e:
    sys.exit(f'JSON 파싱 실패: {e}')

meta = data.get('meta') or {}
items = data.get('institutions')
if not isinstance(items, list):
    sys.exit('institutions 배열이 없습니다')

for k in ('dataset', 'version', 'built_at', 'as_of', 'description', 'sources'):
    if k not in meta:
        errors.append(f'meta.{k} 누락')
src_ids = {s.get('id') for s in meta.get('sources', [])}
if meta.get('total') != len(items):
    errors.append(f"meta.total({meta.get('total')}) != 실제 {len(items)}")
if (meta.get('counts') or {}).get('지방공공기관') != len(items):
    errors.append(f"meta.counts와 실제 건수 불일치: {meta.get('counts')} vs {len(items)}")

sub = collections.Counter(x.get('sub_category') for x in items)
if meta.get('sub_counts') != dict(sub):
    errors.append(f"meta.sub_counts({meta.get('sub_counts')})와 실제({dict(sub)}) 불일치")

ids = collections.Counter(x.get('id') for x in items)
for k, n in ids.items():
    if n > 1:
        errors.append(f'id 중복: {k} ({n}건)')

seen_forms = collections.Counter()
for x in items:
    tag = x.get('id') or x.get('name') or '(이름 없음)'
    for f, t in REQUIRED.items():
        if f not in x:
            errors.append(f'{tag}: 필수 필드 {f} 누락')
        elif not isinstance(x[f], t):
            errors.append(f'{tag}: {f} 타입({type(x[f]).__name__})이 {t.__name__}이 아님')
        elif t is str and not x[f].strip():
            errors.append(f'{tag}: {f}가 빈 문자열')
    for f, t in OPTIONAL.items():
        if f in x and not isinstance(x[f], t):
            errors.append(f'{tag}: {f} 타입이 {t.__name__}이 아님')
    bad = FORBIDDEN & set(x)
    if bad:
        errors.append(f'{tag}: 원자료에 없는 필드가 있음 — {", ".join(sorted(bad))}')
    if x.get('category') != '지방공공기관':
        errors.append(f'{tag}: category가 지방공공기관이 아님 — {x.get("category")}')
    if x.get('sub_category') not in SUBS:
        errors.append(f'{tag}: 알 수 없는 sub_category — {x.get("sub_category")}')
    if x.get('source') not in src_ids:
        errors.append(f'{tag}: source {x.get("source")}가 meta.sources에 없음')
    if x.get('location_sido') not in SIDO:
        errors.append(f'{tag}: 시·도 값이 17개 시·도가 아님 — {x.get("location_sido")}')
    if x.get('metro') not in METRO:
        errors.append(f'{tag}: metro 값 — {x.get("metro")}')
    elif (x.get('metro') == '수도권') != (x.get('location_sido') in METRO_SIDO):
        errors.append(f'{tag}: 수도권 표시와 시·도가 어긋남 — {x.get("location_sido")} / {x.get("metro")}')
    if x.get('region_scope') not in SCOPE:
        errors.append(f'{tag}: region_scope 값 — {x.get("region_scope")}')
    if 'founder' in x and x.get('founder') and not str(x['founder']).startswith(x['location_sido']):
        errors.append(f'{tag}: 설립 지자체가 시·도로 시작하지 않음 — {x.get("founder")}')
    if x.get('sub_category') == '지방직영기업' and x.get('operating') != '직영':
        errors.append(f'{tag}: 지방직영기업인데 운영구분이 직영이 아님')
    seen_forms[x.get('source')] += 1

if len(seen_forms) and not errors:
    print(f'출처별: {dict(seen_forms)}')
    print(f'세부 유형: {dict(sub)}')

if errors:
    print(f'문제 {len(errors)}건:', file=sys.stderr)
    for e in errors:
        print('  -', e, file=sys.stderr)
    sys.exit(1)
print(f'통과 — {len(items)}건 (세부 유형 {dict(sub)}), 지어낸 필드 0건')
