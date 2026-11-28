# 자동 검사 (CI 게이트 · 라이브 헬스체크)

> **최상위 규범: [`CONSTITUTION.md`](../CONSTITUTION.md)** — 아래 검사는 헌법 §7 자가검증 체크리스트를 **자동으로 재는 부분**이다(저작권·시행일·문구·개수·프리셋·역할). 미적 판정·6대 과제·한 톤 같은 항목은 CI가 재지 않는다 — 헌법 제5조·제6조 6-4에 따라 **사람(클로드·태화님)이 직접 판정**하고 §7에 적는다. CI 초록불은 머지 조건의 한 칸일 뿐, 헌법 전체를 통과했다는 뜻이 아니다.
>
> PR을 올리면 GitHub Actions가 저장소를 검사한다. 초록이 아니면 머지하지 않는다.
> 워크플로: `.github/workflows/ci-gate.yml`(PR·main push) · `.github/workflows/health-check.yml`(매일 06:30 KST·수동)
> 브랜치 보호에서 켤 검사 이름: **`static-checks`**, **`smoke-tests`** (워크플로 이름 `ci-gate`)
> **무거운 검사·빌드는 모두 GitHub Actions에서 돈다** — 공개 저장소라 무제한이다. Make(월 1,000 오퍼레이션)에 검사·반복 루프·장문 가공을 싣지 않는다. 수집·가공의 단계별 담당은 [`ROLES.md`](ROLES.md) 「Make ↔ 무료 팀원 분업」.

## 1. 무엇을 보나

