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
| 내 대화 기록함 | `jc_assistant_threads`·`jc_assistant_messages` | 대화방 제목·시각, 질문·답·근거·모드. **그 사용자만** |
| 로그아웃 때의 대화 | **사용자 브라우저(localStorage)** | 사용자가 직접 수정·삭제·전체 삭제 |
| 검색어 | 어디에도 저장하지 않음 | `console.log` 없음 |
| 호출 횟수 | `jc_assistant_usage` | `user_id`, 분 단위 시각, 횟수 (내용 칸 없음) |

`jc_user_api_keys`·`jc_assistant_usage`·`jc_assistant_threads`·`jc_assistant_messages` 는 **RLS 를 켜고
anon·authenticated 권한을 전부 회수**합니다. 사이트 코드(공개 키)로는 읽을 수도 쓸 수도 없고,
Service Role 을 쓰는 Edge Function 만 만집니다.

대화 기록함의 `user_id` 는 **언제나 세션 토큰의 SHA-256 을 `jc_sessions` 와 맞춰 정합니다** — 요청 본문의
`user_id` 는 아예 받지 않습니다. 모든 쿼리에 `user_id=eq.<세션 사용자>` 가 붙고, 메시지 표는
`(thread_id, user_id)` 복합 외래키라 남의 대화방 번호를 넣으면 DB 가 거부합니다.

---

## 1. SQL 적용 (한 번)

Supabase 대시보드 → **SQL Editor** → New query 에 두 파일을 차례로 붙여 넣고 Run.

1. [`assets/supabase-update-03-assistant.sql`](../../assets/supabase-update-03-assistant.sql) — 키 보관함·이용 한도
2. [`assets/supabase-update-04-assistant-history.sql`](../../assets/supabase-update-04-assistant-history.sql) — 내 대화 기록함(스레드·메시지)

- `assets/supabase-setup.sql`(로그인·세션)이 먼저 적용되어 있어야 합니다.
- 여러 번 실행해도 안전합니다.

확인:

```sql
select relname, relrowsecurity from pg_class
where relname in ('jc_user_api_keys','jc_assistant_usage',
                  'jc_assistant_threads','jc_assistant_messages');
-- 넷 다 relrowsecurity = true

select tablename, policyname from pg_policies
where tablename in ('jc_assistant_threads','jc_assistant_messages');
-- 0건이어야 정상(정책이 없으면 anon·authenticated 는 전부 거부)
```

---

## 2. 함수 배포

프로젝트 폴더에서 Supabase CLI 로 실행합니다. (`supabase login` · `supabase link --project-ref vzxwdfswlolhcluljkgi` 먼저)

```bash
# 키 암호화 열쇠 — 32바이트 이상 아무 문자열. 한 번 정하면 바꾸지 않는다.
# 바꾸면 이미 등록된 키는 풀리지 않으므로 사용자가 다시 등록해야 한다.
supabase secrets set JC_KEY_MASTER_SECRET='<길고 무작위한 문자열>' \
  JC_ALLOW_ORIGINS='https://witw.pages.dev,https://ccttsi.github.io,https://ccttsi.pages.dev'

# (선택) 1순위 모델 이름 — 비우면 아래 무료 폴백 체인을 그대로 쓴다
# supabase secrets set JC_GEMINI_MODEL='gemini-3.8-flash'

# 배포 — 세션 확인은 함수가 직접 하므로 Supabase JWT 검사는 끈다(사이트는 anon 키로 부른다).
supabase functions deploy assistant-proxy --no-verify-jwt
```

`SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 가 함수에 자동으로 넣어 줍니다.
Service Role 키는 **함수 안에서만** 쓰이고 브라우저로 나가지 않습니다.

**무료 한도 자동 폴백** — `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` 순으로, `429`(한도 초과)·`404`(내려간 모델)·`5xx`면 다음 무료 모델로 자동 전환합니다(무료 한도는 모델마다 따로 잡혀 있어 [모델별로 소진 시점이 다릅니다](https://aistudio.google.com/docs/rate-limits)). 실제 답한 모델은 응답 JSON 의 `model` 칸에 담기고, 키가 잘못된 `400·401·403`은 재시도하지 않고 바로 알려 줍니다. `3.7-flash` 는 `3.8-flash` 로 자동 라우팅되어 체인에서 뺐습니다.

**속도 상한** — 모델 한 번을 기다리는 시간은 일반 대화 12초(`MODEL_TIMEOUT_MS`), 연결 테스트 8초(`PING_TIMEOUT_MS`)입니다. 남은 시간이 줄면 다음 모델의 상한도 그만큼 깎이므로, 연결 테스트(`ping`)는 **9초 안**(`PING_DEADLINE_MS`)에 끝납니다. 연결 테스트는 `thinking` 을 끄고 `maxOutputTokens` 16으로 짧게 묻습니다.

부를 주소:

```
https://vzxwdfswlolhcluljkgi.supabase.co/functions/v1/assistant-proxy
```

함수가 받는 `action` (모두 `session_token` 이 필요하고, 사용자 번호는 토큰에서만 정합니다):

| action | 하는 일 |
|---|---|
| `list_keys` · `set_key` · `delete_key` | Gemini 키 목록(끝 4자리)·등록·삭제 |
| `ping` | 연결 테스트(「안녕하세요」 한 번) — `skipped`(건너뛴 모델·사유·HTTP 코드), 타임아웃·5xx면 `google_status` 도 함께 |
| `ask` | 자료실 근거로 답하기. `stream:true` 면 SSE `stage`(추론) → `delta`(글자) → `done` |
| `history_list` | 내 대화방 목록(최근 60개, 최근 순) |
| `history_get` | 대화방 하나의 메시지(최대 40개) |
| `history_save` | 대화방 저장(없으면 만들고, 있으면 그 자리에 다시 씀) — 상한 넘은 오래된 방은 정리 |
| `history_rename` | 제목 바꾸기(80자) |
| `history_delete` | 대화방 하나 지우기(메시지는 cascade) |
| `history_clear` | 내 대화 전부 비우기 |

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
5. 「내 키」에서 **연결 테스트**를 누르면 인사 한 문장·걸린 시간(초)·답한 모델 이름이 나온다. 그 아래에 **건너뛴 모델과 이유**(`gemini-3.8-flash 한도초과(429)` 처럼 모델명·사유·코드만)가 한 줄로 붙고, 타임아웃·5xx로 밀렸을 때는 **구글 공식 서버 상태**(`정상 (공식 장애 공지 없음)` 또는 `공식 장애/지연 공지 확인됨: …`)와 상태 페이지 링크가 함께 나온다.
6. 대화 화면은 **답이 글자 단위로 실시간으로 이어지고**, 끝나면 근거 카드가 붙는다(마커 `[[REFS:…]]` 는 화면에 안 보인다).
   기다리는 동안 답변 자리에 **검색 → 정리 → 추론 → 작성** 네 단계 막대가 차례로 차고, 끝나면 사라진다.
7. 1분에 12번을 넘기면 「잠깐 쉬어 가요」 안내가 나온다.
8. 「지난 대화」에 목록이 뜨고, 과거 대화를 열면 그 대화가 그대로 이어진다. `+ 새 대화`·제목 바꾸기·개별 삭제·
   전체 비우기가 동작하고, 다른 기기에서 로그인해도 같은 목록이 보인다.

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
- 선참조 지도(`map`: 섹터 32개까지)와 후보 섹터(`route`: 3개까지)도 같은 주소 규칙으로 검사한 뒤 프롬프트에 넣습니다.
- 한 사용자 분당 12회. 401/403이면 「키가 거부되었습니다」, 무료 모델 한도를 모두 쓰면 「한도」로 알려 줍니다.
- 연결 테스트의 진단에는 **모델명·사유·HTTP 코드**만 담습니다. 키·질문·오류 본문은 응답에도 로그에도 남기지 않습니다. 구글 상태 확인은 공개 피드(`status.cloud.google.com/incidents.json`)에서 **끝나지 않은(end 없는)** 인시던트 중 Gemini·Vertex·AI Studio 관련이 있는지만 2초 안에 봅니다(429·정상 응답 때는 부르지 않음).
- 질의는 `stream: true` 면 **SSE** 로 글자를 바로 흘려보냅니다(첫 글자 전 `429·404·5xx` 면 다음 무료 모델로 갈아탐). 스트리밍 답은 평문이고 마지막 줄 `[[REFS:e1,e2]]` 만 근거 번호로 떼어 봅니다. `stream` 이 없으면 기존 JSON 응답 그대로입니다.
- 속도: `thinkingConfig.thinkingLevel='low'`, 웹 교차 확인이 꺼져 있으면 `google_search` 를 붙이지 않습니다(미지원 모델이 400 을 주면 그 설정만 빼고 재시도).
- CORS 는 `JC_ALLOW_ORIGINS`(기본 `https://witw.pages.dev,https://ccttsi.github.io,https://ccttsi.pages.dev`)에 적은 출처만 허용합니다.
- **질문·대화·검색어를 찍는 로그가 이 함수에 없습니다.** 오류도 내용 없이 코드로만 돌려줍니다.

---

## 6. 색인 다시 만들기

자료실 데이터가 바뀌면 색인도 다시 만듭니다.

```bash
python3 assistant/build_index.py          # index.json + index-dirs.json + rag-preface.json
python3 assistant/build_index.py --check  # 쓰지 않고 크기만 확인
```

- 원본 데이터는 읽기만 하고 바꾸지 않습니다.
- 섹터 목록은 `assets/tools.js` 에서 읽으므로 섹터가 늘면 자동으로 따라갑니다.
- 지금 크기: `index.json` 약 540KB · `index-dirs.json` 약 313KB · 선참조 지도 `rag-preface.json` 약 30KB (gzip 전송 시 114KB · 89KB · 9KB).

### 선참조 지도(`assistant/data/rag-preface.json`)

비서가 **맨 먼저** 받는 작은 지도입니다. 색인(540KB)을 받기 전에 이걸로 ① 현장 약어를 정식 용어로
펼치고 ② 어느 섹터부터 볼지 좁힙니다. 서버 프롬프트에도 이 지도와 후보 섹터가 함께 가서,
답을 쓰기 전에 섹터를 먼저 확인하게 합니다(근거가 3건 미만일 때만 섹터 전체 목록도 붙입니다).

| 칸 | 내용 |
|---|---|
| `dict` | 약어 사전 — 원본은 `assistant/aliases.json`(정식 용어 · 현장말/쓰다 만 앞부분 · 먼저 볼 섹터 · 한 줄 설명) |
| `sectors` | 섹터마다 번호·제목·주소·배지·한 줄 설명·핵심 낱말·문서 수 |
| `terms` | 낱말 하나로 섹터를 바로 집는 길잡이(낱말 → 섹터) |

**약어를 더하거나 고칠 때는 `assistant/aliases.json` 만 손대고** `python3 assistant/build_index.py` 를 다시 돌립니다.
사전의 섹터 이름이 `assets/tools.js` 와 어긋나면 빌드가 실패하므로, 섹터를 지우거나 이름을 바꿀 때는
`aliases.json` 의 `s` 도 함께 고칩니다.

```bash
python3 ops/scripts/assistant_search_test.py   # 약어·선참조 검색 회귀(실제 Chromium)
```
