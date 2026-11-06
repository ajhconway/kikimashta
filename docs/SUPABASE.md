# Supabase setup

Sync is optional. Local practice works without a Supabase connection. This setup uses a free Supabase project and email sign-in codes; the app stays on GitHub Pages.

## Project and database

1. Create a project at [Supabase](https://supabase.com/dashboard). Keep its database password out of the repository.
2. In the SQL editor, run [the sync migration](../supabase/migrations/202611060001_sync.sql) once. It creates private, append-only attempt and card-note tables with row-level security.
3. In a development project, run [the rollback test fixture](../supabase/tests/sync.sql) as `postgres`. It checks owner access, account isolation, anonymous denial, immutable records, duplicate uploads, payload validation, and server timestamps. It requires no extensions and rolls back its test users and data. Any error is a failed check; do not proceed until it is resolved.

The schema grants authenticated users only SELECT and INSERT for their own rows. The browser can insert owner/ID/payload columns, while `created_at` is server-generated. No browser UPDATE or DELETE privileges are granted. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

Keep the project's Data API maximum row limit at least 200, the client's page size. The default limit is sufficient.

## Email sign-in

In **Authentication → URL Configuration**, set the Site URL to `https://kikimashta.com` and allow `https://kikimashta.com/` as a redirect. Add an exact localhost development URL only if needed.

Enable the Email provider. In **Authentication → Email Templates**, edit **Magic link or OTP** to include the code rather than a link:

```html
<h2>Your Kikimashta sign-in code</h2>
<p>{{ .Token }}</p>
```

Use the same code format for Confirm signup if the project sends a separate signup confirmation. Supabase's current guide describes six-digit codes; verify the project's configured OTP length and test a received email. The app accepts six- to ten-digit codes. Avoid hardcoding the length into the email copy. [Passwordless setup](https://supabase.com/docs/guides/auth/auth-email-passwordless), [template variables](https://supabase.com/docs/guides/auth/auth-email-templates).

Supabase's built-in email sender is restricted to project-team addresses and has low sending limits. For personal testing, use your Supabase team email. Configure custom SMTP before using other addresses or broader access. [Email delivery setup](https://supabase.com/docs/guides/auth/auth-smtp).

## Browser configuration

From the project's connection settings, copy its URL and **publishable** key. In GitHub **Settings → Secrets and variables → Actions → Variables**, add these repository variables:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

For local development, put the same names in the ignored `.env.local`. The build embeds these public values; they are not passwords. Never use a secret or `service_role` key in a `VITE_` variable. User authentication and the database policies provide account isolation. [Supabase key types](https://supabase.com/docs/guides/getting-started/api-keys).

Build and publish after configuring the variables. Sign in on two devices, explicitly copy existing guest history into the account, then verify new answers and note edits synchronize. Signing in alone must not import guest data. Local account databases remain separate from the guest database and other accounts.

## Sync protocol

CI runs the migration and rollback fixture in PostgreSQL 17 with a small Auth boundary defined in `supabase/tests/bootstrap.sql`. That bootstrap is only for a disposable CI database; never apply it to Supabase. Hosted email delivery and the complete Supabase API still need live verification.

Attempts use `(user_id, attempt_id)` and notes use `(user_id, event_id)` as immutable identities. Upload with `upsert(..., { onConflict: 'user_id,attempt_id', ignoreDuplicates: true })` or its note equivalent; omit `created_at`. Retrying an upload cannot replace an existing event.

Read pages ordered by `attempt_id` or `event_id`, scoped to the signed-in owner, and rescan from the beginning on each sync. Concurrent inserts may arrive before an earlier page boundary; a later full scan picks them up. The account UI must report success only after all pages complete.

Note edits append events, including empty-text deletion tombstones. For each language/item, the greatest `(updatedAt, id)` wins. Server timestamps are audit data, not the conflict clock. Attempt payloads remain unchanged, including legacy string IDs and corrective-retry context.
