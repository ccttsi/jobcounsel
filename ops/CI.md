# 자동 검사 (CI 게이트 · 라이브 헬스체크)

> PR을 올리면 GitHub Actions가 저장소를 검사한다. 초록이 아니면 머지하지 않는다.
> 워크플로: `.github/workflows/ci-gate.yml`(PR·main push) · `.github/workflows/health-check.yml`(매일 06:30 KST·수동)
> 브랜치 보호에서 켤 검사 이름: **`static-checks`**, **`smoke-tests`** (워크플로 이름 `ci-gate`)

## 1. 무엇을 보나

| 검사 | 보는 것 | 실패하면 |
|---|---|---|
| `static-checks` | briefing·emerging의 JSON 61개 파싱·중복 키·스키마 필수 항목·참조(카드→출처) | JSON을 고친다. 스키마를 바꿨으면 `*/SCHEMA.md`를 먼저 고친다 |
| | 저작권 Track A/B — `PRESS`·`KOGL-NONE`·`FACTS-ONLY`·미확인 라이선스가 Track A면 실패 | 그 자료를 Track B로 내리거나 재가공 허용 자료로 바꾼다 |
| | JS 33개 `node --check` 문법 | 문법 오류를 고친다 |
| | 상담 프리셋 장부 — `assets/presets.js`의 10개 프리셋·39자리 카드가 `assets/tools.js`의 섹터 id와 맞는지, 단계·확인 문장이 빠지지 않았는지(대문 덱의 진행 순서가 끊기지 않게). `json` 검사에 함께 돈다 | 오타 난 id·빠진 단계를 고친다(`python3 ops/scripts/validate_repo.py --only presets`) |
| | 역할 가드레일 — `[data-only]` PR이 `.html`/`.css`/`.js`를 건드리면 실패, `[code-only]` PR이 수집 JSON을 건드리면 실패 | 라벨을 떼거나 PR을 나눈다 |
| | **화면 문구** — `.html`·`.css`·`.js` 문자열과 `.json` 값의 맞춤법·이웃 중복 어구(`몇일→며칠`, `되요→돼요`, `웬지→왠지`, `역활→역할`, `같은 같은` 등 23종). 원문 자리(국가법령정보센터 조문·공공데이터·기관 공개문)는 빼고 본다 | 고치거나, 원문이 아닌 고유명사면 `ops/text-lint-allow.tsv`에 이유와 함께 한 줄 적는다 |
| | **자료 개수** — 대문 `index.html`의 「N가지 … 자료」와 `data-count` 칸에 그려 둔 수가 `assets/tools.js`의 `JC_TOOLS` 길이와 같은지, 개수를 장부에서 세는 치환(`renderCounts`·`[data-count]`)이 살아 있는지. 주석의 `01~N`이 어긋나면 참고로만 알린다 | 숫자를 손으로 적지 말고 `<span data-count>`로 두어 장부 길이를 따르게 한다 |
| | **법령 시행일** — 법령 데이터(`efYd`·`effective`·`시행일자`)가 날짜 모양인지, 오늘(KST)보다 뒤(아직 시행되지 않은 개정본)는 아닌지. 수집 원문(`data/openapi/` 등)의 미래 날짜는 경고, 우리가 옮겨 적은 조문(`law/`·`posting/`·`first-year/`)의 미래 날짜는 실패 | 현행 시행본으로 바꾸거나 그 조문을 뺀다. 30일 안에 시행되는 날짜는 참고로 알린다 |
| | **수집 게이트 단위 검사** (`json`에 함께 돈다 — `--only gate`로 따로) — 자료를 적재하기 전에 도는 관문(`ops/scripts/collect_gate.py`)이 정상 자료를 통과시키고, 일부러 만든 불량 샘플(라이선스 미표기·공공누리 제4유형을 Track A로·미래 시행일 `20280101`·출처 URL 누락)을 실제로 막는지 | 게이트 규칙을 고친다. 저장소의 실제 자료를 막기 시작하면(오탐) 규칙이 너무 좁은 것이므로 정책표부터 다시 본다 |
| `smoke-tests` | 대문·`/briefing/`·`/emerging/` 을 Chromium으로 390·1280에서 열어 콘솔 오류 0 · 같은 사이트 404 0 · 가로 넘침 0 · 44px 미달 0 · 화면이 실제로 그려졌는지 | 실패한 화면 그림(Actions artifact `smoke-failure-shots`)을 보고 고친다 |
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

## 2. 로컬에서 먼저 돌리기

```bash
python3 ops/scripts/validate_repo.py                 # JSON·저작권·JS·프리셋·문구·개수·시행일·(PR이면) 역할
python3 ops/scripts/validate_repo.py --only text     # 화면 문구(맞춤법·중복 어구)만
python3 ops/scripts/validate_repo.py --only count    # 자료 개수 수치만
python3 ops/scripts/validate_repo.py --only dates    # 법령 시행일만
python3 ops/scripts/smoke_test.py                    # 저장소를 로컬 서버로 띄워 잰다
python3 ops/scripts/health_check.py                  # 배포본 라이브 점검
python3 ops/scripts/collect_gate.py briefing/data/briefing.json   # 수집 게이트(적재 전 관문)를 손으로
python3 ops/scripts/validate_repo.py --only gate                    # 수집 게이트 단위 검사(27건·1초)
python3 -m unittest discover -s ops/tests -p "test_*.py" -v      # 같은 검사를 unittest로 자세히
python3 ops/qa/back_close.py                         # 세부 팝업 뒤로가기 닫기(18개 섹터)
python3 ops/scripts/synonym_eval.py                  # 상담 은어·동의어 사전 채점(사연 168건, 1순위·3순위 적중률)
```

- `smoke_test.py`·`synonym_eval.py`는 `pip install playwright && python -m playwright install chromium`이 먼저 필요하다.
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
