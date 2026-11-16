# CLAUDE.md — 이 저장소에서 일하는 Claude를 위한 지침

직업상담 통합 자료실(정적 사이트, 빌드 없음, GitHub Pages). 각 섹터는 `폴더/index.html` 한 파일(일부는 `app.js`·`data/` 분리)이고, 공용 층은 `assets/prefs.js`(테마·글자 크기·집중 보기·디자인 층·접기), `assets/marker.js`(형광펜·포스트잇), `assets/sync.js`(선택 로그인·연동)다.

## 작업 시작 전 — 반드시 읽는다

1. **`DESIGN.md` §0(지적재산권 가드레일) · §1~§2(원칙·모션 가드레일) · §3(토큰)** — 화면을 건드리는 모든 작업의 기준이다.
2. **작업할 섹터 유형의 `design/patterns/*.md`만 골라 읽는다** (아래 표). 전부 읽지 않는다 — 필요한 규칙이 흩어지면 지키는 규칙도 흩어진다. 휴대폰·태블릿을 건드리면 `touch-physics.md`는 항상 함께.

   | 작업 대상 | 읽을 모듈 |
   |---|---|
   | `/parsons/` `/library/` `/theory/` `/manual/` (이북·긴글) | `design/patterns/ebook-reading.md` |
   | `/company/` `/cert/` `/univ/` `/grad/` `/decalcomania/` `/transit/` (명함첩·도감·위키) | `design/patterns/card-directory.md` |
   | `/hud/` `/vpi/` `/dacum/` `/talk/` (계산기·HUD) | `design/patterns/sim-hud.md` |
   | `/` (대문) | `design/patterns/hub-landing.md` |
   | 휴대폰·태블릿 손맛 (모든 섹터) | `design/patterns/touch-physics.md` |

3. **`.claude/skills/design-lead.md`** — 새 섹터 개발·디자인 개편 전에 밟는 루틴(비지시적 탐색 → 지재권 필터 → 시안 2~3개 → 학습 노트 → 구현 → 손맛 실측 검수 → 적중·도태 기록).
4. **`design/HANDOFF.md`** — 앞 세션이 남긴 완료 단계·남은 일·다음 시작 파일. 이어 하는 작업이면 여기서 출발한다.
5. 관련 학습 노트: `design/studies/` 최신 파일 1~2개.

## 작업 중 — 지킬 것

- **지재권(최우선)**: 특정 서비스의 시그니처 화면 구성·고유 레이아웃 조합·그래픽 스타일 조합을 알아볼 수 있게 모방하지 않는다. 일반 원리(비례·명도 대비·정보 위계·물리 모션 원리)만 추상화하고, **애매하면 아예 쓰지 않는다**. 판단은 `DESIGN.md` §0-1 세 질문으로.
- 원문 저작물(보고서·매뉴얼·검사 문항)을 옮기지 않는다. README의 「저작권과 출처」를 따른다.
- 유머 문구·드립·AI식 위트 카피를 쓰지 않는다. 새로 넣는 문구는 버튼 이름표·안내처럼 기능적인 것만.
- **자료실 섹터 개수를 코드·문서·문구에 고정하지 않는다.** 대문은 `TOOLS` 배열 길이에서 세고(`data-count`), 문서에는 "섹터마다", "모든 섹터"처럼 쓴다.
- 모션은 `transform`·`opacity`만. 레이아웃 속성(width·height·top·left·grid-template-rows·max-height)·`filter: blur`·`box-shadow` 애니메이션 금지, 상시 도는 JS 루프 금지. `prefers-reduced-motion`과 집중 보기(`html[data-jc-imm]`)에서는 꾸밈 모션을 멈춘다.
- 휴대폰 세로(≤899px)와 큰 화면 가로(≥900px, 특히 ≥1200px)를 따로 설계한다. 휴대폰은 접고 누르면 펼치기, 큰 화면은 좌우 분할·다단.
- 가독성: 보조 글자색 대비 4.5:1 이상(`--dim` 밝게 `#6e645b`), 글자 11px 이상, 터치 대상 44px 이상.
- 새 섹터: 본문을 `<main>`에, 머리말에 `<span data-jc-prefs></span>`, `</body>` 앞에 `marker.js`·`prefs.js`. 화면을 다시 그리는 고정 차례는 `html[data-jc-imm] .x{display:none}`로 숨긴다. 휴대폰 상세는 `window.JC_FOLD`로 접는다.

## 작업 끝 — 반드시 남긴다

1. 새로 정리한 노하우는 **그 유형의 `design/patterns/*.md`에 누적**한다(날짜, 어디에 썼는지, 왜). 이 저장소의 패턴은 유형별 모듈에 쌓고, `DESIGN.md`에는 §9 적중 이력·§10 도태 목록·§11 인덱스에 한 줄만 더한다. **`DESIGN.md` 본문을 늘리지 않는다.**
2. 태화님이 채택·호평한 패턴은 `DESIGN.md` §9 적중 이력의 이력 칸을 올린다. 실기기에서 「덜컹 / 답답 / 구림」 피드백을 받은 요소는 §10 도태 목록에 적고 같은 형태로 다시 쓰지 않는다.
3. 레퍼런스를 탐색했다면 `design/studies/YYYY-MM-DD-주제.md` 노트를 남긴다(참고한 곳, 추상화한 원리, 자체 작성 패턴, 적용한 곳, 어디서 멈췄는지).
4. 손맛을 건드렸으면 `design-lead.md` ⑥의 **백지 프레임·프레임 간격·44px·연속 입력 지연**을 실측하고 숫자를 커밋 메시지나 HANDOFF에 적는다.
5. 큰 작업은 단계마다 커밋하고 `design/HANDOFF.md`의 [완료된 단계 / 남은 작업 / 다음 시작 파일]을 갱신한다(중단 대비).
6. README의 해당 섹터 설명이 바뀌었으면 함께 고친다.
