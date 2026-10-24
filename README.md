# ManyWays

A Next.js and JavaScript frontend for creative experimentation.

## Local development

Requires Node.js 24 and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The app lives in `artifacts/manyways`. Projects are stored in the current browser.
Comparison reports are illustrative samples, not live AI analysis.

## Validation

```sh
pnpm build
pnpm --filter @workspace/manyways test
```

GitHub Actions runs a production build and Chromium browser tests for pull requests
and pushes to `main`. CI starts its own production server.

## Vercel

- Framework: Next.js
- Root directory: `artifacts/manyways`
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm run build`
- Node.js: 24.x
- Production branch: `main`

Vercel's GitHub integration deploys pushes to `main` to production and other
branches/pull requests as previews. CI checks and Vercel deployments run
independently; a failed CI check does not automatically block Vercel deployment.
No Vercel token is stored in this repository or required in GitHub Actions.
No application secrets are needed for this frontend-only version.

The intended custom domain is `manyways.si`. Add it in Vercel after purchase and
use the DNS records Vercel supplies; do not guess records from a preview URL.
