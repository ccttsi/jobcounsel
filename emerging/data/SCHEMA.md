# Emerging Industry 데이터 스키마 (v1.1.0)

신산업 브리핑 `/emerging/`이 읽는 자료의 계약서다. 화면(`app.js`)은 **이 파일에 적힌 필드만** 읽고, 모르는 필드는 무시한다(전방 호환). 매일 한 호를 덧붙이는 자동 업로드도 이 계약을 따른다.

> **v1.1.0 (2026-11-19)** — 기사마다 한 줄 부제 `items[].subtitle`을 필수로 둔다. 제호 아래 그 줄은 그 날의 테마가 아니라 **지금 보고 있는 기사의 부제**이며 기사를 바꾸면 함께 바뀐다. 날짜별 테마 문구 `edition.subtitle`은 없앴다(폐지). 하루 건수는 3~9건 사이에서 그날 자료에 따라 다르게 둔다.

- 최신 호: `emerging/data/emerging.json`
- 지난 호: `emerging/data/archive/YYYY-MM-DD.json` (하루 1파일)
- 2026-11-01 ~ 2026-11-19: 초기 19일치(19파일). 이후 날짜는 자동 업로드가 채운다.
- **하루 기사 수는 고정하지 않는다.** 흐름을 읽을 만한 자료가 있으면 담고, 없으면 적게 담는다. 상한은 **9건**(10건 미만), 하한은 **3건**이며, 날짜마다 같은 수를 채우려 애쓰지 않는다. 같은 섹터가 하루에 3건을 넘어도 그날 뉴스가 몰린 결과라면 그대로 둔다(인위적 균형 금지).
- **날짜별 단일 테마를 강제하지 않는다.** 그날그날 1~4차 신산업 뉴스·동향을 자유롭게 담는다. 하루를 한 문장 테마로 묶어 기사를 그 테마에 끼워 맞추지 않는다.

## 1. 파일 하나의 구조

```jsonc
{
  "schema_version": "1.1.0",
  "updated_at": "2026-11-19T06:40:00+09:00",     // ISO 8601, KST
  "edition": { ... },                             // 그 날의 제호 (2)
  "archive_dates": ["2026-11-01", ...],           // 최신 호 파일에만 넣는다(색인)
  "archive_index": [ ... ],                       // 최신 호 파일에만 넣는다(3)
  "sectors": [ ... ], "categories": [ ... ],      // 4
  "items": [ ... ],                               // 그 날의 기사 3~9건 (5)
  "jobs":   [ ... ],                              // 그 날 기사가 참조하는 직무만 (6)
  "sources": [ ... ],                             // 그 날 기사·도표가 참조하는 출처만 (7)
  "copyright_policy": { ... }, "disclaimer": "…"   // 8
}
```

`archive/*.json`은 `archive_dates`·`archive_index`를 넣지 않는다(최신 호 파일이 색인의 원본).

## 2. `edition`

| 필드 | 형 | 설명 |
|---|---|---|
| `no` | int | 호 번호. 2026-11-01이 1호, 11-19가 19호. 날짜에서 계산한다 |
| `date` | `YYYY-MM-DD` | 그 날 |
| `weekday` | `월`~`일` | 한 글자 |
| `title` | string | 그 날 앞기사의 제목을 압축한 한 줄(20자 내외). **색인·지난 지면 목록의 이름표로만 쓴다.** 날짜를 대표하는 테마 문구를 새로 짓지 않는다 |
| `reading_minutes` | int | 3~5 |
| `data_status` | `ok` \| `fallback` | 수집이 실패해 이전 호를 다시 올릴 때 `fallback` |

**규칙**: `date`는 파일 이름과 같아야 한다. `no`는 초기 19일 뒤로 이어서 매일 +1. `subtitle`(날짜 테마) 필드는 **없다** — 부제는 기사마다 `items[].subtitle`에 둔다.

## 3. `archive_index` 항목

```jsonc
{ "date": "2026-11-01", "no": 1, "weekday": "일", "title": "농업과 로봇, 수출의 첫 숫자",
  "items": [ { "id": "ei-20261101-1", "title": "…", "sector": "s1", "cat": "smartfarm", "order": 1 } ] }
```

달력·지난 지면·섹터 필터가 이 색인만 보고 그린다(파일 19개를 미리 받지 않는다). 새 호를 올릴 때 **최신 호 파일의 `archive_dates`와 `archive_index` 맨 끝에 한 줄을 더한다.**

## 4. `sectors` · `categories`

```jsonc
" sectors ": [
  { "id": "s1", "no": "1", "name": "1차 산업", "sub": "스마트농업 · 자원 · 식량", "short": "1차" },
  { "id": "s2", "no": "2", "name": "2차 산업", "sub": "첨단제조 · 로보틱스 · 이차전지 · 반도체", "short": "2차" },
  { "id": "s3", "no": "3", "name": "3차 산업", "sub": "핀테크 · 디지털헬스 · 물류 · 콘텐츠", "short": "3차" },
  { "id": "s4", "no": "4", "name": "4차 산업", "sub": "AI · 양자 · 우주 · 클린테크", "short": "4차" }
]
"categories": [ { "id": "smartfarm", "sector": "s1", "name": "스마트팜" } ]
```

