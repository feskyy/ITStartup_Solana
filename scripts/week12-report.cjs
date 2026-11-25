const fs=require('fs');
const r=JSON.parse(fs.readFileSync('week12-results.json','utf8'));
if(!r.successfulSwap || !r.rejectedSwap) throw Error('Run successful and rejected swaps first');
const s=r.successfulSwap, f=r.rejectedSwap;
if(s.error || !f.error) throw Error('Unexpected transaction statuses');
const text=`<!-- WEEK12_EVIDENCE_START -->\n### Week 12 — фактические результаты Devnet\n\n- Vault: ${r.vaultState}\n- Token A storage: ${r.vaultA}\n- Token B storage: ${r.vaultB}\n- Успешный swap: ${s.explorer}\n- Отклонённый swap (slippage): ${f.explorer}\n- Цена пула до: ${s.priceBefore}; после: ${s.priceAfter} (в порядке mintA/mintB Raydium).\n- Балансы до (raw): A=${s.before.a}, B=${s.before.b}; после: A=${s.after.a}, B=${s.after.b}.\n- Ожидаемый выход: ${s.expected}; минимальный: ${s.minimum} (raw).\n- При отклонении балансы vault не изменились; комиссия сети может быть списана.\n${r.reverseSwap?'- Обратный обмен: '+r.reverseSwap.explorer+'\n':''}\n<!-- WEEK12_EVIDENCE_END -->`;
let readme=fs.readFileSync('README.md','utf8');const re=/<!-- WEEK12_EVIDENCE_START -->[\s\S]*?<!-- WEEK12_EVIDENCE_END -->/;fs.writeFileSync('README.md',re.test(readme)?readme.replace(re,text):readme+'\n\n'+text+'\n');
