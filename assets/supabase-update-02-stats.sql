-- 직업상담 통합 자료실 · 추가 설정 02: 사이트 이용 통계(관리 페이지)
-- supabase-setup.sql, supabase-update-01-admin.sql을 실행한 뒤,
-- SQL Editor → New query 에 전체를 붙여 넣고 Run. 여러 번 실행해도 안전하다.
-- 이 파일이 고쳐지면(예: 체류 시간 추가 2026-11-15, 방문자·관리측 분리 2026-11-24) 전체를 다시 한 번 Run 하면 된다.
--
-- 무엇을 남기나 (개인정보 없음)
-- - 페이지를 열 때마다 한 줄: 시각, 어느 꼭지(theory, labor 같은 폴더 이름), 로그인 여부(예/아니오),
--   기기 종류(휴대폰·태블릿·PC), 이 브라우저에서 오늘 처음인지·전에 온 적 있는지(예/아니오),
--   탭에서 처음 연 페이지라면 어디서 왔는지(검색·SNS·다른 사이트의 도메인 이름만),
--   자료실 안에서 옮겨 왔다면 바로 앞 꼭지 이름(예: 첫 화면에서 눌러 들어옴),
--   그 페이지를 실제로 보고 있던 시간(초, 5분 넘게 손대지 않으면 멈춤, 한 번에 최대 30분),
--   그리고 그 줄이 어느 쪽 접속인지(scope — 아래).
--   체류 시간을 이어 적기 위해 페이지를 열 때마다 새로 만드는 무작위 표(k)를 함께 둔다.
--   이 표는 저장하지 않고 페이지를 닫으면 버려지므로 다른 방문과 이어지지 않는다.
-- - 남기지 않는 것: IP 주소, 아이디, 쿠키·기기 고유번호, 전체 주소(쿼리·검색어), 화면에 입력한 내용.
--   어떤 줄도 특정 사람이나 계정과 이어지지 않는다.
-- - 관리자 화면에는 합계만 나온다. 400일이 지난 줄은 관리자 화면을 열 때 지운다.
-- - 계정 쪽은 "마지막으로 이용한 날짜"(시각 없이 날짜만)를 더해, 최근 이용 계정 수를 셀 수 있게 한다.
--
-- 접속을 두 갈래로 나눈다 (2026-11-24 태화님 지시)
-- - scope 'user'    : 방문자 — 외부에서 온 실질 이용자. 관리 페이지의 「방문자」 탭에 나온다(기본).
-- - scope 'admin'   : 관리측 — 태화님(관리자 로그인, 이 기기 관리측 표시)과 피클·클로드·MCP 같은
--                     자동화 브라우저(webdriver·HeadlessChrome·Playwright·Puppeteer). 「관리측」 탭에 나온다.
--   분류는 화면(assets/sync.js)이 보내는 scope 값을 그대로 따르고, 모르는 값은 'user'로 받는다.
--   이 업데이트 전에 쌓인 줄은 모두 'user'다 — 그때는 관리자 줄을 아예 보내지 않았고, 피클·클로드 점검
--   접속은 걸러지지 않아 방문자 쪽에 섞여 있다. 지난 줄은 나중에 되돌려 나눌 수 없다.

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
alter table public.jc_hits add column if not exists via  text check (via ~ '^[a-z0-9_-]{1,30}$');   -- 자료실 안에서 옮겨 온 앞 꼭지
alter table public.jc_hits add column if not exists k    text check (k ~ '^[a-f0-9]{16,32}$');      -- 이 열람 한 번만의 무작위 표
alter table public.jc_hits add column if not exists stay int  check (stay between 0 and 1800);      -- 보고 있던 시간(초)
create index if not exists jc_hits_k on public.jc_hits(k) where k is not null;
-- 방문자/관리측 구분. 이미 있는 표에는 지난 줄이 전부 'user'로 채워진다.
alter table public.jc_hits add column if not exists scope text not null default 'user';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jc_hits_scope_chk' and conrelid = 'public.jc_hits'::regclass) then
    alter table public.jc_hits add constraint jc_hits_scope_chk check (scope in ('user','admin'));
  end if;
end $$;
create index if not exists jc_hits_scope_at on public.jc_hits(scope, at desc);
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
  vi text := lower(nullif(p->>'via',''));
  kk text := lower(nullif(p->>'k',''));
  scp text := lower(coalesce(nullif(p->>'scope',''), 'user'));
