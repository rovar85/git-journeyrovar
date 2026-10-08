// Node harness for the in-browser lab engine: loads the lab parts and replays recorded lesson commands.
const fs = require("fs"), path = require("path");
global.window = global;
const dir = path.join(__dirname, "..", "src", "js");
function load(){
  global.window = global; delete global.LabCore; delete global.LabParts;
  for(const f of ["w_lab1core.js", "w_lab2cmds.js", "w_lab3text.js"]){
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    new Function("window", '"use strict";\n' + src)(global);
  }
  return global.LabCore;
}
function setupsFor(id){
  const [track, n] = [id.replace(/-\d+$/, ""), id.replace(/^.*-/, "")];
  const d = path.join(__dirname, "..", "src", "content", track);
  const f = fs.readdirSync(d).filter(x => x.startsWith(String(n).padStart(2, "0") + "-"))[0];
  if(!f) return [];
  const lines = fs.readFileSync(path.join(d, f), "utf8").split("\n"), out = [];
  for(let i = 0; i < lines.length; i++){
    if(lines[i].startsWith("@setup ")) out.push(fs.readFileSync(path.join(__dirname, "..", "src", "content", "_setup", lines[i].split(/\s+/)[1] + ".sh"), "utf8"));
    else if(lines[i] === "```setup"){ let b = []; i++; while(i < lines.length && !lines[i].startsWith("```")) b.push(lines[i++]); out.push(b.join("\n")); }
  }
  return out;
}
module.exports = {load, setupsFor};
if(require.main === module){
  const L = load();
  const cache = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "content", "_cache.json"), "utf8"));
  const want = process.argv.slice(2);
  const only = want.length ? want : Object.keys(cache).filter(k => /^linux-/.test(k));
  let ok = 0, bad = 0, show = process.env.SHOW !== "0";
  (async () => {
    for(const id of only){
      const sh = L.boot(function(){}); sh.interactive = false;
      const blocks = cache[id].blocks;
      for(const setup of setupsFor(id)){ await sh.run(setup, {out: () => {}, err: s => { if(process.env.SETUPERR) console.log("setup err " + id + ": " + s); }}); }
      sh.cwd = "/home/student/lab"; sh.set("PWD", sh.cwd, true);
      for(const blk of blocks){
        for(const ent of blk){
          let cmd = ent.c.replace(/^\$ /, "").replace(/\n> /g, "\n").replace(/\n>$/g, "\n");
          let out = "";
          sh.io = null;
          const st = await sh.run(cmd, {out: s => { out += s; }});
          const norm = s => s.replace(/\s+$/, "").replace(/[ \t]+\n/g, "\n");
          const exp = norm(ent.o), got = norm(out);
          if(exp === got) ok++; else { bad++; if(show) console.log("--- " + id + " :: " + cmd.slice(0, 160) + "\n  want: " + JSON.stringify(exp.slice(0, 300)) + "\n  got : " + JSON.stringify(got.slice(0, 300))); }
        }
      }
    }
    console.log("match", ok, "differ", bad);
  })();
}
