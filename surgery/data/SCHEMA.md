# SCHEMA.md — 22번 서류·공고 해부실 데이터 계약

이 문서는 `surgery/data/`의 두 JSON을 화면(`/surgery/`)으로 구현하는 클로드 코드가 읽는 **계약서**다.
데이터는 피클(설계·검증)이 만들고, 화면 코드는 클로드가 쓴다(`ops/ROLES.md`).

- 파일: `surgery/data/anatomy.json` (공개) · `surgery/data/lexicon.json` (**비노출 내부 엔진**)
- 배포 주소: `https://witw.pages.dev/surgery/data/anatomy.json`
- 스키마 버전: `meta.version = "1.0.0"` (2026-11-16)
- 검증: `python3 surgery/data/validate.py` → **오류 0건** 통과본만 배포한다.
- 실측: 공고 문구 **28종** · 탈락 문장 **22종** · 상황별 이력서 **6종** · 내부 키워드 **225개**(45묶음) · 톤 **4종** × 용도 2 × 문형 3 = **24문형**

---

## 0. 이 데이터로 무엇을 하는가

자소서·이력서·채용공고를 **해부해서 보여 주는** 도구다. 대신 써 주는 도구가 아니다.
사용자가 자기 재료(공고 문구·자기 문장·자기 상황·자기 단어)를 넣으면, 데이터는 **어디가 문제이고 무엇으로 바꿔야 하는지**를 구조로 돌려준다.

| 모듈 | 사용자가 넣는 것 | 데이터가 돌려주는 것 |
|---|---|---|
| ① 채용공고 해부학 (메스) | 공고에서 걸린 표현 1개 | `hidden_intent` · `counter_scalpel`(어필·역공 질문·확인 항목) · `signal_type` |
| ② 탈락 문장 X-선 | 내 자소서 문장 1개 | `xray_diagnosis`(감점 원인) · `rule` · `after_star`(CAR/STAR 재작성 예시) |
| ③ 상황별 이력서 재배치 | 내 상황 1개 | `recommended_format` · `section_order`(재배치 순서) · `defense_scripts` |
| ④ 문장 수술실 | 단어 1개~몇 개 | 톤앤매너별 문장 **2~4개** (내부 `lexicon.json` 조립) |

> 학습·실습용 참고 자료다. **합격을 보장하지 않는다.** 모든 문장 예시는 자료실이 직접 만든 구조이며, `[숫자]`·`[기간]` 자리는 사용자가 자기 사실로 채워야 완성된다.

---

## 1. `anatomy.json` 최상위 구조

```json
{
  "meta":        { "dataset", "version", "sector", "sector_no", "path", "built_at", "repository",
                   "license", "notice", "counts", "verification" },
  "modules":     [ { "id", "no", "name", "one_line", "input", "output", "data"? } ],
  "field_guide": { "hidden_intent", "counter_scalpel.*", "signal_type" },
  "vocabularies":{ "clusters", "signal_types", "xray_themes", "resume_formats", "resume_sections" },
  "jd_anatomy":     [ … 28 ],
  "xray_cases":     [ … 22 ],
  "resume_layouts": [ … 6 ]
}
```

### 1-1. 신호등 (`signal_type`)

| 코드 | 이름 | 화면 표기 | 뜻 |
|---|---|---|---|
| `green` | 뚫을 신호 | 초록 | 문구가 사실이면 지원자에게 유리한 조건. 그대로 어필하되 근거를 붙인다. |
| `yellow` | 확인 필요 | 노랑 | 좋게도 나쁘게도 읽힌다. 질문 한 줄로 조건을 확인한 뒤 판단한다. |
| `red` | 레드플래그 | 빨강 | 지원 전에 초과근무·처우·업무범위를 먼저 확인해야 한다. |

`signal_type`은 **문구 자체의 성질**이지 회사의 성격이 아니다. 화면은 "이 회사는 위험하다"처럼 단정하지 않고 "이 문구는 이렇게 읽힌다"까지만 말한다.

### 1-2. 공고 문구 범주 (`cluster`) — 6종 고정