| 검사 | 보는 것 | 실패하면 |
|---|---|---|
| `static-checks` | briefing·emerging의 JSON 61개 파싱·중복 키·스키마 필수 항목·참조(카드→출처) | JSON을 고친다. 스키마를 바꿨으면 `*/SCHEMA.md`를 먼저 고친다 |
| | 저작권 Track A/B — `PRESS`·`KOGL-NONE`·`FACTS-ONLY`·공공누리 제2~4유형(`KOGL-2`·`KOGL-3`·`KOGL-4`)·미확인 라이선스가 Track A면 실패 | 그 자료를 Track B로 내리거나 재가공 허용 자료로 바꾼다 |
| | JS 33개 `node --check` 문법 | 문법 오류를 고친다 |
| | 상담 프리셋 장부 — `assets/presets.js`의 10개 프리셋·39자리 카드가 `assets/tools.js`의 섹터 id와 맞는지, 단계·확인 문장이 빠지지 않았는지(대문 덱의 진행 순서가 끊기지 않게). `json` 검사에 함께 돈다 | 오타 난 id·빠진 단계를 고친다(`python3 ops/scripts/validate_repo.py --only presets`) |
| | 역할 가드레일 — `[data-only]` PR이 `.html`/`.css`/`.js`를 건드리면 실패, `[code-only]` PR이 수집 JSON을 건드리면 실패 | 라벨을 떼거나 PR을 나눈다 |
| | **공통 셸** — 모든 지면(`index.html`)이 `assets/core.js`(머리의 **첫 스크립트**, defer 없이)·`assets/prefs.js`·`[data-jc-prefs]` 자리·`assets/marker.js`를 실었는지. 주석에 적힌 파일 이름은 «실었다»로 치지 않는다(실제 `src`만 본다) | 빠진 지면에 그 한 줄을 넣는다. 도구함을 쓰지 않는 지면이면 `ops/css-allow.tsv`에 이유와 함께 `shell` 줄을 남긴다 |
| | **금지 모션 속성** — `transition`·`transition-property`에 `width`·`height`·`top`·`left`·`max-height`·`grid-template-rows`·`gap`·`font-size` 같은 레이아웃 속성이 섞였는지(제5조 5-3) | `transform`·`opacity`로 바꾼다. 이미 있던 예외는 `ops/css-allow.tsv`에 이유와 함께 있고, 그 화면을 고칠 때 줄을 지운다 |
| | **보조 액션 정렬 기준점** — 한 선언 블록 안에서 `margin-left:auto`(자동 정렬)를 뒤쪽 `margin` 단축 선언이 0으로 덮어쓰는지(제5조 5-7) | 단축 값을 `auto`로 적거나(`margin:-8px -6px -8px auto`) 단축을 앞으로 옮긴다. 그러면 단추가 제목 길이를 따라 흔들리지 않는다 |
| | **숫자 칸 줄바꿈** — 숫자 자리를 `width: Nch`로 «고정»한 규칙에 `white-space:nowrap`이 없는지(11-28 갤럭시에서 대문 「37 / 41」이 「3」·「7 / 41」 두 줄로 쪼개져 겹친 결함). 폭은 `min-width: Nch` + `white-space:nowrap`으로 잡는다 | `width`를 `min-width`로 바꾸고 같은 블록에 `white-space:nowrap`을 적는다(`python3 ops/scripts/validate_repo.py --only js`) |
| | **화면 문구** — `.html`·`.css`·`.js` 문자열과 `.json` 값의 맞춤법·이웃 중복 어구(`몇일→며칠`, `되요→돼요`, `웬지→왠지`, `역활→역할`, `같은 같은` 등 23종). 원문 자리(국가법령정보센터 조문·공공데이터·기관 공개문)는 빼고 본다 | 고치거나, 원문이 아닌 고유명사면 `ops/text-lint-allow.tsv`에 이유와 함께 한 줄 적는다 |
| | **자료 개수** — 대문 `index.html`의 「N가지 … 자료」와 `data-count` 칸에 그려 둔 수가 `assets/tools.js`의 `JC_TOOLS` 길이와 같은지, 개수를 장부에서 세는 치환(`renderCounts`·`[data-count]`)이 살아 있는지. 주석의 `01~N`이 어긋나면 참고로만 알린다 | 숫자를 손으로 적지 말고 `<span data-count>`로 두어 장부 길이를 따르게 한다 |
| | **법령 시행일** — 법령 데이터(`efYd`·`effective`·`시행일자`)가 날짜 모양인지, 오늘(KST)보다 뒤(아직 시행되지 않은 개정본)는 아닌지. 수집 원문(`data/openapi/` 등)의 미래 날짜는 경고, 우리가 옮겨 적은 조문(`law/`·`posting/`·`first-year/`)의 미래 날짜는 실패 | 현행 시행본으로 바꾸거나 그 조문을 뺀다. 30일 안에 시행되는 날짜는 참고로 알린다 |
| | **수집 게이트 단위 검사** (`json`에 함께 돈다 — `--only gate`로 따로) — 자료를 적재하기 전에 도는 관문(`ops/scripts/collect_gate.py`)이 정상 자료를 통과시키고, 일부러 만든 불량 샘플(라이선스 미표기·공공누리 제4유형을 Track A로·미래 시행일 `20280101`·출처 URL 누락)을 실제로 막는지 | 게이트 규칙을 고친다. 저장소의 실제 자료를 막기 시작하면(오탐) 규칙이 너무 좁은 것이므로 정책표부터 다시 본다 |
| | **비서 답 검사기** (`json`에 함께 돈다 — `--only answercheck`로 따로) — 서버가 답을 내보내기 전에 쓰는 규칙(`supabase/functions/assistant-proxy/check-data.js`)이 원천(`data/legal-constants.json`·`assets/tools.js`)과 같은지, `assistant/answer-check.js`와 서버 사본이 바이트까지 같은지, 시험 문항 21개(고쳐야 할 것·건드리면 안 되는 것)가 기대대로인지, 자료실 지면 글 8천여 문장이 하나도 바뀌지 않는지(오탐 0) | 규칙을 고쳤으면 `python3 ops/scripts/build_answer_check.py`로 다시 만들고, 사본은 `cp assistant/answer-check.js supabase/functions/assistant-proxy/answer-check.js` |
| | **비서 질문 유형 판정기** (`json`에 함께 돈다 — `--only qtype`로 따로) — 질문을 계산·제도·안내·상담 진행으로 나누는 `assistant/qtype.js`와 서버 사본이 바이트까지 같은지, 시험 문장 42개(구어·줄임말)가 기대대로인지, 성적표 문항 248개의 사람이 적은 정답표(`ops/eval/qtype-labels.json`)와 견준 정확도가 문턱(훈련 98%·시험 85%·전체 90%·유형마다 80%)을 넘는지, `prompt.ts`에 네 유형의 답 틀·공통 원칙이 있고 `typeBrief`가 질문·앞 질문을 따라 골라 주는지 | 판정 낱말을 고쳤으면 `cp assistant/qtype.js supabase/functions/assistant-proxy/qtype.js`로 사본을 맞춘다. 정확도가 떨어지면 어느 문항이 틀렸는지(최대 3개) 실패 줄에 함께 나온다 |
| | **내부 문서 노출 차단** (`js`에 함께 돈다 — `--only expose`로 따로) — 배포 루트에 있는 것이 «공개 화면»인지 «내부 문서»인지 정해져 있는지, `functions/_middleware.js`의 규칙(`INTERNAL_DIRS`·`INTERNAL_EXTS`)이 내부 파일 **80곳**을 빠짐없이 막고 화면이 받는 공개 파일 **187곳**은 막지 않는지, `_routes.json`이 모든 요청을 함수로 보내는지. 판정은 middleware를 **node로 실제로 불러** 받고, 검사 쪽 사본과 어긋나면 실패한다 | 규칙을 고치거나 새 폴더를 `INTERNAL_DIRS`에 넣는다(화면이면 `assets/tools.js` 장부에). §1-3 |
| `smoke-tests` | 대문·`/briefing/`·`/emerging/` 을 Chromium으로 390·1280에서 열어 콘솔 오류 0 · 같은 사이트 404 0 · 가로 넘침 0 · 44px 미달 0 · 화면이 실제로 그려졌는지 | 실패한 화면 그림(Actions artifact `smoke-failure-shots`)을 보고 고친다 |
| | **공통 UI·모션 실증**(`ops/qa/shared_ui_probe.py`가 같은 게이트에서 돈다) — 대문 **기본·시드·매치** 세 보기에서 방치 유도 트리거(`JC_HINT.run`)가 걸리고 로고가 **실제로 움직이는지**, 시드·매치 대표 섹터(`/theory/`·`/talk/`)에서 테마 단추를 눌러 `data-theme`이 바뀌고 카드덱 단추·도구함이 붙는지, 카드 보조 액션의 좌표가 항목 전환에서 흔들리지 않는지 | 게이트가 선 사례(`gate`)가 어긋나면 실패한다. 숫자·이유·재는 법은 아래 §1-2 |
| `live-check` (매일) | 대문 + `assets/tools.js`의 지면 전부 200, `briefing.json`·`emerging.json`의 오늘 자 여부 | Actions 요약 표에서 실패한 지면을 본다. 2일 이상 지난 자료는 실패 |

