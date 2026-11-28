#!/usr/bin/env python3
"""ftn3_qlora.ipynb 를 만든다 — 손으로 JSON 을 쓰지 않으려고 생성기를 둔다(고칠 때 여기를 고치고 다시 돌린다).

    python3 ops/ftn/train/build_notebook.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "ftn3_qlora.ipynb")

CELLS = []
_n = 0


def md(text):
    CELLS.append({"cell_type": "markdown", "metadata": {}, "source": lines(text)})


def code(text, meta=None):
    CELLS.append({"cell_type": "code", "execution_count": None, "metadata": meta or {},
                  "outputs": [], "source": lines(text)})


def lines(text):
    """ipynb 의 source 는 «줄 목록»이다 — 끝에 \\n 을 붙인 줄들로 나눈다."""
    text = text.strip("\n")
    return [line + "\n" for line in text.split("\n")[:-1]] + [text.split("\n")[-1]]


md(r"""
# FTN-3 · QLoRA 학습 (Qwen3-4B-Instruct-2507 기본)

직업상담 자료실 비서를 작은 공개 모델 위에 LoRA 로 얹는 노트북입니다. **Kaggle 무료 GPU(T4 16GB×1)** 한 판
기준으로 짰고, 8B 후보(Kanana-1.5-8B)도 `CONFIG["base_model"]` 한 줄만 바꾸면 같은 흐름으로 돌아갑니다.

- 무엇을 배우나: **사실이 아니라 일하는 방식** — 근거를 읽고 답하는 법, 답 모양, 자료 안내, 거절, 말투.
- 데이터: `ops/ftn/train/prepare_sft.py` 가 만든 `train.jsonl`·`valid.jsonl`(ChatML `messages`). 눈검수 통과분만.
- 결과물: `adapter/`(LoRA 덧붙임 층) · `merged/`(병합본) · `run.json`(학습 기록).
  보관은 비공개 저장소/Drive `WITW-ML-Center/ftn/` — 노션 「FTN-3」 규칙 그대로.

## 미리 할 일 (로컬 PC)

1. 문답집 눈검수·승격이 끝난 뒤 학습 입력을 만든다.
   ```
   python3 ops/ftn/train/prepare_sft.py --from mlc/qa --out ops/ftn/train/data
   python3 ops/ftn/train/test_train_scripts.py      # 자기시험
   ```
2. Kaggle 에 **Dataset** 하나를 올린다 — `ops/ftn/train/` 폴더 통째(스크립트 3개 + `data/`).
   이름 예: `ccttsi/ftn3-train`. 이 노트북은 `/kaggle/input/` 아래에서 `train.jsonl` 을 찾습니다.
3. 이 노트북을 Kaggle 에 올리고 **Accelerator = GPU T4 ×1**, **Internet = On** 으로 실행합니다.
   (모델 내려받기 때문에 Internet 이 필요합니다.)

## 지키는 선

- **키는 노트북에 박지 않는다** — HF 토큰은 Kaggle **Secrets**(이름 `HF_TOKEN`)에서만 읽습니다. 없으면 없는 채로 돕니다.
- 내담자 개인정보 0 — 학습 입력 단계에서 `prepare_sft.py` 가 전화·메일·주민번호 모양을 걸러 냅니다.
- 시험 문항 0 — 2-gram 겹침 검사를 통과한 것만 들어옵니다.
- 학습 시간은 `CONFIG["time_budget_min"]` 에서 스스로 멈춥니다(Kaggle 주 30시간 중 6시간 비축 규칙).
""")

md("## 1. 환경 확인·설치\n\nKaggle 이미지에 없는 것만 설치합니다. 버전은 2026-11-29 기준 최소선입니다.")

code(r'''
import subprocess, sys, os, json, math, time, random

def ensure(*pkgs):
    """없거나 낡은 것만 설치한다 — 이미 있으면 그대로 쓴다(재시작 시간 아끼기)."""
    import importlib
    missing = []
    for name, spec in pkgs:
        try:
            mod = importlib.import_module(name)
            print(f"{name}: {getattr(mod, '__version__', '?')}")
        except Exception:
            missing.append(spec)
    if missing:
        print("설치:", missing)
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", *missing], check=False)

ensure(
    ("torch", "torch"),
    ("transformers", "transformers>=4.51"),
    ("datasets", "datasets>=2.20"),
    ("accelerate", "accelerate>=0.34"),
    ("peft", "peft>=0.13"),
    ("trl", "trl>=0.12"),
    ("bitsandbytes", "bitsandbytes>=0.44"),
)

import torch
print("\ntorch", torch.__version__, "| cuda", torch.cuda.is_available())
if torch.cuda.is_available():
    props = torch.cuda.get_device_properties(0)
    print("GPU", torch.cuda.get_device_name(0), f"{props.total_memory/1024**3:.1f}GB", "| bf16", torch.cuda.is_bf16_supported())
    print("GPU 수:", torch.cuda.device_count())
else:
    print("!! GPU 가 없다 — Kaggle 오른쪽 Settings → Accelerator 를 GPU T4 로 바꾸고 다시 실행하세요.")
''')

md(r"""
## 2. 설정 — 바꾸는 곳은 여기 하나뿐

