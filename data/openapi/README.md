# Open API 주기 갱신 자료 (`data/openapi/`)

공공데이터포털·OpenDART에서 **정식 인증키로** 받아온 공식 자료를 주기별로 갱신해 두는 곳이다.
화면(섹터)은 이 JSON을 읽기만 하고, 수집·비교·저장은 GitHub Actions가 맡는다
(`ops/ROLES.md`의 역할 분리 — 정적 앱 코드 안에 외부 수집을 넣지 않는다).

## 무엇을 언제 받나

| 주기 | 소스(서비스 ID) | 결과 파일 |
|---|---|---|
| 매일 06:00 KST | 알리오 공공기관 채용정보(`15125273`) · 국가자격 시험일정(`15074408`) | `alio/recruitment.json` · `qnet/exam-schedule.json` |
| 매주 월 05:00 KST | NCS 훈련과정 정보(`15086447`) | `ncs/training-courses.json` |
| 매월 1일 04:00 KST | OpenDART 공시·기업 고유번호 · 금융위 기업기본(`15043184`)·재무(`15043459`) · Q-net 합격률(`15089380`)·통계(`15025329`) · 법제처 법령(`15000115`) · 국세청 사업자 상태(`15081808`) · **커리어넷 직업사전·직업분류·학과(대학·고교)** | `dart/*.json` · `fsc/*.json` · `qnet/pass-rate.json` · `qnet/stats.json` · `law/revisions.json` · `nts/status.json` · `careernet/*.json` |

워크플로: `.github/workflows/openapi-daily.yml` · `openapi-weekly.yml` · `openapi-monthly.yml`
(셋 다 `workflow_dispatch`가 있어 Actions 화면에서 바로 수동 실행할 수 있다). 저장소에 아직 이 세 파일이 없으면 `docs/openapi-workflows/`에 같은 내용이 있으니 그 경로로 옮겨 두면 된다.

받아 둔 JSON은 라이브 `https://witw.pages.dev/data/openapi/` 아래에서 그대로 열린다(예: `alio/recruitment.json` · `MANIFEST.json` · `dart/corp-map.json`).

## 저작권·지재권

- 금융위원회·한국산업인력공단·재정경제부·국세청 API는 공공데이터포털 **이용허락범위 제한 없음**으로 승인받았다.
- 법제처 국가법령정보는 **공공누리 제1유형**(출처 표기)이다. 법령 조문 자체는 저작권법 제7조에 따라 보호 대상이 아니다.
- **커리어넷**(한국직업능력연구원 운영·교육부 지원)은 공공데이터포털 「교육부_커리어넷 직업정보」(`15056641`)의 이용허락범위가 **제3자 권리 포함(저작권 표시)·공공저작물 출처표시(제1유형)**로 등록돼 있다. 다만 커리어넷 사이트 하단은 「ⓒ KRIVET ALL RIGHTS RESERVED」이고 이용약관 제22조 4항이 서비스로 얻은 정보의 복사·변경·전송을 사전 승낙 없이 금지하므로, **서술문(하는 일·적성·취업현황 등)은 저장하지 않고** 직업명·분류·연봉구간·전망 같은 **사실 필드와 공식 원문 주소만** 저장한다. 항목마다 커리어넷 공식 페이지 주소(`official_url`)를 붙여 원문을 바로 확인할 수 있게 한다.
- OpenDART는 금융감독원 전자공시시스템의 **공식 OpenAPI**이며 이용약관을 따른다. 인증키는 저장소에 두지 않는다(GitHub Secrets만 사용).
- 응답 값은 가공·요약하지 않고 그대로 저장한다. **확인되지 않은 값은 지어내지 않고 빈 문자열·null로 둔다.** 기업 연결은 이름이 아니라 법인등록번호·사업자번호가 일치하는 것만 남긴다.
- **쓰기 직전에 수집 게이트를 지난다** (`ops/scripts/collect_gate.py`, 2026-11-22). 라이선스 표기가 없거나 재가공 불허 표기인데 Track A로 실리면, 시행일(`efYd`·`시행일자`)이 오늘(KST)보다 뒤면, 출처 URL·기준일이 없으면 **파일을 쓰지 않고 그 소스를 실패로 보고한다**. 저장된 산출물도 `validate_outputs()`가 같은 게이트로 다시 본다.

## 커리어넷 (`careernet/`, 2026-11-23 연결)

| 파일 | 서비스 | 건수(2026-11-23 첫 수집) |
|---|---|---:|
| `careernet/jobs.json` | 직업정보(직업사전) `svcCode=JOB` | 454 |
| `careernet/job-types.json` | 커리어넷 직업분류 `svcCode=JOB_TYPE` | 37 |
| `careernet/majors.json` | 학과정보(대학교) `svcCode=MAJOR&gubun=univ_list` | 501 |
| `careernet/high-majors.json` | 학과정보(고등학교) `svcCode=MAJOR&gubun=high_list` | 56 |

- 인증키 이름은 `CAREERNET_API_KEY`다(GitHub Secrets · 로컬 `.secrets/`). 값은 어느 파일에도 적지 않는다.
- 호출은 한 주소(`https://www.career.go.kr/cnet/openapi/getOpenApi`)에 `svcCode`·`gubun`으로 서비스를 고른다. 실패는 HTTP 오류가 아니라 **200 + `result.content[0].code` 음수**(`-1` 인증키 실패 · `-2` 인증키 없음)로 오므로 그 경우 '인증 대기'로 보고한다.
- **직업정보 API는 2023년 8월까지만 제공이 예고된 서비스**다(커리어넷 공지). 2026-11-23 현재 응답하며 개편 전 직업사전 454건을 주는데, 사이트의 새 직업백과 전체 항목과 수가 다를 수 있다 — 산출물 `source.notice`에 이 사실을 남긴다.
- 직업·학과 항목의 `official_url`은 커리어넷 공식 상세 페이지다(`/cloud/w/job/view?seq=` · `/cloud/w/major/uView?seq=` · `/cloud/w/major/hView?seq=`). `seq`는 각각 `jobdicSeq`·`majorSeq`이며 2026-11-23 실제 페이지 제목으로 대조했다.

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
python3 ops/scripts/sync_openapi_monthly.py --only careernet_jobs,careernet_job_types --dry-run
python3 ops/scripts/sync_openapi_monthly.py --only careernet_jobs,careernet_job_types,careernet_majors,careernet_high_majors

# GitHub Actions: Actions → openapi-daily/weekly/monthly → Run workflow
gh workflow run openapi-daily.yml -R ccttsi/jobcounsel
```

- `--dry-run`은 호출·파싱만 하고 파일을 쓰지 않는다.
- `--only`로 소스 하나만, `--limit`으로 시험용 일부만 받을 수 있다.
- 값이 하나도 안 바뀌면 파일을 다시 쓰지 않는다(커밋이 생기지 않는다).
- 저장 전 검증만 따로: `python3 ops/scripts/collect_gate.py data/openapi/law/revisions.json --kind openapi`.

## 처음 연결할 때

GitHub 저장소 Secrets에 두 값을 넣는다(값은 절대 저장소에 커밋하지 않는다).

| Secret 이름 | 값 |
|---|---|
| `DATA_GO_KR_API_KEY` | 공공데이터포털 인증키(64자) |
| `OPENDART_API_KEY` | OpenDART 인증키(40자) |
