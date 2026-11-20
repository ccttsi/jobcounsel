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
| `smoke-tests` | 대문·`/briefing/`·`/emerging/` 을 Chromium으로 390·1280에서 열어 콘솔 오류 0 · 같은 사이트 404 0 · 가로 넘침 0 · 44px 미달 0 · 화면이 실제로 그려졌는지 | 실패한 화면 그림(Actions artifact `smoke-failure-shots`)을 보고 고친다 |
| `live-check` (매일) | 대문 + `assets/tools.js`의 지면 전부 200, `briefing.json`·`emerging.json`의 오늘 자 여부 | Actions 요약 표에서 실패한 지면을 본다. 2일 이상 지난 자료는 실패 |

## 2. 로컬에서 먼저 돌리기

```bash
python3 ops/scripts/validate_repo.py                 # JSON·저작권·JS·프리셋·(PR이면) 역할
python3 ops/scripts/smoke_test.py                    # 저장소를 로컬 서버로 띄워 잰다
python3 ops/scripts/health_check.py                  # 배포본 라이브 점검
python3 ops/qa/back_close.py                         # 세부 팝업 뒤로가기 닫기(18개 섹터)
```

- `smoke_test.py`는 `pip install playwright && python -m playwright install chromium`이 먼저 필요하다.
- 실패 화면을 남기려면 `--shot-dir <폴더>`.
- PR 역할 가드레일만 따로: `python3 ops/scripts/validate_repo.py --only role --pr-json pr.json`
  (`gh pr view <번호> --json title,labels,files > pr.json`).

## 3. 이 검사가 하지 않는 것

- 화면 분량(1.5/2.5화면)·글꼴·정렬 편차 같은 **미적 판정**은 여전히 `node ops/qa/audit.js`, `node ops/qa/look.js`와 사람 눈의 몫이다. CI는 「깨졌다/안 깨졌다」만 본다.
- 데이터의 **내용이 맞는지**(숫자가 사실인지)는 보지 않는다. 저작권 분류와 구조만 본다.
- 오류 수집(Sentry)은 운영 도메인에서만 켜진다. 로컬·검사 화면에서는 요청이 나가지 않는다.

## 4. 새 검사를 더할 때

1. 규칙은 `ops/scripts/`의 스크립트 안에 함수 하나로 넣고, 실패는 `fail("검사이름", "사람이 읽을 문장")`으로 보고한다.
2. 기존 데이터·지난 보관본 때문에 **거짓 실패**가 나지 않는지 먼저 확인한다. 과거 기록은 고치지 않고 참고 건수로만 센다.
3. 일부러 어긋난 사본을 만들어 그 검사가 실제로 잡는지 확인한 뒤 PR에 적는다.