카테고리 id는 고정 목록을 쓴다: `smartfarm` `agri-robot` `resource` `robotics` `battery` `semicon` `material` `bio-mfg` `fintech` `health` `logistics` `content` `edu` `ai` `quantum` `space` `climate` `energy` `security`. 새 카테고리는 여기에 먼저 추가한 뒤 기사에서 쓴다(기사가 참조하는 카테고리가 없으면 화면에서 라벨을 비운다).

## 5. `items` (기사)

```jsonc
{
  "id": "ei-20261119-1",           // ei-YYYYMMDD-일련번호(그 날 안에서 고유. order와 같을 필요는 없다)
  "date": "2026-11-19",
  "order": 1,                      // 1=앞기사, 2·3
  "lead": true,                    // order 1만 true
  "sector": "s4", "cat": "ai",
  "title": "AI가 지역의 건강 위험을 먼저 본다",     // 40자 안팎
  "subtitle": "KISTEP 10대 기술에 든 AI 건강위험 예측, 예측 뒤의 중재까지 설계해야 한다",  // 15~50자, 필수(5-1)
  "kicker": "출처 또는 각주 한 줄",                 // 1줄
  "summary": "두 문장. 무엇이 일어났고 숫자가 무엇을 말하는지.",
  "key_numbers": [ { "label": "…", "value": "…", "note": "…" } ],   // 2~3개, value에 단위 포함
  "market": { ... },               // 도표 (없으면 null)
  "players": { "domestic": ["…"], "global": ["…"] },
  "jobs": { "legacy": ["j-mech"], "new": ["j-bms"] },   // 6의 id
  "source_id": "src_bls_ep2434",   // 7의 id
  "question": "상담에서 던질 한 문장"                    // 선택
}
```

**5-1. `subtitle`(기사 부제) — 필수**

화면은 제호 아래 한 줄을 **지금 보고 있는 기사의 `subtitle`**로 그린다(없으면 `title`). 그래서 부제는 그 날의 테마가 아니라 **그 기사만의 요점**이다.

- 길이 15~50자, 한 문장, 끝에 마침표를 찍지 않는다. 390px 폭에서 두 줄(글자를 키우면 세 줄)로 보이므로 앞쪽 25자에 숫자·대상을 둔다.
- `title`을 그대로 다시 쓰지 않는다. 제목이 말하지 않은 숫자·비교·조건을 담는다(예: 제목 “개업간호사 +40.1%…” → 부제 “32만 400명→44만 8,800명(+40.1%), 전체 증가율 3.1%의 열세 배”).
- 그 날 여러 기사에 같은 문구를 돌려 쓰지 않는다(날짜 테마가 되살아난다). 기사마다 다른 문구여야 한다.
- 확인되지 않은 수치를 넣지 않는다. `key_numbers`·`summary`에 있는 사실만 쓴다.
- `edition.subtitle`은 두지 않는다. 제호 아래 테마 문구를 만들고 싶으면 그 날 앞기사의 `subtitle`로 충분한지 먼저 본다.

**`market`(도표)**

```jsonc
{ "label": "세계 배터리 수요", "unit": "GWh", "basis": "2024년 실적·2030년 전망",
  "chart": "bar",                  // bar | line
  "labels": ["2024 전기차", "2024 전체", "2030 전체"],
  "series": [ { "name": "수요", "values": [950, 1000, 3000], "emphasis": true } ],  // 1~3개
  "cagr": 20.1,                    // 없으면 null
  "note": "2030년은 2024년 대비 3배.",
  "source_id": "src_iea_batteries2024" }
```

- `values` 길이는 `labels` 길이와 같아야 한다. 값이 없는 칸은 `null`.
- 도표를 그릴 수 없으면 `market`을 `null`로 두고 문장·핵심 수치로만 적는다. **추정값을 만들어 넣지 않는다.**
- `cagr`은 공표된 두 값에서 계산한 경우에만 넣고, `note`에 계산했다고 밝힌다.
- `chart`는 `bar`(기본)와 `line`만 지원한다. 새 유형은 화면 코드가 있어야 한다.

## 6. `jobs` (직무분석)

```jsonc
{ "id": "j-bms", "kind": "new",      // new = 최근 등장한 직무 / old = 기존 직무
  "name": "배터리 상태진단(BMS) 데이터 엔지니어", "en": "Battery Data / BMS Engineer", "sector": "s2",
  "role": "2~3문장. 무엇을 입력받아 무엇을 내놓는지.",     // ① 무슨 일
  "ksa": { "k": ["…"], "s": ["…"], "a": ["…"] },          // ② Knowledge·Skills·Abilities (각 2~4개)
  "companies": { "domestic": ["…"], "global": ["…"] },    // ③ 실제 운영·채용 기업
  "study": ["전기공학", "…"], "certs": ["전기기사", "…"],   // ④ 학과 / 자격 (없으면 "국가자격 없음(… )")
  "insight": "1~2문장. 이 직무를 한눈에 파악하는 핵심."     // ⑤
}
```