| 칸 | 뜻 |
|---|---|
| `base_model` | 기본 모델. 기본은 `Qwen/Qwen3-4B-Instruct-2507`(Apache-2.0). `kakaocorp/kanana-1.5-8b-instruct-2505` 로 바꾸면 8B 판 |
| `max_seq_len` | 한 문장 최대 토큰. 우리 입력은 지침+근거+질문이라 **2,560 이면 전부 들어간다**(2026-11-29 실측: p50 1,372 · p99 2,261 · 최대 2,342). 8B 로 바꿀 때는 2,048(넘는 25건은 빠짐) |
| `lora_r`/`lora_alpha` | 덧붙임 층 크기. 4B 는 r=16/α=32, 8B 는 r=8~16 권장 |
| `epochs`·`lr` | 3회·2e-4 가 무난. 손실이 안 내려가면 lr 을 절반으로 |
| `time_budget_min` | 이 시간을 넘으면 스스로 멈춘다(비축 규칙) |
""")

code(r'''
CONFIG = {
    # ── 모델 ─────────────────────────────────────────────
    "base_model": "Qwen/Qwen3-4B-Instruct-2507",
    "load_bits": 4,                 # QLoRA — 4비트 NF4
    "max_seq_len": 2560,          # 실측: p50 1,372 · 최대 2,342 → 2,560 이면 462건 전부 들어간다

    # ── LoRA ─────────────────────────────────────────────
    "lora_r": 16,
    "lora_alpha": 32,
    "lora_dropout": 0.05,
    "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],

    # ── 학습 ─────────────────────────────────────────────
    "epochs": 3,
    "lr": 2e-4,
    "batch_size": 1,
    "grad_accum": 16,
    "warmup_ratio": 0.03,
    "weight_decay": 0.0,
    "eval_every": 50,               # 스텝
    "save_every": 100,
    "seed": 42,
    "time_budget_min": 150,         # 2시간 30분 — 넘으면 멈춘다
    "allow_draft": False,           # 연습용: draft(눈검수 전)로도 돌려 보려면 True (기록에 남는다)

    # ── 자리 ─────────────────────────────────────────────
    "input_root": "/kaggle/input",  # Dataset 을 붙이면 여기 아래에 풀린다
    "out_dir": "/kaggle/working/out",
    "merge_after_train": True,      # 병합본까지 만들어 둔다(ZeroGPU 서빙용)
}
print(json.dumps(CONFIG, ensure_ascii=False, indent=2))
''')

md(r"""
## 3. 학습 데이터 찾기

