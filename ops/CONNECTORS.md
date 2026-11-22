# 연결 툴 주소록

역할은 [`ROLES.md`](ROLES.md). 여기에는 다른 세션이 바로 찾아갈 수 있는 ID·링크만 둔다. 새로 만들거나 바꾸면 이 표부터 고친다.

## Notion
| 무엇 | ID·주소 |
|---|---|
| 🧭 운영 허브 · 역할 분리 헌장(이 저장소 ROLES.md 사본) | https://app.notion.com/p/41a14d0ef55081de8e01fb1d755cd44e |
| 자료실 섹터 보드 | data source `collection://e1d730f4-4d70-4909-b181-1645161b9791` |
| 📒 직업상담 자료실 개발일지 | https://app.notion.com/p/41a14d0ef5508122aa10dd376742a5a4 |
| 🎨 DESIGN.md(노션 사본, 원본은 저장소) | https://app.notion.com/p/41a14d0ef55081488d1df43b44b71ad1 |
| 🤖 메이크에 의해 생성됨(폴더) | https://app.notion.com/p/41a14d0ef550818f89e9d7be776104bb |
| └ 🎨 디자인 학습함 | `collection://41a14d0e-f550-8175-bf89-000bcd6ff441` |
| └ 📊 자료 수집함 | `collection://41a14d0e-f550-81aa-a4fa-000b103551e5` |
| └ 🧠 클로드 소화 노트 | `collection://41a14d0e-f550-8104-8d96-000b3492bfac` |

## Make (eu1.make.com)
| 무엇 | ID |
|---|---|
| 조직 / 팀 | 9645978 / 3639890 |
| 🎨 레거시 디자인 기반 수집(매월 1일 07:30 KST, 활성) | 시나리오 8600696 |
| 🎨 디자인 학습함 RSS 수집(월·목 07:00 KST, 비활성 대기) | 시나리오 8599601 |
| 📊 공공데이터 주기 수집(매월 1·15일 08:00 KST, 활성) → 📊 자료 수집함 | 시나리오 8600035 |
| 노션 연결 / Make AI 연결 | 13082718 / 13082626 |

## Claude 예약 작업
| 무엇 | ID |
|---|---|
| 자료실 학습함 소화(월·목 08:41 KST) | `trig_01JwBAZL3jwS1euEbWRucXkN` — claude.ai 예약 작업 화면에서 Notion 커넥터를 켜 둬야 동작 |

## Google Drive · Sheets
| 무엇 | 주소 |
|---|---|
| 폴더 「직업상담 자료실 · 원자료 창고」 | https://drive.google.com/drive/folders/1vVwD4lQV0JEV9Y5qyTWI1thQ1ofFtGwQ |
| 00 · 이 창고의 역할(문서) | https://docs.google.com/document/d/1SVxGJRTPKHxPosJCkUILXC8SrxaiAHPu48SLp-vEB_4/edit |
| 01 · 원자료 색인(시트, `시트1`) | https://docs.google.com/spreadsheets/d/11FlMKgOtUt5_Tg0xaelcCnNq-XXjrnlTUdyGLM2TFqU/edit |

## Supabase
| 무엇 | 값 |
|---|---|
| 프로젝트 | `vzxwdfswlolhcluljkgi` (화면은 `assets/sync.js`로만 접근) |
| 테이블 | `jc_users`(계정) · `jc_sessions`(연동) · `jc_hits`(익명 통계) — 각 테이블 설명(comment)에 역할을 적어 둠 |

## Jina Reader (r.jina.ai) — 웹문서 본문 추출
| 무엇 | 값 |
|---|---|
| 리더 주소 | `https://r.jina.ai/{문서 주소}` — 주소 앞에 붙이면 그 지면을 Markdown으로 돌려준다 |
| 키 | **필요 없음**(무료). 이 저장소는 키를 두지 않는다(제3조 3-2) |
| 한도 | **분당 20회(20 RPM)** · IP 기준 · 평균 응답 7.9초 — 2026-11-22 `jina.ai/reader`에서 확인 |
| 쓰는 곳 | `ops/scripts/jina_fetch.py` — 수집·초안 참고용 CLI. **화면 코드에서는 부르지 않는다**(ROLES.md) |
| 시험 | `ops/tests/test_jina_fetch.py` — 네트워크 없이 28건, `validate_repo.py`의 단위 검사(`json`)에 함께 돈다 |

## Playwright
| 무엇 | 값 |
|---|---|
| 공용 검수 | `node ops/qa/audit.js <경로…>` — 로컬 서버를 스스로 띄워 폭별 콘솔 오류·가로 넘침·44px·화면 분량을 잰다 |
| 브라우저 | 클라우드 세션에 미리 설치됨(`require('playwright')`, 별도 설치 금지) |

