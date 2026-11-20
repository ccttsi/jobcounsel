# SCHEMA.md — 23번 면접 전술 덱(TCG) 데이터 계약

이 문서는 `interview/data/deck.json`을 화면(`/interview/`)으로 구현하는 클로드 코드가 읽는 **계약서**다.
데이터는 피클(설계·검증)이 만들고, 화면 코드는 클로드가 쓴다(`ops/ROLES.md`).

- 파일: `interview/data/deck.json` (단일 파일)
- 배포 주소: `https://witw.pages.dev/interview/data/deck.json`
- 스키마 버전: `meta.version = "1.0.0"` (2026-11-16)
- 검증: `python3 interview/data/validate.py` → **오류 0건, 경고 0건** 통과본만 배포한다.
- 실측: 질문 카드 **38장**(일반 대면전 21 · 특수 전형 17) · 핸드 카드 **120장** · 마지막 역질문 **16종** · 약점 프리셋 **8종** · 2026 트렌드 **11종** · 출처 **16건**

---

## 0. 이 데이터로 무엇을 하는가

면접을 **카드 배틀의 문법으로 연습하는 도구**다. 답변을 대신 써 주는 도구가 아니다.

| 층 | 무엇인가 | 데이터 |
|---|---|---|
| 상대 필드 | 면접관의 질문 1장 | `encounters[]` — 질문·압박도·숨은 의도·법적 경계 |
| 내 핸드 | 그 질문에 대는 카드 3~4장 | `encounters[].hand_cards[]` — 함정·방어·카운터·실드 |
| 무기 덱 | 마지막 역질문 | `reverse_questions[]` — 기업 유형별 4종씩 16종 |
| 조립기 | 약점·공백기 3단 공식 | `weakness_presets[]` — 인정→전환→증명 8종 |
| 환경 정보 | 2026년 전형의 실제 변화 | `trends_2026[]` + `sources[]` |

> 학습·실습용 참고 자료다. **합격을 보장하지 않는다.** 카드의 문장은 예시이며 `[ ]` 자리는 사용자의 사실로 채워야 완성된다. 법률 자문이 아니다.

### 한 턴의 진행 (`rules.turn`)

1. 질문 카드가 공개되면 `pressure_level`과 `legal_flag`를 먼저 본다.
2. 핸드에서 함정(`trap`)을 먼저 읽고 **왜 나쁜지** 확인한다.
3. 방어(`defense`) 카드로 뼈대를 세우고 `pace_split`대로 시간을 나눈다.
4. 카운터(`counter`)로 마지막 한 문장을 남긴다. 인권·사생활 질문이면 실드(`shield`)가 먼저다.

`rules.win_condition`: 답변에 ① 사실 ② 판단 기준 ③ 근거(숫자·사례) ④ 직무 연결이 모두 들어가면 이긴다.

---

## 1. 최상위 구조

```json
{
  "meta":            { "dataset", "version", "sector", "sector_no", "path", "built_at",
                       "repository", "license", "notice", "counts", "verification" },
  "rules":           { "goal", "turn", "win_condition", "formulas", "pace_table", "forbidden" },
  "ui_contract":     { "timer", "motion", "export", "disclaimer", "legal_display" },
  "vocabularies":    { "arenas", "sub_modes", "card_types", "legal_flags",
                       "pressure_levels", "time_limits", "company_types" },
  "field_guide":     { "encounter.*", "card.*", ... },
  "legal_reference": [ … 4 ],
  "encounters":      [ … 38 ],
  "reverse_questions":[ … 16 ],
  "weakness_presets":[ … 8 ],
  "trends_2026":     [ … 11 ],
  "sources":         [ … 16 ]
}
```

`field_guide`는 필드 뜻을 화면 개발자용으로 한 줄씩 적어 둔 것이다. 화면 문구로 그대로 쓰지 않는다.

---

## 2. `vocabularies` — 고정 어휘

### 2-1. 아레나 (`arenas`)

| 코드 | 이름 | 뜻 |
|---|---|---|
| `standard` | 일반 대면전 | 면접관과 마주 앉아 60~90초로 답하는 기본 아레나 |
| `special` | 특수 전형 | AI·과제·토론으로 답변의 형식 자체가 달라지는 아레나 |

### 2-2. 모드 (`sub_modes`) — 8종 고정

