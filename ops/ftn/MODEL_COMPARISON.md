# FTN-2 기본 모델 고르기 — 후보 비교·한국어 실측 (2026-11-29 · 피클)

> MCL Goal · FTN-2 의 산출물. 노션 「FTN — 진짜 파인튜닝 하부계획」 FTN-2 의 «거르는 순서»
> ① 라이선스 ② 올릴 곳(LLS-1)이 LoRA 를 받는가 ③ 한국어 실력 ④ 크기 3B~8B 를 그대로 따라 적었습니다.
> 값은 **2026-11-29 공식 문서·API 로 확인한 것**과 **직접 잰 것**만 적었습니다. 못 잰 것은 못 쟀다고 적었습니다.
> 학습·서빙 준비물은 [`train/README.md`](train/README.md), 실측 러너는 [`train/measure_base.py`](train/measure_base.py).

## 0. 결론

| 순위 | 모델 | 왜 |
|---|---|---|
| **1순위** | **`Qwen/Qwen3-4B-Instruct-2507`** | Apache-2.0(조건 없음) · 4.0B 로 T4 16GB QLoRA 가 가장 편함 · 사고(thinking) 없이 바로 답함 · 256K 문맥 · 학습·서빙 양쪽에서 이미 검증된 경로(`transformers>=4.51`) |
| **2순위** | **`kakaocorp/kanana-1.5-8b-instruct-2505`** | Apache-2.0 · **한국어 특화**(KoMT-Bench 7.63 · KMMLU 48.28) · 표준 Llama 구조라 도구 호환 부담 없음. 다만 8B 라 학습·서빙이 2배 무겁고 T4 메모리가 빠듯 |
| 탈락 | `google/gemma-3-4b-it` | 라이선스는 쓸 만하지만 **배포 조건 4가지**(아래 §2)가 붙고 **HF 약관 동의(gated)** 가 필요해 자동 실행이 막힘. 성능 이점도 확인하지 못함 |
| 탈락 | `meta-llama/Llama-3.2-3B-Instruct` | **공식 지원 언어 8개에 한국어가 없음**. 실측에서 한국어 문장에 한자·가나·태국문자가 섞여 나옴(§3). gated 이기도 함 |

**바꾸는 조건**: 한국어 실측에서 Kanana 가 Qwen3 보다 «근거를 보고 답하기»에서 확실히 앞서고
ZeroGPU 학습·서빙 시간이 감당되면 1·2순위를 뒤집습니다. 판단 재료는 §3 의 표와 `train/measure_base.py` 재실행 결과입니다.

## 1. 거르는 순서 (노션 FTN-2 그대로)

