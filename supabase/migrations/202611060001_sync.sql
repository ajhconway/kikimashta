-- Optional account sync (#6). Apply once, before publishing browser credentials.
-- Event payloads retain the original client IDs and millisecond timestamps.
begin;

create table public.practice_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id text not null check (attempt_id <> ''),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, attempt_id),
  constraint practice_attempt_payload check ((
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'id') = 'string' and payload ->> 'id' = attempt_id
    and jsonb_typeof(payload -> 'sessionId') = 'string' and payload ->> 'sessionId' <> ''
    and jsonb_typeof(payload -> 'itemId') = 'string' and payload ->> 'itemId' <> ''
    and jsonb_typeof(payload -> 'language') = 'string' and payload ->> 'language' <> ''
    and case when jsonb_typeof(payload -> 'choiceIds') = 'array' then
      jsonb_array_length(payload -> 'choiceIds') > 0
      and not jsonb_path_exists(payload -> 'choiceIds', '$[*] ? (@.type() != "string" || @ == "")')
      else false end
    and jsonb_typeof(payload -> 'selectedId') = 'string' and payload ->> 'selectedId' <> ''
    and jsonb_typeof(payload -> 'correct') = 'boolean'
    and case when jsonb_typeof(payload -> 'startedAt') = 'number' then
      (payload ->> 'startedAt')::numeric between 0 and 9007199254740991
      and trunc((payload ->> 'startedAt')::numeric) = (payload ->> 'startedAt')::numeric
      else false end
    and case when jsonb_typeof(payload -> 'answeredAt') = 'number' then
      (payload ->> 'answeredAt')::numeric between 0 and 9007199254740991
      and trunc((payload ->> 'answeredAt')::numeric) = (payload ->> 'answeredAt')::numeric
      else false end
    and case when jsonb_typeof(payload -> 'responseMs') = 'number' then
      (payload ->> 'responseMs')::numeric between 0 and 9007199254740991
      and trunc((payload ->> 'responseMs')::numeric) = (payload ->> 'responseMs')::numeric
      else false end
    and (not (payload ? 'context') or (
      jsonb_typeof(payload -> 'context') = 'object'
      and payload -> 'context' ->> 'phase' in ('lesson', 'review')
      and payload -> 'context' ->> 'exercise' = 'audio-picture'
      and jsonb_typeof(payload -> 'context' -> 'recordingSrc') = 'string'
      and jsonb_typeof(payload -> 'context' -> 'schedulerVersion') = 'string'
      and payload -> 'context' ->> 'schedulerVersion' <> ''
      and case when jsonb_typeof(payload -> 'context' -> 'replays') = 'number' then
        (payload -> 'context' ->> 'replays')::numeric between 0 and 9007199254740991
        and trunc((payload -> 'context' ->> 'replays')::numeric) = (payload -> 'context' ->> 'replays')::numeric
        else false end
      and (not (payload -> 'context' ? 'retryOf') or (
        jsonb_typeof(payload -> 'context' -> 'retryOf') = 'string'
        and payload -> 'context' ->> 'retryOf' <> ''
      ))
    ))
  ) is true)
);

create table public.card_note_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null check (event_id <> ''),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id),
  constraint card_note_payload check ((
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'id') = 'string' and payload ->> 'id' = event_id
    and jsonb_typeof(payload -> 'language') = 'string' and payload ->> 'language' <> ''
    and jsonb_typeof(payload -> 'itemId') = 'string' and payload ->> 'itemId' <> ''
    and jsonb_typeof(payload -> 'text') = 'string'
    and case when jsonb_typeof(payload -> 'updatedAt') = 'number' then
      (payload ->> 'updatedAt')::numeric between 0 and 9007199254740991
      and trunc((payload ->> 'updatedAt')::numeric) = (payload ->> 'updatedAt')::numeric
      else false end
  ) is true)
);

alter table public.practice_attempts enable row level security;
alter table public.practice_attempts force row level security;
alter table public.card_note_events enable row level security;
alter table public.card_note_events force row level security;

-- New projects may inherit broad default grants. Replace them explicitly.
revoke all on table public.practice_attempts from public, anon, authenticated;
revoke all on table public.card_note_events from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.practice_attempts to authenticated;
grant select on table public.card_note_events to authenticated;
-- The server supplies created_at; clients cannot forge this audit timestamp.
grant insert (user_id, attempt_id, payload) on public.practice_attempts to authenticated;
grant insert (user_id, event_id, payload) on public.card_note_events to authenticated;

create policy practice_attempts_read_own on public.practice_attempts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy practice_attempts_append_own on public.practice_attempts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy card_notes_read_own on public.card_note_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy card_notes_append_own on public.card_note_events
  for insert to authenticated with check ((select auth.uid()) = user_id);

comment on table public.practice_attempts is 'Immutable practice events, private to their authenticated owner.';
comment on table public.card_note_events is 'Immutable note events. Empty text is a tombstone; latest (updatedAt, id) wins per language/item.';

commit;