`/kaggle/input/` 아래에서 `train.jsonl`·`valid.jsonl`·`manifest.json` 이 같이 있는 폴더를 찾습니다.
`manifest.json` 의 지문(`fingerprint`)을 그대로 다시 계산해, **학습 입력이 바뀌지 않았는지** 확인합니다.
""")

code(r'''
import hashlib

def find_sft(root):
    """데이터 폴더(train/valid/manifest)와 스크립트 폴더(sft_format.py)를 각각 찾는다. 없으면 어떻게 만들지 알려 준다."""
    data_dir = script_dir = ""
    for base, _dirs, files in os.walk(root):
        if not data_dir and {"train.jsonl", "valid.jsonl", "manifest.json"} <= set(files):
            data_dir = base
        if not script_dir and "sft_format.py" in files:
            script_dir = base
        if data_dir and script_dir:
            break
    if data_dir and script_dir:
        return data_dir, script_dir
    if data_dir:
        raise SystemExit(
            "학습 입력은 찾았는데 `sft_format.py` 가 없다 — 조립 규칙을 한 벌만 쓰기 위해 스크립트가 필요하다.\n"
            "Dataset 을 `ops/ftn/train/` 폴더 **째** 올리고(스크립트 + data/) Add Data 에 붙인다."
        )
    raise SystemExit(
        "학습 입력을 못 찾았다.\n"
        "① 로컬에서 `python3 ops/ftn/train/prepare_sft.py --from mlc/qa --out ops/ftn/train/data`\n"
        "② `ops/ftn/train/` 폴더를 Kaggle Dataset 으로 올리고 이 노트북 Add Data 에 붙인다\n"
        "③ 다시 실행"
    )

SFT_DIR, SCRIPT_DIR = find_sft(CONFIG["input_root"])
for path in (SCRIPT_DIR, SFT_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)
print("학습 입력:", SFT_DIR, "| 스크립트:", SCRIPT_DIR)

import sft_format, prepare_sft          # noqa: E402 — 데이터셋에 들어 있는 같은 파일

def load_jsonl(path):
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]

train_rows = load_jsonl(os.path.join(SFT_DIR, "train.jsonl"))
valid_rows = load_jsonl(os.path.join(SFT_DIR, "valid.jsonl"))
manifest = json.load(open(os.path.join(SFT_DIR, "manifest.json"), encoding="utf-8"))

def digest(rows):
    raw = json.dumps(rows, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]

print(f"train {len(train_rows)} · valid {len(valid_rows)}")
# 지문은 «train + valid 전체»로 센다(prepare_sft.py 가 그렇게 남긴다).
data_fingerprint = digest(train_rows + valid_rows)
print("지문", data_fingerprint, "| manifest", manifest.get("fingerprint"))
assert data_fingerprint == manifest.get("fingerprint"), "학습 입력이 manifest 와 다르다 — prepare_sft 를 다시 돌린다"
drafts = [r["id"] for r in train_rows + valid_rows if r["meta"]["status"] == "draft"]
if drafts:
    assert CONFIG["allow_draft"], f"draft(눈검수 전) {len(drafts)}건이 섞여 있다 — split.py --promote 먼저. 연습이면 CONFIG['allow_draft']=True"
    print(f"!! 연습 실행 — draft {len(drafts)}건으로 학습한다(채택하면 안 됨)")
print("답 유형:", manifest.get("style"))
print("거절 비중:", manifest.get("refusal_share"))
''')

md(r"""
## 4. ChatML 로 펴고 토큰 길이 확인

`messages` → 채팅 템플릿 한 덩이(`text`). Qwen 의 템플릿은 `<|im_start|>…<|im_end|>` 이고, 끝에 EOS 가 붙습니다.
길이를 넘는 줄은 **자르지 않고 뺍니다** — 질문이 잘리면 배우는 내용이 뒤집힙니다.
""")

code(r'''
from transformers import AutoTokenizer
from datasets import Dataset

token = os.environ.get("HF_TOKEN") or None
tokenizer = AutoTokenizer.from_pretrained(CONFIG["base_model"], token=token)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

def to_text(row):
    return {"text": tokenizer.apply_chat_template(row["messages"], tokenize=False, add_generation_prompt=False)}

def token_len(text):
    return len(tokenizer(text)["input_ids"])

def pack(rows, name):
    texts = [to_text(r)["text"] for r in rows]
    lengths = [token_len(t) for t in texts]
    keep = [i for i, n in enumerate(lengths) if n <= CONFIG["max_seq_len"]]
    dropped = len(lengths) - len(keep)
    if dropped:
        print(f"  {name}: {dropped}건이 {CONFIG['max_seq_len']}토큰을 넘어 뺐다")
    ordered = sorted(lengths[i] for i in keep)
    if ordered:
        print(f"  {name}: {len(ordered)}건 · 중앙 {ordered[len(ordered)//2]} · 최대 {ordered[-1]} 토큰")
    return Dataset.from_dict({"text": [texts[i] for i in keep]})

train_ds = pack(train_rows, "train")
valid_ds = pack(valid_rows, "valid")
assert len(train_ds) > 0, "학습할 문장이 0건이다"
print("\n예시 한 건(앞 400자):\n", train_ds[0]["text"][:400])
''')

md(r"""
## 5. 키 읽기 — Kaggle Secrets (없어도 되는 것만)

