#!/usr/bin/env python3
# FTN-1 분할·눈검수 — 검사를 통과한 초안을 train/valid 로 나누고 10% 눈검수 표본을 뽑는다.
#
#   python3 ops/ftn/split.py                     # 미리보기(초안 상태) → mlc/qa/preview/
#   python3 ops/ftn/split.py --report            # 지금 무엇이 몇 건인지
#   python3 ops/ftn/split.py --check             # 커밋된 미리보기·데이터 카드가 지금과 같은지(CI)
#   python3 ops/ftn/split.py --promote --approved mlc/qa/review-approved.json
#
# 지키는 선(노션 FTN-1): 태화님 10% 눈 검수를 거치기 전에는 train 이 아니다.
#   · 기본 출력은 status="draft" 인 «미리보기» 다.
#   · --promote 는 승인 목록에 있는 번호만 status="train"/"valid" 로 올린다.
#   · 승인 파일이 없으면 promote 하지 않는다 — 검수를 건너뛴 train 을 만들지 않기 위해서다.
"""FTN-1 train/valid 분할·눈검수 표본."""
import argparse
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FTN = os.path.join(ROOT, "ops", "ftn")
WORK = os.path.join(FTN, "work")
DRAFTS = os.path.join(WORK, "drafts.jsonl")
CANDIDATES = os.path.join(FTN, "dataset", "candidates.jsonl")
OUTDIR = os.path.join(ROOT, "mlc", "qa")
PREVIEW = os.path.join(OUTDIR, "preview")
CARD = os.path.join(OUTDIR, "DATACARD.md")
SCHEMA = "witw-ftn-qa/1.0.0"
VALID_EVERY = 10          # 열 건에 한 건 valid
REVIEW_EVERY = 10         # 열 건에 한 건 눈검수 표본
BUILT = "2026-11-28"
MIN_ANSWER = 40

sys.path.insert(0, FTN)
import draft as draft_mod  # noqa: E402 — 입력 조립(build_input)을 한 벌만 쓴다

PII = re.compile(r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}|\d{6}[-\s]?[1-4]\d{6}|[\w.+-]+@[\w-]+\.[\w.]+")