| 코드 | 아레나 | 이름 | 장수 |
|---|---|---|---|
| `structured_bei` | standard | 구조화 경험면접 | 6 |
| `weakness_pressure` | standard | 약점·공백기 압박 | 6 |
| `rights_boundary` | standard | 인권·법 경계 | 5 |
| `closing_reverse` | standard | 마지막 역질문 | 4 |
| `ai_video` | special | AI 역량검사·영상면접 | 5 |
| `ai_thinking` | special | AI 활용·사고과정 검증 | 4 |
| `pt_case` | special | PT·반나절 심층과제 | 4 |
| `debate` | special | 토론면접 | 4 |

### 2-3. 카드 종류 (`card_types`)

| 코드 | 이름 | 하는 일 | 시간 배분 |
|---|---|---|---|
| `trap` | 함정 | 절대 하면 안 되는 답변 + 탈락 이유 | 0초 (쓰지 않는 카드) |
| `defense` | 방어 | 인정→전환→증명 또는 STAR 정석 답변 | 합 = 제한 시간 |
| `counter` | 카운터 | 숨은 의도를 찌르는 차별화 답변·역질문 | 제한 시간 이내 |
| `shield` | 실드 | 인권·사생활 질문을 법과 직무 기준으로 되돌림 | 합 = 제한 시간 |

### 2-4. 법적 신호 (`legal_flags`)

| 코드 | 표기 | 뜻 |
|---|---|---|
| `ok` | 정상 | 직무와 관련된 질문. `legal_basis`·`legal_note`는 `null` |
| `caution` | 주의 | 직무와 관련될 수 있지만 차별로 읽힐 수 있는 질문 |
| `violation_alert` | 위반 위험 | 법이나 인권 기준에서 문제가 되는 질문 |

### 2-5. 그 밖

`pressure_levels` 1(편안)~5(강압) · `time_limits` 30·60·90·180초 · `company_types` 공기업·대기업·스타트업·외국계.

---

## 3. `encounters[]` — 질문 카드 38장

| 필드 | 형 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✔ | `encNN` 형식. 화면 해시(`#enc01`)와 필터 키. **바꾸지 않는다** |
| `arena` | string | ✔ | `standard`·`special`. `sub_modes[].arena`와 일치해야 한다 |
| `sub_mode` | string | ✔ | 8모드 중 하나 |
| `interviewer` | string | ✔ | 질문이 나오는 자리(면접관 구성) |
| `question` | string | ✔ | 면접관의 실제 질문. 질문 카드 앞면 |
| `context` | string | ✔ | 질문이 나오는 상황. 카드 뒤편·작은 글씨 |
| `answer_goal` | string | ✔ | 좋은 답변이 보여 줘야 하는 것 한 줄 |
| `pressure_level` | int | ✔ | 1~5. 카드의 압박 눈금 |
| `time_limit_sec` | int | ✔ | 30·60·90·180. 턴 타이머 기준값 |
| `hidden_intent` | string | ✔ | 면접관이 그 질문으로 확인하려는 것. 방어 카드 전에 읽는 층 |
| `legal_flag` | string | ✔ | `ok`·`caution`·`violation_alert` |
| `legal_basis` | string\|null | ✔ | 법조문·인권위 기준. `ok`면 `null` |
| `legal_note` | string\|null | ✔ | 지원자가 실제로 할 수 있는 일. `ok`면 `null` |
| `hand_cards` | array | ✔ | 3~4장. 같은 종류를 두 장 넣지 않는다 |
| `coach_note` | string | ✔ | 그 질문에서 특히 조심할 한 줄 |

### 3-1. `hand_cards[]` — 핸드 카드 1장

| 필드 | 형 | 필수 | 설명 |
|---|---|---|---|
| `card_type` | string | ✔ | `trap`·`defense`·`counter`·`shield` |
| `title` | string | ✔ | 카드 이름(12자 안팎) |
| `script_formula` | string | ✔ | `[ ]` 자리가 있는 답변 공식. `① ② ③` 단계 표시 |
| `why_effect` | string | ✔ | 왜 통하는지, 또는 왜 실패하는지. 카드 뒤편 |
| `pace_split` | object | ✔ | `{ intro, case, link, note }` — 초 단위 |

### 3-2. `pace_split` 규칙

```json
"pace_split": { "intro": 15, "case": 50, "link": 25, "note": "도입 15초 · 사례 50초 · 연결 25초" }
```

