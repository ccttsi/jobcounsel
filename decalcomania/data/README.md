# 커리어데칼코마니 — 학과·직업·관계 데이터셋 v1.0.0

커리어데칼코마니(Career Decalcomania)에서 쓰기 위해 **공공데이터·공공저작물·정부 고시 자료만으로** 만든
학과(`majors.json`) · 직업(`jobs.json`) · 관계(`edges.json`) 3종 데이터셋입니다.
진학사·메가스터디 같은 민간 사이트의 본문은 전혀 쓰지 않았습니다.

- 만든 날: 2026-11-14
- 언어: 한국어(UTF-8, BOM 없음)
- 파일 3개의 합계: 12.2 MB (gzip 압축 시 1.8 MB)

| 파일 | 크기 | gzip | 레코드 |
|---|---|---|---|
| `majors.json` | 6.08 MB | 0.89 MB | 학과 501 · 대학 412 · 학과개설 24,528 |
| `jobs.json` | 4.98 MB | 0.87 MB | 직업 552 · 직업분류 10/35/140/495 |
| `edges.json` | 1.12 MB | 0.04 MB | 관계 6,769 |

> 클로드에 올릴 때는 3개 파일을 그대로 올리면 됩니다. 한 파일이 8 MB를 넘지 않고, 합계도 12 MB라
> 프로젝트 파일로 넣기에 무리 없습니다. 웹에서 쓸 때는 gzip/브로틀리로 내려보내면 1.8 MB 수준입니다.
> `edges.json`은 줄바꿈 없이 저장했고, `majors.json`·`jobs.json`도 레코드 단위로만 나눠 두어
> 통째로 `json.load()` 하면 바로 파이썬 객체가 됩니다.

---

## 1. 아이디 체계

| 접두사 | 뜻 | 정의된 파일 |
|---|---|---|
| `D-<번호>` | 표준 학과 (커리어넷 학과정보의 seq) | `majors.json` → `majors[].id` |
| `J-<번호>` | 직업 (커리어넷 직업백과의 job_cd) | `jobs.json` → `jobs[].id` |
| `JG-<0~9>` | 한국고용직업분류 대분류 묶음 | `jobs.json` → `classifications.job_class_group` |
| `U0001`~ | 대학 | `majors.json` → `universities[].id` |
| `DP00001`~ | 대학별 학과 개설 레코드 | `majors.json` → `departments[]` |

세 파일은 **서로의 아이디로만 연결**됩니다. `edges.json`의 `from`은 항상 `D-…`, `to`는 `J-…`(또는 `JG-…`)입니다.
`edges.json` 6,769건 전부가 실제 존재하는 아이디를 가리키는 것을 검증했습니다(끊어진 참조 0건).

---

## 2. `majors.json` 스키마

```
meta                     데이터셋 정보·레코드 수
sources[]                출처 6종(이름·발행처·URL·라이선스·기준일)
field_notes              필드 설명
department_columns[]     departments[] 배열의 컬럼 이름(순서 고정)
department_column_notes  컬럼별 설명
classifications
  ├ major_category[]     7계열(커리어넷) + 학과 수
  ├ school_type[]        대학교(4년제) / 전문대학(2·3년제)
  └ standard_class_3level[]  대학알리미 표준분류 대계열(5) > 중계열(35) > 소계열(187)
universities[]           {id, name, kind, campus, region, school_type}
departments[]            배열 13칸 (아래 표)
majors[]                 학과 501건
```

### `departments[]` — 13칸 배열 (컬럼 순서 고정)

| 칸 | 필드 | 설명 |
|---|---|---|
| 0 | department_id | `DP00001` |
| 1 | university_id | `universities[].id` |
| 2 | college | 단과대학명 (대학알리미) |
| 3 | department_name | 학과·학부(전공)명 |
| 4 | standard_class_major | 표준분류 대계열 (예: 인문사회계열) |
| 5 | standard_class_middle | 표준분류 중계열 (예: 인문학) |
| 6 | standard_class_minor | 표준분류 소계열 (예: 국어국문학) |
| 7 | degree | 학사 / 전문학사 |
| 8 | duration | 수업연한 (4년, 2년, 2.5년 …) |
| 9 | shift | 주간 / 야간 / 원격 / 계절제 |
| 10 | major_id | 연결된 표준학과 `D-…` (없으면 null) |
| 11 | source | `academyinfo`(대학알리미 2024 공시) / `career`(커리어넷 2025 학과안내) |
| 12 | closed_in_2024_disclosure | true면 대학알리미 2024 공시에서 폐지로 표시된 학과명과 일치 |