def load_jsonl(path):
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def write_jsonl(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def bucket(ident, salt, every):
    digest = hashlib.sha256(f"{salt}:{ident}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % every


def guide_signatures():
    """지침 요약 문장 앞부분 — 답에 그대로 새어 나왔는지 보는 조각."""
    sigs = []
    for line in draft_mod.guide_text().splitlines():
        text = re.sub(r"^[\s\d.·■-]+", "", line).strip()
        if len(text) >= 26 and not text.startswith(">"):
            sigs.append(text[:22])
    return sigs


def eligible(drafts, cands):
    sigs = guide_signatures()
    ok, reject = [], []
    for d in drafts:
        q = d.get("answer", "")
        why = []
        if d.get("status") != "checked":
            why.append("검사 미통과")
        if len(q) < MIN_ANSWER:
            why.append("답이 짧음")
        if PII.search(json.dumps(d, ensure_ascii=False)):
            why.append("개인정보 모양")
        if sum(1 for s in sigs if s in q) >= 2:
            why.append("지침이 새어 나옴")
        if d.get("qtype") not in ("calc", "policy", "guide", "counsel", "refuse"):
            why.append("답 유형 없음")
        if d["id"] not in cands:
            why.append("후보에 없음")
        (reject if why else ok).append((d, why))
    return ok, reject


def row_for(d, cand, guide, chunks, docs, status):
    return {
        "schema": SCHEMA,
        "id": d["id"],
        "split": "valid" if bucket(d["id"], "valid", VALID_EVERY) == 0 else "train",
        "status": status,
        "source": d["source"],
        "q": d["q"],
        "qtype": d["qtype"],
        "style": d["style"],
        "expect_sectors": d.get("expect_sectors") or [],
        "evidence": cand.get("evidence") or [],
        "input": draft_mod.build_input(cand, chunks, docs, guide),
        "answer": d["answer"],
        "refs": d.get("refs") or [],
        "check": d.get("checked"),
        "reviewed": False,
        "built": BUILT,
    }


def datacard(cands, drafts, ok, reject):
    by_source, by_style, by_sector = {}, {}, {}
    for c in cands:
        by_source[c["source"]] = by_source.get(c["source"], 0) + 1
        by_style[c["style"]] = by_style.get(c["style"], 0) + 1
        for s in c["expect_sectors"]:
            by_sector[s] = by_sector.get(s, 0) + 1
    drafted = len(drafts)
    passed = len(ok)
    lines = [
        "# FTN-1 문답집 데이터 카드",
        "",
        f"> 만든 날 {BUILT} · 스키마 후보 `witw-ftn-candidates/1.0.0` · 문답 `{SCHEMA}`",
        "> 기준 문서: 노션 「FTN — 진짜 파인튜닝 하부계획」 FTN-1.",
        "",
        "## 지금 상태",
        "",
        f"- **재료(질문+근거 참조) {len(cands)}건** — 시험용 분리(2-gram) 0건, 개인정보 모양 0건.",
        f"- **답 초안 {drafted}건** — 그중 AUP-5 검사기 통과 {passed}건 · 고침 필요 {len(reject)}건.",
        "- **train 확정 0건.** 초안은 `status: draft` 이며, 태화님 10% 눈검수(`review-sample.jsonl`) 전에는 train 이 아니다.",
        f"- 눈검수 표본: 통과 초안의 {REVIEW_EVERY}분의 1 (`mlc/qa/preview/review-sample.jsonl`).",
        "",
        "## 출처와 라이선스",
        "",
        "| 출처 | 건수 | 라이선스·근거 |",
        "|---|---|---|",
        f"| AUP-2 성적표 split=train (`assistant/eval/items.jsonl`) | {by_source.get('aup2-train', 0)} | 저장소와 같음 — 자체 작성 합성 사연 |",
        f"| MLC 자가질문 (Drive `witw-selfqa-*`, 2026-11-21) | {by_source.get('mlc-selfqa', 0)} | 태화님 계정 산출물 · 자료실 색인에서 만든 합성 질문 |",
        f"| 새 합성 문항 (`ops/ftn/sources/core/`) | {by_source.get('core-synth', 0)} | 자체 저작(합성) — 43개 섹터 고루 |",
        f"| 거절·공격 문항 (`ops/ftn/sources/refusal.jsonl`) | {by_source.get('refusal-synth', 0)} | 자체 저작(합성) — 시험 문장 재사용 0 |",
        f"| MLC 빈틈 급식 (`ops/scripts/mlc_gap_feed.py`) | {by_source.get('mlc-gap-feed', 0)} | 자체 저작 합성 사연에서 파생 |",
        "",
        "- 원문 저작물(보고서·검사 문항) 0. 법령 조문 인용은 저작권법 제7조.",
        "- 내담자 이름·연락처·주민등록번호 0 — `validate_repo.py` 의 `ftn` 검사가 전수 확인.",
        "",
        "## 답 유형 분포(재료)",
        "",
        "| 유형 | 건수 | 비율 | 초안 배분 |",
        "|---|---|---|---|",
    ]
    plan = {"설명": 30, "계산": 15, "자료 안내": 25, "상담 진행": 15, "거절": 15}
    for style, n in sorted(by_style.items(), key=lambda x: -x[1]):
        pct = n * 100.0 / max(len(cands), 1)
        lines.append(f"| {style} | {n} | {pct:.1f}% | {plan.get(style, '')}% |")
    lines += [
        "",
        "## 섹터 분포(재료)",
        "",
        " · ".join(f"{k} {v}" for k, v in sorted(by_sector.items(), key=lambda x: (-x[1], x[0]))),
        "",
        "## 다음 단계",
        "",
        "1. 남은 초안 만들기 — `python3 ops/ftn/draft.py --provider groq` (무료 한도만큼 이어서, 이미 있는 번호는 건너뜀).",
        "2. 클로드 근거·수치 대조 → `python3 ops/ftn/check.py` 재검사.",
        "3. 태화님 10% 눈검수 → 승인 번호를 `mlc/qa/review-approved.json` 에 적고 `python3 ops/ftn/split.py --promote --approved …`.",
        "4. 눈검수 지적을 반영한 뒤 `FTN-3` LoRA 학습 입력으로 넘긴다.",
    ]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description="FTN-1 분할·눈검수")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--promote", action="store_true")
    ap.add_argument("--approved", default=os.path.join(OUTDIR, "review-approved.json"))
    args = ap.parse_args()

    cands = {c["id"]: c for c in load_jsonl(CANDIDATES)}
    drafts = load_jsonl(DRAFTS) if os.path.exists(DRAFTS) else []
    ok, reject = eligible(drafts, cands)

    if args.report:
        print(f"재료 {len(cands)}건 · 초안 {len(drafts)}건 · 검사 통과 {len(ok)}건 · 탈락 {len(reject)}건")
        for d, why in reject[:10]:
            print(f"  - {d['id']}: {', '.join(why)}")
        return 0

    guide = draft_mod.guide_text()
    chunks, docs = draft_mod.evidence_index()
    preview = [row_for(d, cands[d["id"]], guide, chunks, docs, "draft") for d, _ in ok]
    review = [row for row in preview if bucket(row["id"], "review", REVIEW_EVERY) == 0]
    card = datacard(cands.values() and list(cands.values()), drafts, ok, reject)

    if args.check:
        drift = []
        for path, rows in ((os.path.join(PREVIEW, "train.jsonl"), [r for r in preview if r["split"] == "train"]),
                           (os.path.join(PREVIEW, "valid.jsonl"), [r for r in preview if r["split"] == "valid"]),
                           (os.path.join(PREVIEW, "review-sample.jsonl"), review)):
            text = "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows)
            if not os.path.exists(path) or open(path, encoding="utf-8").read() != text:
                drift.append(os.path.relpath(path, ROOT))
        if not os.path.exists(CARD) or open(CARD, encoding="utf-8").read() != card:
            drift.append(os.path.relpath(CARD, ROOT))
        if drift:
            print("✗ 미리보기가 지금 초안과 다르다 — python3 ops/ftn/split.py 로 다시 만든다: " + ", ".join(drift))
            return 1
        print(f"· FTN-1 미리보기 — train {len([r for r in preview if r['split']=='train'])} · "
              f"valid {len([r for r in preview if r['split']=='valid'])} · 눈검수 표본 {len(review)}")
        return 0

    write_jsonl(os.path.join(PREVIEW, "train.jsonl"), [r for r in preview if r["split"] == "train"])
    write_jsonl(os.path.join(PREVIEW, "valid.jsonl"), [r for r in preview if r["split"] == "valid"])
    write_jsonl(os.path.join(PREVIEW, "review-sample.jsonl"), review)
    os.makedirs(OUTDIR, exist_ok=True)
    with open(CARD, "w", encoding="utf-8") as fh:
        fh.write(card)
    print(f"미리보기: train {len([r for r in preview if r['split']=='train'])} · "
          f"valid {len([r for r in preview if r['split']=='valid'])} · 눈검수 표본 {len(review)} (모두 status=draft)")

    if args.promote:
        if not os.path.exists(args.approved):
            print(f"✗ 승인 파일이 없다 — {os.path.relpath(args.approved, ROOT)}. 눈검수를 건너뛴 train 은 만들지 않는다.")
            return 1
        approved = set(json.load(open(args.approved, encoding="utf-8")).get("approved", []))
        if not approved:
            print("✗ 승인 목록이 비어 있다 — train 을 만들지 않는다.")
            return 1
        promo = []
        for row in preview:
            if row["id"] not in approved:
                continue
            row = dict(row, status="train" if row["split"] == "train" else "valid", reviewed=True)
            promo.append(row)
        write_jsonl(os.path.join(OUTDIR, "train.jsonl"), [r for r in promo if r["split"] == "train"])
        write_jsonl(os.path.join(OUTDIR, "valid.jsonl"), [r for r in promo if r["split"] == "valid"])
        print(f"확정: train {len([r for r in promo if r['split']=='train'])} · "
              f"valid {len([r for r in promo if r['split']=='valid'])} (승인 {len(approved)}건 중)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
