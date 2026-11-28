#!/usr/bin/env python3
# FTN-1 문답집 재료 모으기 — 학습 후보(candidates)를 저장소 안 재료에서 정형화한다.
#
#   python3 ops/ftn/collect.py           # 만들기 → ops/ftn/dataset/candidates.jsonl
#   python3 ops/ftn/collect.py --check   # 지금 파일이 원천과 같은지(CI)
#   python3 ops/ftn/collect.py --stats   # 출처·답 유형·섹터 분포만 보기
#
# 모양 (노션 「FTN — 진짜 파인튜닝 하부계획」 FTN-1):
#   입력 = 지침 요약 + 근거 조각(AUP-3) + 질문 → 출력 = 모범 답.
#   이 스크립트는 «입력» 쪽 재료(질문 + 근거 참조)만 모은다. 모범 답은
#   ① AUP 비서 초안 → ② 클로드 근거·수치 대조 → ③ 피클 현장 말투 → ④ 태화님 10% 눈 검수
#   를 거쳐 붙는다 — 여기서 답을 지어내지 않는다(모델 호출 0).
#
# 재료 (v2 — 2026-11-28 보강):
#   · aup2-train   — AUP-2 성적표 split=train 문항 (assistant/eval/items.jsonl)
#   · mlc-selfqa   — Drive witw-selfqa-* 자가질문 가운데 자료실이 답할 수 있는 것 (sources/selfqa.jsonl)
#   · core-synth   — 이 저장소가 새로 쓴 합성 문항 (sources/core/*.jsonl, 43개 섹터 고루)
#   · refusal-synth— 범위 밖·공격·개인정보·조작 요청 (sources/refusal.jsonl) — 시험 문장 재사용 금지
#   · mlc-gap-feed — ops/scripts/mlc_gap_feed.py 의 사용자 빈틈 질의 (sources/gapfeed.jsonl)
#
# 시험(test) 문항은 절대 넣지 않는다. test 와의 2-gram 겹침은 overlap_check.py 가 막는다.
# 같은 입력이면 같은 출력(정렬·고정 순서). 파이썬 표준 라이브러리만, 네트워크 0.
"""FTN-1 문답집 재료 수집기 (자세한 설명은 ops/ftn/README.md)."""

import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVAL_ITEMS = os.path.join(ROOT, "assistant", "eval", "items.jsonl")
CHUNKS = os.path.join(ROOT, "assistant", "data", "chunks.json")
INDEX = os.path.join(ROOT, "assistant", "data", "index.json")
SOURCES = os.path.join(ROOT, "ops", "ftn", "sources")
OUT = os.path.join(ROOT, "ops", "ftn", "dataset", "candidates.jsonl")
SCHEMA = "witw-ftn-candidates/1.0.0"

# 만들어야 할 답의 유형 비율(초안) — 설명 30 · 계산 15 · 자료 안내 25 · 상담 진행 15 · 거절 15.
# 실제 비율은 AUP-2 점수가 낮은 유형 쪽으로 기울인다(노션 FTN-1). qtype → 답 유형 대응표:
QTYPE_TO_STYLE = {"calc": "계산", "policy": "설명", "guide": "자료 안내", "counsel": "상담 진행", "refuse": "거절"}
QTYPES = set(QTYPE_TO_STYLE)

# 후보 한 줄이 통과해야 할 남은 관문 — collect 가 아니라 사람·비서 파이프라인이 채운다.
PIPELINE_NEEDS = ["draft", "claude_fix", "pickle_tone", "taehwa_review"]

MAX_EVIDENCE = 4  # 서버 근거 상한과 맞춘다(AUP-3 — 조각 상위 4건)

_TOKEN = re.compile(r"[가-힣a-z0-9]+")


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            if line.strip():
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    raise SystemExit(f"✗ {os.path.relpath(path, ROOT)}:{line_no} JSON 오류 — {exc.msg}")
    return rows


def load_eval_items():
    return load_jsonl(EVAL_ITEMS)


def load_chunks():
    with open(CHUNKS, encoding="utf-8") as fh:
        return json.load(fh).get("chunks", [])


