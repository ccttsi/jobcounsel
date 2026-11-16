#!/usr/bin/env python3
"""서류·공고 해부실(surgery) 데이터 검증 스크립트.

사용:
    python3 surgery/data/validate.py            # 구조 검증 (오류 0건이어야 배포)
    python3 surgery/data/validate.py --selftest  # 문장 조립 엔진 모의 실행까지

네트워크를 쓰지 않는다. 두 파일(anatomy.json · lexicon.json)만 읽는다.
종료 코드 0 = 오류 0건(경고는 있어도 무관), 1 = 오류 있음.

이 파일의 assemble()은 화면(클로드)이 구현할 조립 규칙을 그대로 옮긴 참조 구현이다.
화면이 같은 결과를 내는지 대조하는 기준으로 쓴다. 난수를 쓰지 않으므로 같은 입력은 같은 문장이 나온다.
"""
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ANATOMY = os.path.join(HERE, "anatomy.json")
LEXICON = os.path.join(HERE, "lexicon.json")

BUILT_AT = "2026-11-16"
SECTOR_NO = 20
EXPECTED_JD = 28
EXPECTED_XR = 22
EXPECTED_LAYOUTS = 6
EXPECTED_TONES = 4
EXPECTED_TEMPLATES_PER_PURPOSE = 3
SLOT_RE = re.compile(r"\{([a-z_]+)\}")
ID_JD = re.compile(r"^jd\d{2}$")
ID_XR = re.compile(r"^xr\d{2}$")
ID_LAY = re.compile(r"^lay_[a-z]+$")
FORBIDDEN = ["<", ">", "http://", "https://", "www.", "PDF로 저장", "인쇄하기", "복사하기"]

errors = []
warnings = []


def err(m):
    errors.append(m)


def warn(m):
    warnings.append(m)


def text_ok(value, where, lo, hi, label):
    if not isinstance(value, str):
        err("%s: %s 가 문자열이 아닙니다" % (where, label))
        return ""
    s = value.strip()
    if len(s) < lo:
        err("%s: %s 가 너무 짧습니다(%d자)" % (where, label, len(s)))
    if len(s) > hi:
        warn("%s: %s 가 깁니다(%d자)" % (where, label, len(s)))
    for bad in FORBIDDEN:
        if bad in s:
            err("%s: %s 에 금지 문자열 %r" % (where, label, bad))
    if "  " in s:
        warn("%s: %s 에 연속 공백" % (where, label))
    return s


def slots_in(template):
    return SLOT_RE.findall(template)


# --------------------------------------------------------------------------- #
# 검증
# --------------------------------------------------------------------------- #