읽는 예:

```python
import json
M = json.load(open("majors.json", encoding="utf-8"))
cols = M["department_columns"]
depts = [dict(zip(cols, row)) for row in M["departments"]]
```

### `majors[]` — 학과 1건

```jsonc
{
  "id": "D-10",
  "name": "간호학과",
  "school_type": "대학교(4년제)",      // 대학교(4년제) | 전문대학(2·3년제)
  "category": "의약계열",              // 커리어넷 7계열
  "summary": "…",                      // 학과개요
  "characteristics": "…",              // 학과특성
  "aptitude_note": "…",                // 적성·흥미
  "courses": [{"name": "…", "description": "…"}],        // 대학 주요 교과목
  "career_fields": [{"name": "…", "description": "…"}],  // 졸업 후 진출분야
  "related_job_names": ["간호사", "…"],                  // 커리어넷이 적은 관련 직업명(전체)
  "related_job_ids": ["J-354"],                          // 그중 이 데이터셋에 실제 있는 직업
  "certificates": ["간호사면허", "보건교사", "보육교사"],  // 관련 자격
  "required_licenses": ["간호사"],                       // 그중 법정 면허
  "stats": {
    "employment_rate": {"total": 81.2, "male": 81.7, "female": 81.2, "year": 2023, "source": "한국교육개발원 취업통계"},
    "advancement_rate": {"total": …, "year": 2023, …},
    "applicants": 12345, "entrants": 678, "entrance_year": 2025, "competition_ratio": 18.2,
    "entrant_gender_pct": {"남자": 20.1, "여자": 79.9},
    "first_job_fields": [{"field": "보건·의료직", "pct": 93.5}],   // 대졸자 경로조사 2020
    "first_job_salary_pct": [{"range": "201~250만원", "pct": 41.2}], // 첫 직장 월평균 임금 분포
    "first_job_satisfaction_pct": [{"level": "만족", "pct": 39.9}]
  },
  "keyword": "…",
  "department_count": 125,        // 이 학과가 개설된 대학·학과 레코드 수
  "department_count_open": 122,   // 그중 2024 공시 폐지 표시가 없는 수
  "source": "커리어넷 학과정보",
  "source_url": "https://www.career.go.kr/cloud/w/major/uView?seq=10",
  "year": 2025,
  "updated": "2023-05-11"
}
```

---

## 3. `jobs.json` 스키마

```
meta, sources, field_notes
classifications
  ├ keco_2025[]          한국고용직업분류 2025 트리 (대분류 10 > 중분류 35 > 소분류 140 > 세분류 495)
  ├ ksic_sections[]      한국표준산업분류 대분류 21개 코드·명칭
  ├ job_group_43[]       커리어넷 직업군 43개 + 직업 수
  └ job_class_group[]    JG-0~JG-9 (KECO 대분류) + 직업 수
license_basis            법정 면허 31종 + 근거 법령
industry_mapping_note    산업·기업 예시는 공식 연계표가 아니라는 경고문
jobs[]                   552건
```

### `jobs[]` — 직업 1건

