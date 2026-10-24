# Deployment checklist

## Domains and services

The frontend is live at `https://www.manyways.si/`. All user-facing pages,
including Clerk SSO and the dashboard/editor, stay on `manyways.si` and its
existing www alias. `app.manyways.si` is the **FastAPI backend on Render**, not
a second frontend; do not treat that hostname as deployed
until the provider confirms it.

### Next.js (Vercel)

Keep the existing single Vercel frontend project:
- Framework: Next.js; Node 24.
- Root: `artifacts/manyways`.
- Install: `pnpm install --frozen-lockfile`.
- Build: `pnpm run build`.
- Domain: existing manyways.si/www domains.
- Landing: `/`; Clerk: `/sign-in`, `/sign-up`; dashboard/editor: `/workspace`.
- Do not redirect users to app.manyways.si or create a second Vercel UI project.

Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`,
`NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`,
and `MANYWAYS_API_URL=https://app.manyways.si` after the Render domain is verified.
The publishable key is embedded at build time; rebuild after changing it.
Secret and provider keys must never use a `NEXT_PUBLIC_` prefix.

### Python API and worker (Render)

Use two Render services from the same repository: a Python Web Service for
FastAPI and a Python Background Worker for agent jobs. No backend UI, Redis,
or additional database is needed.

The root `render.yaml` blueprint defines both services, start commands,
environment references, health check, and API domain. Import it through Render
after reviewing it. It specifies small always-on **paid** compute plans;
provisioning requires the owner's approval and Render account access.
This repository change creates no hosted services. Auto-deploys wait for CI.

Install: `pip install -r services/api/requirements.txt`.

API:
```sh
python -m uvicorn services.api.main:app --host 0.0.0.0 --port "$PORT"
```

Worker:
```sh
python -m services.api.worker
```

The blueprint prompts for MongoDB and AgenticOrg settings on the API service
and shares those backend settings with the worker using service references.
Clerk verifier settings belong to the API; Clerk publishable/secret keys belong
only to the Next.js frontend. The API uses its own Clerk JWT/JWKS verification; it does not trust
the Next.js gateway to declare a user ID. Set `CLERK_AUTHORIZED_PARTIES` to exact
frontend origins (`https://manyways.si,https://www.manyways.si`), including the
development/preview origin only in development. Do not use the backend origin
as the browser's authorized party.
If the Clerk token has an audience, configure `CLERK_JWT_AUDIENCE`; without an aud
claim, issuer, signature, expiry, subject, and authorized party remain mandatory.

Use a supervisor's restart policy and HTTPS ingress for the API. `/health` is a
public liveness probe; authenticated `/v1/ready` checks database access and required
provider settings, but does not prove the provider can execute a run. Configure
request size limits, monitoring, retention/backups, and service budgets in the host.
The MongoDB worker claims durable jobs with renewable leases. Multiple workers
are supported, but concurrency is per worker, so scale deliberately.

### Atlas

Use the existing user-managed Atlas cluster, not a replacement database. Rotate
the exposed password, give a dedicated least-privilege user access to `manyways`,
restrict network access to the backend host, and configure `MONGODB_URI` only in
secret settings. Never print the URI in logs. Projects and runs have owner-scoped
queries and supporting indexes, including a one-active-run-per-project constraint.

### Clerk

Use the owner's **external Clerk account**, not a newly provisioned tenant.
Enable email sign-in and Google in that instance. Configure production/live
keys, frontend domains/origins, same-origin `/workspace` redirects and Google OAuth consent
as required by Clerk. Test keys are for local/preview validation, not a
production-readiness claim. Keep development and production user stores separate.

### DNS and release

Add `app.manyways.si` to the Render FastAPI Web Service (also declared in the
blueprint) and use the exact DNS record Render supplies in Hostinger.
Do not add this API hostname to Vercel, guess CNAME targets, or change existing
frontend records. Configure Clerk's separately supplied frontend domain records
as needed.

Review and merge the implementation branch only when service configuration is
ready. The existing Vercel Git integration may automatically publish main; do not
assume a passing CI check gates release. Keep production publishing an explicit
owner decision.

## Acceptance checks

- Sign in with email and Google, sign out, and confirm expired sessions are denied.
- Create a manual story tree with two endings; save and reopen it in another session.
- Verify another user cannot read, update, delete, export, cancel, or apply its work.
- Import `.txt`, generate and review alternatives, apply, and edit a section.
- Run 10 personas × 2 branches; see exactly 20 evaluations and a validated ranking.
- Cancel a run and verify no new calls are dispatched; recover a worker after a crash.
- Download one, selected, and all complete paths, including shared sections.
- Confirm backend errors never become sample results and unsaved/version-conflicted
  edits are retained.
