-- Run after the migration in a development project's SQL editor, as postgres.
-- No extensions are needed. Every fixture and helper is rolled back.
begin;

create temporary table sync_test_results (check_name text not null);

create function pg_temp.assert_true(actual boolean, message text) returns void
language plpgsql security invoker as $$
begin
  if actual is not true then raise exception 'Assertion failed: %', message; end if;
  insert into pg_temp.sync_test_results values (message);
end;
$$;
create function pg_temp.expect_sqlstate(statement text, expected text) returns void
language plpgsql security invoker as $$
declare observed text;
begin
  begin
    execute statement;
  exception when others then get stacked diagnostics observed = returned_sqlstate;
  end;
  if observed is distinct from expected then
    raise exception 'Expected SQLSTATE %, got % for %', expected, coalesce(observed, 'success'), statement;
  end if;
  insert into pg_temp.sync_test_results values ('Denied with ' || expected);
end;
$$;
create function pg_temp.attempt_payload(id text) returns jsonb
language sql immutable security invoker as $$
  select jsonb_build_object('id', id, 'sessionId', 'old-session', 'itemId', 'ja-cat',
    'language', 'ja-JP', 'choiceIds', jsonb_build_array('ja-cat', 'ja-dog'),
    'selectedId', 'ja-cat', 'correct', true, 'startedAt', 1000, 'answeredAt', 1500, 'responseMs', 500);
$$;
create function pg_temp.note_payload(id text, body text, at_ms bigint) returns jsonb
language sql immutable security invoker as $$
  select jsonb_build_object('id', id, 'language', 'ja-JP', 'itemId', 'ja-cat', 'text', body, 'updatedAt', at_ms);
$$;
create function pg_temp.contextual_payload(id text, exercise text, correct boolean default true) returns jsonb
language sql immutable security invoker as $$
  select pg_temp.attempt_payload(id) || jsonb_build_object(
    'choiceIds', jsonb_build_array('teacher', 'student'),
    'selectedId', case when correct then 'teacher' else 'student' end, 'correct', correct,
    'context', jsonb_build_object('phase', 'review', 'exercise', exercise,
      'recordingSrc', 'audio/context/sentence.mp3', 'replays', 1, 'schedulerVersion', 'fsrs-6-v1',
      'contextual', jsonb_build_object('stage', case when exercise like 'context-simple-%' then 'simple' else 'contrastive' end,
        'contextId', 'water-at-school', 'contextRevision', 1, 'questionId', 'who-drinks-water', 'questionRevision', 2,
        'kind', 'detail', 'correctOptionId', 'teacher', 'sentenceSrc', 'audio/context/sentence.mp3', 'questionSrc', 'audio/context/question.mp3')));
$$;
do $$
begin
  execute format('grant usage on schema %I to authenticated, anon', pg_my_temp_schema()::regnamespace);
  execute format('grant execute on all functions in schema %I to authenticated, anon', pg_my_temp_schema()::regnamespace);
end;
$$;
grant insert, select on pg_temp.sync_test_results to authenticated, anon;

-- Fail rather than reuse any existing auth identity with these fixture IDs.
select pg_temp.assert_true(not exists (select 1 from auth.users where id in (
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'
)), 'fixture users must not already exist');
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'kikimashta-sync-a@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'kikimashta-sync-b@example.invalid');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Real owner inserts accept legacy text IDs and populate server timestamps.
insert into public.practice_attempts (user_id, attempt_id, payload)
values (auth.uid(), 'legacy-answer-one', pg_temp.attempt_payload('legacy-answer-one'));
insert into public.card_note_events (user_id, event_id, payload) values
  (auth.uid(), 'note-a', pg_temp.note_payload('note-a', 'Original note', 1000)),
  (auth.uid(), 'note-z', pg_temp.note_payload('note-z', '', 1000));
select pg_temp.assert_true((select count(*) = 1 and bool_and(created_at is not null)
  from public.practice_attempts where attempt_id = 'legacy-answer-one'), 'owner reads its inserted practice event');
select pg_temp.assert_true((select count(*) = 2 from public.card_note_events), 'owner reads both note events');
select pg_temp.assert_true((select payload ->> 'text' = '' from public.card_note_events
  order by (payload ->> 'updatedAt')::bigint desc, event_id desc limit 1), 'empty tombstone wins deterministic timestamp/ID tie');

