#!/usr/bin/env python3
"""AUP-3 근거 조각 색인 — assistant/data/chunks.json

비서에게 «섹터 소개문» 대신 «실제 내용 조각»을 근거로 건네기 위한 작은 색인.
2026-11-25 AUP-2 기준선: 맞는 자료 인용 89.1% · 법정 수치 정확 16% — 근거에 금액·요율이 없어서였다.

원천(저장소 안, 저작권 걱정 없는 것만)
  · data/legal-constants.json  — 법정 수치(정부 고시·법령, 저작권법 제7조). 묶음마다 값·단위·근거 법령·고시·적용 기간을 한 조각으로.
  · law/data/laws.json         — 법전 섹터의 쉬운 풀이(자체 작성)·조문 원문(법령, 저작권법 제7조).

조각 한 개(400자 이하 — 서버 assistant-proxy 의 근거 상한과 같다)
  {"i": 번호, "s": 섹터 id, "t": 제목, "x": 본문, "u": 자료실 안 주소, "k": 찾기 낱말, "src": 원천, "as_of": 기준}

  python3 ops/scripts/build_chunks.py          # 만들기
  python3 ops/scripts/build_chunks.py --check  # 지금 파일이 원천과 같은지(CI)
"""
import ast
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assistant", "data", "chunks.json")
MAX = 400

# 법정 수치 묶음마다 함께 찾을 낱말(구어·약어) — 묶음 이름만으로는 «실급 상한»·«최저시급» 같은 말이 닿지 않는다.
LEGAL_KEYS = {
    "minimumWage": ["최저임금", "최저시급", "시급", "시간급", "월급", "월 환산", "일당", "일급", "수습", "감액", "209", "주휴", "세전"],
    "jobSeeking": ["실업급여", "구직급여", "실급", "상한", "상한액", "하한", "하한액", "기초일액", "평균임금", "하루", "일액"],
    "socialInsurance": ["4대보험", "사대보험", "국민연금", "연금", "건강보험", "건보", "장기요양", "고용보험", "요율", "보험료", "기준소득월액", "떼", "공제"],
}
LEGAL_URL = {"minimumWage": "./pay-calc/", "jobSeeking": "./pay-calc/", "socialInsurance": "./pay-calc/"}


def fmt_value(v):
    val, unit = v.get("value"), v.get("unit", "")
    if isinstance(val, float) and unit == "비율":
        pct = round(val * 100, 4)
        return (f"{pct:g}%", "")
    if isinstance(val, (int, float)):
        return (f"{int(val):,}" if float(val).is_integer() else f"{val:g}", unit)
    return (str(val), unit)


def as_list(v):
    if isinstance(v, list):
        return v
    if isinstance(v, str) and v.strip().startswith("["):
        try:
            return ast.literal_eval(v)
        except (ValueError, SyntaxError):
            return []
    return []


def clip(text, n=MAX):
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


