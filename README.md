# ManyWays

Emergent Intelligence for creative decisions. A Next.js **JavaScript** workspace
for editable story trees, backed by **Python FastAPI**, **MongoDB Atlas**,
**Clerk**, **LangChain**, **LangGraph**, and **Groq**.

## Product flow

1. Sign in with Clerk (email or Google).
2. Write sections and branch manually, or import a UTF-8 `.txt` and a goal.
3. Edit every section and finish each complete path with an end node.
4. Select complete paths. A run generates 10–15 goal-specific fictional
   personas, evaluates the full persona × branch matrix, then ranks the paths.
5. Save projects, reopen earlier runs, and download one, selected, or all paths.

These are simulated perspectives, **not real survey participants or engagement
forecasts**. Generation/evaluation sends selected text and goals to Groq.
Do not upload confidential content or sensitive personal information.

## Architecture

```text
manyways.si (Next.js on Vercel)
  ├── Marketing
  ├── Clerk sign-in
  ├── Dashboard + story editor (/workspace)
  └── /api/backend/* server gateway
                  │ Clerk JWT
                  ▼
app.manyways.si (FastAPI on Render)
                  │
             MongoDB Atlas
                  │ durable jobs + leases
         Python worker on Render
                  │
       LangGraph: branch / audience / rank
                  │
       LangChain ChatGroq → Groq
```

All user-facing pages stay in one Next.js deployment on manyways.si, including
SSO and the dashboard. app.manyways.si is **backend only**, hosted on Render.
The API and background worker share the Python backend code and MongoDB queue;
there is no second Next.js app, second UI deployment, Redis, or extra database.
The browser calls relative frontend URLs; only the Next.js server calls Render.

## Setup

Use Node.js 24, pnpm 10, and Python 3.13.

```sh
pnpm install --frozen-lockfile
# Standard host setup, outside Replit-managed package tooling:
pip install -r services/api/requirements-test.txt
```

See [`.env.example`](.env.example) for variable names and **placeholders only**.
Add actual secrets through environment settings. Next.js reads `.env.local`
from `artifacts/manyways/` when running outside managed environment settings;
FastAPI and the worker read process environment, not that file.
Never commit real `.env` files. Credentials exposed in chat must be rotated.

Required service setup:
- An external Clerk application with email and Google enabled.
- A MongoDB Atlas database user with least-privilege `readWrite` access to
  `manyways`; permit the backend host's outbound IPs and use TLS.
- `GROQ_API_KEY`; optionally `GROQ_MODEL` (default `openai/gpt-oss-20b`).
  See [active workflow and preserved pseudocode](docs/agent-workflow.md).
  The original [AgenticOrg reference](docs/agenticorg.md) is archived, not executed.

Start **three processes**, from the repository root:

```sh
pnpm dev
python -m uvicorn services.api.main:app --host 0.0.0.0 --port 8000
python -m services.api.worker
```

Set `MANYWAYS_API_URL=http://127.0.0.1:8000` locally. On Replit, use the existing
managed web workflow, not a second duplicate frontend process.
Without Clerk configuration, protected routes show a setup notice; there is
**no authentication bypass**. Without MongoDB/provider configuration, requests
fail explicitly instead of generating demo results.

## Validation

```sh
python -m pytest services/api/tests -q
pnpm --filter @workspace/manyways test:unit
pnpm build
# With the frontend running, or CI=true to start a production server:
pnpm --filter @workspace/manyways test
```

Backend tests use an isolated Mongo test double and injected provider fixtures.
Frontend component tests mock the gateway and Clerk button in test code only.
These tests do not prove live authentication, Atlas connectivity, or provider
execution. Browser smoke tests check marketing navigation and protected routes
without requiring production credentials. A live authenticated acceptance run is
required after secrets are configured.

For an opt-in check using the current Replit preview and a Clerk **development**
instance:

```sh
pnpm --filter @workspace/manyways exec node scripts/live-auth-check.cjs --live
```

This signs in a temporary synthetic Clerk user through a short-lived ticket,
checks real gateway/JWT verification, Atlas persistence, UI edits/reopening, and
branch export, then deletes the test project and user. It refuses production
Clerk instances and never prints tokens. It does not test Google consent or
Groq execution.

Append `--agents` to also exercise real Groq generation, review/apply,
ten personas × two paths, twenty validated responses, and orchestration.

GitHub Actions checks Python contracts, UI component journeys, production build,
and Chromium smoke tests. CI and Vercel deployments are independent unless branch
protection/deployment checks are configured in those services.

## Deployment

See [deployment checklist](docs/deployment.md) and the Render blueprint
[`render.yaml`](render.yaml). No deployment is implied merely
by building the source. Keep production releases separate from feature-branch
review and use the correct live Clerk keys on public domains.