## 1-1. 수집 게이트 — 자료를 적재하기 전에 (`collect_gate.py`)

위 표의 `json`·`license`·`dates`는 **이미 저장소에 들어온 자료**를 사후에 훑는 그물이다.
`ops/scripts/collect_gate.py`는 그보다 한 단계 앞, **수집 스크립트가 파일을 쓰기 직전**에 도는
관문이다. 잘못된 자료가 저장소에 한 번도 들어오지 않게 하고, Actions 요약에는 「실패」가 아니라
「차단」으로 이유가 남는다. (MLC 보완 4순위, 2026-11-22)

| 검사 | 보는 것 | 차단 조건 |
|---|---|---|
| 라이선스 | 레코드마다 `license.type`·`license.name`의 **재가공 허용 여부** | 표기 없음·빈 칸, 판정할 수 없는 표기, All Rights Reserved·무단 복제 금지, 재가공 불허(공공누리 2~4유형·미부착·언론·CC BY-NC/ND·FACTS-ONLY)를 **Track A로** 실은 경우, Track B인데 원문 몸통(`body`·`body_original`)을 담은 경우 |
| 시행일 | `efYd`·`effective`·`effective_date`·`enforced_at`·`시행일자` | 날짜 모양이 아님, **오늘(KST)보다 뒤**(아직 시행되지 않은 개정본) |
| 형식·메타 | 출처 URL, 기준일, 문서 종류별 필수 항목 | URL 없음, 기준일 없음, `count` 불일치, 브리핑 `three_step` 빈 칸, 원문 뉴스의 Track A·`rights.full_text_allowed`·`body_original`, 법전 `law_url`·`effective`·`articles[].paras`, 신산업 `edition.date`·출처 id |