def load(path):
    if not os.path.exists(path):
        err("파일이 없습니다: " + path)
        return None
    with open(path, encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError as e:
            err("%s JSON 파싱 실패: %s" % (os.path.basename(path), e))
            return None


def check_anatomy(d):
    meta = d.get("meta") or {}
    for k in ["dataset", "version", "sector", "sector_no", "built_at", "repository",
              "license", "notice", "counts", "verification"]:
        if not meta.get(k):
            err("anatomy.meta.%s 누락" % k)
    if meta.get("sector_no") != SECTOR_NO:
        err("anatomy.meta.sector_no=%r (기대 %d)" % (meta.get("sector_no"), SECTOR_NO))
    if meta.get("built_at") != BUILT_AT:
        warn("anatomy.meta.built_at=%r (기대 %s)" % (meta.get("built_at"), BUILT_AT))

    modules = d.get("modules") or []
    if [m.get("id") for m in modules] != ["jd_anatomy", "xray_cases", "resume_layouts", "lexicon_assembly"]:
        err("anatomy.modules 는 4개 모듈(jd_anatomy · xray_cases · resume_layouts · lexicon_assembly)이 순서대로 있어야 합니다")
    for m in modules:
        for k in ["id", "no", "name", "one_line", "input", "output"]:
            if not m.get(k):
                err("anatomy.modules[%s].%s 누락" % (m.get("id"), k))

    vocab = d.get("vocabularies") or {}
    clusters = {c.get("code") for c in vocab.get("clusters") or []}
    signals = [s.get("code") for s in vocab.get("signal_types") or []]
    themes = vocab.get("xray_themes") or []
    formats = {f.get("code") for f in vocab.get("resume_formats") or []}
    sections = vocab.get("resume_sections") or []
    if clusters != {"competency_hype", "conditions", "culture", "qualification", "growth", "scope"}:
        err("anatomy.vocabularies.clusters 가 6개 범주와 다릅니다: %s" % sorted(clusters))
    if signals != ["green", "yellow", "red"]:
        err("anatomy.vocabularies.signal_types 는 green·yellow·red 순서여야 합니다")
    if len(themes) < 20:
        err("anatomy.vocabularies.xray_themes 가 너무 적습니다(%d)" % len(themes))
    if formats != {"chronological", "functional", "hybrid"}:
        err("anatomy.vocabularies.resume_formats 가 3종과 다릅니다")
    if len(sections) < 8:
        err("anatomy.vocabularies.resume_sections 가 너무 적습니다(%d)" % len(sections))

    # ① 채용공고 해부학
    jd = d.get("jd_anatomy")
    if not isinstance(jd, list):
        err("anatomy.jd_anatomy 가 배열이 아닙니다")
        return None
    if not (24 <= len(jd) <= 30):
        err("anatomy.jd_anatomy %d건 (기대 24~30)" % len(jd))
    if len(jd) != EXPECTED_JD:
        warn("anatomy.jd_anatomy %d건 (meta.counts 는 %d)" % (len(jd), EXPECTED_JD))
    ids, phrases = Counter(), Counter()
    sig = Counter()
    for i, item in enumerate(jd):
        where = "jd_anatomy[%d]" % i
        if not isinstance(item, dict):
            err("%s 가 객체가 아닙니다" % where)
            continue
        jid = item.get("id", "")
        where = "jd_anatomy[%s]" % jid
        if not ID_JD.match(jid or ""):
            err("%s: id 형식은 jd00" % where)
        ids[jid] += 1
        phrases[item.get("phrase")] += 1
        text_ok(item.get("phrase"), where, 4, 40, "phrase")
        if item.get("cluster") not in clusters:
            err("%s: 알 수 없는 cluster %r" % (where, item.get("cluster")))
        st = item.get("signal_type")
        if st not in signals:
            err("%s: signal_type %r" % (where, st))
        else:
            sig[st] += 1
        text_ok(item.get("hidden_intent"), where, 40, 240, "hidden_intent")
        cs = item.get("counter_scalpel") or {}
        for k in ["appeal", "question", "verify"]:
            if not cs.get(k):
                err("%s: counter_scalpel.%s 누락" % (where, k))
        text_ok(cs.get("appeal", ""), where, 30, 200, "counter_scalpel.appeal")
        text_ok(cs.get("question", ""), where, 10, 140, "counter_scalpel.question")
        text_ok(cs.get("verify", ""), where, 4, 80, "counter_scalpel.verify")
        if not cs.get("question", "").rstrip().endswith(("?", "가요?", "나요?")):
            warn("%s: question 이 질문형으로 끝나지 않습니다" % where)
    for jid, n in ids.items():
        if n > 1:
            err("jd_anatomy id 중복: %s (%d건)" % (jid, n))
    for p, n in phrases.items():
        if n > 1:
            err("jd_anatomy phrase 중복: %s (%d건)" % (p, n))
    for code in ["green", "yellow", "red"]:
        if sig.get(code, 0) < 3:
            err("signal_type %s 가 %d건 — 신호등 세 가지가 모두 3건 이상이어야 합니다" % (code, sig.get(code, 0)))

    # ② 탈출 문장 X-선
    xr = d.get("xray_cases")
    if not isinstance(xr, list):
        err("anatomy.xray_cases 가 배열이 아닙니다")
        return sig
    if not (20 <= len(xr) <= 24):
        err("anatomy.xray_cases %d건 (기대 20~24)" % len(xr))
    xids, used_themes = Counter(), Counter()
    for i, c in enumerate(xr):
        where = "xray_cases[%d]" % i
        if not isinstance(c, dict):
            err("%s 가 객체가 아닙니다" % where)
            continue
        cid = c.get("id", "")
        where = "xray_cases[%s]" % cid
        if not ID_XR.match(cid or ""):
            err("%s: id 형식은 xr00" % where)
        xids[cid] += 1
        th = c.get("theme")
        if th not in themes:
            err("%s: 알 수 없는 theme %r" % (where, th))
        used_themes[th] += 1
        text_ok(c.get("before"), where, 10, 140, "before")
        text_ok(c.get("xray_diagnosis"), where, 40, 260, "xray_diagnosis")
        text_ok(c.get("rule"), where, 10, 180, "rule")
        text_ok(c.get("after_star"), where, 20, 320, "after_star")
        text_ok(c.get("metric_hint"), where, 2, 60, "metric_hint")
        star = c.get("star") or {}
        for k in ["S", "T", "A", "R"]:
            if not star.get(k):
                err("%s: star.%s 누락" % (where, k))
        if "[숫자]" not in (c.get("after_star") or "") and "[기간]" not in (c.get("after_star") or ""):
            warn("%s: after_star 에 수치 슬롯([숫자]/[기간])이 없습니다" % where)
    for cid, n in xids.items():
        if n > 1:
            err("xray_cases id 중복: %s (%d건)" % (cid, n))
    if len(used_themes) < 18:
        warn("xray_cases 테마 종류가 %d개입니다" % len(used_themes))

    # ③ 상황별 이력서 재배치
    lay = d.get("resume_layouts")
    if not isinstance(lay, list):
        err("anatomy.resume_layouts 가 배열이 아닙니다")
        return sig
    if len(lay) < EXPECTED_LAYOUTS:
        err("anatomy.resume_layouts %d건 (기대 %d 이상)" % (len(lay), EXPECTED_LAYOUTS))
    lids = Counter()
    for i, l in enumerate(lay):
        where = "resume_layouts[%d]" % i
        if not isinstance(l, dict):
            err("%s 가 객체가 아닙니다" % where)
            continue
        lid = l.get("id", "")
        where = "resume_layouts[%s]" % lid
        if not ID_LAY.match(lid or ""):
            err("%s: id 형식은 lay_이름" % where)
        lids[lid] += 1
        text_ok(l.get("situation"), where, 2, 40, "situation")
        if l.get("recommended_format") not in formats:
            err("%s: recommended_format %r" % (where, l.get("recommended_format")))
        order = l.get("section_order") or []
        if not (4 <= len(order) <= 8):
            err("%s: section_order %d개 (기대 4~8)" % (where, len(order)))
        if len(set(order)) != len(order):
            err("%s: section_order 에 중복 섹션" % where)
        for s in order:
            if s not in sections:
                err("%s: 알 수 없는 섹션 %r" % (where, s))
        if "프로필(한 줄 요약)" not in order:
            warn("%s: section_order 첫머리에 프로필이 없습니다" % where)
        text_ok(l.get("format_reason"), where, 20, 260, "format_reason")
        text_ok(l.get("order_reason"), where, 20, 260, "order_reason")
        text_ok(l.get("cautions"), where, 10, 200, "cautions")
        ds = l.get("defense_scripts") or []
        if not (2 <= len(ds) <= 3):
            err("%s: defense_scripts %d종 (기대 2~3)" % (where, len(ds)))
        for j, s in enumerate(ds):
            w = "%s.defense_scripts[%d]" % (where, j)
            for k in ["question", "formula", "example"]:
                if not s.get(k):
                    err("%s: %s 누락" % (w, k))
            text_ok(s.get("example", ""), w, 15, 220, "example")
    for lid, n in lids.items():
        if n > 1:
            err("resume_layouts id 중복: %s (%d건)" % (lid, n))

    # meta.counts 대조
    counts = meta.get("counts") or {}
    if counts.get("jd_anatomy") != len(jd):
        err("anatomy.meta.counts.jd_anatomy=%r 이 실제 %d 와 다릅니다" % (counts.get("jd_anatomy"), len(jd)))
    if counts.get("xray_cases") != len(xr):
        err("anatomy.meta.counts.xray_cases=%r 이 실제 %d 와 다릅니다" % (counts.get("xray_cases"), len(xr)))
    if counts.get("resume_layouts") != len(lay):
        err("anatomy.meta.counts.resume_layouts=%r 이 실제 %d 와 다릅니다" % (counts.get("resume_layouts"), len(lay)))
    if (counts.get("signal_types") or {}) != {k: sig[k] for k in ["green", "yellow", "red"] if sig[k]}:
        err("anatomy.meta.counts.signal_types 가 실제 분포와 다릅니다: 실제 %r" % dict(sig))
    return sig


def check_lexicon(d, tone_ids_ref):
    meta = d.get("meta") or {}
    for k in ["dataset", "version", "sector", "built_at", "repository", "license", "notice", "counts"]:
        if not meta.get(k):
            err("lexicon.meta.%s 누락" % k)

    exposure = d.get("exposure") or {}
    if exposure.get("visible") is not False:
        err("lexicon.exposure.visible 은 false 여야 합니다(비노출 원칙)")
    if exposure.get("export_forbidden") is not True:
        err("lexicon.exposure.export_forbidden 은 true 여야 합니다")
    if not exposure.get("ui_rule"):
        err("lexicon.exposure.ui_rule 누락")

    categories = {c.get("code"): c for c in d.get("categories") or []}
    if not (5 <= len(categories) <= 6):
        err("lexicon.categories %d개 (기대 5~6)" % len(categories))
    for code, c in categories.items():
        for k in ["name", "desc", "category_hints", "fallback"]:
            if not c.get(k):
                err("lexicon.categories[%s].%s 누락" % (code, k))
        fb = c.get("fallback") or {}
        for k in ["context", "core_competencies", "action_verbs", "metric_prompts", "evidence_patterns"]:
            if not fb.get(k):
                err("lexicon.categories[%s].fallback.%s 누락" % (code, k))

    assembly = d.get("assembly") or {}
    slots = [s.get("token") for s in assembly.get("slots") or []]
    needed_slots = {"{keyword}", "{context}", "{competency}", "{verb}", "{metric}"}
    if not needed_slots.issubset(set(slots)):
        err("lexicon.assembly.slots 에 슬롯이 빠졌습니다: %s" % sorted(needed_slots - set(slots)))
    steps = assembly.get("steps") or []
    if len(steps) < 6:
        err("lexicon.assembly.steps 가 %d단계 — 폴백까지 6단계 이상이어야 합니다" % len(steps))
    if not assembly.get("suffix_strip"):
        err("lexicon.assembly.suffix_strip 누락")
    if not (assembly.get("fallback") or {}).get("generic"):
        err("lexicon.assembly.fallback.generic 누락")
    else:
        g = assembly["fallback"]["generic"]
        for k in ["context", "core_competencies", "action_verbs", "metric_prompts", "evidence_patterns"]:
            if not g.get(k):
                err("lexicon.assembly.fallback.generic.%s 누락" % k)
    oc = assembly.get("output_contract") or {}
    if oc.get("tone_order") != tone_ids_ref:
        err("lexicon.assembly.output_contract.tone_order 가 tone_frames 순서와 다릅니다")
    if not (2 <= len(oc.get("tone_order") or []) <= 4):
        err("tone_order 는 2~4개여야 합니다")
    for k in ["max_length"]:
        if not oc.get(k):
            err("lexicon.assembly.output_contract.%s 누락" % k)

    entries = d.get("entries")
    if not isinstance(entries, list):
        err("lexicon.entries 가 배열이 아닙니다")
        return 0, 0
    if len(entries) < 40:
        err("lexicon.entries %d개 (기대 40 이상)" % len(entries))
    ids, keywords, cat_count = Counter(), {}, Counter()
    for i, e in enumerate(entries):
        where = "entries[%d]" % i
        if not isinstance(e, dict):
            err("%s 가 객체가 아닙니다" % where)
            continue
        eid = e.get("id", "")
        where = "entries[%s]" % eid
        ids[eid] += 1
        if not re.match(r"^[a-z]+_[a-z0-9]+$", eid or ""):
            err("%s: id 는 소문자·숫자·밑줄(범주_이름) 형식" % where)
        cat = e.get("category")
        if cat not in categories:
            err("%s: 알 수 없는 category %r" % (where, cat))
        else:
            cat_count[cat] += 1
        text_ok(e.get("context", ""), where, 2, 40, "context")

        kw = e.get("trigger_keywords") or []
        if not (3 <= len(kw) <= 8):
            err("%s: trigger_keywords %d개 (기대 3~8)" % (where, len(kw)))
        for k in kw:
            if not isinstance(k, str) or len(k.strip()) < 2:
                err("%s: trigger_keywords 에 너무 짧거나 빈 값" % where)
                continue
            if k != k.strip():
                err("%s: trigger_keywords 앞뒤 공백 %r" % (where, k))
            if k in keywords:
                err("trigger_keywords 중복 %r (%s ↔ %s)" % (k, keywords[k], eid))
            else:
                keywords[k] = eid
        for field, lo, hi in [("core_competencies", 2, 4), ("action_verbs", 2, 5),
                              ("metric_prompts", 2, 4), ("evidence_patterns", 1, 3)]:
            arr = e.get(field) or []
            if not (lo <= len(arr) <= hi):
                err("%s: %s %d개 (기대 %d~%d)" % (where, field, len(arr), lo, hi))
            for v in arr:
                text_ok(v, where, 2, 120, field)
        if not any("[숫자]" in m or "[기간]" in m for m in (e.get("metric_prompts") or [])):
            err("%s: metric_prompts 에 수치 슬롯([숫자]/[기간])이 하나도 없습니다" % where)

    for eid, n in ids.items():
        if n > 1:
            err("lexicon entries id 중복: %s (%d건)" % (eid, n))

    frames = d.get("tone_frames") or []
    if len(frames) < EXPECTED_TONES:
        err("lexicon.tone_frames %d개 (기대 %d 이상)" % (len(frames), EXPECTED_TONES))
    fids = [f.get("id") for f in frames]
    if len(set(fids)) != len(fids):
        err("lexicon.tone_frames id 중복")
    template_count = 0
    for f in frames:
        where = "tone_frames[%s]" % f.get("id")
        for k in ["name", "mood", "best_for", "purposes"]:
            if not f.get(k):
                err("%s: %s 누락" % (where, k))
        purposes = f.get("purposes") or {}
        if set(purposes) != {"resume_line", "cover_para"}:
            err("%s: purposes 는 resume_line·cover_para 두 용도여야 합니다" % where)
        for p in ["resume_line", "cover_para"]:
            arr = purposes.get(p) or []
            if len(arr) < EXPECTED_TEMPLATES_PER_PURPOSE:
                err("%s: purposes.%s %d개 (기대 %d 이상)" % (where, p, len(arr), EXPECTED_TEMPLATES_PER_PURPOSE))
            for t in arr:
                template_count += 1
                text_ok(t, where, 10, 400, "purposes.%s template" % p)
                found = slots_in(t)
                if not found:
                    err("%s: %s 템플릿에 슬롯이 없습니다 — %r" % (where, p, t))
                for s in found:
                    if "{%s}" % s not in slots:
                        err("%s: %s 템플릿에 정의되지 않은 슬롯 {%s}" % (where, p, s))
                if t.count("{") != t.count("}"):
                    err("%s: %s 템플릿의 중괄호 짝이 맞지 않습니다 — %r" % (where, p, t))
                if not any(ph in t for ph in ("[숫자]", "[기간]", "{metric}")):
                    warn("%s: %s 템플릿에 수치 자리가 없습니다 — %r" % (where, p, t))

    counts = meta.get("counts") or {}
    if counts.get("entries") != len(entries):
        err("lexicon.meta.counts.entries=%r 이 실제 %d 와 다릅니다" % (counts.get("entries"), len(entries)))
    if counts.get("trigger_keywords") != len(keywords):
        err("lexicon.meta.counts.trigger_keywords=%r 이 실제 %d 와 다릅니다" % (counts.get("trigger_keywords"), len(keywords)))
    if counts.get("tone_frames") != len(frames):
        err("lexicon.meta.counts.tone_frames=%r 이 실제 %d 와 다릅니다" % (counts.get("tone_frames"), len(frames)))
    if counts.get("templates") != template_count:
        err("lexicon.meta.counts.templates=%r 이 실제 %d 와 다릅니다" % (counts.get("templates"), template_count))
    if counts.get("categories") != len(categories):
        err("lexicon.meta.counts.categories=%r 이 실제 %d 와 다릅니다" % (counts.get("categories"), len(categories)))

    if len(keywords) < 150:
        err("키워드 %d개 (기대 150 이상)" % len(keywords))
    if len(keywords) > 300:
        warn("키워드 %d개 — 300개를 넘으면 화면에서 입력 해석이 느슨해질 수 있습니다" % len(keywords))
    return len(keywords), len(entries)


# --------------------------------------------------------------------------- #
# 참조 구현: 조립 엔진
# --------------------------------------------------------------------------- #

def find_entry(word, lex):
    """정확 → 부분 → 범주 → 일반 폴백 순서로 entry를 고른다."""
    raw = word.strip()
    norm = raw.lower().replace(" ", "")
    entries = lex["entries"]
    strip = sorted(lex["assembly"]["suffix_strip"], key=len, reverse=True)
    changed = True
    while changed:
        changed = False
        for s in strip:
            if len(norm) > len(s) + 1 and norm.endswith(s):
                norm = norm[: -len(s)]
                changed = True
    # 1) 정확 — 정규화한 입력이 키워드와 같은 경우
    for e in entries:
        for k in e["trigger_keywords"]:
            if norm == k.replace(" ", ""):
                return e, "exact"
    # 2) 부분 일치(2글자 이상)
    best, best_len = None, 0
    for e in entries:
        for k in e["trigger_keywords"]:
            kn = k.replace(" ", "")
            if len(kn) >= 2 and (kn in norm or (len(norm) >= 2 and norm in kn)):
                if len(kn) > best_len:
                    best, best_len = e, len(kn)
    if best is not None:
        return best, "partial"
    # 3) 범주 폴백
    for c in lex["categories"]:
        for hint in c["category_hints"]:
            if hint.replace(" ", "") in norm:
                fb = dict(c["fallback"])
                fb["id"] = "fallback_" + c["code"]
                fb["category"] = c["code"]
                return fb, "category"
    # 4) 일반 폴백
    g = dict(lex["assembly"]["fallback"]["generic"])
    g["id"] = "fallback_generic"
    g["category"] = "generic"
    return g, "generic"


BATCHIM_TAIL = {"을(를)": ("을", "를"), "은(는)": ("은", "는"), "이(가)": ("이", "가"), "으로(로)": ("으로", "로")}


def _has_batchim(text):
    """마지막 한글 음절에 받침이 있는지. 한글이 아니면 받침 있음으로 본다."""
    for ch in reversed(text):
        if "가" <= ch <= "힣":
            return (ord(ch) - 0xAC00) % 28 != 0
        if ch.isalnum() or ch in ")]}":
            return True
    return True


def _ends_with_rieul(text):
    for ch in reversed(text):
        return "가" <= ch <= "힣" and (ord(ch) - 0xAC00) % 28 == 8
    return False


def fix_particles(s):
    """'고객 응대을(를)' 처럼 앞말에 따라 갈리는 조사를 실제 조사로 확정한다."""
    out = s
    for pair, (with_b, without_b) in BATCHIM_TAIL.items():
        pattern = re.compile(r"(\S+?)" + re.escape(pair))

        def rep(m, with_b=with_b, without_b=without_b, pair=pair):
            word = m.group(1)
            if pair == "으로(로)":
                # 받침이 없거나 ㄹ 받침이면 '로', 그 밖의 받침이면 '으로'
                return word + ("로" if (not _has_batchim(word) or _ends_with_rieul(word)) else "으로")
            return word + (with_b if _has_batchim(word) else without_b)

        out = pattern.sub(rep, out)
    # '엑셀이었습니다' / '문서정리였습니다' 처럼 서술격 조사도 앞말에 맞춘다
    def rep_ieot(m):
        word = m.group(1)
        return word + ("이었습니다" if _has_batchim(word) else "였습니다")

    out = re.sub(r"(\S+?)이었습니다", rep_ieot, out)
    return out


def assemble(word, lex, purpose="cover_para", tone=None):
    entry, how = find_entry(word, lex)
    frames = [f for f in lex["tone_frames"] if tone is None or f["id"] == tone]
    frames = frames[:4]
    out = []
    for i, f in enumerate(frames):
        tpl = f["purposes"][purpose][i % len(f["purposes"][purpose])]
        values = {
            "keyword": word.strip(),
            "context": entry["context"],
            "competency": entry["core_competencies"][i % len(entry["core_competencies"])],
            "verb": entry["action_verbs"][(i + 1) % len(entry["action_verbs"])],
            "metric": entry["metric_prompts"][(i + 2) % len(entry["metric_prompts"])],
            "evidence": entry["evidence_patterns"][0],
        }
        s = tpl
        for k, v in values.items():
            s = s.replace("{%s}" % k, v)
        s = fix_particles(s)
        out.append({"tone": f["id"], "tone_kr": f["name"], "sentence": s, "match": how, "entry": entry["id"]})
    return out


def selftest(lex):
    print("\n[문장 조립 자체 시험] purpose=cover_para · 톤 4종")
    samples = ["편의점", "엑셀", "조별과제", "코딩", "갈등", "공백기", "알바", "우주정거장", "문서정리"]
    ok = True
    for w in samples:
        rows = assemble(w, lex)
        if not (2 <= len(rows) <= 4):
            err("자체 시험 실패: %r → %d문장 (2~4문장이어야 함)" % (w, len(rows)))
            ok = False
        for r in rows:
            if "{" in r["sentence"]:
                err("자체 시험 실패: %r 문장에 슬롯이 남았습니다 — %s" % (w, r["sentence"]))
                ok = False
        print("  · %-6s → [%s] %s" % (w, rows[0]["match"], rows[0]["sentence"]))
    rows = assemble("편의점", lex, purpose="resume_line")
    for r in rows:
        if len(r["sentence"]) > 90:
            warn("자체 시험: resume_line 이 90자를 넘습니다 — %s" % r["sentence"])
    rows = assemble("편의점", lex, tone="achievement")
    if len(rows) != 1:
        err("자체 시험 실패: 톤을 지정하면 그 톤 1문장이어야 합니다")
        ok = False
    # 결정성 확인
    a = [r["sentence"] for r in assemble("엑셀", lex)]
    b = [r["sentence"] for r in assemble("엑셀", lex)]
    if a != b:
        err("자체 시험 실패: 같은 입력에 다른 출력(난수 사용 의심)")
        ok = False
    print("  자체 시험 %s" % ("통과" if ok and not errors else "실패"))
    return ok


# --------------------------------------------------------------------------- #

def main():
    selftest_mode = "--selftest" in sys.argv
    anatomy = load(ANATOMY)
    lexicon = load(LEXICON)
    sig = {}
    if anatomy:
        sig = check_anatomy(anatomy) or {}
    kw = entries = 0
    tone_ids = [f.get("id") for f in (lexicon or {}).get("tone_frames") or []]
    if lexicon:
        kw, entries = check_lexicon(lexicon, tone_ids)
        if selftest_mode and not errors:
            selftest(lexicon)

    print("surgery/data  ·  검증일 %s" % BUILT_AT)
    if anatomy:
        print("   anatomy.json  ·  jd_anatomy %d종 (green %d / yellow %d / red %d)  ·  xray_cases %d종  ·  resume_layouts %d종"
              % (len(anatomy.get("jd_anatomy") or []), sig.get("green", 0), sig.get("yellow", 0),
                 sig.get("red", 0), len(anatomy.get("xray_cases") or []), len(anatomy.get("resume_layouts") or [])))
    if lexicon:
        print("   lexicon.json  ·  entries %d  ·  trigger_keywords %d  ·  tone_frames %d  ·  templates %d  (비노출)"
              % (entries, kw, len(tone_ids),
                 sum(len(f["purposes"][p]) for f in lexicon["tone_frames"] for p in ("resume_line", "cover_para"))))
    print("오류 %d건, 경고 %d건" % (len(errors), len(warnings)))
    for m in warnings:
        print("  [경고]", m)
    for m in errors:
        print("  [오류]", m)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