공개 모델(Qwen3·Kanana, 둘 다 Apache-2.0)은 토큰 없이 받습니다. gated 모델(Gemma·Llama)로 바꿀 때만
`HF_TOKEN` 이 필요합니다. **값을 화면에 찍지 않습니다.**
""")

code(r'''
def read_secret(name):
    try:
        from kaggle_secrets import UserSecretsClient
        return UserSecretsClient().get_secret(name)
    except Exception:
        return os.environ.get(name) or ""

hf_token = read_secret("HF_TOKEN")
os.environ["HF_TOKEN"] = hf_token          # 여기서만 쓰고 출력하지 않는다
print("HF_TOKEN:", "있음" if hf_token else "없음(공개 모델은 없어도 된다)")
''')

md(r"""
## 6. 4비트로 모델 올리기

T4 는 bf16 이 없어 **fp16** 으로 계산합니다. NF4 + double quant 로 4B 는 약 2.5GB, 8B 는 약 5GB —
T4 16GB 에 학습 여유(그래디언트·활성값)까지 남습니다.
""")

code(r'''
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
bnb = BitsAndBytesConfig(
    load_in_4bit=CONFIG["load_bits"] == 4,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_use_double_quant=True,
    bnb_4bit_compute_dtype=compute_dtype,
)
model = AutoModelForCausalLM.from_pretrained(
    CONFIG["base_model"], quantization_config=bnb, device_map={"": 0}, token=token or None,
)
model.config.use_cache = False
model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
print("VRAM 사용:", round(torch.cuda.memory_allocated() / 1024**3, 2), "GB")
''')

code(r'''
lora = LoraConfig(
    r=CONFIG["lora_r"], lora_alpha=CONFIG["lora_alpha"], lora_dropout=CONFIG["lora_dropout"],
    target_modules=CONFIG["target_modules"], bias="none", task_type="CAUSAL_LM",
)
model = get_peft_model(model, lora)
trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
total = sum(p.numel() for p in model.parameters())
print(f"학습하는 파라미터 {trainable:,} / 전체 {total:,} = {trainable/total:.2%}")
''')

md(r"""
## 7. 학습

- 답(assistant) 토큰에만 손실을 겁니다 — 지침·근거를 외우지 않고 **답하는 법**을 배우게.
  (trl 판이 달라 `DataCollatorForCompletionOnlyLM` 이 없으면 전체에 손실을 걸고 그 사실을 기록합니다.)
