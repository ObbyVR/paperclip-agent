import pg from '/Users/valeriorullo/Downloads/GitHub/paperclip/node_modules/.pnpm/pg@8.18.0/node_modules/pg/lib/index.js';
const c = new pg.Client({ host: '127.0.0.1', port: 54329, database: 'paperclip', user: 'paperclip', password: 'paperclip' });
await c.connect();

// Find all succeeded runs with input_tokens = 4 (the silent-failure signature)
const r = await c.query(`
  SELECT
    r.id AS run_id,
    r.agent_id,
    a.name AS agent_name,
    r.context_snapshot->>'wakeReason' AS wake_reason,
    r.context_snapshot->>'issueId' AS issue_id,
    r.result_json->'usage'->>'input_tokens' AS input_tokens,
    r.result_json->'usage'->>'output_tokens' AS output_tokens,
    r.started_at,
    r.status
  FROM heartbeat_runs r
  LEFT JOIN agents a ON a.id = r.agent_id
  WHERE r.status = 'succeeded'
    AND r.result_json->'usage'->>'input_tokens' = '4'
    AND r.context_snapshot->>'issueId' IS NOT NULL
  ORDER BY r.started_at DESC
`);

console.log(`\n=== SILENT FAILURES (succeeded runs with input_tokens=4 + issueId) ===`);
console.log(`Total: ${r.rows.length}\n`);

if (r.rows.length > 0) {
  // Enrich with issue identifier
  const issueIds = [...new Set(r.rows.map(x => x.issue_id).filter(Boolean))];
  const iss = await c.query(`SELECT id, identifier, title, status FROM issues WHERE id = ANY($1::uuid[])`, [issueIds]);
  const imap = Object.fromEntries(iss.rows.map(x => [x.id, x]));

  for (const row of r.rows) {
    const i = imap[row.issue_id];
    console.log(`run=${row.run_id.slice(0,8)}  agent=${row.agent_name}  ${i?.identifier || '?'} (${i?.status || '?'})  wake=${row.wake_reason}  in=${row.input_tokens} out=${row.output_tokens}  ${row.started_at.toISOString()}`);
    if (i) console.log(`     title: ${i.title}`);
  }
}

// Sanity: compare with healthy runs for baseline
const baseline = await c.query(`
  SELECT COUNT(*) AS n, MIN((result_json->'usage'->>'input_tokens')::int) AS min_in, AVG((result_json->'usage'->>'input_tokens')::int)::int AS avg_in
  FROM heartbeat_runs
  WHERE status = 'succeeded'
    AND context_snapshot->>'issueId' IS NOT NULL
    AND result_json->'usage'->>'input_tokens' IS NOT NULL
`);
console.log(`\n=== BASELINE (all succeeded runs with issueId) ===`);
console.log(baseline.rows[0]);

await c.end();