def legal_chunks(chunks):
    d = json.load(open(os.path.join(ROOT, "data", "legal-constants.json"), encoding="utf-8"))
    for key, g in d["groups"].items():
        if key not in LEGAL_KEYS:
            continue
        head = f"{g.get('label', key)}"
        meta = " · ".join(x for x in (g.get("notice"), g.get("period") and f"적용 {g['period']}", g.get("sourceName")) if x)
        law = g.get("law", "")
        parts = []
        for vk, v in (g.get("values") or {}).items():
            if not isinstance(v, dict) or "value" not in v:
                continue
            num, unit = fmt_value(v)
            note = v.get("note", "")
            parts.append(f"{note or vk} {num}{(' ' + unit) if unit and unit != '비율' else ''}".strip())
        # 400자 안에 들어가도록 값 목록을 나눠 담는다 — 머리(이름·고시·근거)는 조각마다 되풀이한다.
        prefix = f"{head}({meta}). "
        tail = f" 근거: {law}." if law else ""
        batch = []
        for p in parts:
            trial = prefix + "; ".join(batch + [p]) + "." + tail
            if batch and len(trial) > MAX:
                chunks.append((key, batch))
                batch = [p]
            else:
                batch.append(p)
        if batch:
            chunks.append((key, batch))
    # 튜플을 조각으로 바꾼다 — 한 묶음이 둘로 나뉘면 src 에 «/1»·«/2»를 붙여 서로 지우지 않게 한다
    out, part = [], {}
    for c in chunks:
        if not isinstance(c, tuple):
            out.append(c)
            continue
        key, batch = c
        part[key] = part.get(key, 0) + 1
        g = d["groups"][key]
        meta = " · ".join(x for x in (g.get("notice"), g.get("period") and f"적용 {g['period']}", g.get("sourceName")) if x)
        law = g.get("law", "")
        text = f"{g.get('label', key)}({meta}). " + "; ".join(batch) + "." + (f" 근거: {law}." if law else "")
        out.append({"s": "pay-calc", "t": g.get("label", key), "x": clip(text), "u": LEGAL_URL[key],
                    "k": LEGAL_KEYS[key], "src": "data/legal-constants.json#" + key + "/" + str(part[key]),
                    "as_of": (g.get("applies") or {}).get("from", "")})
    return out


def law_chunks():
    d = json.load(open(os.path.join(ROOT, "law", "data", "laws.json"), encoding="utf-8"))
    out = []
    for law in d["laws"]:
        lid, name = law["id"], law["name"]
        url = f"./law/#law={lid}"
        keys = [k for k in as_list(law.get("keywords")) + as_list(law.get("chips")) if isinstance(k, str)][:24]
        eff = law.get("effective", "")
        out.append({"s": "law", "t": name, "x": clip(f"{name}(시행 {eff}): {law.get('one_line', '')} 자주 쓰는 상담: {law.get('why', '')}."),
                    "u": url, "k": keys, "src": f"law/data/laws.json#{lid}", "as_of": eff})
        for e in as_list(law.get("easy")):
            if isinstance(e, dict) and e.get("h"):
                out.append({"s": "law", "t": f"{name} — {e['h']}", "x": clip(f"{name}: {e['h']}. {e.get('p', '')}"),
                            "u": url, "k": keys, "src": f"law/data/laws.json#{lid}/easy", "as_of": eff})
        for a in law.get("articles") or []:
            body = " ".join(a.get("paras") or [])
            out.append({"s": "law", "t": f"{name} {a.get('no', '')}({a.get('title', '')})",
                        "x": clip(f"{name} {a.get('no', '')}({a.get('title', '')}) {body}"),
                        "u": url, "k": keys, "src": f"law/data/laws.json#{lid}/{a.get('no', '')}", "as_of": eff})
    return out


def build():
    chunks = legal_chunks([]) + law_chunks()
    for i, c in enumerate(chunks):
        c["i"] = i
    return {"v": "witw-chunks/1.0.0",
            "note": "AUP-3 근거 조각 — 비서가 섹터 소개문 대신 실제 내용(법정 수치·쉬운 풀이·조문)을 근거로 받는다. "
                    "ops/scripts/build_chunks.py 가 data/legal-constants.json · law/data/laws.json 에서 만든다(손으로 고치지 않는다).",
            "max_len": MAX, "chunks": chunks}


def main():
    text = json.dumps(build(), ensure_ascii=False, separators=(",", ":")) + "\n"
    if "--check" in sys.argv:
        cur = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if cur != text:
            print("assistant/data/chunks.json 이 원천과 다르다 — python3 ops/scripts/build_chunks.py")
            return 1
        print("chunks.json 최신")
        return 0
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    d = json.loads(text)
    print(f"{OUT} — 조각 {len(d['chunks'])}개 · {len(text):,}바이트")
    return 0


if __name__ == "__main__":
    sys.exit(main())