**허용 표기(A)** — 공공누리 제0·1유형, 퍼블릭 도메인, CC BY 3.0·4.0, 공공데이터포털 이용허락범위 제한 없음,
OpenDART 공식 OpenAPI, 법령 원문(저작권법 제7조).
**Track B로만 통과(B)** — 공공누리 제2~4유형, 공공누리 미부착, 언론사 기사, CC BY-NC/ND, FACTS-ONLY, OECD·WEF·IAEA.
`usage`에 「사실·수치만 인용」이 적혀 있어야 하고, 카드가 아닌 출처 목록(`sources[]`)은 track을 카드가 들고 있으므로 이 문장으로 판정한다.

**도는 자리**
- `ops/scripts/sync_openapi_common.py` — `write_source()`가 쓰기 직전에 `check_items()`로 항목을,
  `validate_outputs()`가 저장된 산출물을 `check_document()`로 다시 본다. 막히면 그 소스는 실패로 보고되고 **파일을 쓰지 않는다**.
- `briefing/data/tools/build_index.py` — `save()`가 쓰기 직전에 문서를 본다(브리핑·원문·보관본 전부).
- 밖에서 만드는 자료(피클의 브리핑 수집 등)는 커밋 전에 CLI로 통과시킨다.
- **게이트 자체 검사**(`ops/tests/test_collect_gate.py`)는 `validate_repo.py --only json`에 함께 붙여 둔다
  (`--only gate`로 따로). 워크플로를 고치지 않아도 CI에서 돌게 하려는 것이고, 프리셋 장부를 `json`에 붙인 것과 같은 이유다.

```bash
python3 ops/scripts/collect_gate.py briefing/data/briefing.json
python3 ops/scripts/collect_gate.py data/openapi/law/revisions.json --kind openapi
python3 ops/scripts/collect_gate.py briefing/data/*.json emerging/data/emerging.json --json
```

- 종료코드 **0 통과 · 1 차단 · 2 파일을 읽지 못함**. 차단 사유는 「어디(경로)」와 「무엇을 하면 되는지」를 함께 적는다.
- `--kind`를 주지 않으면 구조로 문서 종류(`openapi`·`briefing`·`news`·`emerging`·`law`·`thermometer`)를 알아낸다.
- 새 라이선스 표기를 만나면 `LICENSE_PATTERNS`에 근거와 함께 한 줄 넣고, `A_TYPES`·`B_TYPES` 중 어디인지 정한다.
  판정할 수 없는 표기를 통과시키는 대신 **막고 정책표에 더하게** 만들었다(모르는 것을 허용하지 않는다).

## 1-2. 공통 UI·모션 실증 — 화면에서 재는 게이트 (`ops/qa/shared_ui_probe.py`)

글자만 읽어서는 알 수 없는 것 — **「공통 요소가 이 보기에서도 살아 있는가」**와 **「보조 액션이 항목을 바꿔도 같은 자리에 있는가」** — 를 Chromium으로 열어 좌표·애니메이션으로 잰다.
(2026-11-22 태화님 지시: 로고 방치 모션이 대문 한 보기에서만 돌고 시드·매치에서 빠졌고, `/casecon/` 카드의 `이론 위키` 단추가 제목 길이에 따라 좌우로 흔들렸다. 둘 다 «대문 한 곳·한 항목»만 보고 끝내서 생겼다.)

