# 먼저 찍고 맞대기 — 2026-11-16

16번 섹터 「취업 현위치」(`/reality/`)를 만들며 밟은 design-lead 루틴 기록. 시간 관계상 ③ 시안은 HTML 시제품 대신 구조 비교로 짧게 겨뤘다(아래 「어디서 멈췄는지」).

## 탐색한 곳
- [Scott O'Hara, Accessible Styled Form Controls — range slider](https://scottaohara.github.io/a11y_styled_form_controls/src/range-slider) · 날짜 미표기 · 기본 range 입력은 겉모양을 바꿔도 스크린리더 안내가 그대로 남는다.
- [Smashing Magazine, Custom Range Input Consistent Across Browsers](https://coding.smashingmagazine.com/2021/12/create-custom-range-input-consistent-browsers/) · 2021-12 · 브라우저마다 다른 것은 손잡이 쪽이다. 트랙·손잡이 의사 요소를 따로 맞춘다.
- [Set Product, Slider UI design for single and range inputs](https://preview.setproduct.com/blog/slider-ui-design) · 2025-11-07(최근 12개월) · 값·최솟값·최댓값을 보조 기술에 알리고 이름표를 붙인다.
- [Padilla·Kay·Hullman, Uncertainty Visualization (2020)](https://moodle2.units.it/pluginfile.php/466375/mod_resource/content/0/Uncertainty_Visualization_Padilla_Kay_Hullman_2020.pdf) · 2020 · 빈도 형식(100명 중 n명)은 수치 감각이 약한 사람에게 비율보다 잘 읽힌다.
- [data.europa.eu 시각화 안내 — 빈도](https://data.europa.eu/apps/data-visualisation-guide/frequencies) · 날짜 미표기 · 아이콘 배열은 분모를 보여 줘서 비율 착각을 줄인다.
- (웹 밖) 등산로·공원 안내판의 「현위치」 표지 · 전체 지도 위에 점 하나로 「여기」를 찍는다 · 전체를 먼저 보이고 그 위에 나를 얹으면 위치가 비교가 된다.
- (웹 밖) 측량 표척·줄자의 눈금 · 10칸마다 긴 눈금 · 눈금이 있으면 「얼마나 빗나갔는지」가 숫자 없이도 길이로 읽힌다.

## 추상화한 원리
1. 짐작을 먼저 받으면 실제 값이 「정보」가 아니라 「교정」이 된다 — 차이가 곧 메시지 — 가드레일 충돌 없음(입력은 기본 range).
2. 분모를 눈으로 보여 준다(점 100개) — 「17%」보다 「100명 중 17명」이 덜 추상적 — 정적 그림이라 모션 비용 0.
3. 전체 분포를 먼저, 나는 그 위의 표지 하나로 — 내 칸만 진하게, 나머지는 옅게 — 막대는 `scaleX`.
4. 눈금은 장식이 아니라 측정 도구로 쓴다 — 두 표지 사이 길이가 오차 — 정적 배경(`repeating-linear-gradient`), 집중 보기에서 끈다.

## 자체 작성 패턴
- 두 표지 눈금자 / `/reality/` ① / 트랙과 같은 폭의 상자에 `transform:translateX(p%)`, 안쪽 표지는 `translateX(-50%)`. 공개 순간 실제 표지를 내 예측 자리에서 실제 자리로 0.5s 이동, 감속 모드·집중 보기 즉시.
- 100점 빈도 그림 / `/reality/` ① / `grid-template-columns:repeat(20,1fr)` 점 100개, `role=img` + `aria-label="100명 중 n명: …"`.
- 출처 한 줄 / 모든 통계 카드 / 증거 수준 꼬리표(공식·민간·모형) + 기관·조사명·기준시점·원문.

## 시안 비교
- 안 A 「한 장씩 넘기는 점검 카드」 — 밀도 ○(한 번에 질문 하나) · 직관성 ○(다음이 분명) · 확장성 ○(항목이 늘면 차례만 길어짐). **채택**(① 단계 안쪽).
- 안 B 「열 개 슬라이더를 한 화면에」 — 밀도 ×(휴대폰 첫 화면이 슬라이더 벽) · 직관성 △ · 확장성 ×. 탈락.
- 안 C 「네 단계 차례 + 단계별 화면」 — 지시한 4단계(예측·분포·반박·통제)를 그대로 차례로. **채택**(바깥 틀). A를 ① 안에 넣었다.

## 이번 작업에 적용할 곳
- `reality/index.html` `.ruler .mk` · `.dots` · `.bars` · `.src` — 위 패턴.
- `design/patterns/sim-hud.md` §8로 옮겼다.

## 지재권 기록
- 참고한 것: 기본 range 접근성 원리, 빈도 형식의 인지 연구, 안내판·눈금자의 일반 관습.
- 쓰지 않기로 한 것: 특정 언론사의 「선을 직접 그려 맞혀 보기」 연출(형태가 그 서비스의 상징이라 제외), 특정 재단의 「무지 점수·침팬지 비교」 퀴즈 틀(구성·문구가 상징이라 제외). 짐작 → 공개라는 일반 순서만 쓰고, 입력은 기본 슬라이더로 했다.
- 어디서 멈췄는지: 시안을 HTML 세 장으로 만들지 않고 구조 비교로만 겨뤘다. 새 섹터 규칙상 다음 개편 때는 시제품 비교를 남긴다.
