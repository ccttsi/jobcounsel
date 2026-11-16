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

    report()


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