`competency_hype`(역량 과장·상투어) · `conditions`(근무조건·보상) · `culture`(조직문화·관계) · `qualification`(경력·자격·대상) · `growth`(성장·비전·조직 상태) · `scope`(업무범위·직무 정의)

---

## 2. ① `jd_anatomy` — 채용공고 해부학 (28종)

| 필드 | 형 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✔ | `jd00` 형식. 화면 해시(`#jd01`)와 필터 키. **바꾸지 않는다** |
| `phrase` | string | ✔ | 공고에 흔한 표현. 특정 회사의 문장을 옮긴 것이 아니라 **업계 공통 상투어**를 자료실이 정리한 것 |
| `cluster` | string | ✔ | 위 6범주 중 하나 |
| `signal_type` | string | ✔ | `green`·`yellow`·`red` |
| `hidden_intent` | string | ✔ | 현업·인사팀이 그 문구로 실제로 말하려는 것. 40~240자, 단정 대신 "~일 수 있다" |
| `counter_scalpel.appeal` | string | ✔ | 자소서·면접에서 무엇을 보여 줄지(행동·수치로) |
| `counter_scalpel.question` | string | ✔ | 지원자가 그 자리에 물어볼 역공 질문. 공격이 아니라 **조건 확인** 형태 |
| `counter_scalpel.verify` | string | ✔ | 전화·면접·현직자에게 확인할 항목 |

**화면 규칙**

- 문구를 먼저 보여 주고, **절개(펼침)** 하면 숨은 의도 → 어필 포인트 → 질문 순으로 한 겹씩 나온다. 세 겹을 한 번에 펼치지 않는다(초면 텍스트 예산 §1-3).
- `appeal`은 "이렇게 쓰세요"가 아니라 "이 재료로 무엇을 보여 줄 수 있는지"로 읽히게 쓴다.
- 질문은 **복사해 갈 수 있는 형태**로 보여 주되 복사 버튼은 만들지 않는다(내보내기 금지).
- 28종을 6범주 × 신호등으로 교차 필터한다. 범주 칩은 6개, 신호등은 3개다.

---

## 3. ② `xray_cases` — 탈락 문장 X-선 & 직무 번역 (22종)

| 필드 | 형 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✔ | `xr00` 형식 |
| `theme` | string | ✔ | `vocabularies.xray_themes` 값(지원동기·단점·경력 공백 등 22개) |
| `before` | string | ✔ | 흔한 추상·감점 문장. **자료실이 직접 쓴 예시**이며 실제 지원자 문장이 아니다 |
| `xray_diagnosis` | string | ✔ | 인사담당자가 감점하는 이유. "무엇이 보이지 않는가"를 짚는다 |
| `rule` | string | ✔ | 교정 원칙 한 줄 |
| `after_star` | string | ✔ | CAR/STAR·수치 기반 재작성 **예시 한 문단**. `[숫자]`·`[기간]` 자리 포함 |
| `star` | object | ✔ | `S`(상황) `T`(과제) `A`(행동) `R`(결과) 네 줄 — 사용자가 자기 재료를 넣는 틀 |
| `metric_hint` | string | ✔ | 이 테마에서 특히 넣어야 할 숫자 유형 |

**화면 규칙**

- `before`는 **투과(X-선)** 되고, 그 위에 `xray_diagnosis`가 겹쳐 보이는 구조로 만든다. `before`와 `after_star`를 위아래로 나란히 두면 "전/후"가 한눈에 읽힌다.
- `after_star`는 **예시**다. 화면 어디에서도 "이대로 제출"이라고 쓰지 않는다. `[숫자]`·`[기간]`은 입력칸이나 강조 표시로 남긴다.
- STAR 네 줄은 사용자가 자기 말로 바꿔 넣는 빈칸으로 보여 준다. 화면이 임의로 채우지 않는다.
- `before`를 사용자가 직접 입력한 문장과 **같은 것으로 취급하지 않는다.** (사용자 입력은 화면이 받아 `xray_diagnosis` 규칙과 대조하는 별도 동작)

---

## 4. ③ `resume_layouts` — 상황별 이력서 재배치 (6종)

