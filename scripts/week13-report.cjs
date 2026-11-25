const fs = require('node:fs');
const file = 'week13-results.json';
if (!fs.existsSync(file)) throw Error('Run Week 13 transactions first');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const lines = ['## Week 13 — Raydium CLMM position', '', '| Operation | Transaction | Result |', '|---|---|---|'];
for (const [name, value] of Object.entries(data)) {
  const sig = typeof value === 'string' && name.endsWith('Tx') ? value : value?.signature;
  if (!sig) continue;
  lines.push(`| ${name} | [Explorer](https://explorer.solana.com/tx/${sig}?cluster=devnet) | ${value.error ? 'Rejected (inspect logs)' : 'Confirmed by client'} |`);
}
lines.push('', 'Raw evidence: [week13-results.json](week13-results.json).', '', 'Amounts in evidence are raw token units (6 decimals).');
fs.writeFileSync('week13-report.md', lines.join('\n')+'\n');
console.log('Generated week13-report.md; review before adding to README.');