- `time_budget_min` 을 넘으면 스스로 멈춥니다. 멈춰도 저장된 체크포인트에서 이어 쓸 수 있습니다.
""")

code(r'''
from transformers import TrainerCallback
from trl import SFTConfig, SFTTrainer

class TimeGuard(TrainerCallback):
    """정해진 시간을 넘으면 학습을 멈춘다 — Kaggle 주간 한도(6시간 비축)를 지키는 장치."""
    def __init__(self, minutes):
        self.limit = minutes * 60
        self.t0 = time.time()
    def on_step_end(self, args, state, control, **kwargs):
        if time.time() - self.t0 > self.limit:
            print(f"!! 시간 한도 {self.limit/60:.0f}분 — 여기서 멈춘다(step {state.global_step})")
            control.should_training_stop = True

import inspect
def build_sft_config(common, variants):
    """trl·transformers 판마다 이름이 다르다(`max_length`↔`max_seq_length`, `eval_strategy`↔`evaluation_strategy`).
    되는 조합을 차례로 시도하고, 다 안 되면 마지막 오류를 띄운다."""
    last = None
    for extra in variants:
        try:
            return SFTConfig(**{**common, **extra})
        except TypeError as exc:
            last = exc
    raise last

LEN = CONFIG["max_seq_len"]
sft_cfg = build_sft_config(
    dict(
        output_dir=os.path.join(CONFIG["out_dir"], "checkpoints"),
        dataset_text_field="text",
        per_device_train_batch_size=CONFIG["batch_size"],
        gradient_accumulation_steps=CONFIG["grad_accum"],
        num_train_epochs=CONFIG["epochs"],
        learning_rate=CONFIG["lr"],
        warmup_ratio=CONFIG["warmup_ratio"],
        weight_decay=CONFIG["weight_decay"],
        lr_scheduler_type="cosine",
        optim="paged_adamw_8bit",
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        gradient_checkpointing=True,
        logging_steps=10,
        logging_first_step=True,
        eval_steps=CONFIG["eval_every"],
        save_steps=CONFIG["save_every"],
        save_total_limit=2,
        report_to="none",
        seed=CONFIG["seed"],
        packing=False,
    ),
    [
        {"max_length": LEN, "eval_strategy": "steps"},
        {"max_seq_length": LEN, "eval_strategy": "steps"},
        {"max_length": LEN, "evaluation_strategy": "steps"},
        {"max_seq_length": LEN, "evaluation_strategy": "steps"},
    ],
)
print("max seq:", getattr(sft_cfg, "max_length", None) or getattr(sft_cfg, "max_seq_length", None))

# 답 토큰에만 손실 — 템플릿에서 assistant 차례 앞 표지를 찾아 쓴다.
collator = None
try:
    from trl import DataCollatorForCompletionOnlyLM
    marker = tokenizer.apply_chat_template(
        [{"role": "user", "content": "x"}, {"role": "assistant", "content": "y"}], tokenize=False
    ).split("y")[0].split("x")[-1]
    if marker.strip():
        collator = DataCollatorForCompletionOnlyLM(response_template=marker, tokenizer=tokenizer)
        print("답 토큰에만 손실을 건다. 표지:", repr(marker))
    else:
        print("assistant 표지를 못 찾았다 — 전체에 손실을 건다")
except Exception as exc:
    print("DataCollatorForCompletionOnlyLM 없음:", type(exc).__name__, "— 전체에 손실을 건다")

trainer_kwargs = dict(
    model=model, train_dataset=train_ds, eval_dataset=valid_ds,
    args=sft_cfg, callbacks=[TimeGuard(CONFIG["time_budget_min"])],
)
if collator is not None:
    trainer_kwargs["data_collator"] = collator
try:
    trainer = SFTTrainer(tokenizer=tokenizer, **trainer_kwargs)
except TypeError:                     # trl 0.13+ 는 processing_class 로 부른다
    trainer = SFTTrainer(processing_class=tokenizer, **trainer_kwargs)
print("학습 스텝:", trainer.args.max_steps or "에폭 기준")
''')

code(r'''
t0 = time.time()
result = trainer.train()
minutes = round((time.time() - t0) / 60, 1)
print(f"학습 끝 — {minutes}분 · 스텝 {trainer.state.global_step}")
print("학습 손실 기록(마지막 5개):", [round(h["loss"], 4) for h in trainer.state.log_history if "loss" in h][-5:])
''')

md("## 8. 덧붙임 층(saved adapter) 저장 + 학습 기록")

code(r'''
adapter_dir = os.path.join(CONFIG["out_dir"], "adapter")
os.makedirs(adapter_dir, exist_ok=True)
model.save_pretrained(adapter_dir)
tokenizer.save_pretrained(adapter_dir)

losses = [h["loss"] for h in trainer.state.log_history if "loss" in h]
evals = [h["eval_loss"] for h in trainer.state.log_history if "eval_loss" in h]
run = {
    "schema": "witw-ftn3-run/1.0.0",
    "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    "base_model": CONFIG["base_model"],
    "data_fingerprint": data_fingerprint,
    "data": {"train": len(train_ds), "valid": len(valid_ds), "manifest_style": manifest.get("style")},
    "lora": {k: CONFIG[k] for k in ("lora_r", "lora_alpha", "lora_dropout", "target_modules")},
    "train": {k: CONFIG[k] for k in ("epochs", "lr", "batch_size", "grad_accum", "max_seq_len")},
    "steps": trainer.state.global_step,
    "train_loss_first": round(losses[0], 4) if losses else None,
    "train_loss_last": round(losses[-1], 4) if losses else None,
    "eval_loss": [round(v, 4) for v in evals],
    "minutes": minutes,
    "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
    "finish_reason": trainer.state.log_history[-1].get("train_runtime") and "완주" or "미상",
    "notes": "답 토큰에만 손실" if collator is not None else "전체 토큰에 손실",
}
with open(os.path.join(CONFIG["out_dir"], "run.json"), "w", encoding="utf-8") as fh:
    json.dump(run, fh, ensure_ascii=False, indent=2)
print(json.dumps(run, ensure_ascii=False, indent=2)[:1200])
''')

md(r"""
## 9. 병합본 만들기 (서빙용) — `ops/serve/zerogpu/` 와 바로 이어지는 자리

