-- 직업상담 통합 자료실 · 기기 간 연동 저장소 설정
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run.
-- 여러 번 실행해도 안전하다(이미 있으면 건너뛰거나 덮어쓴다).
--
-- 설계
-- - 아이디와 비밀번호만 받는다. 이메일·이름·연락처는 받지 않는다.
-- - 비밀번호는 bcrypt(되돌릴 수 없는 암호화)로만 저장한다. 운영자도 원래 비밀번호를 볼 수 없다.
-- - 표(jc_users, jc_sessions)는 누구도 직접 읽고 쓸 수 없다. 아래 jc_* 함수를 거쳐서만, 자기 기록만 다룬다.
-- - 로그인하면 무작위 세션 토큰을 주고, 서버에는 그 토큰의 SHA-256 값만 둔다(180일 유효).
-- - 같은 아이디로 비밀번호를 10번 틀리면 15분 동안 잠근다.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.jc_users (
  id          bigint generated always as identity primary key,
  username    text not null unique check (username ~ '^[a-z0-9_]{4,20}$'),
  pass_hash   text not null,
  data        jsonb not null default '{"v":1,"keys":{}}'::jsonb check (pg_column_size(data) < 2000000),
  fails       int not null default 0,
  locked_until timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.jc_sessions (
  token_hash  text primary key,
  user_id     bigint not null references public.jc_users(id) on delete cascade,
  expires_at  timestamptz not null
);
create index if not exists jc_sessions_user on public.jc_sessions(user_id);

alter table public.jc_users enable row level security;
alter table public.jc_sessions enable row level security;
revoke all on public.jc_users, public.jc_sessions from anon, authenticated;

-- 내부용: 세션 토큰 → 사용자 번호
create or replace function public.jc_uid(p_token text) returns bigint
language sql stable security definer set search_path = '' as $$
  select s.user_id from public.jc_sessions s
  where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
    and s.expires_at > now()
$$;
revoke all on function public.jc_uid(text) from public, anon, authenticated;

-- 내부용: 새 세션
create or replace function public.jc_new_session(p_user bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from public.jc_sessions where user_id = p_user and expires_at < now();
  insert into public.jc_sessions(token_hash, user_id, expires_at)
    values (encode(extensions.digest(t, 'sha256'), 'hex'), p_user, now() + interval '180 days');
  return t;
end $$;
revoke all on function public.jc_new_session(bigint) from public, anon, authenticated;

-- 가입
create or replace function public.jc_signup(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u text := lower(trim(coalesce(p_username,''))); uid bigint;
begin
  if u !~ '^[a-z0-9_]{4,20}$' then return jsonb_build_object('error','bad_username'); end if;
  if length(coalesce(p_password,'')) < 8 or length(p_password) > 72 then return jsonb_build_object('error','bad_password'); end if;
  if exists (select 1 from public.jc_users where username = u) then return jsonb_build_object('error','taken'); end if;
  insert into public.jc_users(username, pass_hash)
    values (u, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
    returning id into uid;
  return jsonb_build_object('token', public.jc_new_session(uid), 'username', u, 'data', '{"v":1,"keys":{}}'::jsonb);
exception when unique_violation then
  return jsonb_build_object('error','taken');
end $$;

-- 로그인
create or replace function public.jc_login(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u text := lower(trim(coalesce(p_username,''))); r public.jc_users%rowtype;
begin
  select * into r from public.jc_users where username = u;
  if not found then
    perform extensions.crypt(coalesce(p_password,''), extensions.gen_salt('bf', 10));  -- 없는 아이디도 같은 시간이 걸리게
    return jsonb_build_object('error','bad_login');
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('error','locked','until', r.locked_until);
  end if;
  if r.pass_hash = extensions.crypt(coalesce(p_password,''), r.pass_hash) then
    update public.jc_users set fails = 0, locked_until = null where id = r.id;
    return jsonb_build_object('token', public.jc_new_session(r.id), 'username', r.username, 'data', r.data);
  end if;
  update public.jc_users
    set fails = case when r.fails + 1 >= 10 then 0 else r.fails + 1 end,
        locked_until = case when r.fails + 1 >= 10 then now() + interval '15 minutes' else null end
    where id = r.id;
  return jsonb_build_object('error','bad_login');
end $$;

-- 기록 받기
create or replace function public.jc_pull(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid bigint := public.jc_uid(p_token); r public.jc_users%rowtype;
begin
  if uid is null then return jsonb_build_object('error','session'); end if;
  select * into r from public.jc_users where id = uid;
  return jsonb_build_object('username', r.username, 'data', r.data, 'updated_at', r.updated_at);
end $$;

-- 기록 올리기: 항목별로 더 최근(t가 큰) 것만 반영해 두 기기가 동시에 써도 서로 지우지 않는다
create or replace function public.jc_push(p_token text, p_keys jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid bigint := public.jc_uid(p_token); cur jsonb; merged jsonb;
begin
  if uid is null then return jsonb_build_object('error','session'); end if;
  if jsonb_typeof(p_keys) <> 'object' then return jsonb_build_object('error','bad_data'); end if;
  select coalesce(data->'keys','{}'::jsonb) into cur from public.jc_users where id = uid for update;
  select cur || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into merged
    from jsonb_each(p_keys) e
    where e.key ~ '^[A-Za-z0-9_:/.\-]{1,200}$'
      and jsonb_typeof(e.value) = 'object'
      and coalesce((cur->e.key->>'t')::bigint, 0) < coalesce((e.value->>'t')::bigint, 0);
  update public.jc_users set data = jsonb_build_object('v',1,'keys',merged), updated_at = now() where id = uid;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('v',1,'keys',merged));
end $$;

-- 로그아웃(이 기기의 세션만)
create or replace function public.jc_logout(p_token text) returns jsonb
language sql security definer set search_path = '' as $$
  delete from public.jc_sessions where token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex');
  select jsonb_build_object('ok', true);
$$;

-- 계정과 기록 완전 삭제(비밀번호를 한 번 더 확인)
create or replace function public.jc_delete_account(p_token text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid bigint := public.jc_uid(p_token); r public.jc_users%rowtype;
begin
  if uid is null then return jsonb_build_object('error','session'); end if;
  select * into r from public.jc_users where id = uid;
  if r.pass_hash <> extensions.crypt(coalesce(p_password,''), r.pass_hash) then return jsonb_build_object('error','bad_login'); end if;
  delete from public.jc_users where id = uid;   -- 세션도 함께 지워진다
  return jsonb_build_object('ok', true);
end $$;

-- 비밀번호 바꾸기
create or replace function public.jc_change_password(p_token text, p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid bigint := public.jc_uid(p_token); r public.jc_users%rowtype;
begin
  if uid is null then return jsonb_build_object('error','session'); end if;
  if length(coalesce(p_new,'')) < 8 or length(p_new) > 72 then return jsonb_build_object('error','bad_password'); end if;
  select * into r from public.jc_users where id = uid;
  if r.pass_hash <> extensions.crypt(coalesce(p_old,''), r.pass_hash) then return jsonb_build_object('error','bad_login'); end if;
  update public.jc_users set pass_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id = uid;
  delete from public.jc_sessions where user_id = uid and token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end $$;

-- 사이트(anon 키)는 위 공개 함수만 부를 수 있다
revoke all on function public.jc_signup(text,text), public.jc_login(text,text), public.jc_pull(text), public.jc_push(text,jsonb),
  public.jc_logout(text), public.jc_delete_account(text,text), public.jc_change_password(text,text,text) from public;
grant execute on function public.jc_signup(text,text), public.jc_login(text,text), public.jc_pull(text), public.jc_push(text,jsonb),
  public.jc_logout(text), public.jc_delete_account(text,text), public.jc_change_password(text,text,text) to anon, authenticated;
