#!/usr/bin/env python3
"""portals.json 구조 검증 스크립트.

사용:  python3 portals/data/validate.py
종료 코드 0 = 오류 0건(경고는 있어도 무관), 1 = 오류 있음.

네트워크를 쓰지 않는다(오프라인 검증). 실제 접속 검증 결과가 각 항목의
http_status·verified_at 에 들어 있다. 마지막 전수 재확인은 2026-11-23(주간 점검)이고, 2026-11-24에 제외 20곳을 다시
확인해 16곳을 더했으며, 2026-11-26에 새 후보를 훑어 17곳을 더하고 「내담자 상황·목표(needs)」·「운영 주체(owner)」 축을 붙였으며, 2026-11-27에 12개 시·도 지역 일자리 창구를 더했다.
사이트가 폐쇄되면 verified_at 을 올릴 때 해당 항목을 빼거나 주소를 고친다.
"""
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "portals.json")

EXPECTED = {
    "total": 136,
    "by_sector": {"pub": 21, "disclosure": 15, "general": 17, "tech": 12, "expert": 5,
                  "industry": 9, "target": 19, "train": 16, "service": 15, "info": 7},
}
# 항목마다 실제로 접속을 확인한 날을 적는다. 한 날짜로 통일하지 않는다 —
# 자동 접속 차단(403) 사이트는 마지막으로 확인한 날짜를 그대로 둔다.
ALLOWED_DATES = {"2026-11-16", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-26", "2026-11-27"}
VERIFIED_AT = "2026-11-27"
METHODS = {"curl", "curl-mobile", "browser", "official"}
REQUIRED = ["id", "name", "url", "sector", "operator", "roles", "eligibility",
            "strengths", "tips", "shows", "needs", "owner", "verified_at", "final_url", "verify_method"]
OWNERS = {"gov", "corp", "biz"}
# http_status 는 아래 verify_method 검사에서 함께 본다(official 은 null 이 정상).
OPTIONAL = ["aliases", "verify_note"]
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ID_RE = re.compile(r"^[a-z0-9_]+$")

errors = []
warnings = []


def err(m):
    errors.append(m)


def warn(m):
    warnings.append(m)


def main():
    if not os.path.exists(PATH):
        err("portals.json 파일이 없습니다: " + PATH)
        return
    with open(PATH, encoding="utf-8") as f:
        try:
            d = json.load(f)
        except json.JSONDecodeError as e:
            err("JSON 파싱 실패: %s" % e)
            return

    meta = d.get("meta") or {}
    portals = d.get("portals")
    sectors = d.get("sectors") or []
    vocab = d.get("vocabulary") or {}

    if not isinstance(portals, list):
        err("portals 가 배열이 아닙니다")
        return

    # ---- meta ----
    for k in ["dataset", "version", "sector", "built_at", "repository", "notice", "counts", "verification"]:
        if not meta.get(k):
            err("meta.%s 누락" % k)
    if meta.get("built_at") != VERIFIED_AT:
        warn("meta.built_at=%r (기대 %s)" % (meta.get("built_at"), VERIFIED_AT))
    if meta.get("version") != "1.5.0":
        warn("meta.version=%r (기대 1.5.0)" % (meta.get("version"),))

    # ---- sectors / vocabulary ----
    codes = [s.get("code") for s in sectors]
    if len(codes) != len(set(codes)):
        err("sectors.code 중복")
    for s in sectors:
        for k in ["code", "name", "desc"]:
            if not s.get(k):
                err("sectors[%s].%s 누락" % (s.get("code"), k))
    if set(codes) != set(EXPECTED["by_sector"]):
        err("sectors 코드가 기대와 다릅니다: %s" % sorted(set(codes) ^ set(EXPECTED["by_sector"])))

    # ---- goals(내담자 상황·목표) 사전 ----
    goals = d.get("goals")
    if not isinstance(goals, list) or len(goals) < 5:
        err("goals 가 없거나 너무 적습니다")
        goals = []
    g_codes, kid_codes = [], {}
    for g in goals:
        for k in ["code", "name", "desc"]:
            if not g.get(k):
                err("goals[%s].%s 누락" % (g.get("code"), k))
        if g.get("code") in g_codes:
            err("goals.code 중복: %s" % g.get("code"))
        g_codes.append(g.get("code"))
        kids = g.get("kids") or []
        if len(kids) < 2:
            err("goals[%s].kids 가 너무 적습니다" % g.get("code"))
        for kid in kids:
            for k in ["code", "name", "desc"]:
                if not kid.get(k):
                    err("goals[%s].kids[%s].%s 누락" % (g.get("code"), kid.get("code"), k))
            if kid.get("code") in kid_codes:
                err("goals 하위 code 중복: %s" % kid.get("code"))
            kid_codes[kid.get("code")] = g.get("code")

    v_roles = set(vocab.get("roles") or [])
    v_elig = set(vocab.get("eligibility") or [])
    if len(v_roles) < 10:
        err("vocabulary.roles 가 너무 적습니다")
    if len(v_elig) < 15:
        err("vocabulary.eligibility 가 너무 적습니다")

    # ---- records ----
    ids, urls, names = Counter(), Counter(), Counter()
    by_sector = Counter()
    fnum = 0
    for i, p in enumerate(portals):
        where = "portals[%d]" % i
        if not isinstance(p, dict):
            err("%s 가 객체가 아닙니다" % where)
            continue
        for k in REQUIRED:
            if k not in p or p[k] in (None, "", [], {}):
                err("%s(%s).%s 누락" % (where, p.get("id"), k))
        pid = p.get("id", "")
        where = "portals[%s]" % pid
        if pid and not ID_RE.match(pid):
            err("%s: id는 소문자·숫자·밑줄만" % where)
        ids[pid] += 1
        urls[p.get("url")] += 1
        names[p.get("name")] += 1

        url = p.get("url") or ""
        if not url.startswith("https://"):
            err("%s: https 주소가 아닙니다 (%s)" % (where, url))
        if " " in url or url.endswith("/ "):
            err("%s: 주소에 공백" % where)
        if not p.get("final_url", "").startswith("https://"):
            err("%s: final_url 이 https 가 아닙니다" % where)

        if p.get("sector") not in codes:
            err("%s: 알 수 없는 sector %r" % (where, p.get("sector")))
        else:
            by_sector[p["sector"]] += 1

        for r in p.get("roles") or []:
            if r not in v_roles:
                err("%s: vocabulary.roles 에 없는 값 %r" % (where, r))
        for e in p.get("eligibility") or []:
            if e not in v_elig:
                err("%s: vocabulary.eligibility 에 없는 값 %r" % (where, e))

        own = p.get("owner")
        if own not in OWNERS:
            err("%s: owner %r (허용 %s)" % (where, own, sorted(OWNERS)))
        nd = p.get("needs")
        if not isinstance(nd, list) or not (1 <= len(nd) <= 4):
            err("%s: needs 는 1~4개 배열이어야 합니다 (%r)" % (where, nd))
        else:
            if len(set(nd)) != len(nd):
                err("%s: needs 에 같은 값이 겹칩니다" % where)
            for x in nd:
                if x not in kid_codes:
                    err("%s: goals 에 없는 needs %r" % (where, x))

        method = p.get("verify_method")
        if method not in METHODS:
            err("%s: verify_method %r" % (where, method))
        if method == "official":
            # 공식 안내로 확인한 국내 전용 포털 — 응답 코드를 지어내지 않는다.
            if p.get("http_status") is not None:
                err("%s: official 검증은 http_status 가 null 이어야 합니다 (%r)" % (where, p.get("http_status")))
            if not str(p.get("verify_note") or "").strip():
                err("%s: official 검증은 verify_note(확인 근거·접속 제한)가 필요합니다" % where)
        else:
            if p.get("http_status") != 200:
                err("%s: http_status 가 200 이 아닙니다 (%r)" % (where, p.get("http_status")))
        if p.get("verified_at") not in ALLOWED_DATES:
            err("%s: verified_at %r (허용 %s)" % (where, p.get("verified_at"), sorted(ALLOWED_DATES)))

        shows = p.get("shows")
        if not isinstance(shows, list) or not (2 <= len(shows) <= 4):
            err("%s: shows 는 2~4개 배열이어야 합니다 (%r)" % (where, shows))
        else:
            for x in shows:
                if not isinstance(x, str) or not (2 <= len(x.strip()) <= 24):
                    err("%s: shows 항목이 2~24자가 아닙니다 (%r)" % (where, x))
                elif "<" in x or ">" in x or "http" in x.lower():
                    err("%s: shows 에 태그·주소를 넣지 않습니다 (%r)" % (where, x))
            if len(set(shows)) != len(shows):
                err("%s: shows 에 같은 항목이 겹칩니다" % where)
        al = p.get("aliases")
        if al is not None:
            if not isinstance(al, list) or not all(isinstance(x, str) and 1 <= len(x.strip()) <= 30 for x in al):
                err("%s: aliases 는 1~30자 문자열 배열이어야 합니다" % where)
            elif len(set(al)) != len(al):
                err("%s: aliases 에 같은 값이 겹칩니다" % where)

        st = p.get("strengths") or ""
        tp = p.get("tips") or ""
        if len(st) < 25:
            err("%s: strengths 가 너무 짧습니다(%d자)" % (where, len(st)))
        if len(st) > 130:
            warn("%s: strengths 가 깁니다(%d자)" % (where, len(st)))
        if len(tp) < 20:
            err("%s: tips 가 너무 짧습니다(%d자)" % (where, len(tp)))
        if len(tp) > 170:
            warn("%s: tips 가 깁니다(%d자)" % (where, len(tp)))
        for field, val in (("strengths", st), ("tips", tp), ("name", p.get("name") or "")):
            if "<" in val or ">" in val:
                err("%s: %s 에 태그 문자(<, >)가 있습니다" % (where, field))
            if "http" in val.lower():
                err("%s: %s 에 주소를 넣지 않습니다(링크는 url 필드)" % (where, field))
        if "  " in (p.get("name") or ""):
            warn("%s: 이름에 연속 공백" % where)
        if (p.get("name") or "").strip() != p.get("name"):
            err("%s: 이름 앞뒤 공백" % where)

    for pid, n in ids.items():
        if n > 1:
            err("id 중복: %s (%d건)" % (pid, n))
    for u, n in urls.items():
        if n > 1:
            err("url 중복: %s (%d건)" % (u, n))
    for nm, n in names.items():
        if n > 1:
            warn("이름 중복: %s (%d건)" % (nm, n))

    # ---- counts ----
    total = len(portals)
    if total != EXPECTED["total"]:
        err("총 건수 %d (기대 %d) — 의도한 변경이면 EXPECTED 갱신" % (total, EXPECTED["total"]))
    counts = meta.get("counts") or {}
    if counts.get("total") != total:
        err("meta.counts.total=%r 이 실제 %d 와 다릅니다" % (counts.get("total"), total))
    if counts.get("by_sector") != EXPECTED["by_sector"]:
        err("meta.counts.by_sector 가 기대와 다릅니다: %r" % (counts.get("by_sector"),))
    if counts.get("by_sector") != dict(by_sector):
        err("meta.counts.by_sector 가 실제와 다릅니다: %r vs %r" % (counts.get("by_sector"), dict(by_sector)))
    if counts.get("by_method") != dict(Counter(p.get("verify_method") for p in portals)):
        err("meta.counts.by_method 가 실제와 다릅니다")
    if counts.get("by_owner") != dict(Counter(p.get("owner") for p in portals)):
        err("meta.counts.by_owner 가 실제와 다릅니다")

    # 어떤 목표 묶음에도 사이트가 없으면 화면에서 빈 묶음이 생긴다.
    used_kids = Counter(x for p in portals for x in (p.get("needs") or []))
    for kid, gcode in kid_codes.items():
        if used_kids.get(kid, 0) == 0:
            err("goals[%s].kids[%s] 에 해당하는 사이트가 없습니다" % (gcode, kid))
    for code, n in EXPECTED["by_sector"].items():
        if by_sector.get(code, 0) != n:
            err("sector %s 실제 %d건 (기대 %d)" % (code, by_sector.get(code, 0), n))

    ver = meta.get("verification") or {}
    if ver.get("passed") != total:
        err("meta.verification.passed=%r 이 총 건수와 다릅니다" % (ver.get("passed"),))
    for x in ver.get("excluded") or []:
        for k in ["name", "url", "reason"]:
            if not x.get(k):
                err("verification.excluded 항목에 %s 누락" % k)
        if not str(x.get("reason")).strip():
            err("verification.excluded: 제외 사유가 비었습니다 (%s)" % x.get("url"))
    if len(ver.get("excluded") or []) < 1:
        warn("verification.excluded 가 비었습니다 — 접속 불가로 뺀 곳을 남겨 두세요")

    # ---- 리포트 ----
    print("portals.json  ·  총 %d곳  ·  검증일 %s" % (total, VERIFIED_AT))
    for s in sectors:
        print("   %-9s %-28s %d" % (s["code"], s["name"], by_sector.get(s["code"], 0)))
    print("   검증 방식:", dict(Counter(p.get("verify_method") for p in portals)))
    print("   운영 주체:", dict(Counter(p.get("owner") for p in portals)))
    for g in goals:
        print("   [%s] %s — %s" % (g.get("code"), g.get("name"), ", ".join(
            "%s %d" % (k["name"], used_kids.get(k["code"], 0)) for k in g.get("kids") or [])))
    print("   제외:", len(ver.get("excluded") or []), "곳")
    print("오류 %d건, 경고 %d건" % (len(errors), len(warnings)))
    for m in warnings:
        print("  [경고]", m)
    for m in errors:
        print("  [오류]", m)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