| 필드 | 형 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✔ | `lay_이름` 형식 |
| `situation` | string | ✔ | 상황 이름(공백기 1년+·비전공 직무전환·경력단절·단기 알바·스펙 공백 신입·중장년 재취업) |
| `keyword_examples` | string[] | – | 사용자가 실제로 쓸 법한 말(검색·선택 보조) |
| `recommended_format` | string | ✔ | `chronological`(연대기형) · `functional`(기능형) · `hybrid`(혼합형) |
| `format_reason` | string | ✔ | 왜 그 포맷인지 |
| `section_order` | string[] | ✔ | 4~8개. **`vocabularies.resume_sections` 값만** 쓴다. 앞에서부터 위→아래 순서 |
| `order_reason` | string | ✔ | 왜 그 순서인지 |
| `defense_scripts` | object[] | ✔ | 2~3종. `question` · `formula` · `example` |
| `cautions` | string | ✔ | 이 상황에서 흔히 하는 실수 |

**섹션 어휘(10종 고정)** — `프로필(한 줄 요약)` · `핵심 역량` · `경력` · `프로젝트·성과` · `교육·훈련` · `자격·어학` · `병역` · `봉사·대외활동` · `공백기 해명` · `지원 동기·포부`

**화면 규칙**

- 상황을 고르면 섹션 블록이 **위→아래로 재배치**된다. 이때 위치는 `transform`(translate)로만 움직이고 레이아웃은 즉시 바뀐다(`DESIGN.md` §2: height·top·grid 보간 금지 → FLIP 방식).
- 재배치 후 **왜 이 순서인지**(`order_reason`)를 한 줄로 붙인다. 이유 없는 애니메이션은 장식이다.
- `defense_scripts`는 **질문 → 공식 → 예시** 순으로 펼친다. 예시는 사용자 사실로 바꿔야 함을 표시한다.
- 6개 상황은 동시에 보여 주지 않는다. 한 화면에 선택 → 결과 한 벌.

---

## 5. ④ `lexicon.json` — 비노출 내부 키워드 매핑 DB

**이 파일은 화면에 노출하지 않는다.** 메뉴·목록·검색 결과·설정 어디에도 키워드 목록이나 매핑 표를 펼치지 않는다.
화면은 이 파일을 **읽어서 조립한 문장만** 보여 준다. `exposure.visible = false`, `exposure.export_forbidden = true`가 계약이다.

### 5-1. 구조

```json
{
  "meta":       { … "counts": { "entries": 45, "trigger_keywords": 225, "tone_frames": 4, "templates": 24 } },
  "exposure":   { "visible": false, "ui_rule", "export_forbidden": true, "why" },
  "categories": [ { "code", "name", "desc", "category_hints": [], "fallback": { … } } ],
  "entries":    [ { "id", "category", "context", "trigger_keywords", "core_competencies",
                    "action_verbs", "metric_prompts", "evidence_patterns" } ],
  "tone_frames":[ { "id", "name", "mood", "best_for", "purposes": { "resume_line": [3], "cover_para": [3] } } ],
  "assembly":   { "input", "output_contract", "steps", "suffix_strip", "slots",
                  "number_placeholders", "fallback", "blend_rule", "performance" },
  "quality_rules": [ … ]
}
```

### 5-2. `entries` — 45묶음 · 키워드 225개

| 필드 | 설명 | 예 |
|---|---|---|
| `id` | `범주_이름` | `svc_convenience` |
| `category` | 5범주 중 하나 | `service` |
| `context` | 문장에 들어갈 **맥락 명사** | `편의점 매장` |
| `trigger_keywords` | 사용자가 칠 법한 말 3~8개. **전체에서 중복 없음** | `편의점` `아르바이트` `교대` … |
| `core_competencies` | 이 경험에서 뽑히는 역량 2~4 | `고객 응대` `재고 관리` `정확성` |
| `action_verbs` | 문장에 쓸 **행동 명사** 2~5 | `응대` `재고 정리` `교대 인수인계` |
| `metric_prompts` | 수치 슬롯을 포함한 결과 표현 2~4. **하나 이상 `[숫자]`/`[기간]` 포함** | `하루 [숫자]건 응대` |
| `evidence_patterns` | 근거 문장 틀 1~3 | `{context}에서 {verb}를 하며 …` |