ZeroGPU 스페이스(`space/app.py`)는 `WITW_LORA_ADAPTER` 에 **어댑터 리포 이름**을 넣으면 병합해 서빙합니다.
여기서는 병합본을 만들어 Kaggle 산출물로 남깁니다(12-22 개통 때 올릴 것).
""")

code(r'''
if CONFIG["merge_after_train"]:
    from peft import PeftModel
    del model, trainer
    torch.cuda.empty_cache()

    base = AutoModelForCausalLM.from_pretrained(
        CONFIG["base_model"], torch_dtype=compute_dtype, device_map={"": 0}, token=token or None,
    )
    merged = PeftModel.from_pretrained(base, adapter_dir).merge_and_unload()
    merged_dir = os.path.join(CONFIG["out_dir"], "merged")
    merged.save_pretrained(merged_dir, safe_serialization=True)
    tokenizer.save_pretrained(merged_dir)
    print("병합본:", merged_dir, "| VRAM", round(torch.cuda.memory_allocated() / 1024**3, 2), "GB")
    del base, merged
    torch.cuda.empty_cache()
else:
    print("병합 건너뜀(CONFIG.merge_after_train=False)")
''')

md(r"""
## 10. 추론 검증 — 학습본이 «근거를 보고」 답하는가

valid 에서 몇 건을 골라 ① 원래 모범 답 ② 학습본 답 ③ 학습 전 기본 모델 답을 나란히 놓습니다.
숫자(법정 수치)가 답에 살아 있는지도 기계로 확인합니다.
""")

code(r'''
def generate(chat_model, tok, instruction, evidence, question, max_new_tokens=256):
    """서빙(`space/app.py`)과 같은 조립 — sft_format 이 만든 세 칸을 그대로 쓴다."""
    messages = [
        {"role": "system", "content": instruction},
        {"role": "user", "content": ("근거:\n" + evidence + "\n\n" if evidence else "") + "질문: " + question},
    ]
    prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    ids = tok(prompt, return_tensors="pt").to(chat_model.device)
    with torch.no_grad():
        out = chat_model.generate(**ids, max_new_tokens=max_new_tokens, do_sample=False,
                                  pad_token_id=tok.pad_token_id or tok.eos_token_id)
    return tok.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True).strip()

import random
random.seed(CONFIG["seed"])
sample_rows = random.sample(valid_rows, min(3, len(valid_rows)))
for row in sample_rows:
    question = row["messages"][1]["content"].rsplit("질문: ", 1)[-1]
    print("=" * 78)
    print("질문:", question)
    print("모범 답:", sft_format.strip_refs(row["messages"][2]["content"])[0][:300])
''')

code(r'''
# 병합본으로 같은 세 건을 다시 돌려 «학습 뒤» 답을 본다
from transformers import AutoModelForCausalLM
ft_model = AutoModelForCausalLM.from_pretrained(
    os.path.join(CONFIG["out_dir"], "merged"), torch_dtype=compute_dtype, device_map={"": 0},
)
ft_tok = AutoTokenizer.from_pretrained(os.path.join(CONFIG["out_dir"], "merged"))
ft_model.eval()

answer_log = []
for row in sample_rows:
    body = row["messages"][1]["content"]
    evidence = body.split("근거:\n", 1)[1].rsplit("\n\n질문: ", 1)[0] if body.startswith("근거:\n") else ""
    question = body.rsplit("질문: ", 1)[-1]
    answer = generate(ft_model, ft_tok, row["messages"][0]["content"], evidence, question)
    answer_log.append({"id": row["id"], "question": question, "answer": answer})
    print("=" * 78)
    print("질문:", question)
    print("학습본:", answer[:400])

with open(os.path.join(CONFIG["out_dir"], "samples.json"), "w", encoding="utf-8") as fh:
    json.dump(answer_log, fh, ensure_ascii=False, indent=2)

# 화면·서빙에 보일 때는 인용 줄을 뗀다(자료실 파이프라인과 같은 규칙)
print("\n인용 줄 뗀 예시:", sft_format.strip_refs(answer_log[0]["answer"])[0][:160])
''')

md(r"""
## 11. 산출물 정리 — 어디에 무엇이 남았나

