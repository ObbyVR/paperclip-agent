# CLAUDE.md — Paperclip

## Project role
Paperclip is a control plane for autonomous AI companies. Node.js + TypeScript backend, React 19 UI, Drizzle ORM, PostgreSQL.

Read `AGENTS.md` first — it is the primary contributor guide. This file adds skill routing and session discipline on top.

---

## Skill routing

Use the right skill for the task. Skills live in `.claude/skills/`.

| Task | Skill |
|------|-------|
| API calls, heartbeat logic, task checkout, approval flow | `paperclip` |
| UI components, design tokens, layout | `design-guide` + `shadcn` |
| Creating a new agent company package | `company-creator` |
| Drizzle schema, migrations, queries | `drizzle-orm-expert` |
| PostgreSQL schema design, indexes, performance | `postgres-best-practices` |
| React components, hooks, patterns | `react-best-practices` |
| TypeScript types, generics, patterns | `typescript-pro` |
| Agent coordination, orchestration, handoff contracts | `multi-agent-patterns` |
| Cost tracking, tracing, heartbeat observability | `observability-engineer` |
| Telegram bot / CEO approval relay | `telegram-bot-builder` |

Do not activate all skills simultaneously. Load only what the current task requires.

---

## V1 scope boundaries

**In scope (build here):** company lifecycle, goal hierarchy, agent/org tree, task lifecycle, atomic checkout, board approvals, heartbeat invocation, cost events + rollups, budget enforcement, board UI, agent-facing API, activity log.

**Out of scope for V1 (do not implement):** plugin framework, knowledge base subsystem, ClipHub marketplace, multi-board governance, auto self-healing orchestration.

If a skill suggests something out of V1 scope, note it in `doc/BACKLOG.md` and skip.

---

## Stack constraints

- **ORM:** Drizzle only. No raw SQL outside migration files.
- **UI components:** shadcn/ui (new-york, neutral, CSS variables). No new component libraries.
- **State:** React Query for server state, local useState/useReducer for UI state. No Redux.
- **Styling:** Tailwind CSS v4. OKLCH color space. No inline styles.
- **Auth:** Mode-dependent (`local_trusted` / `authenticated`). Do not change the auth model.
- **DB default:** PGlite in dev (no `DATABASE_URL` needed). Postgres in prod.

---

## Session discipline

- Read `doc/SPEC-implementation.md` before any V1 feature work.
- One task at a time. Complete and test before moving on.
- Keep PRs small and reviewable.
- Do not leave the repo in a broken state between sessions.