## 무료 팀원 10 — 콘솔·한도·키 (2026-11-22 합류)

역할과 경계는 [`ROLES.md`](ROLES.md) 「Make ↔ 무료 팀원 분업」. 여기에는 **바로 찾아갈 주소와 어디에 키를 두는지**만 둔다. **키 값은 어느 문서에도 적지 않는다**(헌법 제3조 3-2).

| 팀원 | 콘솔·주소 | 무료 한도 (2026-11-22 확인) | 키·계정을 두는 곳 |
|---|---|---|---|
| **Jina Reader** | `https://r.jina.ai/{문서 주소}` | 키 없이 분당 20회 | 키 없음 |
| **Firecrawl** | https://www.firecrawl.dev/app | 월 1,000페이지 (200 비축 · 하루 25 하드캡) | `FIRECRAWL_API_KEY` — GitHub Secrets · 로컬 `/workspace/.secrets/` |
| **Crawl4AI** | 오픈소스 `pip install crawl4ai` (Colab·PC) | 무제한(내 컴퓨터 자원) | 계정·키 없음 |
| **Groq** | https://console.groq.com/keys | 하루 1,000회 요청 | `GROQ_API_KEY` — GitHub Secrets · Cloudflare Secrets · 로컬 `/workspace/.secrets/` |
| **Kaggle** | https://www.kaggle.com | 주 30시간 GPU (6시간 비축) | `kaggle.json` — 로컬 `/workspace/.secrets/` · GitHub Secrets(`KAGGLE_USERNAME`·`KAGGLE_KEY`) |
| **Google Colab** | https://colab.research.google.com | 무료 GPU(등급·세션 길이는 Google이 수시 조정) | 기존 Google 계정(`gvoca1021`) |
| **Upstash** | https://console.upstash.com | Redis `witw-cache` — Tokyo(`asia-northeast1`) · 250MB | `UPSTASH_REDIS_REST_URL`·`UPSTASH_REDIS_REST_TOKEN` — Cloudflare Secrets · 로컬 `/workspace/.secrets/` |
| **Neon** | https://console.neon.tech | 프로젝트마다 1GB(프로젝트 100개) | DSN(`DATABASE_URL`) — Cloudflare Secrets · 로컬 `/workspace/.secrets/` |
| **Cloudflare** (Turnstile·Workers AI·Vectorize) | https://dash.cloudflare.com | Turnstile 무료 · Workers AI 일 10,000 Neurons · Vectorize 무료 인덱스 | Turnstile site/secret key·Workers binding — Cloudflare 대시보드 환경변수 |
| **Hugging Face** | https://huggingface.co | 가입 30일 뒤 ZeroGPU(공유 GPU) | 토큰 — Vault · 로컬 `/workspace/.secrets/` |

- **연결은 GitHub 한 곳**: 수집·학습·보관은 서로 직접 잇지 않고 `ccttsi/jobcounsel`과 GitHub Actions를 거친다. 실시간 앞단(매장)만 Cloudflare 환경변수에 키를 꽂는다.
- **Bot Fight Mode(전역 봇 차단)는 끄고 Turnstile만 쓴다** — 피클·GitHub Actions·수집기가 봇으로 막히지 않게.

## 비밀값을 두는 곳 — 세 자리뿐

| 자리 | 무엇을 두나 | 누가 읽나 |
|---|---|---|
| **GitHub Secrets** (`ccttsi/jobcounsel`) | 수집·학습·배치가 쓰는 키(`GROQ_API_KEY`·`FIRECRAWL_API_KEY`·`KAGGLE_*`·`DATABASE_URL`) | GitHub Actions 워크플로 |
| **Cloudflare Secrets**(Workers 환경변수) | 앞단에서 바로 쓰는 키(`GROQ_API_KEY`·`UPSTASH_*`·Turnstile secret) | Workers 런타임 |
| **로컬 `/workspace/.secrets/`** (저장소 밖·커밋 금지) | 손으로 도는 CLI·노트북이 쓰는 키(`kaggle.json`·HF 토큰) | 내 세션만 |

금지: 저장소 파일·문서·PR 본문·커밋 메시지·화면 데이터에 키 값 넣기. 키가 필요하면 **이름만** 적고, 새 키를 쓰는 코드는 환경변수에서 읽는다. 키가 한 번 공개 저장소에 올라가면 히스토리에 남으므로 **발급 즉시 위 세 자리로 옮기고 폐기·재발급**한다.

