-- 직업상담 통합 자료실 · 추가 설정 02: 사이트 이용 통계(관리 페이지)
-- supabase-setup.sql, supabase-update-01-admin.sql을 실행한 뒤,
-- SQL Editor → New query 에 전체를 붙여 넣고 Run. 여러 번 실행해도 안전하다.
--
-- 무엇을 남기나 (개인정보 없음)
-- - 페이지를 열 때마다 한 줄: 시각, 어느 꼭지(theory, labor 같은 폴더 이름), 로그인 여부(예/아니오),
--   기기 종류(휴대폰·태블릿·PC), 이 브라우저에서 오늘 처음인지·전에 온 적 있는지(예/아니오),
--   탭에서 처음 연 페이지라면 어디서 왔는지(검색·SNS·다른 사이트의 도메인 이름만).
-- - 남기지 않는 것: IP 주소, 아이디, 쿠키·기기 고유번호, 전체 주소(쿼리·검색어), 화면에 입력한 내용.
--   어떤 줄도 특정 사람이나 계정과 이어지지 않는다.
-- - 관리자 화면에는 합계만 나온다. 400일이 지난 줄은 관리자 화면을 열 때 지운다.
-- - 계정 쪽은 "마지막으로 이용한 날짜"(시각 없이 날짜만)를 더해, 최근 이용 계정 수를 셀 수 있게 한다.

-- ───────── 방문 기록 표 ─────────
create table if not exists public.jc_hits (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  page   text not null check (page ~ '^[a-z0-9_-]{1,30}$'),
  auth   boolean not null default false,          -- 로그인한 상태였나
  entry  boolean not null default false,          -- 탭에서 처음 연 페이지(= 한 번의 방문)
  daily  boolean not null default false,          -- 이 브라우저에서 오늘 처음 연 페이지(= 하루 방문자)
  ret    boolean not null default false,          -- 그 전날 이전에도 온 적 있는 브라우저
  dev    text not null default 'd' check (dev in ('m','t','d')),
  src    text check (src in ('direct','search','social','link','campaign')),
  host   text check (host ~ '^[a-z0-9.-]{1,60}$')
);
create index if not exists jc_hits_at on public.jc_hits(at);
alter table public.jc_hits enable row level security;
revoke all on public.jc_hits from anon, authenticated;

-- 계정: 마지막으로 이용한 날짜(시각 없이)
alter table public.jc_users add column if not exists seen_on date;

