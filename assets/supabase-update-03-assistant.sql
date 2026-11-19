-- 직업상담 통합 자료실 · 개인 비서(자료실 비서) — 서버 암호화 BYOK (Google Gemini 전용)
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run.
-- 여러 번 실행해도 안전하다(있으면 건너뛴다). 적용 순서: supabase-setup.sql → 이 파일.
--
-- 설계 (assets/supabase-setup.sql 의 jc_users·jc_sessions 위에 얹는다)
-- - 키는 **Google Gemini 하나**만 받는다. 외부 임의 주소를 서버가 대신 부르는 길이 아예 없어
--   SSRF 위험이 없고, 모든 사용자가 같은 방식으로 구글 검색 교차 확인(google_search)을 쓸 수 있다.
-- - 사용자가 넣은 키는 **서버에서만** AES-256-GCM 으로 암호화해 보관한다.
--   암호를 푸는 열쇠(JC_KEY_MASTER_SECRET)는 Edge Function 환경변수에만 있고 DB 에는 없다.
-- - 표는 anon·authenticated 어느 쪽에서도 읽고 쓸 수 없다(RLS + revoke). 오직 Service Role 을 쓰는
--   Edge Function(assistant-proxy)만 만진다.
-- - 원본 키는 등록 응답에도 다시 나오지 않는다. 끝 4자리(key_last4)만 돌려준다.
-- - **질문·대화·검색어는 어디에도 저장하지 않는다.** 아래 이용 한도 표는 「몇 번 불렀는지」만 센다
--   (user_id, 분 단위 시각, 횟수). 내용 칸 자체가 없다.

-- ------------------------------------------------------------------ 1) 키 보관함

create table if not exists public.jc_user_api_keys (
  user_id        bigint not null references public.jc_users(id) on delete cascade,
  provider       text not null default 'gemini',
  key_ciphertext text not null,                       -- base64(AES-256-GCM 암호문+태그)
  key_iv         text not null,                       -- base64(12바이트 IV)
  key_last4      text not null,                       -- 화면에 보여 줄 끝 4자리
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, provider),
  constraint jc_user_api_keys_provider_chk check (provider = 'gemini')
);

alter table public.jc_user_api_keys enable row level security;
-- 사이트(anon)·로그인 사용자(authenticated)는 이 표를 **아예 못 본다**. 정책을 만들지 않는 것이 답이다.
revoke all on public.jc_user_api_keys from public, anon, authenticated;

comment on table public.jc_user_api_keys is
  '자료실 비서 BYOK 키 보관함(Google Gemini 전용). AES-256-GCM 암호문만 두며, 열쇠는 Edge Function 환경변수(JC_KEY_MASTER_SECRET)에만 있다. anon·authenticated 접근 전면 차단.';
comment on column public.jc_user_api_keys.key_ciphertext is
  'base64(iv‖ciphertext‖tag). AAD = user_id:provider 로 묶어 다른 행에 붙여 넣어도 풀리지 않는다.';

-- ------------------------------------------------------------------ 2) 이용 한도(내용 없음)

create table if not exists public.jc_assistant_usage (
  user_id      bigint not null references public.jc_users(id) on delete cascade,
  window_start timestamptz not null,                  -- 분 단위로 내림한 시각
  calls        int not null default 0,
  primary key (user_id, window_start)
);

alter table public.jc_assistant_usage enable row level security;
revoke all on public.jc_assistant_usage from public, anon, authenticated;

comment on table public.jc_assistant_usage is
  '자료실 비서 호출 횟수만 센다(질문·대화·검색어 저장 없음). Service Role 전용.';

-- 분당 한도: 남은 횟수를 돌려준다. 한도를 넘으면 -1.
-- 하루가 지난 줄은 이 함수가 부를 때 함께 지운다(따로 도는 청소 작업이 필요 없다).
create or replace function public.jc_assistant_take(p_user bigint, p_limit int default 12, p_window_sec int default 60)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_sec, 10)) * greatest(p_window_sec, 10));
  n int;
begin
  if p_user is null then return -1; end if;
  delete from public.jc_assistant_usage where window_start < now() - interval '1 day';
  insert into public.jc_assistant_usage(user_id, window_start, calls)
    values (p_user, w, 1)
    on conflict (user_id, window_start) do update set calls = public.jc_assistant_usage.calls + 1
    returning calls into n;
  if n > greatest(p_limit, 1) then return -1; end if;
  return greatest(p_limit, 1) - n;
end $$;

revoke all on function public.jc_assistant_take(bigint, int, int) from public, anon, authenticated;
grant execute on function public.jc_assistant_take(bigint, int, int) to service_role;

-- ------------------------------------------------------------------ 3) 확인

-- 키가 등록된 제공자만 보인다(원본 키·암호문은 select 하지 않는다).
-- select provider, key_last4, updated_at from public.jc_user_api_keys where user_id = 1;
--
-- 적용 확인: 두 표가 있고 RLS 가 켜져 있는지
-- select relname, relrowsecurity from pg_class where relname in ('jc_user_api_keys','jc_assistant_usage');
