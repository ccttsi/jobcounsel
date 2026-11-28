# FTN-3 학습 준비 — QLoRA 입력·노트북·실측 (2026-11-29 · 피클)

> MCL Goal · FTN(진짜 파인튜닝) FTN-3 의 **사전 구축**입니다. 문답집(FTN-1)이 눈검수를 통과하면
> Kaggle 무료 GPU 에서 그대로 돌려 LoRA 덧붙임 층을 만듭니다.
> 기준 문서: 노션 「FTN — 진짜 파인튜닝 하부계획」 FTN-2·FTN-3, 「FTN-2 · LLS-1 서류 조사」.
> 기본 모델을 고른 근거는 [`../MODEL_COMPARISON.md`](../MODEL_COMPARISON.md) 에 있습니다.

## 파일

| 파일 | 역할 |
|---|---|
| `sft_format.py` | **학습·서빙 공용 프롬프트 조립.** system=지침, user=근거+질문, assistant=모범 답. 이 파일 하나가 모양의 원본 |
| `prepare_sft.py` | FTN-1 문답(`train.jsonl`·`valid.jsonl`) → ChatML `messages` + `manifest.json`(통계·지문) |
| `measure_base.py` | FTN-2 기본 모델 한국어 실측 러너(4비트·같은 프롬프트·같은 조건) |
| `ftn3_qlora.ipynb` | Kaggle QLoRA 학습 노트북(데이터 확인 → 4비트 → LoRA → 학습 → 병합 → 추론 검증) |
| `build_notebook.py` | 노트북 생성기 — ipynb JSON 을 손으로 고치지 않는다(고칠 때 여기를 고치고 다시 돌린다) |
| `test_train_scripts.py` | 자기시험 18건 — GPU·네트워크 없이 0.2초 |

## 1. 지금 상태 (2026-11-29)

- 학습 입력 **확정 0건** — 정상입니다. FTN-1 초안 469건은 전부 `status: draft` 이고,
  태화님 10% 눈검수 → `split.py --promote` 를 거쳐야 `train`/`valid` 가 됩니다.
  `prepare_sft.py` 는 그 전에는 **한 건도 내보내지 않습니다**(`--allow-draft` 로 연습만).
- 미리보기(`mlc/qa/preview/`)로 조립을 확인한 결과: **462건 전부 조립 성공** · 빠진 0건
  (train 412 · valid 50, 거절 120건 포함).
- 토큰 길이(실측, Qwen3 토크나이저): 중앙 **1,372** · p90 1,793 · p99 2,261 · 최대 **2,342**.
  → `max_seq_len = 2,560` 이면 462건이 전부 들어갑니다(2,048 이면 25건, 1,536 이면 125건이 빠짐).

## 2. 쓰는 법

```
# ① 학습 입력 만들기 (눈검수·승격이 끝난 뒤)
python3 ops/ftn/train/prepare_sft.py --dry-run                 # 지금 몇 건인지·왜 빠지는지
python3 ops/ftn/train/prepare_sft.py --from mlc/qa --out ops/ftn/train/data

# ② 자기시험
python3 ops/ftn/train/test_train_scripts.py

# ③ Kaggle 에 올리기: `ops/ftn/train/` 폴더를 Dataset 으로(이름 예: ccttsi/ftn3-train)
#    → ftn3_qlora.ipynb 업로드 → Accelerator GPU T4 ×1 · Internet On → Run all

# 기본 모델 실측(FTN-2, GPU 있는 곳에서)
python3 ops/ftn/train/measure_base.py --list
python3 ops/ftn/train/measure_base.py --models qwen3-4b-instruct,kanana-1.5-8b --out measure.json
```

`--check` 는 커밋된 산출물이 지금 입력과 같은지 봅니다(지문 비교). 입력이 바뀌면 실패하니
`prepare_sft.py` 를 다시 돌려 다시 커밋합니다.

## 3. 지키는 선