| 단계 | 무엇을 보나 | 이번 결과 |
|---|---|---|
| ① 라이선스 | 수정·배포 허용, 상업 이용 조건 | Qwen3·Kanana = **Apache-2.0**(조건 없음) · Gemma = Gemma Terms(배포 4조건) · Llama = Llama 3.2 커뮤니티(표기 의무·MAU 조건) |
| ② 올릴 곳 | LLS-1 확정안 = **HF Spaces ZeroGPU**(48GB 공유) 에서 LoRA 병합 서빙 | 네 후보 모두 `transformers`+`peft` 병합으로 48GB 에 들어감. `space/app.py`(PR #571) 가 기본값으로 잡은 것이 Qwen3-4B-Instruct-2507 |
| ③ 한국어 실력 | AUP-2 시험 문항 일부 + 상담 프롬프트 실측 | §3 — Llama-3.2-3B 는 탈락 수준. Qwen3·Kanana 는 §3.2 |
| ④ 크기 | 3B~8B (무료 GPU 학습 범위) | 네 후보 모두 범위 안. Qwen3 4.0B · Gemma 4.3B · Llama 3.2B · Kanana 8.0B |

## 2. 후보 사실 표 (공식 문서·API 확인값, 2026-11-29)

| | **Qwen3-4B-Instruct-2507** | **Kanana-1.5-8B-Instruct-2505** | **Gemma-3-4B-it** | **Llama-3.2-3B-Instruct** |
|---|---|---|---|---|
| 파라미터 | 4.02B (비임베딩 3.6B) | 8.03B | 4.30B | 3.21B |
| 라이선스 | **Apache-2.0** | **Apache-2.0** | Gemma Terms of Use (2026-04-01 개정) | Llama 3.2 Community License |
| 상업 이용 | 가능(조건 없음) | 가능(조건 없음) | 가능 — 단 금지 용도 정책 준수, 구글이 위반으로 보는 사용은 원격 제한 가능 | 가능 — 단 700M MAU 초과 시 메타의 별도 허락 |
| 파생·배포 조건 | 라이선스 사본 동봉·변경 파일 표시(Apache 표준) | 같음 | ① §3.2 사용 제한을 **계약 조항으로 넣고** ② 약관 사본 제공 ③ 수정 파일에 «수정했다» 표시 ④ `Gemma is provided under and subject to the Gemma Terms of Use …` NOTICE 파일 | 계약 사본 동봉 · **«Built with Llama» 를 화면·문서에 눈에 띄게** · 파인튜닝 모델을 배포하면 **이름 앞에 «Llama»** |
| 가중치 접근 | 공개(토큰 불필요) | 공개(토큰 불필요) | **gated(약관 동의 필요)** | **gated(약관 동의 필요)** |
| 문맥 길이 | 262,144 (256K) | 32,768 (YaRN 으로 128K) | 128K | 128K |
| 사고(thinking) | **없음** — 바로 답 | 없음 | 없음 | 없음 |
| 공식 언어 입장 | 100+ 언어·방언, 다국어 지시 따르기 강조 | 한국어·영어 2개 언어 | 140+ 언어 | **공식 지원 8개**(영·독·불·이·포·힌디·스·태) — **한국어 없음** |
| 구조 | `Qwen3ForCausalLM` (transformers ≥ 4.51 필요) | `LlamaForCausalLM` (표준) | `Gemma3ForConditionalGeneration`(텍스트만 써도 됨) | `LlamaForCausalLM` |
| bf16 가중치(계산값) | 약 8.0GB | 약 16.1GB | 약 8.6GB | 약 6.4GB |
| 4비트 가중치(계산값) | 약 2.5GB | 약 5.0GB | 약 2.7GB | 약 2.0GB |
| T4 16GB QLoRA | 여유 있음 | **빠듯**(가중치 5GB + 활성값·옵티마이저 상태) | 여유 있음 | 여유 있음 |
| ZeroGPU 48GB 병합 서빙 | 여유 | 여유(16.1GB) | 여유 | 여유 |

- 공식 벤치마크(제조사 카드): Qwen3-4B-Instruct-2507 — MMLU-Pro 69.6 · IFEval 83.4 · MMLU-ProX 61.6 · INCLUDE 60.1 · MultiIF 69.0(한국어 단독 점수는 카드에 없음).
  Kanana-1.5-8B-Instruct — **KoMT-Bench 7.63** · KMMLU 48.28 · IFEval 80.11 · MT-Bench 7.76(한국어 대화 벤치를 공식으로 제시).
  Gemma-3·Llama-3.2 카드에는 한국어 단독 점수가 없습니다.
- 메모리는 «가중치만» 계산값입니다(파라미터 × 바이트). 실제 사용량은 KV 캐시·활성값이 더해집니다.

## 3. 한국어 실측

### 3.1 무엇을 어떻게 쟀나

- 프롬프트 9건: `p1`~`p4` 상담 문답(무근거) · `p5`·`p6` 근거를 주고 계산·제도 판단 · `NUM-001`·`NUM-005`·`NUM-007` = AUP-2 시험 문항(최저임금 시급 · 구직급여 상한 · 국민연금 요율, 기대값은 `data/legal-constants.json`).
  `p1`~`p4` 문장은 `ops/serve/zerogpu/prompts/measure_prompts.json` 과 **같은 문장**이라 이미 잰 Cloudflare Workers AI(6.2초·608자)·ZeroGPU 27B(웜 5.6초) 수치와 나란히 놓을 수 있습니다.
- 조건: 같은 `max_new_tokens`, 가능하면 4비트, 가능하면 greedy. 다만 **공개 ZeroGPU 스페이스는 temperature 최소값이 0.1** 이라 그 스페이스로 잰 Llama 값은 0.1 로 돌린 것이고(완전 greedy 아님), p1·p2 는 400토큰·p4 는 300토큰 상한입니다.
- 기계로 잰 것: 응답 시간·글자 수·**한글 비율**(글자 중 한글 비중)·**다른 문자권 글자 수**(한자·가나·태국문자·키릴·데바나가리 등)·**정답 수치 포함 여부**.
- 사람(피클)이 본 것: 한국어 자연스러움·지시 이행. 주관이라 §3.3 에 실제 답을 그대로 붙였습니다.

### 3.2 결과

| 모델 | 부른 곳 | 결과 |
|---|---|---|
| **Llama-3.2-3B-Instruct** | 공개 ZeroGPU 스페이스 `huggingface-projects/llama-3.2-3B-Instruct` (zero-a10g, 2026-11-29 00:15~00:25 KST) | p1 **9.9초·1,112자·한글 비율 0.43·다른 문자권 14자**(데바나가리·한자, 상한 400토큰) · p2 **7.7초·1,124자·한글 비율 0.44·다른 문자권 12자**(가나·한자, 400토큰) · p4 8.0초(300토큰 상한). **p3 이후는 ZeroGPU 무료 한도(5분/일) 소진으로 못 잼**(`You have exceeded your ZeroGPU quota (135s)`) |
| **Qwen3-4B-Instruct-2507** | Kaggle 무료 GPU(T4) — `train/measure_base.py` 커널 `ccttsi/ftn-2-base-ko-measure` | **이번 판 결과 없음** — GPU 대기열(§3.2-1). 공식 카드에 한국어 단독 점수 없음 |
| **Kanana-1.5-8B-Instruct** | 같음(같은 커널이 두 모델을 차례로) | **이번 판 결과 없음** — GPU 대기열(§3.2-1). 제조사 공식 한국어 벤치만 있음(KoMT-Bench 7.63 · KMMLU 48.28) |
| **Gemma-3-4B-it** | — | **못 부름.** gated(HF 약관 동의 전)라 가중치를 받을 수 없고, 공개 ZeroGPU 스페이스는 당일 한도를 다 써서 호출 불가. 공식 카드의 언어 범위(140+)만 확인 |

- Cloudflare Workers AI 비교군(이미 잰 값, 인스팅트 2026-11-28): `@cf/qwen/qwen3.8-27b` 사고 끄기 6.2초·608자 완결.
  같은 계열(27B)이라 «4B 가 27B 대비 얼마나 처지는가»의 기준선으로 씁니다.
- Workers AI 를 이번에 직접 부르지는 못했습니다 — 자료실 계정의 Workers AI 토큰은 **볼트에만** 있고(값을 꺼내 쓰는 통로가 없음), REST 직접 호출에는 그 토큰이 필요합니다.

### 3.2-1 Qwen3-4B-Instruct-2507 · Kanana-1.5-8B — 이번 판에서는 결과가 없다 (GPU 대기열)

- 두 모델은 공개(gated 아님, Apache-2.0)라 Kaggle 무료 GPU 에서 그대로 잴 수 있습니다. 실측 러너를 커널
  `ccttsi/ftn-2-base-ko-measure` 로 올려 두었지만, 올린 뒤 **GPU 대기열에서 한 시간 넘게 시작되지 않아**
  (`QUEUED`, 2026-11-29 00:05 KST 푸시) 결과 파일이 아직 없습니다.
- 결과가 나오면 받는 방법:
  ```
  kaggle kernels output ccttsi/ftn-2-base-ko-measure -p ./measure-out     # ftn2_measure.json
  ```
  같은 조건으로 다시 재려면: `python3 ops/ftn/train/measure_base.py --models qwen3-4b-instruct,kanana-1.5-8b --out measure.json`
  (4비트·greedy·프롬프트 9건·응답 시간/토큰 수/한글 비율/다른 문자권/정답 수치를 기계로 센다).
- **값을 추정해 채우지 않았습니다.** §4 의 판정은 라이선스·크기·올릴 곳 지원·제조사 공식 벤치로만 했고,
  한국어 실측은 Llama-3.2-3B 1건과 Kanana 의 공식 한국어 벤치(KoMT-Bench·KMMLU)가 전부입니다.

### 3.3 실제 답 (증거)

**Llama-3.2-3B-Instruct · p4** (2026-11-29 00:1x, 8.0초) — 한자·가나가 섞인 답:

> 반도체 장비 엔지니어로 이직하는 것은 어려운 일일 수 있지만, 적절한 전략과 노력을 통해 성공할 수 있습니다.**以下**은 brief한 경력 어필 방법입니다.
> 1. **경험 및 스킬 강화**: 반도체 industry에서 경험을 쌓고 스킬을 강화하세요. 반도체 장비의 설계, 개발, 테스트를 포함하여 다양한 분야에**涉**여해 보세요.
> …
> 4. **ポート폴리오 만들기**: 자신의 경험과 스킬을 보여주는 포트폴리오**を作成**하세요.

**Llama-3.2-3B-Instruct · p1** (9.9초) — 인도 문자(데바나가리)까지 섞인 문장:

> 반도체 장비 엔지니어로 이직하는 것은 좋은 선택이 될 수 있습니다. … **आपक**은 자신의 경력을 효과적으로 어필하기 위해 …
> 1. **경력에 대한 정리**: 먼저, **अपने** 현재의 경력을 정리해 보세요. 제조업에서 5**年的** 경험이 있으므로 …

- 한글 비율 0.43~0.44, 다른 문자권 12~14자. 조사·어미는 붙지만 «industry·brief·experience» 같은 영어와 한자·가나,
  데바나가리까지 섞여 **상담 답으로 내보낼 수 없는 수준**입니다.
- 공식 카드가 한국어를 지원 언어로 두지 않은 것과 일치합니다.

## 4. 판정과 이유

1. **라이선스가 가장 깨끗한 것**(Apache-2.0)이 둘 남았습니다 — Qwen3와 Kanana. Gemma·Llama 는 배포 조건(표기·NOTICE·이름 규칙)이 붙고 gated 라 자동 실행이 막힙니다.
2. 그 둘 중 **학습·서빙이 가벼운 쪽**이 Qwen3-4B(4.0B)입니다. Kaggle T4 16GB 에서 4비트 QLoRA 가 여유 있게 돌고, ZeroGPU 48GB 에 bf16(8GB)로도 들어갑니다.
3. **이미 서빙 코드가 Qwen3-4B-Instruct-2507 을 기본값으로** 잡아 두었습니다(`ops/serve/zerogpu/space/app.py`, PR #571). FTN-3 산출물(어댑터)을 12-22 개통 때 그대로 얹을 수 있습니다.
4. Kanana 는 **한국어 특화를 공식 벤치로 내세우는 유일한 후보**입니다. §3.2-1 실측에서 «근거를 보고 답하기»가 Qwen3 보다 확실히 나으면 1순위를 바꾸는 것이 맞습니다 — 그러면 학습은 `CONFIG["base_model"]` 한 줄, 서빙은 `WITW_MODEL_ID` 한 줄입니다.

## 5. 미확인·한계

- Gemma-3-4B-it 은 **한국어 실측 0** — gated(약관 동의) + 당일 ZeroGPU 한도 소진. 필요하면 태화님이 HF 에서 약관에 동의한 뒤 `HF_TOKEN` 으로 같은 러너를 돌리면 됩니다.
- Qwen3·Kanana 는 **이번 판 실측 0** 입니다. 1순위 판단은 라이선스·크기·올릴 곳 지원·제조사 공식 벤치로만 했고,
  실제 한국어 답의 질은 §3.2-1 의 측정이 나온 뒤에 확인해야 합니다. AUP-2 전체 성적표(302문)를 기본 모델에 돌리는 것은 FTN-4 맞대기에서 합니다.
- ZeroGPU 무료 한도(5분/일)는 한 번 쓰면 24시간 뒤 리셋이라, 하루에 여러 모델을 비교하려면 Kaggle 쪽에서 재는 편이 낫습니다(그래서 실측 러너를 Kaggle 커널로도 돌립니다).
- 모델 카드의 한국어 벤치가 서로 다른 시험(KoMT-Bench vs MMLU-ProX 등)이라 **제조사 수치끼리 직접 비교하지 않았습니다**.

## 6. 출처 (확인일 2026-11-29)

- Qwen3-4B-Instruct-2507 모델 카드·LICENSE(Apache-2.0): https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507
- Qwen3-4B(하이브리드 사고) 카드: https://huggingface.co/Qwen/Qwen3-4B
- Kanana-1.5-8B-Instruct-2505 카드(성능표·Apache-2.0 표기): https://huggingface.co/kakaocorp/kanana-1.5-8b-instruct-2505
- Gemma 약관(2026-04-01 개정, §3.1 배포 조건·§3.2 사용 제한): https://ai.google.dev/gemma/terms
- Gemma 3 모델 카드(140+ 언어·128K): https://ai.google.dev/gemma/docs/core/model_card_3
- Llama 3.2 모델 카드(공식 지원 언어 8개): https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/MODEL_CARD.md
- Llama 3.2 라이선스(§1.b 표기 의무·§2 700M MAU): https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/LICENSE
- HF 모델 API(파라미터 수·gated 여부): `https://huggingface.co/api/models/<id>` — `safetensors.total`·`gated`
- Cloudflare Workers AI 비교군: 노션 「FTN-2 · LLS-1 서류 조사」 「Cloudflare Workers AI 비교군 실측」(2026-11-28, 인스팅트)
