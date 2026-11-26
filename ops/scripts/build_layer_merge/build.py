#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""경험×공고 레이어(/layer-merge/) 자료 만들기.

  python3 ops/scripts/build_layer_merge/build.py        # layer-merge/data/lm-core.json 다시 만들기

원천
  · surgery/data/lexicon.json       — 경험 낱말 → 역량·행동·수치 (피클 담당, 읽기만)
  · taxonomy/data/insights/ncs/*.json — NCS 대분류별 대표 KSA 항목(한국산업인력공단, 공공누리 제1유형)
  · ops/scripts/build_layer_merge/src.py — 사람이 쓴 역량·직무군·요구 해석틀

원칙
  · 수치·조문을 지어내지 않는다. 여기서 만드는 것은 «해석틀»과 «원천에서 읽은 항목»뿐이다.
  · 화면은 이 파일의 낱말 목록을 표로 펼치지 않는다(lexicon.json 의 exposure 규칙을 따른다).
"""
import json
import os
import re
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
import src  # noqa: E402

LEXICON = os.path.join(ROOT, 'surgery', 'data', 'lexicon.json')
TAXONOMY = os.path.join(ROOT, 'taxonomy', 'data', 'taxonomy.json')
KSA_DIR = os.path.join(ROOT, 'taxonomy', 'data', 'ksa')
OUT = os.path.join(ROOT, 'layer-merge', 'data', 'lm-core.json')

MAX_REF = 2          # 능력단위요소마다 KSA 항목을 몇 개까지 싣나
MIN_ITEMS = 2        # 요구는 최소 몇 개를 보여 주나(공고에서 못 찾았을 때 대신 채우는 수)

_SHARD = {}


def load(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def strip_no(s):
    """NCS 원문의 앞 번호("1.")만 떼고 글자는 그대로 둔다."""
    return re.sub(r'^\d+\.\s*', '', str(s)).strip()


def ncs_unit(code, names):
    """NCS 능력단위 코드 → {code, name, level, elements:[{f,k,s,a}]} — 원천에서 이름과 KSA를 읽는다."""
    unit = names.get(code)
    if not unit:
        raise SystemExit(f'NCS 능력단위 {code}가 taxonomy.json에 없다')
    major = code[:2]
    if major not in _SHARD:
        path = os.path.join(KSA_DIR, major + '.json')
        if not os.path.exists(path):
            raise SystemExit(f'NCS KSA 샤드가 없다: {path}')
        _SHARD[major] = load(path)
    row = (_SHARD[major].get('units') or {}).get(code)
    if not row:
        raise SystemExit(f'NCS 능력단위 {code}의 KSA가 원천에 없다')
    elements = []
    for el in row['e']:
        elements.append({
            'f': strip_no(el['f']),
            'k': [strip_no(x) for x in (el.get('k') or [])[:MAX_REF]],
            's': [strip_no(x) for x in (el.get('s') or [])[:MAX_REF]],
            'a': [strip_no(x) for x in (el.get('a') or [])[:MAX_REF]],
        })
    return {'code': code, 'name': unit['name'], 'level': unit.get('level'), 'elements': elements}


def experiences(lex):
    """lexicon 의 45개 항목을 화면이 쓸 만큼만 추린다(키워드 목록은 화면에 펼치지 않는다)."""
    out, seen = [], set()
    for entry in lex['entries']:
        eid = entry['id']
        if eid in seen:
            continue
        seen.add(eid)
        caps = src.EXP_CAPS.get(eid)
        if not caps:
            raise SystemExit(f'경험 {eid}의 역량 연결(EXP_CAPS)이 없다')
        for cap in caps:
            if cap not in src.CAPS:
                raise SystemExit(f'경험 {eid}가 모르는 역량 {cap}을 가리킨다')
        out.append({
            'id': eid,
            'label': entry['context'],
            'cat': entry['category'],
            'kw': entry['trigger_keywords'],
            'comp': entry['core_competencies'],
            'verb': entry['action_verbs'],
            'metric': entry['metric_prompts'],
            'caps': caps,
        })
    extra = [k for k in src.EXP_CAPS if k not in seen]
    if extra:
        raise SystemExit(f'lexicon 에 없는 경험 id 가 EXP_CAPS 에 있다: {extra}')
    return out


def cat_fallback(lex):
    out = {}
    for cat in lex['categories']:
        code = cat['code']
        caps = src.CAT_CAPS.get(code)
        if not caps:
            raise SystemExit(f'범주 {code}의 역량 연결(CAT_CAPS)이 없다')
        fb = cat.get('fallback') or {}
        out[code] = {
            'label': fb.get('context') or '맡은 일',
            'comp': fb.get('core_competencies') or [],
            'verb': fb.get('action_verbs') or [],
            'metric': fb.get('metric_prompts') or [],
            'hints': cat.get('category_hints') or [],
            'caps': caps,
        }
    return out


def reqs():
    out, used = [], {}
    for fam in src.FAMILIES:
        rows = src.REQS.get(fam['id'])
        if not rows:
            raise SystemExit(f'직무군 {fam["id"]}의 요구가 비어 있다')
        for i, row in enumerate(rows):
            rid = f'{fam["id"]}{i + 1:02d}'
            if row['cap'] not in src.CAPS:
                raise SystemExit(f'{rid}가 모르는 역량 {row["cap"]}을 가리킨다')
            item = dict(row)
            item['id'] = rid
            item['fam'] = fam['id']
            out.append(item)
            for kw in row['kw']:
                used.setdefault(kw.lower().replace(' ', ''), []).append((rid, fam['id']))
    # 한 직무군 안에서 같은 말이 두 요구에 걸리면 공고 한 줄이 두 요구로 갈라진다 — 그것만 막는다.
    for kw, pairs in used.items():
        for fam_id in {f for _rid, f in pairs}:
            same = sorted({rid for rid, f in pairs if f == fam_id})
            if len(same) > 1:
                raise SystemExit(f'한 직무군 안에서 요구 낱말이 겹친다: 「{kw}」 {same}')
    return out


def generic():
    out = []
    for i, row in enumerate(src.GENERIC_REQS):
        if row['cap'] not in src.CAPS:
            raise SystemExit(f'공통 요구 {row["label"]}가 모르는 역량 {row["cap"]}을 가리킨다')
        item = dict(row)
        item['id'] = f'any{i + 1:02d}'
        item['fam'] = 'any'
        out.append(item)
    return out


def main():
    lex = load(LEXICON)
    units = {u['code']: u for u in load(TAXONOMY)['ncs']['units']}
    exps = experiences(lex)
    all_reqs = reqs()
    gen = generic()
    fams = []
    for fam in src.FAMILIES:
        fams.append({
            'id': fam['id'],
            'name': fam['name'],
            'alias': fam['alias'],
            'unit': ncs_unit(fam['major'], units),
            'reqs': [r['id'] for r in all_reqs if r['fam'] == fam['id']],
        })
    caps = {k: {'name': v['name'], 'verb': v['verb'], 'why': v['why'], 'act': v['act']} for k, v in src.CAPS.items()}

    doc = {
        'meta': {
            'schema_version': '1.0.0',
            'sector': 'layer-merge',
            'title': '경험×공고 레이어',
            'built': date.today().isoformat(),
            'layers': {'l1': '경험·경력', 'l2': '직무·공고', 'l3': 'KSA 솔루션'},
            'sources': [
                {'what': '경험 낱말 → 역량·행동·수치', 'path': 'surgery/data/lexicon.json', 'license': '자료실 자체 작성'},
                {'what': 'NCS 능력단위 이름·능력단위요소·KSA 원문', 'path': 'taxonomy/data/taxonomy.json·ksa/',
                 'license': '한국산업인력공단 국가직무능력표준 정보_GW(15157547) · 이용허락범위 제한 없음',
                 'base_date': '2026-09-08'},
                {'what': '역량·직무군·요구 해석틀', 'path': 'ops/scripts/build_layer_merge/src.py', 'license': '자료실 자체 작성'},
            ],
            'notice': '요구를 K·S·A로 나눈 문장과 연결 설명은 자료실이 새로 쓴 해석틀입니다. 특정 회사 공고문이나 합격 자소서를 옮기지 않았습니다.',
            'min_reqs': MIN_ITEMS,
        },
        'caps': caps,
        'experiences': exps,
        'catFallback': cat_fallback(lex),
        'genericCaps': src.GENERIC_CAPS,
        'families': fams,
        'reqs': all_reqs,
        'genericReqs': gen,
        'samples': src.SAMPLES,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':'), sort_keys=False)
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(text + '\n')

    print(f'layer-merge/data/lm-core.json — {len(text.encode("utf-8")):,}B')
    print(f'  경험 {len(exps)} · 직무군 {len(fams)} · 요구 {len(all_reqs)}(공통 {len(gen)}) · 역량 {len(caps)} · 예시 {len(src.SAMPLES)}')


if __name__ == '__main__':
    main()