```jsonc
{
  "id": "J-354",
  "name": "간호사",
  "job_code": "354",
  "group": "보건의료 관련 서비스직",     // 커리어넷 43직업군
  "tags": ["보건", "의료"],
  "keco": {"class_code": "3", "class_name": "보건·의료직",
           "middle_code": "30", "middle_name": "보건·의료직",
           "small_code": "301", "small_name": "…",
           "detail_code": "3011", "detail_name": "…"},
  "ksco": {"detail_code": "2430", "detail_name": "…", "small_code": "243", "small_name": "…"},
  "works": ["…"],                        // 하는 일
  "abilities": [{"name": "수리·논리력", "code": "07"}],
  "aptitude": ["…"], "interest": ["…"], "activities": ["…"],
  "certificates": [{"name": "간호사", "url": "…"}],
  "required_licenses": ["간호사"],       // 직업명 자체가 면허직일 때만
  "license_required": true,
  "related_license_names": ["간호사"],   // 자격 목록에서 뽑은 법정 면허(참고)
  "curriculum": ["…"], "training": ["…"], "employment": ["…"], "outlook": ["…"],
  "salary_10k_krw": 5000,               // 관련 직업 평균연봉 중앙값(만원)
  "salary_basis": "…(자료 : 워크피디아, 2023)",
  "satisfaction_pct": 72.5, "satisfaction_basis": "…",
  "related_job_names": ["…"],
  "major_distribution": [{"category": "의약계열", "pct": 88.0}],   // 종사자 전공계열 분포
  "education_distribution": [{"level": "대졸", "pct": 60.0}],
  "indicators": [{"name": "융합성", "score": 97.0}],  // 직업지표 7종 0~100
  "work_values": [{"name": "창의력", "importance": 100, "description": "…"}],
  "knowledge": […], "environment": […],
  "gender_ratio": {"male": 12.0, "female": 88.0},
  "related_majors": ["D-10"],           // 커리어넷이 적은 관련 학과
  "related_orgs": [{"name": "…", "url": "…"}],
  "industry": [{"ksic_section": "Q", "name": "보건업 및 사회복지 서비스업"}],
  "industry_note": "KECO 중분류(30) 기준 대응표로 산출한 참고 정보",
  "example_companies": ["삼성서울병원", "…"],  // 업종 대표기업 예시(참고용)
  "source": "커리어넷 직업백과",
  "source_url": "https://www.career.go.kr/cloud/w/job/view?seq=354",
  "year": 2025,
  "updated": "2025-12-08"
}
```

---

## 4. `edges.json` 스키마

```jsonc
{ "from": "D-10", "to": "J-354", "relation": "면허필수",
  "source": "커리어넷 학과정보·직업백과", "year": 2025,
  "note": "법정 면허 필요: 간호사" }

{ "from": "D-7", "to": "JG-0", "relation": "진출통계",
  "source": "한국고용정보원 대졸자 직업이동 경로조사", "year": 2020,
  "weight": 44.8, "note": "졸업 후 첫 직업분야 비중 44.8%" }
```

### 관계 5종

| relation | 건수 | 뜻 | 판정 근거 |
|---|---|---|---|
| `관련전공` | 1,843 | 커리어넷이 서로 관련 있다고 안내 | 학과의 「관련 직업」 또는 직업의 「관련 학과」 |
| `전공우대` | 1,136 | 그 직업 종사자의 해당 계열 비중 ≥ 70% | 직업의 전공계열 분포(워크피디아) |
| `전공무관` | 26 | 계열 분포 최대값 < 40%, 특정 전공 의존도 낮음 | 같은 분포 |
| `면허필수` | 114 | 그 직업은 법정 면허직이고, 그 학과가 그 면허 취득 경로 | 직업명 ↔ 법정 면허 31종 + 학과 관련 자격 |
| `진출통계` | 3,650 | 그 학과 졸업생이 실제로 진출한 첫 직업분야 비중 | 대졸자 직업이동 경로조사(2020) |

- `관련전공`·`전공우대`·`전공무관`·`면허필수`의 `to`는 `J-…`, `진출통계`의 `to`는 `JG-…`입니다.
- 학과 쪽에서 온 안내와 직업 쪽에서 온 안내가 겹치면 `note`에 `양방향 확인`을 붙였습니다.
- 한 쌍에 대해 위 표의 순서(면허필수 → 전공무관 → 전공우대 → 관련전공)로 하나만 남깁니다.

---

## 5. 정확한 레코드 수

**학과 (`majors.json`)**
- 표준 학과 501 (대학교 4년제 304 / 전문대학 2·3년제 197)
- 계열: 공학 114 · 예체능 102 · 사회 89 · 자연 65 · 인문 54 · 교육 41 · 의약 36
- 대학 412곳 (대학 232 / 전문대학 166 / 구분 미상 14)
- 대학별 학과 개설 레코드 24,528 (대학알리미 2024 공시 15,322 + 커리어넷 2025 9,206)
  - 표준학과와 연결된 레코드 21,375, 폐지 표시 5,729
- 표준분류 체계: 대계열 5 · 중계열 35 · 소계열 187

**직업 (`jobs.json`)**
- 직업 552 (그중 517건이 KECO 경로 보유, 35건은 KECO 코드 없음)
- 한국고용직업분류 2025: 대분류 10 · 중분류 35 · 소분류 140 · 세분류 495
- 커리어넷 직업군 43
- 법정 면허직 34건 / 산업(KSIC 대분류) 정보 517건 / 대표기업 예시 398건

