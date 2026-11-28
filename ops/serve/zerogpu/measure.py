#!/usr/bin/env python3
"""ZeroGPU 스페이스 실측 러너 — 콜드스타트 1회 + 웜 N회.

실행: HF_TOKEN=... python3 ops/serve/zerogpu/measure.py [계정/스페이스이름] [--rounds 3] [--out 결과.json]

콜드스타트를 재려면 먼저 스페이스를 재시작한다(같은 계정의 write 토큰 필요):
    python3 -c "import os; from huggingface_hub import HfApi; HfApi(token=os.environ['HF_TOKEN']).restart_space('계정/스페이스이름')"
재시작 직후 첫 호출이 콜드(모델 적재 + GPU 이동 포함), 이후가 웜이다.

비교 기준(2026-11-28 실측, 노션 FTN-2·LLS-1 조사 페이지):
- Cloudflare Workers AI @cf/qwen/qwen3.8-27b 사고 끄기 6.2초 · 608자 완결
- 공개 ZeroGPU 스페이스 27B 채팅 웜 5.6초
"""
import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from gradio_client import Client

PROMPTS_PATH = Path(__file__).resolve().parent / "prompts" / "measure_prompts.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("repo", nargs="?", default="Ccttsi/witw-qna-serve")
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    prompts = json.loads(PROMPTS_PATH.read_text(encoding="utf-8"))["prompts"]
    token = os.environ.get("HF_TOKEN") or None
    try:
        client = Client(f"spaces/{args.repo}", hf_token=token)
    except TypeError:
        client = Client(f"spaces/{args.repo}")

    results = []
    seen_first = False
    for prompt in prompts:
        for _ in range(args.rounds):
            kind = "cold" if not seen_first else "warm"
            started = time.time()
            answer = client.predict(
                "", prompt["evidence"], prompt["question"], prompt["max_new_tokens"],
                api_name="/generate",
            )
            elapsed = round(time.time() - started, 1)
            seen_first = True
            row = {
                "id": prompt["id"],
                "kind": kind,
                "latency_s": elapsed,
                "chars": len(str(answer)),
                "answer_head": str(answer)[:120],
            }
            results.append(row)
            print(f"{row['id']} {kind}: {elapsed}s · {row['chars']}자")

    report = {
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "repo": args.repo,
        "results": results,
    }
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"저장: {args.out}")
    else:
        print(text)


if __name__ == "__main__":
    main()
