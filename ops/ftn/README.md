# FTN-1 문답집 — 재료·답 초안·검사·분할 (2026-11-28 · 인스팅트)

> MCL Goal · FTN(진짜 파인튜닝) 하부계획 FTN-1. 학습 후보를 저장소 안 재료와 태화님 Drive 자가질문에서
> 정형화해 모으고, 근거를 붙여 답 초안을 만들고, AUP-5 검사기로 대조한 뒤 train/valid 로 나눈다.
> 기준 문서: 노션 「FTN — 진짜 파인튜닝 하부계획」. 역할 재조정(2026-11-28): 재료 정형화·데이터 카드·검사는 인스팅트 몫.

## 1. 모양 — «근거를 보고 답하는» 학습

```
입력  = 지침 요약(sources/guide_summary.md) + 근거 조각 본문 + (앞 대화) + 질문
출력  = 모범 답
```

- 근거 없이 질문만 넣는 학습은 하지 않는다 — 사실을 지어내는 모델이 된다.
- 흐름: ① 재료(질문+근거 참조) → ② 답 초안 → ③ AUP-5 검사기 대조 → ④ train/valid 분할 + 눈검수 표본
  → ⑤ 클로드 근거 대조·피클 말투 → ⑥ **태화님 10% 눈 검수** → ⑦ 통과분만 train.
- 섞는 비율(초안): 설명 30 · 계산 15 · 자료 안내 25 · 상담 진행 15 · 거절 15. 실제 비율은 AUP-2 점수가 낮은 유형 쪽으로 기울인다.

## 2. 스크립트

```
python3 ops/ftn/collect.py            # 재료 만들기 → ops/ftn/dataset/candidates.jsonl
python3 ops/ftn/collect.py --check    # 원천과 같은지(CI)
python3 ops/ftn/collect.py --stats    # 분포만
python3 ops/ftn/overlap_check.py      # 시험 문항과 글자 2-gram 겹침 검사(CI)
python3 ops/ftn/draft.py --build-only # 입력 조립 확인(모델 호출 0)
python3 ops/ftn/draft.py --rule --source refusal-synth   # 거절 초안(모델 0)
python3 ops/ftn/draft.py --provider groq --limit 20 --dry-run
python3 ops/ftn/check.py              # 초안 → AUP-5 검사기 대조
python3 ops/ftn/split.py              # 미리보기 train/valid + 10% 눈검수 표본 + 데이터 카드
python3 ops/ftn/split.py --promote --approved mlc/qa/review-approved.json
```

- `collect.py` — 재료에서 후보를 뽑아 `witw-ftn-candidates/1.0.0` 한 줄 한 건으로 쓴다. 결정적(같은 입력이면 같은 출력).
  근거는 조각 본문이 아니라 참조(`i`·`s`·`t`·`src`·`as_of`)만 싣는다 — 본문은 초안 단계에서 푼다. 모델 호출 0, 네트워크 0.
  근거 고르기: 그 섹터의 AUP-3 조각 → 없으면 `assistant/data/index.json` 의 섹터 색인 글(첫 화면 우선). 최대 4건.
- `overlap_check.py` — 시험 문항(split=test 전체, q+ctx) **낱낱**과 글자 2-gram을 비교한다.
  exact(같은 문장) · near(한 시험 문항과 0.6 이상) 는 실패, shared(0.6 미만)는 기록만.
- `draft.py` — 입력을 조립해 초안을 만든다. `rule` 은 거절 유형만(지침 §8·§9 틀), `groq` 는 무료 한도 키로 모델 호출.
  이미 초안이 있는 번호는 건너뛰므로 한도만큼 끊어 이어서 돌릴 수 있다. 키는 `.secrets/free_tier_keys.env`(저장소 밖)에서만 읽는다.
- `check.py` — 서버 사본 `assistant/answer-check.js`·`check-data.js` 를 **그대로** 싣는다(node 있으면 정본 러너,
  없으면 quickjs 로 같은 파일). 검사기가 고친 것이 있으면(fixed>0) 통과로 세지 않고 `needs-fix` 로 남긴다.
- `split.py` — 검사 통과 초안을 90:10 으로 나누고, 열 건에 한 건을 눈검수 표본으로 뽑고, 데이터 카드를 쓴다.
  **기본 출력은 `status: draft`** — 태화님 눈검수 전에는 train 이 아니다. `--promote` 는 승인 목록에 있는 번호만 올린다.

## 3. 재료와 데이터 카드 (2026-11-28)

