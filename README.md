# ManyWays

Authenticated story branching and simulated audience reasoning. Next.js JavaScript,
FastAPI, MongoDB Atlas, Groq/LangChain and LangGraph. The existing paper/ink visual
identity and Emergent Intelligence positioning are preserved.

## What runs where

- `artifacts/manyways`: marketing `/`, Clerk `/sign-in` and `/sign-up`, authenticated
  `/workspace`, and same-origin `/api/backend/v1/*` server endpoints.
- `services/story`: versioned FastAPI API plus a **separate durable worker**.
- Atlas: owner-scoped projects and optimistic versions, immutable run snapshots,
  generated personas, evaluation cells, job leases/checkpoints, and rankings.
- Groq is the primary model provider, through LangChain structured responses.
  LangGraph sequences generation or personas → evaluation matrix → optional
  AgenticOrg advice → ranking. Each stage checkpoints to MongoDB.
- AgenticOrg receives **one real bounded advisory attempt per evaluation run**.
  Failed, approval-pending, unavailable or uncertain calls never block Groq.
  Only completed advice can inform rationale. This is not a claim of hackathon
  eligibility or proof of successful AgenticOrg evaluation.

Personas and scores are generated hypotheses, **not real audience measurements
or empirical engagement predictions**. MiroFish, billing and collaboration are
not implemented.

## Development

Requires Node.js 24, pnpm 10, Python 3.13 and the dependencies locked in `uv.lock`.
On Replit use the managed package/runtime setup; Python packages are installed
in the platform-managed environment. Outside Replit, `uv sync --frozen` and
`uv run` provide the locked environment.

```sh
pnpm install --frozen-lockfile
# Run these three processes independently:
pnpm --filter @workspace/manyways dev
python3 -m uvicorn services.story.api:app --host 0.0.0.0 --port 8000
python3 -m services.story.worker
```

Use secure environment settings for the names in `.env.example`; do not commit
real `.env` files. On Replit, configured workflows start all three processes.
For local Next.js development, keys must be available to its process; the
FastAPI/worker processes also need their documented variables.

Set `STORY_API_URL=http://127.0.0.1:8000` for development. The browser only calls
relative Next.js endpoints. Database/provider credentials and Clerk API tokens
are never returned to the browser.

### External Clerk setup (required)

Use the user's **external** Clerk instance, not a newly provisioned tenant.
Enable email and Google in that instance. Create a JWT template named
`manyways-api` with the custom claim:

```json
{ "aud": "manyways-api" }
```

Keep Clerk's default `sub`, `iss`, `iat`, `exp` claims. Next.js requests this
template server-side. Set `CLERK_ISSUER` on FastAPI to the exact HTTPS issuer for
that same instance and `CLERK_JWT_AUDIENCE=manyways-api`. The service verifies
RS256 signatures against that issuer's JWKS, issuer, audience and expiry;
`azp`, when present, must match `APP_ORIGINS`. Missing/incorrect templates fail
explicitly; there is no authentication bypass.

Auth returns are intentionally fixed to `/workspace`, including signup and
existing sessions. Arbitrary incoming return URLs are not honored. Sign-out
returns to `/`; expired API sessions return to sign-in. Old `/studio` sample
links redirect to the protected workspace.

The development API template has been configured through the installed Clerk
SDK. Generic Python REST inspection returned 403 while SDK administration
succeeded. The instance owner must still confirm email/Google configuration and
repeat this setup on the live instance before production release.

## Editing and jobs

Every story has exactly one editable root. Add children and sibling alternatives,
mark leaf nodes as explicit endings, or confirm subtree deletion. Complete paths
assemble all root-to-end ancestor text; unfinished leaves are visible but excluded
from evaluation/export. Limits: 40 nodes, depth 8, 12 complete paths, 20,000
characters per section and 80,000 total story characters. Goal and persona-count
validation are enforced in the API, not just the interface.

Autosave uses a project version; a 409 preserves the local draft and requires
explicit reload, with an option to download unsaved content. Generation accepts
nonempty fatal-decoded UTF-8 `.txt` files up to 64 KiB. It creates a proposal
without touching saved nodes; applying it requires explicit replacement consent.

