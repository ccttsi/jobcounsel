#!/usr/bin/env python3
"""taxonomy/ 인사이트 인덱스 생성 — 「~를 하는 직업입니다」 · KSA 성향 · 면접 예상 질문.

  python3 taxonomy/data/build_insights.py            # taxonomy/data/insights/ 아래에 쓴다
  python3 taxonomy/data/build_insights.py --check    # 쓰지 않고 지금 파일과 같은지만 본다

무엇을 만드나
  insights/index.json      메타·기준값·샤드 목록
  insights/ncs/<01~24>.json   NCS 대분류 하나에 속한 대·중·소·세분류 노드의 인사이트
  insights/units/<01~24>.json 능력단위 인사이트(KSA 성향·키워드·한 줄 정의)

값을 지어내지 않는다
  - 한 줄 정의의 수행 문구는 **능력단위명·능력단위요소명 원문**에서만 나온다(번호 접두와 서술 어미만 떼어 낸다).
  - 역량 성향은 **KSA 원문 항목 수**를 그대로 세어 비율로만 말한다. 표본이 없으면 비율을 쓰지 않는다.
  - 키워드는 KSA 지식 항목의 머리명사와 능력단위요소명의 낱말을 **원문에서** 세어 뽑는다.
  - 면접 예상 질문은 틀(template)에 원문 항목을 **그대로 인용**해 만든다. 인용한 항목은 근거로 함께 남긴다.
  - 원천에 없는 값(직무 설명·자격·연봉 등)은 만들지 않는다. 비어 있으면 비었다고 쓴다.
"""
import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
TAX = os.path.join(HERE, "taxonomy.json")
KSA = os.path.join(HERE, "ksa")
OUT = os.path.join(HERE, "insights")

LEVEL_KO = {"major": "대분류", "middle": "중분류", "minor": "소분류", "sub": "세분류"}
NODE_ORDER = ["major", "middle", "minor", "sub"]

# ────────────────────────── 원문 다듬기(값을 더하지 않는다) ──────────────────────────
NUM = re.compile(r"^\s*\d+\s*[.)]\s*")
END_VERB = re.compile(r"\s*(하기|한다|하다)\s*$")
# 조사·어미 꼬리 — 낱말 끝에 붙은 것만 뗀다(낱말 자체는 원문 그대로 남는다)
TAIL = re.compile(
    r"(으로서|로써|에서|에게|에는|에도|부터|까지|보다|처럼|이다|이며|하며|하여|하는|되는|있는|없는"
    r"|따른|관한|위한|대한|같은|많은|좋은|적인|적으로|하려는|하고자|하려|하기|에|을|를|의|로|과|와"
    r"|은|는|이|가|도|만)$"
)
# 성향·업무를 가리키지 않는 낱말 — 키워드에서 뺀다
GENERIC = set(
    """현황 방법 사항 내용 경우 관련 등 것 수 때 위 및 대한 위한 따른 관해 지식 기술 태도 자세
    능력 업무 자료 과정 범위 목적 목표 역할 책임 활동 체계 조건 환경 요구 종류 원리 기능 구조 정의
    개념 특징 특성 배경 의의 의미 중요성 필요성 효과 영향 문제 대책 방안 절차 규정 기준 지침 제도
    정책 지원 이해 파악 활용 습득 노력 준수 유지 수행 실시 준비 확인 검토 개선 운영 적용 처리 조사
    분석 작성 설계 평가 관리 사용 정보 항목 이론 관련지식 기초지식 기본지식 배경지식 상식
    전반 전반적 일부 전체 각종 여러 다양 한 가지 부분 상황 시기 기간 당시 최근 향후
    수립 설정 선정 검증 도출 구축 확보 개선 조정 판단 결정 대응 점검 측정 검사 시험 견적 발주
    산정 계산 파악 습득 전달 소통 협의 보고 기록 정리 분류 비교 대조 예측 진단 감독 지도 교육 훈련
    계획 분석 평가 작성 설계 관리 운영 수행 사용 적용 처리 조사 확인 검토 유지 준수 노력 이해 활용
    개발 제작 생산 판매 구매 관리 유지보수""".split()
)