5범주: `service`(알바·서비스·현장 7묶음) · `office`(사무·행정 8) · `external`(대외·협업 8) · `tech`(기술·제작 9) · `trait`(성향·상황 13)

### 5-3. `tone_frames` — 4톤 × 2용도 × 3문형

| 톤 | 무엇으로 말하나 |
|---|---|
| `achievement` 성과·수치형 | 결과와 숫자. 감정 형용사 금지 |
| `problem` 문제해결·논리형 | 원인과 조치 분리, 결론 먼저 |
| `collaboration` 협업·조율형 | 내 몫과 상대 몫 구분, 합의 기록 |
| `stability` 성실·안정형 | 같은 기준의 반복 기록, 과장 없음 |

용도: `resume_line`(이력서 한 줄, 90자 이내) · `cover_para`(자소서 핵심 문단, 2~3문장·320자 이내)

### 5-4. 조립 알고리즘 (`assembly.steps` — 화면이 그대로 구현)

1. **정규화** — 앞뒤 공백 제거, 소문자화, `suffix_strip`(했습니다·하다·적인·에서·을·를 …)로 꼬리 제거.
2. **정확 일치** — `trigger_keywords`와 같으면 그 entry.
3. **부분 일치** — 2글자 이상 겹치면 후보. 여러 개면 가장 긴 일치를 대표로, 나머지는 **역량만 합친다**(`blend_rule`).
4. **범주 폴백** — 일치가 없으면 입력이 `category_hints`에 닿는지 본다(예: `알바` → `service`).
5. **일반 폴백** — 그것도 없으면 `fallback.generic`. **어떤 단어가 들어와도 문장 2~4개가 나온다.**
6. **조립** — 요청 톤(없으면 `output_contract.tone_order`)에서 용도별 문형을 하나씩 골라 슬롯을 채운다. 같은 entry 안에서 역량·동사·수치를 서로 다르게 골라 문장이 겹치지 않게 한다.
7. **숫자 처리** — 입력에 숫자가 있으면 `[숫자]`·`[기간]`에 넣는다. 없으면 자리표시자를 그대로 두고 "내 숫자로 바꿔 보세요"만 안내한다.
8. **근거 보강** — 여러 단어가 들어왔거나 근거를 요청하면 `evidence_patterns`에서 한 문장만 덧붙인다.

**슬롯** — `{keyword}`(사용자 입력 원형) · `{context}` · `{competency}` · `{verb}` · `{metric}` · `{evidence}`. 이 여섯 개 외의 슬롯은 쓰지 않는다(`validate.py`가 막는다).

**조사(助詞) 확정 규칙** — 문형에는 `{competency}을(를)`처럼 갈리는 조사가 들어 있다. 화면은 앞말의 받침을 보고 실제 조사를 확정해야 한다.

- 받침 있음 → `을` / `은` / `이`, 받침 없음 → `를` / `는` / `가`
- `으로(로)`는 받침이 없거나 **ㄹ 받침**이면 `로`, 그 밖의 받침이면 `으로`
- `{keyword}이었습니다`는 받침이 없으면 `였습니다`
- `surgery/data/validate.py`의 `fix_particles()`가 참조 구현이다. 이 처리를 빼면 "고객 응대을(를)", "함수 작성를" 같은 문장이 나간다.

**결정성** — 난수를 쓰지 않는다. 같은 입력·같은 톤이면 항상 같은 문장이 나온다. 순환 순서는 `(톤 index)`로 고정한다.

**성능** — 45묶음 선형 탐색, 네트워크·모델 호출 없음. 조립 1건은 10ms 이내(브라우저 기준 0.01초 수준)이며 입력 이벤트와 같은 프레임에 끝낸다.

### 5-5. 화면이 지킬 비노출 규칙

- "키워드 사전", "역량 태그 목록", "매핑표" 같은 **메뉴·탭·아코디언을 만들지 않는다.**
- 조립 결과 옆에 "이 단어를 이렇게 해석했습니다" 한 줄은 허용한다(어떤 entry로 잡혔는지·어떤 역량으로 번역됐는지). 단, **키워드 전체 목록은 절대 펼치지 않는다.**
- 매칭이 약해 폴백으로 문장이 나온 경우에도 "없는 단어"라고 말하지 않는다. 폴백 문장을 내고 숫자를 채우라고 안내한다.
- 사용자가 입력한 단어는 저장하지 않는다(서버 전송 없음, 화면 상태로만).

