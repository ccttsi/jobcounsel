# 자료 계약 — `work-filter/data/*.json`

화면(`/work-filter/app.js`)은 이 세 파일의 **없는 값을 지어내지 않는다**. 키 이름을 바꾸면 화면이 조용히 빈칸이 되므로,
`validate.py`가 아래 계약을 배포 전에 본다.

## `work-context.json` v1.0.0

```json
{
  "schema_version": "1.0.0",
  "dataset": "직업 현실 리얼 필터 — 근무환경 프로필(KSCO 세분류)",
  "generated_at": "YYYY-MM-DD",
  "notice": "…",
  "sources": [ { "id", "name", "publisher", "url", "file", "license": {…, "verified": true}, "base_date", "used_for" } ],
  "axes": [ { "id", "name", "left", "right", "question",
              "items": [ { "id", "name" } ],
              "formula": "…", "cuts": [33.3, 66.6] } ],
  "who_types": [ { "id", "name", "short", "desc", "items": [ { "id", "name" } ], "formula" } ],
  "who_rules": { "calculate", "pick", "alone", "mixed", "conflict", "stats", "contact_cut", "conflict_cut" },
  "method": { "chain", "aggregation", "scale", "missing", "bands", "not_invented" },
  "coverage": { "onet_occupations", "onet_occupations_linked", "ksco_sub_groups", "ksco_sub_groups_all_axes", … },
  "warnings": [],
  "jobs": [ { "id", "ksco", "name", "ksco_middle", "keco": [], "keco_name": [], "keco_middle": [],
              "isco": [], "profile": { "field": 0~100|null, …, "office": 0~100|null },
              "who": { "scores": { "customers", "care", "internal", "conflict" },
                       "contact": 0~100|null, "primary": "customers|care|internal|alone|mixed",
                       "conflict": true|false },
              "missing": ["shift"], "onet_n": 3, "onet_examples": [] } ]
}
```

- `axes`는 정확히 6개, `id`는 `field·people·team·screen·travel·shift`.
- `jobs[].profile`의 각 축은 **0~100 숫자 또는 null**. null이면 반드시 `missing`에 들어 있다.
- `jobs[].profile.office`는 축이 아니라 표시용(실내·환경통제 값)이다 — 필터에 쓰지 않는다.
- `cuts`는 `[하위 1/3 경계, 상위 1/3 경계]`. 화면의 「낮은 편·보통·높은 편」이 이 경계다.
- `who.scores`는 네 갈래 점수(0~100), `who.contact`는 타인 접촉. `who.primary`가 대표 갈래이고, `who.conflict`는 「민원·갈등 응대 잦음」 표시다. `who_types`의 `alone`은 접촉값으로만 정해지므로 점수 항목이 Contact With Others 하나다.
- `job.id` = `job.ksco`(KSCO 제8차 세분류 4자리). 화면 해시·연결의 기준.

## `clusters.json` v1.0.0

```json
{
  "schema_version": "1.0.0",
  "sources": [ … ],
  "method": { "region", "field", "caution" },
  "totals": { "companies", "companies_with_industry", "companies_with_address", … },
  "fields": [ { "id", "name", "total", "with_address",
                "regions": [ { "region": "경기도 화성시", "companies": 19 } ],
                "region_count", "examples": [ { "name", "industry", "region", "employees" } ],
                "ksic_names": [ { "name", "companies" } ] } ],
  "regions": [ { "region", "sido", "total", "fields": [ { "id", "name", "companies" } ] } ],
  "field_keywords": [ { "id", "name", "words": [], "job_words": [] } ],
  "unclassified_top": [ { "name", "companies" } ]
}
```

- `fields[].regions`는 **내림차순**이고 `companies` 합계가 `with_address`를 넘지 않는다.
- `regions`는 기업 **5곳 이상**인 시군구만 싣는다.
- `regions[].total`은 그 지역 기업 전체 수, `fields`는 상위 6개 분야만.

## `job-fields.json` v1.0.0

```json
{
  "schema_version": "1.0.0",
  "notice": "…",
  "links": { "2223": [ { "field": "it-software", "basis": "소프트웨어" } ] },
  "coverage": { "jobs": 489, "jobs_with_field": 334 }
}
```

- `links`의 키는 `work-context.json`의 `jobs[].id`.
- `field`는 `clusters.json`의 `fields[].id`에 있어야 한다.
- `basis`는 **그 직무 이름에 실제로 들어 있는 낱말**이어야 한다(검사기가 확인).
- 직무당 최대 2개.
