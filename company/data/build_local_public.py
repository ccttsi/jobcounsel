#!/usr/bin/env python3
"""company/data/local-public.json 생성 — 지방공공기관(4번째 분류).

입력(행정안전부 공식 게시 현황 엑셀 2종, 2026.6.30 기준)
  지방공기업 현황(2026.6.30.기준).xlsx                 → /frt/bbs/...nttId=127743
  지방자치단체 출자출연기관 현황(2026.6.30.기준).xlsx  → /frt/bbs/...nttId=127744

원칙
  - 엑셀에 실제로 적힌 값(구분·지역·설립기관·운영구분·공기업유형·기관명)만 싣는다.
  - 원자료에 없는 매출·정원·설립일·홈페이지 같은 값은 만들지 않고 필드 자체를 생략한다.
  - 시트 합계와 총괄표를 대조해 어긋나면 실패한다(조용히 넘어가지 않는다).

  python3 build_local_public.py --lgi <xlsx> --invest <xlsx> --out <json>
"""
import argparse
import collections
import json
import re
import sys

import openpyxl

# 원자료의 운영구분·공기업유형 → 화면의 네 갈래
SUB = {
    '직영': '지방직영기업',
    '간접': '지방공사·공단',
}
INV_SUB = {'출자기관': '출자기관', '출연기관': '출연기관'}
SIDO17 = ['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
          '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도',
          '전라남도', '경상북도', '경상남도', '제주특별자치도']
METRO_SIDO = {'서울특별시', '인천광역시', '경기도'}   # 수도권(수도권정비계획법의 수도권과 같은 세 곳)


def search_name(name):
    """찾기용 이름: 법인 표기·공백·기호를 빼고 소문자로(화면 norm()과 같은 규칙)."""
    s = str(name).strip()
    s = re.sub(r'\(\s*(주|유|재|사|합|사단|재단|학)\s*\)|㈜|주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인', '', s)
    s = re.sub(r"[\s\-_.,·ㆍ()\[\]{}&/'\"’`~!@#$%^*+=:;<>?|\\]+", '', s)
    return s.lower()


def rows_of(path, sheet, first):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[sheet]
    out = []
    for r in ws.iter_rows(min_row=first, values_only=True):
        if isinstance(r[0], int):
            out.append(r)
    return out


def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def build_lgi(path):
    """지방공기업(직영 + 공사·공단)."""
    sheet = '지방공기업 현황'
    rows = rows_of(path, sheet, 5)
    out = []
    for r in rows:
        no, scope, metro, sido, founder, op, typ, name, note = r[0], clean(r[1]), clean(r[2]), clean(r[3]), clean(r[4]), clean(r[5]), clean(r[6]), clean(r[7]), clean(r[8])
        if not (name and op in SUB):
            sys.exit(f'지방공기업 {no}행: 운영구분/기관명을 읽지 못했습니다 — {r}')
        if scope not in ('광역', '기초'):
            sys.exit(f'지방공기업 {no}행: 구분1이 광역/기초가 아닙니다 — {scope}')
        if metro not in ('수도권', '비수도권'):
            sys.exit(f'지방공기업 {no}행: 구분2가 수도권/비수도권이 아닙니다 — {metro}')
        # 설립기관 "서울특별시 강남구" → 시도 + 시군구 (광역은 시군구 없음)
        sigungu = None
        if founder and founder != sido:
            sigungu = founder[len(sido):].strip() if founder.startswith(sido) else founder
        rec = {
            'id': 'LPI-G%04d' % no,
            'name': name,
            'search_name': search_name(name),
            'category': '지방공공기관',
            'sub_category': SUB[op],
            'coverage': 'listed',
            'source': 'MOIS_LGI',
            'source_no': no,
            'operating': op,              # 원자료 운영구분(직영/간접) 그대로
            'type_detail': typ,           # 상수도·하수도·공영개발·자동차운송·도시철도공사·도시개발공사·기타공사·지방공단
            'region_scope': scope,        # 광역 / 기초
            'metro': metro,               # 수도권 / 비수도권
            'location_sido': sido,
        }
        if sigungu:
            rec['sigungu'] = sigungu
        if founder:
            rec['founder'] = founder
        if note:
            rec['note'] = note
        out.append(rec)
    return out


