#!/usr/bin/env python3
"""ZeroGPU 스페이스 배포 — 2026-12-22(계정 생성 30일) 당일 실행.

준비: HF write 토큰(볼트 「instinct-spaces」)을 환경변수 HF_TOKEN으로 넣는다.
    토큰 값은 저장소·문서·로그에 남기지 않는다(CONSTITUTION 3-2).

실행: HF_TOKEN=... python3 ops/serve/zerogpu/deploy.py [계정/스페이스이름]
    기본 스페이스: Ccttsi/witw-qna-serve
"""
import os
import sys
from pathlib import Path

from huggingface_hub import HfApi

SPACE_DIR = Path(__file__).resolve().parent / "space"
DEFAULT_REPO = "Ccttsi/witw-qna-serve"


def main() -> None:
    repo_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_REPO
    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        sys.exit("HF_TOKEN이 비어 있다 — 볼트 「instinct-spaces」 write 토큰을 환경변수로 넣고 다시 실행.")
    api = HfApi(token=token)
    who = api.whoami()
    print(f"계정 확인: {who.get('name')} — 스페이스 {repo_id} 생성/갱신")
    api.create_repo(repo_id=repo_id, repo_type="space", space_sdk="gradio", exist_ok=True)
    # ZeroGPU 하드웨어: 배포 시점 HF 문서에서 하드웨어 문자열을 확인하고 지정한다
    # (문자열을 단정해 싣지 않는다 — 예: api.request_space_hardware(repo_id, <확인한 ZeroGPU 하드웨어>))
    api.upload_folder(folder_path=str(SPACE_DIR), repo_id=repo_id, repo_type="space")
    print(f"업로드 완료: https://huggingface.co/spaces/{repo_id}")
    print("다음: 스페이스 설정에서 ZeroGPU 하드웨어 확인 → 부팅 뒤 measure.py로 콜드스타트·웜 실측")


if __name__ == "__main__":
    main()