-- A duplicate retry must neither overwrite nor duplicate the original event.
insert into public.practice_attempts (user_id, attempt_id, payload)
values (auth.uid(), 'legacy-answer-one', pg_temp.attempt_payload('legacy-answer-one') || '{"correct":false}')
on conflict (user_id, attempt_id) do nothing;
insert into public.card_note_events (user_id, event_id, payload)
values (auth.uid(), 'note-a', pg_temp.note_payload('note-a', 'Changed duplicate', 2000))
on conflict (user_id, event_id) do nothing;
select pg_temp.assert_true((select count(*) = 1 and bool_and(payload = pg_temp.attempt_payload('legacy-answer-one'))
  from public.practice_attempts where attempt_id = 'legacy-answer-one'), 'duplicate upload preserves original attempt');
select pg_temp.assert_true((select payload ->> 'text' = 'Original note' from public.card_note_events where event_id = 'note-a'), 'duplicate upload preserves original note event');

select pg_temp.expect_sqlstate($q$update public.practice_attempts set payload = payload || '{"correct":false}'$q$, '42501');
select pg_temp.expect_sqlstate('delete from public.practice_attempts', '42501');
select pg_temp.expect_sqlstate($q$update public.card_note_events set payload = payload || '{"text":"Changed"}'$q$, '42501');
select pg_temp.expect_sqlstate('delete from public.card_note_events', '42501');
select pg_temp.assert_true((select payload = pg_temp.attempt_payload('legacy-answer-one') from public.practice_attempts where attempt_id = 'legacy-answer-one'), 'denied writes leave practice payload intact');
select pg_temp.assert_true((select count(*) = 2 from public.card_note_events), 'denied writes leave both note events intact');

-- Column grants prevent supplying the server audit timestamp.
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload, created_at)
  values (auth.uid(), 'forged-time', pg_temp.attempt_payload('forged-time'), '2000-01-01')$q$, '42501');
select pg_temp.expect_sqlstate($q$insert into public.card_note_events (user_id, event_id, payload, created_at)
  values (auth.uid(), 'forged-time', pg_temp.note_payload('forged-time', '', 1000), '2000-01-01')$q$, '42501');

-- Constraints cannot silently accept absent or mismatched payload identity/types.
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'mismatch', pg_temp.attempt_payload('different'))$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'missing-time', pg_temp.attempt_payload('missing-time') - 'answeredAt')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'bad-choices', pg_temp.attempt_payload('bad-choices') || '{"choiceIds":[12]}')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.card_note_events (user_id, event_id, payload)
  values (auth.uid(), 'missing-text', pg_temp.note_payload('missing-text', '', 1000) - 'text')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.card_note_events (user_id, event_id, payload)
  values (auth.uid(), 'fraction-time', pg_temp.note_payload('fraction-time', '', 1000) || '{"updatedAt":1000.5}')$q$, '23514');

-- Corrective retry context remains a normal immutable practice event.
insert into public.practice_attempts (user_id, attempt_id, payload)
values (auth.uid(), 'corrective-retry', pg_temp.attempt_payload('corrective-retry') ||
  '{"context":{"phase":"review","exercise":"audio-picture","recordingSrc":"audio/cat.mp3","replays":1,"schedulerVersion":"fsrs-6-v1","retryOf":"legacy-answer-one"}}');
select pg_temp.assert_true((select payload -> 'context' ->> 'retryOf' = 'legacy-answer-one'
  from public.practice_attempts where attempt_id = 'corrective-retry'), 'retry metadata round-trips');

-- Writing uses the same immutable event contract while retaining its own exercise.
insert into public.practice_attempts (user_id, attempt_id, payload)
values (auth.uid(), 'writing-lesson', pg_temp.attempt_payload('writing-lesson') ||
  '{"context":{"phase":"lesson","exercise":"audio-text","recordingSrc":"audio/cat.mp3","replays":0,"schedulerVersion":"fsrs-6-v1"}}');
insert into public.practice_attempts (user_id, attempt_id, payload)
values (auth.uid(), 'writing-retry', pg_temp.attempt_payload('writing-retry') ||
  '{"context":{"phase":"review","exercise":"audio-text","recordingSrc":"audio/cat.mp3","replays":2,"schedulerVersion":"fsrs-6-v1","retryOf":"writing-lesson"}}');
select pg_temp.assert_true((select payload -> 'context' ->> 'exercise' = 'audio-text'
  and payload -> 'context' ->> 'phase' = 'lesson'
  from public.practice_attempts where attempt_id = 'writing-lesson'), 'writing lesson context round-trips');
