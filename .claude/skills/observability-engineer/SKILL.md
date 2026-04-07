---
name: observability-engineer
description: Use when implementing cost tracking, token usage logging, heartbeat monitoring, or budget enforcement in Paperclip. Not for generic infrastructure observability.
risk: safe
---

# Observability — Paperclip context

Paperclip V1 observability scope: cost events, token rollups, heartbeat status, budget enforcement. Not full OTel/Prometheus stacks.

## Cost event pattern

Every agent action that consumes tokens emits a cost event:

```ts
// POST /api/cost-events
{
  agentId: string
  taskId?: string
  projectId?: string
  companyId: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number   // calculate client-side: tokens × model rate
  metadata?: Record<string, unknown>
}
```

Rollups: per-agent / per-task / per-project / per-company. Period: monthly UTC.

## Budget enforcement

- Soft alert: usage > 80% of monthly budget → notify board.
- Hard stop: usage ≥ 100% → auto-pause agent, reject new task checkouts.
- Check budget before checkout in the heartbeat, not after.

## Heartbeat monitoring

An agent is "alive" if it completed a heartbeat within its configured interval. Track:
- `last_heartbeat_at`
- `last_run_status` (success / error / timeout)
- `consecutive_failures`

Surface on board UI: green (alive), yellow (late), red (missed 2+ intervals).

## Logging rules

- Every mutating API call must include `X-Paperclip-Run-Id` header.
- Log: `agent_id`, `run_id`, `action`, `issue_id`, `timestamp`, `duration_ms`.
- No PII in logs. Redact API keys, tokens, user content.

## Don't

- Don't add Prometheus, OpenTelemetry, Datadog, or external metrics pipeline in V1.
- Don't log full conversation content — summaries only.
- Don't implement auto-reassignment or self-healing — out of V1 scope.
