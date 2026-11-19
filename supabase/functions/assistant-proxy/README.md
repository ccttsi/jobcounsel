# 자료실 비서 — 서버(Edge Function) 배포 안내

자료실 비서는 **브라우저 + Supabase Edge Function** 두 쪽으로 나뉩니다.

- 브라우저(`assistant/search.js` · `assets/assistant.js`): 자료실 색인으로 검색하고 화면을 그립니다.
  **키가 없어도 검색은 그대로 동작합니다.**
- 서버(`supabase/functions/assistant-proxy/index.ts`): 로그인 확인, Gemini 키 암호화 보관, Gemini 호출.
  키는 여기서만 풀립니다.

키는 **Google Gemini 하나**만 받습니다. 외부 임의 주소를 서버가 대신 부르는 길이 없어 SSRF 위험이 없고,
모든 사용자가 같은 방식으로 구글 검색 교차 확인(`google_search` 그라운딩)을 쓸 수 있습니다.

이 문서는 머지 뒤 **배포 단계**입니다. 코드는 이미 저장소에 있고, 아래를 한 번만 실행하면 됩니다.

---

## 0. 무엇이 어디에 저장되나

| 대상 | 어디에 | 내용 |
|---|---|---|
| 로그인 세션 | `jc_sessions` (기존 표) | 세션 토큰의 SHA-256 값, 만료 시각 |
| Gemini 키 | `jc_user_api_keys` | **AES-256-GCM 암호문**, IV, 끝 4자리 |
| 키를 푸는 열쇠 | Edge Function 환경변수 `JC_KEY_MASTER_SECRET` | DB 에는 없음 |
| 질문·대화·검색어 | **어디에도 저장하지 않음** | 서버 저장 표 없음, `console.log` 없음 |
| 대화 기록 | **사용자 브라우저(localStorage)** | 사용자가 직접 수정·삭제·전체 삭제 |
| 호출 횟수 | `jc_assistant_usage` | `user_id`, 분 단위 시각, 횟수 (내용 칸 없음) |

`jc_user_api_keys`·`jc_assistant_usage` 는 **RLS 를 켜고 anon·authenticated 권한을 전부 회수**합니다.
사이트 코드(공개 키)로는 읽을 수도 쓸 수도 없고, Service Role 을 쓰는 Edge Function 만 만집니다.

---

## 1. SQL 적용 (한 번)

Supabase 대시보드 → **SQL Editor** → New query 에
[`assets/supabase-update-03-assistant.sql`](../../assets/supabase-update-03-assistant.sql) 전체를 붙여 넣고 Run.

- `assets/supabase-setup.sql`(로그인·세션)이 먼저 적용되어 있어야 합니다.
- 여러 번 실행해도 안전합니다.

확인:

```sql
select relname, relrowsecurity from pg_class
where relname in ('jc_user_api_keys','jc_assistant_usage');
-- 둘 다 relrowsecurity = true
```

---

## 2. 함수 배포

프로젝트 폴더에서 Supabase CLI 로 실행합니다. (`supabase login` · `supabase link --project-ref vzxwdfswlolhcluljkgi` 먼저)

```bash
# 키 암호화 열쇠 — 32바이트 이상 아무 문자열. 한 번 정하면 바꾸지 않는다.
# 바꾸면 이미 등록된 키는 풀리지 않으므로 사용자가 다시 등록해야 한다.
supabase secrets set JC_KEY_MASTER_SECRET='<길고 무작위한 문자열>' \
  JC_ALLOW_ORIGINS='https://ccttsi.github.io'

# (선택) 1순위 모델 이름 — 비우면 아래 무료 폴백 체인을 그대로 쓴다
# supabase secrets set JC_GEMINI_MODEL='gemini-3.8-flash'

# 배포 — 세션 확인은 함수가 직접 하므로 Supabase JWT 검사는 끈다(사이트는 anon 키로 부른다).
supabase functions deploy assistant-proxy --no-verify-jwt
```

`SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 가 함수에 자동으로 넣어 줍니다.
Service Role 키는 **함수 안에서만** 쓰이고 브라우저로 나가지 않습니다.

**무료 한도 자동 폴백** — `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` 순으로, `429`(한도 초과)·`404`(내려간 모델)·`5xx`면 다음 무료 모델로 자동 전환합니다(무료 한도는 모델마다 따로 잡혀 있어 [모델별로 소진 시점이 다릅니다](https://aistudio.google.com/docs/rate-limits)). 실제 답한 모델은 응답 JSON 의 `model` 칸에 담기고, 키가 잘못된 `400·401·403`은 재시도하지 않고 바로 알려 줍니다. `3.7-flash` 는 `3.8-flash` 로 자동 라우팅되어 체인에서 뺐습니다.

부를 주소:

```
https://vzxwdfswlolhcluljkgi.supabase.co/functions/v1/assistant-proxy
```

---

## 3. 동작 확인

```bash
# 세션 없이 부르면 session 오류가 와야 정상
curl -s -X POST 'https://vzxwdfswlolhcluljkgi.supabase.co/functions/v1/assistant-proxy' \
  -H 'content-type: application/json' -d '{"action":"list_keys","session_token":"x"}'