| 종류 | 재는 것 | 통과 기준 |
|---|---|---|
| `idle` | 대문의 세 보기(기본·시드·매치) × 폭 390·1280에서 `JC_HINT.run()`이 `true`를 돌려주고, **로고(마름모 겹)의 합성 변환 값이 프레임마다 바뀌는가** | 트리거 `true` · 움직임 관측 · 로고가 그려져 있음 |
| `shell` | 시드·매치 **대표 섹터**(`/theory/`·`/talk/`)에서 화면 설정의 테마 단추를 세 번 눌러 테마가 실제로 바뀌는지, 카드덱 단추(`.jcf-launch`)·도구함(`#jc-marker-ui`)이 붙는지, 페이지 오류 0 | 세 가지 모두 참 |
| `anchor` | 카드·패널 보조 액션(`/casecon/`의 `.p-head .p-who`)의 bounding box가 틀·항목을 바꿀 때 | **Δx·Δy 0.5px 이하**(목표 0.00px — 소수점 반올림만 봐준다) |

**사례 장부 — `ops/qa/shared_ui_cases.json`**
- `gate`가 `true`(또는 `["기본 보기"]`처럼 목록)이면 그 항목이 어긋날 때 `smoke-tests`가 **실패**한다.
- `gate`가 `false`인 사례는 **아직 고치는 중**이라는 뜻이다. 숫자와 이유(`known_gap`)만 표에 남기고 게이트를 세우지 않는다 — CI가 그 결함을 «없는 것처럼» 지나가지 않도록 매번 출력에 남긴다.
- 그 화면을 고쳤으면 **장부에서 `gate`를 올리고 `known_gap`을 지운다.** 그러지 않으면 다음에 같은 자리가 어긋나도 게이트가 서지 않는다.
- 새 공통 요소·새 대표 섹터를 만들었으면 여기에 사례를 더한다. 사례가 없으면 아무도 재지 않는다.

```bash
python3 ops/qa/shared_ui_probe.py                    # 모든 사례(로컬 서버를 스스로 띄운다)
python3 ops/qa/shared_ui_probe.py --only anchor      # 한 종류만(idle·shell·anchor)
python3 ops/qa/shared_ui_probe.py --strict           # known_gap까지 실패로 본다(고친 뒤 확인용)
python3 ops/qa/shared_ui_probe.py --base https://witw.pages.dev/   # 배포본을 잰다
```

- 종료코드 **0 통과 · 1 게이트가 선 항목이 있음**. 사례를 못 재면(화면 구조 변경) 그것도 실패다 — 조용히 건너뛰지 않는다.
- `smoke-tests`에서는 같은 저장소를 자기 서버로 띄워 돌므로 로컬·CI 모두 추가 설정이 필요 없다.
- **고칠 때의 순서** — ① 화면을 고친다 ② `validate_repo.py --only motion,anchor`로 글자로 잴 수 있는 원인을 지운다(예: `margin-left:auto`를 덮는 단축 선언) ③ `shared_ui_probe.py`로 숫자를 다시 잰다 ④ 0.00px이면 장부의 `gate`를 올리고 `known_gap`을 지운다 ⑤ PR 본문에 숫자를 적는다.

## 1-3. 내부 문서 노출 차단 — 배포본에서 404인가 (`functions/_middleware.js`)

저장소는 Actions 무료 한도 때문에 Public이고, 배포는 **저장소 루트를 빌드 없이 그대로 올리는** Cloudflare Pages다.
그래서 `/ops/CONNECTORS.md`·`/CONSTITUTION.md`·`/design/HANDOFF.md`가 **URL만 알면 200 + text/markdown으로 열렸다**
(2026-11-22 실측 — 연결 ID·역할 헌장·설계 핸드오프까지 그대로). 헌법 제3조 3-2에 따라 배포본에서 막는다.

