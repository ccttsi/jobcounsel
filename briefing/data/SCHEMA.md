> 이 저장소에서는 `briefing/data/`에 두고, 17번 섹터 「오늘의 고용·AI 인포 브리핑」(`/briefing/`)이 고치지 않고 읽기만 합니다. `briefing.json`은 **피클이 매일 아침 07:30경 새로 쓰고**, 클로드 코드가 만드는 시각화 엔진은 **읽기만** 합니다. 이 문서(`SCHEMA.md`)와 JSON 두 종류가 계약입니다.

# 브리핑 데이터 스키마 v1.0.0

- 스키마 버전: **1.0.0** (2026-11-16 고정)
- 대상 파일: `briefing/data/briefing.json`, `briefing/data/archive/YYYY-MM-DD.json`
- 소비자: `/briefing/` 시각화 엔진 (클로드 코드가 1회 구현)
- 생산자: 피클 일일 파이프라인 (07:30 수집·번역·저작권 검수·커밋)

**깨지지 않는 약속**: 아래 필드명·타입·enum은 바뀌지 않습니다. 필드가 늘어날 때는 마이너 버전을 올리고 `schema_version`에 적습니다. 엔진은 모르는 필드를 만나면 **무시**하고 그려야 합니다(전방 호환).

---

## 1. 파일 구성과 읽기 순서

| 파일 | 쓰는 쪽 | 읽는 쪽 | 설명 |
|---|---|---|---|
| `briefing/data/briefing.json` | 피클 | 엔진 | **오늘 자** 데이터. 항상 최신 1건. |
| `briefing/data/archive/YYYY-MM-DD.json` | 피클 | 엔진(지난 브리핑) | 그날의 `briefing.json`을 **그대로 복사한 스냅샷**. 형식은 `briefing.json`과 100% 동일. |
| `briefing/data/SCHEMA.md` | 사람·피클 | 엔진 구현자 | 이 문서. |

- 엔진 진입점은 **항상 `briefing/data/briefing.json`** 하나입니다. `fetch('data/briefing.json')` (엔진이 `/briefing/index.html`이면 상대경로 `../briefing/data/briefing.json` 또는 `data/../briefing/data/...`가 아니라 **`briefing/data/briefing.json`을 사이트 루트 기준으로** 지정).
- 지난 브리핑은 `archive_dates` 배열을 보고 `briefing/data/archive/{date}.json`을 그때만 추가로 받습니다(첫 화면에서 모두 받지 않는다).
- JSON은 **UTF-8, BOM 없음**. 날짜·시각은 모두 `Asia/Seoul` 기준 ISO 8601 문자열입니다.

---

## 2. 저작권 2트랙 정책 (카드마다 `track`으로 표시)

| 트랙 | 무엇 | 이 브리핑에서 할 수 있는 것 |
|---|---|---|
| **A** | 공공누리 제1유형(출처표시)·퍼블릭 도메인·CC BY 4.0 등 **재가공이 허락된 자료** | 번역·요약·도표화·카드뉴스화 모두 가능. **출처·라이선스 배지 필수.** |
| **B** | 언론사 기사, **공공누리 미부착** 공공자료 등 재가공이 허락되지 않은 자료 | **본문·표현 복제·번역 금지.** 객관적 사실·수치만 우리 말로 새로 쓴 3줄 요약 + 원문 링크. 인용은 15단어 이내. |

- 트랙 B에는 두 갈래가 있습니다: **B-PRESS**(언론 기사)와 **B-NOKOGL**(공공누리 표시가 없어 사전 협의가 필요한 공공자료 — 수치 사실만 사용). `source.license.type`이 `PRESS`면 B-PRESS, `KOGL-NONE`이면 B-NOKOGL입니다.
- 엔진은 카드 하단에 `track` 배지(A = 파랑 계열, B = 회색 계열), `source.source_name`, `source.license.name`, `source.source_url` 링크를 **반드시** 노출합니다. 배지를 숨기는 렌더링은 규격 위반입니다.
- `source.license.attribution_text`가 있으면 그 문장을 출처 표기 문구로 그대로 씁니다.

