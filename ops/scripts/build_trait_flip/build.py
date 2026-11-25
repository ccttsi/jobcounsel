#!/usr/bin/env python3
"""trait-flip 어휘 확장 빌드 — src/*.tsv 를 읽어 trait-flip/data/traits.json 을 만든다.

  · 기존 낱말·전환 짝은 손대지 않고 그대로 둔다(손으로 쓴 문장).
  · 새 낱말끼리만 축(axis)이 겹치는 쪽으로 3~4갈래를 이어 붙인다.
  · 카드 문장은 낱말마다 적어 둔 장면·비용·보완·결과·질문 조각으로 조립한다.
"""
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
STEM_ADNOM = json.load(open(os.path.join(HERE, 'stems.json'), encoding='utf-8'))
ROOT = os.environ.get('TFROOT', '/workspace/tf500')
DATA = os.path.join(ROOT, 'trait-flip', 'data', 'traits.json')
BASE = os.path.join(HERE, 'base', 'traits.json')
SRC = os.path.join(HERE, 'src')
SEEDS = os.path.join(HERE, 'seeds.txt')

AXIS_ALIAS = {
    'check': 'detail', 'estimate': 'plan', 'chunk': 'plan', 'trust': 'honest',
    'crisis': 'risk', 'organize2': 'organize', 'time2': 'time', 'fight': 'conflict',
    'countesy': 'courtesy', 'courtsey': 'courtesy', 'principle': 'rule', 'adapt': 'flex',
    'talk': 'express', 'sincerity': 'honest', 'calm': 'emotion', 'positive': 'mood',
    'stable': 'emotion', 'selfaware': 'emotion', 'generous': 'warm', 'openmind': 'learn',
    'simple2': 'organize', 'goal': 'plan', 'fear': 'risk', 'succession': 'team',
    'shield': 'care', 'grow': 'learn', 'waitlong': 'grit', 'habit': 'grit',
    'confidential': 'boundary', 'fair': 'rule',
}
GROUP_ORDER = ['speed', 'relation', 'feeling', 'standard', 'change', 'work', 'push', 'think', 'lead']
GROUP_NAME = {
    'speed': '일의 속도·마감', 'relation': '관계·소통', 'feeling': '감정·태도',
    'standard': '기준·꼼꼼함', 'change': '변화·학습', 'work': '일 처리·생활',
    'push': '추진·실행·끈기', 'think': '사고·문제해결', 'lead': '리더십·책임',
}


def _clean_axes(raw):
    if "('" in raw:
        raw = raw.split("('", 1)[1].split("'")[0]
    return raw


def norm_axis(a):
    a = a.strip()
    return AXIS_ALIAS.get(a, a)


def parse():
    weak, strong = [], []
    for name in sorted(os.listdir(SRC)):
        if not name.endswith('.tsv'):
            continue
        for no, line in enumerate(open(os.path.join(SRC, name), encoding='utf-8'), 1):
            line = line.rstrip('\n')
            if not line.strip():
                continue
            p = line.split('|')
            where = f'{name}:{no}'
            if p[0] == 'W':
                if len(p) != 12:
                    sys.exit(f'{where}: W 칸이 12개가 아니다({len(p)})')
                _, nid, label, brief, scene, cost, fix, gain, stems, axes, hot, aliases = p
                weak.append(dict(
                    id=nid, side='weak', label=label, brief=brief, scene=scene, cost=cost,
                    fix=fix, gain=gain,
                    stems=[STEM_ADNOM.get(x, x) for x in stems.split(';') if x],
                    axes=[norm_axis(x) for x in re.sub(r'[^a-z,]', '', _clean_axes(axes)).split(',') if x],
                    hot=int(hot), aliases=[x for x in aliases.split(';') if x], where=where,
                ))
            elif p[0] == 'S':
                if len(p) != 10:
                    sys.exit(f'{where}: S 칸이 10개가 아니다({len(p)})')
                _, nid, label, brief, core, over, how, axes, hot, aliases = p
                strong.append(dict(
                    id=nid, side='strong', label=label, brief=brief, core=core, over=over,
                    how=how, axes=[norm_axis(x) for x in axes.split(',') if x],
                    hot=int(hot), aliases=[x for x in aliases.split(';') if x], where=where,
                ))
            else:
                sys.exit(f'{where}: 줄이 W·S로 시작하지 않는다')
    return weak, strong


