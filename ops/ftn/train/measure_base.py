#!/usr/bin/env python3
"""FTN-2 기본 모델 한국어 실측 — 후보를 «같은 프롬프트»로 돌려 속도·완결성·근거 사용·수치 정확을 잰다.

무엇을 재나(노션 FTN-2 「거르는 순서」 ③ 한국어 실력):
  · p1~p4  상담 문답 — 한국어 자연스러움·지시 이행·속도. 문장은 `ops/serve/zerogpu/prompts/measure_prompts.json`
           과 같은 문장이라 이미 잰 Cloudflare Workers AI·ZeroGPU 수치와 나란히 놓을 수 있다(시험이 대조한다).
  · p5·p6  근거를 주고 계산·제도를 묻는다 — FTN 의 «근거를 보고 답하는» 모양을 기본 모델이 할 수 있는가.
  · n1~n3  AUP-2 성적표 시험 문항 중 법정 수치 3개(최저임금 시급·구직급여 상한·국민연금 요율) —
           근거 없이 물었을 때 2026년 값을 맞히는가. 기대값은 `data/legal-constants.json` 에서 읽는다.

쓰는 법(로컬·Kaggle 공통, GPU 필요):
    python3 ops/ftn/train/measure_base.py --list                     # 후보·프롬프트만 보기(모델 안 올림)
    python3 ops/ftn/train/measure_base.py --dry-run                  # 조립만 확인(모델 안 올림)
    python3 ops/ftn/train/measure_base.py --models qwen3-4b-instruct,kanana-1.5-8b --out measure.json

지키는 선:
  · 비밀값 없음 — 공개(gated 아님) 모델만 받는다. HF_TOKEN 은 환경변수에 있으면 쓰고, 없으면 그냥 진행한다.
  · 4비트(NF4)로 올린다 — Kaggle T4 16GB 에서 8B 까지 들어가는지가 FTN-3 의 전제라서 같은 조건으로 잰다.
  · 같은 조건 비교: greedy(do_sample=False), 모델마다 같은 프롬프트·같은 max_new_tokens.
  · 못 부른 모델은 «못 불렀다»고 적는다(이유 포함). 값을 지어내지 않는다.
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

SCHEMA = "witw-ftn2-measure/1.0.0"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LEGAL = os.path.join(ROOT, "data", "legal-constants.json")

# 후보 — 이름·라이선스는 2026-11-29 Hugging Face API 로 확인한 값(문서: ops/ftn/MODEL_COMPARISON.md).
MODELS = {
    "qwen3-4b-instruct": {
        "id": "Qwen/Qwen3-4B-Instruct-2507",
        "params": "4.0B",
        "license": "Apache-2.0",
        "gated": False,
        "note": "FTN-3 기본 타깃 · 사고(thinking) 없음 · 256K 문맥",
    },
    "qwen3-4b": {
        "id": "Qwen/Qwen3-4B",
        "params": "4.0B",
        "license": "Apache-2.0",
        "gated": False,
        "note": "사고 켜고 끄기 겸용(하이브리드) — 사고 토큰이 답을 밀어낼 수 있다",
    },
    "kanana-1.5-8b": {
        "id": "kakaocorp/kanana-1.5-8b-instruct-2505",
        "params": "8.0B",
        "license": "Apache-2.0",
        "gated": False,
        "note": "카카오 한국어 특화 · 32K 문맥(YaRN 128K)",
    },
    "gemma-3-4b": {
        "id": "google/gemma-3-4b-it",
        "params": "4.3B",
        "license": "Gemma Terms of Use",
        "gated": True,
        "note": "HF 에서 약관 동의(gated) 필요 — 토큰 없이는 못 받는다",
    },
    "llama-3.2-3b": {
        "id": "meta-llama/Llama-3.2-3B-Instruct",
        "params": "3.2B",
        "license": "Llama 3.2 Community License",
        "gated": True,
        "note": "HF 에서 약관 동의(gated) 필요 — 토큰 없이는 못 받는다",
    },
}

# p1~p6 — `ops/serve/zerogpu/prompts/measure_prompts.json` 과 같은 문장(시험이 글자까지 대조한다).
#   Kaggle 처럼 저장소 밖에서 도는 곳에서도 같은 프롬프트를 쓰려고 여기에 한 벌 더 둔다.
PROMPTS = [
    {
        "id": "p1-cf-1",
        "kind": "상담",
        "evidence": "",
        "question": "저는 제조업 5년차인데 반도체 장비 엔지니어로 이직하고 싶어요. 제 경력을 어떻게 어필하면 좋을까요?",
        "max_new_tokens": 400,
    },
    {
        "id": "p2-cf-2",
        "kind": "상담",
        "evidence": "",
        "question": "면접에서 '당신의 약점은 무엇인가요?'라는 질문에 어떻게 답하면 좋을지 예시를 들어주세요.",
        "max_new_tokens": 400,
    },
    {
        "id": "p3-cf-3",
        "kind": "상담",
        "evidence": "",
        "question": "스타트업과 대기업 중 어디로 가야 할지 고민입니다. 각각의 장단점을 비교해서 조언해주세요.",
        "max_new_tokens": 400,
    },
    {
        "id": "p4-cf-short",
        "kind": "상담",
        "evidence": "",
        "question": "제조업 5년차인데 반도체 장비 엔지니어로 이직하고 싶어요. 경력 어필 방법을 짧게 알려주세요.",
        "max_new_tokens": 300,
    },
    {
        "id": "p5-evidence-wage",
        "kind": "근거·계산",
        "evidence": "2026년 적용 최저임금: 시간급 10,320원, 1일 8시간 기준 82,560원, 월 209시간 환산 2,156,880원 "
                    "(고용노동부고시 제2025-47호, 2026. 1. 1.~12. 31. 적용). 수습 시작 3개월 이내이면서 1년 이상 "
                    "계약이면 10% 감액 가능(시간급 9,288원). 출처: 자료실 공용 법정 수치 장부"
                    "(data/legal-constants.json, 2026-11-21 확인).",
        "question": "수습 2개월차(2년 계약)인데 시급 9,000원을 받고 있어요. 최저임금 위반인가요?",
        "max_new_tokens": 300,
    },
    {
        "id": "p6-evidence-ei",
        "kind": "근거·계산",
        "evidence": "2026년 구직급여일액 상한: 1일 68,100원(급여기초임금일액 상한 113,500원의 60%). "
                    "하한: 최저임금 기준 1일 8시간 66,048원(최저임금×1일 소정근로시간×80%). 2026. 1. 1. 이후 이직자 기준."
                    " 출처: 자료실 공용 법정 수치 장부(data/legal-constants.json, 고용보험법 제45조·제46조·시행령 제68조).",
        "question": "이직 전 월급이 400만원이었는데, 구직급여는 하루에 얼마까지 받을 수 있나요?",
        "max_new_tokens": 300,
    },
]

# AUP-2 성적표 시험 문항(그대로) + 기대값 포인터. 기대값은 `data/legal-constants.json` 이 원천이다.
NUMERIC = [
    {"id": "NUM-001", "kind": "수치", "question": "올해 최저임금 시급이 얼마예요?",
     "pointer": "minimumWage.hourly", "expect": 10320, "unit": "원", "max_new_tokens": 150},
    {"id": "NUM-005", "kind": "수치", "question": "구직급여 하루 상한액이 얼마인가요?",
     "pointer": "jobSeeking.dailyCap", "expect": 68100, "unit": "원", "max_new_tokens": 150},
    {"id": "NUM-007", "kind": "수치", "question": "국민연금 근로자 부담 요율이 몇 퍼센트예요?",
     "pointer": "socialInsurance.pensionRateWorker", "expect": 0.0475, "unit": "비율", "max_new_tokens": 150},
]

HANGUL = re.compile(r"[가-힣]")
# 한국어 문장에 섞이면 «다른 문자권» — Llama-3.2-3B 가 보인 한자·가나·태국문자 같은 것.
FOREIGN_SCRIPT = re.compile(r"[\u4e00-\u9fff\u3040-\u30ff\u0e00-\u0e7f\u0400-\u04ff]")


def load_prompts(path=""):
    """프롬프트 — 저장소 안 JSON 이 있으면 그것, 없으면(예: Kaggle) 여기 박힌 사본."""
    prompts = [dict(p) for p in PROMPTS]
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        prompts = [dict(p) for p in data["prompts"]]
    items = [dict(p) for p in NUMERIC]
    for item in items:
        # 저장소 밖(Kaggle)에서는 법정 수치 원천 파일이 없다 — 그때는 박아 둔 기대값을 쓴다.
        value = legal_value(item["pointer"])
        if value is not None:
            item["pointer_value"] = value
    return prompts + items


def legal_value(pointer):
    """`data/legal-constants.json` 에서 포인터 값(예: minimumWage.hourly)을 읽는다. 없으면 None."""
    group, _, key = pointer.partition(".")
    try:
        with open(LEGAL, encoding="utf-8") as fh:
            data = json.load(fh)
        return data["groups"][group]["values"][key]["value"]
    except (OSError, KeyError, ValueError):
        return None


def number_forms(value, unit):
    """정답 수치가 답에 나타날 수 있는 모양들 — 쉼표·소수·퍼센트 표기 흔들림을 모두 받는다."""
    if unit == "비율":
        pct = round(float(value) * 100, 4)
        return {f"{pct:g}", f"{pct:g}%", f"{value:g}"}
    n = int(round(float(value)))
    return {f"{n}", f"{n:,}"}


def answer_stats(text, prompt):
    """답 하나의 «기계로 잴 수 있는 것» — 한국어 비율·다른 문자권·정답 수치."""
    text = text or ""
    letters = [ch for ch in text if ch.isalpha()]
    hangul = sum(1 for ch in letters if HANGUL.match(ch))
    stats = {
        "chars": len(text),
        "hangul_ratio": round(hangul / len(letters), 3) if letters else 0.0,
        "foreign_script": len(FOREIGN_SCRIPT.findall(text)),
    }
    expect = prompt.get("pointer_value", prompt.get("expect"))
    if expect is not None and prompt.get("unit"):
        forms = number_forms(expect, prompt["unit"])
        stats["number_hit"] = any(form in text for form in forms)
        stats["number_forms"] = sorted(forms)
    return stats


def _load_model(model_id, bits=4):
    """4비트(NF4)로 올린다. torch·transformers 는 부를 때만 가져온다(로컬 시험은 안 올린다)."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None
    tokenizer = AutoTokenizer.from_pretrained(model_id, token=token)
    kwargs = {"torch_dtype": torch.float16, "device_map": {"": 0}}
    if bits == 4:
        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
    model = AutoModelForCausalLM.from_pretrained(model_id, token=token, **kwargs)
    model.eval()
    return model, tokenizer


