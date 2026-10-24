# Deployment and release gates

## Intended split

Keep the existing Vercel marketing project at `manyways.si` / `www.manyways.si`.
The authenticated Next.js app can use the same source root
`artifacts/manyways` in a **separate Vercel project** attached to `app.manyways.si`.
A `NEXT_PUBLIC_WORKSPACE_URL=https://app.manyways.si/workspace` build setting points marketing CTAs to that app
origin; absent it, they use the same deployment's protected `/workspace`.

Host FastAPI and the worker on a **separate Replit Reserved VM**, as selected by
the owner. It must be always running; Vercel request handlers or scale-to-zero
instances are not reliable worker hosts. No VM, production service or DNS record
has been provisioned by this change.

## Frontend (Vercel)

- Root: `artifacts/manyways`; framework Next.js; Node 24.
- Install: `pnpm install --frozen-lockfile`; build: `pnpm run build`.
- Set `STORY_API_URL=https://<actual-backend-domain>`, not a guessed host.
- Set `APP_ORIGINS=https://app.manyways.si` (and exact authorized marketing
  origins if it also serves the workspace).
- Set `APP_ENV=production` for the production build and runtime. The build
  rejects Clerk test keys, an HTTP backend, or missing explicit origins.
- Configure matching external Clerk **live** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  and server-only `CLERK_SECRET_KEY`. Preview deployments use development keys
  and `APP_ENV=preview`; do not copy development user data into production.
- Set `CLERK_JWT_TEMPLATE=manyways-api`.
- Never configure MongoDB, Groq or AgenticOrg credentials as public Next.js
  variables. They belong only on the backend/worker.

The existing marketing project's `main` branch deploys to production
automatically. Source changes must be pushed on a review branch, not onto
`main`, until the owner confirms release. CI is not itself a Vercel deployment
gate; configure required checks and release settings deliberately.

## API and worker VM

Clone the curated source with its `uv.lock`. Use Replit's Python 3.13 runtime
and managed package installation for the locked Python dependencies. Run two
supervised processes:

```sh
python3 -m uvicorn services.story.api:app --host 0.0.0.0 --port 8000
python3 -m services.story.worker
```

Use the VM's process supervisor or two independently supervised services. The
development helper `scripts/backend.sh` starts both and propagates shutdown;
for production, the host must restart the whole service on either process's
failure. Expose only the API HTTP port through the host's TLS ingress. The worker
does not need a public port. Configure the VM only after the owner confirms
provisioning and associated hosting.

API variables: `MONGODB_URI`, `MONGODB_DATABASE`, `CLERK_ISSUER`,
`CLERK_JWT_AUDIENCE=manyways-api`, `APP_ORIGINS`. Worker variables: the Atlas
settings, `GROQ_API_KEY`, `GROQ_MODEL`, optional AgenticOrg credentials/base URL/
agent UUID, `WORKER_CONCURRENCY`, `JOB_TIMEOUT_SECONDS`.

Atlas must allow the VM's **actual outbound network address(es)**. Prefer a
restricted network allowlist or private connectivity rather than `0.0.0.0/0`.
Use TLS and a least-privilege database user scoped to the application database.
Index creation requires appropriate index permissions. Test restart recovery,
cancellation and multiple worker claims on that host. Durable state is in Atlas,
not local files. The verification command also needs access to the separate
`manyways_verification` database; do not grant production users access just to
run a test—use a development credential for verification.

## Clerk and domains

In the external Clerk production instance:

1. Configure the production application domain `app.manyways.si`.
2. Enable email and Google; configure the live Google OAuth credentials and
   callback URLs Clerk supplies. Do not guess callback URLs.
3. Create the `manyways-api` JWT template with `{ "aud": "manyways-api" }`.
   Preserve the default subject, issuer, issued-at and expiry claims.
4. Set sign-in/up paths to `/sign-in` and `/sign-up`, fallback/forced destination
   `/workspace`, and sign-out destination `/`.
5. Complete the exact Clerk DNS records shown by the instance, including
   production frontend/API and email verification records.
6. Confirm live keys and issuer match, and verify email/Google login, logout,
   expiry, cross-account isolation and the signed-in UI in a real browser.

Add `app.manyways.si` to the chosen Vercel app project, then copy **the current
DNS record Vercel provides** into the domain's DNS provider. Do not assume an IP
or CNAME target. Keep the existing apex/www marketing records intact.

## Current infrastructure limitations

- AgenticOrg execution accepted synthetic input but returned `hitl_triggered`.
  Its agent/approval/status reads returned 401. This no longer blocks the main
  stack; the app records the advisory honestly and never uses pending output.
- Generic Python Clerk inspection returned 403, but the installed backend SDK
  succeeded and the development API-token template is now configured. The
  instance owner must still configure the live template, allowed origins and
  email/Google providers. Synthetic development sign-in is not verification of
  production OAuth or real email delivery.
- The API/worker VM, production secrets, Atlas network access for that VM and
  app subdomain DNS still require provisioning/owner confirmation.

Before release, run all CI checks, the real provider smoke using development
credentials, authenticated browser checks with two users, a worker restart test,
and single/selected/all exports. Obtain **separate production release approval**.
Never push Replit's unrelated checkpoint history over GitHub's curated history,
never force-push `main`, and never commit secrets or uploaded assets.

## Verification performed in development

- The production Next.js build, React component journeys, public Chromium checks
  and Python API/worker tests passed.
- A real Groq/LangChain generation produced a valid shared-root tree. A real
  LangGraph worker run persisted 10 personas, a complete 20-cell evaluation
  matrix and rankings in a dedicated Atlas verification database. The real
  AgenticOrg advisory failed; the primary run still completed. Test records
  were removed afterward.
- Real Clerk development sessions verified authenticated Atlas project
  creation, rendered manual editing, save/reopen persistence, selected path
  download, two-user isolation, safe return handling, phone layout and sign-out.
  Synthetic accounts and their projects were removed afterward. This does not
  verify live email delivery, Google OAuth consent or production domain settings.