- 기사 하나에 `legacy` 1~2개, `new` 1~2개를 붙인다(둘 다 비면 직무 칸을 그리지 않는다).
- 같은 직무를 여러 기사가 참조해도 된다. 각 호 파일에는 **그 날 쓰인 직무만** 넣는다(같은 내용이 여러 파일에 중복 저장되는 것을 허용).
- `companies`는 그 직무가 실제로 있는 곳만. 확인되지 않은 기업은 넣지 않는다.

## 7. `sources` (출처·라이선스)

```jsonc
{ "id": "src_oecd_space2026", "name": "OECD", "title": "The Space Economy at a Glance 2026",
  "url": "https://doi.org/10.1787/cbf9b240-en",
  "license": { "type": "OECD", "name": "OECD 공개 보고서(사실·수치 인용, 원문 링크)", "verified": true },
  "published": "2026-09", "track": "A",
  "usage": "2025년 세계 우주 매출 5,500~6,000억 달러 …" }
```

| `license.type` | 뜻 | 트랙 |
|---|---|---|
| `KOGL-0` `KOGL-1` | 공공누리 자유이용·출처표시 | A |
| `PUBLIC-DOMAIN` | 퍼블릭 도메인(미국 연방정부 저작물 등) | A |
| `CC-BY-4.0` | CC BY 4.0 | A |
| `OECD` `WEF` `IAEA` | 공개 보고서 — 사실·수치만 인용, 원문 링크 | A |
| `PRESS` | 언론 기사 — 본문을 옮기지 않고 사실만 | B |

**쓰지 않는 것**: 라이선스가 확인되지 않은 상용 리서치 보고서, 언론 기사 본문, 유료 데이터베이스. 값이 없으면 그 항목을 통째로 생략한다.

## 8. 고지

`copyright_policy`(요약·트랙 설명·인용 한도·문의)와 `disclaimer`(투자·법률 조언 아님)를 화면 아래에 그대로 보여 준다.

## 9. 매일 한 호를 올리는 순서 (자동 업로드용)

1. 그 날의 기사를 **3~9건**에서 정한다(고정 아님). 날짜마다 건수가 다르게 나오는 것이 정상이다. 1차~4차에서 자료가 있는 만큼 담고, 하루를 하나의 테마로 묶지 않는다(같은 섹터가 3건을 넘어도 그날 뉴스가 몰린 결과면 그대로 둔다). order 1(앞기사)에는 가급적 도표를 붙인다.
2. 기사마다 `subtitle`(15~50자)을 쓴다. 그 날 테마 문구를 복사하지 않는다.
3. 기사마다 출처를 붙인다 — **재가공 허용 출처만**. 값이 확인되지 않으면 `market: null`.
4. 직무는 기존 1~2 + 최근 등장 1~2. 새 직무는 `jobs`에 5블록을 채워 넣는다.
5. `archive/YYYY-MM-DD.json`을 쓰고, `emerging.json`을 그 날 문서로 바꾼다.
6. `emerging.json`의 `archive_dates`·`archive_index` 끝에 그 날을 더한다.
7. 확인: `items` 3~9건 · `order` 1부터 빈틈없이 · `lead` 1건 · 모든 기사에 `subtitle` · 모든 `jobs`/`source_id`/`market.source_id`가 그 파일 안에 존재 · `edition.title`은 앞기사에서 온 이름표.
8. 배포 뒤 `/emerging/`이 그 날 지면을 열고, 달력에 그 날 점이 찍히는지, 기사 01→02로 넘길 때 제호 아래 부제가 바뀌는지 확인한다.

## 10. 화면이 기대하는 것

- 파일은 `emerging/data/` 아래 `emerging.json`, `archive/<date>.json` 경로에 둔다.
- 날짜는 **2026-11-01부터 연속**일 필요는 없지만, 달력에 점이 찍히려면 `archive_dates`에 있어야 한다.
- `edition.no`는 중복되지 않게.
- 한 파일이 100KB를 넘지 않게(현재 하루 평균 30KB).
- 제호 아래 한 줄(`#mDek`)은 **선택된 기사의 `subtitle`**을 그리고, 그 앞에 기사 번호(`01`~)를 붙인다. 오른쪽 `N개 기사 · 도표 M개`는 그 날 지면 요약으로 남는다. 그 줄의 높이는 고정(390px 두 줄·900px 한 줄)이라 기사를 바꿔도 아래 지면이 흔들리지 않는다. `subtitle`이 없으면 `title`로 대신하고, 둘 다 없으면 `edition.title`을 쓴다(전방 호환).
