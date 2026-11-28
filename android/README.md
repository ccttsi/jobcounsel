# 자료실 위젯 (갤럭시 홈 화면 · 알림창 · 잠금화면)

태화님 폰 전용 안드로이드 앱이다. 오늘의 **브리핑**과 **이머징 인더스트리**를 한 장씩 넘겨 본다.
웹사이트 화면과는 따로 움직이고, 사이트가 이미 공개하는 `briefing/data/briefing.json`·`emerging/data/emerging.json`을 **읽기만** 한다.
기기 보관 예외의 범위는 헌법 3-1에 있다. 앱에는 오늘 판만 두고, 새 판이 오면 덮어쓴다.

## 설치

1. 폰 브라우저로 https://github.com/ccttsi/jobcounsel/releases/download/widget-latest/witw-widget.apk 를 연다.
2. 받은 파일을 누른다. 처음이면 「출처를 알 수 없는 앱 설치」를 그 브라우저에 한 번 허용한다.
3. 「자료실 위젯」 앱을 연다.
   - 「홈 화면에 놓기」를 누르면 위젯이 놓인다.
   - 「알림창·잠금화면에 띄우기」를 켜면 알림창에도 카드가 뜬다.

## 무엇이 보이나

- **홈 위젯**(브리핑·이머징 각각, 크기 조절 가능)
  - 맨 위에 지면·날짜, 몇 번째 장인지, 새로 받기 단추.
  - 가운데에 갈래·제목·부제·요약.
  - 아래에 ◀ · 핵심 수치 · ▶.
  - 가운데를 누르면 자료실의 그 카드가 열린다(`/briefing/#<카드 id>`, `/emerging/#i<n>`).
  - 첫 장은 그날 판의 표지(제목과 카드 목록)다.
- **알림창·잠금화면**: 소리·진동 없이 고정된 알림 한 장. 「◀ 이전 · 다음 ▶ · 지면 바꾸기」 단추가 있다.
  - 밀어서 지우면 다음 판이 올 때까지 다시 뜨지 않는다.
  - 잠금화면에 내용까지 보이려면 폰 설정 › 잠금화면 › 알림에서 «내용 표시»를 고른다.
- **갱신**: 인터넷이 될 때 세 시간마다 확인한다. 날짜가 바뀐 판이 오면 첫 장부터 보여 준다.

## 개발

- 순수 Kotlin + 안드로이드 기본 API만 쓴다(AndroidX 없음). minSdk 29 · targetSdk 35.
- 빌드: `cd android && ./gradlew assembleRelease` (`local.properties`에 `sdk.dir`가 필요하다).
- CI: `.github/workflows/android-apk.yml`
  - PR이면 빌드와 lint까지만 돌린다.
  - main이면 릴리스 `widget-latest`의 APK를 새 파일로 바꾼다.
- 서명:
  - GitHub Secrets `ANDROID_KEYSTORE_B64`·`ANDROID_KEYSTORE_PASS`가 있으면 그 열쇠로 서명한다.
  - 없으면 디버그 열쇠로 서명한다. 이때는 새 버전을 깔기 전에 앱을 지워야 한다.
- 이 폴더는 배포판에서 막아 둔다(`functions/_middleware.js`의 `INTERNAL_DIRS`).
