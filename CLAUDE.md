# Instant Connect Server

Nest.js 11 (TypeScript, Express) backend. Production-grade enterprise application.

## Setup

Copy `.env.example` to `.env` and fill it in. Config is validated at boot, so a
missing or malformed value fails the start with one readable message.

## Commands

- `npm run start:dev` — run in watch mode
- `npm run build` — compile
- `npm run lint` — ESLint with `--fix`
- `npm test` — unit tests (Jest, `*.spec.ts` under `src/`)
- `npm run test:e2e` — e2e tests; these hit the real database in `.env` and
  self-skip when `DATABASE_URL` is unset
- `npm run migration:run` — apply pending migrations
- `npm run migration:revert` — roll the last one back
- `npm run migration:generate -- src/database/migrations/Name` — diff the
  entities against the database; "No changes in database schema were found"
  means the two agree

## Database

Neon Postgres over the pooled endpoint. Migrations are never run automatically
(`synchronize` and `migrationsRun` are both off) — apply them deliberately.
Column names keep TypeORM's default camelCase, so raw SQL must quote them.

## Engineering Rules

All rules for working in this repo live in [.claude/rules.md](.claude/rules.md) — read them before writing code.

@.claude/rules.md
