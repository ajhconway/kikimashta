-- Contextual cards (#139). Preserve legacy word histories and account isolation.
-- Preserve immutable payloads, grants, policies, and every other validation rule.
begin;

-- A pure immutable helper permits uniqueness inside a CHECK without table access.
create function public.contextual_choice_ids_unique(choices jsonb) returns boolean
language sql immutable parallel safe security invoker set search_path = '' as $$
  select case when jsonb_typeof(choices) = 'array' then
    (select count(*) = count(distinct value) from jsonb_array_elements(choices))
    else false end;
$$;
revoke all on function public.contextual_choice_ids_unique(jsonb) from public, anon;
grant execute on function public.contextual_choice_ids_unique(jsonb) to authenticated;

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
      and payload -> 'context' ->> 'exercise' in ('audio-picture', 'audio-text',
        'context-simple-picture', 'context-simple-text', 'context-contrastive-picture', 'context-contrastive-text')
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
      and case when payload -> 'context' ->> 'exercise' in ('audio-picture', 'audio-text') then
        not (payload -> 'context' ? 'contextual')
      else (
        jsonb_typeof(payload -> 'context' -> 'contextual') = 'object'
        and payload -> 'context' -> 'contextual' ->> 'stage' in ('simple', 'contrastive')
        and payload -> 'context' ->> 'exercise' in (
          'context-' || (payload -> 'context' -> 'contextual' ->> 'stage') || '-picture',
          'context-' || (payload -> 'context' -> 'contextual' ->> 'stage') || '-text'
        )
        and jsonb_typeof(payload -> 'context' -> 'contextual' -> 'contextId') = 'string'
        and btrim(payload -> 'context' -> 'contextual' ->> 'contextId') <> ''
        and jsonb_typeof(payload -> 'context' -> 'contextual' -> 'questionId') = 'string'
        and btrim(payload -> 'context' -> 'contextual' ->> 'questionId') <> ''
        and jsonb_typeof(payload -> 'context' -> 'contextual' -> 'correctOptionId') = 'string'
        and btrim(payload -> 'context' -> 'contextual' ->> 'correctOptionId') <> ''
        and case when jsonb_typeof(payload -> 'context' -> 'contextual' -> 'contextRevision') = 'number' then
          (payload -> 'context' -> 'contextual' ->> 'contextRevision')::numeric between 1 and 9007199254740991
          and trunc((payload -> 'context' -> 'contextual' ->> 'contextRevision')::numeric) =
            (payload -> 'context' -> 'contextual' ->> 'contextRevision')::numeric
          else false end
        and case when jsonb_typeof(payload -> 'context' -> 'contextual' -> 'questionRevision') = 'number' then
          (payload -> 'context' -> 'contextual' ->> 'questionRevision')::numeric between 1 and 9007199254740991
          and trunc((payload -> 'context' -> 'contextual' ->> 'questionRevision')::numeric) =
            (payload -> 'context' -> 'contextual' ->> 'questionRevision')::numeric
          else false end
        and payload -> 'context' -> 'contextual' ->> 'kind' in ('target', 'detail')
        and jsonb_typeof(payload -> 'context' -> 'contextual' -> 'sentenceSrc') = 'string'
        and left(payload -> 'context' -> 'contextual' ->> 'sentenceSrc', 6) = 'audio/'
        and right(lower(payload -> 'context' -> 'contextual' ->> 'sentenceSrc'), 4) = '.mp3'
        and payload -> 'context' -> 'contextual' ->> 'sentenceSrc' !~ '[\\%?#:]'
        and payload -> 'context' -> 'contextual' ->> 'sentenceSrc' not like '%//%'
        and payload -> 'context' -> 'contextual' ->> 'sentenceSrc' not like '%/./%'
        and payload -> 'context' -> 'contextual' ->> 'sentenceSrc' not like '%/../%'
        and jsonb_typeof(payload -> 'context' -> 'contextual' -> 'questionSrc') = 'string'
        and left(payload -> 'context' -> 'contextual' ->> 'questionSrc', 6) = 'audio/'
        and right(lower(payload -> 'context' -> 'contextual' ->> 'questionSrc'), 4) = '.mp3'
        and payload -> 'context' -> 'contextual' ->> 'questionSrc' !~ '[\\%?#:]'
        and payload -> 'context' -> 'contextual' ->> 'questionSrc' not like '%//%'
        and payload -> 'context' -> 'contextual' ->> 'questionSrc' not like '%/./%'
        and payload -> 'context' -> 'contextual' ->> 'questionSrc' not like '%/../%'
        and payload -> 'context' ->> 'recordingSrc' = payload -> 'context' -> 'contextual' ->> 'sentenceSrc'
        and payload -> 'context' -> 'contextual' ->> 'sentenceSrc' <> payload -> 'context' -> 'contextual' ->> 'questionSrc'
        and case when jsonb_typeof(payload -> 'choiceIds') = 'array' then
          jsonb_array_length(payload -> 'choiceIds') >= 2
          and public.contextual_choice_ids_unique(payload -> 'choiceIds')
          else false end
        and payload -> 'choiceIds' ? (payload ->> 'selectedId')
        and payload -> 'choiceIds' ? (payload -> 'context' -> 'contextual' ->> 'correctOptionId')
        and payload -> 'correct' = to_jsonb((payload ->> 'selectedId') = (payload -> 'context' -> 'contextual' ->> 'correctOptionId'))
      ) end
    ))
  ) is true);

commit;