def _generate(model, tokenizer, prompt, max_new_tokens):
    """한 건 생성 — greedy(같은 조건). (답, 새 토큰 수, 끝난 이유) 를 돌려준다."""
    import torch

    body = (prompt.get("evidence", "").strip() + "\n\n" if prompt.get("evidence") else "") + \
           "질문: " + prompt["question"]
    messages = [{"role": "user", "content": body}]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    ids = tokenizer(text, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(
            **ids,
            max_new_tokens=int(max_new_tokens),
            do_sample=False,
            temperature=None,
            top_p=None,
            top_k=None,
            pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
        )
    new_ids = out[0][ids["input_ids"].shape[1]:]
    answer = tokenizer.decode(new_ids, skip_special_tokens=True).strip()
    return answer, int(new_ids.shape[0])


def measure(model_key, prompts, bits=4):
    """모델 하나를 올려 프롬프트를 차례로 돌린다. 올리는 시간도 잰다(콜드 적재 근거)."""
    import torch

    spec = MODELS[model_key]
    started = time.time()
    model, tokenizer = _load_model(spec["id"], bits=bits)
    load_s = round(time.time() - started, 1)
    rows = []
    for prompt in prompts:
        t0 = time.time()
        try:
            answer, new_tokens = _generate(model, tokenizer, prompt, prompt.get("max_new_tokens", 300))
            error = ""
        except Exception as exc:  # 한 건이 실패해도 나머지는 잰다
            answer, new_tokens, error = "", 0, f"{type(exc).__name__}: {exc}"[:300]
        secs = round(time.time() - t0, 2)
        row = {
            "id": prompt["id"],
            "kind": prompt.get("kind", ""),
            "seconds": secs,
            "new_tokens": new_tokens,
            "tokens_per_s": round(new_tokens / secs, 2) if secs and new_tokens else 0.0,
            "error": error,
            "answer": answer,
        }
        row.update(answer_stats(answer, prompt))
        rows.append(row)
        print(f"  {prompt['id']}: {secs}s · {new_tokens}토큰 · {len(answer)}자"
              + (f" · 오류 {error}" if error else ""), flush=True)
    vram = None
    try:
        vram = round(torch.cuda.max_memory_allocated() / 1024 ** 3, 2)
    except Exception:
        pass
    del model
    try:
        import gc
        gc.collect()
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
    except Exception:
        pass
    return {"key": model_key, "load_seconds": load_s, "peak_vram_gb": vram, "rows": rows}


def hardware():
    """어디서 쟀는지 — 결과를 읽는 사람이 조건을 알아야 비교가 된다."""
    info = {"python": sys.version.split()[0]}
    try:
        import torch
        info["cuda"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            info["gpu"] = torch.cuda.get_device_name(0)
            info["vram_gb"] = round(torch.cuda.get_device_properties(0).total_memory / 1024 ** 3, 1)
    except Exception as exc:
        info["torch"] = f"없음({type(exc).__name__})"
    return info


def main(argv=None):
    ap = argparse.ArgumentParser(description="FTN-2 기본 모델 한국어 실측")
    ap.add_argument("--models", default="qwen3-4b-instruct,kanana-1.5-8b",
                    help=f"쉼표로 고른 후보: {', '.join(MODELS)}")
    ap.add_argument("--bits", type=int, default=4, help="양자화 비트(기본 4=QLoRA 와 같은 조건)")
    ap.add_argument("--prompts", default=os.path.join(ROOT, "ops", "serve", "zerogpu", "prompts", "measure_prompts.json"))
    ap.add_argument("--out", default="", help="결과 JSON 경로(비우면 화면에만)")
    ap.add_argument("--list", action="store_true", help="후보·프롬프트만 보기")
    ap.add_argument("--dry-run", action="store_true", help="조립만 확인(모델 안 올림)")
    args = ap.parse_args(argv)

    prompts = load_prompts(args.prompts)
    if args.list:
        print(f"프롬프트 {len(prompts)}건")
        for p in prompts:
            print(f"  {p['id']:16s} {p.get('kind',''):6s} {p['question'][:50]}")
        print("\n후보")
        for key, spec in MODELS.items():
            print(f"  {key:18s} {spec['id']:42s} {spec['params']:5s} {spec['license']:32s} gated={spec['gated']}")
        return 0
    if args.dry_run:
        for p in prompts:
            body = (p.get("evidence", "") + "\n\n" if p.get("evidence") else "") + "질문: " + p["question"]
            print(f"[{p['id']}] {len(body)}자 · max_new_tokens {p.get('max_new_tokens')}")
        print(json.dumps(hardware(), ensure_ascii=False))
        return 0

    report = {
        "schema": SCHEMA,
        "measured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "hardware": hardware(),
        "bits": args.bits,
        "prompts": [p["id"] for p in prompts],
        "models": [],
    }
    for key in [k.strip() for k in args.models.split(",") if k.strip()]:
        if key not in MODELS:
            print(f"모르는 후보: {key}", file=sys.stderr)
            return 2
        spec = MODELS[key]
        print(f"== {key} ({spec['id']}, {spec['params']})", flush=True)
        if spec.get("gated") and not (os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")):
            report["models"].append({"key": key, "id": spec["id"], "skipped": "gated — HF 약관 동의·토큰 필요"})
            print("  건너뜀: gated 모델이고 HF_TOKEN 이 없다", flush=True)
            continue
        try:
            report["models"].append(measure(key, prompts, bits=args.bits))
        except Exception as exc:  # 올리다 실패해도 다음 후보는 잰다
            report["models"].append({"key": key, "id": spec["id"], "failed": f"{type(exc).__name__}: {exc}"[:300]})
            print(f"  실패: {type(exc).__name__}: {exc}"[:200], flush=True)

    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        print(f"저장: {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
