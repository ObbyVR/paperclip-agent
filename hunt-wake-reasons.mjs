import pg from '/Users/valeriorullo/Downloads/GitHub/paperclip/node_modules/.pnpm/pg@8.18.0/node_modules/pg/lib/index.js';
const c = new pg.Client({ host: '127.0.0.1', port: 54329, database: 'paperclip', user: 'paperclip', password: 'paperclip' });
await c.connect();
// Distribution of wakeReason across ALL succeeded runs that have an issueId,
// split by silent-failure (input_tokens<=10) vs healthy
const r = await c.query(`
  SELECT
    context_snapshot->>'wakeReason' AS wake_reason,
    COUNT(*) FILTER (WHERE (result_json->'usage'->>'input_tokens')::int <= 10) AS silent,
    COUNT(*) FILTER (WHERE (result_json->'usage'->>'input_tokens')::int > 10) AS healthy
  FROM heartbeat_runs
  WHERE status = 'succeeded'
    AND context_snapshot->>'issueId' IS NOT NULL
    AND result_json->'usage'->>'input_tokens' IS NOT NULL
  GROUP BY 1
  ORDER BY silent DESC, healthy DESC
`);
for (const row of r.rows) console.log(`${row.wake_reason.padEnd(30)}  silent=${row.silent}  healthy=${row.healthy}`);
// Also: which agents?
console.log('\n=== by agent ===');
const r2 = await c.query(`
  SELECT a.name,
    COUNT(*) FILTER (WHERE (r.result_json->'usage'->>'input_tokens')::int <= 10) AS silent,
    COUNT(*) FILTER (WHERE (r.result_json->'usage'->>'input_tokens')::int > 10) AS healthy
  FROM heartbeat_runs r
  LEFT JOIN agents a ON a.id = r.agent_id
  WHERE r.status = 'succeeded'
    AND r.context_snapshot->>'issueId' IS NOT NULL
  GROUP BY 1
  ORDER BY silent DESC
`);
for (const row of r2.rows) console.log(`${(row.name||'?').padEnd(35)}  silent=${row.silent}  healthy=${row.healthy}`);
await c.end();