---

## 6. 공통 제약 (화면)

1. **내보내기 금지** — 저장·인쇄·PDF·복사 버튼을 만들지 않는다(PR #49·#52에서 전수 삭제). 문장은 화면에서 읽고 자기 말로 다시 쓰는 것이 목적이다.
2. **없는 사실을 만들지 않는다** — 데이터에 없는 회사·직무·합격 사례를 화면이 생성하지 않는다.
3. **예시임을 숨기지 않는다** — `after_star`와 조립 문장에는 "예시" 표시와 `[숫자]`·`[기간]` 자리 안내를 붙인다.
4. **단정 금지** — `signal_type`은 문구 해석이지 회사 평가가 아니다. "이 회사는 나쁘다"로 쓰지 않는다.
5. **개인정보 최소** — 회사명·직무명만 받는다. 주민번호·연락처·주소·실제 합격 자소서 원문을 입력받는 칸을 만들지 않는다.
6. **저작권** — 특정 서비스의 시그니처 화면·인재상 문구·합격 자소서를 옮기지 않는다(`DESIGN.md` §0).
7. **데이터는 읽기 전용** — 화면에서 `surgery/data/*.json`을 고치지 않는다. 고칠 것이 있으면 보드 22번 페이지에 적고 피클이 스키마와 함께 고친다.

---

## 7. 검증

```bash
python3 surgery/data/validate.py            # 구조 검증
python3 surgery/data/validate.py --selftest # 조립 엔진 참조 구현까지 실행
```

`validate.py`가 검사하는 것:

- 필수 필드·길이·id 형식·중복(`jd_anatomy`/`xray_cases`/`resume_layouts`/`entries`/`trigger_keywords`)
- `signal_type` 세 가지가 각각 3건 이상인지, `meta.counts`와 실측 일치
- `cluster`·`theme`·`resume_format`·`section_order` 값이 어휘 목록 안에 있는지
- `defense_scripts` 2~3종, `star` S/T/A/R 네 칸
- `tone_frames` 4톤 × 용도 2 × 문형 3, 슬롯 이름이 정의된 것인지, 중괄호 짝
- `lexicon` 비노출 플래그(`visible=false`, `export_forbidden=true`)와 키워드 150개 이상
- HTML 태그·외부 주소·인쇄/PDF/복사 문자열이 데이터에 섞이지 않았는지
- `--selftest`: 알려진 단어·모르는 단어(`우주정거장`)·범주 힌트(`알바`)로 **항상 2~4문장**이 나오는지, 슬롯이 남지 않는지, 같은 입력에 같은 출력인지

---

## 8. 조인·확장 여지

- **21번 `portals/`** — 공고를 실제로 확인하러 가는 곳. 22번에서 해부한 문구를 21번의 사이트에서 원문으로 확인하는 동선이 자연스럽다(링크는 21번 데이터의 `url` 사용).
- **20번 `taxonomy/`** — 직무명·NCS 세분류를 `entries`의 `category`·`context`와 연결하면 "이 직무에서 자주 쓰는 경험 언어"로 확장된다. 단 공식 매핑이 아니므로 "참고 연결"로 표시한다.
- **14번 `cert/`** — `xr18`(수상·자격) 테마를 자격명과 연결하면 "이 자격을 어떻게 문장으로 쓰는가"가 이어진다.
- **17번 `reality/`** — "스펙이 부족해서 안 될 것 같다"는 문장을 공식 통계로 반박하는 동선(22번 ② → 17번).
- **20-1 후보(1.0.0 미포함)** — ① 회사별 인재상 문구 데이터(공식 채용 페이지에서 확인한 것만) ② 직무별 자주 쓰는 동사 사전 ③ 면접 답변용 음성 연습(10번 `talk/`와 연결) ④ 자기 문장을 직접 넣어 `rule`과 대조하는 진단 모드