- `defense`와 `shield`는 **`intro + case + link = time_limit_sec`** 이어야 한다.
- `trap`은 합이 **0**이고 `note`에 "이 카드는 쓰지 않는다"가 들어간다.
- `counter`는 합이 제한 시간을 넘지 않는다.
- 기준 배분(`rules.pace_table`):

| 제한 시간 | 도입 | 사례 | 연결 |
|---|---|---|---|
| 30초 | 5 | 15 | 10 |
| 60초 | 10 | 35 | 15 |
| 90초 | 15 | 50 | 25 |
| 180초 | 30 | 110 | 40 |

---

## 4. `reverse_questions[]` — 마지막 역질문 16종

| 필드 | 설명 |
|---|---|
| `id` | `rqNN` |
| `company_type` | 공기업·대기업·스타트업·외국계 (각 4종) |
| `question` | 실제로 물을 문장. `?`로 끝난다 |
| `verifies` | 그 질문으로 확인하려는 것 |
| `why_effect` | 왜 통하는지 |
| `when_to_use` | 쓸 자리(면접 단계) |
| `avoid_when` | 쓰지 말아야 할 조건 |

**화면 규칙** — 역질문은 공격이 아니라 **조건 확인**이다. `avoid_when`을 접힌 채로 두지 말고, 질문을 고르기 전에 보이게 한다. 답을 들은 뒤 받아 말하는 한 문장도 함께 보여 준다.

---

## 5. `weakness_presets[]` — 약점 방어 조립기 8종

| 필드 | 설명 |
|---|---|
| `id` | `wpNN` |
| `label` | 상황 이름(공백기 1년 이상·잦은 이직·비전공 직무전환·경력단절·성과 수치 부족·나이·중장년·신입인데 경험 없음·자격·학력 부족) |
| `keywords` | 사용자가 실제로 쓸 법한 말 3개 이상 |
| `steps.acknowledge` | 인정 — 사실을 한 문장으로 |
| `steps.pivot` | 전환 — 그때 쓴 기준·관점 |
| `steps.proof` | 증명 — 행동과 숫자 |
| `bridge` | 직무로 잇는 마지막 한 문장 |
| `avoid` | 그 상황에서 흔히 하는 실수 |
| `example` | `[ ]` 자리를 채워 완성하는 예시 문단 |

**화면 규칙**

- 사용자가 자기 상황을 고르면 **인정 → 전환 → 증명** 세 칸이 순서대로 펼쳐지고, 마지막에 `bridge`가 붙는다.
- `example`은 예시다. "이대로 말하세요"로 쓰지 않고 `[ ]` 자리를 입력칸·강조로 남긴다.
- `avoid`는 조립 전에 보여 준다. 실수를 먼저 알려야 카드가 산다.

---

## 6. `trends_2026[]` + `sources[]` — 2026년 전형의 실제 변화

### 6-1. `trends_2026[]`

| 필드 | 설명 |
|---|---|
| `id` | `trNN` |
| `title` | 한 줄 제목 |
| `fact` | 확인된 사실 한 문장 |
| `evidence` | 수치·조항·사례가 들어간 근거 |
| `implication` | 그래서 지원자가 무엇을 준비해야 하는가 |
| `source_ids` | `sources[]`의 id 배열 |
| `as_of` | 기준 시점 |
| `confidence` | `statute`(법령) · `public_standard`(공공 표준) · `reported`(보도) · `single_source`(단일 출처) |

`confidence`는 **화면에 표시한다.** `single_source`는 "한 출처에서만 확인됨"으로 보여 주고, 공고 원문에서 다시 확인하라는 안내를 붙인다.

### 6-2. `sources[]`

`id`(sNN) · `name` · `publisher` · `url`(https) · `as_of` · `type` · `used_for`.
화면의 「출처와 한계」에서만 보여 준다. 카드 본문에는 외부 주소를 넣지 않는다(검증기가 막는다).

---

## 7. `legal_reference[]` — 법적 방어 카드의 근거

4개 법령·기준(채용절차법, 남녀고용평등법, 연령차별금지법, 국가인권위원회법)의 조문 요약과 적용 대상.

**화면 규칙**

1. `legal_flag`가 `caution`·`violation_alert`인 질문에서만 법적 근거를 펼친다.
2. `legal_note`에는 **지원자가 할 수 있는 일**(답하지 않아도 됨, 기록, 상담·신고)만 쓴다. 승소·처벌을 단정하지 않는다.
3. "법적으로 문제다"와 "이 회사는 위험하다"를 구분한다. 회사 평가로 쓰지 않는다.
4. 법률 자문이 아니라는 한 줄을 화면 어딘가에 상시 둔다.

