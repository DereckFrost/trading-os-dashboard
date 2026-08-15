# Trading OS — production deployment

## Stack

Vercel + Supabase.

## Required Vercel environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-5.1`
- `AUTOMATION_TIMEZONE=America/Santo_Domingo`
- `CRON_SECRET` — random secret, 16+ characters

Never commit `.env.local`.

## Cron

Vercel Cron schedules are UTC:

- Behavior alerts: `0 21 * * *`
- Weekly review: `15 21 * * 5`
- Monthly review: `30 21 1 * *`

These correspond to 17:00 / 17:15 / 17:30 in Santo Domingo while UTC-4 applies.

## Supabase production gate

Before deployment, run:

`sql/production_security_audit.sql`

Confirm:

- `trade-screenshots` is private.
- Storage policies are scoped to the authenticated user's folder.
- RLS is enabled on every user-owned table.
- Every user-owned table has `user_id`.
- Policies scope access with `auth.uid() = user_id`.

Do not edit the `storage` schema directly outside Supabase's supported policy mechanism.

## Deployment

1. Push the repository to a private GitHub repository.
2. Import it into Vercel.
3. Set the project root to the repository root.
4. Add the production environment variables.
5. Deploy Production.
6. Verify:
   - `/login`
   - sign in / sign out
   - Trading Office
   - Journal CRUD
   - screenshots
   - Trading Days
   - Analytics
   - Coach
   - Automations
7. Confirm Vercel Cron Jobs are present.

## Security

If credentials were ever committed to Git or shared outside the intended environment, rotate them before production.

`.env.local` is intentionally ignored by Git. Only `.env.local.example` belongs in the repository.