| 무엇 | 어디 |
|---|---|
| 차단 규칙 | `functions/_middleware.js` — `INTERNAL_DIRS`(폴더째) · `INTERNAL_EXTS`(어느 폴더든 .md·.py·.sql·.tsv·.yml·.yaml·.sh·.toml) · 루트의 점·밑줄 파일(`.nojekyll`·`_headers`·`_routes.json` — Pages 설정 파일도 배포 뒤 `/_headers`로 200이었다) |
| 함수 호출 범위 | `_routes.json` — `include: ["/*"]`. 깊은 폴더의 `.md`까지 잡히게 모든 요청을 함수로 보낸다 |
| 라이브 확인 | `python3 ops/qa/internal_exposure_probe.py --base <주소>` — 막혀야 할 40여 곳이 **404가 아니면 실패**, 열려야 할 50여 곳이 **200이 아니면 실패** |
| 저장소 안 확인 | `python3 ops/scripts/validate_repo.py --only expose` (CI에서는 `js`에 함께 돈다) |

- **`_redirects`로는 안 된다** — Cloudflare Pages의 `_redirects`는 301·302 같은 넘김만 되고
  404·403 같은 «되돌림»은 지원하지 않는다(공식 문서 Advanced redirects 표). Functions는 정적 파일보다 먼저 돌아
  상태 코드를 그대로 정할 수 있다.
- **200도 403도 차단이 아니다** — 이 프로젝트는 없는 경로에 대문을 200으로 돌려주는 SPA 폴백 설정이라,
  "200이 왔다"를 «열렸다»로 읽지 않으면 안 된다. 그래서 확인은 **404**로만 한다.
- **막지 않는 것** — 화면(`.html`·`.css`·`.js`)과 화면이 읽는 공개 데이터(`.json`·이미지·글꼴), `robots.txt`.
- **새 폴더·새 문서를 만들 때** — 내부면 `INTERNAL_DIRS`, 화면이면 `assets/tools.js` 장부에 넣는다.
  어느 쪽도 아니면 `validate_repo.py --only expose`가 «어느 쪽인지 정해지지 않았다»로 실패한다.
- **한계** — Functions 무료 한도(하루 10만 요청)가 다하면 프로젝트 설정(§ Runtime > Fail open/closed)에 따라
  정적 파일이 그대로 나갈 수 있다. 설정이 «fail open»이면 그날만 차단이 풀린다.

## 2. 로컬에서 먼저 돌리기

```bash
python3 ops/scripts/validate_repo.py                 # JSON·저작권·JS·CSS·공통 셸·모션·정렬 기준점·프리셋·문구·개수·시행일·(PR이면) 역할
python3 ops/scripts/validate_repo.py --only text     # 화면 문구(맞춤법·중복 어구)만
python3 ops/scripts/validate_repo.py --only count    # 자료 개수 수치만
python3 ops/scripts/validate_repo.py --only dates    # 법령 시행일만
python3 ops/scripts/smoke_test.py                    # 저장소를 로컬 서버로 띄워 잰다
python3 ops/scripts/health_check.py                  # 배포본 라이브 점검
python3 ops/scripts/collect_gate.py briefing/data/briefing.json   # 수집 게이트(적재 전 관문)를 손으로
python3 ops/scripts/validate_repo.py --only gate                    # 수집 게이트 단위 검사(27건·1초)
python3 ops/scripts/validate_repo.py --only expose                   # 내부 문서 차단 규칙·공개 파일 대조(2초)
python3 ops/qa/internal_exposure_probe.py --base https://witw.pages.dev/   # 배포본에서 막혀야 할 곳 404·열려야 할 곳 200
python3 ops/scripts/validate_repo.py --only shell,motion,anchor     # 공통 셸·금지 모션·정렬 기준점(2초)
python3 ops/scripts/validate_repo.py --only answercheck             # 비서 답 검사기 — 규칙 동기·시험 문항·지면 글 오탐 0(3초)
python3 ops/scripts/validate_repo.py --only qtype                   # 비서 질문 유형 판정기 — 사본 동기·시험 42문·정답표 정확도·prompt.ts 배선(3초)
python3 ops/qa/shared_ui_probe.py                    # 공통 UI·모션 실증(방치 모션·대표 섹터·보조 액션 좌표)
python3 -m unittest ops/tests/test_ui_checks.py -v   # 위 세 검사가 «고의 위반»을 실제로 잡는지
python3 -m unittest discover -s ops/tests -p "test_*.py" -v      # 같은 검사를 unittest로 자세히
python3 ops/qa/back_close.py                         # 세부 팝업 뒤로가기 닫기(18개 섹터)
python3 ops/scripts/synonym_eval.py                  # 상담 은어·동의어 사전 채점(사연 168건, 1순위·3순위 적중률)
```

