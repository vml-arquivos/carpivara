const fs = require('fs');
const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split('\n');
let cur = null;
const out = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const m = /^not ok \d+ - (.+)$/.exec(l);
  if (m) { cur = { name: m[1], info: [] }; out.push(cur); continue; }
  if (cur) {
    if (/^  \.\.\s*$/.test(l)) { cur = null; continue; }
    if (/error:|actual|expected|operator|stack|location|at TestContext|estados-veicular\.test\.mjs:\d+/.test(l)) cur.info.push(l.trim());
  }
}
for (const t of out) console.log('### ' + t.name + '\n   ' + t.info.join('\n   '));
