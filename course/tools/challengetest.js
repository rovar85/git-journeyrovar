// Verifies every ```challenge block in the lessons: the checker must FAIL before the solution and PASS after it.
const fs = require("fs"), path = require("path");
const T = require("./labtest.js"); const L = T.load();
function parse(body){ const d = {}; let key = null, buf = []; for(const line of body.split("\n")){ const m = /^([a-z]+):\s*(\|)?\s*(.*)$/.exec(line); if(m && !line.startsWith(" ")){ if(key) d[key] = buf.join("\n").replace(/\s+$/, ""); key = m[1]; buf = m[2] ? [] : [m[3]]; } else buf.push(line.startsWith("  ") ? line.slice(2) : line); } if(key) d[key] = buf.join("\n").replace(/\s+$/, ""); return d; }
(async () => {
  let n = 0, bad = 0;
  const root = path.join(__dirname, "..", "src", "content");
  for(const track of fs.readdirSync(root)){
    const dir = path.join(root, track); if(!fs.statSync(dir).isDirectory()) continue;
    for(const f of fs.readdirSync(dir).filter(x => x.endsWith(".md"))){
      const txt = fs.readFileSync(path.join(dir, f), "utf8");
      const re = /```challenge\n([\s\S]*?)```/g; let m;
      while((m = re.exec(txt))){
        const ch = parse(m[1]); n++;
        const sh = L.boot(() => {}); sh.interactive = false;
        await L.challenge.start(sh, ch);
        const before = await L.challenge.check(sh, ch, ch.expect ? "true" : "");
        await sh.run(ch.solution, {out: () => {}, err: () => {}});
        const after = await L.challenge.check(sh, ch, ch.solution);
        const ok = !before.ok && after.ok;
        if(!ok){ bad++; console.log("PROBLEM", f, ch.title, "| before ok:", before.ok, "| after:", JSON.stringify(after).slice(0, 200)); }
      }
    }
  }
  console.log({challenges: n, problems: bad});
})();
