-- 직업상담 통합 자료실 · 추가 설정 01: 관리자와 가입자 수
-- supabase-setup.sql을 실행한 뒤, SQL Editor → New query 에 전체를 붙여 넣고 Run. 여러 번 실행해도 안전하다.
--
-- - admin, root 같은 관리자용 아이디는 사이트에서 가입할 수 없다.
-- - 관리자 계정은 이 SQL Editor에서만 만든다(맨 아래 안내 참고).
-- - 관리자만 가입자 수를 볼 수 있다. 개별 아이디나 기록은 사이트에서 누구에게도 보여 주지 않는다.

alter table public.jc_users add column if not exists is_admin boolean not null default false;

create or replace function public.jc_reserved(u text) returns boolean
language sql immutable set search_path = '' as $$
  select u ~ 'admin' or u ~ '^(root|manager|operator|owner|master|system|sysop|staff|support|moderator|jobcounsel|webmaster)[0-9_]*$'
$$;
revoke all on function public.jc_reserved(text) from public, anon, authenticated;

-- 가입: 관리자용 아이디 막기
create or replace function public.jc_signup(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u text := lower(trim(coalesce(p_username,''))); uid bigint;
begin
  if u !~ '^[a-z0-9_]{4,20}$' then return jsonb_build_object('error','bad_username'); end if;
  if public.jc_reserved(u) then return jsonb_build_object('error','reserved'); end if;
  if length(coalesce(p_password,'')) < 8 or length(p_password) > 72 then return jsonb_build_object('error','bad_password'); end if;
  if exists (select 1 from public.jc_users where username = u) then return jsonb_build_object('error','taken'); end if;
  insert into public.jc_users(username, pass_hash)
    values (u, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
    returning id into uid;
  return jsonb_build_object('token', public.jc_new_session(uid), 'username', u, 'admin', false, 'data', '{"v":1,"keys":{}}'::jsonb);
exception when unique_violation then
  return jsonb_build_object('error','taken');
end $$;

-- 로그인: 관리자 여부를 함께 돌려준다
create or replace function public.jc_login(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u text := lower(trim(coalesce(p_username,''))); r public.jc_users%rowtype;
begin
  select * into r from public.jc_users where username = u;
  if not found then
    perform extensions.crypt(coalesce(p_password,''), extensions.gen_salt('bf', 10));
    return jsonb_build_object('error','bad_login');
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('error','locked','until', r.locked_until);
  end if;
  if r.pass_hash = extensions.crypt(coalesce(p_password,''), r.pass_hash) then
    update public.jc_users set fails = 0, locked_until = null where id = r.id;
    return jsonb_build_object('token', public.jc_new_session(r.id), 'username', r.username, 'admin', r.is_admin, 'data', r.data);
  end if;
  update public.jc_users
    set fails = case when r.fails + 1 >= 10 then 0 else r.fails + 1 end,
        locked_until = case when r.fails + 1 >= 10 then now() + interval '15 minutes' else null end
    where id = r.id;
  return jsonb_build_object('error','bad_login');
end $$;

create or replace function public.jc_pull(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid bigint := public.jc_uid(p_token); r public.jc_users%rowtype;
begin
  if uid is null then return jsonb_build_object('error','session'); end if;
  select * into r from public.jc_users where id = uid;
  return jsonb_build_object('username', r.username, 'admin', r.is_admin, 'data', r.data, 'updated_at', r.updated_at);
end $$;

-- 관리자 전용: 가입자 수
create or replace function public.jc_admin_stats(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid bigint := public.jc_uid(p_token);
begin
  if uid is null then return jsonb_build_object('error','session'); end if;
  if not exists (select 1 from public.jc_users where id = uid and is_admin) then return jsonb_build_object('error','forbidden'); end if;
  return jsonb_build_object(
    'users',      (select count(*) from public.jc_users),
    'members',    (select count(*) from public.jc_users where not is_admin),
    'last7',      (select count(*) from public.jc_users where not is_admin and created_at > now() - interval '7 days'),
    'at',         now());
end $$;

-- SQL Editor 전용: 관리자 계정 만들기(또는 이미 있는 계정을 관리자로 지정)
-- 임시 비밀번호를 돌려준다. 사이트에서 이 비밀번호로 로그인한 뒤 바로 "비밀번호 바꾸기"를 한다.
create or replace function public.jc_create_admin(p_username text default 'admin') returns text
language plpgsql security definer set search_path = '' as $$
declare u text := lower(trim(p_username)); tmp text := encode(extensions.gen_random_bytes(9), 'base64');
begin
  if u !~ '^[a-z0-9_]{4,20}$' then raise exception '아이디는 영문 소문자·숫자·밑줄 4~20자'; end if;
  tmp := translate(tmp, '+/=', 'xyz');
  insert into public.jc_users(username, pass_hash, is_admin)
    values (u, extensions.crypt(tmp, extensions.gen_salt('bf', 10)), true)
  on conflict (username) do update set pass_hash = excluded.pass_hash, is_admin = true, fails = 0, locked_until = null;
  delete from public.jc_sessions where user_id = (select id from public.jc_users where username = u);
  return '아이디: ' || u || ' / 임시 비밀번호: ' || tmp || '  → 사이트에서 로그인한 뒤 바로 비밀번호를 바꾸세요';
end $$;
revoke all on function public.jc_create_admin(text) from public, anon, authenticated;

revoke all on function public.jc_admin_stats(text) from public;
grant execute on function public.jc_signup(text,text), public.jc_login(text,text), public.jc_pull(text), public.jc_admin_stats(text) to anon, authenticated;

-- ─────────────────────────────────────────────
-- 관리자 계정 만들기: 위 내용을 실행한 뒤, 새 쿼리에 아래 한 줄만 넣고 Run
--   select public.jc_create_admin('admin');
-- 결과 칸에 나온 임시 비밀번호로 사이트에서 admin 로그인 → 내 계정 → 비밀번호 바꾸기
-- ─────────────────────────────────────────────
