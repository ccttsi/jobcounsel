# FTN-1 문답집 데이터 카드

> 만든 날 2026-11-28 · 스키마 후보 `witw-ftn-candidates/1.0.0` · 문답 `witw-ftn-qa/1.0.0`
> 기준 문서: 노션 「FTN — 진짜 파인튜닝 하부계획」 FTN-1.

## 지금 상태

- **재료(질문+근거 참조) 765건** — 시험용 분리(2-gram) 0건, 개인정보 모양 0건.
- **답 초안 199건** — 그중 AUP-5 검사기 통과 197건 · 고침 필요 2건.
- **train 확정 0건.** 초안은 `status: draft` 이며, 태화님 10% 눈검수(`review-sample.jsonl`) 전에는 train 이 아니다.
- 눈검수 표본: 통과 초안의 10분의 1 (`mlc/qa/preview/review-sample.jsonl`).

## 출처와 라이선스

| 출처 | 건수 | 라이선스·근거 |
|---|---|---|
| AUP-2 성적표 split=train (`assistant/eval/items.jsonl`) | 137 | 저장소와 같음 — 자체 작성 합성 사연 |
| MLC 자가질문 (Drive `witw-selfqa-*`, 2026-11-21) | 124 | 태화님 계정 산출물 · 자료실 색인에서 만든 합성 질문 |
| 새 합성 문항 (`ops/ftn/sources/core/`) | 384 | 자체 저작(합성) — 43개 섹터 고루 |
| 거절·공격 문항 (`ops/ftn/sources/refusal.jsonl`) | 120 | 자체 저작(합성) — 시험 문장 재사용 0 |
| MLC 빈틈 급식 (`ops/scripts/mlc_gap_feed.py`) | 0 | 자체 저작 합성 사연에서 파생 |

- 원문 저작물(보고서·검사 문항) 0. 법령 조문 인용은 저작권법 제7조.
- 내담자 이름·연락처·주민등록번호 0 — `validate_repo.py` 의 `ftn` 검사가 전수 확인.

## 답 유형 분포(재료)

| 유형 | 건수 | 비율 | 초안 배분 |
|---|---|---|---|
| 설명 | 198 | 25.9% | 30% |
| 자료 안내 | 198 | 25.9% | 25% |
| 상담 진행 | 158 | 20.7% | 15% |
| 거절 | 120 | 15.7% | 15% |
| 계산 | 91 | 11.9% | 15% |

## 섹터 분포(재료)

law 109 · pay-calc 80 · theory 52 · policy-match 46 · talk 45 · hud 33 · transit 28 · casecon 26 · manual 25 · taxonomy 24 · vpi 24 · kdt-calc 23 · interview 20 · cert 19 · intake 19 · decalcomania 18 · first-year 18 · portals 18 · triage 18 · work-filter 18 · surgery 17 · labor 15 · posting 15 · valuechain 14 · translator 13 · company 12 · dacum 12 · portfolio 12 · values 10 · careernet 9 · emerging 9 · reality 9 · thermometer 9 · briefing 8 · library 8 · univ 8 · fin-lab 7 · layer-merge 7 · parsons 7 · flow 5 · grad 5 · trait-flip 5 · preset 4

## 다음 단계

1. 남은 초안 만들기 — `python3 ops/ftn/draft.py --provider groq` (무료 한도만큼 이어서, 이미 있는 번호는 건너뜀).
2. 클로드 근거·수치 대조 → `python3 ops/ftn/check.py` 재검사.
3. 태화님 10% 눈검수 → 승인 번호를 `mlc/qa/review-approved.json` 에 적고 `python3 ops/ftn/split.py --promote --approved …`.
4. 눈검수 지적을 반영한 뒤 `FTN-3` LoRA 학습 입력으로 넘긴다.
