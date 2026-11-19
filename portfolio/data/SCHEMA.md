# SCHEMA.md — 23번 「포트폴리오 편집실」 자료 계약

`portfolio/data/studio.js`는 화면이 읽는 유일한 자료 파일입니다(전역 `window.PF`). 문구·수치·예시는 모두 이 자료실이 직접 쓴 것이고, 다른 서비스의 화면·문구·사례를 옮기지 않았습니다. 자료를 고칠 때는 이 파일만 고칩니다(화면 코드는 자료 구조를 바꾸지 않습니다).

## 1. scan — 90초 스캔

```
scan.total          90 (초)
scan.note           기준 안내 한 줄
scan.scenes[]       { id, name, t0, t1, wire, ask, inner, look[], miss, fix }
```
- `t0`·`t1`은 초. 장면은 시간순이고 `t1`이 다음 장면의 `t0`입니다(끝 장면의 `t1` = total).
- `wire`는 모니터 약도 종류(`cover`·`skill`·`project`·`contrib`·`close`). 화면이 상자로 그립니다(이미지 없음).
- `ask`는 그 장면에서 읽는 사람이 던지는 질문, `inner`는 읽는 사람의 속마음, `look`은 확인 항목 2~3개, `miss`는 흔한 감점, `fix`는 고치기 한 줄.

## 2. roles · jd — 역할 비교와 직군별 역량

```
roles[]  { name, purpose, len, reader, judged }
jd[]     { job, req, proof, miss }
```

## 3. sources · discover — 소재 선별

```
sources[]        { id, name, kind, rel, share, quant, note }
discover[]       { name, why, steps[], out }
cutRule          점수 규칙 문장
```
- `rel`(관련성) 1~3, `quant`(정량화) 1~3, `share`(내 몫 %) 0~100.
- 점수 = `rel*2 + quant + (share>=60 ? 2 : share>=30 ? 1 : 0)`. 화면은 8점 이상을 "올릴 만함"으로 안내합니다.

## 4. tracks · pairs · files — 6트랙과 첨삭

```
tracks[]  { id, name, q, signal, needs[] }
pairs[]   { id, label, before, after, why }
files[]   { id, name, rule }
```
- `needs`는 문장 점검 규칙 이름입니다: `num`(숫자) · `role`(내 역할) · `alt`(대안·이유) · `evidence`(근거) · `next`(다음 행동). 화면의 규칙 정규식과 짝입니다. 새 규칙을 넣으면 `portfolio/app.js`의 `RULES`에도 같은 이름을 넣어야 합니다.
- 문장 점검은 글자 규칙만 봅니다(평가·점수 없음). 모호 표현(`VAGUE`)은 따로 표시합니다.

## 5. ethics — 보안·윤리 검문소

```
ethics[]  { id, name, risk, ask, fix }   risk: '높음' | '중간'
```
- '높음' 항목을 모두 확인해야 화면이 「위험 높음 모두 확인」으로 바뀝니다.

## 6. tails · talk — 면접 연계

```
tails[]      { q, aim, frame }
talk.total   180
talk.parts[] { t0, t1, name, say }
```

## 7. course · diff · ops — 상담사·강사 모드

```
course[]  { n, title, act, out, home }
diff[]    { t, b }
ops.lesson[]  [이름, 시간]   예: ['이론','25분']
ops.edit3[]   첨삭 3원칙 문장
ops.rubric[]  [항목, 기준]
ops.oneOnOne[] [단계, 시간]
```

## 8. 쓰지 않는 것

- 개인정보·실제 지원자 사례·회사 실명을 넣지 않습니다.
- 화면 밖으로 내보내기(복사·인쇄·PDF·파일 저장)를 만드는 자료 항목을 두지 않습니다.
- 저작권이 있는 타사 화면·문구·이미지·사례를 넣지 않습니다.