**관계 (`edges.json`)**
- 총 6,769 = 관련전공 1,843 + 전공우대 1,136 + 전공무관 26 + 면허필수 114 + 진출통계 3,650

---

## 6. 출처와 라이선스

| 출처 | 발행처 | 쓰인 곳 | 라이선스 | 기준 |
|---|---|---|---|---|
| 커리어넷 학과정보 | 한국직업능력연구원(국가진로교육연구센터) | 학과 501 | 공공누리 제1유형(출처표시) — 공공데이터포털 「한국직업능력연구원_커리어넷」 이용허락범위 | 텍스트 2023, 통계 2023~2025 |
| 커리어넷 직업백과 | 한국직업능력연구원 | 직업 552 | 공공누리 제1유형(출처표시) | 2025 |
| 대학알리미 학교별 학부·과(전공) 리스트 | 교육부·한국대학교육협의회 | 대학·학과 개설 15,322 | **이용허락범위 제한 없음** | 2024-10-07 |
| 한국고용직업분류 2025 항목표 | 고용노동부(고시 제2024-63호) | 직업분류 트리 | 공공저작물(정부 고시) | 2024-12-12 |
| 교육통계·취업통계 | 한국교육개발원 | 취업률·진학률·입학 | 공공데이터 | 2023·2025 |
| 대졸자 직업이동 경로조사 | 한국고용정보원 | 첫 직업분야·임금 분포 | 공공데이터 | 2020 |
| 워크피디아 | 한국고용정보원 | 연봉·직업지표·전공분포 | 공공데이터 | 2020~2024 |

재배포할 때는 위 출처를 밝히면 됩니다. 참고: JSON 파일 안 `sources[]`의 커리어넷 발행처가 "한국고용정보원"으로 적혀 있으나, 커리어넷 운영 기관은 한국직업능력연구원입니다(데이터 파일은 고치지 않고 이 문서와 화면 표기를 바로잡았습니다). 원문을 그대로 복제한 것이 아니라 필드를 정리·가공했고,
민간 유료 사이트(진학사·메가스터디 등)의 본문은 쓰지 않았습니다.

---

## 7. 만든 방법

1. **대학알리미** — 공공데이터포털 「교육부_대학알리미_학교별 학부·과(전공) 리스트」(15139338)가
   안내하는 원본 XLSX(55,228행)를 내려받아, 학위과정이 학사·전문학사이고 학과상태가 폐지가 아닌
   행만 남겼습니다(15,322행). 단과대학명·표준분류 대/중/소계열·수업연한·주야간이 여기서 나옵니다.
2. **커리어넷** — 학과 목록 API(`/cloud/api/major/uSearch`)로 501개 표준학과를 받고,
   학과 상세 API(`/cloud/api/major/uView`)로 개요·특성·교과목·진출분야·관련직업·관련자격·
   취업통계·개설대학을 받았습니다. 직업도 같은 방식(`/cloud/api/job/search`, `/api/job/view`)으로
   552건을 받았습니다.
3. **연결** — 커리어넷의 학교·학과 표기(2025)와 대학알리미의 표기(2024)를 `(학교명, 학과명)`으로
   맞춰 12,261건을 잇고, 맞지 않는 9,206건은 `source: "career"`로 따로 남겼습니다.
4. **분류** — 고용노동부 고시 XLSX에서 대/중/소/세분류 495개 이름을 읽어 직업의 KECO 코드에 붙였습니다.
5. **관계** — 4장의 판정 규칙대로 산출하고, 끊어진 참조·중복 아이디·`source`/`year` 누락을 검사했습니다.

---

## 8. 한계 (상담에 쓸 때 꼭 알아둘 것)

1. **학과 텍스트는 2023년 갱신분**입니다. 커리어넷 학과 서술이 2023년 이후 바뀌지 않은 경우가 많아
   최신 교육과정과 다를 수 있습니다. 교과목·특성은 참고용으로 쓰세요.