- `smoke_test.py`·`shared_ui_probe.py`·`synonym_eval.py`는 `pip install playwright && python -m playwright install chromium`이 먼저 필요하다.
- 공통 셸·금지 모션·정렬 기준점(`--only shell,motion,anchor`)은 `js` 검사에 함께 붙여 두었다 — 워크플로를 고치지 않아도 CI에서 돈다. 예외는 `ops/css-allow.tsv`에 이유와 함께 적고, **예외 한 줄은 위반 한 건만 덮는다**(같은 자리에 하나 더 생기면 실패).
- 위 세 검사의 판정 로직은 `ops/tests/test_ui_checks.py`가 **고의 위반 샘플**로 시험한다. 규칙을 고칠 때 그 시험도 함께 고친다.
- `synonym_eval.py`는 사전(`assistant/data/synonym-map.json`)이나 검색 엔진(`assistant/search.js`)을 고친 뒤
  숫자를 «보고» 판단하는 도구다. `--floor-top1 0.60 --floor-top3 0.82`처럼 하한을 주면 그 아래로 떨어질 때 실패한다.
  상시 CI에는 넣지 않았다(2분쯤 걸린다) — 손으로 돌리고 결과를 PR 본문·HANDOFF에 적는다.
- 선참조 지도(`rag-preface.json`)는 `assistant_search_test.py`가 **96KB 이하**로 잡는다(색인 1.7MB보다 먼저 받는 작은 지도).
  2순위 동의어 사전을 `dict`에 합치면서 60KB → 73KB가 되었다.
- 실패 화면을 남기려면 `--shot-dir <폴더>`.
- PR 역할 가드레일만 따로: `python3 ops/scripts/validate_repo.py --only role --pr-json pr.json`
  (`gh pr view <번호> --json title,labels,files > pr.json`).

## 3. 이 검사가 하지 않는 것

- 화면 분량(1.5/2.5화면)·글꼴·정렬 편차 같은 **미적 판정**은 여전히 `node ops/qa/audit.js`, `node ops/qa/look.js`와 사람 눈의 몫이다. CI는 「깨졌다/안 깨졌다」만 본다.
- `shared_ui_probe.py`는 **정해 둔 사례만** 잰다(장부 `shared_ui_cases.json`). 화면에 새 카드·새 보조 액션을 만들었는데 장부에 올리지 않으면 아무도 재지 않는다 — 대문 세 보기·대표 섹터 뒤에 새 공통 요소를 만들었으면 사례를 더한다.
- 좌표의 **경우 허용값은 0.5px까지**다(브라우저 소수점 반올림). 헌법의 목표값은 `0.00px`이고, PR 본문에는 잰 숫자를 그대로 적는다.
- 데이터의 **내용이 맞는지**(숫자가 사실인지)는 보지 않는다. 저작권 분류와 구조만 본다.
- 문구 검사는 **목록에 적어 둔 명백한 오류만** 본다. 「안 되다/안되다」·「-데/-대」·「던지/든지」처럼
  문맥을 읽어야 갈리는 것은 일부러 넣지 않았다(오탐이 머지를 막으면 게이트를 끄게 된다).
  새 오류를 더할 때는 `TEXT_RULES`에 이유와 함께 한 줄 넣고, 저장소 전체에서 오탐이 0인지 확인한다.
- 원문 자리(`law/` 조문, 공공데이터·기관 공개문)의 표기는 **고치지 않는 것이 원칙**이라 검사에서 빼 둔다.
- 수집 게이트는 **수집·가공 스크립트 앞단**에서 도는 관문이라, 이미 저장된 자료 전체를 CI에서 다시 훑지는 않는다.
  저장된 자료의 사후 검사는 `json`·`license`·`dates`가 맡는다. 게이트가 막은 자료는 **파일에 쓰이지 않았다**는 뜻이므로,
  커밋된 파일을 보고 「게이트를 통과했다」고 읽지 않는다(게이트 이전에 들어온 자료가 있다).
