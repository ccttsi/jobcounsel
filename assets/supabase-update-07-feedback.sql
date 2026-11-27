-- 직업상담 통합 자료실 · 자료실 비서 답 평가(👍/👎) — AUP-8 피드백 고리 (2026-11-27)
-- 적용: 클로드가 Supabase 도구(apply_migration)로 직접 적용한다. 여러 번 실행해도 안전하다.
-- 적용 순서: supabase-setup.sql → update-01 … 06 → 이 파일.
-- 설계 원본: ops/feedback/DESIGN.md
--
-- 지키는 선 (헌법 제3조)
--   · 평가 줄에는 질문·답 문장, 사용자 번호, 세션, 시각(분·초)을 두지 않는다. 날짜만.
--   · 하루 상한을 세는 표(quota)는 «사용자·날짜·횟수»만 두고 평가 줄과 잇는 칸이 없다.
--   · 두 표 모두 RLS 켬 + anon·authenticated 권한 전부 회수 — Service Role 함수(assistant-proxy)만 쓴다.
--   · 90일 지난 평가 줄, 2일 지난 상한 줄은 쓰기 함수가 부를 때 함께 지운다.

-- ------------------------------------------------------------------ 1) 평가 줄

create table if not exists public.jc_assistant_feedback (
  fid        uuid primary key,                               -- 브라우저가 평가마다 새로 만든 무작위 번호(바꾸기·취소용)
  day        date not null default (now() at time zone 'Asia/Seoul')::date,
  vote       smallint not null,
  qtype      text not null default '',
  sectors    text[] not null default '{}',
  reason     text not null default '',
  mode       text not null default '',
  websearch  boolean not null default false,
  followup   boolean not null default false,
  fixed      boolean not null default false,                 -- 답 검사기(AUP-5)가 고친 답이었나
  model      text not null default '',
  constraint jc_assistant_feedback_vote_chk   check (vote in (-1, 1)),
  constraint jc_assistant_feedback_qtype_chk  check (qtype in ('', 'calc', 'policy', 'guide', 'counsel')),
  constraint jc_assistant_feedback_reason_chk check (reason in ('', 'wrong', 'offtopic', 'hard', 'long')),
  constraint jc_assistant_feedback_mode_chk   check (mode in ('', 'easy3', 'mock', 'compare', 'opening')),
  constraint jc_assistant_feedback_sect_chk   check (cardinality(sectors) <= 3),
  constraint jc_assistant_feedback_model_chk  check (char_length(model) <= 40)
);

create index if not exists jc_assistant_feedback_day_idx on public.jc_assistant_feedback (day);

alter table public.jc_assistant_feedback enable row level security;
revoke all on public.jc_assistant_feedback from public, anon, authenticated;

comment on table public.jc_assistant_feedback is
  '자료실 비서 답 평가(👍/👎, AUP-8). 질문·답 문장·사용자 번호·시각 없음 — 날짜·유형·인용 섹터·이유(고정 4종)만. 90일 보관. Service Role 전용. 설계 ops/feedback/DESIGN.md';

-- ------------------------------------------------------------------ 2) 하루 상한(평가 줄과 연결 없음)

create table if not exists public.jc_assistant_feedback_quota (
  user_id bigint not null references public.jc_users(id) on delete cascade,
  day     date not null,
  n       int not null default 0,
  primary key (user_id, day)
);

alter table public.jc_assistant_feedback_quota enable row level security;
revoke all on public.jc_assistant_feedback_quota from public, anon, authenticated;

comment on table public.jc_assistant_feedback_quota is
  '자료실 비서 답 평가 하루 상한 카운터(사용자·날짜·횟수만). 평가 줄과 잇는 칸 없음. 2일 뒤 지움. Service Role 전용.';

-- ------------------------------------------------------------------ 3) 쓰기 — 상한 확인 + 넣기/바꾸기/취소 한 번에