def clean_act(s):
    """능력단위명·능력단위요소명에서 번호 접두와 서술 어미만 뗀다. 낱말은 바꾸지 않는다."""
    s = re.sub(r"\s+", " ", NUM.sub("", str(s or "")).strip())
    cut = END_VERB.sub("", s).strip()
    # 「정하기」처럼 한 글자 어간만 남는 경우에는 «하기»를 그대로 둔다(낱말을 깎지 않는다)
    ts = tokens(cut)
    if cut and ts and len(ts[-1]) >= 2:
        s = cut
    return s


def clean_item(s):
    """KSA 항목 — 번호 접두만 떼고 문장은 그대로 둔다(인용문이므로)."""
    return re.sub(r"\s+", " ", NUM.sub("", str(s or "")).strip())


def tokens(s):
    return [t for t in re.split(r"[^0-9A-Za-z가-힣]+", s) if t]


def head_noun(item):
    """KSA 지식 항목의 머리명사(마지막 낱말)를 원문에서 떼어 낸다."""
    s = NUM.sub("", str(item or "")).strip()
    ts = tokens(s)
    while ts:
        t = TAIL.sub("", ts[-1])
        if not t:
            ts.pop()
            continue
        while True:  # 겹친 꼬리(예: 「하려는」 → 「하려」 → 「하」)를 한 번 더 뗀다
            t2 = TAIL.sub("", t)
            if t2 == t:
                break
            t = t2
        if len(t) >= 2:
            return t
        ts.pop()
    return ""


def norm_token(t):
    t = TAIL.sub("", t)
    while True:
        t2 = TAIL.sub("", t)
        if t2 == t:
            break
        t = t2
    return t


# 한국어 조사 고르기(받침 유무) — 질문 문장이 어색해지지 않게
def has_jong(word):
    ch = (word or " ")[-1]
    if "가" <= ch <= "힣":
        return (ord(ch) - 0xAC00) % 28 != 0
    if ch.isdigit():
        return ch in "0136780"
    return False


def josa(word, pair):
    a, b = pair.split("/")
    return a if has_jong(word) else b


def j_ul(w):
    return w + josa(w, "을/를")


def j_i(w):
    return w + josa(w, "이/가")


def j_eun(w):
    return w + josa(w, "은/는")


def quote(s):
    return "「%s」" % s


def quote_j(word, pair):
    """인용부호 뒤에 조사를 붙인다 — 조사는 낱말 끝소리로 고른다(인용부호로 고르면 틀린다)."""
    return "「%s」%s" % (word, josa(word, pair))


# ────────────────────────── 자료 읽기 ──────────────────────────
def load():
    with open(TAX, encoding="utf-8") as f:
        doc = json.load(f)
    nodes = {}
    for lv in NODE_ORDER:
        for x in doc["ncs"]["levels"][lv]:
            nodes[x["code"]] = {"code": x["code"], "name": x["name"], "parent": x.get("parent"), "lv": lv}
    for x in doc["ncs"].get("legacy", []):
        c = x["code"]
        if c not in nodes:
            nodes[c] = {"code": c, "name": x["name"], "parent": x.get("parent"), "lv": x["level"], "legacy": True}
    units = {u["code"]: u for u in doc["ncs"]["units"]}
    with open(os.path.join(KSA, "index.json"), encoding="utf-8") as f:
        ksa_index = json.load(f)
    ksa = {}
    for sh in ksa_index["shards"]:
        with open(os.path.join(KSA, sh["file"]), encoding="utf-8") as f:
            shard = json.load(f)
        ksa.update(shard["units"])
    return doc, nodes, units, ksa, ksa_index


def children_map(nodes):
    kids = defaultdict(list)
    for c, n in nodes.items():
        kids[n["parent"] or ""].append(c)
    for k in kids:
        kids[k].sort()
    return kids