---

## 8. 화면 제약 (`ui_contract`)

1. **턴 타이머는 독자 설계다.** `time_limit_sec`과 `pace_split`만으로 화면이 자체 타이머를 그린다. 특정 게임의 밧줄·폭탄·스킨·레이아웃을 모방하지 않는다(`DESIGN.md` §0). 가장자리 잉크 소진선, 15초 이하 맥박 변화, 호흡 구간 마커 같은 자료실 고유 장치를 `DESIGN.md` 진화형 창조 루프(다중 메타포 변주 비교 → 90:10 적합안 채택)로 설계한다. 실행 전 노션 `🎨 디자인 학습함`에서 Make가 수집한 게임 UI·타이머·마이크로인터랙션 원리를 먼저 조회한다.
2. **모션은 GPU 합성 속성만** — `transform`·`opacity`(짧은 `clip-path: inset` 허용). `width·height·max-height·top·filter·box-shadow` 보간 금지, 상시 `rAF` 루프 금지, `prefers-reduced-motion`에서 정지.
3. **내보내기 금지** — 저장·인쇄·PDF·복사 버튼을 만들지 않는다(PR #49·#52).
4. **없는 사실을 만들지 않는다** — 데이터에 없는 전형·질문·법조문·수치를 화면이 생성하지 않는다.
5. **예시임을 숨기지 않는다** — 모든 카드 문장에는 예시 표시와 `[ ]` 자리 안내를 붙인다.
6. **데이터는 읽기 전용** — 화면에서 `interview/data/deck.json`을 고치지 않는다. 고칠 것이 있으면 보드 23번 페이지에 적고 피클이 스키마와 함께 고친다.

---

## 9. 검증

```bash
python3 interview/data/validate.py            # 구조 검증
python3 interview/data/validate.py --selftest # 카드 조립 참조 구현까지 실행
```

`validate.py`가 검사하는 것:

- 필수 필드·id 형식·중복(`encounters`/`reverse_questions`/`weakness_presets`/`trends_2026`/`sources`)
- `sub_mode`와 `arena`의 일치, 8모드·4카드 종류·3법적 신호 어휘
- `defense`·`shield`의 시간 합 = `time_limit_sec`, `trap`의 합 = 0, `counter`가 제한 시간을 넘지 않는지
- 모든 질문에 `trap`·`defense`·`counter`가 있는지, 인권·법 경계에는 `shield`가 있는지
- 모드별 최소 장수(일반 6·6·5·4, 특수 4종 각 4장 이상), `violation_alert` 5장 이상
- `legal_flag`와 `legal_basis`·`legal_note`의 짝, 법령·인권위 근거 포함
- 역질문 12종 이상·기업 유형별 3종 이상, 약점 프리셋 6종 이상과 3단 공식
- 트렌드의 `source_ids`가 실재하는지, `confidence` 어휘, 출처 URL https
- `meta.counts`와 실측 일치
- HTML 태그·외부 주소·내보내기 문구가 카드 본문에 섞이지 않았는지
- `--selftest`: 38장 전부에서 카드만으로 뼈대가 만들어지는지(시간 합·단계 표시·`[ ]` 자리)

---

## 10. 조인·확장 여지

- **22번 `surgery/`** — 서류에서 쓴 문장을 면접 답변으로 옮기는 동선. `xray_cases`의 `star` 네 줄이 이 덱의 `defense` 카드와 같은 재료다.
- **10번 `talk/`** — 상담 대화 연습장의 상황 카드와 `encounters`의 `hidden_intent`를 연결하면 "듣고 되묻는" 연습으로 확장된다.
- **21번 `portals/`** — 전형 이름과 일정은 공고 원문에서 확인한다. 이 덱의 `trends_2026`은 흐름이지 공고가 아니다.
- **17번 `reality/`** — "스펙이 부족해 안 될 것 같다"는 불안을 공식 통계로 낮추는 동선.
- **21-1 후보(1.0.0 미포함)** — ① 직무별 질문 카드 확장(NCS 능력단위 태그) ② 음성 답변 녹음·시간 측정 ③ 회사별 인재상 문구(공식 채용 페이지에서 확인한 것만) ④ 면접관 유형별 압박 패턴.