select pg_temp.assert_true((select payload -> 'context' ->> 'exercise' = 'audio-text'
  and payload -> 'context' ->> 'retryOf' = 'writing-lesson'
  and payload -> 'context' ->> 'replays' = '2'
  from public.practice_attempts where attempt_id = 'writing-retry'), 'writing retry metadata round-trips');
select pg_temp.assert_true((select payload -> 'context' ->> 'exercise' = 'audio-picture'
  from public.practice_attempts where attempt_id = 'corrective-retry'), 'picture context stays unchanged');
select pg_temp.assert_true((select payload = pg_temp.attempt_payload('legacy-answer-one')
  from public.practice_attempts where attempt_id = 'legacy-answer-one'), 'legacy payload stays unchanged after writing inserts');

-- Widening the exercise allowlist must not weaken context validation.
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'unsupported-exercise', pg_temp.attempt_payload('unsupported-exercise') ||
    '{"context":{"phase":"review","exercise":"audio-writing","recordingSrc":"audio/cat.mp3","replays":0,"schedulerVersion":"fsrs-6-v1"}}')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'missing-exercise', pg_temp.attempt_payload('missing-exercise') ||
    '{"context":{"phase":"review","recordingSrc":"audio/cat.mp3","replays":0,"schedulerVersion":"fsrs-6-v1"}}')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'invalid-writing-replays', pg_temp.attempt_payload('invalid-writing-replays') ||
    '{"context":{"phase":"review","exercise":"audio-text","recordingSrc":"audio/cat.mp3","replays":0.5,"schedulerVersion":"fsrs-6-v1"}}')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'invalid-writing-retry', pg_temp.attempt_payload('invalid-writing-retry') ||
    '{"context":{"phase":"review","exercise":"audio-text","recordingSrc":"audio/cat.mp3","replays":0,"schedulerVersion":"fsrs-6-v1","retryOf":""}}')$q$, '23514');

-- Contextual attempts retain the vocabulary target even when the answer differs.
insert into public.practice_attempts (user_id, attempt_id, payload) values
  (auth.uid(), 'simple-picture', pg_temp.contextual_payload('simple-picture', 'context-simple-picture')),
  (auth.uid(), 'simple-text', pg_temp.contextual_payload('simple-text', 'context-simple-text')),
  (auth.uid(), 'contrastive-picture', pg_temp.contextual_payload('contrastive-picture', 'context-contrastive-picture')),
  (auth.uid(), 'contrastive-text-miss', pg_temp.contextual_payload('contrastive-text-miss', 'context-contrastive-text', false));
select pg_temp.assert_true((select count(*) = 4 from public.practice_attempts where attempt_id in
  ('simple-picture', 'simple-text', 'contrastive-picture', 'contrastive-text-miss')), 'all four contextual exercises round-trip');
select pg_temp.assert_true((select payload ->> 'itemId' = 'ja-cat'
  and payload ->> 'selectedId' = 'teacher'
  and payload -> 'context' -> 'contextual' ->> 'questionRevision' = '2'
  from public.practice_attempts where attempt_id = 'simple-text'), 'contextual target, detail answer and authored revision stay separate');
select pg_temp.assert_true((select payload -> 'correct' = 'false'::jsonb and payload ->> 'selectedId' = 'student'
  from public.practice_attempts where attempt_id = 'contrastive-text-miss'), 'contextual incorrect answers remain valid evidence');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'missing-contextual', pg_temp.contextual_payload('missing-contextual', 'context-simple-text') #- '{context,contextual}')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'mismatched-stage', jsonb_set(pg_temp.contextual_payload('mismatched-stage', 'context-simple-text'),
    '{context,contextual,stage}', '"contrastive"'))$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'bad-revision', jsonb_set(pg_temp.contextual_payload('bad-revision', 'context-simple-text'),
    '{context,contextual,questionRevision}', '1.5'))$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'missing-revision', pg_temp.contextual_payload('missing-revision', 'context-simple-text') #- '{context,contextual,contextRevision}')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'unoffered-answer', jsonb_set(pg_temp.contextual_payload('unoffered-answer', 'context-simple-text'),
    '{context,contextual,correctOptionId}', '"other"'))$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'unoffered-selection', pg_temp.contextual_payload('unoffered-selection', 'context-simple-text') || '{"selectedId":"other"}')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'wrong-grade', pg_temp.contextual_payload('wrong-grade', 'context-simple-text') || '{"correct":false}')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'duplicate-choices', pg_temp.contextual_payload('duplicate-choices', 'context-simple-text') || '{"choiceIds":["teacher","teacher"]}')$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'changed-sentence', jsonb_set(pg_temp.contextual_payload('changed-sentence', 'context-simple-text'),
    '{context,recordingSrc}', '"audio/other.mp3"'))$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'same-segments', jsonb_set(pg_temp.contextual_payload('same-segments', 'context-simple-text'),
    '{context,contextual,questionSrc}', '"audio/context/sentence.mp3"'))$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'unsafe-segment', jsonb_set(pg_temp.contextual_payload('unsafe-segment', 'context-simple-text'),
    '{context,contextual,questionSrc}', '"audio/../question.mp3"'))$q$, '23514');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'word-with-contextual', jsonb_set(pg_temp.contextual_payload('word-with-contextual', 'context-simple-text'),
    '{context,exercise}', '"audio-text"'))$q$, '23514');