| 파일 | 쓰임 |
|---|---|
| `out/adapter/` | LoRA 덧붙임 층 — 재학습·이어학습에 씀 |
| `out/merged/` | 병합본 — ZeroGPU 스페이스에 올릴 것 |
| `out/run.json` | FTN-3 기록(데이터 지문·하이퍼파라미터·손실·시간) |
| `out/samples.json` | 눈으로 본 표본 답 3건 |

보관: 비공개 저장소 또는 Drive `WITW-ML-Center/ftn/v1/`. **Kaggle 노트북은 공개하지 않는다**(학습 입력이 들어 있음).
""")

code(r'''
for base, _dirs, files in os.walk(CONFIG["out_dir"]):
    for name in sorted(files)[:8]:
        path = os.path.join(base, name)
        print(f"{os.path.relpath(path, CONFIG['out_dir']):60s} {os.path.getsize(path)/1024/1024:7.1f}MB")
''')

md(r"""
## 다음 (FTN-4)

1. 이 학습본을 **같은 시험 문항**으로 AUP 비서(Gemini)와 맞대기 — 성적표 항목별 비교.
2. 채택 조건 **G-FTN**: 자료 안내·답 모양·거절에서 AUP 이상, 수치는 검사기(AUP-5) 통과 뒤 100%, 공격 시험 통과.
3. 못 미치면 이 노트북의 `CONFIG` 로 후보를 바꿔 다시 — 또는 FTN-1 문답을 보강해서 다시.

### 알아 둘 한계

- 작은 모델은 긴 추론·복잡한 법 해석에서 Gemini 보다 약합니다. 그런 질문은 «자료 안내 + 확인할 곳»으로 답하도록 가르칩니다.
- 파인튜닝은 사실을 넣는 수단이 아닙니다. 새 법령·수치는 언제나 근거 조각(AUP-3)을 갱신해 넣습니다.
- T4 는 bf16 이 없어 fp16 으로 돕니다. 손실이 발산하면 `CONFIG["lr"]` 을 절반으로 낮춥니다.
- 8B(Kanana)로 바꾸면 `batch_size` 1·`grad_accum` 16 은 그대로 두되 `max_seq_len` 을 2,048 로 낮추는 편이 안전합니다(그러면 25건이 빠집니다).
""")


def main():
    nb = {
        "cells": [],
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3.11"},
            "kaggle": {"accelerator": "nvidiaTeslaT4", "dataSources": [], "isInternetEnabled": True,
                        "language": "python", "sourceType": "notebook"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    for i, cell in enumerate(CELLS):
        cell["id"] = f"ftn3-{i:02d}"
        nb["cells"].append(cell)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(nb, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"{OUT} — 셀 {len(CELLS)}개")


if __name__ == "__main__":
    main()