-- p_vote 0 = 취소(그 fid 줄 지움). 반환: 'ok' | 'limit' | 'bad'
create or replace function public.jc_assistant_feedback_put(
  p_user bigint, p_fid uuid, p_vote int, p_qtype text, p_sectors text[], p_reason text,
  p_mode text, p_websearch boolean, p_followup boolean, p_fixed boolean, p_model text, p_limit int default 60)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  d date := (now() at time zone 'Asia/Seoul')::date;
  cnt int;
begin
  if p_user is null or p_fid is null or p_vote not in (-1, 0, 1) then return 'bad'; end if;
  delete from public.jc_assistant_feedback where day < d - 90;
  delete from public.jc_assistant_feedback_quota where day < d - 2;
  insert into public.jc_assistant_feedback_quota(user_id, day, n) values (p_user, d, 1)
    on conflict (user_id, day) do update set n = public.jc_assistant_feedback_quota.n + 1
    returning public.jc_assistant_feedback_quota.n into cnt;
  if cnt > greatest(p_limit, 1) then return 'limit'; end if;
  if p_vote = 0 then
    delete from public.jc_assistant_feedback where fid = p_fid;
    return 'ok';
  end if;
  insert into public.jc_assistant_feedback(fid, day, vote, qtype, sectors, reason, mode, websearch, followup, fixed, model)
    values (p_fid, d, p_vote, coalesce(p_qtype, ''), coalesce(p_sectors[1:3], '{}'), case when p_vote = -1 then coalesce(p_reason, '') else '' end,
            coalesce(p_mode, ''), coalesce(p_websearch, false), coalesce(p_followup, false), coalesce(p_fixed, false), left(coalesce(p_model, ''), 40))
    on conflict (fid) do update set vote = excluded.vote, reason = excluded.reason;
  return 'ok';
exception when check_violation then return 'bad';
end $$;

revoke all on function public.jc_assistant_feedback_put(bigint, uuid, int, text, text[], text, text, boolean, boolean, boolean, text, int) from public, anon, authenticated;
grant execute on function public.jc_assistant_feedback_put(bigint, uuid, int, text, text[], text, text, boolean, boolean, boolean, text, int) to service_role;

-- ------------------------------------------------------------------ 4) 주간 집계 — 묶음(유형 × 섹터)만 돌려준다

-- 섹터가 여럿 인용된 평가는 섹터마다 한 번씩 센다(묶음 합 ≥ 전체 평가 수).
create or replace function public.jc_assistant_feedback_week(p_days int default 7)
returns jsonb
language sql security definer set search_path = '' as $$
  with f as (
    select * from public.jc_assistant_feedback
    where day > (now() at time zone 'Asia/Seoul')::date - greatest(p_days, 1)
  ), g as (
    select f.qtype, s.sector, count(*) as n,
           count(*) filter (where f.vote = -1) as down,
           count(*) filter (where f.reason = 'wrong') as wrong,
           count(*) filter (where f.reason = 'offtopic') as offtopic,
           count(*) filter (where f.reason = 'hard') as hard,
           count(*) filter (where f.reason = 'long') as long
    from f cross join lateral unnest(case when cardinality(f.sectors) = 0 then array[''] else f.sectors end) as s(sector)
    group by f.qtype, s.sector
  )
  select jsonb_build_object(
    'days', greatest(p_days, 1),
    'total', (select count(*) from f),
    'down', (select count(*) from f where vote = -1),
    'by_qtype', coalesce((select jsonb_object_agg(q, jsonb_build_object('n', n, 'down', d))
                          from (select qtype as q, count(*) as n, count(*) filter (where vote = -1) as d from f group by qtype) x), '{}'::jsonb),
    'groups', coalesce((select jsonb_agg(to_jsonb(g) order by g.down desc, g.n desc) from g), '[]'::jsonb)
  );
$$;

revoke all on function public.jc_assistant_feedback_week(int) from public, anon, authenticated;
grant execute on function public.jc_assistant_feedback_week(int) to service_role;

-- ------------------------------------------------------------------ 5) 확인
-- select relname, relrowsecurity from pg_class where relname like 'jc_assistant_feedback%';   -- 둘 다 true
-- select public.jc_assistant_feedback_week(7);                                               -- {"total":0,...}
