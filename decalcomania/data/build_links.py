#!/usr/bin/env python3
"""decalcomania/data/links.json 을 만든다.

커리어데칼코마니의 학과·직업 상세에서 다른 섹터로 넘어갈 때,
그 섹터에서 실제로 결과가 나오는 검색어만 쓰도록 미리 확인해 둔다.

원자료: decalcomania/data/(majors·jobs·edges), univ 학과(decalcomania majors 의 departments),
        grad/data/grad_departments.json, taxonomy/data/taxonomy.json,
        company/data/companies.json, emerging/data/emerging.json

쓰임: python3 decalcomania/data/build_links.py  (저장소 뿌리에서 실행)
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
    return re.sub(r'[\s·・ㆍ\-_(),./\[\]{}]+', '', str(s or '').lower())


def cnorm(s):
    s = str(s or '').lower()
    s = re.sub(r'\(\s*(주|유|재|사|합|사단|재단|학)\s*\)|㈜|주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인', '', s)
    s = re.sub(r'[\s\-_.,·ㆍ()\[\]{}&/\'"’`~!@#$%^*+=:;<>?|\\]+', '', s)
    lat = {'a': '에이', 'b': '비', 'c': '씨', 'd': '디', 'e': '이', 'f': '에프', 'g': '지', 'h': '에이치',
           'i': '아이', 'j': '제이', 'k': '케이', 'l': '엘', 'm': '엠', 'n': '엔', 'o': '오', 'p': '피',
           'q': '큐', 'r': '알', 's': '에스', 't': '티', 'u': '유', 'v': '브이', 'w': '더블유', 'x': '엑스',
           'y': '와이', 'z': '지'}
    return re.sub(r'[a-z]', lambda m: lat[m.group(0)], s)


U = load('decalcomania/data/majors.json')
UC = U['department_columns']
UNIV_DEPTS = [norm(r[UC.index('department_name')]) for r in U['departments']
              if not r[UC.index('closed_in_2024_disclosure')]]
GRAD_DEPTS = [norm(r[1]) for r in load('grad/data/grad_departments.json')['departments']]

COMP_IDX = []
for c in load('company/data/companies.json')['companies']:
    COMP_IDX.append((c, cnorm(c.get('search_name') or c.get('name')),
                     cnorm((c.get('group') or '') + '｜' + (c.get('industry') or ''))))

TAX = load('taxonomy/data/taxonomy.json')
TAX_NAMES = set()
for sysname in ('ncs', 'keco', 'ksco'):
    for level, rows in TAX[sysname]['levels'].items():
        for x in rows:
            TAX_NAMES.add(norm(x['name']))
for x in TAX['jobs']:
    TAX_NAMES.add(norm(x['name']))

DJ = load('decalcomania/data/jobs.json')['jobs']
JOBS = {j['id']: j for j in DJ}
E = load('emerging/data/emerging.json')
EMG_JOBS = {norm(j['name']): j['name'] for j in E['jobs']}


def n_hits(lst, q):
    n = norm(q)
    return sum(1 for d in lst if n in d) if n else 0


def tax_of(job):
    """직업 → 직무 분류 검색어. 직업명이 없으면 그 직업의 KECO 세분류 이름."""
    for q in (job.get('name'), (job.get('keco') or {}).get('small_name')):
        n = norm(q)
        if n and any(n in t for t in TAX_NAMES):
            return {'q': q, 'n': sum(1 for t in TAX_NAMES if n in t)}
    return None


def company_of(names):
    for label in names or []:
        q = re.sub(r'\([^)]*\)', '', label).strip()
        if not q or '·' in q or 'ㆍ' in q:
            continue
        nq = cnorm(q)
        if not nq:
            continue
        if len(nq) <= 4 and re.search(r'[a-z]', q.lower()):
            found = [c for c, nm, ex in COMP_IDX if nm == nq]
        else:
            found = [c for c, nm, ex in COMP_IDX if nq in nm or nq in ex]
        if found:
            found.sort(key=lambda c: (0 if cnorm(c.get('search_name') or c['name']) == nq else 1, c['name']))
            return {'q': q, 'n': len(found), 'name': found[0].get('name')}
    return None


def emerging_of(job_names):
    for name in job_names:
        hit = EMG_JOBS.get(norm(name))
        if hit:
            return {'q': hit, 'n': 1}
    return None


def name_cands(name):
    """학과 이름과, 꼬리말을 바꿔 본 이름들. 「간호과 → 간호학」처럼 학과 표기가 다른 경우를 잇는다."""
    base = re.sub(r'(학과|학부|전공)$', '', name)
    out = [name, base]
    if name.endswith('과') and not name.endswith('학과'):
        out.insert(1, name[:-1] + '학')
    out.append(re.sub(r'과$', '', name))
    seen, res = set(), []
    for q in out:
        if q and q not in seen:
            seen.add(q)
            res.append(q)
    return res


def main():
    edges = load('decalcomania/data/edges.json')['edges']
    rel_rank = {'면허필수': 0, '전공우대': 1, '관련전공': 2, '전공무관': 3}
    links_from = {}
    for e in edges:
        if e['to'] in JOBS:
            links_from.setdefault(e['from'], []).append(e)

    majors_out = {}
    for m in U['majors']:
        mid = m['id']
        base = re.sub(r'(학과|학부|전공|과)$', '', m['name'])
        # 이름 그대로가 5곳 이상과 걸리면 그대로, 아니면 꼬리말을 바꿔 본 이름 중 처음 걸리는 것.
        cands = [(q, n_hits(UNIV_DEPTS, q)) for q in name_cands(m['name'])]
        uq, un = cands[0]
        if un < 5:
            good = [c for c in cands if c[1] >= 5]
            if good:
                uq, un = good[0]
        cands = [(q, n_hits(GRAD_DEPTS, q)) for q in name_cands(m['name'])]
        gq, gn = cands[0]
        if gn < 5:
            good = [c for c in cands if c[1] >= 5]
            if good:
                gq, gn = good[0]
        if not gn:
            gq = None
        es = sorted(links_from.get(mid, []), key=lambda e: (rel_rank.get(e['relation'], 9),
                                                            JOBS[e['to']]['name']))
        names = [JOBS[e['to']]['name'] for e in es]
        top = JOBS[es[0]['to']] if es else None
        majors_out[mid] = {
            'uq': uq or m['name'], 'un': un or 0,
            'gq': gq, 'gn': gn or 0,
            'tax': tax_of(top) if top else None,
            'co': company_of(top.get('example_companies')) if top else None,
            'emg': emerging_of(names[:40]),
        }

    jobs_out = {}
    for j in DJ:
        jobs_out[j['id']] = {
            'tax': tax_of(j),
            'co': company_of(j.get('example_companies')),
            'emg': emerging_of([j['name']]),
        }

    out = {
        'note': '커리어데칼코마니에서 다른 섹터로 넘어갈 때 쓰는 확인된 검색어. build_links.py가 만든다(직접 고치지 않는다).',
        'built_at': datetime.date.today().isoformat(),
        'majors': majors_out,
        'jobs': jobs_out,
    }
    path = os.path.join(ROOT, 'decalcomania/data/links.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print('학과', len(majors_out), '직업', len(jobs_out), '→', path)
    print('학과: 대학원 링크', sum(1 for v in majors_out.values() if v['gq']),
          '직무분류', sum(1 for v in majors_out.values() if v['tax']),
          '기업', sum(1 for v in majors_out.values() if v['co']),
          '이머징', sum(1 for v in majors_out.values() if v['emg']))
    print('직업: 직무분류', sum(1 for v in jobs_out.values() if v['tax']),
          '기업', sum(1 for v in jobs_out.values() if v['co']),
          '이머징', sum(1 for v in jobs_out.values() if v['emg']))


if __name__ == '__main__':
    main()