2. **대학별 학과 목록의 기준일이 다릅니다.** 대학알리미는 2024-10-07, 커리어넷은 2025-11-12 갱신입니다.
   그래서 커리어넷에만 있는 9,206건 중 5,729건은 2024 공시에서 폐지로 표시된 학과명과 일치합니다
   (`closed_in_2024_disclosure: true`). **실제 모집 여부는 지원 전에 그 대학 입학처에서 확인해야 합니다.**
3. **표준분류가 두 체계입니다.** 학과의 `category`는 커리어넷 7계열, `departments[].standard_class_*`는
   대학알리미 5대계열 체계입니다. 이름이 비슷해도 분류 기준이 다르니 섞어 쓰지 마세요.
4. **직업 552개는 한국고용직업분류 495개 세분류 전체가 아닙니다.** 커리어넷이 소개하는 대표 직업만
   담겨 있어, 세분류 495개 중 296개에만 대응 직업이 있습니다. 없는 직업은 `JG-…` 묶음으로만 닿습니다.
5. **학과↔직업 연결이 빈 곳이 있습니다.** 관련 직업이 하나도 없는 학과 48개, 관련 학과가 하나도 없는
   직업 66개(주로 신생·융합 직업), 개설 대학이 확인되지 않은 학과 2개(유럽·기타어과, 보석감정과)입니다.
6. **`industry`와 `example_companies`는 공식 연계 데이터가 아닙니다.** KECO 중분류 34개에 대해 이
   데이터셋이 만든 KSIC 대분류 대응표로 계산했고, 기업 예시는 그 업종을 대표하는 상장기업을 참고로 든
   것입니다. 인사·노무 판단이나 취업 알선의 근거로 쓰지 말고, 필요하면 최신 사업보고서로 확인하세요.
7. **임금·만족도·전공분포는 관련 직업(모직업) 기준입니다.** 예를 들어 '지능형 로봇개발자'의 연봉은
   워크피디아의 '로봇공학기술자' 값을 빌려 온 것이고, `salary_basis`에 그 사실이 적혀 있습니다.
8. **`면허필수` 판정은 직업명 기준입니다.** 직업명이 면허직 자체일 때(간호사, 변호사, 건축사…)만
   인정했고, 자격 목록에 면허가 섞여 있는 경우는 `related_license_names`로만 남겼습니다.

---

## 9. 바로 쓰는 예

```python
import json
M = json.load(open("majors.json", encoding="utf-8"))
J = json.load(open("jobs.json", encoding="utf-8"))
E = json.load(open("edges.json", encoding="utf-8"))

majors = {m["id"]: m for m in M["majors"]}
jobs   = {j["id"]: j for j in J["jobs"]}

# 1) 학과 → 직업 (관계 강도 순)
order = {"면허필수": 0, "전공우대": 1, "관련전공": 2, "전공무관": 3}
for e in sorted([e for e in E["edges"] if e["from"] == "D-10" and e["to"].startswith("J-")],
                key=lambda e: order[e["relation"]]):
    print(e["relation"], jobs[e["to"]]["name"], e.get("note", ""))

# 2) 직업 → 학과
for e in [e for e in E["edges"] if e["to"] == "J-354"]:
    print(majors[e["from"]]["name"], e["relation"])

# 3) 대학별 학과 (특정 대학)
cols = M["department_columns"]
for row in M["departments"]:
    d = dict(zip(cols, row))
    if d["university_id"] == "U0123":
        print(d["college"], d["department_name"], d["standard_class_major"])

# 4) 진출통계가 높은 학과 찾기
for e in E["edges"]:
    if e["relation"] == "진출통계" and e["weight"] >= 60:
        print(majors[e["from"]]["name"], "→", e["to"], e["weight"], "%")
```

---

## 10. 다시 만들려면

`work-cd/build.py`가 원본 JSON(`work-cd/raw/`)을 읽어 세 파일을 다시 씁니다.

```
python3 work-cd/fetch.py list major     # 학과 목록 501
python3 work-cd/fetch.py list job       # 직업 목록 552
python3 work-cd/fetch.py detail major   # 학과 상세
python3 work-cd/fetch.py detail job     # 직업 상세
python3 work-cd/build.py               # 3개 JSON 산출
```

원본 파일: `work-cd/raw/major_detail/*.json` (501), `work-cd/raw/job_detail/*.json` (552),
`work-cd/raw/dep.xlsx` (대학알리미 2024 XLSX), `work-cd/raw/keco2025.xlsx` (고용노동부 고시 항목표).
