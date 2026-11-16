#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""21번 면접 전술 덱(deck.json) 구조 검증.

    python3 interview/data/validate.py
    python3 interview/data/validate.py --selftest

오류 0건이면 통과다. 화면(클로드)은 이 파일을 고치지 않고, 고칠 것이 있으면
자료실 섹터 보드 21번 페이지에 적는다.
"""

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DECK = os.path.join(HERE, "deck.json")

REQUIRED_ENCOUNTER = [
    "id", "arena", "sub_mode", "interviewer", "question", "context",
    "answer_goal", "pressure_level", "time_limit_sec", "hidden_intent",
    "legal_flag", "legal_basis", "legal_note", "hand_cards", "coach_note",
]
REQUIRED_CARD = ["card_type", "title", "script_formula", "why_effect", "pace_split"]
REQUIRED_RQ = ["id", "company_type", "question", "verifies", "why_effect",
               "when_to_use", "avoid_when"]
REQUIRED_WP = ["id", "label", "keywords", "steps", "bridge", "avoid", "example"]
REQUIRED_TREND = ["id", "title", "fact", "evidence", "implication",
                  "source_ids", "as_of", "confidence"]
REQUIRED_SOURCE = ["id", "name", "publisher", "url", "as_of", "type", "used_for"]

CONFIDENCE = {"statute", "public_standard", "reported", "single_source"}
HTML_RE = re.compile(r"<\s*/?\s*(script|iframe|img|a|div|span|style|br|p)\b", re.I)
URL_RE = re.compile(r"https?://", re.I)
# ui_contract는 금지 규칙을 설명하므로 검사에서 뺀다.
EXPORT_WORDS = ["PDF로 저장", "인쇄하기", "복사하기", "다운로드 버튼"]

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def is_nonempty_str(v, min_len=1, max_len=None):
    if not isinstance(v, str):
        return False
    s = v.strip()
    if len(s) < min_len:
        return False
    if max_len is not None and len(s) > max_len:
        return False
    return True


def check_text(where, value, min_len=1, max_len=400):
    if not is_nonempty_str(value, min_len, max_len):
        err(f"{where}: 길이 범위({min_len}~{max_len})를 벗어났거나 문자열이 아니다")
        return
    if HTML_RE.search(value):
        err(f"{where}: HTML 태그가 들어 있다")
    if URL_RE.search(value):
        err(f"{where}: 본문에 외부 주소가 들어 있다(출처는 sources에만)")
    for w in EXPORT_WORDS:
        if w in value:
            err(f"{where}: 내보내기 금지 문구 '{w}'")


def brackets_balanced(where, text):
    if text.count("[") != text.count("]"):
        err(f"{where}: [ ] 자리표시자의 괄호 짝이 맞지 않는다")
    if text.count("{") != text.count("}"):
        err(f"{where}: {{ }} 슬롯의 괄호 짝이 맞지 않는다")
    if re.search(r"\{\w+\}", text):
        err(f"{where}: 채우지 않은 슬롯이 남아 있다")


def main():
    if not os.path.exists(DECK):
        err(f"deck.json이 없다: {DECK}")
        report()
        return
    with open(DECK, encoding="utf-8") as f:
        deck = json.load(f)

    meta = deck.get("meta", {})
    counts = meta.get("counts", {})
    voc = deck.get("vocabularies", {})
    modes = {m["code"]: m for m in voc.get("sub_modes", [])}
    arenas = {a["code"] for a in voc.get("arenas", [])}
    card_types = {c["code"] for c in voc.get("card_types", [])}
    flags = {f["code"] for f in voc.get("legal_flags", [])}
    times = set(voc.get("time_limits", []))
    company_types = set(voc.get("company_types", []))
    pace_table = deck.get("rules", {}).get("pace_table", {})

    # --- 기본 구조 -------------------------------------------------------
    for key in ["meta", "rules", "ui_contract", "vocabularies", "field_guide",
                "legal_reference", "encounters", "reverse_questions",
                "weakness_presets", "trends_2026", "sources"]:
        if key not in deck:
            err(f"최상위 키 없음: {key}")
    if meta.get("version") != "1.0.0":
        warn("meta.version이 1.0.0이 아니다")
    if meta.get("sector_no") != 21:
        err("meta.sector_no가 21이 아니다")

    # --- 어휘 -----------------------------------------------------------
    if len(modes) != 8:
        err(f"sub_modes가 8개가 아니다: {len(modes)}")
    if arenas != {"standard", "special"}:
        err(f"arenas 값이 잘못됐다: {arenas}")
    if card_types != {"trap", "defense", "counter", "shield"}:
        err(f"card_types 값이 잘못됐다: {card_types}")
    if flags != {"ok", "caution", "violation_alert"}:
        err(f"legal_flags 값이 잘못됐다: {flags}")

    # --- pace_table -----------------------------------------------------
    for t in ("30", "60", "90", "180"):
        row = pace_table.get(t)
        if not row:
            err(f"rules.pace_table에 {t}초가 없다")
            continue
        if row.get("intro", 0) + row.get("case", 0) + row.get("link", 0) != int(t):
            err(f"rules.pace_table[{t}]의 합이 {t}초가 아니다")

    # --- encounters ------------------------------------------------------
    encounters = deck.get("encounters", [])
    ids = set()
    by_mode = {}
    by_type = {}
    by_flag = {}
    for i, e in enumerate(encounters):
        where = f"encounters[{i}]"
        if not isinstance(e, dict):
            err(f"{where}: 객체가 아니다")
            continue
        for k in REQUIRED_ENCOUNTER:
            if k not in e:
                err(f"{where}: 필드 없음 {k}")
        eid = e.get("id", f"#{i}")
        where = f"{eid}"
        if not re.fullmatch(r"enc\d{2}", str(eid)):
            err(f"{where}: id 형식은 encNN")
        if eid in ids:
            err(f"{where}: id 중복")
        ids.add(eid)

        if e.get("arena") not in arenas:
            err(f"{where}: arena 값 오류")
        mode = e.get("sub_mode")
        if mode not in modes:
            err(f"{where}: sub_mode 값 오류")
        else:
            by_mode[mode] = by_mode.get(mode, 0) + 1
            if modes[mode]["arena"] != e.get("arena"):
                err(f"{where}: sub_mode({mode})와 arena({e.get('arena')})가 어긋난다")

        check_text(f"{where}.interviewer", e.get("interviewer"), 2, 60)
        check_text(f"{where}.question", e.get("question"), 8, 220)
        check_text(f"{where}.context", e.get("context"), 5, 200)
        check_text(f"{where}.answer_goal", e.get("answer_goal"), 8, 160)
        check_text(f"{where}.hidden_intent", e.get("hidden_intent"), 15, 320)
        check_text(f"{where}.coach_note", e.get("coach_note"), 5, 200)

        p = e.get("pressure_level")
        if not isinstance(p, int) or not 1 <= p <= 5:
            err(f"{where}: pressure_level은 1~5 정수")
        t = e.get("time_limit_sec")
        if t not in times:
            err(f"{where}: time_limit_sec은 {sorted(times)} 중 하나")

        fl = e.get("legal_flag")
        if fl not in flags:
            err(f"{where}: legal_flag 값 오류")
        else:
            by_flag[fl] = by_flag.get(fl, 0) + 1
        if fl == "ok":
            if e.get("legal_basis") is not None or e.get("legal_note") is not None:
                err(f"{where}: legal_flag=ok인데 legal_basis/legal_note가 있다")
        else:
            check_text(f"{where}.legal_basis", e.get("legal_basis"), 20, 600)
            check_text(f"{where}.legal_note", e.get("legal_note"), 20, 400)
            basis = e.get("legal_basis") or ""
            if not re.search(r"법|조|인권위", basis):
                err(f"{where}: legal_basis에 법령·인권위 근거가 없다")

        cards = e.get("hand_cards")
        if not isinstance(cards, list) or not 3 <= len(cards) <= 4:
            err(f"{where}: hand_cards는 3~4장")
            continue
        seen = set()
        for j, c in enumerate(cards):
            cw = f"{where}.hand_cards[{j}]"
            for k in REQUIRED_CARD:
                if k not in c:
                    err(f"{cw}: 필드 없음 {k}")
            ct = c.get("card_type")
            if ct not in card_types:
                err(f"{cw}: card_type 값 오류")
                continue
            if ct in seen:
                err(f"{cw}: 같은 카드 종류가 한 패에 두 장")
            seen.add(ct)
            by_type[ct] = by_type.get(ct, 0) + 1
            check_text(f"{cw}.title", c.get("title"), 2, 40)
            check_text(f"{cw}.script_formula", c.get("script_formula"), 10, 500)
            check_text(f"{cw}.why_effect", c.get("why_effect"), 20, 320)
            brackets_balanced(cw, c.get("script_formula", ""))

            ps = c.get("pace_split") or {}
            for k in ("intro", "case", "link"):
                v = ps.get(k)
                if not isinstance(v, int) or v < 0:
                    err(f"{cw}: pace_split.{k}는 0 이상 정수")
            note = ps.get("note")
            if not is_nonempty_str(note, 2, 60):
                err(f"{cw}: pace_split.note가 없다")
            total = sum(ps.get(k, 0) for k in ("intro", "case", "link"))
            if ct in ("defense", "shield"):
                if t in times and total != t:
                    err(f"{cw}: {ct} 카드의 시간 합({total})이 제한 시간({t})과 다르다")
                if ct == "shield" and fl == "ok":
                    warn(f"{cw}: legal_flag=ok인 질문에 shield 카드가 있다")
            if ct == "trap" and total != 0:
                err(f"{cw}: trap 카드의 시간 합은 0이어야 한다")
            if ct == "counter" and total > t:
                err(f"{cw}: counter 카드가 제한 시간을 넘는다")

        if "trap" not in seen:
            err(f"{where}: trap 카드가 없다")
        if "defense" not in seen:
            err(f"{where}: defense 카드가 없다")
        if "counter" not in seen:
            err(f"{where}: counter 카드가 없다")
        if mode == "rights_boundary" and "shield" not in seen:
            err(f"{where}: 인권·법 경계 질문에는 shield 카드가 필요하다")
        if mode == "closing_reverse" and not any(
                re.search(r"[?？]|질문|묻기", c.get("script_formula", "") + c.get("title", ""))
                for c in cards if c.get("card_type") == "counter"):
            err(f"{where}: 마지막 역질문에는 질문형 counter 카드가 필요하다")

    if not 34 <= len(encounters):
        err(f"encounters는 34장 이상이어야 한다: {len(encounters)}")
    if by_mode.get("structured_bei", 0) < 6:
        err("structured_bei는 6장 이상")
    if by_mode.get("weakness_pressure", 0) < 5:
        err("weakness_pressure는 5장 이상")
    if by_mode.get("rights_boundary", 0) < 5:
        err("rights_boundary는 5장 이상")
    if by_mode.get("closing_reverse", 0) < 4:
        err("closing_reverse는 4장 이상")
    for m in ("ai_video", "ai_thinking", "pt_case", "debate"):
        if by_mode.get(m, 0) < 4:
            err(f"{m}는 4장 이상이어야 한다: {by_mode.get(m, 0)}")
    if by_flag.get("violation_alert", 0) < 5:
        err("violation_alert 질문이 5장 이상이어야 한다")
    if by_flag.get("caution", 0) < 1:
        err("caution 질문이 1장 이상이어야 한다")

    # --- reverse_questions ----------------------------------------------
    rqs = deck.get("reverse_questions", [])
    if len(rqs) < 12:
        err(f"reverse_questions는 12종 이상: {len(rqs)}")
    rq_ids = set()
    rq_text = set()
    per_company = {}
    for i, q in enumerate(rqs):
        where = f"reverse_questions[{i}]"
        for k in REQUIRED_RQ:
            if k not in q:
                err(f"{where}: 필드 없음 {k}")
        if not re.fullmatch(r"rq\d{2}", str(q.get("id", ""))):
            err(f"{where}: id 형식은 rqNN")
        if q.get("id") in rq_ids:
            err(f"{where}: id 중복")
        rq_ids.add(q.get("id"))
        ct = q.get("company_type")
        if ct not in company_types:
            err(f"{where}: company_type 값 오류: {ct}")
        else:
            per_company[ct] = per_company.get(ct, 0) + 1
        check_text(f"{where}.question", q.get("question"), 10, 200)
        if q.get("question") in rq_text:
            err(f"{where}: 질문이 중복된다")
        rq_text.add(q.get("question"))
        if "?" not in (q.get("question") or ""):
            err(f"{where}: 질문이 물음표로 끝나지 않는다")
        check_text(f"{where}.verifies", q.get("verifies"), 3, 80)
        check_text(f"{where}.why_effect", q.get("why_effect"), 15, 260)
        check_text(f"{where}.when_to_use", q.get("when_to_use"), 3, 80)
        check_text(f"{where}.avoid_when", q.get("avoid_when"), 8, 200)
    for ct in company_types:
        if per_company.get(ct, 0) < 3:
            err(f"reverse_questions에 {ct} 유형이 3종 미만")

    # --- weakness_presets ------------------------------------------------
    wps = deck.get("weakness_presets", [])
    if len(wps) < 6:
        err(f"weakness_presets는 6종 이상: {len(wps)}")
    wp_ids = set()
    for i, w in enumerate(wps):
        where = f"weakness_presets[{i}]"
        for k in REQUIRED_WP:
            if k not in w:
                err(f"{where}: 필드 없음 {k}")
        if not re.fullmatch(r"wp\d{2}", str(w.get("id", ""))):
            err(f"{where}: id 형식은 wpNN")
        if w.get("id") in wp_ids:
            err(f"{where}: id 중복")
        wp_ids.add(w.get("id"))
        check_text(f"{where}.label", w.get("label"), 2, 30)
        if not isinstance(w.get("keywords"), list) or len(w["keywords"]) < 3:
            err(f"{where}: keywords는 3개 이상 배열")
        steps = w.get("steps") or {}
        for k in ("acknowledge", "pivot", "proof"):
            check_text(f"{where}.steps.{k}", steps.get(k), 10, 260)
        check_text(f"{where}.bridge", w.get("bridge"), 10, 200)
        check_text(f"{where}.avoid", w.get("avoid"), 10, 200)
        check_text(f"{where}.example", w.get("example"), 40, 600)
        if "[" not in (w.get("example") or ""):
            warn(f"{where}: example에 [ ] 자리표시자가 없다")

    # --- trends & sources ------------------------------------------------
    sources = deck.get("sources", [])
    src_ids = set()
    for i, s in enumerate(sources):
        where = f"sources[{i}]"
        for k in REQUIRED_SOURCE:
            if k not in s:
                err(f"{where}: 필드 없음 {k}")
        sid = s.get("id")
        if not re.fullmatch(r"s\d{1,2}", str(sid)):
            err(f"{where}: id 형식은 sNN")
        if sid in src_ids:
            err(f"{where}: id 중복")
        src_ids.add(sid)
        if not str(s.get("url", "")).startswith("https://"):
            err(f"{where}: url은 https여야 한다")
        check_text(f"{where}.name", s.get("name"), 4, 200)
        check_text(f"{where}.used_for", s.get("used_for"), 4, 160)

    trends = deck.get("trends_2026", [])
    if len(trends) < 8:
        err(f"trends_2026은 8종 이상: {len(trends)}")
    tr_ids = set()
    for i, tr in enumerate(trends):
        where = f"trends_2026[{i}]"
        for k in REQUIRED_TREND:
            if k not in tr:
                err(f"{where}: 필드 없음 {k}")
        if not re.fullmatch(r"tr\d{2}", str(tr.get("id", ""))):
            err(f"{where}: id 형식은 trNN")
        if tr.get("id") in tr_ids:
            err(f"{where}: id 중복")
        tr_ids.add(tr.get("id"))
        check_text(f"{where}.title", tr.get("title"), 6, 80)
        check_text(f"{where}.fact", tr.get("fact"), 15, 200)
        check_text(f"{where}.evidence", tr.get("evidence"), 30, 700)
        check_text(f"{where}.implication", tr.get("implication"), 10, 200)
        if tr.get("confidence") not in CONFIDENCE:
            err(f"{where}: confidence 값 오류")
        sids = tr.get("source_ids")
        if not isinstance(sids, list) or not sids:
            err(f"{where}: source_ids가 비어 있다")
        else:
            for sid in sids:
                if sid not in src_ids:
                    err(f"{where}: 없는 출처 id {sid}")
        if not re.search(r"\d", tr.get("evidence") or ""):
            warn(f"{where}: evidence에 수치가 없다")
        check_text(f"{where}.as_of", tr.get("as_of"), 2, 40)

    # --- legal_reference -------------------------------------------------
    for i, lr in enumerate(deck.get("legal_reference", [])):
        where = f"legal_reference[{i}]"
        if not is_nonempty_str(lr.get("law"), 4, 60):
            err(f"{where}: law 없음")
        if not lr.get("articles"):
            err(f"{where}: articles 없음")
        for a in lr.get("articles", []):
            if not a.get("no") or not a.get("summary"):
                err(f"{where}: article의 no·summary 누락")
        for sid in lr.get("source_ids", []):
            if sid not in src_ids:
                err(f"{where}: 없는 출처 id {sid}")

    # --- meta.counts 대조 -------------------------------------------------
    measured = {
        "encounters": len(encounters),
        "arena_standard": sum(1 for e in encounters if e.get("arena") == "standard"),
        "arena_special": sum(1 for e in encounters if e.get("arena") == "special"),
        "by_sub_mode": by_mode,
        "hand_cards": sum(len(e.get("hand_cards", [])) for e in encounters),
        "by_card_type": by_type,
        "legal_flags": by_flag,
        "reverse_questions": len(rqs),
        "weakness_presets": len(wps),
        "trends": len(trends),
        "sources": len(sources),
    }
    for k, v in measured.items():
        if counts.get(k) != v:
            err(f"meta.counts.{k}가 실측({v})과 다르다: {counts.get(k)}")

    report()


def selftest():
    """화면이 카드만으로 답변 뼈대를 만들 수 있는지 확인한다."""
    with open(DECK, encoding="utf-8") as f:
        deck = json.load(f)
    times = set(deck["vocabularies"]["time_limits"])
    rows = []
    for e in deck["encounters"]:
        cards = {c["card_type"]: c for c in e["hand_cards"]}
        main = cards.get("shield") if e["legal_flag"] != "ok" and "shield" in cards else cards.get("defense")
        total = sum(main["pace_split"][k] for k in ("intro", "case", "link"))
        marks = len(re.findall(r"[①②③④]", main["script_formula"]))
        slots = len(re.findall(r"\[[^\]]+\]", main["script_formula"]))
        rows.append((e["id"], main["card_type"], e["time_limit_sec"], total, marks, slots, len(cards)))
        if total != e["time_limit_sec"]:
            err(f"selftest {e['id']}: {main['card_type']} 시간 합 불일치")
        if main["card_type"] == "shield" and e["legal_flag"] == "ok":
            err(f"selftest {e['id']}: shield가 정상 질문에 붙었다")
        if marks < 2:
            warn(f"selftest {e['id']}: {main['card_type']} 카드의 단계 표시가 2개 미만")
        if slots < 1:
            warn(f"selftest {e['id']}: {main['card_type']} 카드에 [ ] 자리가 없다")
        if not 3 <= len(cards) <= 4:
            err(f"selftest {e['id']}: 카드 수가 3~4장이 아니다")
    if len(rows) != len(deck["encounters"]):
        err("selftest: 모든 질문을 확인하지 못했다")

    # 약점 프리셋 3단 공식이 슬롯을 포함하는지
    for w in deck["weakness_presets"]:
        joined = " ".join(w["steps"].values())
        if "[" not in joined:
            warn(f"selftest {w['id']}: 3단 공식에 [ ] 자리가 없다")

    # 역질문이 4개 기업 유형에 고루 있는지
    per = {}
    for q in deck["reverse_questions"]:
        per[q["company_type"]] = per.get(q["company_type"], 0) + 1
    for ct, n in per.items():
        rows.append((ct, "reverse", "-", "-", "-", "-", n))

    print("== selftest ==")
    for r in rows:
        print("  ", " · ".join(str(x) for x in r))
    print(f"  카드 조립 확인 {len(deck['encounters'])}건 · 제한 시간 {sorted(times)}")
    report()


def report():
    print(f"\n검증 결과: 오류 {len(errors)}건, 경고 {len(warnings)}건")
    for e in errors:
        print("  [오류]", e)
    for w in warnings:
        print("  [경고]", w)
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true", help="카드 조립 참조 구현까지 실행")
    args = ap.parse_args()
    if args.selftest:
        selftest()
    else:
        main()