begin
  if vi is not null and vi !~ '^[a-z0-9_-]{1,30}$' then vi := null; end if;
  if kk is not null and kk !~ '^[a-f0-9]{16,32}$' then kk := null; end if;
  if pg !~ '^[a-z0-9_-]{1,30}$' then return jsonb_build_object('error','bad'); end if;
  if dv not in ('m','t','d') then dv := 'd'; end if;
  if scp not in ('user','admin') then scp := 'user'; end if;
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
  insert into public.jc_hits(page, auth, entry, daily, ret, dev, src, host, via, k, scope)
  values (pg, coalesce((p->>'auth')::boolean,false), en, coalesce((p->>'daily')::boolean,false),
          coalesce((p->>'ret')::boolean,false), dv, sr, hs, vi, kk, scp);
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('error','bad');
end $$;

-- 체류 시간 적기: 같은 열람(k)에 더 긴 값만, 연 지 하루 안에만
create or replace function public.jc_stay(p_k text, p_sec int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p_k,'') !~ '^[a-f0-9]{16,32}$' or p_sec is null or p_sec < 1 then return jsonb_build_object('error','bad'); end if;
  update public.jc_hits set stay = least(p_sec, 1800)
   where k = lower(p_k) and at > now() - interval '1 day' and (stay is null or stay < least(p_sec, 1800));
  return jsonb_build_object('ok', true);
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
-- 방문자(user)와 관리측(admin)을 한 번에 만들어 돌려준다. 관리 화면은 받은 것 중 한 쪽만 그린다.
--   scopes  : 갈래별 요약(페이지 보기·방문자·방문)
--   traffic : 갈래별 통계 묶음(예전과 같은 모양 — 화면은 traffic[scope]를 쓴다)
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
  acc jsonb; traf jsonb := '{}'::jsonb; scs jsonb := '{}'::jsonb; tr jsonb;
  sc text;
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

  foreach sc in array array['user','admin'] loop
    with h as (select *, (at at time zone tz) as lt from public.jc_hits where at >= t0 and scope = sc)
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
                 select jsonb_build_object('page', page, 'pv', count(*), 'visits', count(*) filter (where entry), 'apv', count(*) filter (where auth),
                          'vh', count(*) filter (where via = 'home'),
                          'sn', count(stay), 'sa', round(avg(stay)), 'sm', round(percentile_cont(0.5) within group (order by stay))) as x
                 from h group by page) q),
      'stay_n', (select count(stay) from h),
      'home_out', (select count(*) from h where via = 'home' and page <> 'home'),
      'sources', (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb) from (select coalesce(src,'direct') as s, count(*) as c from h where entry group by 1) q),
      'hosts', (select coalesce(jsonb_agg(jsonb_build_object('host', host, 'src', src, 'n', c) order by c desc), '[]'::jsonb) from (
                 select host, min(src) as src, count(*) as c from h where entry and host is not null group by host order by count(*) desc limit 20) q),
      'devices', (select coalesce(jsonb_object_agg(dev, c), '{}'::jsonb) from (select dev, count(*) as c from h where daily group by dev) q),
      'prev', (select jsonb_build_object('pv', count(*), 'visitors', count(*) filter (where daily), 'visits', count(*) filter (where entry))
               from public.jc_hits where scope = sc and at >= p0 and at < t0),
      'since', (select min(at) from public.jc_hits where scope = sc)
    ) into tr;

    traf := jsonb_set(traf, array[sc], tr, true);
    scs := jsonb_set(scs, array[sc], jsonb_build_object(
      'pv',       (select count(*) from public.jc_hits where scope = sc and at >= t0),
      'visitors', (select count(*) from public.jc_hits where scope = sc and at >= t0 and daily),
      'visits',   (select count(*) from public.jc_hits where scope = sc and at >= t0 and entry)
    ), true);
  end loop;

  return jsonb_build_object('days', n, 'from', d0, 'to', today, 'at', now(),
    'scopes', scs, 'accounts', acc, 'traffic', traf, 'since', (select min(at) from public.jc_hits));
end $$;

revoke all on function public.jc_admin_dash(text,int) from public;
revoke all on function public.jc_hit(jsonb) from public;
revoke all on function public.jc_stay(text,int) from public;
grant execute on function public.jc_hit(jsonb), public.jc_stay(text,int), public.jc_pull(text), public.jc_admin_dash(text,int) to anon, authenticated;
