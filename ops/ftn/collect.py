#!/usr/bin/env python3
# FTN-1 문답집 재료 모으기 — 학습 후보(candidates)를 저장소 안 재료에서 정형화한다.
#
#   python3 ops/ftn/collect.py           # 만들기 → ops/ftn/dataset/candidates.jsonl
#   python3 ops/ftn/collect.py --check   # 지금 파일이 원천과 같은지(CI)
#
# 모양 (노션 「FTN — 진짜 파인튜닝 하부계획」 FTN-1):
#   입력 = 지침 요약 + 근거 조각(AUP-3) + 질문 → 출력 = 모범 답.
#   이 스크립트는 «입력» 쪽 재료(질문 + 근거 참조)만 모은다. 모범 답은
#   ① AUP 비서 초안 → ② 클로드 근거·수치 대조 → ③ 피클 현장 말투 → ④ 태화님 10% 눈 검수
#   를 거쳐 붙는다 — 여기서 답을 지어내지 않는다(모델 호출 0).
#
# 재료 (v1 — 저장소 안, 전부 합성 문장):
#   · AUP-2 성적표 split=train 문항 (assistant/eval/items.jsonl)
#     — 시험(test) 문항은 절대 넣지 않는다. test 와의 2-gram 겹침은 overlap_check.py 가 막는다.
# 다음 재료 (아직 저장소에 없음 — 들어오는 대로 source 를 더한다):
#   · AUP-8 👎 교정 — 고리 설계상 문장을 남기지 않아 «약한 유형·섹터 지도»만 온다(ops/feedback/DESIGN.md §4)
#   · 빈틈 급식 — python3 ops/scripts/mlc_gap_feed.py 산출물(selfqa-feed.json)
#   · MLC 자가질문 — Drive witw-selfqa-*
#   · 거절(범위 밖·공격) — 시험 문장 재사용 금지. 새 합성 문장으로 별도 작성.
#
# 같은 입력이면 같은 출력(정렬·고정 순서). 파이썬 표준 라이브러리만, 네트워크 0.
"""FTN-1 문답집 재료 수집기 (자세한 설명은 ops/ftn/README.md)."""

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVAL_ITEMS = os.path.join(ROOT, "assistant", "eval", "items.jsonl")
CHUNKS = os.path.join(ROOT, "assistant", "data", "chunks.json")
OUT = os.path.join(ROOT, "ops", "ftn", "dataset", "candidates.jsonl")
SCHEMA = "witw-ftn-candidates/1.0.0"

# 만들어야 할 답의 유형 비율(초안) — 설명 30 · 계산 15 · 자료 안내 25 · 상담 진행 15 · 거절 15.
# 실제 비율은 AUP-2 점수가 낮은 유형 쪽으로 기울인다(노션 FTN-1). qtype → 답 유형 대응표:
QTYPE_TO_STYLE = {"calc": "계산", "policy": "설명", "guide": "자료 안내", "counsel": "상담 진행"}

# 후보 한 줄이 통과해야 할 남은 관문 — collect 가 아니라 사람·비서 파이프라인이 채운다.
PIPELINE_NEEDS = ["draft", "claude_fix", "pickle_tone", "taehwa_review"]

MAX_EVIDENCE = 4  # 서버 근거 상한과 맞춘다(AUP-3 — 조각 상위 4건)


def load_eval_items():
    items = []
    with open(EVAL_ITEMS, encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                items.append(json.loads(line))
    return items


def load_chunks():
    with open(CHUNKS, encoding="utf-8") as fh:
        doc = json.load(fh)
    return doc.get("chunks", [])


def evidence_for(expect_sectors, chunks):
    """정답 섹터의 근거 조각 참조를 고른다. 조각 본문은 싣지 않는다(답 초안 단계에서 푼다)."""
    refs = []
    seen = set()
    for ch in chunks:
        if ch.get("s") in expect_sectors and ch.get("i") not in seen:
            refs.append({
                "i": ch.get("i"),
                "s": ch.get("s"),
                "t": ch.get("t", ""),
                "src": ch.get("src", ""),
                "as_of": ch.get("as_of", ""),
            })
            seen.add(ch.get("i"))
        if len(refs) >= MAX_EVIDENCE:
            break
    return refs


def build():
    items = load_eval_items()
    chunks = load_chunks()
    candidates = []
    for it in items:
        if it.get("split") != "train":
            continue  # 시험 문항은 학습에 절대 넣지 않는다
        candidates.append({
            "schema": SCHEMA,
            "id": f"FTN1-{it['id']}",
            "source": "aup2-train",
            "q": it["q"],
            "ctx": it.get("ctx") or [],
            "qtype": it.get("qtype", ""),
            "style": QTYPE_TO_STYLE.get(it.get("qtype", ""), "설명"),
            "expect_sectors": it.get("expect_sectors") or [],
            "evidence": evidence_for(it.get("expect_sectors") or [], chunks),
            "needs": list(PIPELINE_NEEDS),
        })
    candidates.sort(key=lambda c: c["id"])
    return candidates


def render(candidates):
    return "".join(
        json.dumps(c, ensure_ascii=False, sort_keys=True) + "\n" for c in candidates
    )


def summarize(candidates):
    by_source, by_style = {}, {}
    for c in candidates:
        by_source[c["source"]] = by_source.get(c["source"], 0) + 1
        by_style[c["style"]] = by_style.get(c["style"], 0) + 1
    return by_source, by_style


def main():
    parser = argparse.ArgumentParser(description="FTN-1 문답집 재료 수집기")
    parser.add_argument("--check", action="store_true", help="지금 파일이 원천과 같은지 확인(CI)")
    args = parser.parse_args()

    candidates = build()
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
    by_source, by_style = summarize(candidates)
    print(f"쓴 곳: {os.path.relpath(OUT, ROOT)} ({len(candidates)}건)")
    print("출처별:", ", ".join(f"{k} {v}" for k, v in sorted(by_source.items())))
    print("답 유형별:", ", ".join(f"{k} {v}" for k, v in sorted(by_style.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
