#!/usr/bin/env python3
"""taxonomy.json 구조 검증 스크립트.

사용:  python3 taxonomy/data/validate.py
종료 코드 0 = 오류 0건(경고는 있어도 무관), 1 = 오류 있음.
기대 건수는 2026-11-16 기준 고시본에 맞춘 값이다. 원자료가 개정되어 건수가 바뀌면
EXPECTED를 갱신하면서 SCHEMA.md의 실측 건수도 함께 고친다.
"""
import json
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "taxonomy.json")
KSA_DIR = os.path.join(HERE, "ksa")

EXPECTED = {
    ("ncs", "major"): 24,
    ("ncs", "middle"): 81,
    ("ncs", "minor"): 270,
    ("ncs", "sub"): 1096,
    ("ncs", "units"): 13442,
    ("keco", "major"): 10,
    ("keco", "middle"): 35,
    ("keco", "minor"): 140,
    ("keco", "sub"): 495,
    ("ksco", "major"): 10,
    ("ksco", "middle"): 57,
    ("ksco", "minor"): 167,
    ("ksco", "sub"): 495,
    ("ksco", "detail"): 1270,
}

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load():
    if not os.path.exists(PATH):
        err("taxonomy.json 파일이 없습니다: " + PATH)
        return None
    try:
        with open(PATH, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        err("JSON 파싱 실패: %s" % e)
        return None


def check_levels(doc, key):
    levels = doc[key]["levels"]
    codes = {}
    for lv, nodes in levels.items():
        seen = Counter(n["code"] for n in nodes)
        dup = [c for c, n in seen.items() if n > 1]
        if dup:
            err("%s.%s 중복 코드: %s" % (key, lv, dup[:5]))
        codes[lv] = {n["code"] for n in nodes}
        for n in nodes:
            if not n.get("name"):
                err("%s.%s %s 이름 없음" % (key, lv, n.get("code")))
    # 상위 코드 연결
    order = list(levels.keys())
    for i, lv in enumerate(order):
        if i == 0:
            for n in levels[lv]:
                if n.get("parent"):
                    err("%s.%s %s 최상위인데 parent 있음" % (key, lv, n["code"]))
            continue
        parent_level = order[i - 1]
        for n in levels[lv]:
            p = n.get("parent")
            if not p:
                err("%s.%s %s parent 없음" % (key, lv, n["code"]))
            elif p not in codes[parent_level]:
                err("%s.%s %s parent %s 가 %s에 없음" % (key, lv, n["code"], p, parent_level))
            elif not n["code"].startswith(p):
                err("%s.%s %s 코드가 parent %s 접두와 불일치" % (key, lv, n["code"], p))
    return codes


def main():
    doc = load()
    if doc is None:
        report()
        return

    for k in ("meta", "sources", "ncs", "keco", "ksco", "mappings", "jobs"):
        if k not in doc:
            err("최상위 키 없음: " + k)
    if errors:
        report()
        return

    codes = {k: check_levels(doc, k) for k in ("ncs", "keco", "ksco")}

    # 건수
    actual = {}
    for k, lv in list(codes.items()):
        for name, s in lv.items():
            actual[(k, name)] = len(s)
    actual[("ncs", "units")] = len(doc["ncs"]["units"])
    for key, want in EXPECTED.items():
        got = actual.get(key)
        if got != want:
            err("건수 불일치 %s: 기대 %s, 실제 %s" % (".".join(key), want, got))
    declared = doc["meta"].get("counts", {})
    if declared.get("jobs") != len(doc["jobs"]):
        err("meta.counts.jobs 불일치")

    # 능력단위
    sub_codes = codes["ncs"]["sub"] | {x["code"] for x in doc["ncs"].get("legacy", []) if x["level"] == "sub"}
    unit_codes = Counter()
    for u in doc["ncs"]["units"]:
        unit_codes[u["code"]] += 1
        if len(u["code10"]) != 10 or not u["code10"].isdigit():
            err("능력단위 분류번호 형식 오류: %s" % u["code"])
        for s in u["subs"]:
            if s not in sub_codes:
                err("능력단위 %s 의 세분류 %s 없음" % (u["code"], s))
        if u["level"] is not None and not (1 <= u["level"] <= 8):
            err("능력단위 수준 범위 밖: %s %s" % (u["code"], u["level"]))
        if u["in_notice"] and not u["subs"]:
            err("고시 별표에 있는데 세분류 연결 없음: %s" % u["code"])
        if not u.get("sub_link"):
            warn("분류번호도 세분류 코드도 맞지 않는 능력단위 %s" % u["code"])
    dup_units = [c for c, n in unit_codes.items() if n > 1]
    if dup_units:
        err("능력단위 코드 중복: %s" % dup_units[:5])
    from_code = sum(1 for u in doc["ncs"]["units"] if u.get("sub_link") == "code")
    if from_code:
        warn("고시 별표에 없어 분류번호로 연결한 능력단위 %d건 (in_notice=false)" % from_code)

    # 매핑
    m = doc["mappings"]
    ncs_minor_all = codes["ncs"]["minor"] | {x["code"] for x in doc["ncs"].get("legacy", []) if x["level"] == "minor"}
    for row in m["ncs_keco"]:
        if row["ncs_code"] not in ncs_minor_all:
            err("ncs_keco: NCS 소분류 %s 없음" % row["ncs_code"])
        if row["keco_code"] not in codes["keco"]["sub"]:
            err("ncs_keco: KECO 세분류 %s 없음" % row["keco_code"])
    for row in m["ncs_training"]:
        if not row.get("training_name"):
            err("ncs_training: 훈련직종명 없음 (%s)" % row["training_code"])
        if not row["ncs_in_notice"] and row["ncs_code"] not in {x["code"] for x in doc["ncs"].get("legacy", [])}:
            err("ncs_training: 고시·legacy 어디에도 없는 NCS 코드 %s" % row["ncs_code"])
    for row in m["keco_ksco"]:
        if row["keco_code"] not in codes["keco"]["sub"]:
            err("keco_ksco: KECO 세분류 %s 없음" % row["keco_code"])
        if row["ksco_code"] not in codes["ksco"]["sub"]:
            err("keco_ksco: KSCO 세분류 %s 없음" % row["ksco_code"])

    # 직업(KONET)
    for j in doc["jobs"]:
        if j["keco_code"] not in codes["keco"]["sub"]:
            err("jobs: KECO 코드 %s 없음 (%s)" % (j["keco_code"], j["konet"]))
        if j["ksco_code"] and j["ksco_code"] not in codes["ksco"]["sub"]:
            err("jobs: KSCO 코드 %s 없음 (%s)" % (j["ksco_code"], j["konet"]))
        if not j["name"]:
            err("jobs: 직업명 없음 (%s)" % j["konet"])
    konet = Counter(j["konet"] for j in doc["jobs"])
    dup_jobs = [c for c, n in konet.items() if n > 1]
    if dup_jobs:
        err("jobs: KONET 코드 중복 %s" % dup_jobs[:5])

    # 출처·라이선스
    ids = {s["id"] for s in doc["sources"]}
    for s in doc["sources"]:
        for f in ("id", "name", "publisher", "license", "url", "base_date"):
            if not s.get(f):
                err("sources %s: %s 없음" % (s.get("id"), f))
    used = {r.get("source") for r in m["ncs_keco"] + m["ncs_training"] + m["keco_ksco"]}
    for u in used:
        if u not in ids:
            err("매핑이 가리키는 출처 %s 없음" % u)

    # KSA 샤드
    check_ksa(doc)

    # 인사이트 인덱스(한눈에·면접 예상 질문)
    check_insights(doc)

    report()


def check_ksa(doc):
    """taxonomy/data/ksa/index.json + 샤드 24개를 검증한다."""
    idx_path = os.path.join(KSA_DIR, "index.json")
    if not os.path.exists(idx_path):
        err("ksa/index.json 없음")
        return
    try:
        with open(idx_path, encoding="utf-8") as f:
            idx = json.load(f)
    except json.JSONDecodeError as e:
        err("ksa/index.json 파싱 실패: %s" % e)
        return

    meta = idx.get("meta", {})
    for f in ("schema_version", "dataset", "source_id", "source", "license", "base_date", "collected_at"):
        if not meta.get(f):
            err("ksa.meta.%s 없음" % f)
    if meta.get("source_id") and meta["source_id"] not in {s["id"] for s in doc["sources"]}:
        err("ksa.meta.source_id %s 가 sources에 없음" % meta["source_id"])

    unit_codes = {u["code"] for u in doc["ncs"]["units"]}
    seen = {}
    tot = {"units": 0, "elements": 0, "knowledge": 0, "skill": 0, "attitude": 0}

    shards = idx.get("shards") or []
    for s in shards:
        major = s.get("major")
        fn = s.get("file") or ""
        if not major or fn != major + ".json":
            err("ksa.shards 항목 형식 오류: %s" % s)
            continue
        path = os.path.join(KSA_DIR, fn)
        if not os.path.exists(path):
            err("ksa 샤드 파일 없음: %s" % fn)
            continue
        with open(path, encoding="utf-8") as f:
            shard = json.load(f)
        if shard.get("major") != major:
            err("ksa/%s: major 불일치" % fn)
        units = shard.get("units") or {}
        cnt = {"units": len(units), "elements": 0, "knowledge": 0, "skill": 0, "attitude": 0}
        for code, v in units.items():
            if code[:2] != major:
                err("ksa/%s: %s 가 샤드 대분류와 불일치" % (fn, code))
            if code in seen:
                err("ksa: 능력단위 %s 가 중복(%s, %s)" % (code, seen[code], fn))
            seen[code] = fn
            if code not in unit_codes:
                err("ksa: taxonomy.json에 없는 능력단위 %s" % code)
            elems = v.get("e")
            if not elems:
                err("ksa: %s 요소 배열 없음" % code)
                continue
            any_item = False
            for e in elems:
                cnt["elements"] += 1
                if not (e.get("f") or "").strip():
                    err("ksa: %s 요소명 없음" % code)
                for g, key in (("k", "knowledge"), ("s", "skill"), ("a", "attitude")):
                    items = e.get(g)
                    if not isinstance(items, list):
                        err("ksa: %s 요소 %s 의 %s 가 배열 아님" % (code, e.get("f"), g))
                        continue
                    for it in items:
                        if not isinstance(it, str) or not it.strip():
                            err("ksa: %s %s 빈 항목" % (code, g))
                        else:
                            any_item = True
                    cnt[key] += len(items)
            if not any_item:
                err("ksa: %s 에 KSA 항목이 하나도 없음" % code)
        alias = {"k": "knowledge", "s": "skill", "a": "attitude"}
        for key in ("units", "elements", "k", "s", "a"):
            real = cnt[alias.get(key, key)]
            if s.get(key) != real:
                err("ksa/%s: 색인 %s=%s, 실제 %s" % (fn, key, s.get(key), real))
        for key in tot:
            tot[key] += cnt[key]

    files = sorted(x for x in os.listdir(KSA_DIR) if x.endswith(".json") and x != "index.json")
    if len(files) != len(shards):
        err("ksa: 색인 %d개, 파일 %d개" % (len(shards), len(files)))

    declared = meta.get("counts", {})
    actual = {"units": tot["units"], "elements": tot["elements"],
              "knowledge": tot["knowledge"], "skill": tot["skill"],
              "attitude": tot["attitude"],
              "items": tot["knowledge"] + tot["skill"] + tot["attitude"],
              "shards": len(shards)}
    for k, v in actual.items():
        if declared.get(k) != v:
            err("ksa.meta.counts.%s: 선언 %s, 실제 %s" % (k, declared.get(k), v))

    cov = meta.get("coverage", {})
    if cov.get("units_total") != len(unit_codes):
        err("ksa.coverage.units_total %s != taxonomy 능력단위 %d" % (cov.get("units_total"), len(unit_codes)))
    if cov.get("units_with_ksa") != tot["units"]:
        err("ksa.coverage.units_with_ksa %s != 실제 %d" % (cov.get("units_with_ksa"), tot["units"]))
    notice = {u["code"] for u in doc["ncs"]["units"] if u["in_notice"]}
    if cov.get("units_in_notice_with_ksa") != len(notice & set(seen)):
        err("ksa.coverage.units_in_notice_with_ksa 불일치")
    if len(notice & set(seen)) < len(notice):
        warn("고시 별표 능력단위 중 KSA 없는 것 %d건" % (len(notice) - len(notice & set(seen))))


def check_insights(doc):
    """insights/ — 원자료에서 파생한 요약이 원자료와 어긋나지 않는가.

    값의 «내용»은 사람이 보는 것이고, 여기서는 **구조와 합계**만 본다:
    모든 NCS 노드·능력단위가 있는가, KSA 항목 수 합계가 원본과 같은가,
    한 줄 정의·질문이 빈 채로 남은 곳은 KSA가 없는 곳뿐인가.
    """
    INS = os.path.join(HERE, "insights")
    idx_path = os.path.join(INS, "index.json")
    if not os.path.exists(idx_path):
        warn("insights/index.json 없음 — build_insights.py를 실행하지 않았다")
        return
    try:
        with open(idx_path, encoding="utf-8") as f:
            idx = json.load(f)
    except json.JSONDecodeError as e:
        err("insights/index.json 파싱 실패: %s" % e)
        return

    nodes = {}
    unit_entries = {}
    for major, rel in (idx.get("nodes") or {}).items():
        path = os.path.join(INS, rel)
        if not os.path.exists(path):
            err("insights 노드 샤드 없음: %s" % rel)
            continue
        with open(path, encoding="utf-8") as f:
            shard = json.load(f)
        if shard.get("major") != major:
            err("insights/%s: major 불일치" % rel)
        nodes.update(shard.get("nodes") or {})
    for major, rel in (idx.get("units") or {}).items():
        path = os.path.join(INS, rel)
        if not os.path.exists(path):
            err("insights 능력단위 샤드 없음: %s" % rel)
            continue
        with open(path, encoding="utf-8") as f:
            shard = json.load(f)
        if shard.get("major") != major:
            err("insights/%s: major 불일치" % rel)
        unit_entries.update(shard.get("units") or {})

    # ① NCS 노드 빠짐
    want_nodes = set()
    for lv in ("major", "middle", "minor", "sub"):
        want_nodes |= {n["code"] for n in doc["ncs"]["levels"][lv]}
    want_nodes |= {x["code"] for x in doc["ncs"].get("legacy", [])}
    missing = sorted(want_nodes - set(nodes))
    if missing:
        err("insights에 없는 NCS 노드 %d개: %s" % (len(missing), missing[:5]))
    extra = sorted(set(nodes) - want_nodes)
    if extra:
        err("taxonomy.json에 없는 NCS 노드가 insights에 있음: %s" % extra[:5])

    # ② 능력단위 빠짐
    unit_codes = {u["code"] for u in doc["ncs"]["units"]}
    mu = sorted(unit_codes - set(unit_entries))
    if mu:
        err("insights에 없는 능력단위 %d개: %s" % (len(mu), mu[:5]))

    # ③ KSA 항목 수 합계 — 원본과 같아야 한다(집계가 빠짐없이 올라갔는가)
    tot = {"k": 0, "s": 0, "a": 0}
    for code, e in unit_entries.items():
        for g in tot:
            tot[g] += (e.get("ksa") or {}).get(g, 0)
    major_codes = [n["code"] for n in doc["ncs"]["levels"]["major"]]
    top = {"k": 0, "s": 0, "a": 0}
    for c in major_codes:
        e = nodes.get(c) or {}
        for g in top:
            top[g] += (e.get("ksa") or {}).get(g, 0)
    for g, name in (("k", "지식"), ("s", "기술"), ("a", "태도")):
        if tot[g] != top[g]:
            err("insights %s 합계 불일치: 능력단위 %d, 대분류 롤업 %d" % (name, tot[g], top[g]))

    # ④ 한 줄 정의·질문이 빈 곳은 KSA가 없는 곳뿐인가
    no_line = [c for c, e in nodes.items() if not e.get("line")]
    no_q = [c for c, e in nodes.items() if not e.get("qs")]
    if set(no_line) != set(no_q):
        err("한 줄 정의는 없는데 질문만 있는(또는 반대) 노드가 있다")
    for c in no_line:
        if (nodes[c].get("ksa") or {}).get("k", 0) or (nodes[c].get("ksa") or {}).get("s", 0):
            err("KSA가 있는데 한 줄 정의가 없는 노드: %s" % c)
    u_no = [c for c, e in unit_entries.items() if e.get("hasKsa") and not e.get("line")]
    if u_no:
        err("KSA가 있는데 한 줄 정의가 없는 능력단위 %d개: %s" % (len(u_no), u_no[:5]))

    # ⑤ 비율·라벨
    for c, e in list(nodes.items())[:2000]:
        k = e.get("ksa") or {}
        if not (k.get("k") or k.get("s") or k.get("a")):
            continue
        if abs(k.get("kp", 0) + k.get("sp", 0) + k.get("ap", 0) - 100) > 1:
            err("insights %s: KSA 비율 합이 100이 아님(%s+%s+%s)" % (c, k.get("kp"), k.get("sp"), k.get("ap")))
            break
        if not k.get("b"):
            err("insights %s: 역량 성향 라벨 없음" % c)
            break

    declared = idx.get("meta", {}).get("counts", {})
    if declared.get("nodes") != len(nodes):
        err("insights.meta.counts.nodes: 선언 %s, 실제 %s" % (declared.get("nodes"), len(nodes)))
    if declared.get("units") != len(unit_entries):
        err("insights.meta.counts.units: 선언 %s, 실제 %s" % (declared.get("units"), len(unit_entries)))


def report():
    n = len(load()["jobs"]) if not errors else None
    print("검증 대상:", PATH)
    for w in warnings:
        print("  [경고]", w)
    for e in errors:
        print("  [오류]", e)
    if errors:
        print("결과: 오류 %d건, 경고 %d건" % (len(errors), len(warnings)))
        sys.exit(1)
    print("결과: 오류 0건, 경고 %d건" % len(warnings))


if __name__ == "__main__":
    main()
