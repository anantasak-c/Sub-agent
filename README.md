# Cloud Todo Dashboard

Public Todo Dashboard for Cloud. The production version is a minimal Next.js app for Vercel with Neon Postgres persistence.

## Production Stack

- Next.js App Router
- Vercel hosting
- Neon Postgres via `DATABASE_URL`
- Public access, no authentication in the first version

## Data Model

Production data is stored in Neon Postgres:

- `tasks`
- `task_runs`

The schema is in [db/schema.sql](db/schema.sql). API routes also create the tables automatically on first request if they do not exist.

Legacy local JSON data may still exist in:

- `tasks/items/`
- `runs/<task-id>/`

Those files are not used by the hosted Next.js app.

## Environment

Create a Neon Postgres database and set these Vercel environment variables:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
CLOUD_RUNNER_TOKEN=generate-a-long-random-token
```

Use `.env.example` as the local template.

The local runner does not need direct database access. It needs the deployed dashboard URL and the same runner token in `.env.local`:

```text
CLOUD_RUNNER_BASE_URL=https://sub-agent-cyan.vercel.app
CLOUD_RUNNER_TOKEN=the-same-token-set-on-vercel
CLOUD_RUNNER_INTERVAL_MS=10000
CLOUD_RUNNER_MODEL=gpt-5
```

Do not commit `.env.local`.

## Local Development

This workspace currently has no Node.js binary in PATH, so local Next.js commands may not run until Node.js is installed.

When Node.js is available:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Local Runner

The hosted dashboard queues runs in Neon. The PC local runner claims queued runs, executes the assigned agent locally, and saves the outcome or error back to `task_runs`.

Run continuously:

```bash
python3 scripts/local-runner.py
```

Run one queued item and exit:

```bash
python3 scripts/local-runner.py --once
```

Default behavior:

- `web_researcher` runs through `codex exec --search`
- other agents run through `codex exec`
- Codex runs in read-only sandbox mode
- the runner never sends messages, deletes data, deploys, buys, subscribes, creates agents, or modifies external systems
- outcome is saved in run history as `result`
- failures are saved in run history as `error`

## Deploy Flow

1. Connect the GitHub repository `anantasak-c/Sub-agent` to Vercel project `sub-agent`.
2. Add or connect Neon Postgres through Vercel Marketplace.
3. Ensure `DATABASE_URL` and `CLOUD_RUNNER_TOKEN` exist for Production.
4. Push `main`.
5. Deploy on Vercel.

Cloud must ask for explicit approval before `git push` or production deploy.

## Approval Boundaries

The dashboard must not send messages, delete data, publish, deploy, buy, subscribe, modify external systems, or create new agents without explicit user approval.

`Run agent` creates a queued run. The local runner on the user's PC executes it and saves either the outcome or the error back to run history.
