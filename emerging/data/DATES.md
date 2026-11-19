# 지면 날짜의 근거 (v1.2.0)

지면 날짜는 **그날 실린 자료의 공표일**이다(`SCHEMA.md` §2). 날짜를 확인하지 못한 자료는 싣지 않는다. 이 파일은 각 출처의 발행일을 어디서 확인했는지 남긴다.

## 1. 날짜까지 확인해 고친 출처 (2026-11-19)

| 출처 | 이전 값 | 확정 | 확인한 곳과 표기 |
|---|---|---|---|
| `src_iea_batteries2024` | `2024-04` | **2024-04-25** | iea.org 보고서 페이지 "Published 25 April 2024 Licence CC BY 4.0" |
| `src_iea_h2_2025` | `2025-09` | **2025-09-12** | iea.org 「Global Hydrogen Review 2025」 "Published 12 September 2025 Licence CC BY 4.0" |
| `src_oecd_ai_invest2025` | `2025-09` | **2025-09-26** | OECD.AI 「Measuring AI investment」 "On 26 September 2025, the OECD and the European Commission released Advancing the measurement of investments in artificial intelligence". (DOI 등록 표기는 2025-09-25로 하루 앞선다 — 발표 보도일 기준으로 잡았다.) |
| `src_oecd_space2026` | `2026-09` | **2026-09-09** | ESA Space Economy 포털 "The new edition of 'The Space Economy at a Glance 2026' was published on 9 September 2026 by the OECD". (DOI 등록 표기는 2026-09-05.) |
| `src_bls_ep2434` | `2026` | **2026-01-08** | BLS MLR 「Employment Projections」 색인 "Industry and occupational employment projections overview and highlights, 2024–34 01/08/2026". 원문 인용 표기는 "Monthly Labor Review … January 2026". |

나머지 18개 출처는 이미 날짜까지 맞아 그대로 썼다(부처 보도자료 `korea.kr`·`mafra.go.kr` 게시일, BLS TED 2026-07-13, KISTEP 2026-09-22 등).

## 2. 실지 못한 출처 (날짜를 확인할 수 없어 정리)

| 출처 | 사유 |
|---|---|
| `src_oecd_spacefig2023` (기사 3건) | 「The Space Economy in Figures」 2023년 12월 **연감**. 공표일 표기가 갈린다(DOI 2023-12-12 / ESA 2023-12-15). 날짜를 확정할 수 없어 지면에서 뺐다. |
| `src_mafra_smartfarm2026` (기사 8건) | 「2026년 스마트농업 육성 시행계획」은 2025년 11월에 나온 **연간 계획서**다(문서 PDF 생성 2025-12-29, 발간 시기 표기 2025.11). 공표 '날짜'가 없어 지면에 세우지 않았다. 같은 계획의 노지·시설원예 사업 수치는 2026-03-03 지면(`src_mafra_upland2026`)과 오늘 지면의 보도자료로 남아 있다. |

## 3. 같은 자료에서 겹친 기사 정리

한 자료에서 같은 주제를 두 번 쓴 기사 17건은 한 장만 남겼다(예: IEA 배터리 '에너지저장 6배'·'배터리 저장 42GW 두 배', WEF '배송·운전' 2건, BLS 'OT 보안'·'정보보안' 28.5%, OECD 우주 '5,500억 달러'·'상업 우주 5,443억 달러', KISTEP '합성생물학'·'바이오 제조'). 기사가 겹치면 같은 지면에서 같은 말을 두 번 하게 된다.

## 4. 부제(`subtitle`) 정정

이전 일괄 스크립트가 부제를 돌려 끼워 제목·요약과 어긋난 5건(`ei-20261110-1/2/3`, `ei-20261114-1/2`)과, 요약에 없는 수치를 쓴 1건(`ei-20261108-1`)의 부제를 그 기사의 `summary`·`key_numbers`만으로 다시 썼다. 확인 방법: 부제의 숫자가 그 기사의 제목·요약·핵심수치·도표에 있는지 대조.
