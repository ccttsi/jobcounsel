# Open API 주기 갱신 자료 (`data/openapi/`)

공공데이터포털·OpenDART에서 **정식 인증키로** 받아온 공식 자료를 주기별로 갱신해 두는 곳이다.
화면(섹터)은 이 JSON을 읽기만 하고, 수집·비교·저장은 GitHub Actions가 맡는다
(`ops/ROLES.md`의 역할 분리 — 정적 앱 코드 안에 외부 수집을 넣지 않는다).

## 무엇을 언제 받나

| 주기 | 소스(서비스 ID) | 결과 파일 |
|---|---|---|
| 매일 06:00 KST | 알리오 공공기관 채용정보(`15125273`) · 국가자격 시험일정(`15074408`) | `alio/recruitment.json` · `qnet/exam-schedule.json` |
| 매주 월 05:00 KST | NCS 훈련과정 정보(`15086447`) | `ncs/training-courses.json` |
| 매월 1일 04:00 KST | OpenDART 공시·기업 고유번호 · 금융위 기업기본(`15043184`)·재무(`15043459`) · Q-net 합격률(`15089380`)·통계(`15025329`) · 법제처 법령(`15000115`) · 국세청 사업자 상태(`15081808`) | `dart/*.json` · `fsc/*.json` · `qnet/pass-rate.json` · `qnet/stats.json` · `law/revisions.json` · `nts/status.json` |

워크플로: `.github/workflows/openapi-daily.yml` · `openapi-weekly.yml` · `openapi-monthly.yml`
(셋 다 `workflow_dispatch`가 있어 Actions 화면에서 바로 수동 실행할 수 있다). 저장소에 아직 이 세 파일이 없으면 `docs/openapi-workflows/`에 같은 내용이 있으니 그 경로로 옮겨 두면 된다.

받아 둔 JSON은 라이브 `https://witw.pages.dev/data/openapi/` 아래에서 그대로 열린다(예: `alio/recruitment.json` · `MANIFEST.json` · `dart/corp-map.json`).

## 저작권·지재권

- 금융위원회·한국산업인력공단·재정경제부·국세청 API는 공공데이터포털 **이용허락범위 제한 없음**으로 승인받았다.
- 법제처 국가법령정보는 **공공누리 제1유형**(출처 표기)이다. 법령 조문 자체는 저작권법 제7조에 따라 보호 대상이 아니다.
- OpenDART는 금융감독원 전자공시시스템의 **공식 OpenAPI**이며 이용약관을 따른다. 인증키는 저장소에 두지 않는다(GitHub Secrets만 사용).
- 응답 값은 가공·요약하지 않고 그대로 저장한다. **확인되지 않은 값은 지어내지 않고 빈 문자열·null로 둔다.** 기업 연결은 이름이 아니라 법인등록번호·사업자번호가 일치하는 것만 남긴다.

## 파일 모양

```json
{
  "schema": "jobcounsel.openapi.v1",
  "source": { "name": "...", "provider": "...", "service_id": "15125273",
              "license": "이용허락범위 제한 없음", "official_url": "https://www.data.go.kr/data/15125273/openapi.do" },
  "fetched_at": "2026-11-21T06:00:12+09:00",
  "count": 517,
  "items": [ ... ]
}
```

`MANIFEST.json`은 산출물별 건수·크기·sha256·마지막 갱신 시각을 모은 색인이다.

## 직접 돌려 보기

```bash
# 로컬: 저장소 밖 .secrets/data_go_kr_key · .secrets/opendart_api_key 를 읽는다
python3 ops/scripts/sync_openapi_daily.py --dry-run
python3 ops/scripts/sync_openapi_weekly.py --only ncs_training --limit 20 --dry-run
python3 ops/scripts/sync_openapi_monthly.py --only qnet_stats,law_revision

# GitHub Actions: Actions → openapi-daily/weekly/monthly → Run workflow
gh workflow run openapi-daily.yml -R ccttsi/jobcounsel
```

- `--dry-run`은 호출·파싱만 하고 파일을 쓰지 않는다.
- `--only`로 소스 하나만, `--limit`으로 시험용 일부만 받을 수 있다.
- 값이 하나도 안 바뀌면 파일을 다시 쓰지 않는다(커밋이 생기지 않는다).

## 처음 연결할 때

GitHub 저장소 Secrets에 두 값을 넣는다(값은 절대 저장소에 커밋하지 않는다).

| Secret 이름 | 값 |
|---|---|
| `DATA_GO_KR_API_KEY` | 공공데이터포털 인증키(64자) |
| `OPENDART_API_KEY` | OpenDART 인증키(40자) |