def load_seeds(weak, strong):
    """사람이(검수로) 정해 둔 짝 — seeds.txt 의 «단점id|장점id» 줄.

    전수 검수에서 «느슨한 짝»으로 걸린 낱말은 축 표지 순위만으로는 제 장점을 못 만난다.
    검수에서 살아남은 짝은 그대로 두고, 모자란 자리만 여기 적어 둔 짝으로 채운다.
    """
    if not os.path.exists(SEEDS):
        return []
    ok_w, ok_s = {w['id'] for w in weak}, {s['id'] for s in strong}
    out, seen, skipped = [], set(), set()
    for no, line in enumerate(open(SEEDS, encoding='utf-8'), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        wid, sid = [x.strip() for x in line.split('|')]
        if wid not in ok_w or sid not in ok_s:
            # 손으로 쓴 낱말(기존 98개)은 조각(core·how)이 없어 새 카드를 만들 수 없다 — 건너뛴다.
            skipped.add(f'{wid}|{sid}')
            continue
        if (wid, sid) in seen:
            continue
        seen.add((wid, sid))
        out.append((wid, sid))
    if skipped:
        print(f'  seeds.txt: 원본에 없는 낱말 {len(skipped)}줄은 건너뛴다 {sorted(skipped)[:4]}')
    return out


def make_pairs(weak, strong):
    """축이 겹치는 장점으로 3~4갈래. 착수 순서는 후보가 적은 낱말부터."""
    by_axis = defaultdict(list)
    for s in strong:
        for a in set(s['axes']):
            by_axis[a].append(s)
    deg_s, deg_w = defaultdict(int), defaultdict(int)
    freq = defaultdict(int)
    for st in strong:
        for a in set(st['axes']):
            freq[a] += 1
    pairs, seen = [], set()

    def shared(w, s):
        return len(set(w['axes']) & set(s['axes']))

    def narrow(w, s):
        return sum(1.0 / freq[a] for a in set(w['axes']) & set(s['axes']))

    def spec(w, s):
        return sum(1 for a in set(w['axes']) & set(s['axes']) if freq[a] <= 15)

    def primary_ok(w, s):
        sh = {a for a in set(w['axes']) & set(s['axes']) if freq[a] <= 15}
        return bool(sh)

    def pick(w, k, primary_only=False):
        cands = []
        for s in strong:
            if (w['id'], s['id']) in seen:
                continue
            n = shared(w, s)
            if not n:
                continue
            if primary_only and not primary_ok(w, s):
                continue
            rank = spec(w, s) * 2 + round(narrow(w, s), 4)
            cands.append(((-rank, -n, deg_s[s['id']], s['id']), s))
        cands.sort(key=lambda x: x[0])
        out = []
        for _, s in cands:
            if deg_s[s['id']] >= 4 or deg_w[w['id']] >= k:
                continue
            out.append(s)
        return out

    by_id_w = {w['id']: w for w in weak}
    by_id_s = {s['id']: s for s in strong}
    for wid, sid in load_seeds(weak, strong):
        if (wid, sid) in seen:
            continue
        pairs.append((by_id_w[wid], by_id_s[sid]))
        seen.add((wid, sid))
        deg_s[sid] += 1
        deg_w[wid] += 1

    order = sorted(weak, key=lambda w: (sum(1 for s in strong if shared(w, s)), w['id']))
    for w in order:
        for s in pick(w, 3):
            if deg_w[w['id']] >= 3:
                break
            pairs.append((w, s))
            seen.add((w['id'], s['id']))
            deg_s[s['id']] += 1
            deg_w[w['id']] += 1
    # 네 번째 갈래는 축이 꼭 맞는 장점만 더한다(어설픈 짝을 늘리지 않는다).
    for w in order:
        if deg_w[w['id']] >= 4:
            continue
        for s in pick(w, 4, primary_only=True):
            if deg_w[w['id']] >= 4:
                break
            pairs.append((w, s))
            seen.add((w['id'], s['id']))
            deg_s[s['id']] += 1
            deg_w[w['id']] += 1
    # 장점이 3갈래에 못 미친 낱말을 메운다(같은 축 → 같은 묶음 → 빈자리 순).
    def add(w, s):
        pairs.append((w, s))
        seen.add((w['id'], s['id']))
        deg_s[s['id']] += 1
        deg_w[w['id']] += 1

    for s in strong:
        if deg_s[s['id']] >= 3:
            continue
        rounds = [
            [w for w in weak if shared(w, s) and (w['id'], s['id']) not in seen and deg_w[w['id']] < 4],
            [w for w in weak if shared(w, s) and (w['id'], s['id']) not in seen and deg_w[w['id']] < 4],
            [w for w in weak if w['g'] == s['g'] and (w['id'], s['id']) not in seen and deg_w[w['id']] < 4],
            [w for w in weak if (w['id'], s['id']) not in seen and deg_w[w['id']] < 4],
            [w for w in weak if shared(w, s) and (w['id'], s['id']) not in seen and deg_w[w['id']] < 5],
            [w for w in weak if (w['id'], s['id']) not in seen and deg_w[w['id']] < 5],
        ]
        for cands in rounds:
            cands.sort(key=lambda w: (deg_w[w['id']], -shared(w, s), w['id']))
            for w in cands:
                if deg_s[s['id']] >= 3:
                    break
                if deg_w[w['id']] >= 5 or deg_s[s['id']] >= 4:
                    continue
                add(w, s)
            if deg_s[s['id']] >= 3:
                break
    return pairs, deg_w, deg_s


def _dot(x):
    return str(x).rstrip().rstrip('.')


def make_text(w, s, idx):
    """카드 한 장의 문장을 조립한다.

    네 칸(머리·논리·사례·질문)과 방어 3단이 서로 같은 말을 겹쳐 말하지 않게 나눠 맡긴다:
    위험(risk)은 «무엇이 잘못되는지», 방어 1단은 «그 말을 들은 자리», 2단은 «지금 바꾼 것»,
    3단은 «그래서 달라진 것». (2026-11-25 전수 검수에서 같은 비용 문장이 카드 안에 세 번
    되풀이되던 것과, 낱말마다 적어 둔 행동 꼴이 모자랄 때 «…소리를 듣지만 …하는 사람»으로
    같은 말을 두 번 쓰던 것을 고쳤다.)
    """
    sl, wl = s['label'], w['label']
    h = idx
    scene = w['scene']
    # «연속 야근 뒤»처럼 때를 가리키는 장면은 «에서»가 아니라 «에»로 잇는다.
    at = scene + ('에' if scene.endswith(('뒤', '후')) else '에서')
    cost, over = _dot(w['cost']), _dot(s['over'])
    gain = w['gain']            # 사례·방어 3단은 마침표까지 그대로 쓴다
    core, how = s['core'], s['how']
    st = w['stems']
    if idx < len(st):
        wk = st[idx] + ' 사람'
    else:
        # 행동 꼴이 모자랄 때 — 낱말을 그대로 되풀이하지 않고 «어디서 들었는지»로 바꾼다.
        wk = [
            f'「{wl}」는 말을 자주 듣는 사람',
            f'{at} 「{wl}」는 말을 들은 사람',
            f'「{wl}」는 소리를 자주 듣는 사람',
        ][(idx - len(st)) % 3]
    logic = [
        f'「{wl}」라는 말은 약점처럼 들리지만, 실제로는 {core} 그 점이 「{sl}」라는 강점으로 읽힙니다.',
        f'{cost}. 다만 {how} 습관이 붙으면 「{sl}」라는 강점으로 바뀝니다.',
        f'겉으로는 「{wl}」 쪽으로 보입니다. 실제로는 {core} 그래서 {at} 「{sl}」라는 강점이 드러납니다.',
        f'「{wl}」라는 말은 그냥 약점으로 들립니다. 그런데 {how} 방식으로 쓰이면 「{sl}」라는 강점이 됩니다.',
        f'{cost}. 그 행동이 「{sl}」라는 강점으로 읽히는 이유는 {how} 방식으로 쓰이기 때문입니다.',
    ][h]
    ex = [
        f'{at} {how} 방식으로 일해 {gain}',
        f'{at} {w["fix"]} 습관을 들인 뒤 {gain}',
        f'{at} {how} 방식을 택해 {gain}',
    ][h % 3]
    warn = [
        f'다만 {over}. 그래서 「{sl}」라는 강점을 말할 때는 확인한 근거를 한 줄 붙여야 합니다.',
        f'{over}. 상대가 그렇게 느끼지 않도록 「{wl}」라는 말 뒤에 이유를 한 줄 붙이면 안전합니다.',
        f'{over}. 「{sl}」라는 강점으로 풀어 말할 때는 {at} 무엇이 달라졌는지를 한 문장으로 붙이면 좋습니다.',
    ][h % 3]
    guard = [
        f'「{wl}」는 말을 들은 적이 있습니다.',
        f'지금은 {w["fix"]} 방식으로 바꿔 두었습니다.',
        f'그 결과 {gain}',
    ]
    q = [
        f'「{wl}」라는 말을 들어 본 적이 있습니까?',
        f'「{wl}」는 지적을 받은 적이 있습니까?',
        f'「{wl}」라는 소리를 들은 적이 있습니까?',
        f'「{wl}」는 말로 손해를 본 적이 있습니까?',
    ][h % 4]
    return dict(w=w['id'], s=s['id'], wk=wk, logic=logic, ex=ex, warn=warn,
                risk=w['cost'], q=q, guard=guard)


def main():
    doc = json.load(open(DATA, encoding='utf-8'))
    weak, strong = parse()
    # 다시 돌려도 같은 결과가 나오게, 이 원본(src)에서 만든 낱말·짝은 먼저 걷어 낸다.
    made = {n['id'] for n in weak + strong}
    old_nodes = {k: v for k, v in doc['nodes'].items() if k not in made}
    old_pairs = [p for p in doc['pairs'] if p['w'] not in made and p['s'] not in made]

    ids = set(old_nodes)
    labels = {n['label'] for n in old_nodes.values()}
    for n in weak + strong:
        if n['id'] in ids:
            sys.exit(f'{n["where"]}: id 중복 {n["id"]}')
        if n['label'] in labels:
            sys.exit(f'{n["where"]}: 낱말 중복 {n["label"]}')
        ids.add(n['id'])
        labels.add(n['label'])
        n['g'] = n.pop('g', None) or GROUP_OF[n['id']]

    # 축이 겹치는 상대가 없는 낱말을 알린다.
    for w in weak:
        if not any(set(w['axes']) & set(s['axes']) for s in strong):
            sys.exit(f'{w["where"]}: 축이 겹치는 장점이 하나도 없다 {w["axes"]}')

    pairs, _, _ = make_pairs(weak, strong)

    nodes = dict(old_nodes)
    for n in weak + strong:
        n['aliases'] = [a for a in n['aliases'] if a != n['label']]
        nodes[n['id']] = {k: n[k] for k in ('id', 'side', 'g', 'label', 'brief', 'aliases', 'hot')}

    new_pairs = []
    for w, s in pairs:
        idx = sum(1 for a, b in pairs if a['id'] == w['id'] and b['id'] < s['id'])
        new_pairs.append(make_text(w, s, idx))

    # 새 낱말의 갈래 수를 센다(3~5 확인).
    from collections import Counter
    dw, ds = Counter(), Counter()
    for p in new_pairs:
        dw[p['w']] += 1
        ds[p['s']] += 1
    bad = [(k, v) for k, v in list(dw.items()) + list(ds.items()) if not 3 <= v <= 5 if k in {n['id'] for n in weak + strong}]
    if bad and not os.environ.get('TF_LOOSE'):
        sys.exit(f'갈래 수가 3~5 밖: {bad[:8]}')

    doc['nodes'] = nodes
    doc['pairs'] = old_pairs + new_pairs
    doc['groups'] = [{'id': g, 'name': GROUP_NAME[g]} for g in GROUP_ORDER if any(n['g'] == g for n in nodes.values())]
    doc['built'] = '2026-11-24'
    json.dump(doc, open(DATA, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'낱말 {len(nodes)} (단점 {sum(1 for n in nodes.values() if n["side"]=="weak")} · 장점 {sum(1 for n in nodes.values() if n["side"]=="strong")})'
          f' · 전환 짝 {len(doc["pairs"])} · 카드 {len(doc["pairs"])*2}')
    print(f'새로 이은 짝 {len(new_pairs)} · 비슷한 말 {sum(len(n["aliases"]) for n in nodes.values())}')


GROUP_OF = {}


def load_groups():
    """src 파일 이름 → 묶음 id. 파일 하나가 한 묶음이다."""
    for name in sorted(os.listdir(SRC)):
        if name.endswith('.tsv'):
            for line in open(os.path.join(SRC, name), encoding='utf-8'):
                p = line.split('|')
                if p[0] in ('W', 'S'):
                    GROUP_OF[p[1]] = name[:-4]


if __name__ == '__main__':
    load_groups()
    main()
