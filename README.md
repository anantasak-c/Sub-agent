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

Create a Neon Postgres database and set this Vercel environment variable:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
OPENAI_API_KEY=sk-proj...
OPENAI_MODEL=gpt-5
```

Use `.env.example` as the local template.

`OPENAI_API_KEY` is required for automatic agent runs. If it is missing, the dashboard still creates a run and saves a clear error in run history.

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

## Deploy Flow

1. Connect the GitHub repository `anantasak-c/Sub-agent` to Vercel project `sub-agent`.
2. Add or connect Neon Postgres through Vercel Marketplace.
3. Ensure `DATABASE_URL` exists for Production.
4. Push `main`.
5. Deploy on Vercel.

Cloud must ask for explicit approval before `git push` or production deploy.

## Approval Boundaries

The dashboard must not send messages, delete data, publish, deploy, buy, subscribe, modify external systems, or create new agents without explicit user approval.

`Run agent` creates a run, calls the assigned agent through the OpenAI Responses API, and saves either the outcome or the error back to run history.
