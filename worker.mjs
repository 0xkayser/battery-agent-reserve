// Offline deterministic paper worker. No network, keys or provider calls.
let text = '';
for await (const chunk of process.stdin) text += chunk;
const { records } = JSON.parse(text);
if (!Array.isArray(records)) throw new Error('records required');
for (const record of records) {
  if (!Number.isSafeInteger(record.cost_micro_usd) || record.cost_micro_usd < 0)
    throw new Error('invalid cost');
}
const result = {
  count: records.length,
  failed: records.filter(r => r.status === 'failed').length,
  ok: records.filter(r => r.status === 'ok').length,
  total_micro_usd: records.reduce((n, r) => n + r.cost_micro_usd, 0),
};
if (!Number.isSafeInteger(result.total_micro_usd)) throw new Error('unsafe sum');
process.stdout.write(JSON.stringify(result));