-- A second authenticated user sees no first-user events and cannot spoof ownership.
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.assert_true((select count(*) = 0 from public.practice_attempts), 'another account cannot read attempts');
select pg_temp.assert_true((select count(*) = 0 from public.card_note_events), 'another account cannot read notes');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values ('10000000-0000-4000-8000-000000000001', 'spoofed', pg_temp.attempt_payload('spoofed'))$q$, '42501');
select pg_temp.expect_sqlstate($q$insert into public.card_note_events (user_id, event_id, payload)
  values ('10000000-0000-4000-8000-000000000001', 'spoofed', pg_temp.note_payload('spoofed', '', 1000))$q$, '42501');
insert into public.practice_attempts (user_id, attempt_id, payload)
values (auth.uid(), 'legacy-answer-one', pg_temp.attempt_payload('legacy-answer-one'));
insert into public.card_note_events (user_id, event_id, payload)
values (auth.uid(), 'note-a', pg_temp.note_payload('note-a', 'Other account', 1000));
select pg_temp.assert_true((select count(*) = 1 from public.practice_attempts), 'same legacy ID is private and valid in another account');
select pg_temp.assert_true((select count(*) = 1 from public.card_note_events), 'note event IDs are scoped by account');

-- A role without an authenticated identity does not acquire another user's rows.
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{}';
select pg_temp.assert_true((select count(*) = 0 from public.practice_attempts), 'a missing identity reads no attempts');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values ('10000000-0000-4000-8000-000000000001', 'no-identity', pg_temp.attempt_payload('no-identity'))$q$, '42501');

-- The anonymous API role has no grants, even if a test supplies an owner claim.
set local role anon;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"anon"}';
select pg_temp.expect_sqlstate('select * from public.practice_attempts', '42501');
select pg_temp.expect_sqlstate('select * from public.card_note_events', '42501');
select pg_temp.expect_sqlstate($q$insert into public.practice_attempts (user_id, attempt_id, payload)
  values (auth.uid(), 'anon-attempt', pg_temp.attempt_payload('anon-attempt'))$q$, '42501');
select pg_temp.expect_sqlstate($q$insert into public.card_note_events (user_id, event_id, payload)
  values (auth.uid(), 'anon-note', pg_temp.note_payload('anon-note', '', 1000))$q$, '42501');

reset role;
select pg_temp.assert_true((select count(*) = 8 from public.practice_attempts
  where user_id = '10000000-0000-4000-8000-000000000001'), 'cross-user/anonymous attempts left original account intact');
select pg_temp.assert_true((select count(*) = 2 from public.card_note_events
  where user_id = '10000000-0000-4000-8000-000000000001'), 'cross-user/anonymous attempts left original notes intact');
delete from auth.users where id = '10000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not exists (select 1 from public.practice_attempts where user_id = '10000000-0000-4000-8000-000000000002'), 'account deletion cascades its attempt events');
select pg_temp.assert_true(not exists (select 1 from public.card_note_events where user_id = '10000000-0000-4000-8000-000000000002'), 'account deletion cascades its note events');
select pg_temp.assert_true((select count(*) = 8 from public.practice_attempts where user_id = '10000000-0000-4000-8000-000000000001'), 'deleting another account preserves the first account');
select count(*) as checks_passed, 'Sync SQL checks passed; fixtures are being rolled back.' as result from pg_temp.sync_test_results;
rollback;
