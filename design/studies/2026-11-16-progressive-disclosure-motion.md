# 점진적 공개와 무랙 펼침·채우기·생성 모션 — 2026-11-16

design-lead 루틴 첫 실행. 이번 주제: **초면은 핵심만 → 누르면 세부가 열리는 상호작용을, 휴대폰에서도 랙 없이(합성 단계에서만) 움직이는 법.**

## 탐색한 곳

- [Codrops — 월별 글 목록·UI Interactions & Animations Roundups](https://tympanus.net/codrops/2026/03/) · 2026-03 · 미세 상호작용 모음은 꾸준히 "작은 상태 변화에 방향성을 주는 움직임"을 보여 준다. 다만 2025~26년 튜토리얼 상당수가 GSAP·WebGL 기반이라 우리 정적 사이트(외부 라이브러리 없음, 무랙 원칙)에는 **원리만** 가져온다. 과거 「Proximity Feedback with Progressive Hover」처럼 *가까워질수록 반응을 점점 키우는* 생각은 우리 집중 보기 도구함(근접 시 또렷해짐)과 같은 계열.
- [web.dev — How to create high-performance CSS animations](https://web.dev/articles/animations-guide) / [Why are some animations slow?](https://web.dev/articles/animations-overview) · 상시 문서 · 브라우저가 싸게 움직일 수 있는 건 transform·opacity 둘뿐이고, 레이아웃·페인트를 부르는 속성은 프레임 예산(16.7ms)을 깨기 쉽다. 흐림이 들어간 그림자 같은 효과는 페인트가 비싸다. `will-change`는 아껴 쓴다(레이어마다 메모리).
- [Chrome Developers — Animate to height: auto](https://developer.chrome.com/docs/css-ui/animate-to-height-auto) (2024-09) · [modern-css.com — ::details-content](https://modern-css.com/animating-details-without-javascript-height/) · [Chrome — Entry/exit animations, @starting-style](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/animate-element-entry-exit) · [MDN @starting-style](https://developer.mozilla.org/docs/Web/CSS/Reference/At-rules/@starting-style) · 2024~2026 · `interpolate-size`·`::details-content`로 높이를 CSS만으로 열 수 있게 됐지만 이는 **높이(레이아웃) 애니메이션**이다. 반면 `@starting-style`은 `display:none`에서 나타나는 요소에 *시작 값*을 주어 transition이 첫 프레임부터 돌게 해 준다(2024년 8월부터 주요 브라우저 기준선, 사파리 17.5 포함).

## 추상화한 원리

1. **상자는 즉시, 내용은 떠오르며** — 높이를 보간하면 매 프레임 레이아웃이 다시 계산되고 아래 문단이 밀려 내려가며 흔들린다. 대신 상자 크기는 한 번에 바꾸고, 새로 나타난 *안쪽 덩어리*만 opacity·translate로 6~10px 떠오르게 하면 눈은 "펼쳐졌다"고 읽고 GPU만 일한다. → 우리 가드레일과 정확히 맞는다. `interpolate-size`는 쓰지 않는다(레이아웃 + 사파리 미지원).
2. **시작 값은 CSS가 쥔다** — `@starting-style`이 있으면 JS로 클래스를 붙였다 떼는 타이머(`setTimeout`·`requestAnimationFrame` 두 번)가 필요 없다. 지원하지 않는 브라우저는 그냥 즉시 나타난다 = 점진적 향상. 애니메이션이 기능을 떠받치지 않는다.
3. **순서가 곧 위계** — 펼친 덩어리들이 위에서부터 30~40ms 간격으로 차례로 생성되면, 읽는 순서를 움직임이 먼저 안내한다. 10개를 넘기면 기다림이 되므로 그 뒤는 한꺼번에.
4. **상태는 '채워짐'으로** — 열림/닫힘을 색 면적 교체 대신 얇은 선이 왼쪽부터 차오르는 `scaleX`로 보여 주면, 손잡이가 어느 쪽인지 한눈에 보이고 비용은 합성뿐.
5. **움직일 때만 돈다** — rAF는 "목표에 닿을 때까지"만. 대기 중 진행 표시는 CSS 애니메이션(합성 스레드)에 맡기고 JS는 끝 시점만 안다.
6. **근접 피드백은 단계형** — 가까워짐(호버·포커스) → 살짝 들림, 누름 → 눌림, 열림 → 회전·채움. 각 단계가 한 가지 속성만 바꾸면 겹쳐도 어지럽지 않다.

## 자체 작성 패턴 (이 저장소용으로 새로 씀)

### P1. 떠오르는 펼침 `jc-unfold`
```css
/* 접힌 덩어리가 열리면 안쪽 덩어리가 순서대로 떠오른다 — 높이는 즉시 */
.jc-fold-box[data-open] > :not(.jc-fold-h),
.jc-fold-sib[data-open] + * {
  transition: opacity .3s cubic-bezier(.2,.9,.3,1), transform .34s cubic-bezier(.2,.9,.3,1);
  @starting-style { opacity: 0; transform: translateY(8px); }
}
.jc-fold-box[data-open] > :nth-child(3) { transition-delay: 34ms }   /* 손잡이 다음부터 */
/* … :nth-child(10)까지, 그 뒤는 0 */
@media (prefers-reduced-motion: reduce) { … transition: none }
```

### P2. 차오르는 게이지 밑줄 `jc-gauge`
```css
.jc-fold-h::before {           /* 손잡이 아래 2px 선 */
  content:""; position:absolute; left:0; right:0; bottom:0; height:2px;
  background: currentColor; opacity:.5;
  transform: scaleX(0); transform-origin: 0 50%;
  transition: transform .32s cubic-bezier(.2,.9,.3,1);
}
.jc-fold-h[data-open]::before { transform: scaleX(1) }
```

### P3. 끝나면 멈추는 다이얼 루프
```js
function kick(){ if(!raf) raf = requestAnimationFrame(frame); }
function frame(now){ raf = 0; /* …보간… */ if (Math.abs(target-pos) > ε) kick(); }
// 자동 넘김: setTimeout 한 번 + CSS @keyframes(scaleX 0→1)로 남은 시간을 보여 줌
```

## 이번 작업에 적용할 곳

| 파일 | 대상 | 기대 효과 |
|---|---|---|
| `assets/prefs.js` | 공용 접기 `JC_FOLD` | 모든 섹터의 휴대폰 접기에 P1·P2가 한 번에 적용 |
| `index.html` | 문장 다이얼 상시 rAF, `filter:blur` 보간, 점 인디케이터 `width` 전환, 상태 점 `box-shadow` 무한 맥박, 이용 안내 `grid-template-rows` 전환 | 가드레일 위반 0, 대기 중 CPU 0 |
| `index.html` | 통찰 카드 초면(제목+풀이 문단+질문) | 제목 + 질문만, 풀이는 「풀이 보기」(P1 방식) |
| `index.html` | 섹터 개수 정적 숫자 `7` | 빈 칸 → 스크립트가 `TOOLS` 길이로 채움 |
| 섹터들 | `transition`에 box-shadow·width·max-height가 들어간 곳 | 해당 속성 빼고 transform으로 대체 |
