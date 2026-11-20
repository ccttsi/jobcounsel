# SCHEMA.md — 산업별 공정·밸류체인 지도 데이터 계약

- 파일: `valuechain/data/industries.json` (UTF-8, JSON, 약 70KB)
- 산출: `python3 valuechain/data/build_industries.py` — `--check`는 쓰지 않고 대조만 한다
- 화면: `valuechain/app.js` (읽기 전용)
- 스키마 버전: `meta.schema_version = "1.0"`

## 0. 이 데이터로 무엇을 하는가

산업 하나를 고르면 **그 산업이 값을 만드는 순서(단계)** 가 눈금으로 서고, 단계를 고르면
① 핵심 하는 일 ② 상담 팁 ③ 투입 직무(NCS 세분류) ④ 그 단계에 있는 기업(명함첩)이 한 장에 펼쳐진다.

> 단계(공정)는 산업별로 통용되는 공정 순서를 우리 말로 정리한 것이다. **어떤 기관의 분류표도 옮기지 않았다.**
> 기업·직무·연계 주소는 아래 원본에 **이름이 정확히 있는 것만** 쓴다. 하나라도 없으면 생성기가 멈춘다(지어낸 값 0).

## 1. 최상위

```json
{
  "meta":     { "schema_version", "dataset", "sector", "generated_at", "notice", "counts", "basis", "links" },
  "sources":  [ { "id", "name", "url", "as_of", "license", "used_for" } ],
  "industries": [ 산업 … ],
  "companies": { "<company id>": { "name", "cat", "ind", "emp", "rev" } }
}
```

- `companies`는 **이 파일이 실제로 참조한 기업만** 담는다(명함첩 전체를 복제하지 않는다). 값은 `company/data/companies.json` 원자료 그대로다.
- `meta.links`는 화면이 쓰는 주소 틀이다(`../company/#{id}` · `../taxonomy/?q={q}` · `../thermometer/?i={id}` · `../work-filter/?q={q}` · `../translator/?q={q}`).

## 2. 산업 (`industries[]`)

```json
{ "id": "semicon", "no": "01", "name": "반도체", "short": "반도체", "en": "Semiconductor",
  "tagline": "한 줄 소개", "structure": "산업의 층 구조 한 줄",
  "thermo":  [ { "id": "semicon", "name": "반도체" } ],
  "wfq": "반도체공학 기술자 및 연구원",
  "terms":   [ { "w": "수율", "term": "수율" } ],
  "roles":   [ { "role": "팹리스 · 설계", "comps": ["<company id>"] } ],
  "steps":   [ 단계 … ] }
```

| 필드 | 뜻 | 대조하는 원본 |
|---|---|---|
| `thermo[]` | 이 산업을 재는 산업 온도계의 산업 id와 이름 | `thermometer/data/industries.json` |
| `wfq` | 근무환경 필터로 넘길 직무 이름(KSCO 세분류) | `work-filter/data/work-context.json` |
| `terms[]` | 용어 번역기로 넘길 표제어(`w`는 화면 이름, `term`은 사전 표제어) | `translator/data/terms.json` |
| `roles[]` | 산업의 층 구조(반도체의 팹리스·파운드리·IDM·OSAT·소부장). 없으면 빈 배열 | `company/data/companies.json` |

## 3. 단계 (`steps[]`)

```json
{ "no": 1, "name": "웨이퍼 제조",
  "what": "핵심 하는 일 2문장",
  "jobs": ["반도체재료", "재료시험"],
  "comps": ["ENT-…"],
  "tip": "상담 팁 1문장" }
```

- `no`는 산업 안에서 1부터 연속이다(화면의 `?s=`가 이 값).
- `jobs[]`는 **NCS 세분류 이름**(`taxonomy/data/taxonomy.json`의 `ncs.levels.sub[].name`). 화면은 `../taxonomy/?q=<이름>`으로 연다.
- `comps[]`는 명함첩 기업 id. 화면은 `../company/#<id>`로 연다. **없는 단계는 빈 배열**이며, 화면은 「명함첩에 수록된 기업이 없는 단계」라고 적는다(빈 상자·지어낸 기업 금지).

## 4. 고칠 때

1. 내용은 `build_industries.py`의 `IND` 목록에서 고친다(JSON을 손으로 고치지 않는다 — 다음 생성에서 덮인다).
2. `python3 valuechain/data/build_industries.py` → 대조 실패 메시지가 나오면 **이름을 원본에서 찾아 고친다**. 원본에 없으면 그 기업·직무·용어는 이 화면에 싣지 않는다.
3. `python3 assistant/build_index.py`(비서 색인) 와 `python3 ops/scripts/build_flow_graph.py`(시너지 지도)는 산업·단계가 바뀌면 함께 다시 만든다.