---

## 3. 루트 객체

```json
{
  "schema_version": "1.0.0",
  "updated_at": "2026-11-16T11:16:53+09:00",
  "edition": { ... },
  "headline_metrics": [ ... ],
  "cards": [ ... ],
  "radar": { ... },
  "sources": [ ... ],
  "archive_dates": ["2026-11-16"],
  "copyright_policy": { ... },
  "disclaimer": "..."
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `schema_version` | string | ✔ | `"MAJOR.MINOR.PATCH"`. 지금은 `"1.0.0"`. |
| `updated_at` | string (ISO 8601, +09:00) | ✔ | 이 파일을 만든 시각. |
| `edition` | object | ✔ | §4 |
| `headline_metrics` | array(3~4) | ✔ | §5. **첫 화면 최상단 숫자 카드.** |
| `cards` | array(5~7) | ✔ | §6. 이슈 카드. `order` 오름차순으로 그립니다. |
| `radar` | object | ✔ | §7. 해외 ↔ 국내 2열 대비. |
| `sources` | array | ✔ | §8. 카드가 참조하는 출처 목록. |
| `archive_dates` | array(string `YYYY-MM-DD`) | ✔ | 최근 7일, **최신이 앞**. 오늘 날짜가 첫 원소. |
| `copyright_policy` | object | ✔ | §9. 엔진 화면 하단 고지용. |
| `disclaimer` | string | ✔ | 한 문단. 화면 하단에 그대로 표시. |

---

## 4. `edition` — 오늘 호의 표지

```json
"edition": {
  "no": 1,
  "date": "2026-11-16",
  "weekday": "월",
  "title": "청년이 빠진 자리, 경력과 AI가 채운다",
  "subtitle": "국내 고용지표·미국 노동시장·AI 프리랜스 실험을 한 장으로",
  "reading_minutes": 3,
  "data_status": "ok",
  "data_status_note": null
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `no` | integer | 창간호부터 1씩 증가. |
| `date` | string `YYYY-MM-DD` | 이 호의 기준일(= 파일 날짜). |
| `weekday` | string | `월`~`일` 한 글자. |
| `title` | string | 그날의 한 줄 제목(사실을 왜곡하지 않는 범위에서 압축). |
| `subtitle` | string | 1문장. |
| `reading_minutes` | integer | 목표 3. |
| `data_status` | enum `"ok"` \| `"partial"` \| `"fallback"` | `partial`= 일부 소스 수집 실패, `fallback`= 직전 호 데이터로 대체. |
| `data_status_note` | string \| null | `ok`가 아니면 이유를 한 문장으로. 엔진은 `ok`가 아니면 화면 상단에 그 문장을 띄웁니다. |

---

## 5. `headline_metrics[]` — 오늘의 핵심 수치 (3~4개)

```json
{
  "id": "hm_kr_employed",
  "label": "국내 취업자 (전년동월비)",
  "value": 13.9,
  "unit": "만명",
  "value_text": "+13.9만명",
  "base_value": 2917.9,
  "base_unit": "만명",
  "direction": "up",
  "period": "2026년 10월",
  "delta_from": "전년동월",
  "source_id": "src_mods_202610",
  "track": "A",
  "spark": { "labels": ["7월","8월","9월","10월"], "values": [10.8,18.4,11.3,13.9], "unit": "만명" }
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 파일 안에서 유일. `hm_` 접두. |
| `label` | string | 12자 내외. |
| `value` | number | 강조 숫자(차트 없이도 읽히는 값). |
| `unit` | string | `만명`, `%`, `%p`, `천명`, `배`, `억원` 등. |
| `value_text` | string | 부호·단위 포함 표기(`+13.9만명`, `4.1%`). 화면에는 이걸 크게. |
| `base_value` | number \| null | 모수(예: 취업자 총수). 없으면 null. |
| `base_unit` | string \| null | 모수 단위. |
| `direction` | enum `"up"`\|`"down"`\|`"flat"` | 색·화살표 결정. **좋다/나쁘다 판단이 아니라 증감 방향**입니다(엔진이 임의로 빨강/파랑을 뒤집지 않습니다). |
| `period` | string | `2026년 10월`처럼 기준 시점. |
| `delta_from` | string | `전년동월`, `전월`, `12개월 평균` 등 비교 기준. |
| `source_id` | string | `sources[].id` 참조(필수). |
| `track` | enum `"A"`\|`"B"` | 배지. |
| `spark` | object \| null | 미니 추이. `labels`와 `values`는 **길이가 같아야** 합니다. `unit`은 `values` 단위. |

---

## 6. `cards[]` — 이슈별 3단 카드 (5~7장)

```json
{
  "id": "c01",
  "order": 1,
  "track": "A",
  "category": "국내 고용지표",
  "title": "취업자는 늘었지만, 20대는 20만명 빠졌다",
  "kicker": "10월 취업자 +13.9만명 · 청년 고용률 42.9%",
  "three_step": {
    "what": "무슨 일인가 — 2문장 이내",
    "evidence": "수치·근거 — 숫자 2개 이상, 기준 시점 명시",
    "implication": "상담·구직 시사점 — 현장에서 무엇을 다르게 할지"
  },
  "key_numbers": [
    { "label": "15~64세 고용률", "value": "70.4%", "delta": "+0.3%p", "period": "2026년 10월" }
  ],
  "chart_data": { ... },
  "counselor_question": "내담자에게 던질 질문 1개(선택)",
  "tags": ["청년", "고용률"],
  "ncs": ["직업상담서비스"],
  "source": { ... }
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✔ | `c01`… 파일 안에서 유일. |
| `order` | integer | ✔ | 1부터. 화면 순서. |
| `track` | enum `"A"`\|`"B"` | ✔ | §2. |
| `category` | string | ✔ | `국내 고용지표` / `국내 고용행정` / `해외 노동시장` / `AI·직무` / `채용시장`. |
| `title` | string | ✔ | 30자 내외. 숫자 하나를 넣습니다. |
| `kicker` | string | ✔ | 제목 아래 한 줄(핵심 수치 2개). |
| `three_step` | object | ✔ | 세 키 모두 **비어 있으면 안 됩니다**. |
| `three_step.what` | string | ✔ | 무슨 일인가. 사실 진술. |
| `three_step.evidence` | string | ✔ | 수치·근거. 숫자 2개 이상 + 기준 시점. |
| `three_step.implication` | string | ✔ | 상담·구직 시사점. **행동 1가지**로 끝냅니다. |
| `key_numbers` | array(1~4) | ✔ | `label`, `value`(문자열, 단위 포함), `delta`(문자열, 없으면 `""`), `period`. |
| `chart_data` | object | ✔ | §6-1. |
| `counselor_question` | string | – | 상담사가 바로 쓸 질문. 없으면 생략(엔진은 없으면 안 그립니다). |
| `tags` | array(string) | ✔ | 검색·필터용. 2~4개. |
| `ncs` | array(string) | – | NCS 능력단위 태그(예: `직업상담서비스`). |
| `source` | object | ✔ | §8. |

### 6-1. `chart_data` — 도표 1개(카드당 정확히 1개)

```json
"chart_data": {
  "type": "diverging_bar",
  "unit": "만명",
  "labels": ["7월","8월","9월","10월"],
  "series": [
    { "name": "전체 취업자 증감", "values": [10.8, 18.4, 11.3, 13.9], "emphasis": true },
    { "name": "청년(15~29세) 증감", "values": [-19.1, -14.3, -14.7, -19.6], "emphasis": false }
  ],
  "reference_value": 0,
  "note": "전년동월비. 국가데이터처 2026년 10월 고용동향.",
  "source_id": "src_mods_202610"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `type` | enum | ✔ | `bar`(단일 막대) · `diverging_bar`(0 기준 위·아래) · `grouped_bar`(2계열 묶음) · `line`(추이) · `index_bar`(기준=100 지수) · `slope`(두 시점 비교) |
| `unit` | string | ✔ | 값 단위. `%`·`만명`·`천명`·`지수(비AI=100)` 등. |
| `labels` | array(string) | ✔ | x축. 2~8개. |
| `series` | array(1~2) | ✔ | `name`(범례), `values`(number 배열, **`labels`와 길이 동일**), `emphasis`(bool, 주 계열 1개만 true) |
| `reference_value` | number \| null | – | 기준선(주로 0). 없으면 null. |
| `note` | string | ✔ | 기준 시점·출처 한 줄. 카드 안에 그대로 표시합니다. |
| `source_id` | string | ✔ | `sources[].id`. |

- `type`별 최소 조건: `diverging_bar`·`grouped_bar`는 `series`가 2개(1개여도 그리되 묶음 여백 없이), `line`은 `labels` 3개 이상, `slope`는 `labels` 정확히 2개, `index_bar`는 `reference_value` 생략 가능.
- 값이 `null`인 칸은 **빈 칸(공백)** 으로 그리고 0으로 채우지 않습니다.
- 색은 `emphasis`만 씁니다(주 계열 = 잉크색, 보조 = 회색). 트랙 색을 막대에 칠하지 않습니다.

---

## 7. `radar` — AI × 직무 변화 레이더 (해외 ↔ 국내 2열)

```json
"radar": {
  "title": "AI × 직무 변화 레이더",
  "as_of": "2026-11-16",
  "columns": ["해외 동향", "국내 영향"],
  "rows": [
    {
      "id": "r01",
      "group": "청년·신규 진입",
      "abroad": "해외 동향 1문장(수치 포함)",
      "domestic": "국내 영향 1문장(수치 포함)",
      "changing": "바뀌는 것 — 한 구절",
      "staying": "남는 것 — 한 구절",
      "source_ids": ["src_bls_202610", "src_mods_202610"]
    }
  ]
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `title` | string | 고정 문구 `"AI × 직무 변화 레이더"`. |
| `as_of` | string `YYYY-MM-DD` | 기준일. |
| `columns` | array(2 string) | `["해외 동향","국내 영향"]` 고정. |
| `rows` | array(3~5) | `id`(`r01`…), `group`(직무·집단명), `abroad`, `domestic`, `changing`, `staying`, `source_ids`(1개 이상, 실재하는 `sources[].id`). |

- 모바일(1열)에서는 `group` → `abroad` → `domestic` → `changing`/`staying` 순으로 세로 적층, 큰 화면(가로)에서는 `abroad`|`domestic` 2열 대비. 이 순서를 바꾸지 않습니다.

---

## 8. `source` / `sources[]` / `license` — 출처와 라이선스

카드·수치 카드의 `source` 객체:

```json
"source": {
  "source_id": "src_mods_202610",
  "source_name": "국가데이터처",
  "source_title": "2026년 10월 고용동향",
  "source_url": "https://www.korea.kr/briefing/policyBriefingView.do?newsId=156788701",
  "published_at": "2026-11-11",
  "license": {
    "name": "공공누리 제1유형(출처표시)",
    "type": "KOGL-1",
    "url": "https://www.kogl.or.kr/info/license.do?lCode=1",
    "scope": "텍스트 한정(사진·이미지 제외)",
    "attribution_required": true,
    "commercial_use": "allowed",
    "modification": "allowed",
    "verified": true,
    "verified_at": "2026-11-16",
    "evidence": "정책브리핑 해당 페이지 하단 고지 확인",
    "attribution_text": "출처: 국가데이터처 「2026년 10월 고용동향」(공공누리 제1유형)"
  },
  "usage": "수치만 재구성. 원문 문장 복제 없음."
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `source_id` | string | `src_` 접두. `sources[]`와 1:1. |
| `source_name` | string | 기관·매체명. |
| `source_title` | string | 자료·기사 제목(사실 표기). |
| `source_url` | string | **원문 URL. 실제로 열리는 주소만.** |
| `published_at` | string `YYYY-MM-DD` | 발표·게시일. |
| `license.name` | string | 사람이 읽는 라이선스명. |
| `license.type` | enum | `KOGL-1` · `PUBLIC-DOMAIN` · `CC-BY-4.0` · `PRESS` · `KOGL-NONE` |
| `license.url` | string \| null | 라이선스 원문 주소. |
| `license.scope` | string \| null | 적용 범위(예: 텍스트 한정). |
| `license.attribution_required` | boolean | 출처 표시 의무. |
| `license.commercial_use` | enum `allowed`\|`not_allowed`\|`unknown` | |
| `license.modification` | enum `allowed`\|`not_allowed`\|`unknown` | |
| `license.verified` | boolean | 이번 호에서 **직접 확인**했는지. `false`면 카드에 "라이선스 확인 중" 배지. |
| `license.verified_at` | string `YYYY-MM-DD` | 확인한 날. |
| `license.evidence` | string | 무엇을 보고 판단했는지 한 줄(페이지 하단 고지, arXiv 라이선스 표기 등). |
| `license.attribution_text` | string | 화면·각주에 그대로 쓰는 출처 문구. |
| `usage` | string | 우리가 실제로 한 이용 범위(재가공/수치 인용). |

`sources[]`는 위 객체를 `id` 필드로 나열한 배열입니다(카드와 같은 객체 재사용, `id`만 추가).

```json
"sources": [ { "id": "src_mods_202610", "source_name": "국가데이터처", ... } ]
```

- **참조 무결성**: 모든 `source_id`·`source_ids` 값은 `sources[].id`에 존재해야 합니다. 엔진은 없는 id를 만나면 그 카드를 그리지 않고 콘솔 경고만 남깁니다.
- `type`과 `track`의 짝: `KOGL-1`·`PUBLIC-DOMAIN`·`CC-BY-4.0` → `A`, `PRESS`·`KOGL-NONE` → `B`. 어긋나면 데이터 오류입니다.

---

## 9. `copyright_policy` — 화면 하단 고지

```json
"copyright_policy": {
  "summary": "트랙 A는 라이선스가 허락한 범위에서 번역·도표화했고, 트랙 B는 본문을 옮기지 않고 사실·수치만 새로 썼습니다.",
  "track_a_note": "출처·라이선스를 카드마다 표시합니다.",
  "track_b_note": "원문 링크만 제공하며 본문·번역문을 싣지 않습니다.",
  "quote_limit_words": 15,
  "contact": "원문 권리자의 요청이 있으면 해당 카드를 즉시 내립니다."
}
```

- `quote_limit_words`(integer): 카드당 허용 인용 단어 수 상한. 엔진이 임의로 늘리지 않습니다.

---

## 10. 렌더링 계약 (엔진이 지킬 것)

1. **첫 화면**: `edition.date`·`edition.title` + `headline_metrics` 3~4개. 스크롤 없이 이 세 가지가 보여야 합니다.
2. **카드 순서**: `cards`를 `order` 오름차순으로. 트랙별로 묶지 않습니다(하루의 흐름이 우선).
3. **3단 고정**: 모든 카드는 `무슨 일 → 수치·근거 → 상담 시사점` 3단으로 같은 리듬. 단을 합치거나 순서를 바꾸지 않습니다.
4. **도표**: `chart_data.type` 하나당 도표 하나. 텍스트로 수치를 다시 나열하지 않습니다.
5. **배지**: 카드마다 트랙(A/B) + 라이선스명 + 원문 링크. `license.verified === false`면 "확인 중" 표시.
6. **레이더**: 모바일 1열 적층, 큰 화면 2열 대비(§7 순서 고정).
7. **아카이브**: `archive_dates`에서 날짜를 고를 때만 해당 JSON을 추가 요청. 없으면 "그날 브리핑 없음".
8. **내보내기 금지**: HTML 저장·인쇄(`@media print`)·PDF·복사 버튼을 만들지 않습니다(자료실 공통 규칙).
9. **디자인**: 저장소 `DESIGN.md`와 `design/patterns/`를 그대로 따릅니다. 새 시그니처 스타일을 만들지 않습니다.
10. **빈 데이터**: `cards`가 5장 미만이거나 `data_status`가 `fallback`이면 화면 상단에 `edition.data_status_note`를 그대로 띄웁니다.

---

## 11. 검증 체크리스트 (데이터를 커밋하기 전)

- [ ] `python3 -m json.tool briefing/data/briefing.json` 통과(문법)
- [ ] `schema_version`이 `"1.0.0"`, `updated_at`이 `+09:00`
- [ ] `cards` 5~7장, `order`가 1..N 연속, `id` 중복 없음
- [ ] 모든 `series[].values` 길이 == `labels` 길이
- [ ] 모든 `source_id`·`source_ids`가 `sources[].id`에 존재
- [ ] `license.type`과 `track`의 짝이 §8 규칙과 일치
- [ ] `archive_dates[0] == edition.date`, 최근 7일 이내, `archive/{date}.json` 실재
- [ ] 트랙 B 카드에 원문 문장 복제가 없고 인용이 15단어 이내
- [ ] 모든 `source_url`이 HTTP 200

---

## 12. 예시 최소 JSON (엔진 개발용)

```json
{
  "schema_version": "1.0.0",
  "updated_at": "2026-11-16T11:16:53+09:00",
  "edition": { "no": 1, "date": "2026-11-16", "weekday": "월", "title": "…", "subtitle": "…", "reading_minutes": 3, "data_status": "ok", "data_status_note": null },
  "headline_metrics": [ { "id": "hm_a", "label": "…", "value": 13.9, "unit": "만명", "value_text": "+13.9만명", "base_value": 2917.9, "base_unit": "만명", "direction": "up", "period": "2026년 10월", "delta_from": "전년동월", "source_id": "src_x", "track": "A", "spark": { "labels": ["9월","10월"], "values": [11.3,13.9], "unit": "만명" } } ],
  "cards": [ { "id": "c01", "order": 1, "track": "A", "category": "국내 고용지표", "title": "…", "kicker": "…", "three_step": { "what": "…", "evidence": "…", "implication": "…" }, "key_numbers": [ { "label": "…", "value": "70.4%", "delta": "+0.3%p", "period": "2026년 10월" } ], "chart_data": { "type": "bar", "unit": "만명", "labels": ["9월","10월"], "series": [ { "name": "취업자 증감", "values": [11.3,13.9], "emphasis": true } ], "reference_value": 0, "note": "…", "source_id": "src_x" }, "tags": ["고용률"], "source": { "source_id": "src_x", "…": "…" } } ],
  "radar": { "title": "AI × 직무 변화 레이더", "as_of": "2026-11-16", "columns": ["해외 동향","국내 영향"], "rows": [ { "id": "r01", "group": "…", "abroad": "…", "domestic": "…", "changing": "…", "staying": "…", "source_ids": ["src_x"] } ] },
  "sources": [ { "id": "src_x", "…": "…" } ],
  "archive_dates": ["2026-11-16"],
  "copyright_policy": { "summary": "…", "track_a_note": "…", "track_b_note": "…", "quote_limit_words": 15, "contact": "…" },
  "disclaimer": "…"
}
```
