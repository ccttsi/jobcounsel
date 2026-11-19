#!/usr/bin/env python3
"""emerging/data/links.json 을 만든다.

이머징 지면의 직무 칩·기업 칩·전공 칸이 다른 섹터로 넘어갈 때,
그 섹터에서 실제로 결과가 나오는 검색어만 쓰도록 미리 확인해 둔다.
(빈 검색으로 떨어지는 링크를 만들지 않는다.)

원자료: decalcomania/data/majors.json(대학 학과), grad/data/grad_departments.json(대학원),
        company/data/companies.json(기업 명함첩), taxonomy/data/taxonomy.json(직무 분류),
        decalcomania/data/jobs.json(커리어데칼코마니 직업)

쓰임: python3 emerging/data/build_links.py  (저장소 뿌리에서 실행)
"""
import json
import os
import re
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return json.load(f)


def norm(s):
    """검색 화면(대학·대학원·분류)과 같은 규칙: 공백·가운뎃점·괄호·기호를 뺀 소문자."""
    return re.sub(r'[\s·・ㆍ\-_(),./\[\]{}]+', '', str(s or '').lower())


def cnorm(s):
    """기업 명함첩(app.js norm)과 같은 규칙 + 로마자 한글 표기."""
    s = str(s or '').lower()
    s = re.sub(r'\(\s*(주|유|재|사|합|사단|재단|학)\s*\)|㈜|주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인', '', s)
    s = re.sub(r'[\s\-_.,·ㆍ()\[\]{}&/\'"’`~!@#$%^*+=:;<>?|\\]+', '', s)
    lat = {'a': '에이', 'b': '비', 'c': '씨', 'd': '디', 'e': '이', 'f': '에프', 'g': '지', 'h': '에이치',
           'i': '아이', 'j': '제이', 'k': '케이', 'l': '엘', 'm': '엠', 'n': '엔', 'o': '오', 'p': '피',
           'q': '큐', 'r': '알', 's': '에스', 't': '티', 'u': '유', 'v': '브이', 'w': '더블유', 'x': '엑스',
           'y': '와이', 'z': '지'}
    return re.sub(r'[a-z]', lambda m: lat[m.group(0)], s)


# ── 대학 학과 ──────────────────────────────────────────────
UNIV = load('decalcomania/data/majors.json')
UC = UNIV['department_columns']
ui_name = UC.index('department_name')
ui_closed = UC.index('closed_in_2024_disclosure')
UNIV_DEPTS = [norm(r[ui_name]) for r in UNIV['departments'] if not r[ui_closed]]

# ── 대학원 ────────────────────────────────────────────────
GRAD = load('grad/data/grad_departments.json')
GRAD_DEPTS = [norm(r[1]) for r in GRAD['departments']]

# ── 기업 명함첩 ────────────────────────────────────────────
COMP = load('company/data/companies.json')['companies']
COMP_IDX = []
for c in COMP:
    nm = cnorm(c.get('search_name') or c.get('name'))
    extra = cnorm((c.get('group') or '') + '｜' + (c.get('industry') or ''))
    COMP_IDX.append((c, nm, extra))

# ── 직무 분류 ──────────────────────────────────────────────
TAX = load('taxonomy/data/taxonomy.json')
TAX_NAMES = set()
for sysname in ('ncs', 'keco', 'ksco'):
    for level, rows in TAX[sysname]['levels'].items():
        for x in rows:
            TAX_NAMES.add(norm(x['name']))
for x in TAX['jobs']:
    TAX_NAMES.add(norm(x['name']))

# ── 커리어데칼코마니 직업 ──────────────────────────────────
DECAL_JOBS = load('decalcomania/data/jobs.json')['jobs']
DECAL_BY_NORM = {}
for j in DECAL_JOBS:
    DECAL_BY_NORM[norm(j['name'])] = j

# 전공 이름이 그대로는 대상 섹터에 없을 때 쓸 낱말 (사실 확인 후 고른 것)
STUDY_ALIAS = {
    '농업·산림학': ('농업', '농업'),
    '산업교육학': ('산업교육', '교육학'),
    '식물병리학': ('식물', '식물'),
    '지리정보공학': ('공간정보', '공간정보'),
    '직업상담학': (None, '직업상담'),
    '보건통계학': (None, '보건통계'),
    '인사조직': (None, '인사조직'),
}


def hits(count_list, q):
    n = norm(q)
    return sum(1 for d in count_list if n in d) if n else 0


def study_link(term):
    """(대학 검색어, 대학 건수, 대학원 검색어, 대학원 건수). 결과가 없으면 None."""
    cands = [term]
    if term in STUDY_ALIAS:
        cands = [term] + list(STUDY_ALIAS[term])
    uq = un = None
    for c in cands:
        if c is None:
            continue
        n = hits(UNIV_DEPTS, c)
        if n:
            uq, un = c, n
            break
    gq = gn = None
    for c in cands:
        if c is None:
            continue
        n = hits(GRAD_DEPTS, c)
        if n:
            gq, gn = c, n
            break
    if not uq and not gq:
        return None
    return {'uq': uq, 'un': un or 0, 'gq': gq, 'gn': gn or 0}


