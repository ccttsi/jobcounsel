---
name: finish
description: 자료실 작업을 마칠 때(/finish, "마무리", "끝내자") 검수·커밋·PR·머지 후 HANDOFF·노션 보드·개발일지를 갱신한다.
---

# finish — 마무리 루틴

## 1. 검수
- 화면을 건드렸으면 `design-lead` 스킬 ⑥ 실측(390·360·1024·1280·1440, 콘솔 오류 0, 가로 넘침 0, 44px, 백지 프레임 0). 시험 스크립트는 저장소 밖 작업 폴더에.
- 헤드리스로 확인 못 한 것은 「실기기 확인 필요」로 적는다.

## 2. 저장소
1. `CLAUDE.md` 「작업 끝」 1~6 (patterns 누적, DESIGN.md §9·§10·§11 한 줄, studies 노트, README).
2. `design/HANDOFF.md` [완료된 단계 / 남은 작업 / 다음 시작 파일] 갱신.
3. 커밋(실측 숫자 포함) → `git -c push.negotiate=true push -u origin <브랜치>` → PR 생성(REST: `gh api repos/ccttsi/jobcounsel/pulls -f title=... -f head=<브랜치> -f base=main -f body=...`).
4. 다른 세션 브랜치와 겹치지 않고 검수를 통과했으면 머지: `gh api -X PUT repos/ccttsi/jobcounsel/pulls/<번호>/merge -f merge_method=merge`. 1~2분 뒤 https://witw.pages.dev/ 해당 페이지가 200인지 확인.

## 3. 노션
1. 자료실 섹터 보드 해당 항목 상태 `작업대기 → PR → 배포완료`, 경로·출처 갱신.
2. 📒 개발일지(https://app.notion.com/p/41a14d0ef5508122aa10dd376742a5a4) **맨 아래에** 비전공자 눈높이 3줄(무엇을 / 왜 / 좋아진 점) 추가. 쓰기 직전에 본문을 다시 읽고 덧붙인다(다른 세션이 동시에 쓸 수 있음).

## 3-1. 학습함 되먹임
- 이번 작업에 쓴 소화 노트 후보가 있으면: 그 노트의 「개발 세션 상태」를 「반영함」(쓰지 않았으면 「참고만」), 원본 항목(🎨 디자인 학습함·📊 자료 수집함)의 상태를 「채택」·「도태」 / 「반영」·「제외」로 바꾼다. 채택한 원리는 `design/studies/`·`design/patterns/`에 옮긴 뒤에만 「채택」.

## 4. 태화님께 보고
- 무엇이 라이브에 반영됐는지(링크), 실기기로 확인해 줄 것 1~3개만 짧게.
