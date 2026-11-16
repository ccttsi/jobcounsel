> 17-1 「오늘의 원문」(`/briefing/news/`)의 데이터 계약입니다. `news.json`은 **피클이 17번 브리핑 수집(07:00 한국판 / 23:00 해외판)과 같은 실행에서** 쓰고, 화면 엔진(`briefing/news/app.js`)은 **읽기만** 합니다. 문법은 `SCHEMA.md`(17번)와 같습니다: 필드명·타입·enum은 바꾸지 않고, 늘릴 때는 마이너 버전을 올리며, 엔진은 모르는 필드를 무시합니다.

# 원문 뉴스 데이터 스키마 v1.1.0

- 스키마 버전: **1.1.0** (2026-11-16, 17-2 — `items[].edition`·`updated_at`·`run_id`·`theme_id`, 루트 `runs`·`main_themes` 추가: 권역 배지·종료한 메인테마 연결)
  - 1.0.0 (2026-11-16): 클로드 코드가 엔진과 함께 확정
- 대상 파일: `briefing/data/news.json`(오늘 자), `briefing/data/news-archive/YYYY-MM-DD.json`(그날 스냅샷, 형식 동일, 최근 7일)
- 위치 결정(17-1 기획서 「열린 결정 1」): **`briefing/data/` 한 폴더**. 17번 `briefing.json`과 나란히 둡니다.

---

## 1. 수록 원칙 (엔진이 강제)

**원문 재게시와 AI 번역이 둘 다 허용된 자료만** 싣습니다(17-1 기획서 §②). 엔진은 아래 조건을 **모두** 만족하는 항목만 그리고, 나머지는 「라이선스로 빠진 건수」로 셉니다.

| 조건 | 값 |
|---|---|
| `track` | `"A"` |
| `source.license.verified` | `true` |
| `source.license.type` | `KOGL-1` · `PUBLIC-DOMAIN` · `CC-BY-4.0` 중 하나 |
| `rights.full_text_allowed` | `true` |
| `rights.ai_translation_allowed` | 해외 자료(`source.country`가 `KR`이 아님)면 `true` |
| `body_original` | 비어 있지 않음 |

- CC BY-NC·ND·NC-SA, 공공누리 제2·3·4유형·미부착, 언론 기사, All Rights Reserved는 **넣지 않습니다**(넣어도 엔진이 거릅니다).
- **사진·도표 이미지는 싣지 않습니다.** 본문은 글만. 필요하면 `body_original` 안에 「[그림: 캡션]」처럼 글로만 남깁니다.
- 본문은 **일반 텍스트**입니다(HTML 금지). 문단은 빈 줄(`\n\n`)로 나눕니다. 엔진은 HTML을 해석하지 않고 글자 그대로 보여 줍니다.

- **첫 호 전 자리표시 파일**: 첫 호가 올라오기 전까지 `news.json`은 `items: []`, `archive_dates: []`, `data_status: "partial"`인 빈 파일로 둡니다(화면이 404 콘솔 오류 없이 「첫 호를 준비하고 있습니다」를 보이게). 첫 호부터는 이 파일을 통째로 새로 씁니다.

## 2. 루트 객체