def ancestors(nodes, code):
    out = []
    p = nodes[code]["parent"]
    while p and p in nodes:
        out.append(p)
        p = nodes[p]["parent"]
    return out


# ────────────────────────── 한 노드의 집계 ──────────────────────────
def empty_stat():
    return {"k": 0, "s": 0, "a": 0, "units": 0, "noKsa": 0, "hours": 0,
            "lv": Counter(), "phr": Counter(), "phrH": Counter(), "phrFirst": {},
            "kwDf": Counter(), "kwTot": Counter(),
            "refDf": {"k": Counter(), "s": Counter(), "a": Counter()},
            "refFirst": {"k": {}, "s": {}, "a": {}},
            "phrOwn": defaultdict(Counter)}


def feed(stat, unit, ksa, order, owner=None):
    """능력단위 하나를 노드 집계에 더한다. 원문만 센다.

    owner — 이 능력단위가 매인 세분류 코드. 상위 분류에서 «한 세분류만 독점하지 않게»
             수행 문구를 고를 때만 쓴다(집계 값 자체에는 영향을 주지 않는다).
    """
    code = unit["code"]
    stat["units"] += 1
    if unit.get("hours") is not None:
        stat["hours"] += unit["hours"]
    if unit.get("level") is not None:
        stat["lv"][unit["level"]] += 1
    rec = ksa.get(code)
    seen_phr, seen_kw = set(), set()
    pool = []
    if not rec or not rec.get("e"):
        stat["noKsa"] += 1
        return
    for e in rec["e"]:
        f = clean_act(e.get("f"))
        if f:
            pool += tokens(f)
            if f not in seen_phr:
                seen_phr.add(f)
                stat["phr"][f] += 1
                if owner:
                    stat["phrOwn"][f][owner] += 1
                if f not in stat["phrFirst"]:
                    stat["phrFirst"][f] = order
            stat["phrH"][f] += (unit.get("hours") or 0)
        for g in ("k", "s", "a"):
            for it in e.get(g, []):
                stat[g] += 1
        for g in ("k", "s", "a"):
            for it in e.get(g, []):
                t = clean_item(it)
                if not t:
                    continue
                stat["refDf"][g][t] += 1
                if t not in stat["refFirst"][g]:
                    stat["refFirst"][g][t] = order
        for it in e.get("k", []):
            h = head_noun(it)
            if h:
                pool.append(h)
    for t in pool:
        t2 = norm_token(t)
        if len(t2) < 2 or t2 in GENERIC:
            continue
        stat["kwTot"][t2] += 1
        if t2 not in seen_kw:
            seen_kw.add(t2)
            stat["kwDf"][t2] += 1


def pick_acts(stat, limit=4, spread=False):
    """수행 문구 — 여러 능력단위에 되풀이되는 것(df)을 먼저, 같으면 훈련시간이 큰 단위 것을 먼저.

    spread — 상위 분류에서는 한 세분류가 문구를 독점하지 않게, 한 세분류에서 두 개까지만 가져간다.
    """
    cand = [(p, stat["phr"][p], stat["phrH"][p], stat["phrFirst"][p], len(stat["phrOwn"][p])) for p in stat["phr"]]
    # 상위 분류는 «여러 세분류에 걸친» 문구를 먼저 — 한 세분류의 전문 용어가 분야 전체를 대표하지 않게
    if spread:
        cand.sort(key=lambda x: (-x[4], -x[1], -x[2], x[3], len(x[0])))
    else:
        cand.sort(key=lambda x: (-x[1], -x[2], x[3], len(x[0])))
    out = []
    used = Counter()
    for p, df, h, _, nOwn in cand:
        if not p or len(p) < 2 or len(p) > 32:
            continue  # 아주 긴 원문 요소명은 한 줄 정의를 망치므로 뺀다(다른 원문 문구로 대신한다)
        dup = False
        for q in out:
            pn, qn = p.replace(" ", ""), q.replace(" ", "")
            if pn == qn or pn in qn or qn in pn:
                dup = True
                break
        if dup:
            continue
        own = stat["phrOwn"][p].most_common(1)
        owner = own[0][0] if own else None
        if spread and owner and used[owner] >= 2:
            continue
        out.append(p)
        if owner:
            used[owner] += 1
        if len(out) >= limit:
            break
    return out


