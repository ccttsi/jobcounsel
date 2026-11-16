# 연결 툴 주소록

역할은 [`ROLES.md`](ROLES.md). 여기에는 다른 세션이 바로 찾아갈 수 있는 ID·링크만 둔다. 새로 만들거나 바꾸면 이 표부터 고친다.

## Notion
| 무엇 | ID·주소 |
|---|---|
| 🧭 운영 허브 · 역할 분리 헌장(이 저장소 ROLES.md 사본) | https://app.notion.com/p/41a14d0ef55081de8e01fb1d755cd44e |
| 자료실 섹터 보드 | data source `collection://e1d730f4-4d70-4909-b181-1645161b9791` |
| 📒 직업상담 자료실 개발일지 | https://app.notion.com/p/41a14d0ef5508122aa10dd376742a5a4 |
| 🎨 DESIGN.md(노션 사본, 원본은 저장소) | https://app.notion.com/p/41a14d0ef55081488d1df43b44b71ad1 |
| 🤖 메이크에 의해 생성됨(폴더) | https://app.notion.com/p/41a14d0ef550818f89e9d7be776104bb |
| └ 🎨 디자인 학습함 | `collection://41a14d0e-f550-8175-bf89-000bcd6ff441` |
| └ 📊 자료 수집함 | `collection://41a14d0e-f550-81aa-a4fa-000b103551e5` |
| └ 🧠 클로드 소화 노트 | `collection://41a14d0e-f550-8104-8d96-000b3492bfac` |

## Make (eu1.make.com)
| 무엇 | ID |
|---|---|
| 조직 / 팀 | 9645978 / 3639890 |
| 🎨 디자인 학습함 수집(월·목 07:00 KST) | 시나리오 8599601 |
| 노션 연결 / Make AI 연결 | 13082718 / 13082626 |

## Claude 예약 작업
| 무엇 | ID |
|---|---|
| 자료실 학습함 소화(월·목 08:41 KST) | `trig_01JwBAZL3jwS1euEbWRucXkN` — claude.ai 예약 작업 화면에서 Notion 커넥터를 켜 둬야 동작 |

## Google Drive · Sheets
| 무엇 | 주소 |
|---|---|
| 폴더 「직업상담 자료실 · 원자료 창고」 | https://drive.google.com/drive/folders/1vVwD4lQV0JEV9Y5qyTWI1thQ1ofFtGwQ |
| 00 · 이 창고의 역할(문서) | https://docs.google.com/document/d/1SVxGJRTPKHxPosJCkUILXC8SrxaiAHPu48SLp-vEB_4/edit |
| 01 · 원자료 색인(시트, `시트1`) | https://docs.google.com/spreadsheets/d/11FlMKgOtUt5_Tg0xaelcCnNq-XXjrnlTUdyGLM2TFqU/edit |

## Supabase
| 무엇 | 값 |
|---|---|
| 프로젝트 | `vzxwdfswlolhcluljkgi` (화면은 `assets/sync.js`로만 접근) |
| 테이블 | `jc_users`(계정) · `jc_sessions`(연동) · `jc_hits`(익명 통계) — 각 테이블 설명(comment)에 역할을 적어 둠 |

## Playwright
| 무엇 | 값 |
|---|---|
| 공용 검수 | `node ops/qa/audit.js <경로…>` — 로컬 서버를 스스로 띄워 폭별 콘솔 오류·가로 넘침·44px·화면 분량을 잰다 |
| 브라우저 | 클라우드 세션에 미리 설치됨(`require('playwright')`, 별도 설치 금지) |