```json
{
  "schema_version": "1.1.0",
  "updated_at": "2026-11-17T07:42:10+09:00",
  "date": "2026-11-17",
  "data_status": "ok",
  "data_status_note": null,
  "runs": { "kr-0700": { "status": "ok", "updated_at": "2026-11-17T07:42:10+09:00", "last_ok": "2026-11-17" }, "global-2300": { "status": "ok", "updated_at": "2026-11-16T23:02:00+09:00", "last_ok": "2026-11-16" } },
  "main_themes": [ ... ],
  "keywords": [ { "word": "청년 고용", "count": 3 } ],
  "items": [ ... ],
  "excluded": { "count": 4, "reasons": [ { "reason": "CC BY-NC 논문", "count": 2 } ] },
  "archive_dates": ["2026-11-17", "2026-11-16"],
  "takedown": { "contact_url": "https://github.com/ccttsi/jobcounsel/issues", "recent": [ { "date": "2026-11-15", "title_ko": "…", "reason": "권리자 요청" } ] }
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `schema_version` | string | ✔ | `"1.1.0"` |
| `updated_at` | string ISO 8601 `+09:00` | ✔ | 파일을 만든 시각 |
| `runs` | object | – | 권역별 실행 상태(`status`·`updated_at`·`last_ok`·`run_id`). `SCHEMA.md` §10과 **같은 값**. 이번 회차 권역만 갱신합니다 |
| `main_themes` | array | – | `SCHEMA.md` §11의 배열과 **같은 값**(`briefing.json`이 정본, 여기는 미러). 17-1은 개수와 `../#themes` 링크에만 씁니다 |
| `date` | string `YYYY-MM-DD` | ✔ | 이 호의 기준일. 17번 `edition.date`와 같은 날 |
| `data_status` | `"ok"`·`"partial"`·`"fallback"` | ✔ | 17번과 같은 뜻 |
| `data_status_note` | string·null | ✔ | `ok`가 아니면 한 문장 |
| `keywords` | array(5~7) | ✔ | `word`(2~8자), `count`(그 단어가 붙은 항목 수) |
| `items` | array(0~30) | ✔ | §3. 최신순 |
| `excluded` | object | ✔ | 수집 단계에서 라이선스로 뺀 건수와 사유. 엔진이 화면에 숨기지 않고 보여 줍니다 |
| `archive_dates` | array | ✔ | 최근 7일, 최신이 앞, `archive_dates[0] == date` |
| `takedown` | object | ✔ | 정정·비노출 창구(`contact_url`)와 최근 비노출 이력(`recent`, 0건이면 빈 배열) |

## 3. `items[]` — 기사 한 건

```json
{
  "id": "n20261117-01",
  "issue_id": "iss-youth-employment",
  "theme_id": "th-youth-employment-gap",
  "edition": "global-2300",
  "updated_at": "2026-11-17T23:12:00+09:00",
  "run_id": "br-20261117-2312",
  "headline": true,
  "published_at": "2026-11-14T08:30:00-05:00",
  "source": {
    "source_name": "U.S. Bureau of Labor Statistics",
    "source_url": "https://www.bls.gov/...",
    "country": "US",
    "license": { "type": "PUBLIC-DOMAIN", "name": "미국 연방정부 저작물 · 퍼블릭 도메인", "url": null,
                 "attribution_text": "Source: U.S. Bureau of Labor Statistics", "verified": true, "verified_at": "2026-11-17",
                 "evidence": "17 U.S.C. §105 연방정부 저작물" }
  },
  "title_original": "…",
  "title_ko": "…",
  "body_original": "문단1\n\n문단2",
  "body_ko_ai": "문단1\n\n문단2",
  "translation": { "mode": "ai", "engine": "…", "translated_at": "2026-11-17T07:35:00+09:00" },
  "topics": ["고용·정책"],
  "keywords": ["청년 고용"],
  "related_jobs": ["직업상담사"],
  "track": "A",
  "rights": { "full_text_allowed": true, "ai_translation_allowed": true }
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✔ | 파일 안에서 유일. 주소(`#a=<id>`)에 쓰므로 영문·숫자·`-`만 |
| `issue_id` | string·null | – | 17번 카드와 같은 이슈 묶음. §5 |
| `theme_id` | string·null | – | 메인테마 id(`th-…`). 17번 `main_themes[].theme_id`와 같은 값. 메인테마에 실린 항목만 채웁니다 (v1.1.0) |
| `edition` | `"kr-0700"`·`"global-2300"` | – | 이 기사를 수집한 권역. `source.country`가 `KR`이면 `kr-0700`, 그 밖은 `global-2300` (v1.1.0) |
| `updated_at` | string ISO 8601 `+09:00` | – | 그 권역 실행이 이 파일을 갱신한 시각 (v1.1.0) |
| `run_id` | string | – | 실행 회차 id `br-YYYYMMDD-HHMM` (v1.1.0) |
| `headline` | boolean | – | 머리기사(하루 1~3건). 없으면 최신 3건을 머리기사로 씀 |
| `published_at` | string ISO 8601 | ✔ | 원문 게시 시각 |
| `source.country` | string ISO 3166-1 alpha-2 | ✔ | `KR`이면 국내 자료 → 번역 토글 없이 원문만 |
| `source.license.type` | `KOGL-1`·`PUBLIC-DOMAIN`·`CC-BY-4.0` | ✔ | 그 밖의 값은 엔진이 거름 |
| `source.license.url` | string·null | – | CC BY는 라이선스 원문 주소 필수 |
| `source.license.attribution_text` | string | ✔ | 화면에 그대로 쓰는 출처 문구 |
| `title_original` / `body_original` | string | ✔ | 원문 그대로 |
| `title_ko` / `body_ko_ai` | string | 해외 ✔ | AI 한국어 번역. 국내 자료는 생략 |
| `translation.mode` | `"ai"`·`"human"` | 해외 ✔ | `"ai"`면 화면에 「AI 번역본(원문 기준)」 |
| `translation.translated_at` | string | 해외 ✔ | 번역 시각 |
| `topics` | array | ✔ | `고용·정책` · `AI·직무` · `글로벌` · `취업시장` 중 1~2 |
| `keywords` | array | ✔ | 루트 `keywords[].word` 중에서 1~3 |
| `related_jobs` | array | – | 관련 직무 태그 0~3 |
| `rights` | object | ✔ | §1 조건 |

