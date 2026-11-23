-- 직업상담 통합 자료실 · 가입 횟수·동기화 용량 상한 (2026-11-23 대중 공개 전 점검, 태화님 지시)
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 안전하다.
-- 적용 순서: supabase-setup.sql → update-01 … 05 → 이 파일.
--
-- 왜
--   · jc_signup 에 횟수 제한이 없어, 봇이 계정을 무한정 만들 수 있었다(가입마다 bcrypt 연산 → 무료 DB 부담).
--     → 사이트 전체에서 **최근 1시간 가입 30건**을 넘으면 잠시 받지 않는다('busy').
--   · jc_push 에 용량 상한이 없어, 한 계정이 동기화 칸에 큰 덩어리를 계속 밀어 넣을 수 있었다.
--     → 사람이 형광펜·포스트잇·화면 설정을 아주 많이 써도 닿지 않는 선으로 막는다('too_big'):
--        항목 하나 200KB · 항목 수 300개 · 계정 전체 1MB.
--     (2026-11-23 실측: 계정 1개 · 1.1KB · 항목 9개. 동기화 대상은 assets/sync.js 의 SYNC_RE —
--      페이지별 형광펜·포스트잇(jc-marks:…), 이론 위키 스크랩, 화면 설정 몇 개뿐이다.)
--   두 함수 모두 «거절»만 하고 이미 저장된 것은 지우지 않는다.

create index if not exists jc_users_created_at_idx on public.jc_users (created_at);

create or replace function public.jc_signup(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u text := lower(trim(coalesce(p_username,''))); uid bigint;
begin
  if u !~ '^[a-z0-9_]{4,20}$' then return jsonb_build_object('error','bad_username'); end if;
  if public.jc_reserved(u) then return jsonb_build_object('error','reserved'); end if;
  if length(coalesce(p_password,'')) < 8 or length(p_password) > 72 then return jsonb_build_object('error','bad_password'); end if;
  -- 사이트 전체 가입 속도 상한: 최근 1시간 30건 (비밀번호 해시를 만들기 전에 거른다)
  if (select count(*) from public.jc_users where created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('error','busy');
  end if;
  if exists (select 1 from public.jc_users where username = u) then return jsonb_build_object('error','taken'); end if;
  insert into public.jc_users(username, pass_hash) values (u, extensions.crypt(p_password, extensions.gen_salt('bf', 10))) returning id into uid;
  return jsonb_build_object('token', public.jc_new_session(uid), 'username', u, 'admin', false, 'data', '{"v":1,"keys":{}}'::jsonb);
exception when unique_violation then return jsonb_build_object('error','taken');
end $$;

create or replace function public.jc_push(p_token text, p_keys jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid bigint := public.jc_uid(p_token); cur jsonb; merged jsonb;
begin
  if uid is null then return jsonb_build_object('error','session'); end if;
  if jsonb_typeof(p_keys) <> 'object' then return jsonb_build_object('error','bad_data'); end if;
  -- 한 번에 올리는 덩어리 자체가 계정 상한을 넘으면 읽기 전에 거절한다
  if octet_length(p_keys::text) > 1048576 then return jsonb_build_object('error','too_big'); end if;
  -- 항목 하나 200KB 상한
  if exists (select 1 from jsonb_each(p_keys) e where octet_length(e.value::text) > 204800) then
    return jsonb_build_object('error','too_big');
  end if;
  select coalesce(data->'keys','{}'::jsonb) into cur from public.jc_users where id = uid for update;
  select cur || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into merged
    from jsonb_each(p_keys) e
   where e.key ~ '^[A-Za-z0-9_:/.\\-]{1,200}$'
     and jsonb_typeof(e.value) = 'object'
     and coalesce((cur->e.key->>'t')::bigint, 0) < coalesce((e.value->>'t')::bigint, 0);
  -- 합친 결과 기준: 항목 300개 · 계정 전체 1MB
  if (select count(*) from jsonb_object_keys(merged)) > 300 or octet_length(merged::text) > 1048576 then
    return jsonb_build_object('error','too_big');
  end if;
  update public.jc_users set data = jsonb_build_object('v',1,'keys',merged), updated_at = now() where id = uid;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('v',1,'keys',merged));
end $$;
