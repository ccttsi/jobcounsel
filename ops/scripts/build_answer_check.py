#!/usr/bin/env python3
"""AUP-5 답 검사기 — 서버가 답을 검사할 때 쓰는 규칙을 만든다

  python3 ops/scripts/build_answer_check.py           # supabase/functions/assistant-proxy/check-data.js 를 다시 만든다
  python3 ops/scripts/build_answer_check.py --check    # 원천과 같은지만 본다(다르면 종료 코드 1)

왜 만드나
---------
비서의 답에 섞이는 금액·요율은 틀리면 상담사가 내담자에게 그대로 안내한다(헌법 제2조 2-3).
값은 이미 `data/legal-constants.json` 한 곳에만 있고, 이 스크립트가 그 값을 **검사 규칙**으로 옮겨
Edge Function(assistant-proxy) 번들 안의 `check-data.js` 로 넣는다. 서버는 이 파일만 읽으므로
값을 손으로 다시 적는 자리가 없다.

규칙은 두 가지를 담는다.
  · 값을 **고칠** 수 있는 규칙(fix) — 「최저임금 시급 9,860원」처럼 이름표가 숫자 바로 앞에 붙은 경우만.
    계산 중간값·예시 금액은 건드리지 않는다(오탐 0 우선).
  · 값이 **어긋났는지**만 보는 규칙 — 어긋나면 답 끝에 「※ 자료실 기준 값」 한 줄을 붙인다(고치지 않음).

자료실 안 주소(링크)는 `assets/tools.js` 의 섹터 id 만 허용한다. 섹터가 늘면 이 파일을 다시 만든다.

원칙
----
- 값을 지어내지 않는다. 원천 JSON에 있는 숫자만 옮긴다.
- 원천에 새 항목이 생겼는데 아래 RULES 에 분류가 없으면 **생성이 멈춘다** — 조용히 빠지지 않게.
- 만든 파일은 손으로 고치지 않는다. 고치면 --check 가 어긋남을 잡는다.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "legal-constants.json"
TOOLS = ROOT / "assets" / "tools.js"
TARGET = ROOT / "supabase" / "functions" / "assistant-proxy" / "check-data.js"

HEADER = """/* 자동 생성 — 손으로 고치지 않는다.
   원천: data/legal-constants.json (값·적용기간) + assets/tools.js (자료실 섹터 주소)
   다시 만들기: python3 ops/scripts/build_answer_check.py
   원천과 같은지: python3 ops/scripts/build_answer_check.py --check
   AUP-5 답 검사기(assistant/answer-check.js)가 이 규칙만 읽는다. 값은 원천에 있는 그대로다. */