- **눈검수 전 학습 금지** — `status` 가 `train`/`valid` 인 것만. `needs-fix`·`check.ok=false`·40자 미만 답은 뺀다.
- **시험 문항 금지** — `ops/ftn/overlap_check.py` 의 2-gram 규칙 그대로 `exact`·`near` 는 실패로 본다.
- **개인정보 0** — 전화·메일·주민번호 모양이 있으면 그 레코드를 뺀다.
- **비밀값 0** — 노트북은 키를 `kaggle_secrets`(이름 `HF_TOKEN`)에서만 읽고 출력하지 않는다.
  공개 후보(Qwen3·Kanana, 둘 다 Apache-2.0)는 토큰 없이 받는다. gated(Gemma·Llama)로 바꿀 때만 필요.
- **원문 저작물 0** — 재료는 자체 합성 문장이고, 법령 조문 인용은 저작권법 제7조.

## 4. 학습·서빙이 «같은 모양» 인 이유

`ops/serve/zerogpu/space/app.py` 는 이렇게 조립합니다(고정).

```
system = 지침
user   = ("근거:\n" + evidence + "\n\n" if evidence else "") + "질문: " + question
```

`sft_format.to_serve_inputs()` 가 돌려주는 세 값(지침·근거·질문)을 스페이스의 세 칸에 그대로 넣으면
**학습 입력과 서빙 입력이 글자까지 같습니다**. 2026-11-29 에 미리보기 train 412건 전부를 스페이스 조립식과
글자 대조해 **불일치 0건**을 확인했고, 자기시험이 같은 대조를 계속 지킵니다.
→ 스페이스 코드를 고치지 않아도 되고, 학습이 가르친 «근거 읽는 자리»를 서빙에서 그대로 만납니다.

어댑터는 `WITW_LORA_ADAPTER` 환경변수에 리포 이름을 넣으면 병합 서빙됩니다(12-22 개통 때).
답 끝 `[[REFS:e1,e2]]` 는 자료실 파이프라인이 쓰는 인용 줄이고, 화면에 보일 때는 `sft_format.strip_refs()` 로 뗍니다.

## 5. 학습 설정의 근거 (T4 16GB)

| 칸 | 값 | 근거 |
|---|---|---|
| 4비트 NF4 + double quant | 켬 | 4B≈2.5GB · 8B≈5GB — T4 16GB 에 학습 여유가 남는다 |
| `max_seq_len` | 2,560 | 위 실측(최대 2,342) |
| LoRA | r=16 · α=32 · dropout 0.05 | 4B QLoRA 표준값. 8B 는 r=8~16 |
| 배치 | 1 × 누적 16 (=16) | T4 메모리. 실효 배치 16 이면 462건 × 3에폭 ≈ 87스텝 |
| lr·스케줄 | 2e-4 · cosine · warmup 3% | QLoRA 관례값. 발산하면 절반으로 |
| 답 토큰에만 손실 | 기본 켬 | 지침·근거를 외우지 않고 답하는 법을 배우게(trl 판이 없으면 전체 손실 + 기록) |
| 시간 상한 | 150분 | Kaggle 주 30시간 중 6시간 비축 규칙 — 넘으면 스스로 멈춘다 |

T4 는 bf16 이 없어 fp16 으로 돕니다(노트북이 자동 판별). 8B(Kanana)로 바꾸면 `max_seq_len` 을 2,048 로 낮추세요.

## 6. 알아 둘 한계

- **학습은 아직 안 돌렸습니다.** 데이터가 `draft` 라서입니다(위 §1). 노트북·스크립트·검사는 준비 완료.
- trl·transformers 판이 오르면 이름이 바뀌는 인자(`max_seq_length`/`max_length`, `tokenizer`/`processing_class`)가 있어,
  노트북이 **있는 이름만 골라 넘기고** 없는 것은 화면에 알린 뒤 진행합니다.
- `prepare_sft.py` 는 정확한 토큰 길이를 `--tokenizer` 를 줬을 때만 잽니다(없으면 글자 수로 대신).
- Kaggle 노트북은 **공개하지 않습니다** — 학습 입력이 들어 있습니다.
- 자기시험은 아직 CI(`validate_repo.py`)에 묶지 않았습니다. 병렬 작업이 `validate_repo.py` 를 만지는 중이라
  충돌을 피했고, 다음 정비 때 `ftn` 검사에 한 줄로 붙이면 됩니다.