-- ───────── 기록 함수(누구나 호출, 형식이 맞는 것만 받는다) ─────────
create or replace function public.jc_hit(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pg text := lower(coalesce(p->>'page',''));
  dv text := coalesce(p->>'dev','d');
  sr text := nullif(p->>'src','');
  hs text := lower(nullif(p->>'host',''));
  en boolean := coalesce((p->>'entry')::boolean, false);
begin
  if pg !~ '^[a-z0-9_-]{1,30}$' then return jsonb_build_object('error','bad'); end if;
  if dv not in ('m','t','d') then dv := 'd'; end if;
  if not en then sr := null; hs := null; end if;
  if sr is not null and sr not in ('direct','search','social','link','campaign') then sr := null; end if;
  if hs is not null then
    hs := regexp_replace(hs, '^(www|m|mobile)\.', '');
    if hs !~ '^[a-z0-9.-]{1,60}$' then hs := null; end if;
  end if;
  -- 넘치는 요청 막기: 1분에 600줄이 넘으면 받지 않는다
  if (select count(*) from public.jc_hits where at > now() - interval '1 minute') >= 600 then
    return jsonb_build_object('error','busy');
  end if;
  insert into public.jc_hits(page, auth, entry, daily, ret, dev, src, host)
  values (pg, coalesce((p->>'auth')::boolean,false), en, coalesce((p->>'daily')::boolean,false),
          coalesce((p->>'ret')::boolean,false), dv, sr, hs);
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('error','bad');
end $$;

-- 받기: 기존 동작 + 오늘 날짜를 마지막 이용일로(하루 한 번만 쓴다)
create or replace function public.jc_pull(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid bigint := public.jc_uid(p_token); r public.jc_users%rowtype;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if uid is null then return jsonb_build_object('error','session'); end if;
  select * into r from public.jc_users where id = uid;
  if r.seen_on is distinct from today then
    update public.jc_users set seen_on = today where id = uid;
  end if;
  return jsonb_build_object('username', r.username, 'admin', r.is_admin, 'data', r.data, 'updated_at', r.updated_at);
end $$;

-- ───────── 관리자 전용: 한눈에 보는 통계 ─────────
create or replace function public.jc_admin_dash(p_token text, p_days int default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid bigint := public.jc_uid(p_token);
  n int := greatest(1, least(coalesce(p_days, 30), 365));
  tz text := 'Asia/Seoul';
  today date := (now() at time zone 'Asia/Seoul')::date;
  d0 date := today - (n - 1);
  t0 timestamptz := (d0::timestamp at time zone 'Asia/Seoul');
  p0 timestamptz := ((d0 - n)::timestamp at time zone 'Asia/Seoul');
  acc jsonb; tr jsonb;
begin
  if uid is null then return jsonb_build_object('error','session'); end if;
  if not exists (select 1 from public.jc_users where id = uid and is_admin) then return jsonb_build_object('error','forbidden'); end if;

  delete from public.jc_hits where at < now() - interval '400 days';

  acc := jsonb_build_object(
    'users',    (select count(*) from public.jc_users),
    'members',  (select count(*) from public.jc_users where not is_admin),
    'admins',   (select count(*) from public.jc_users where is_admin),
    'new_today',(select count(*) from public.jc_users where not is_admin and (created_at at time zone tz)::date = today),
    'new7',     (select count(*) from public.jc_users where not is_admin and (created_at at time zone tz)::date > today - 7),
    'new30',    (select count(*) from public.jc_users where not is_admin and (created_at at time zone tz)::date > today - 30),
    'new_range',(select count(*) from public.jc_users where not is_admin and created_at >= t0),
    'active1',  (select count(*) from public.jc_users where not is_admin and seen_on = today),
    'active7',  (select count(*) from public.jc_users where not is_admin and seen_on > today - 7),
    'active30', (select count(*) from public.jc_users where not is_admin and seen_on > today - 30),
    'devices',  (select count(*) from public.jc_sessions s join public.jc_users u on u.id = s.user_id where not u.is_admin and s.expires_at > now()),
    'signups',  (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'n', coalesce(c.n,0)) order by g.d), '[]'::jsonb)
                 from generate_series(d0, today, interval '1 day') as g(d)
                 left join (select (created_at at time zone tz)::date as d, count(*) as n from public.jc_users
                            where not is_admin and created_at >= t0 group by 1) c on c.d = g.d::date)
  );

  with h as (select *, (at at time zone tz) as lt from public.jc_hits where at >= t0)
  select jsonb_build_object(
    'pv',          (select count(*) from h),
    'visits',      (select count(*) from h where entry),
    'visitors',    (select count(*) from h where daily),
    'new_visitors',(select count(*) from h where daily and not ret),
    'auth_pv',     (select count(*) from h where auth),
    'auth_visits', (select count(*) from h where entry and auth),
    'auth_visitors',(select count(*) from h where daily and auth),
    'today_pv',    (select count(*) from h where lt::date = today),
    'today_visitors',(select count(*) from h where lt::date = today and daily),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'pv', coalesce(c.pv,0), 'vis', coalesce(c.vis,0), 'apv', coalesce(c.apv,0)) order by g.d), '[]'::jsonb)
             from generate_series(d0, today, interval '1 day') as g(d)
             left join (select lt::date as d, count(*) as pv, count(*) filter (where daily) as vis, count(*) filter (where auth) as apv from h group by 1) c on c.d = g.d::date),
    'hours', (select coalesce(jsonb_agg(coalesce(c.n,0) order by g.hr), '[]'::jsonb)
              from generate_series(0,23) as g(hr)
              left join (select extract(hour from lt)::int as hr, count(*) as n from h group by 1) c on c.hr = g.hr),
    'weekdays', (select coalesce(jsonb_agg(coalesce(c.n,0) order by g.w), '[]'::jsonb)
              from generate_series(0,6) as g(w)
              left join (select extract(dow from lt)::int as w, count(*) as n from h group by 1) c on c.w = g.w),
    'pages', (select coalesce(jsonb_agg(x order by (x->>'pv')::int desc), '[]'::jsonb) from (
               select jsonb_build_object('page', page, 'pv', count(*), 'visits', count(*) filter (where entry), 'apv', count(*) filter (where auth)) as x
               from h group by page) q),
    'sources', (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb) from (select coalesce(src,'direct') as s, count(*) as c from h where entry group by 1) q),
    'hosts', (select coalesce(jsonb_agg(jsonb_build_object('host', host, 'src', src, 'n', c) order by c desc), '[]'::jsonb) from (
               select host, min(src) as src, count(*) as c from h where entry and host is not null group by host order by count(*) desc limit 20) q),
    'devices', (select coalesce(jsonb_object_agg(dev, c), '{}'::jsonb) from (select dev, count(*) as c from h where daily group by dev) q),
    'prev', (select jsonb_build_object('pv', count(*), 'visitors', count(*) filter (where daily), 'visits', count(*) filter (where entry))
             from public.jc_hits where at >= p0 and at < t0),
    'since', (select min(at) from public.jc_hits)
  ) into tr;

  return jsonb_build_object('days', n, 'from', d0, 'to', today, 'at', now(), 'accounts', acc, 'traffic', tr);
end $$;

revoke all on function public.jc_admin_dash(text,int) from public;
revoke all on function public.jc_hit(jsonb) from public;
grant execute on function public.jc_hit(jsonb), public.jc_pull(text), public.jc_admin_dash(text,int) to anon, authenticated;