| 출처 | 상태 | 라이선스 | 건수 |
|---|---|---|---|
| AUP-2 성적표 split=train (`assistant/eval/items.jsonl`) | 수집됨 | 저장소와 같음(합성 문장, 원저작) | 137 |
| MLC 자가질문 (Drive `witw-selfqa-*`, 2026-11-21) | 224문 중 124문 채택 | 태화님 계정 산출물(합성 질문) | 124 |
| 새 합성 문항 (`sources/core/*.jsonl`) | 새로 작성 | 자체 저작(합성) | 384 |
| 거절·공격 (`sources/refusal.jsonl`) | 새로 작성 | 자체 저작(합성) | 120 |
| MLC 빈틈 급식 (`ops/scripts/mlc_gap_feed.py`) | 18문 중 채택 0 | 자체 저작 합성 사연에서 파생 | 0 |
| **합계** | | | **765** |

- 답 유형 분포: 설명 198 · 자료 안내 198 · 상담 진행 158 · 거절 120 · 계산 91.
- 섹터: 43개 섹터 전부 등장(law 109 · pay-calc 80 · theory 52 · policy-match 46 · talk 45 … preset 4).
- 개인정보 0 — 전부 합성 문장이며, validate_repo 가 전화·메일·주민번호 모양을 걸러 낸다.
- 원문 저작물(보고서·검사 문항) 0. 법령 조문 인용은 저작권법 제7조.

### Drive 자가질문을 224 → 124로 줄인 이유

- 224문 가운데 100문은 자료실에 **섹터가 없는 주제**(프리랜서·플랫폼, 장애·질병, 60세 이후, 외국인·다문화,
  취업 후 사후관리 일부, 상업·기업 상담, 상담 윤리)라 근거를 붙일 수 없어 뺐다 — 그 주제들은 MLC 신규 섹터 후보로 남긴다.
- 시험 문항과 겹치는 것 2문(내일배움카드·K-디지털 자부담)은 `overlap_check.py` 로 걸러 뺐다.

### 빈틈 급식이 0건인 이유

`mlc_gap_feed.py --intents` 가 20문을 냈지만, 18문이 이미 자가질문·합성 문항과 같은 사연이었고
남은 4문(지방 거주·생산직 전직·첫 상담 위기·「열정만 있으면」)은 **시험 문항과 같은 문장**이었다
(`overlap_check.py` exact 4건). 시험 문항 재사용 금지 원칙에 따라 넣지 않았다.

## 4. 답 초안 (2026-11-28 시범 실행)

- 초안 199건 = 규칙 기반 거절 120 + Groq `openai/gpt-oss-120b` 79 (무료 한도 8,000 토큰/분에 맞춰 5건씩 끊어 실행).
- AUP-5 검사기 대조: 통과 197 · 고침 필요 2.
  - FTN1-CS-0057 — 답 안의 `68100 원` 표기를 검사기가 `68,100원`으로 고침(정상 교정).
  - FTN1-CS-0382 — «급여기초임금일액이 80,000원» 이라는 가정 수치를 검사기가 «기초일액 상한 113,500원»으로 오인해 고침.
    가정 수치를 쓰는 계산 문항은 검사기 오탐을 부르므로 문항을 «하한액에 못 미치면» 형태로 바꿨다(재초안 대상).
- 초안은 전부 `status: draft`. train 확정 0건 — 태화님 10% 눈검수를 아직 거치지 않았다.
- 미리보기: `mlc/qa/preview/train.jsonl` 174 · `valid.jsonl` 23 · `review-sample.jsonl` 23(눈검수 표본).
- 남은 초안(565건)은 `python3 ops/ftn/draft.py --provider groq` 로 무료 한도만큼 이어서 만들 수 있다(이미 있는 번호는 건너뜀).

## 5. 지키는 선 (노션 FTN-1 그대로)

- 합성 사례만 · 내담자 이름·연락처 0 · 원문 저작물 0 · 법령 조문 인용 가능(제7조)
- 시험 문항은 학습에 절대 넣지 않는다 — 같은 문장·근소한 변형도 제외(2-gram 검사)
- 데이터 카드에 출처·라이선스·건수·만든 날을 적는다 (`mlc/qa/DATACARD.md`, `split.py` 가 자동 생성)
- 답 초안이 붙은 뒤에도 train 반영 전 태화님 10% 눈 검수 — 승인 파일 없이는 `--promote` 가 거부한다
- 비밀키(`.secrets/`)는 저장소에 넣지 않는다
