-- Audio-to-writing cards (#99). Apply before releasing writing-card sync.
-- Preserve immutable payloads, grants, policies, and every other validation rule.
begin;

alter table public.practice_attempts
  drop constraint practice_attempt_payload,
  add constraint practice_attempt_payload check ((
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
      and payload -> 'context' ->> 'exercise' in ('audio-picture', 'audio-text')
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
  ) is true);

commit;
