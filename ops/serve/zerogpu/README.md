# ZeroGPU 서빙 준비 (2026-11-28 · 인스팅트)

> MCL Goal · 서빙 확정안 1단: Hugging Face Spaces **ZeroGPU 무료 호스팅**.
> Ccttsi 계정 생성 30일 조건으로 **2026-12-22부터** 스페이스 생성이 가능하다(생성 API 402 응답으로 확인).
> 그 전까지 스페이스 코드·배포 절차·실측 프롬프트를 준비해 두는 폴더다.
> 결정 근거·비교 실측 전문: 노션 「FTN-2 · LLS-1 서류 조사」 페이지.

## 배경 (확정된 것)

- 2026-11-28 태화님 「카드없이가자」 — 카드가 필요한 경로(Modal 크레딧, 오라클 즉시 개통)는 탈락·보류.
- ZeroGPU 무료 호스팅: 계정 생성 30일 경과 필요. Ccttsi 계정은 2026-11-22 생성이라 **2026-12-22 개통**.
- 무료 쿼터: GPU 5분/일(첫 사용부터 24시간 뒤 리셋), ZeroGPU 스페이스 최대 2개.
- 공개 ZeroGPU 스페이스 「사용」은 지금도 가능(5분/일) — 실측으로 확인(27B 채팅 웜 5.6초).
- 비교군 실측(2026-11-28, Cloudflare Workers AI @cf/qwen/qwen3.8-27b): 사고 끄기 6.2초·608자 완결,
  사고 켜기 16.7~30.4초. 카드 없이 지금 쓸 수 있는 호스팅 대안.

## 파일

| 파일 | 역할 |
|---|---|
| `space/` | HF 스페이스 본문(`app.py`·`requirements.txt`·`README.md`) — 이 폴더째 업로드 |
| `deploy.py` | 스페이스 생성 + 업로드 (12-22 당일 실행) |
| `measure.py` | 콜드스타트·웜 실측 러너 |
| `prompts/measure_prompts.json` | 실측 프롬프트 세트 (p1~p4는 Cloudflare 비교군과 같은 문장, p5~p6은 근거 포함) |

## 모델

- **Qwen/Qwen3-4B-Instruct-2507** — Apache License 2.0
  (모델 리포 LICENSE 파일: https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/main/LICENSE, 2026-11-28 확인)
- bf16 약 8GB → ZeroGPU(공유 RTX Pro 6000 half · 48GB)에 충분히 들어간다.
- 사고(thinking) 없는 Instruct 계열이라 한국어 상담 문답에 바로 쓴다.
  학습(FTN) 뒤에는 `WITW_LORA_ADAPTER` 환경변수에 어댑터 리포 ID를 넣어 병합 서빙한다.

## 12-22 당일 절차

1. 사전 점검: 계정 30일 경과 확인, HF write 토큰(볼트 「instinct-spaces」) 준비.
   **토큰 값은 저장소·문서·로그에 넣지 않는다(CONSTITUTION 3-2).**
2. `HF_TOKEN=... python3 ops/serve/zerogpu/deploy.py Ccttsi/witw-qna-serve`
3. 스페이스에 ZeroGPU 하드웨어 지정(하드웨어 문자열은 배포 시점 HF 문서로 확인 — `deploy.py` 주석).
4. 부팅 뒤 `HF_TOKEN=... python3 ops/serve/zerogpu/measure.py Ccttsi/witw-qna-serve --out results.json`
5. 결과는 노션 조사 페이지 + 대화실에 기록 — 콜드스타트·웜·완결성을 Cloudflare 비교군 수치와 나란히 놓는다.

## 실측 정의

- **콜드스타트**: 스페이스 재시작 직후 첫 호출(모델 CPU 적재 + GPU 이동 포함). 4B(bf16 약 8GB) 적재는 수십 초 규모로 추정 — 12-22에 실측.
- **웜**: 이어서 호출, 프롬프트당 3회.
- **완결성**: 답이 중간에 잘리지 않고 끝나는지, 글자 수.
- **하루 운용 추정**: 답 1건 5~15초로 잡으면 무료 5분/일로 하루 20~60건.

## 지키는 선

- 비밀값·내부 ID 커밋 금지(CONSTITUTION 3-2) — 토큰·계정 값은 환경변수·볼트로만.
- 내담자 개인정보 입력칸을 만들지 않는다(CONSTITUTION 3-3) — 스페이스 안내 문구에도 명시.
- 이 폴더 밖의 파일은 건드리지 않는다(병렬 작업 규칙 — validate_repo.py는 #567·AUP-8 CP6 영역).