def build_inv(path):
    """지방자치단체 출자·출연기관. 시트 2장(출자기관·출연기관)을 쓴다."""
    out = []
    for sheet, sub in (('출자기관', '출자기관'), ('출연기관', '출연기관')):
        rows = rows_of(path, sheet, 3)
        for r in rows:
            no, gubun, sido, sigungu, typ, name, note = r[0], clean(r[1]), clean(r[2]), clean(r[3]), clean(r[4]), clean(r[5]), clean(r[6])
            if not name:
                sys.exit(f'{sheet} {no}행: 기관명이 비었습니다 — {r}')
            if sido not in SIDO17:
                sys.exit(f'{sheet} {no}행: 시도가 17개 시·도가 아닙니다 — {sido}')
            if gubun != sub:
                sys.exit(f'{sheet} {no}행: 구분({gubun})이 시트와 다릅니다')
            main_office = sigungu == '본청'
            founder = sido if main_office else f'{sido} {sigungu}'
            rec = {
                'id': 'LPI-%s%04d' % ('J' if sub == '출자기관' else 'Y', no),
                'name': name,
                'search_name': search_name(name),
                'category': '지방공공기관',
                'sub_category': INV_SUB[sub],
                'coverage': 'listed',
                'source': 'MOIS_INV',
                'source_no': no,
                'type_detail': typ,
                'region_scope': '광역' if main_office else '기초',
                'metro': '수도권' if sido in METRO_SIDO else '비수도권',
                'location_sido': sido,
                'founder': founder,
            }
            if not main_office:
                rec['sigungu'] = sigungu
            if note:
                rec['note'] = note
            out.append(rec)
    return out


