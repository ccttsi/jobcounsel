# Open API 자동 갱신 워크플로 (여기에 있는 3개를 `.github/workflows/`로 옮겨 둔다)

이 폴더의 YAML 3개가 GitHub Actions에서 도는 최종본이다. 연결된 GitHub App에
`Workflows` 권한이 없어 앱이 `.github/workflows/`에 직접 올리지 못했을 때를 위해
같은 내용을 여기 보관한다. GitHub 웹에서 파일을 추가할 때는 아래 경로와 이름을 **그대로** 쓴다.

| 파일 | 저장소에서 있어야 할 경로 | 언제 도나 |
|---|---|---|
| `openapi-daily.yml` | `.github/workflows/openapi-daily.yml` | 매일 06:00 KST |
| `openapi-weekly.yml` | `.github/workflows/openapi-weekly.yml` | 매주 월 05:00 KST |
| `openapi-monthly.yml` | `.github/workflows/openapi-monthly.yml` | 매월 1일 04:00 KST |

## GitHub 웹에서 추가하는 법

1. `https://github.com/ccttsi/jobcounsel` → **Add file** → **Create new file**
2. 이름 칸에 `.github/workflows/openapi-daily.yml`을 그대로 입력(슬래시를 치면 폴더가 만들어진다)
3. 이 폴더의 `openapi-daily.yml` 내용을 전부 붙여 넣고 **Commit changes**
4. 주간·월간도 같은 방법으로 두 번 더 반복

셋 다 `Run workflow` 단추(`workflow_dispatch`)가 있어서, 추가한 뒤 Actions 화면에서
바로 한 번씩 돌려 확인할 수 있다. 인증키는 저장소 Secrets의 `DATA_GO_KR_API_KEY`·
`OPENDART_API_KEY`를 읽는다.
