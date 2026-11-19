-- 직업상담 통합 자료실 · 개인 비서 — 내 대화 기록함 (스레드 목록 + 메시지)
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run.
-- 여러 번 실행해도 안전하다(있으면 건너뛴다). 적용 순서:
--   supabase-setup.sql → supabase-update-03-assistant.sql → 이 파일.
--
-- 왜 이 표가 필요한가
--   비서의 대화가 지금까지는 브라우저(localStorage)에만 남아, 기기를 바꾸거나 브라우저를 지우면
--   같이 사라졌다. 로그인한 사용자가 **자기 대화를 자기 계정에** 쌓아 두고 다시 꺼내 볼 수 있게,
--   스레드(대화방)와 그 안의 주고받은 메시지를 표 두 개로 나눠 둔다.
--
-- 지키는 선 (본인만)
--   · 두 표는 RLS 를 켜고 **anon·authenticated 권한을 전부 회수**한다. 정책을 만들지 않으므로
--     사이트 코드(공개 키)로는 한 줄도 읽거나 쓸 수 없다 — 다른 사람 것은 말할 것도 없다.
--   · 읽고 쓰는 길은 **Service Role 을 쓰는 Edge Function(assistant-proxy) 하나뿐**이고,
--     그 함수는 세션 토큰의 SHA-256 을 jc_sessions 와 맞춰 user_id 를 스스로 정한다.
--     요청 본문의 user_id 는 절대 믿지 않는다(칸 자체를 받지 않는다).
--   · 메시지 행은 (thread_id, user_id) 복합 외래키로 자기 스레드에만 붙는다.
--     남의 스레드 번호를 넣으면 DB 가 거부한다.
--   · 대화는 본문만 두고, 내담자 개인정보를 넣지 않도록 화면에서 안내한다.
--
-- 크기 상한 (화면·서버가 함께 지킨다)
--   제목 80자 · 메시지 질문 1,200자 · 답변 4,000자 · 스레드당 40개 · 사용자당 60스레드.

-- ------------------------------------------------------------------ 1) 대화방(스레드)

create table if not exists public.jc_assistant_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    bigint not null references public.jc_users(id) on delete cascade,
  title      text not null default '새 대화',
  turns      int not null default 0,                       -- 화면에 「몇 개 주고받았는지」만 적는다
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jc_assistant_threads_title_chk check (char_length(title) between 1 and 80),
  constraint jc_assistant_threads_id_user_uk unique (id, user_id)   -- 복합 외래키용
);

create index if not exists jc_assistant_threads_user_idx
  on public.jc_assistant_threads (user_id, updated_at desc);

alter table public.jc_assistant_threads enable row level security;
revoke all on public.jc_assistant_threads from public, anon, authenticated;

comment on table public.jc_assistant_threads is
  '자료실 비서 대화방(스레드). RLS 켬 + anon·authenticated 권한 전부 회수 — Edge Function(Service Role)만 만진다. user_id 는 세션 토큰으로만 정한다.';

-- ------------------------------------------------------------------ 2) 메시지(주고받은 한 쌍)

create table if not exists public.jc_assistant_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null,
  user_id    bigint not null,
  seq        int not null,                                 -- 대화방 안의 차례
  turn_id    text not null,                                -- 브라우저가 붙인 식별자(수정·다시 묻기에서 같은 자리)
  question   text not null,
  answer     text not null default '',
  refs       jsonb not null default '[]'::jsonb,           -- 자료실 근거(제목·섹터·주소)
  web        jsonb not null default '[]'::jsonb,           -- 웹 교차 확인 출처
  mode       text,                                         -- 실무 모드(easy3·mock·compare·opening)
  websearch  boolean not null default false,
  err        boolean not null default false,               -- 답을 못 만든 자리(사용자가 지울 수 있다)
  created_at timestamptz not null default now(),
  constraint jc_assistant_messages_thread_fk
    foreign key (thread_id, user_id) references public.jc_assistant_threads (id, user_id) on delete cascade,
  constraint jc_assistant_messages_seq_uk unique (thread_id, seq),
  constraint jc_assistant_messages_q_chk check (char_length(question) between 1 and 1200),
  constraint jc_assistant_messages_a_chk check (char_length(answer) <= 4000)
);

create index if not exists jc_assistant_messages_thread_idx
  on public.jc_assistant_messages (thread_id, seq);

alter table public.jc_assistant_messages enable row level security;
revoke all on public.jc_assistant_messages from public, anon, authenticated;

comment on table public.jc_assistant_messages is
  '자료실 비서 대화 메시지(질문+답 한 쌍). (thread_id, user_id) 복합 외래키로 자기 대화방에만 붙고, 대화방을 지우면 함께 지워진다(cascade). anon·authenticated 접근 전면 차단.';

-- ------------------------------------------------------------------ 3) 확인

-- 1) 두 표가 있고 RLS 가 켜져 있는지 (둘 다 relrowsecurity = true)
-- select relname, relrowsecurity from pg_class
-- where relname in ('jc_assistant_threads','jc_assistant_messages');
--
-- 2) 정책이 하나도 없어야 한다(0건) — 정책이 없으면 anon·authenticated 는 전부 거부다.
-- select tablename, policyname from pg_policies
-- where tablename in ('jc_assistant_threads','jc_assistant_messages');
--
-- 3) 남의 대화방에 메시지를 넣을 수 없는지(오류가 나야 정상).
-- insert into public.jc_assistant_messages(thread_id, user_id, seq, turn_id, question)
-- values ('00000000-0000-0000-0000-000000000000', 1, 1, 't1', 'test');   -- FK 위반으로 실패