def check_totals(lgi_path, inv_path, lgi, inv):
    """시트 안의 총계와 총괄표를 뽑아 실제 건수와 대조한다."""
    problems = []
    wb = openpyxl.load_workbook(lgi_path, data_only=True)
    s1 = wb['Sheet1']
    header = [c for c in s1.iter_rows(min_row=6, max_row=6, values_only=True)][0]
    total = [c for c in s1.iter_rows(min_row=7, max_row=7, values_only=True)][0]
    want = {  # 총계행 이름 → 이 데이터에서의 세는 법
        '계': lambda x: True,
        '상수도': lambda x: x['type_detail'] == '상수도',
        '하수도': lambda x: x['type_detail'] == '하수도',
        '공영개발': lambda x: x['type_detail'] == '공영개발',
        '자동차운송': lambda x: x['type_detail'] == '자동차운송',
        '도시철도공사': lambda x: x['type_detail'] == '도시철도공사',
        '도시개발공사': lambda x: x['type_detail'] == '도시개발공사',
        '기타공사': lambda x: x['type_detail'] == '기타공사',
        '지방공단': lambda x: x['type_detail'] == '지방공단',
    }
    # 총계행은 병합 셀 때문에 값이 2행(유형 줄·총계 줄)에 흩어져 있다. 5~8행을 이어 붙여 읽는다.
    vals = []
    for row in s1.iter_rows(min_row=5, max_row=9, values_only=True):
        vals.append(row)
    flat = []
    for row in vals:
        for v in row:
            flat.append(v)
    # 유형 이름과 수를 짝지어 찾는다
    pairs = {}
    for i, v in enumerate(flat):
        if isinstance(v, str) and v.strip() in want and i + 1 < len(flat) and isinstance(flat[i + 1], int):
            pairs.setdefault(v.strip(), flat[i + 1])
        if v == '총계':
            j = i + 1
            while j < len(flat) and not isinstance(flat[j], int):
                j += 1
            if j < len(flat):
                pairs['계'] = flat[j]
    for k, n in pairs.items():
        got = sum(1 for x in lgi if want[k](x))
        if got != n:
            problems.append(f'지방공기업 총계표 {k}: 표 {n} vs 데이터 {got}')
    if '계' not in pairs:
        problems.append('지방공기업 Sheet1에서 총계를 읽지 못했습니다')

    wb2 = openpyxl.load_workbook(inv_path, data_only=True)
    s = wb2['총괄']
    gg = {}
    for row in s.iter_rows(min_row=5, max_row=8, values_only=True):
        if row and row[0]:
            gg[str(row[0]).strip()] = row
    if '총계' not in gg:
        problems.append('출자출연 총괄에서 총계를 읽지 못했습니다')
    else:
        row = gg['총계']
        want2 = {'계': (lambda x: True, row[1]), '출자기관': (lambda x: x['sub_category'] == '출자기관', row[2]),
                 '출연기관': (lambda x: x['sub_category'] == '출연기관', row[3])}
        for k, (fn, n) in want2.items():
            got = sum(1 for x in inv if fn(x))
            if got != n:
                problems.append(f'출자출연 총괄 {k}: 표 {n} vs 데이터 {got}')
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lgi', required=True)
    ap.add_argument('--invest', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    lgi = build_lgi(a.lgi)
    inv = build_inv(a.invest)
    problems = check_totals(a.lgi, a.invest, lgi, inv)

    subs = collections.Counter(x['sub_category'] for x in lgi + inv)
    sidos = collections.Counter(x['location_sido'] for x in lgi + inv)
    types = collections.Counter(x['type_detail'] for x in lgi + inv)
    scopes = collections.Counter(x['region_scope'] for x in lgi + inv)
    metros = collections.Counter(x['metro'] for x in lgi + inv)
    ids = collections.Counter(x['id'] for x in lgi + inv)
    dup_ids = [k for k, v in ids.items() if v > 1]

    meta = {
        'dataset': 'company-local-public',
        'version': '1.0.0',
        'built_at': '2026-11-19',
        'as_of': '2026-06-30',
        'description': '지방공공기관(지방직영기업·지방공사·공단·지방자치단체 출자기관·출연기관) 1,315곳. 행정안전부가 공개한 「지방공기업(2026.6.30. 기준) 현황」과 「지방자치단체 출자출연기관 현황(2026.6.30. 기준)」의 명칭·구분·지역·설립 지자체·유형만 옮겼다. 원자료에 없는 매출·정원·설립일·홈페이지는 필드 자체를 생략했다.',
        'counts': {'지방공공기관': len(lgi) + len(inv)},
        'sub_counts': {k: subs[k] for k in ('지방직영기업', '지방공사·공단', '출자기관', '출연기관')},
        'total': len(lgi) + len(inv),
        'by_source': {'MOIS_LGI': len(lgi), 'MOIS_INV': len(inv)},
        'type_counts': dict(types.most_common()),
        'sido_counts': {s: sidos.get(s, 0) for s in SIDO17},
        'region_scope_counts': dict(scopes),
        'metro_counts': dict(metros),
        'sources': [
            {
                'id': 'MOIS_LGI',
                'name': '행정안전부 「지방공기업(2026.6.30. 기준) 현황」 첨부 엑셀',
                'url': 'https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000062&nttId=127743',
                'as_of': '2026-06-30 기준 (2026-07-10 게시)',
                'license': '행정안전부 공개 현황 자료 — 기관 명칭·광역/기초·시도·설립기관·운영구분·공기업유형 같은 사실 정보만 사용',
                'used_for': '지방직영기업·지방공사·공단: 기관명, 광역/기초, 수도권/비수도권, 시·도, 설립 지자체, 운영구분, 공기업유형, 원자료 비고',
            },
            {
                'id': 'MOIS_INV',
                'name': '행정안전부 「지방자치단체 출자출연기관 현황(2026.6.30. 기준)」 첨부 엑셀',
                'url': 'https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000062&nttId=127744',
                'as_of': '2026-06-30 기준 (2026-07-10 게시)',
                'license': '행정안전부 공개 현황 자료 — 기관 명칭·출자/출연 구분·시·도·시군구·기관유형 같은 사실 정보만 사용',
                'used_for': '출자기관·출연기관: 기관명, 출자/출연 구분, 시·도, 시군구(본청 포함), 기관유형, 원자료 비고',
            },
            {
                'id': 'PUBDATA_LGI',
                'name': '행정안전부 지방공기업평가원_지방공기업 설립현황 (공공데이터포털 15048282)',
                'url': 'https://www.data.go.kr/data/15048282/fileData.do',
                'as_of': '2026-07-14 기준 · 연간 갱신',
                'license': '이용허락범위 제한 없음 (공공데이터포털)',
                'used_for': '같은 항목(연번·구분1·구분2·지역·설립기관·운영구분·공기업유형·지방공기업명)을 제한 없이 개방한 공개 자료 — 공개 라이선스 근거',
            },
            {
                'id': 'PUBDATA_INV',
                'name': '행정안전부 지방공기업평가원_지방출자출연기관 설립현황 (공공데이터포털 15048281)',
                'url': 'https://www.data.go.kr/data/15048281/fileData.do',
                'as_of': '2026-07-14 기준 · 연간 갱신',
                'license': '이용허락범위 제한 없음 (공공데이터포털)',
                'used_for': '같은 항목(연번·구분·시도·시군구·기관명)을 제한 없이 개방한 공개 자료 — 공개 라이선스 근거',
            },
        ],
        'field_notes': {
            'sub_category': '화면의 네 갈래. 원자료 운영구분이 직영이면 지방직영기업, 간접이면 지방공사·공단. 출자출연기관 엑셀은 출자기관·출연기관 시트를 그대로 쓴다.',
            'type_detail': '지방공기업은 공기업유형(상수도·하수도·공영개발·자동차운송·도시철도공사·도시개발공사·기타공사·지방공단), 출자·출연기관은 기관유형(개발·투자, 문화·복지·관광, 장학 등) 원자료 값 그대로.',
            'region_scope': '광역/기초. 지방공기업 엑셀의 구분1을 그대로 썼고, 출자·출연기관은 시군구가 「본청」이면 광역, 시·군·구가 적혀 있으면 기초로 나눴다.',
            'metro': '수도권/비수도권. 지방공기업은 엑셀 구분2 그대로, 출자·출연기관은 원자료에 없어 시·도가 서울특별시·인천광역시·경기도인지로 나눴다.',
            'founder': '설립 지자체. 지방공기업은 설립기관 칸의 값 그대로(광역은 시·도, 기초는 시·도 + 시·군·구), 출자·출연기관은 시·도 + 시군구(본청이면 시·도만).',
            'note': '원자료 비고 칸에 적힌 값이 있을 때만 싣는다(명칭 변경·전환 설립 등).',
        },
        'limitations': [
            '지방공공기관 자료에는 매출·직원(정원)·설립일·공식 홈페이지가 없습니다. 원자료가 명칭·구분·지역·설립 지자체·유형만 공개하므로 그 밖의 칸은 만들지 않았습니다.',
            '출자·출연기관은 「지방자치단체 출자·출연 기관의 운영에 관한 법률」에 따라 지정·고시된 기관입니다. 지정이 해제되거나 새로 지정되면 목록이 바뀝니다(2026.6.30 기준).',
            '지방공기업 수에는 지자체가 직접 운영하는 상수도·하수도 사업소(직영기업)가 포함됩니다. 사무소 단위가 아니라 지방공기업 단위로 센 수입니다.',
        ],
    }

    data = {'meta': meta, 'institutions': lgi + inv}
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    print(f'지방공기업 {len(lgi)} + 출자 {sum(1 for x in inv if x["sub_category"]=="출자기관")} '
          f'+ 출연 {sum(1 for x in inv if x["sub_category"]=="출연기관")} = {len(lgi)+len(inv)}')
    print('세부 유형:', dict(subs))
    print('광역/기초:', dict(scopes), '수도권/비수도권:', dict(metros))
    print('업무 유형:', dict(types))
    print('시·도:', {s: sidos.get(s, 0) for s in SIDO17})
    if dup_ids:
        problems.append('id 중복: ' + ', '.join(dup_ids))
    if problems:
        print('대조 실패:', file=sys.stderr)
        for p in problems:
            print('  -', p, file=sys.stderr)
        sys.exit(1)
    print('총계 대조 통과 (지방공기업 총계표 · 출자출연 총괄표)')


if __name__ == '__main__':
    main()
