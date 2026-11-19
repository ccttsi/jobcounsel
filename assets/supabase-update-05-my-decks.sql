-- 직업상담 통합 자료실 · 마이덱(내가 짠 상담 덱) + 공간 꾸미기 설정
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run.
-- 여러 번 실행해도 안전하다(있으면 건너뛴다). 적용 순서:
--   supabase-setup.sql → (필요한 다른 업데이트) → 이 파일.
--
-- 왜 이 표가 필요한가
--   27번 「상담 플로우 아키텍트」에서 사용자가 고른 자료 순서(덱)를 로그인한 **자기 계정**에 쌓아 두고
--   다른 기기에서도 꺼내 쓰기 위해서다. 덱의 겉모양(공간 꾸미기) 설정도 테마별로 함께 보관한다.
--
-- 지키는 선 (본인만)
--   · 두 표는 RLS 를 켜고 **anon·authenticated 권한을 전부 회수**한다. 정책을 만들지 않으므로
--     사이트 코드(공개 키)로는 한 줄도 읽거나 쓸 수 없다 — 다른 사람 것은 말할 것도 없다.
--   · 읽고 쓰는 길은 **Service Role 을 쓰는 Edge Function(my-decks-proxy) 하나뿐**이고,
--     그 함수는 세션 토큰의 SHA-256 을 jc_sessions 와 맞춰 user_id 를 스스로 정한다.
--     요청 본문의 user_id 는 절대 믿지 않는다(칸 자체를 받지 않는다).
--   · 덱에는 자료 id·번호·제목·딱지와 덱 이름만 담는다. 내담자 이름·메모 내용은 담지 않는다(화면에서도 안내).
--
-- 크기 상한 (화면·서버·DB가 함께 지킨다)
--   이름 60자 · 단계 1~12개 · 사용자당 덱 60개 · 설정은 테마 3가지.

-- ------------------------------------------------------------------ 1) 내 덱

create table if not exists public.jc_my_decks (
  id         uuid primary key default gen_random_uuid(),
  user_id    bigint not null references public.jc_users(id) on delete cascade,
  name       text not null,
  steps      jsonb not null default '[]'::jsonb,     -- [{id,no,title,badge}, …] — 자료실 섹터 id의 순서
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jc_my_decks_name_chk check (char_length(name) between 1 and 60),
  constraint jc_my_decks_steps_chk check (
    jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 12
  ),
  constraint jc_my_decks_size_chk check (pg_column_size(steps) < 8000)
);

create index if not exists jc_my_decks_user_idx
  on public.jc_my_decks (user_id, updated_at desc);

alter table public.jc_my_decks enable row level security;
revoke all on public.jc_my_decks from public, anon, authenticated;

comment on table public.jc_my_decks is
  '마이덱 — 사용자가 27번 상담 플로우에서 짠 자료 순서. RLS 켬 + anon·authenticated 권한 전부 회수 — Edge Function(my-decks-proxy, Service Role)만 만진다. user_id 는 세션 토큰으로만 정한다.';

-- ------------------------------------------------------------------ 2) 공간 꾸미기 설정(테마별)

create table if not exists public.jc_my_deck_prefs (
  user_id    bigint not null references public.jc_users(id) on delete cascade,
  theme      text not null,                          -- 'light' · 'sepia' · 'dark'
  prefs      jsonb not null default '{}'::jsonb,     -- {bg,ink,card,font,layout,deco,bg_custom,ink_custom}
  updated_at timestamptz not null default now(),
  primary key (user_id, theme),
  constraint jc_my_deck_prefs_theme_chk check (theme in ('light', 'sepia', 'dark')),
  constraint jc_my_deck_prefs_size_chk check (pg_column_size(prefs) < 6000)
);

alter table public.jc_my_deck_prefs enable row level security;
revoke all on public.jc_my_deck_prefs from public, anon, authenticated;

comment on table public.jc_my_deck_prefs is
  '마이덱 공간 꾸미기 — 여섯 요소 × 여섯 조건의 선택값을 테마(밝게·세피아·어둡게)마다 한 줄로. anon·authenticated 접근 전면 차단.';

-- ------------------------------------------------------------------ 3) 확인

-- 1) 두 표가 있고 RLS 가 켜져 있는지 (둘 다 relrowsecurity = true)
-- select relname, relrowsecurity from pg_class
-- where relname in ('jc_my_decks','jc_my_deck_prefs');
--
-- 2) 정책이 하나도 없어야 한다(0건) — 정책이 없으면 anon·authenticated 는 전부 거부다.
-- select tablename, policyname from pg_policies
-- where tablename in ('jc_my_decks','jc_my_deck_prefs');
--
-- 3) 단계가 12개를 넘는 덱은 DB가 거부해야 한다(오류가 나야 정상).
-- insert into public.jc_my_decks(user_id, name, steps)
-- values (1, 'test', (select jsonb_agg(jsonb_build_object('id','theory')) from generate_series(1,13)));