def pick_kw(stat, limit=5):
    cand = [(t, stat["kwDf"][t], stat["kwTot"][t]) for t in stat["kwDf"]]
    floor = 3 if stat["units"] >= 30 else (2 if stat["units"] >= 4 else 1)
    cand = [c for c in cand if c[1] >= floor] or [c for c in cand if c[1] >= 1]
    cand.sort(key=lambda x: (-(x[1] * (1 + 0.35 * (min(len(x[0]), 6) - 2))), -x[1], -x[2], x[0]))
    return [c[0] for c in cand[:limit]]


def bias_label(k, s, a, base):
    tot = k + s + a
    if not tot:
        return None
    rk, rs, ra = k / tot / base["k"], s / tot / base["s"], a / tot / base["a"]
    m = max(rk, rs, ra)
    if m < 1.12:
        return "세 축 고른 편"
    return {"k": "지식 중심", "s": "기술 중심", "a": "태도·대인 중심"}[
        "k" if m == rk else ("s" if m == rs else "a")
    ]


def pct(n, tot):
    return int(round(n * 100.0 / tot)) if tot else 0


# ────────────────────────── 질문 틀 (원문 인용만) ──────────────────────────
def q_unit(name, elems, stat):
    """능력단위 — 실무·세부 검증 질문(요소별). 원문 요소·KSA 항목을 그대로 인용한다."""
    qs = []
    have = [e for e in elems if (e.get("k") or e.get("s") or e.get("a"))]
    if not have:
        return qs

    def at(i):
        return have[min(i, len(have) - 1)]

    e1, e2, e3 = at(0), at(len(have) // 2), at(len(have) - 1)
    k1 = (e1.get("k") or [None])[0]
    s1 = (e1.get("s") or e2.get("s") or [None])[0]
    k2 = (e2.get("k") or [None])[-1]
    a1 = (e3.get("a") or e1.get("a") or [None])[0]

    if k1:
        qs.append({
            "q": "%s 업무를 실제로 해 본 경험이 있습니까? 그때 %s 어떻게 확인하고 적용했는지 구체적으로 말씀해 주세요."
                 % (quote(clean_act(e1["f"])), quote_j(clean_item(k1), "을/를")),
            "why": [clean_item(k1)] + ([clean_item(s1)] if s1 else []),
        })
    if k2:
        qs.append({
            "q": "%s에 대해 설명해 주세요. %s에서 이 내용이 왜 필요하다고 생각합니까?"
                 % (quote(clean_item(k2)), quote(name)),
            "why": [clean_item(k2)] + ([clean_item(k1)] if k1 and k1 != k2 else []),
        })
    if s1:
        qs.append({
            "q": "%s 항목을 기준으로 볼 때, %s 어느 수준까지 할 수 있습니까? 최근 사례를 하나 들어 말씀해 주세요."
                 % (quote(clean_item(s1)), quote_j(clean_act(e2["f"]), "은/는")),
            "why": [clean_item(s1)] + [clean_item(x) for x in (e2.get("s") or [])[:1] if x != s1],
        })
    if a1:
        qs.append({
            "q": "%s 필요한 상황을 하나 가정해, 본인이 어떻게 행동할지 말씀해 주세요."
                 % quote_j(clean_item(a1), "이/가"),
            "why": [clean_item(a1)] + [clean_item(x) for x in (e3.get("a") or [])[1:2]],
        })
    return qs[:4]


def ref_items(stat, g, limit=2):
    """노드에서 되풀이되는 KSA 원문 항목 — 질문의 근거로 그대로 인용한다."""
    cand = [(t, stat["refDf"][g][t], stat["refFirst"][g].get(t, 0)) for t in stat["refDf"][g]]
    cand.sort(key=lambda x: (-x[1], x[2], len(x[0])))
    return [c[0] for c in cand[:limit]]


def q_node(node, stat, acts, kw, elems):
    """분류 노드 — 상위일수록 분류를 관통하는 질문, 하위일수록 그 직무의 수행을 묻는다.

    인용하는 지식·기술·태도는 그 노드의 능력단위들에서 **가장 많이 되풀이된 KSA 원문 항목**이다.
    """
    name = node["name"]
    qs = []
    if not stat["units"] or (stat["k"] + stat["s"] + stat["a"]) == 0:
        return qs
    depth = {"major": 0, "middle": 1, "minor": 2, "sub": 3}[node["lv"]]
    common = [a for a, c in stat["phr"].most_common(3)] or acts
    ku = sorted(elems, key=lambda x: (-(x.get("h") or 0), x["code"]))[:3]
    k1, s1 = ref_items(stat, "k", 2), ref_items(stat, "s", 2)
    a1 = ref_items(stat, "a", 1)

    if depth <= 1:
        if common:
            qs.append({
                "q": "%s 분야에서 되풀이되는 %s 업무를 맡아 본 적이 있습니까? 어떤 대상과 자료를 다뤘는지 말씀해 주세요."
                     % (quote(name), quote(common[0])),
                "why": [common[0]] + common[1:2],
            })
        if k1:
            qs.append({
                "q": "%s 이 분야에서 되풀이되는 지식 항목입니다. 어디까지 알고 있는지, 실제 업무에서 쓰이는 장면을 하나 들어 설명해 주세요."
                     % quote_j(k1[0], "은/는"),
                "why": k1,
            })
        if a1:
            qs.append({
                "q": "%s 이 분야에서 요구되는 이유를 본인 경험으로 설명해 주세요."
                     % quote_j(a1[0], "이/가"),
                "why": a1 + common[1:2],
            })
        if ku:
            qs.append({
                "q": "%s 같은 세부 직무로 들어가면 무엇부터 익혀야 한다고 봅니까? 그 이유도 함께 말씀해 주세요."
                     % quote(ku[0]["name"]),
                "why": [clean_act(e) for e in ku[0]["acts"][:2]] or [ku[0]["name"]],
            })
    else:
        if common:
            qs.append({
                "q": "%s 직무에서 %s 일을 해 본 경험이 있습니까? 어떤 순서로, 무엇을 확인하며 했는지 말씀해 주세요."
                     % (quote(name), quote(common[0])),
                "why": [common[0]] + ([k1[0]] if k1 else []),
            })
        if k1 or s1:
            qs.append({
                "q": "%s 직무에서 요구되는 지식과 기술입니다. 각각 어느 수준이며 어느 쪽이 더 약한지 말씀해 주세요."
                     % quote(name),
                "why": (k1[:1] + s1[:1]) or (k1 + s1),
            })
        if ku:
            qs.append({
                "q": "%s 업무를 맡았을 때 가장 먼저 확인할 것과 마지막에 점검할 것을 말씀해 주세요."
                     % quote(ku[0]["name"]),
                "why": [clean_act(e) for e in ku[0]["acts"][:2]] or [ku[0]["name"]],
            })
        if a1:
            qs.append({
                "q": "%s 필요한 상황을 하나 가정해, 본인이 어떻게 행동할지 말씀해 주세요."
                     % quote_j(a1[0], "이/가"),
                "why": a1 + ([s1[-1]] if s1 else []),
            })
    return [q for q in qs if q["q"] and q["why"]][:4]


# ────────────────────────── 문장 틀 ──────────────────────────
def fit_acts(acts, max_chars):
    """한 줄 정의가 길어지지 않게 — 뒤에서부터 덜어 낸다(문구는 원문 그대로)."""
    acts = list(acts)
    while len(acts) > 1 and len(", ".join(acts)) > max_chars:
        acts.pop()
    return acts


def line_for(node, acts, field):
    a = ", ".join(acts)
    tail = "등을 수행하는" if len(acts) >= 2 else "을 수행하는"
    lv = node["lv"]
    if lv in ("major", "middle"):
        return "%s 분야의 직무들은 %s %s 직업입니다." % (quote(node["name"]), a, tail)
    if lv == "minor":
        return "%s 직무로, %s %s 직업입니다." % (quote(node["name"]), a, tail)
    return "%s 분야의 %s 직무로, %s %s 직업입니다." % (quote(field), quote(node["name"]), a, tail)


def line_unit(unit, acts):
    a = ", ".join(acts)
    tail = "등을 수행하는" if len(acts) >= 2 else "을 수행하는"
    return "%s 업무로, %s %s 능력단위입니다." % (quote(unit["name"]), a, tail)


# ────────────────────────── 만들기 ──────────────────────────
def build():
    doc, nodes, units, ksa, ksa_index = load()
    base_total = ksa_index["meta"]["counts"]
    base = {
        "k": base_total["knowledge"] / base_total["items"],
        "s": base_total["skill"] / base_total["items"],
        "a": base_total["attitude"] / base_total["items"],
    }

    # 세분류 → 능력단위
    subs_of = defaultdict(list)
    for code, u in units.items():
        for s in u.get("subs") or []:
            subs_of[s].append(code)
    for s in subs_of:
        subs_of[s].sort()
    # 노드 → 그 아래 세분류(자기 자신 포함)
    subs_under = defaultdict(list)
    for s in (c for c in nodes if nodes[c]["lv"] == "sub"):
        subs_under[s].append(s)
        for a in ancestors(nodes, s):
            subs_under[a].append(s)
    for k in subs_under:
        subs_under[k].sort()

    # 능력단위 → 요소(원문) 캐시
    elems = {}
    for code, rec in ksa.items():
        elems[code] = rec.get("e") or []

    # 깊은 곳부터 집계해 위로 더한다(세분류 → 소분류 → 중분류 → 대분류)
    stat = {c: empty_stat() for c in nodes}
    order = 0
    for s in sorted(c for c in nodes if nodes[c]["lv"] == "sub"):
        for code in subs_of.get(s, []):
            u = units[code]
            order += 1
            feed(stat[s], u, ksa, order, s)
    rollup_levels = [("minor", "sub"), ("middle", "minor"), ("major", "middle")]
    for up, down in rollup_levels:
        for c in sorted(nodes):
            if nodes[c]["lv"] != up:
                continue
            for kid in [k for k in nodes if nodes[k]["parent"] == c and nodes[k]["lv"] == down]:
                add(stat[c], stat[kid])

    # 대분류 이름 — 세분류 문장의 「분야」 자리에 쓴다
    major_of = {}
    for c, n in nodes.items():
        top = c
        p = n["parent"]
        while p and p in nodes:
            top = p
            p = nodes[p]["parent"]
        major_of[c] = top

    # 능력단위 인사이트
    unit_entries = {}
    for code in sorted(units):
        u = units[code]
        e = elems.get(code) or []
        st = empty_stat()
        feed(st, u, ksa, 0, (u.get("subs") or [None])[0])
        acts_all = [clean_act(x.get("f")) for x in e if len(clean_act(x.get("f"))) >= 2]
        short = [a for a in acts_all if len(a) <= 40]
        if len(short) >= 2:
            acts_all = short
        if len(acts_all) > 4:
            step = (len(acts_all) - 1) / 3.0
            acts = [acts_all[int(round(i * step))] for i in range(4)]
        else:
            acts = acts_all
        acts = fit_acts(list(dict.fromkeys(acts)), 88)
        tot = st["k"] + st["s"] + st["a"]
        ent = {
            "acts": acts,
            "line": line_unit(u, acts) if acts else None,
            "kw": pick_kw(st, 4),
            "ksa": {"k": st["k"], "s": st["s"], "a": st["a"],
                    "kp": pct(st["k"], tot), "sp": pct(st["s"], tot), "ap": pct(st["a"], tot),
                    "b": bias_label(st["k"], st["s"], st["a"], base)},
            "hasKsa": bool(e),
        }
        unit_entries[code] = ent

    # 노드 인사이트
    node_entries = {}
    for c in sorted(nodes):
        n = nodes[c]
        st = stat[c]
        acts = fit_acts(pick_acts(st, 4, spread=n["lv"] in ("major", "middle")), 100)
        kw = pick_kw(st, 5)
        tot = st["k"] + st["s"] + st["a"]
        counts = Counter()
        for k in nodes:
            if k.startswith(c) and k != c and len(k) > len(c):
                counts[nodes[k]["lv"]] += 1
        unit_acts = []
        my_units = [u for s in subs_under.get(c, []) for u in subs_of.get(s, [])]
        top_units = sorted(my_units, key=lambda x: (-(units[x].get("hours") or 0), x))[:3]
        for uc in top_units:
            ue = unit_entries.get(uc)
            if ue and ue["acts"]:
                unit_acts.append({"c": uc, "name": units[uc]["name"], "acts": ue["acts"][:2]})
        ent = {
            "name": n["name"],
            "lv": n["lv"],
            "field": nodes[major_of[c]]["name"] if n["lv"] in ("minor", "sub") else n["name"],
            "line": line_for(n, acts, nodes[major_of[c]]["name"]) if acts else None,
            "acts": acts,
            "kw": kw,
            "ksa": {"k": st["k"], "s": st["s"], "a": st["a"],
                    "kp": pct(st["k"], tot), "sp": pct(st["s"], tot), "ap": pct(st["a"], tot),
                    "b": bias_label(st["k"], st["s"], st["a"], base) if tot else None},
            "stats": {
                "units": st["units"],
                "subs": counts["sub"],
                "minors": counts["minor"],
                "middles": counts["middle"],
                "hours": st["hours"],
                "lvMin": min(st["lv"]) if st["lv"] else None,
                "lvMax": max(st["lv"]) if st["lv"] else None,
                "noKsa": st["noKsa"],
            },
            "topUnits": unit_acts,
            "qs": q_node(n, st, acts, kw, [{"code": uc, "name": units[uc]["name"], "h": units[uc].get("hours"),
                                            "acts": unit_entries[uc]["acts"]}
                                           for uc in top_units if uc in unit_entries]),
            "refs": {g: ref_items(st, g, 2) for g in ("k", "s", "a")},
            "qLevel": {"major": "분야 관통", "middle": "분야 관통", "minor": "직무 공통",
                       "sub": "직무 실무"}[n["lv"]],
        }
        if n.get("legacy"):
            ent["legacy"] = True
        if n["lv"] == "sub":
            ent["unitCodes"] = subs_of.get(c, [])
        node_entries[c] = ent

    return doc, nodes, node_entries, unit_entries, base, ksa_index


def add(dst, src):
    dst["k"] += src["k"]
    dst["s"] += src["s"]
    dst["a"] += src["a"]
    dst["units"] += src["units"]
    dst["noKsa"] += src["noKsa"]
    dst["hours"] += src["hours"]
    dst["lv"].update(src["lv"])
    # 되풀이 수(df)는 «능력단위 단위»라 위로 더해도 뜻이 유지된다
    for p, v in src["phr"].items():
        dst["phr"][p] += v
    for p, v in src["phrH"].items():
        dst["phrH"][p] += v
    for p, v in src["phrFirst"].items():
        dst["phrFirst"].setdefault(p, v)
    for p, v in src["kwDf"].items():
        dst["kwDf"][p] += v
    for p, v in src["kwTot"].items():
        dst["kwTot"][p] += v
    for g in ("k", "s", "a"):
        for p, v in src["refDf"][g].items():
            dst["refDf"][g][p] += v
        for p, v in src["refFirst"][g].items():
            dst["refFirst"][g].setdefault(p, v)


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="쓰지 않고 지금 파일과 같은지만 본다")
    args = ap.parse_args()

    doc, nodes, node_entries, unit_entries, base, ksa_index = build()

    by_major = defaultdict(lambda: {"nodes": {}, "units": {}})
    for c, ent in node_entries.items():
        by_major[c[:2]]["nodes"][c] = ent
    for c, ent in unit_entries.items():
        by_major[c[:2]]["units"][c] = ent

    index = {
        "meta": {
            "schema_version": "1.0",
            "dataset": "taxonomy-insight",
            "sector": "taxonomy",
            "generated_from": doc["meta"].get("generated_at"),
            "method": "능력단위명·능력단위요소명·KSA 원문만 세어 만든 요약. 새로 쓴 직무 서술·추정값 없음.",
            "notice": "비율은 이 분류에 속한 능력단위의 KSA 항목 수를 센 값입니다. 표본이 없는 노드는 비율을 비웁니다.",
            "baseline": {k: round(v, 4) for k, v in base.items()},
            "counts": {"nodes": len(node_entries), "units": len(unit_entries),
                       "nodes_with_line": sum(1 for e in node_entries.values() if e["line"]),
                       "units_with_line": sum(1 for e in unit_entries.values() if e["line"]),
                       "nodes_with_q": sum(1 for e in node_entries.values() if e["qs"]),
                       "units_without_ksa": sum(1 for e in unit_entries.values() if not e["hasKsa"])},
            "shards": sorted(by_major),
            "keys": {
                "node": "name·lv·field·line·acts·kw·ksa{k,s,a,kp,sp,ap,b}·stats·topUnits·qs[{q,why}]·qLevel",
                "unit": "name·level·hours·subs·acts·line·kw·ksa{...}·hasKsa",
            },
        },
        "nodes": {},
        "units": {},
    }
    for m in sorted(by_major):
        index["nodes"][m] = "ncs/%s.json" % m
        index["units"][m] = "units/%s.json" % m

    payload = {"index": index, "nodes": {}, "units": {}}
    for m, pack in by_major.items():
        payload["nodes"][m] = {"major": m, "nodes": pack["nodes"]}
        payload["units"][m] = {"major": m, "units": pack["units"]}

    targets = {os.path.join(OUT, "index.json"): index}
    for m in by_major:
        targets[os.path.join(OUT, "ncs", "%s.json" % m)] = payload["nodes"][m]
        targets[os.path.join(OUT, "units", "%s.json" % m)] = payload["units"][m]

    if args.check:
        bad = []
        for path, obj in targets.items():
            if not os.path.exists(path):
                bad.append("%s 없음" % os.path.relpath(path, HERE))
                continue
            with open(path, encoding="utf-8") as f:
                cur = f.read()
            want = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
            if cur != want:
                bad.append("%s 내용이 다름" % os.path.relpath(path, HERE))
        if bad:
            print("인사이트 인덱스가 원자료와 다릅니다:")
            for b in bad[:10]:
                print("  -", b)
            sys.exit(1)
        print("인사이트 인덱스: 원자료와 같음 (%d개 파일)" % len(targets))
        return

    total = 0
    for path, obj in targets.items():
        write(path, obj)
        total += os.path.getsize(path)
    c = index["meta"]["counts"]
    print("인사이트 인덱스 생성: 노드 %d · 능력단위 %d (한 줄 정의 노드 %d·능력단위 %d, 질문 있는 노드 %d)"
          % (c["nodes"], c["units"], c["nodes_with_line"], c["units_with_line"], c["nodes_with_q"]))
    print("  KSA 없는 능력단위(질문 없음): %d" % c["units_without_ksa"])
    print("  파일 %d개 · 합계 %.1f MB → %s" % (len(targets), total / 1048576.0, os.path.relpath(OUT, HERE)))


if __name__ == "__main__":
    main()