"""


def _won(value: int) -> str:
    return f"{value:,}"


def _pct(value: float) -> str:
    number = round(value * 100, 4)
    text = f"{number:.4f}".rstrip("0").rstrip(".")
    return text


def _display(spec: dict) -> str:
    unit = str(spec.get("unit") or "")
    value = spec.get("value")
    if "%" in unit or unit == "비율":
        return _pct(float(value)) + "%"
    if unit.startswith("원"):
        return _won(int(value)) + "원"
    return f"{int(value):,}" + (unit.split("/")[0] if unit else "")


# ---------------------------------------------------------------- 검사 규칙
# key: data/legal-constants.json 의「그룹.값」. name: 「자료실 기준 값」 줄에 쓰는 이름.
# kind: won(금액) · pct(요율) · hours(시간)
# pre: 숫자 **바로 앞**에 와야 하는 이름표(정규식). 이게 맞아야만 그 숫자를 그 항목으로 본다.
# need: 같은 문장 안에 함께 있어야 하는 낱말(짧은 이름표가 다른 제도와 겹칠 때).
# guard: 숫자 앞 20자 안에 있으면 그 항목으로 보지 않는다(수습·월 환산 등 다른 값).
# lo·hi: 같은 항목으로 볼 금액 범위 — 이 밖의 숫자는 계산 중간값·예시로 본다.
RULES = {
    # ── 최저임금 ─────────────────────────────────────────────
    "minimumWage.hourly": dict(
        name="시급", kind="won", fix=True, lo=5000, hi=20000,
        pre=r"최저임금(?:은|는|이|가|의)?\s*(?:2026년\s*)?(?:시급|시간급|시간당)?\s*(?:은|는|이|가|은요|는요|:)?\s*",
        guard=r"수습|감액|견습|월\s*(?:급|환산|기준)|일급|8\s*시간|연봉|주휴",
    ),
    "minimumWage.daily8h": dict(
        name="일급(8시간)", kind="won", fix=False, lo=30000, hi=200000,
        pre=r"최저임금[^0-9]{0,16}(?:일급|1일(?:\s*8\s*시간)?)[^0-9]{0,8}(?:은|는|이|가|분)?\s*",
        need=r"일급",
        guard=r"하한|상한|구직급여|실업급여|소정급여",
    ),
    "minimumWage.monthly": dict(
        name="월 환산", kind="won", fix=True, lo=500000, hi=5000000,
        pre=r"최저임금[^0-9]{0,20}(?:월\s*(?:급|환산|기준)?|한\s*달)[^0-9]{0,8}(?:은|는|이|가|액)?\s*",
        guard=r"수습|감액|내담자|급여|알바|받|예시|연봉|소득",
    ),
    "minimumWage.monthlyHours": dict(
        name="월 기준시간", kind="hours", fix=False,
        pre=r"(?:월\s*(?:기준\s*)?시간|월\s*환산\s*기준)[^0-9]{0,8}(?:은|는|이|가)?\s*",
        need=r"최저임금|주\s*40\s*시간|주휴",
    ),
    "minimumWage.probationHourly": dict(
        name="수습 시급", kind="won", fix=True, lo=3000, hi=20000,
        pre=r"수습[^0-9]{0,16}(?:기간)?[^0-9]{0,10}(?:시급|시간급|시간당)?[^0-9]{0,6}(?:은|는|이|가)?\s*",
        need=r"수습",
    ),
    # ── 구직급여 ─────────────────────────────────────────────
    "jobSeeking.baseDailyCap": dict(
        name="기초일액 상한", kind="won", fix=True, lo=30000, hi=300000,
        pre=r"(?:급여)?기초(?:임금)?일액[^0-9]{0,8}(?:상한액?|최고액?|최대)?[^0-9]{0,6}(?:은|는|이|가)?\s*",
    ),
    "jobSeeking.dailyCap": dict(
        name="일액 상한", kind="won", fix=True, lo=20000, hi=300000,
        pre=r"(?:구직급여|실업급여)\s*(?:일액|일\s*지급액)?[^0-9]{0,10}(?:의\s*)?(?:상한액|상한|최고액?|최대)[^0-9]{0,6}(?:은|는|이|가)?\s*",
    ),
    "jobSeeking.rate": dict(
        name="기초일액의", kind="pct", fix=False,
        pre=r"(?:기초일액|평균임금)[^0-9]{0,6}(?:의\s*)?",
        need=r"구직급여|실업급여",
    ),
    "jobSeeking.floorRate": dict(
        name="최저임금의", kind="pct", fix=False,
        pre=r"최저임금의\s*",
        need=r"구직급여|실업급여|하한",
    ),
    "jobSeeking.floorDaily8h": dict(
        name="일액 하한", kind="won", fix=True, lo=20000, hi=300000,
        pre=r"(?:(?:구직급여|실업급여)\s*(?:일액)?[^0-9]{0,10}(?:의\s*)?)?(?:하한액|최저\s*구직급여일액)[^0-9]{0,6}(?:은|는|이|가)?\s*",
        need=r"구직급여|실업급여|최저\s*구직급여일액",
    ),
    # ── 4대보험 ──────────────────────────────────────────────
    "socialInsurance.pensionRateWorker": dict(
        name="국민연금", kind="pct", fix=False,
        pre=r"국민연금[^0-9]{0,18}(?:근로자\s*)?(?:부담)?\s*(?:요율|보험료율|부담률)?[^0-9]{0,8}(?:은|는|이|가)?\s*",
    ),
    "socialInsurance.pensionBaseMin": dict(
        name="기준소득월액 하한", kind="won", fix=False, lo=100000, hi=1000000,
        pre=r"기준소득월액[^0-9]{0,10}(?:의\s*)?(?:하한액?|최저)[^0-9]{0,6}(?:은|는|이|가)?\s*",
        need=r"국민연금|기준소득월액",
    ),
    "socialInsurance.pensionBaseMax": dict(
        name="기준소득월액 상한", kind="won", fix=False, lo=1000000, hi=20000000,
        pre=r"기준소득월액[^0-9]{0,10}(?:의\s*)?(?:상한액?|최고)[^0-9]{0,6}(?:은|는|이|가)?\s*",
        need=r"국민연금|기준소득월액",
    ),
    "socialInsurance.healthRateTotal": dict(
        name="건강보험 노사 합산", kind="pct", fix=False,
        pre=r"건강보험(?:료)?[^0-9]{0,18}(?:노사\s*합산|합산)?[^0-9]{0,8}(?:요율|보험료율|부담률|은|는|이|가)?\s*",
    ),
    "socialInsurance.healthRateWorker": dict(
        name="건강보험 근로자", kind="pct", fix=False,
        pre=r"건강보험(?:료)?[^0-9]{0,18}(?:근로자|본인|절반)[^0-9]{0,8}(?:부담)?[^0-9]{0,8}(?:요율|보험료율|부담률|은|는|이|가)?\s*",
    ),
    "socialInsurance.healthPremiumMin": dict(
        name="건강보험료 월 하한", kind="won", fix=False, lo=5000, hi=100000,
        pre=r"(?:월\s*)?보험료[^0-9]{0,8}(?:의\s*)?(?:하한액?|최저)[^0-9]{0,6}(?:은|는|이|가)?\s*",
        need=r"건강보험",
    ),
    "socialInsurance.healthPremiumMax": dict(
        name="건강보험료 월 상한", kind="won", fix=False, lo=1000000, hi=30000000,
        pre=r"(?:월\s*)?보험료[^0-9]{0,8}(?:의\s*)?(?:상한액?|최고)[^0-9]{0,6}(?:은|는|이|가)?\s*",
        need=r"건강보험",
    ),
    "socialInsurance.ltcRateOnHealth": dict(
        name="장기요양(건강보험료의)", kind="pct", fix=False,
        pre=r"(?:건강보험료|건강보험)[^0-9]{0,8}(?:의\s*)?",
        need=r"장기요양",
    ),
    "socialInsurance.employmentRateWorker": dict(
        name="고용보험", kind="pct", fix=False,
        pre=r"고용보험[^0-9]{0,24}(?:실업급여분)?[^0-9]{0,10}(?:근로자|본인)?[^0-9]{0,8}(?:부담)?[^0-9]{0,6}(?:요율|보험료율|부담률|은|는|이|가)?\s*",
    ),
}

# 지난 연도 값은 지금 값과 다르다 — 「2025년 최저임금 9,860원」처럼 연도를 밝힌 문장은 건드리지 않는다.
COMMON_GUARD = r"20(?:0\d|1\d|2[0-5])\s*년|19\d\d\s*년|작년|지난해|전년|과거"

# 검사하지 않는 항목 — 왜 빼는지 적는다(새 항목이 생기면 여기 또는 RULES 에 반드시 적어야 생성이 지나간다).
NO_CHECK = {
    "baseYear.year": "연도(2026)는 문장마다 나와 숫자만으로는 틀림을 가릴 수 없다 — 검사하지 않는다.",
}

# 「자료실 기준 값」 한 줄 — 그룹마다 한 번만 붙인다(답이 길어지지 않게).
GROUP_LINES = {
    "minimumWage": ("최저임금", ["hourly", "daily8h", "monthly", "monthlyHours", "probationHourly"]),
    "jobSeeking": ("구직급여", ["dailyCap", "baseDailyCap", "floorDaily8h", "rate", "floorRate"]),
    "socialInsurance": ("4대보험 근로자 부담", [
        "pensionRateWorker", "healthRateWorker", "healthRateTotal", "ltcRateOnHealth",
        "employmentRateWorker", "pensionBaseMin", "pensionBaseMax",
        "healthPremiumMin", "healthPremiumMax",
    ]),
}


def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def sector_ids() -> list[str]:
    text = TOOLS.read_text(encoding="utf-8")
    ids = re.findall(r"\bid\s*:\s*'([a-z0-9-]+)'", text)
    seen, out = set(), []
    for one in ids:
        if one not in seen:
            seen.add(one)
            out.append(one)
    return out


def amount_forms(spec: dict, kind: str) -> list[str]:
    """원천 값이 답에 적힐 수 있는 표기 — 이 표기가 있으면 「맞다」로 본다."""
    value = spec.get("value")
    if kind == "won":
        return [_won(int(value)) + "원"]
    if kind == "pct":
        return [_pct(float(value)) + "%"]
    return [f"{int(value):,}시간"]


def build_rules(document: dict) -> list[dict]:
    groups = document.get("groups") or {}
    rules = []
    used = set()
    for group_key, group in groups.items():
        for value_key, spec in (group.get("values") or {}).items():
            full = f"{group_key}.{value_key}"
            if full in NO_CHECK:
                used.add(full)
                continue
            if full not in RULES:
                raise SystemExit(
                    f"✗ {full} 의 검사 규칙이 없다 — 값이 새로 생겼다. ops/scripts/build_answer_check.py 의 "
                    f"RULES 에 규칙을 넣거나 NO_CHECK 에 이유를 적는다."
                )
            rule = RULES[full]
            used.add(full)
            kind = rule.get("kind") or "won"
            pre = re.sub(r"\[\^0-9\]\{0,(\d+)\}", r"[^0-9.?!\n]{0,\1}", rule.get("pre") or "")
            item = {
                "key": full,
                "group": group_key,
                "name": rule.get("name") or value_key,
                "value": spec.get("value"),
                "kind": kind,
                "forms": amount_forms(spec, kind),
                "display": _display(spec),
                "fix": bool(rule.get("fix")),
                "pre": pre,
            }
            if rule.get("need"):
                item["need"] = rule["need"]
            guard = "|".join(x for x in (rule.get("guard"), COMMON_GUARD) if x)
            item["guard"] = "(?:" + guard + ")"
            if rule.get("lo") is not None:
                item["lo"] = rule["lo"]
                item["hi"] = rule["hi"]
            rules.append(item)
    unknown = [k for k in list(RULES) + list(NO_CHECK) if k not in used]
    if unknown:
        raise SystemExit(f"✗ 규칙에만 있고 원천에는 없는 항목: {', '.join(unknown)}")
    return rules


def build_group_lines(document: dict) -> dict:
    groups = document.get("groups") or {}
    out = {}
    for group_key, (label, keys) in GROUP_LINES.items():
        values = (groups.get(group_key) or {}).get("values") or {}
        parts = []
        for key in keys:
            spec = values.get(key)
            if not spec:
                raise SystemExit(f"✗ {group_key}.{key} 가 원천에 없다 — GROUP_LINES 를 고친다")
            name = (RULES.get(f"{group_key}.{key}") or {}).get("name") or key
            # 이름이 값 표기(「4.75%」)를 이미 담고 있으면 두 번 쓰지 않는다
            shown = _display(spec)
            parts.append(shown if shown in name else f"{name} {shown}")
        out[group_key] = f"{label}: " + " · ".join(parts)
    return out


def render(document: dict) -> str:
    payload = {
        "v": "witw-assist-check-data/1.0.0",
        "updatedAt": document.get("updated_at"),
        "baseYear": ((document.get("groups") or {}).get("baseYear") or {}).get("values", {})
        .get("year", {}).get("value"),
        "sectors": sector_ids(),
        "rules": build_rules(document),
        "groups": build_group_lines(document),
    }
    body = json.dumps(payload, ensure_ascii=False, indent=1)
    return HEADER + "globalThis.JCAssistCheckData = " + body + ";\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="AUP-5 답 검사기 규칙 생성·대조")
    parser.add_argument("--check", action="store_true", help="파일을 고치지 않고 원천과 같은지만 본다")
    args = parser.parse_args()

    if not SOURCE.exists():
        print(f"✗ 원천이 없다: {SOURCE.relative_to(ROOT)}", file=sys.stderr)
        return 1
    try:
        document = load_json(SOURCE)
    except json.JSONDecodeError as exc:
        print(f"✗ 원천 JSON을 읽지 못했다 {exc.lineno}행 {exc.colno}열: {exc.msg}", file=sys.stderr)
        return 1

    wanted = render(document)
    current = TARGET.read_text(encoding="utf-8") if TARGET.exists() else None

    if args.check:
        if current == wanted:
            print(f"✓ {TARGET.relative_to(ROOT)} 가 원천과 같다")
            return 0
        print(f"✗ {TARGET.relative_to(ROOT)} 가 원천과 다르다 — "
              f"python3 ops/scripts/build_answer_check.py 로 다시 만든다", file=sys.stderr)
        return 1

    if current == wanted:
        print(f"· {TARGET.relative_to(ROOT)} 는 이미 원천과 같다")
        return 0
    TARGET.write_text(wanted, encoding="utf-8")
    print(f"✓ {TARGET.relative_to(ROOT)} 를 원천에서 다시 만들었다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