Evaluation freezes the goal, rubric, full selected assembled stories, model,
nodes and persona count. It creates 10–15 distinct goal-driven personas and a
cell for every selected branch/persona pair. Evidence quotations must occur in
the evaluated story. Every score uses common 1–5 anchors. Failed cells are
retained and visible; incomplete matrices **never produce a final ranking**.

Jobs have atomic active-project locks, request idempotency keys, renewable
180-second leases and fencing tokens. A replacement worker skips saved stages
and cells. Default concurrency: one job and two evaluation calls per worker.
Provider calls time out at 75 seconds and retry at most three times for
transient/schema errors. Cancellation is cooperative; in-flight calls may
finish but cancelled output cannot become a final ranking. The job budget
defaults to one hour. A job can recover at most three worker claims. Scale
worker counts with the provider's actual shared tenant limits; rate-limit
numbers are not assumed.

AgenticOrg has a 12-second timeout and no retry. The intent is persisted **before**
calling it. If a worker dies during the call, the advisory is marked uncertain
and never resent; exactly-once delivery cannot be guaranteed across an external
HTTP boundary. `hitl_triggered` is recorded and its pending output is not used.

## API contract

FastAPI provides the complete validated OpenAPI schema at `/openapi.json` and
interactive documentation at `/docs`. Every `/v1` route requires
`Authorization: Bearer <Clerk API-template JWT>`. `/health` is a public process
health check, not a database or provider readiness guarantee.

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/v1/projects` | List own projects / create `{title}` |
| GET / PUT / DELETE | `/v1/projects/{id}` | Read / save `{title,nodes,goal,version}` / delete |
| GET / POST | `/v1/projects/{id}/runs` | History / queue a generation or evaluation run |
| GET | `/v1/runs/{id}` | Snapshot, progress, personas, cells, advisory and rankings |
| POST | `/v1/runs/{id}/cancel` | Request cancellation |
| POST | `/v1/projects/{id}/export` | `{branch_ids?,format:"text"|"json"}` |

Run input: `{kind,request_id,branch_ids?,persona_count?,source_name?,source_text?}`.
Use a fresh client UUID as `request_id`; reuse it only when retrying the same
submission. At most one active job per project. Evaluation requires distinct
complete end-node IDs and a ready goal; at most 100,000 selected assembled-story
characters per run. API request bodies are capped at 1 MB.

Project nodes use `{id,parent_id,title,text,is_end}`. Goal fields are
`outcome,audience,age_min,age_max,gender,nationality,tone,constraints`; ages are
whole numbers 13–100. Optional demographic fields do not define persona traits.
Run statuses: `queued,running,completed,partial,failed,cancelled`.

Exports contain root-to-end text, selected IDs only. One path yields UTF-8 text;
multiple paths yield a ZIP with sanitized unique filenames. Omitting
`branch_ids` exports all complete paths. An empty list is rejected, not silently
treated as all. JSON exports contain the owner's current structured project.
Deletion requires cancelling active work first.

## Verification

```sh
python3 -m pytest -q
pnpm --filter @workspace/manyways test:unit
pnpm --filter @workspace/manyways build
pnpm --filter @workspace/manyways test
# Optional REAL provider test; uses and cleans its own records in an isolated Atlas DB:
python3 -m services.story.smoke
# Optional real signed-in browser checks; synthetic users/projects are cleaned up:
cd artifacts/manyways && node scripts/live-auth-check.cjs --live
```

Python tests cover ownership, JWT claims/signatures, tree/path rules, exports,
snapshots, duplicate jobs, retries, recovery/fencing, cancellation, partial
matrices and at-most-once advisory intent. React component tests exercise manual
and automatic journeys with deterministic API mocks; browser tests check public
navigation, mobile layout, redirects and anonymous API refusal. Test mocks are
not used by production providers or auth.

CI runs locked Python tests, component tests, a production build and Chromium
browser tests. CI uses fake **test-only** Clerk configuration for public-route
tests; it does not assert real Google/email login succeeds.

See [deployment instructions](docs/deployment.md) for the app subdomain,
Reserved VM process setup, external Clerk live-instance requirements and release
gates. No production deployment is authorized by source preparation.