# → {"ok":false,"error":"session",...}
```

사이트에서 확인할 것:

1. 로그인하지 않고 비서를 열어도 **검색 결과와 이동 링크**가 나온다.
2. 첫 안내 카드에서 「로그인하고 키 연결」 → 4단계 도해대로 Gemini 무료 키를 만들어 등록한다.
3. 같은 질문에 **AI 답변 + 자료실 근거 카드**가 나온다.
4. 「웹 교차 확인」을 켜면 **외부 확인(구글 검색)** 출처가 함께 나온다.
5. 「내 키」에서 **연결 테스트**를 누르면 인사 한 문장·걸린 시간(초)·답한 모델 이름이 나온다.
6. 대화 화면은 **답이 글자 단위로 실시간으로 이어지고**, 끝나면 근거 카드가 붙는다(마커 `[[REFS:…]]` 는 화면에 안 보인다).
7. 1분에 12번을 넘기면 「잠깐 쉬어 가요」 안내가 나온다.
8. 대화를 닫았다 열어도 유지되고, 「수정·다시·삭제·전체 삭제」가 동작한다.

---

## 4. 사용자에게 보여 주는 키 발급 안내 (30초)

비서의 「내 키」 탭과 첫 안내 카드에 4단계 도해(자체 제작 SVG)가 들어 있습니다.

1. <https://aistudio.google.com/apikey> 열기 → Google 계정 로그인 (무료, 결제 정보 불필요)
2. 오른쪽 위 **Create API key** 누르기
3. 프로젝트 고르고 **키 생성**
4. `AIza…` 키 **복사** → 비서 입력칸에 붙여 넣고 **키 등록**

> 화면 캡처는 쓰지 않습니다. 타사 웹페이지 이미지를 전재하지 않기 위해 도해는 직접 그린 SVG 입니다
> (`assistant/guides/gemini-key-1.svg` ~ `4.svg`).

---

## 5. 지키는 선 (코드에서 강제)

- 원본 키는 **응답에 다시 나오지 않습니다**(끝 4자리만). DB 에도 암호문만 둡니다.
- 암호문은 `AAD = user_id:gemini` 로 묶여 있어 다른 행에 복사해도 풀리지 않습니다.
- 질문은 1,200자, 근거는 6개·각 400자, 지금 열린 자료는 700자로 자릅니다.
- 근거 주소는 자료실 안 상대 경로만 받습니다(`/`, `./` 로 시작).
- 한 사용자 분당 12회. 401/403이면 「키가 거부되었습니다」, 무료 모델 한도를 모두 쓰면 「한도」로 알려 줍니다.
- 질의는 `stream: true` 면 **SSE** 로 글자를 바로 흘려보냅니다(첫 글자 전 `429·404·5xx` 면 다음 무료 모델로 갈아탐). 스트리밍 답은 평문이고 마지막 줄 `[[REFS:e1,e2]]` 만 근거 번호로 떼어 봅니다. `stream` 이 없으면 기존 JSON 응답 그대로입니다.
- 속도: `thinkingConfig.thinkingLevel='low'`, 웹 교차 확인이 꺼져 있으면 `google_search` 를 붙이지 않습니다(미지원 모델이 400 을 주면 그 설정만 빼고 재시도).
- CORS 는 `JC_ALLOW_ORIGINS`(기본 `https://ccttsi.github.io`)만 허용합니다.
- **질문·대화·검색어를 찍는 로그가 이 함수에 없습니다.** 오류도 내용 없이 코드로만 돌려줍니다.

---

## 6. 색인 다시 만들기

자료실 데이터가 바뀌면 색인도 다시 만듭니다.

```bash
python3 assistant/build_index.py          # assistant/data/index.json + index-dirs.json
python3 assistant/build_index.py --check  # 쓰지 않고 크기만 확인
```

- 원본 데이터는 읽기만 하고 바꾸지 않습니다.
- 섹터 목록은 `assets/tools.js` 에서 읽으므로 섹터가 늘면 자동으로 따라갑니다.
- 지금 크기: `index.json` 약 460KB · `index-dirs.json` 약 320KB (gzip 전송 시 각각 약 95KB).
