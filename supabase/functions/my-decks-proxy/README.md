# 마이덱 — 서버(Edge Function) 배포 안내

27번 「상담 플로우 아키텍트」에서 만든 **내 덱**과 마이덱 화면의 **공간 꾸미기 설정**을 계정에 보관하는 서버입니다.

- 브라우저(`assets/mydeck-store.js` · `flow/app.js` · `mydeck/app.js`): 덱을 만들고 보여 줍니다.
  **함수가 없어도 화면은 그대로 동작합니다** — 이때는 이 브라우저(localStorage)에만 저장하고 그 사실을 화면에 적습니다.
- 서버(`supabase/functions/my-decks-proxy/index.ts`): 로그인 확인과 저장·조회만 합니다. AI 호출도, 외부 주소 호출도 없습니다.

이 문서는 머지 뒤 **배포 단계**입니다. 코드는 이미 저장소에 있고, 아래를 한 번만 실행하면 됩니다.

---

## 0. 무엇이 어디에 저장되나

| 대상 | 어디에 | 내용 |
|---|---|---|
| 내 덱 | `jc_my_decks` | 덱 이름, 자료 순서(섹터 id·번호·제목·딱지), 만든/고친 시각. **그 사용자만** |
| 공간 꾸미기 | `jc_my_deck_prefs` | 테마(밝게·세피아·어둡게)마다 여섯 요소 선택값 + 자유 색 두 개 |
| 로그아웃 상태의 덱 | **사용자 브라우저(localStorage)** | `jc-mydeck-local` — 사용자가 직접 지울 수 있음 |
| 내담자 정보 | 어디에도 저장하지 않음 | 덱에는 자료 이름과 순서만 담습니다 |

두 표는 **RLS 를 켜고 anon·authenticated 권한을 전부 회수**합니다. 사이트 코드(공개 키)로는 읽을 수도 쓸 수도 없고,
Service Role 을 쓰는 Edge Function 만 만집니다. `user_id` 는 **언제나 세션 토큰의 SHA-256 을 `jc_sessions` 와 맞춰 정합니다** —
요청 본문의 `user_id` 는 아예 받지 않고, 모든 쿼리에 `user_id=eq.<세션 사용자>` 가 붙습니다.

---

## 1. SQL 적용 (한 번)

Supabase 대시보드 → **SQL Editor** → New query 에 붙여 넣고 Run.

1. [`assets/supabase-update-05-my-decks.sql`](../../assets/supabase-update-05-my-decks.sql) — 내 덱 · 공간 꾸미기 표

- `assets/supabase-setup.sql`(로그인·세션)이 먼저 적용되어 있어야 합니다.
- 여러 번 실행해도 안전합니다.

확인:

```sql
select relname, relrowsecurity from pg_class
where relname in ('jc_my_decks','jc_my_deck_prefs');
-- 둘 다 relrowsecurity = true

select tablename, policyname from pg_policies
where tablename in ('jc_my_decks','jc_my_deck_prefs');
-- 0건이어야 정상(정책이 없으면 anon·authenticated 는 전부 거부)
```

---

## 2. 함수 배포

프로젝트 폴더에서 Supabase CLI 로 실행합니다. (`supabase login` · `supabase link --project-ref vzxwdfswlolhcluljkgi` 먼저)

```bash
# 세션 확인은 함수가 직접 하므로 Supabase JWT 검사는 끈다(사이트는 세션 토큰으로 부른다).
supabase functions deploy my-decks-proxy --no-verify-jwt
```

환경변수는 **필요 없습니다**(AI 키를 쓰지 않습니다). 다른 출처를 쓰려면 `JC_ALLOW_ORIGINS` 만 선택으로 지정합니다.

```bash
supabase secrets set JC_ALLOW_ORIGINS='https://witw.pages.dev,https://ccttsi.github.io,https://ccttsi.pages.dev'
```

---

## 3. 배포 확인

```bash
# 로그인 없이 부르면 401 이 나와야 정상(session)
curl -s -X POST "https://vzxwdfswlolhcluljkgi.supabase.co/functions/v1/my-decks-proxy" \
  -H 'content-type: application/json' -d '{"action":"list"}' | head -c 200
```

화면에서는 **마이덱 페이지 상단 문구**로 확인합니다.

- 배포 전: "계정 저장소가 아직 준비되지 않아 지금은 이 기기에만 저장됩니다."
- 배포 뒤: "다른 기기에서 같은 아이디로 로그인해도 이 덱들이 보입니다."

배포하면 프론트엔드는 고칠 것이 없습니다 — 이미 배포된 주소로 다시 부르고, 성공하면 그때부터 계정 저장으로 바뀝니다.