def load_index_docs():
    """섹터별 색인 글 — 근거 조각이 없는 섹터의 근거로 쓴다(섹터 첫 화면 → 개별 항목 순)."""
    with open(INDEX, encoding="utf-8") as fh:
        docs = json.load(fh).get("docs", [])
    by_sector = {}
    for doc in docs:
        sector = doc.get("s")
        if sector:
            by_sector.setdefault(sector, []).append(doc)
    for sector, items in by_sector.items():
        # «sector:이름» 첫 화면을 먼저, 나머지는 i 순서(결정적).
        items.sort(key=lambda d: (0 if str(d.get("i", "")).startswith("sector:") else 1, str(d.get("i", ""))))
    return by_sector


def evidence_for(sectors, chunks, index_docs):
    """정답 섹터의 근거 참조를 고른다. 조각 본문은 싣지 않는다(답 초안 단계에서 푼다)."""
    refs, seen = [], set()
    for ch in chunks:
        if len(refs) >= MAX_EVIDENCE - 1:
            break
        if ch.get("s") in sectors and ch.get("i") not in seen:
            refs.append({"i": ch.get("i"), "s": ch.get("s"), "t": ch.get("t", ""),
                         "src": ch.get("src", ""), "as_of": ch.get("as_of", "")})
            seen.add(ch.get("i"))
    for sector in sectors:
        if len(refs) >= MAX_EVIDENCE:
            break
        for doc in index_docs.get(sector, [])[:MAX_EVIDENCE]:
            if doc.get("i") in seen:
                continue
            refs.append({"i": doc.get("i"), "s": sector, "t": doc.get("t", ""),
                         "src": f"assistant/data/index.json#{doc.get('i')}", "as_of": ""})
            seen.add(doc.get("i"))
            if len(refs) >= MAX_EVIDENCE:
                break
    return refs[:MAX_EVIDENCE]


def norm_q(text):
    return "".join(_TOKEN.findall(str(text).lower()))


def candidate(ident, source, q, qtype, sectors, chunks, index_docs, ctx=None, note="", evidence=None):
    qtype = "policy" if qtype == "설명" else qtype
    if qtype not in QTYPES:
        raise SystemExit(f"✗ {ident}: 답 유형 «{qtype}» 은(는) 모르는 값이다")
    sectors = [s for s in (sectors or []) if s]
    return {
        "schema": SCHEMA,
        "id": ident,
        "source": source,
        "q": q,
        "ctx": list(ctx or []),
        "qtype": qtype,
        "style": QTYPE_TO_STYLE[qtype],
        "expect_sectors": sectors,
        "evidence": evidence if evidence is not None else evidence_for(sectors, chunks, index_docs),
        "needs": list(PIPELINE_NEEDS),
        **({"note": note} if note else {}),
    }


def from_aup2(items, chunks, index_docs):
    out = []
    for it in items:
        if it.get("split") != "train":
            continue  # 시험 문항은 학습에 절대 넣지 않는다
        out.append(candidate(f"FTN1-{it['id']}", "aup2-train", it["q"], it.get("qtype", ""),
                             it.get("expect_sectors") or [], chunks, index_docs, ctx=it.get("ctx") or []))
    return out


def from_selfqa(chunks, index_docs):
    path = os.path.join(SOURCES, "selfqa.jsonl")
    if not os.path.exists(path):
        return []
    out = []
    for row in load_jsonl(path):
        out.append(candidate(f"FTN1-{row['id']}", "mlc-selfqa", row["q"], row.get("t", ""),
                             row.get("s") or [], chunks, index_docs, note=row.get("note", "")))
    return out


def from_core(chunks, index_docs):
    out = []
    paths = sorted(glob.glob(os.path.join(SOURCES, "core", "*.jsonl")))
    n = 0
    for path in paths:
        for row in load_jsonl(path):
            n += 1
            out.append(candidate(f"FTN1-CS-{n:04d}", "core-synth", row["q"], row.get("t", ""),
                                 row.get("s") or [], chunks, index_docs,
                                 note=", ".join(filter(None, [row.get("c", "")]))))
    return out


