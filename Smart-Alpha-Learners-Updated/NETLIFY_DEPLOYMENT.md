# Smart Alpha Learners — Netlify Deployment

This package is prepared for Netlify. The existing application API handlers under `api/` are adapted through `netlify/functions/api.mjs`, so the frontend can continue using `/api/...` routes.

## Netlify build settings

- Base directory: leave empty if this ZIP is the repository root
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

## Required environment variables

Set these in Netlify → Project configuration → Environment variables, then redeploy:

- `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon/publishable key
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service-role key (server-only)
- `APP_ORIGIN` = the exact deployed HTTPS origin

Do **not** expose `SUPABASE_SERVICE_ROLE_KEY` with a `VITE_` prefix and do not put it in frontend source code.

## Verify before login

After deployment, open:

`https://YOUR-SITE.netlify.app/api/health`

The endpoint should return JSON. It reports whether the Supabase URL and service-role key are present and whether the required database tables are reachable.

Then test login from the Smart Alpha Learners login page.

## Supabase requirements

The Supabase Phase-1 schema must already be installed. A login account must have:

- a Supabase Auth user;
- a matching `public.app_users.auth_user_id`;
- `public.app_users.status = 'Active'`;
- a valid `role_id`;
- a valid `school_id` when the account is school-scoped.

Never place the service-role key in browser/client environment variables.

## Production security environment variables

Set all four variables in Netlify:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose to Vite/client code)
- `APP_ORIGIN` (the exact deployed HTTPS origin)

Run the migration in `supabase/migrations/20261004_tenant_boundary_and_schema_contract.sql`
after the existing Elimu Phase-1 schema. Authenticated API data requests now use the
caller JWT so Supabase RLS is enforced; service role is reserved for Auth admin tasks.


## Runtime pin

The project pins Node.js to 22.12.x via `.nvmrc` and `package.json` so Netlify does not select an incompatible runtime for Vite 7.

## Final smoke test

After deployment, verify `GET /api/health`, login, dashboard loading, creating/updating a school record, creating a user, and one representative read/write operation for each enabled module. Then run the tenant-isolation SQL verification against the production Supabase project.