## 4. 화면 계약 (엔진이 지키는 것)

1. 상단 고정 고지: 「원문 재게시와 AI 번역이 허용된 자료만 싣습니다. 번역은 AI가 원문을 기준으로 옮긴 것이며, 법적 효력은 원문에 있습니다.」
2. 순서: 오늘의 키워드 → 머리기사 1~3 → 주제·출처로 좁히기 → 피드(15건 단위 쪽 나눔) → 이번 호 출처·라이선스 색인 → 정정·비노출 안내.
3. 인앱 리더: 해외 자료는 원문 / 번역 / 나란히 3모드(기본 번역), 국내 자료는 원문만. 항목마다 출처명·라이선스·원문 링크·게시 시각·(해외) 「AI 번역본(원문 기준)」·번역 시각.
4. CC BY 4.0은 저작자·라이선스 링크·「AI 한국어 번역, 내용 변경 없음」을 함께 표기.
5. 빈 상태: 「오늘은 허용된 원문 자료가 N건입니다」 + 라이선스로 빠진 건수. 파일이 없거나 오류면 직전 호(`news-archive`)로 대체하고 그 사실을 띠로 표시.
6. 내보내기(저장·인쇄·PDF·복사·다운로드) 없음. 무한 스크롤·자동 재생·광고 없음.

## 5. 17번과의 연결 (`issue_id` · `theme_id`)

- 17번 `briefing.json`의 `cards[]`에 **`issue_id`(string, 선택)** 를 더해 주세요(17번 스키마 v1.1.0, 하위 호환). 같은 수집 실행에서 같은 값을 배정합니다.
- 17번 엔진은 이미 이 필드를 읽습니다: 같은 `issue_id`를 가진 원문이 `news.json`에 있으면 그 카드 아래에 「오늘의 원문 더 보기」 링크(`/briefing/news/?issue=<issue_id>`)를 그립니다. 없으면 아무것도 그리지 않습니다.
- 17-1 리더는 `issue_id`가 17번 카드와 맞으면 「이 소식을 3분 요약으로」 링크(`/briefing/#<card id>`)를 그립니다.
- **메인테마(17-2)**: 원문이 메인테마에 오르면 `items[].theme_id`에 17번 `main_themes[].theme_id`와 같은 값을 넣습니다. 화면은 17번 하단 메인테마가 정본이고, 17-1은 「메인테마 N개 →」 링크(`../#themes`)만 그립니다. 테마에 올라올 수 없는 자료(라이선스 미확인)는 `theme_id: null`로 두고 `is_main_theme: false`를 유지합니다.

## 6. 검증 체크리스트 (커밋 전)

- [ ] JSON 문법 통과, `schema_version` `"1.1.0"`, `updated_at` `+09:00`
- [ ] `items[].id` 중복 없음, 영문·숫자·`-`만
- [ ] 모든 항목이 §1 조건 충족(아니면 넣지 말고 `excluded`에 셈)
- [ ] 해외 항목에 `title_ko`·`body_ko_ai`·`translation` 있음
- [ ] 본문에 HTML 태그·이미지 주소 없음
- [ ] `archive_dates[0] == date`, `news-archive/{date}.json` 실재
- [ ] 모든 `source_url`이 HTTP 200
- [ ] `items[].edition`이 `source.country`와 맞고, 이번 회차 권역이 아닌 항목은 직전 값 그대로인가(덮어쓰기 금지)
- [ ] `theme_id`가 17번 `main_themes[].theme_id`에 실재하고, 짝인 항목의 `license.verified === true`인가