def from_refusal(chunks, index_docs):
    path = os.path.join(SOURCES, "refusal.jsonl")
    if not os.path.exists(path):
        return []
    out = []
    for n, row in enumerate(load_jsonl(path), 1):
        kind = row.get("k", "oos")
        note = {"oos": "범위 밖", "attack": "지침 공격", "privacy": "개인정보 요구",
                "manipulation": "조작·허위 요청"}.get(kind, kind)
        if row.get("r"):
            note += f" · 이어 볼 자료: {row['r']}"
        out.append(candidate(f"FTN1-RF-{n:04d}", "refusal-synth", row["q"], "refuse", [], chunks,
                             index_docs, note=note, evidence=[]))
    return out


def from_gapfeed(chunks, index_docs):
    path = os.path.join(SOURCES, "gapfeed.jsonl")
    if not os.path.exists(path):
        return []
    out = []
    for row in load_jsonl(path):
        out.append(candidate(f"FTN1-{row['id']}", "mlc-gap-feed", row["q"], row.get("t", "guide"),
                             row.get("s") or [], chunks, index_docs, note=row.get("note", "")))
    return out


def build():
    items = load_eval_items()
    chunks = load_chunks()
    index_docs = load_index_docs()
    rows = []
    rows += from_aup2(items, chunks, index_docs)
    rows += from_selfqa(chunks, index_docs)
    rows += from_core(chunks, index_docs)
    rows += from_refusal(chunks, index_docs)
    rows += from_gapfeed(chunks, index_docs)

    # 같은 문장이 두 출처에 들어오면 앞 출처(성적표 > 자가질문 > 합성 > 거절 > 빈틈)를 남긴다.
    seen, uniq = set(), []
    for row in rows:
        key = norm_q(row["q"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(row)
    uniq.sort(key=lambda c: c["id"])
    return uniq


def render(candidates):
    return "".join(json.dumps(c, ensure_ascii=False, sort_keys=True) + "\n" for c in candidates)


def summarize(candidates):
    by_source, by_style = {}, {}
    sectors = {}
    for c in candidates:
        by_source[c["source"]] = by_source.get(c["source"], 0) + 1
        by_style[c["style"]] = by_style.get(c["style"], 0) + 1
        for s in c["expect_sectors"]:
            sectors[s] = sectors.get(s, 0) + 1
    return by_source, by_style, sectors


def main():
    parser = argparse.ArgumentParser(description="FTN-1 문답집 재료 수집기")
    parser.add_argument("--check", action="store_true", help="지금 파일이 원천과 같은지 확인(CI)")
    parser.add_argument("--stats", action="store_true", help="분포만 보기(파일 쓰지 않음)")
    args = parser.parse_args()

    candidates = build()
    by_source, by_style, sectors = summarize(candidates)

    if args.stats:
        print(f"후보 {len(candidates)}건")
        print("출처별:", ", ".join(f"{k} {v}" for k, v in sorted(by_source.items())))
        print("답 유형별:", ", ".join(f"{k} {v}" for k, v in sorted(by_style.items())))
        print("섹터별:", ", ".join(f"{k} {v}" for k, v in sorted(sectors.items(), key=lambda x: (-x[1], x[0]))))
        return 0

    text = render(candidates)

    if args.check:
        if not os.path.exists(OUT):
            print(f"✗ {os.path.relpath(OUT, ROOT)} 이 없다 — python3 ops/ftn/collect.py")
            return 1
        with open(OUT, encoding="utf-8") as fh:
            current = fh.read()
        if current != text:
            print(f"✗ {os.path.relpath(OUT, ROOT)} 이 원천과 다르다 — python3 ops/ftn/collect.py 로 다시 만든다")
            return 1
        print(f"· FTN-1 후보 {len(candidates)}건 — 원천과 같다")
        return 0

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"쓴 곳: {os.path.relpath(OUT, ROOT)} ({len(candidates)}건)")
    print("출처별:", ", ".join(f"{k} {v}" for k, v in sorted(by_source.items())))
    print("답 유형별:", ", ".join(f"{k} {v}" for k, v in sorted(by_style.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