def company_link(label):
    """기업 명함첩 검색어와 건수. 괄호 설명은 떼고 찾는다."""
    q = re.sub(r'\([^)]*\)', '', label).strip()
    if not q or '·' in q:          # 여러 회사를 한 칸에 적은 이름은 이름 하나로 찾히지 않는다
        return None
    nq = cnorm(q)
    if not nq:
        return None
    # 두세 글자 로마자 약칭은 엉뚱한 이름 속에서 걸린다(EY → 엘이이와이). 이름이 정확히 같을 때만.
    if len(nq) <= 4 and re.search(r'[a-z]', q.lower()):
        found = [c for c, nm, ex in COMP_IDX if nm == nq]
    else:
        found = [c for c, nm, ex in COMP_IDX if nq in nm or nq in ex]
    if not found:
        return None
    found.sort(key=lambda c: (0 if cnorm(c.get('search_name') or c['name']) == nq else 1, c['name']))
    best = found[0]
    return {'q': q, 'n': len(found),
            'name': best.get('name'),
            'id': best.get('id'),
            'exact': cnorm(best.get('search_name') or best.get('name')) == nq}


# 직무 분류에서 찾을 낱말: 지면의 직무가 실제로 하는 일의 분류 이름(taxonomy.json에 있는 것만).
# 직무명이 그대로 없거나 낱말이 너무 넓게 잡히는 경우에 먼저 쓴다.
TAX_HINT = {
    'j-nurse': '간호사',
    'j-data': '빅데이터분석',
    'j-dh-coord': '의료정보관리',
    'j-ai-gov': '인공지능',
    'j-pd': '방송콘텐츠제작',
    'j-acct': '회계',
    'j-content-ai': '문화콘텐츠',
    'j-reskill': '인적자원',
    'j-agri': '농촌지도사',
    'j-smartfarm': '스마트팜',
    'j-elec': '전기·전자',
    'j-eo-analyst': '위성',
    'j-proc': '화학공정',
    'j-qa': '품질관리',
    'j-synbio': '바이오',
    'j-cdm': '임상시험',
    'j-robot-ai': '로봇',
    'j-power-contract': '전력',
    'j-grid-plan': '송배전',
}

TAX_STOP = ('담당자', '전문가', '엔지니어', '분석가', '설계자', '운영자', '관리사', '관리자',
            '평가자', '코디네이터', '디자이너', '기획자', '컨설턴트', '연구원', '기술자', '종사자')


def tax_link(job_names):
    """직무 분류에서 결과가 나오는 검색어.

    직무명 전체 → 영어명 → 이름을 낱말로 나눈 것(긴 낱말부터).
    낱말은 꼬리말(…담당자·…엔지니어)을 떼고, 두 글자 이상만 쓴다.
    """
    cands = []
    for q in job_names:
        if q:
            cands.append(q)
            for part in re.split(r'[\s·・ㆍ(),/]+', q):
                p = part.strip()
                for suf in TAX_STOP:
                    if p.endswith(suf) and len(p) > len(suf) + 1:
                        p = p[:-len(suf)]
                        break
                if len(p) >= 2:
                    cands.append(p)
    seen = set()
    ordered = []
    for c in cands:
        if c not in seen:
            seen.add(c)
            ordered.append(c)
    exact = [c for c in ordered if norm(c) in TAX_NAMES]
    if exact:
        q = exact[0]
        return {'q': q, 'n': sum(1 for t in TAX_NAMES if norm(q) in t)}
    fuzzy = sorted((c for c in ordered if len(norm(c)) >= 2 and any(norm(c) in t for t in TAX_NAMES)),
                   key=lambda c: -len(norm(c)))
    if fuzzy:
        q = fuzzy[0]
        return {'q': q, 'n': sum(1 for t in TAX_NAMES if norm(q) in t)}
    return None


def main():
    E = load('emerging/data/emerging.json')
    studies = {}
    for j in E['jobs']:
        for s in j.get('study') or []:
            if s not in studies:
                link = study_link(s)
                if link:
                    studies[s] = link
    companies = {}
    labels = set()
    for j in E['jobs']:
        co = j.get('companies') or {}
        labels.update((co.get('domestic') or []) + (co.get('global') or []) + (co.get('dom') or []) + (co.get('glob') or []))
    for d in E['archive_index']:
        for it in d.get('items') or []:
            p = it.get('players') or {}
            labels.update((p.get('domestic') or []) + (p.get('glob') or []))
    for label in labels:
        link = company_link(label)
        if link:
            companies[label] = link
            plain = re.sub(r'\s*\([^)]*\)\s*$', '', label).strip()
            if plain and plain != label and plain not in companies:
                companies[plain] = link      # 같은 곳을 가리키는 다른 표기(한국지능정보사회진흥원 ↔ …(NIA))
    jobs = {}
    for j in E['jobs']:
        hint = TAX_HINT.get(j['id'])
        hint_link = tax_link([hint]) if hint else None
        jobs[j['id']] = {
            'tax': hint_link or tax_link([j.get('name')]),
            'decal': (DECAL_BY_NORM.get(norm(j.get('name'))) or {}).get('id')
        }
    out = {
        'note': '이머징 지면에서 다른 섹터로 넘어갈 때 쓰는 확인된 검색어. build_links.py가 만든다(직접 고치지 않는다).',
        'built_at': datetime.date.today().isoformat(),
        'studies': studies,
        'companies': companies,
        'jobs': jobs,
    }
    path = os.path.join(ROOT, 'emerging/data/links.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print('전공', len(studies), '기업', len(companies), '직무', len(jobs), '→', path)


if __name__ == '__main__':
    main()