- 오류 수집(Sentry)은 운영 도메인에서만 켜진다. 로컬·검사 화면에서는 요청이 나가지 않는다.

## 4. 새 검사를 더할 때

1. 규칙은 `ops/scripts/`의 스크립트 안에 함수 하나로 넣고, 실패는 `fail("검사이름", "사람이 읽을 문장")`으로 보고한다.
   수집 단계에서 막아야 하는 규칙이면 `ops/scripts/collect_gate.py`에 넣고 `ops/tests/test_collect_gate.py`에
   **불량 샘플**을 함께 넣는다(좋은 자료만 통과시키는 시험은 게이트의 일을 확인하지 못한다).
2. 기존 데이터·지난 보관본 때문에 **거짓 실패**가 나지 않는지 먼저 확인한다. 과거 기록은 고치지 않고 참고 건수로만 센다.
3. 일부러 어긋난 사본을 만들어 그 검사가 실제로 잡는지 확인한 뒤 PR에 적는다.
   글자로 잴 수 있는 규칙은 `validate_repo.py` 안의 **순수 함수**(예: `shell_problems`·`layout_motion_problems`·`auto_anchor_problems`)로 두고 `ops/tests/`에 **고의 위반 시험**을 함께 넣는다 — 저장소 파일을 건드리지 않고 판정 로직만 시험하려는 것이다.
4. 화면에서만 잴 수 있는 규칙(좌표·애니메이션·테마 전환)은 `ops/qa/shared_ui_probe.py`에 종류를 하나 더하고, `ops/qa/shared_ui_cases.json`에 사례를 올린다. 처음에는 게이트를 세우지 않고 숫자만 보다가, 오탐 0건을 확인한 뒤 `gate`를 올린다.

## 5. 새 섹터를 더할 때 — 번호·티어 체크리스트 (2026-11-22 태화님 지시)

새 섹터는 **맨 뒤에 붙이지 않는다**. 만든 순서는 자리 순서가 아니다. 아래 두 가지를 같은 커밋에서 끝내고,
`validate_repo.py --only sectors,presets,count`로 확인한다.

1. **`assets/tools.js` — `seed`/`match` 트랙 안의 연관 섹터 바로 옆에 삽입하고 `no`·`mo`를 유기적으로 재정렬한다.**
   - 가장 큰 `no` 뒤에 덧붙이는 것은 금지. 성격이 이어지는 섹터 **바로 옆**에 넣고, `seed` 01~ · `match` 16~의
     `no`와 트랙 안 차례 `mo`를 그 자리에서 처음부터 다시 매긴다(배열 순서 = 대문 목록 순서).
   - 번호로 서로를 가리키는 주석·문서(「16번 온도계」 같은)도 같은 커밋에서 함께 고친다.
     폴더 주소·`--tc-<id>`·`JC_LINKS`는 번호와 무관하니 그대로 둔다.
2. **`mydeck/assemble.js`의 실용성 티어(`TIER1`/`TIER2`)·추천 순서(`ORDER`)·그룹(`GROUPS`)에도 함께 반영한다.**
   - 티어: 현장 직결은 `TIER1`, 학습·연구는 `STUDY`(3티어), 상황 보강은 기본 2티어(`tierOf`가 2를 돌려준다).
   - `STAGE`(추천 `ORDER`의 근거)·`GROUPS`(편집 화면 분류)에 id를 넣는다 — 빠지면 추천 맨 뒤·편집 목록에서 숨는다.
   - 질문 한 마디로 나와야 하는 자료는 `RULES`(직행 패턴)에 `dom`·`act`·`not`을 넣는다.
3. 재생성: `python3 assistant/build_index.py` · `python3 ops/scripts/build_flow_graph.py`.
