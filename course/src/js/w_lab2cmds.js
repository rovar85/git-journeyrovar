/* In-browser lab, part 2: builtins, coreutils, users, processes, and the starting filesystem.
   Everything here works on the virtual filesystem from part 1. No DOM. */

var L = window.LabCore, SysErr = L.SysErr, Exit = L.Exit;
var B = L.builtins, C = L.cmds;

/* ---------------------------------------------------------------- helpers */
function getopt(args, withArg){            // short flags (combinable), --long[=v], numbers kept as operands via opts.num
  var f = {}, rest = [], i = 0;
  withArg = withArg || "";
  for(; i < args.length; i++){
    var a = args[i];
    if(a === "--"){ rest = rest.concat(args.slice(i + 1)); break; }
    if(a.indexOf("--") === 0 && a.length > 2){ var eq = a.indexOf("="); if(eq > 0) f[a.slice(0, eq)] = a.slice(eq + 1); else f[a] = true; continue; }
    if(a.charAt(0) === "-" && a.length > 1 && !/^-\d+$/.test(a)){
      for(var j = 1; j < a.length; j++){
        var c = a.charAt(j);
        if(withArg.indexOf(c) >= 0){ var v = a.slice(j + 1); if(v === ""){ v = args[++i]; } f[c] = v; break; }
        f[c] = true;
      }
      continue;
    }
    if(/^-\d+$/.test(a)){ f.num = a.slice(1); continue; }
    rest.push(a);
  }
  return {f: f, a: rest};
}
function lines(s){ if(s === "") return []; var l = s.split("\n"); if(l[l.length - 1] === "") l.pop(); return l; }
function fail(io, cmd, path, e){
  if(e instanceof SysErr){ io.err(cmd + ": " + (path !== null && path !== undefined ? path + ": " : "") + e.message + "\n"); return true; }
  throw e;
}
function pad(s, n, left){ s = String(s); while(s.length < n) s = left ? s + " " : " " + s; return s; }
function readInput(sh, io, files, cmd, cb){      // call cb(text, name) for each file or stdin; returns exit status
  var st = 0;
  if(!files.length){ cb(io.in === null || io.in === undefined ? "" : io.in, "-"); return 0; }
  files.forEach(function(f){
    if(f === "-"){ cb(io.in || "", "-"); return; }
    try{
      var abs = sh.fs.norm(f, sh.cwd);
      if(abs === "/dev/null"){ cb("", f); return; }
      cb(sh.fs.readFile(f, sh.cwd, sh.user), f);
    }catch(e){ if(e instanceof SysErr){ io.err(cmd + ": " + f + ": " + e.message + "\n"); st = 1; } else throw e; }
  });
  return st;
}
function passwd(sh){ try{ return lines(sh.fs.readFile("/etc/passwd", "/", null)).map(function(l){ var p = l.split(":"); return {name: p[0], uid: Number(p[2]), gid: Number(p[3]), gecos: p[4], home: p[5], shell: p[6]}; }); }catch(e){ return []; } }
function groups(sh){ try{ return lines(sh.fs.readFile("/etc/group", "/", null)).map(function(l){ var p = l.split(":"); return {name: p[0], gid: Number(p[2]), members: p[3] ? p[3].split(",") : []}; }); }catch(e){ return []; } }
function uname(sh, uid){ var u = passwd(sh).filter(function(x){ return x.uid === uid; })[0]; return u ? u.name : String(uid); }
function gname(sh, gid){ var g = groups(sh).filter(function(x){ return x.gid === gid; })[0]; return g ? g.name : String(gid); }
function userGroups(sh, name){ var u = passwd(sh).filter(function(x){ return x.name === name; })[0]; var gs = groups(sh); var out = []; if(u) out.push(u.gid); gs.forEach(function(g){ if(g.members.indexOf(name) >= 0 && out.indexOf(g.gid) < 0) out.push(g.gid); }); return out; }
function modeStr(n){
  var t = n.t === "d" ? "d" : n.t === "l" ? "l" : "-", m = n.mode, s = t;
  var bits = "rwxrwxrwx";
  for(var i = 0; i < 9; i++) s += (m & (256 >> i)) ? bits.charAt(i) : "-";
  var a = s.split("");
  if(m & 2048) a[3] = (m & 64) ? "s" : "S";
  if(m & 1024) a[6] = (m & 8) ? "s" : "S";
  if(m & 512) a[9] = (m & 1) ? "t" : "T";
  return a.join("");
}
function sizeOf(n){ return n.t === "d" ? 4096 : n.t === "l" ? n.target.length : n.data.length; }
function human(b){ if(b < 1024) return String(b); var u = "KMGT", v = b; for(var i = 0; i < 4; i++){ v /= 1024; if(v < 1024 || i === 3){ return (v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : String(Math.ceil(v))) + u.charAt(i); } } }
var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function two(n){ return (n < 10 ? "0" : "") + n; }
function mtimeStr(ms, style){
  var d = new Date(ms);
  if(style === "long-iso") return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes());
  var half = 182 * 86400000, recent = Math.abs(Date.now() - ms) < half;
  return MON[d.getMonth()] + " " + pad(d.getDate(), 2) + " " + (recent ? two(d.getHours()) + ":" + two(d.getMinutes()) : " " + d.getFullYear());
}
function parseMode(spec, cur, isDir, umask){
  if(/^[0-7]+$/.test(spec)) return parseInt(spec, 8);
  var m = cur & 4095;
  var clauses = spec.split(",");
  for(var c = 0; c < clauses.length; c++){
    var mm = /^([ugoa]*)([-+=])([rwxXst]*|[ugo])$/.exec(clauses[c]);
    if(!mm) return null;
    var who = mm[1] || "a", op = mm[2], perm = mm[3], bits = 0;
    var ws = who === "a" ? "ugo" : who;
    if(/^[ugo]$/.test(perm)){ var src = perm === "u" ? (m >> 6) & 7 : perm === "g" ? (m >> 3) & 7 : m & 7; for(var k = 0; k < ws.length; k++){ bits |= src << (ws.charAt(k) === "u" ? 6 : ws.charAt(k) === "g" ? 3 : 0); } }
    else {
      var p = (perm.indexOf("r") >= 0 ? 4 : 0) | (perm.indexOf("w") >= 0 ? 2 : 0) | (perm.indexOf("x") >= 0 || (perm.indexOf("X") >= 0 && (isDir || (cur & 73))) ? 1 : 0);
      for(var k2 = 0; k2 < ws.length; k2++){ bits |= p << (ws.charAt(k2) === "u" ? 6 : ws.charAt(k2) === "g" ? 3 : 0); }
      if(perm.indexOf("s") >= 0){ if(ws.indexOf("u") >= 0) bits |= 2048; if(ws.indexOf("g") >= 0) bits |= 1024; }
      if(perm.indexOf("t") >= 0) bits |= 512;
    }
    var clear = 0;
    for(var k3 = 0; k3 < ws.length; k3++) clear |= 7 << (ws.charAt(k3) === "u" ? 6 : ws.charAt(k3) === "g" ? 3 : 0);
    if(op === "+") m |= bits; else if(op === "-") m &= ~bits; else { m = (m & ~clear) | bits; if(perm.indexOf("s") < 0 && ws.indexOf("u") >= 0) m &= ~2048; }
  }
  return m;
}
L.util = {getopt: getopt, lines: lines, fail: fail, pad: pad, readInput: readInput, passwd: passwd, groups: groups, uname: uname, gname: gname, modeStr: modeStr, sizeOf: sizeOf, mtimeStr: mtimeStr, human: human};

/* ---------------------------------------------------------------- builtins */
B["true"] = function(){ return 0; }; B["false"] = function(){ return 1; }; B[":"] = function(){ return 0; };
B.echo = function(args, io){
  var nl = true, esc = false, i = 0;
  for(; i < args.length; i++){ var m = /^-[neE]+$/.exec(args[i]); if(!m) break; if(args[i].indexOf("n") >= 0) nl = false; if(args[i].indexOf("e") >= 0) esc = true; if(args[i].indexOf("E") >= 0) esc = false; }
  var s = args.slice(i).join(" ");
  if(esc) s = s.replace(/\\(c[\s\S]*|[\\abfnrtv]|0[0-7]{0,3}|x[0-9a-fA-F]{1,2})/g, function(m0, c){ if(c.charAt(0) === "c") return ""; return {"\\": "\\", a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v"}[c] || (c.charAt(0) === "x" ? String.fromCharCode(parseInt(c.slice(1), 16)) : String.fromCharCode(parseInt(c, 8) || 0)); });
  io.out(s + (nl ? "\n" : "")); return 0;
};
function fmtPrintf(args){
  var fmt = args[0] || "", rest = args.slice(1), out = "", used = false, ri = 0;
  function once(){
    var o = "", consumed = false;
    for(var i = 0; i < fmt.length; i++){
      var c = fmt.charAt(i);
      if(c === "\\"){
        var d = fmt.charAt(++i);
        if(d === "n") o += "\n"; else if(d === "t") o += "\t"; else if(d === "r") o += "\r"; else if(d === "\\") o += "\\"; else if(d === "a") o += "\x07"; else if(d === "e") o += "\x1b"; else if(d === '"') o += '"';
        else if(/[0-7]/.test(d)){ var m = /^[0-7]{1,3}/.exec(fmt.slice(i)); o += String.fromCharCode(parseInt(m[0], 8)); i += m[0].length - 1; }
        else if(d === "x"){ var m2 = /^[0-9a-fA-F]{1,2}/.exec(fmt.slice(i + 1)); if(m2){ o += String.fromCharCode(parseInt(m2[0], 16)); i += m2[0].length; } else o += "\\x"; }
        else o += "\\" + d;
        continue;
      }
      if(c === "%"){
        var m3 = /^%([-+ 0#]*)(\*|\d+)?(?:\.(\d+))?([sdifeEgGxXoucb%])/.exec(fmt.slice(i));
        if(!m3){ o += c; continue; }
        i += m3[0].length - 1;
        var conv = m3[4];
        if(conv === "%"){ o += "%"; continue; }
        var arg = rest[ri]; if(arg !== undefined){ ri++; consumed = true; }
        var s2, w = m3[2] === "*" ? Number(rest[ri - 1]) : Number(m3[2] || 0), prec = m3[3] === undefined ? undefined : Number(m3[3]), fl = m3[1];
        switch(conv){
          case "s": case "b": s2 = arg === undefined ? "" : String(arg); if(conv === "b") s2 = s2.replace(/\\n/g, "\n").replace(/\\t/g, "\t"); if(prec !== undefined) s2 = s2.slice(0, prec); break;
          case "c": s2 = arg === undefined ? "" : String(arg).charAt(0); break;
          case "d": case "i": s2 = String(Math.trunc(Number(arg === undefined ? 0 : arg)) || 0); if(fl.indexOf("+") >= 0 && Number(s2) >= 0) s2 = "+" + s2; break;
          case "u": s2 = String(Math.abs(Math.trunc(Number(arg || 0)))); break;
          case "x": s2 = (Math.trunc(Number(arg || 0)) >>> 0).toString(16); if(fl.indexOf("#") >= 0) s2 = "0x" + s2; break;
          case "X": s2 = (Math.trunc(Number(arg || 0)) >>> 0).toString(16).toUpperCase(); break;
          case "o": s2 = (Math.trunc(Number(arg || 0)) >>> 0).toString(8); break;
          case "f": case "e": case "E": case "g": case "G": { var nv = Number(arg === undefined ? 0 : arg) || 0; s2 = conv === "f" ? nv.toFixed(prec === undefined ? 6 : prec) : conv === "e" || conv === "E" ? nv.toExponential(prec === undefined ? 6 : prec) : String(Number(nv.toPrecision(prec === undefined ? 6 : prec || 1))); if(fl.indexOf("+") >= 0 && nv >= 0) s2 = "+" + s2; break; }
        }
        if(w && s2.length < w){ if(fl.indexOf("-") >= 0) s2 = pad(s2, w, true); else if(fl.indexOf("0") >= 0 && /[dfiu]/.test(conv)){ var sign = /^[-+]/.test(s2) ? s2.charAt(0) : ""; s2 = sign + pad(s2.slice(sign.length), w - sign.length).replace(/ /g, "0"); } else s2 = pad(s2, w); }
        o += s2; continue;
      }
      o += c;
    }
    return {o: o, consumed: consumed};
  }
  var r = once(); out += r.o;
  while(ri < rest.length && r.consumed){ r = once(); out += r.o; }
  return out;
}
L.fmtPrintf = fmtPrintf;
B.printf = function(args, io){
  if(!args.length){ io.err("printf: usage: printf [-v var] format [arguments]\n"); return 2; }
  if(args[0] === "-v"){ this.set(args[1], fmtPrintf(args.slice(2))); return 0; }
  io.out(fmtPrintf(args)); return 0;
};
B.pwd = function(args, io){ io.out(this.cwd + "\n"); return 0; };
B.cd = function(args, io){
  var dest = args.filter(function(a){ return a !== "-L" && a !== "-P"; })[0];
  if(dest === undefined) dest = this.get("HOME") || "/";
  var echo = false;
  if(dest === "-"){ dest = this.get("OLDPWD"); echo = true; if(!dest){ io.err("bash: cd: OLDPWD not set\n"); return 1; } }
  try{
    var r = this.fs.lookup(dest, this.cwd, this.user, true);
    if(!r.node){ io.err("bash: cd: " + dest + ": No such file or directory\n"); return 1; }
    if(r.node.t !== "d"){ io.err("bash: cd: " + dest + ": Not a directory\n"); return 1; }
    if(!this.fs.can(r.node, this.user, 1)){ io.err("bash: cd: " + dest + ": Permission denied\n"); return 1; }
    this.set("OLDPWD", this.cwd, true); this.cwd = r.path; this.set("PWD", r.path, true);
    if(echo) io.out(r.path + "\n");
    return 0;
  }catch(e){ if(e instanceof SysErr){ io.err("bash: cd: " + dest + ": " + e.message + "\n"); return 1; } throw e; }
};
B.export = function(args, io){
  if(!args.length || args[0] === "-p"){ var self = this; Array.from(this.vars.keys()).sort().forEach(function(k){ var e = self.vars.get(k); if(e.x) io.out("declare -x " + k + '="' + e.v + '"\n'); }); return 0; }
  for(var i = 0; i < args.length; i++){
    if(args[i] === "-n") continue;
    var eq = args[i].indexOf("=");
    if(eq > 0) this.set(args[i].slice(0, eq), args[i].slice(eq + 1), true);
    else { var e2 = this.vars.get(args[i]); if(e2) e2.x = true; else this.vars.set(args[i], {v: "", x: true, unsetExport: true}); }
  }
  return 0;
};
B.unset = function(args){ var self = this; args.forEach(function(a){ if(a === "-v" || a === "-f") return; self.vars.delete(a); self.funcs.delete(a); }); return 0; };
B.readonly = function(args){ for(var i = 0; i < args.length; i++){ var eq = args[i].indexOf("="); if(eq > 0) this.set(args[i].slice(0, eq), args[i].slice(eq + 1)); var e = this.vars.get(eq > 0 ? args[i].slice(0, eq) : args[i]); if(e) e.ro = true; } return 0; };
B.declare = B.typeset = function(args, io){
  var arr = false, assoc = false, exp = false, ro = false, p = false, rest = [];
  args.forEach(function(a){ if(/^-[aAxrpgi]+$/.test(a)){ if(a.indexOf("a") >= 0) arr = true; if(a.indexOf("A") >= 0) assoc = true; if(a.indexOf("x") >= 0) exp = true; if(a.indexOf("r") >= 0) ro = true; if(a.indexOf("p") >= 0) p = true; } else rest.push(a); });
  var self = this;
  if(p && !rest.length){ Array.from(this.vars.keys()).sort().forEach(function(k){ io.out("declare -- " + k + '="' + self.vars.get(k).v + '"\n'); }); return 0; }
  rest.forEach(function(a){
    var eq = a.indexOf("="), nm = eq > 0 ? a.slice(0, eq) : a;
    if(p){ var e0 = self.vars.get(nm); if(e0) io.out("declare -- " + nm + '="' + e0.v + '"\n'); return; }
    if(self.localStack && self.localStack.length !== undefined && self.depth > 0 && !exp){ self.localStack.push({name: nm, prev: self.vars.get(nm) ? {v: self.vars.get(nm).v, x: self.vars.get(nm).x} : null}); }
    if(eq > 0) self.set(nm, a.slice(eq + 1), exp); else if(!self.vars.get(nm)) self.vars.set(nm, {v: "", x: exp, arr: arr ? [] : undefined});
    if(ro){ var e = self.vars.get(nm); if(e) e.ro = true; }
  });
  return 0;
};
B["local"] = function(args){
  var self = this;
  args.forEach(function(a){
    var eq = a.indexOf("="), nm = eq > 0 ? a.slice(0, eq) : a;
    if(self.localStack) self.localStack.push({name: nm, prev: self.vars.get(nm) ? {v: self.vars.get(nm).v, x: self.vars.get(nm).x} : null});
    self.vars.set(nm, {v: eq > 0 ? a.slice(eq + 1) : "", x: false});
  });
  return 0;
};
B.shift = function(args){ var n = Number(args[0] || 1); if(n > this.argv.length - 1) return 1; this.argv.splice(1, n); return 0; };
B["return"] = function(args){ throw new (L.CtlClass())("return", args.length ? Number(args[0]) & 255 : this.status); };
B.exit = function(args){ throw new Exit(args.length ? Number(args[0]) & 255 : this.status); };
B["break"] = function(args){ throw new (L.CtlClass())("break", Number(args[0] || 1)); };
B["continue"] = function(args){ throw new (L.CtlClass())("continue", Number(args[0] || 1)); };
B.read = async function(args, io){
  var raw = false, prompt = "", vars = [], i = 0, delim = "\n";
  for(; i < args.length; i++){
    if(args[i] === "-r") raw = true; else if(args[i] === "-p"){ prompt = args[++i]; } else if(args[i] === "-s" || args[i] === "-e") {} else if(args[i] === "-d"){ delim = args[++i]; } else if(args[i] === "-a"){ vars.arr = args[++i]; } else if(args[i] === "-t" || args[i] === "-n"){ i++; } else vars.push(args[i]);
  }
  if(prompt) io.err(prompt);
  var input = io.in;
  if(input === null || input === undefined || input === ""){ return 1; }
  var idx = input.indexOf(delim), line;
  if(idx < 0){ line = input; io.in = ""; } else { line = input.slice(0, idx); io.in = input.slice(idx + 1); }
  if(this.io && this.io !== io) this.io.in = io.in;
  if(!raw) line = line.replace(/\\(.)/g, "$1");
  var ifs = this.get("IFS"); if(ifs === undefined) ifs = " \t\n";
  if(vars.arr){ var parts = line.split(new RegExp("[" + ifs.replace(/[\]\\^-]/g, "\\$&") + "]+")).filter(Boolean); this.vars.set(vars.arr, {v: parts[0] || "", x: false, arr: parts}); return idx < 0 ? 1 : 0; }
  if(!vars.length) vars.push("REPLY");
  var fields = [], rest = line;
  for(var k = 0; k < vars.length - 1; k++){
    rest = rest.replace(new RegExp("^[" + ifs.replace(/[\]\\^-]/g, "\\$&") + "]+"), "");
    var m = new RegExp("[" + ifs.replace(/[\]\\^-]/g, "\\$&") + "]").exec(rest);
    if(!m){ fields.push(rest); rest = ""; for(var z = k + 1; z < vars.length - 1; z++) fields.push(""); break; }
    fields.push(rest.slice(0, m.index)); rest = rest.slice(m.index + 1);
  }
  if(fields.length < vars.length) fields.push(rest.replace(new RegExp("^[" + ifs.replace(/[\]\\^-]/g, "\\$&") + "]+"), "").replace(new RegExp("[" + ifs.replace(/[\]\\^-]/g, "\\$&") + "]+$"), ""));
  for(var q = 0; q < vars.length; q++) this.set(vars[q], fields[q] === undefined ? "" : fields[q]);
  return idx < 0 ? 1 : 0;
};
function testExpr(sh, a){                 // test / [
  var p = 0;
  function or(){ var l = and(); while(a[p] === "-o"){ p++; var r = and(); l = l || r; } return l; }
  function and(){ var l = not(); while(a[p] === "-a"){ p++; var r = not(); l = l && r; } return l; }
  function not(){ if(a[p] === "!"){ p++; return !not(); } return prim(); }
  function prim(){
    if(a[p] === "("){ p++; var v = or(); p++; return v; }
    if(a[p] && /^-[a-zA-Z]$/.test(a[p]) && p + 1 < a.length && !/^(=|!=|-eq|-ne|-lt|-le|-gt|-ge)$/.test(a[p + 1] || "") ){ var op = a[p++], v2 = a[p++]; return L.testUnary(sh, op, v2); }
    var x = a[p++];
    var o = a[p];
    if(o && /^(=|==|!=|-eq|-ne|-lt|-le|-gt|-ge|-nt|-ot|<|>)$/.test(o)){
      p++; var y = a[p++];
      switch(o){
        case "=": case "==": return x === y; case "!=": return x !== y; case "<": return x < y; case ">": return x > y;
        case "-nt": try{ return sh.fs.get(x, sh.cwd, sh.user, true).mtime > sh.fs.get(y, sh.cwd, sh.user, true).mtime; }catch(e){ return false; }
        case "-ot": try{ return sh.fs.get(x, sh.cwd, sh.user, true).mtime < sh.fs.get(y, sh.cwd, sh.user, true).mtime; }catch(e){ return false; }
        default:
          if(!/^-?\d+$/.test(x) || !/^-?\d+$/.test(y)) throw new Error("integer expression expected");
          var nx = Number(x), ny = Number(y);
          return o === "-eq" ? nx === ny : o === "-ne" ? nx !== ny : o === "-lt" ? nx < ny : o === "-le" ? nx <= ny : o === "-gt" ? nx > ny : nx >= ny;
      }
    }
    return x !== undefined && x !== "";
  }
  return or();
}
B.test = function(args, io){ try{ return testExpr(this, args) ? 0 : 1; }catch(e){ io.err("bash: test: " + e.message + "\n"); return 2; } };
B["["] = function(args, io){
  if(args[args.length - 1] !== "]"){ io.err("bash: [: missing `]'\n"); return 2; }
  try{ return testExpr(this, args.slice(0, -1)) ? 0 : 1; }catch(e){ io.err("bash: [: " + e.message + "\n"); return 2; }
};
B.let = function(args){ var v = 0; for(var i = 0; i < args.length; i++) v = this.arith(args[i]); return v === 0 ? 1 : 0; };
B.source = B["."] = async function(args, io){
  if(!args.length){ io.err("bash: .: filename argument required\n"); return 2; }
  var text;
  try{ text = this.fs.readFile(args[0], this.cwd, this.user); }catch(e){ if(e instanceof SysErr){ io.err("bash: " + args[0] + ": " + e.message + "\n"); return 1; } throw e; }
  var saveArgv = this.argv; if(args.length > 1) this.argv = [this.script].concat(args.slice(1));
  try{ return await this.runText(text); } finally { this.argv = saveArgv; }
};
B.eval = async function(args){ return await this.runText(args.join(" ")); };
B.exec = async function(args, io){ if(!args.length) return 0; var st = await this.exec(args, io); throw new Exit(st); };
B.alias = function(args, io){
  var self = this;
  if(!args.length){ Array.from(this.aliases.keys()).sort().forEach(function(k){ io.out("alias " + k + "='" + self.aliases.get(k) + "'\n"); }); return 0; }
  args.forEach(function(a){ var eq = a.indexOf("="); if(eq > 0) self.aliases.set(a.slice(0, eq), a.slice(eq + 1)); else if(self.aliases.has(a)) io.out("alias " + a + "='" + self.aliases.get(a) + "'\n"); else io.err("bash: alias: " + a + ": not found\n"); });
  return 0;
};
B.unalias = function(args){ var self = this; args.forEach(function(a){ self.aliases.delete(a); }); return 0; };
B.umask = function(args, io){
  if(!args.length || args[0] === "-S"){ io.out(pad(this.umask.toString(8), 4).replace(/ /g, "0") + "\n"); return 0; }
  if(!/^[0-7]{1,4}$/.test(args[0])){ io.err("bash: umask: " + args[0] + ": invalid octal number\n"); return 1; }
  this.umask = parseInt(args[0], 8); return 0;
};
B.set = function(args, io){
  if(!args.length){ var self = this; Array.from(this.vars.keys()).sort().forEach(function(k){ io.out(k + "=" + self.vars.get(k).v + "\n"); }); return 0; }
  var i = 0;
  for(; i < args.length; i++){
    var a = args[i];
    if(a === "--"){ this.argv = [this.script].concat(args.slice(i + 1)); return 0; }
    if(/^[-+][a-zA-Z]+$/.test(a)){
      var on = a.charAt(0) === "-";
      if(a.indexOf("e") > 0) this.opts.e = on; if(a.indexOf("u") > 0) this.opts.u = on; if(a.indexOf("x") > 0) this.opts.x = on;
      if(/o$/.test(a)){ var nm = args[++i]; if(nm === "pipefail") this.opts.pipefail = on; if(nm === "errexit") this.opts.e = on; if(nm === "nounset") this.opts.u = on; if(nm === "xtrace") this.opts.x = on; }
    } else { this.argv = [this.script].concat(args.slice(i)); return 0; }
  }
  return 0;
};
B.shopt = function(){ return 0; };
B.trap = function(args, io){
  if(!args.length){ return 0; }
  if(args[0] === "-l"){ io.out("EXIT HUP INT QUIT TERM\n"); return 0; }
  var act = args[0], self = this;
  args.slice(1).forEach(function(sg){ sg = String(sg).replace(/^SIG/, ""); if(sg === "0") sg = "EXIT"; if(act === "-") self.traps.delete(sg); else self.traps.set(sg, act); });
  return 0;
};
B.type = function(args, io){
  var st = 0, self = this;
  args.forEach(function(a){
    if(a.charAt(0) === "-") return;
    if(self.aliases.has(a)) io.out(a + " is aliased to `" + self.aliases.get(a) + "'\n");
    else if(self.funcs.has(a)) io.out(a + " is a function\n");
    else if(/^(if|then|else|fi|for|while|do|done|case|esac|function|time|\[\[|\]\])$/.test(a)) io.out(a + " is a shell keyword\n");
    else if(B[a] && !/^(true|false|echo|printf|pwd|test|\[|kill)$/.test(a) || (B[a] && /^(echo|printf|pwd|test|\[|kill|true|false)$/.test(a))) io.out(a + " is a shell builtin\n");
    else { var p = self.findInPath(a); if(p) io.out(a + " is " + p + "\n"); else { io.err("bash: type: " + a + ": not found\n"); st = 1; } }
  });
  return st;
};
B.command = async function(args, io){
  if(args[0] === "-v"){ var st = 0, self = this; args.slice(1).forEach(function(a){ if(B[a]) io.out(a + "\n"); else { var p = self.findInPath(a); if(p) io.out(p + "\n"); else st = 1; } }); return st; }
  var s = this.funcs; this.funcs = new Map();
  try{ return await this.exec(args, io); } finally { this.funcs = s; }
};
B.builtin = async function(args, io){ return await this.exec(args, io); };
B.hash = function(){ return 0; };
B.which = function(args, io){ var st = 0, self = this; args.forEach(function(a){ var p = self.findInPath(a); if(p) io.out(p + "\n"); else st = 1; }); return st; };
B.help = function(args, io){
  var txt = {cd: "cd: cd [-L|[-P [-e]] [-@]] [dir]\n    Change the shell working directory.\n    \n    Change the current directory to DIR.  The default DIR is the value of the\n    HOME shell variable.\n"};
  io.out(args[0] && txt[args[0]] ? txt[args[0]] : "GNU bash (lab emulation). Type `help NAME' for builtins; the lab implements a subset of bash.\n"); return 0;
};
B.history = function(args, io){ var h = this.history || []; h.forEach(function(l, i){ io.out(pad(i + 1, 5) + "  " + l + "\n"); }); return 0; };
B.jobs = function(args, io){
  var live = this.procs.filter(function(p){ return p.job && !p.done; });
  live.forEach(function(p, i){
    var mark = i === live.length - 1 ? "+" : i === live.length - 2 ? "-" : " ";
    io.out("[" + p.job + "]" + mark + "  Running                 " + p.cmd + " &\n");
  });
  return 0;
};
B.wait = async function(args, io){
  var self = this, last = 0;
  this.procs.forEach(function(p){
    var asked = !args.length || args.indexOf(String(p.pid)) >= 0 || args.indexOf("%" + p.job) >= 0;
    if(!asked) return;
    if(!p.done){ p.done = true; p.state = "Z"; p.status = 0; L.procGone(self, p); }
    if(args.length) last = p.status || 0;
  });
  await L.yield();
  return last;
};
B.disown = function(){ return 0; };
B.fg = B.bg = function(args, io){ io.err("bash: fg: no job control in the lab\n"); return 1; };
B.kill = async function(args, io){
  var sig = "TERM", pids = [], i = 0;
  var NUM = {1: "HUP", 2: "INT", 3: "QUIT", 9: "KILL", 15: "TERM", 18: "CONT", 19: "STOP", 10: "USR1", 12: "USR2", 0: "0"}, REV = {HUP: 1, INT: 2, QUIT: 3, KILL: 9, TERM: 15, CONT: 18, STOP: 19, USR1: 10, USR2: 12};
  if(args[0] === "-l"){
    if(args.length > 1){ args.slice(1).forEach(function(a){ a = a.replace(/^SIG/, ""); io.out((REV[a] !== undefined ? REV[a] : NUM[a] || "") + "\n"); }); return 0; }
    io.out(" 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 9) SIGKILL\t15) SIGTERM\t18) SIGCONT\t19) SIGSTOP\n"); return 0;
  }
  for(; i < args.length; i++){
    var a = args[i];
    if(a === "-s" || a === "-n"){ sig = args[++i]; continue; }
    if(/^-[A-Za-z0-9]+$/.test(a) && !pids.length){ sig = a.slice(1); continue; }
    pids.push(a);
  }
  sig = String(sig).replace(/^SIG/, ""); if(NUM[sig]) sig = NUM[sig];
  var st = 0, self = this;
  for(var k = 0; k < pids.length; k++){
    var pid = pids[k];
    var p = self.procs.filter(function(x){ return String(x.pid) === pid || ("%" + x.job) === pid || (pid === "%" || pid === "%+") && x === self.procs[self.procs.length - 1]; })[0];
    if(!p || p.done){ io.err("bash: kill: (" + pid + ") - No such process\n"); st = 1; continue; }
    if(sig === "0") continue;
    if(sig === "STOP"){ p.state = "T"; continue; } if(sig === "CONT"){ p.state = "S"; continue; }
    var handler = p.traps && p.traps.get(sig);
    if(handler !== undefined && sig !== "KILL" && sig !== "STOP"){
      if(handler === "") continue;                         // trap '' SIG: ignored
      try{ await p.sub.runText(handler); }catch(e){ if(e instanceof Exit){ p.done = true; p.state = "Z"; p.status = e.code; L.procGone(self, p); } else if(!(e instanceof L.Ctl)) throw e; }
      continue;
    }
    p.done = true; p.state = "Z"; p.sig = sig; p.status = 128 + (REV[sig] || 15); L.procGone(self, p);
  }
  return st;
};
B.python3 = async function(args, io, name){
  var self = this;
  if(!L.python) { io.err("python3: the Python engine is not loaded yet. Click 'Load Python' in the lab bar (it downloads about 10 MB once).\n"); return 127; }
  return await L.python.call(this, args, io);
};
B.python = B.python3;
B.bash = B.sh = async function(args, io, name){
  var i = 0, text = null, rest = [], opts = {};
  for(; i < args.length; i++){
    var a = args[i];
    if(a === "-c"){ text = args[++i]; rest = args.slice(i + 1); break; }
    if(/^-[a-zA-Z]+$/.test(a)){ if(a.indexOf("e") > 0) opts.e = true; if(a.indexOf("u") > 0) opts.u = true; if(a.indexOf("x") > 0) opts.x = true; continue; }
    break;
  }
  var sub = this.fork(); sub.io = io; sub.localStack = [];
  if(opts.e) sub.opts.e = true; if(opts.u) sub.opts.u = true; if(opts.x) sub.opts.x = true;
  if(text === null){
    if(i >= args.length){ text = io.in || ""; sub.script = name; }
    else {
      var f = args[i];
      try{ text = this.fs.readFile(f, this.cwd, this.user); }catch(e){ if(e instanceof SysErr){ io.err(name + ": " + f + ": " + e.message + "\n"); return 127; } throw e; }
      sub.script = f; rest = args.slice(i + 1);
    }
  } else sub.script = rest.length ? rest[0] : name;
  sub.argv = [sub.script].concat(text !== null && args[i - 1] === "-c" ? rest.slice(1) : rest);
  sub.pid = this.nextPid++; sub.ppid = this.pid;
  var st;
  try{ st = await sub.runText(text); }catch(e){ if(e instanceof Exit) st = e.code; else if(e instanceof L.CtlClass() && e.kind === "return") st = e.n; else throw e; }
  await sub.runTrap("EXIT");
  this.nextPid = Math.max(this.nextPid, sub.nextPid); this.procs = sub.procs; this.steps = sub.steps;
  return st;
};
B.time = function(){ return 0; };
B.env = function(args, io){
  var env = this.env(), i = 0;
  if(args[0] === "-i"){ env = {}; i = 1; }
  for(; i < args.length && args[i].indexOf("=") > 0; i++){ var eq = args[i].indexOf("="); env[args[i].slice(0, eq)] = args[i].slice(eq + 1); }
  if(i < args.length){
    var self = this, saved = [];
    Object.keys(env).forEach(function(k){ saved.push([k, self.vars.get(k)]); self.vars.set(k, {v: env[k], x: true}); });
    return self.exec(args.slice(i), io).then(function(st){ saved.forEach(function(s){ if(s[1]) self.vars.set(s[0], s[1]); else self.vars.delete(s[0]); }); return st; });
  }
  Object.keys(env).forEach(function(k){ io.out(k + "=" + env[k] + "\n"); });
  return 0;
};
B.printenv = function(args, io){ var env = this.env(); if(!args.length){ Object.keys(env).forEach(function(k){ io.out(k + "=" + env[k] + "\n"); }); return 0; } var st = 0; args.forEach(function(a){ if(env[a] !== undefined) io.out(env[a] + "\n"); else st = 1; }); return st; };
B.getopts = function(args, io){
  var spec = args[0], name = args[1], optind = Number(this.get("OPTIND") || 1);
  var av = args.length > 2 ? args.slice(2) : this.argv.slice(1);
  var cur = av[optind - 1];
  if(!cur || cur.charAt(0) !== "-" || cur === "-"){ this.set(name, "?"); return 1; }
  var sub = Number(this.get("_optsub") || 1), ch = cur.charAt(sub), pos = spec.replace(/^:/, "").indexOf(ch);
  if(pos < 0){ io.err("bash: illegal option -- " + ch + "\n"); this.set(name, "?"); } else {
    this.set(name, ch);
    if(spec.replace(/^:/, "").charAt(pos + 1) === ":"){ var v = cur.slice(sub + 1) || av[optind]; this.set("OPTARG", v === undefined ? "" : v); if(cur.slice(sub + 1)) {} else optind++; sub = 99; }
  }
  if(sub + 1 >= cur.length){ optind++; sub = 1; } else sub++;
  this.set("OPTIND", String(optind)); this.set("_optsub", String(sub));
  return 0;
};

/* ---------------------------------------------------------------- file commands */
C.ls = function(args, io){
  var o = getopt(args, "I"), f = o.f, sh = this, st = 0;
  var all = f.a, almost = f.A, long = f.l || f["-l"], style = f["--time-style"], hum = f.h || f["--human-readable"], one = f["1"], dironly = f.d, rec = f.R, rev = f.r, bytime = f.t, bysize = f.S, ino = f.i, classify = f.F, cols = false;
  if(f["--help"]){ io.out("Usage: ls [OPTION]... [FILE]...\nList information about the FILEs (the current directory by default).\nSort entries alphabetically if none of -cftuvSUX nor --sort is specified.\n\nMandatory arguments to long options are mandatory for short options too.\n  -a, --all                  do not ignore entries starting with .\n  -A, --almost-all           do not list implied . and ..\n  -d, --directory            list directories themselves, not their contents\n  -F, --classify             append indicator (one of */=>@|) to entries\n  -h, --human-readable       with -l and -s, print sizes like 1K 234M 2G etc.\n  -l                         use a long listing format\n  -R, --recursive            list subdirectories recursively\n  -r, --reverse              reverse order while sorting\n  -S                         sort by file size, largest first\n  -t                         sort by time, newest first\n  -1                         list one file per line\n"); return 0; }
  var targets = o.a.length ? o.a : ["."];
  function entry(name, n){ return {name: name, n: n}; }
  function fmt(e, display){
    var n = e.n, s = (ino ? n.ino + " " : "");
    var nm = display + (classify ? (n.t === "d" ? "/" : n.t === "l" ? "@" : (n.mode & 73) ? "*" : "") : "");
    if(!long) return s + nm;
    var size = hum ? human(sizeOf(n)) : String(sizeOf(n));
    return s + modeStr(n) + " " + n.nlink + " " + uname(sh, n.uid) + " " + gname(sh, n.gid) + " {SZ" + size + "} " + mtimeStr(n.mtime, style ? style.replace(/^\+?/, "") : "") + " " + nm + (n.t === "l" ? " -> " + n.target : "");
  }
  function emit(entries, header){
    if(bytime) entries.sort(function(a, b){ return b.n.mtime - a.n.mtime || (a.name < b.name ? -1 : 1); });
    else if(bysize) entries.sort(function(a, b){ return sizeOf(b.n) - sizeOf(a.n) || (a.name < b.name ? -1 : 1); });
    else entries.sort(function(a, b){ var x = a.name.replace(/^\./, "").toLowerCase(), y = b.name.replace(/^\./, "").toLowerCase(); return x < y ? -1 : x > y ? 1 : (a.name < b.name ? -1 : 1); });
    if(rev) entries.reverse();
    if(header !== null) io.out(header);
    var rows = entries.map(function(e){ return fmt(e, e.name); });
    if(long){
      var w = Math.max.apply(null, [0].concat(rows.map(function(r){ var m = /\{SZ(\d+[A-Za-z.\d]*)\}/.exec(r); return m ? m[1].length : 0; })));
      var wl = Math.max.apply(null, [0].concat(entries.map(function(e){ return String(e.n.nlink).length; })));
      var wu = Math.max.apply(null, [0].concat(entries.map(function(e){ return uname(sh, e.n.uid).length; })));
      var wg = Math.max.apply(null, [0].concat(entries.map(function(e){ return gname(sh, e.n.gid).length; })));
      rows = entries.map(function(e){
        var n = e.n, size = hum ? human(sizeOf(n)) : String(sizeOf(n));
        return (ino ? n.ino + " " : "") + modeStr(n) + " " + pad(n.nlink, wl) + " " + pad(uname(sh, n.uid), wu, true) + " " + pad(gname(sh, n.gid), wg, true) + " " + pad(size, w) + " " + mtimeStr(n.mtime, style ? style.replace(/^\+?/, "") : "") + " " + e.name + (classify ? (n.t === "d" ? "/" : n.t === "l" ? "@" : (n.mode & 73) ? "*" : "") : "") + (n.t === "l" ? " -> " + n.target : "");
      });
    }
    return rows;
  }
  function blocks(entries){ var t = 0; entries.forEach(function(e){ t += e.n.t === "l" ? 0 : Math.ceil(sizeOf(e.n) / 4096) * 4; }); return hum ? human(t * 1024).replace(/^(\d+)$/, "$1") .replace(/^(\d+)K$/, "$1.0K") : String(t); }
  var files = [], dirs = [];
  targets.forEach(function(t){
    try{
      var r = sh.fs.lookup(t, sh.cwd, sh.user, !long || !!dironly === false && false ? true : (long ? false : true));
      var node = r.node;
      if(!node){ io.err("ls: cannot access '" + t + "': No such file or directory\n"); st = 2; return; }
      if(node.t === "l" && !long) node = sh.fs.get(t, sh.cwd, sh.user, true);
      if(node.t === "l" && long && !dironly){ var tgt = sh.fs.lookup(t + "/", sh.cwd, sh.user, true); if(tgt.node && tgt.node.t === "d" && t.charAt(t.length - 1) === "/") node = tgt.node; }
      if(node.t === "d" && !dironly) dirs.push({path: t, node: node}); else files.push({name: t, n: node});
    }catch(e){ if(e instanceof SysErr){ io.err("ls: cannot access '" + t + "': " + e.message + "\n"); st = 2; } else throw e; }
  });
  var out = [];
  if(files.length){ var rowsF = emit(files, null); rowsF.forEach(function(r){ out.push(r); }); }
  function listDir(path, node, showHeader){
    if(!sh.fs.can(node, sh.user, 4)){ io.err("ls: cannot open directory '" + path + "': Permission denied\n"); st = 2; return; }
    var ents = [];
    if(all){ ents.push(entry(".", node)); ents.push(entry("..", node)); }
    node.kids.forEach(function(v, k){ if(k.charAt(0) === "." && !all && !almost) return; ents.push(entry(k, v)); });
    var rows = emit(ents, null);
    if(out.length) out.push("");
    if(showHeader) out.push(path + ":");
    if(long && (!dironly)) out.push("total " + blocks(ents));
    rows.forEach(function(r){ out.push(r); });
    if(rec) ents.forEach(function(e){ if(e.n.t === "d" && e.name !== "." && e.name !== "..") listDir(path === "/" ? "/" + e.name : path + "/" + e.name, e.n, true); });
  }
  dirs.sort(function(a, b){ return a.path < b.path ? -1 : 1; });
  dirs.forEach(function(d){ listDir(d.path.replace(/(.)\/+$/, "$1"), d.node, targets.length > 1 || rec); });
  if(out.length) io.out(out.join("\n") + "\n");
  return st;
};
C.cat = function(args, io){
  var o = getopt(args), n = o.f.n, b = o.f.b, E = o.f.E || o.f.A, k = 0;
  var st = readInput(this, io, o.a, "cat", function(t){
    if(n || b || E){ lines(t).forEach(function(l){ if(b && l === "") io.out(E ? "$\n" : "\n"); else { k++; io.out((n || b ? pad(k, 6) + "\t" : "") + l + (E ? "$" : "") + "\n"); } }); }
    else io.out(t);
  });
  return st;
};
C.tac = function(args, io){ return readInput(this, io, args, "tac", function(t){ io.out(lines(t).reverse().join("\n") + "\n"); }); };
C.rev = function(args, io){ return readInput(this, io, args, "rev", function(t){ lines(t).forEach(function(l){ io.out(l.split("").reverse().join("") + "\n"); }); }); };
C.nl = function(args, io){
  var o = getopt(args, "bnwsv"), k = 0, body = o.f.b || "t";
  return readInput(this, io, o.a, "nl", function(t){ lines(t).forEach(function(l){ if(body === "t" && l === "" ){ io.out("       " + "\n"); return; } k++; io.out(pad(k, 6) + "\t" + l + "\n"); }); });
};
C.mkdir = function(args, io){
  var o = getopt(args, "m"), st = 0, sh = this;
  o.a.forEach(function(p){
    try{
      var mode = o.f.m ? parseInt(o.f.m, 8) : undefined;
      if(o.f.p){ var ex = sh.fs.exists(p, sh.cwd, sh.user); if(ex){ if(sh.fs.get(p, sh.cwd, sh.user, true).t !== "d"){ io.err("mkdir: cannot create directory '" + p + "': File exists\n"); st = 1; } return; } sh.fs.mkdirp(p, sh.cwd, sh.user, sh.umask); }
      else sh.fs.mkdir(p, sh.cwd, sh.user, mode, mode !== undefined ? 0 : sh.umask);
      if(o.f.v) io.out("mkdir: created directory '" + p + "'\n");
    }catch(e){ if(e instanceof SysErr){ io.err("mkdir: cannot create directory '" + p + "': " + e.message + "\n"); st = 1; } else throw e; }
  });
  if(!o.a.length){ io.err("mkdir: missing operand\n"); return 1; }
  return st;
};
C.rmdir = function(args, io){ var st = 0, sh = this; args.filter(function(a){ return a.charAt(0) !== "-"; }).forEach(function(p){ try{ sh.fs.rmdir(p, sh.cwd, sh.user); }catch(e){ if(e instanceof SysErr){ io.err("rmdir: failed to remove '" + p + "': " + e.message + "\n"); st = 1; } else throw e; } }); return st; };
function rmRec(sh, p, force, io, verbose){
  var r = sh.fs.lookup(p, sh.cwd, sh.user, false);
  if(!r.node){ if(force) return 0; io.err("rm: cannot remove '" + p + "': No such file or directory\n"); return 1; }
  if(r.path === "/"){ io.err("rm: it is dangerous to operate recursively on '/'\n"); return 1; }
  var st = 0;
  if(r.node.t === "d"){
    var kids = Array.from(r.node.kids.keys());
    for(var i = 0; i < kids.length; i++) st |= rmRec(sh, r.path + "/" + kids[i], force, io, verbose);
    try{ sh.fs.checkSticky(r.parent, r.node, sh.user); sh.fs.rmdir(r.path, "/", sh.user); if(verbose) io.out("removed directory '" + p + "'\n"); }catch(e){ if(e instanceof SysErr){ io.err("rm: cannot remove '" + p + "': " + e.message + "\n"); return 1; } throw e; }
  } else {
    try{ sh.fs.unlink(r.path, "/", sh.user); if(verbose) io.out("removed '" + p + "'\n"); }catch(e){ if(e instanceof SysErr){ io.err("rm: cannot remove '" + p + "': " + e.message + "\n"); return 1; } throw e; }
  }
  return st;
}
C.rm = function(args, io){
  var o = getopt(args), rec = o.f.r || o.f.R || o.f["--recursive"], force = o.f.f || o.f["--force"], st = 0, sh = this;
  if(!o.a.length && !force){ io.err("rm: missing operand\n"); return 1; }
  o.a.forEach(function(p){
    try{
      var r = sh.fs.lookup(p, sh.cwd, sh.user, false);
      if(r.node && r.node.t === "d" && !rec){ io.err("rm: cannot remove '" + p + "': Is a directory\n"); st = 1; return; }
      st |= rmRec(sh, p, force, io, o.f.v);
    }catch(e){ if(e instanceof SysErr){ if(!force || e.code !== "ENOENT"){ io.err("rm: cannot remove '" + p + "': " + e.message + "\n"); st = 1; } } else throw e; }
  });
  return st;
};
function copyNode(sh, srcPath, dstPath, rec, io, opts, cmd){
  var s = sh.fs.lookup(srcPath, sh.cwd, sh.user, !opts.noderef);
  if(!s.node){ io.err(cmd + ": cannot stat '" + srcPath + "': No such file or directory\n"); return 1; }
  if(s.node.t === "d" && !rec){ io.err(cmd + ": -r not specified; omitting directory '" + srcPath + "'\n"); return 1; }
  var d = sh.fs.lookup(dstPath, sh.cwd, sh.user, true);
  if(d.node && d.node.t === "d"){ var base = s.path.split("/").pop(); dstPath = (d.path === "/" ? "" : d.path) + "/" + base; d = sh.fs.lookup(dstPath, "/", sh.user, true); }
  if(d.node && d.node === s.node){ io.err(cmd + ": '" + srcPath + "' and '" + dstPath + "' are the same file\n"); return 1; }
  if(s.node.t === "d" && (d.path + "/").indexOf(s.path + "/") === 0){ io.err(cmd + ": cannot copy a directory, '" + srcPath + "', into itself, '" + d.path + "'\n"); return 1; }
  if(opts.n && d.node) return 0;
  if(!d.parent){ io.err(cmd + ": cannot create '" + dstPath + "'\n"); return 1; }
  if(!sh.fs.can(d.parent, sh.user, 2)){ io.err(cmd + ": cannot create " + (s.node.t === "d" ? "directory" : "regular file") + " '" + dstPath + "': Permission denied\n"); return 1; }
  if(s.node.t === "f" && !sh.fs.can(s.node, sh.user, 4)){ io.err(cmd + ": cannot open '" + srcPath + "' for reading: Permission denied\n"); return 1; }
  if(d.node){ if(d.node.t === "d" && s.node.t !== "d"){ io.err(cmd + ": cannot overwrite directory '" + dstPath + "' with non-directory\n"); return 1; } if(d.node.t !== "d" && !sh.fs.can(d.node, sh.user, 2)){ io.err(cmd + ": cannot create regular file '" + dstPath + "': Permission denied\n"); return 1; } }
  if(d.node && d.node.t === "f" && s.node.t === "f"){ d.node.data = s.node.data; d.node.mtime = sh.fs.tick(); if(opts.p){ d.node.mode = s.node.mode; } if(opts.v) io.out("'" + srcPath + "' -> '" + dstPath + "'\n"); return 0; }
  var clone = sh.fs.clone(s.node, opts.p ? null : sh.user);
  if(!opts.p){ (function fix(n){ n.mode = n.mode & ~sh.umask & (n.t === "d" ? 4095 : 4095); n.mtime = sh.fs.tick(); n.uid = sh.user.uid; n.gid = sh.user.gid; if(n.t === "d") n.kids.forEach(fix); })(clone); }
  d.parent.kids.set(d.name, clone); if(clone.t === "d") d.parent.nlink++;
  if(opts.v) io.out("'" + srcPath + "' -> '" + dstPath + "'\n");
  return 0;
}
C.cp = function(args, io){
  var o = getopt(args), rec = o.f.r || o.f.R || o.f.a || o.f["--recursive"], st = 0, sh = this;
  if(o.a.length < 2){ io.err("cp: missing file operand\n"); return 1; }
  var dst = o.a[o.a.length - 1], srcs = o.a.slice(0, -1);
  if(srcs.length > 1){ var dn = sh.fs.lookup(dst, sh.cwd, sh.user, true).node; if(!dn || dn.t !== "d"){ io.err("cp: target '" + dst + "' is not a directory\n"); return 1; } }
  srcs.forEach(function(s){ try{ st |= copyNode(sh, s, dst, rec, io, {p: o.f.p || o.f.a, v: o.f.v, n: o.f.n, noderef: o.f.a || o.f.P}, "cp"); }catch(e){ if(e instanceof SysErr){ io.err("cp: cannot copy '" + s + "': " + e.message + "\n"); st = 1; } else throw e; } });
  return st;
};
C.mv = function(args, io){
  var o = getopt(args), st = 0, sh = this;
  if(o.a.length < 2){ io.err("mv: missing file operand\n"); return 1; }
  var dst = o.a[o.a.length - 1], srcs = o.a.slice(0, -1);
  var dnode = null; try{ dnode = sh.fs.lookup(dst, sh.cwd, sh.user, true).node; }catch(e){}
  if(srcs.length > 1 && (!dnode || dnode.t !== "d")){ io.err("mv: target '" + dst + "' is not a directory\n"); return 1; }
  srcs.forEach(function(s){
    try{
      var a = sh.fs.lookup(s, sh.cwd, sh.user, false);
      if(!a.node){ io.err("mv: cannot stat '" + s + "': No such file or directory\n"); st = 1; return; }
      var target = dst;
      if(dnode && dnode.t === "d") target = (sh.fs.norm(dst, sh.cwd) === "/" ? "" : sh.fs.norm(dst, sh.cwd)) + "/" + a.path.split("/").pop();
      if(o.f.n && sh.fs.exists(target, sh.cwd, sh.user)) return;
      sh.fs.rename(s, target, sh.cwd, sh.user);
      if(o.f.v) io.out("renamed '" + s + "' -> '" + target + "'\n");
    }catch(e){ if(e instanceof SysErr){ io.err("mv: cannot move '" + s + "' to '" + dst + "': " + e.message + "\n"); st = 1; } else throw e; }
  });
  return st;
};
C.touch = function(args, io){
  var o = getopt(args, "dtr"), st = 0, sh = this;
  o.a.forEach(function(p){
    try{
      var r = sh.fs.lookup(p, sh.cwd, sh.user, true);
      if(r.node){ if(!sh.fs.can(r.node, sh.user, 2) && sh.user.uid !== r.node.uid && sh.user.uid !== 0) throw new SysErr("EACCES"); r.node.mtime = sh.fs.tick(); if(o.f.d){ var t = Date.parse(o.f.d); if(!isNaN(t)) r.node.mtime = t; } }
      else sh.fs.writeFile(p, "", sh.cwd, sh.user, false, sh.umask);
    }catch(e){ if(e instanceof SysErr){ io.err("touch: cannot touch '" + p + "': " + e.message + "\n"); st = 1; } else throw e; }
  });
  if(!o.a.length){ io.err("touch: missing file operand\n"); return 1; }
  return st;
};
C.ln = function(args, io){
  var o = getopt(args), sh = this;
  if(o.a.length < 1){ io.err("ln: missing file operand\n"); return 1; }
  var tgt = o.a[0], link = o.a[1];
  if(link === undefined) link = tgt.split("/").pop();
  try{
    var d = sh.fs.lookup(link, sh.cwd, sh.user, true);
    if(d.node && d.node.t === "d") link = (d.path === "/" ? "" : d.path) + "/" + tgt.split("/").pop();
    if(o.f.f && sh.fs.exists(link, sh.cwd, sh.user)) sh.fs.unlink(link, sh.cwd, sh.user);
    if(o.f.s) sh.fs.symlink(tgt, link, sh.cwd, sh.user); else sh.fs.link(tgt, link, sh.cwd, sh.user);
    return 0;
  }catch(e){ if(e instanceof SysErr){ io.err("ln: failed to create " + (o.f.s ? "symbolic" : "hard") + " link '" + link + "'" + (o.f.s ? "" : " => '" + tgt + "'") + ": " + e.message + "\n"); return 1; } throw e; }
};
C.readlink = function(args, io){
  var o = getopt(args), sh = this, st = 0;
  o.a.forEach(function(p){
    try{
      if(o.f.f || o.f.e || o.f.m){ io.out(sh.fs.lookup(p, sh.cwd, sh.user, true).path + "\n"); return; }
      var n = sh.fs.lookup(p, sh.cwd, sh.user, false).node;
      if(n && n.t === "l") io.out(n.target + "\n"); else st = 1;
    }catch(e){ st = 1; }
  });
  return st;
};
C.realpath = function(args, io){ var sh = this; args.filter(function(a){ return a.charAt(0) !== "-"; }).forEach(function(p){ try{ io.out(sh.fs.lookup(p, sh.cwd, sh.user, true).path + "\n"); }catch(e){ io.err("realpath: " + p + ": No such file or directory\n"); } }); return 0; };
C.basename = function(args, io){ var p = args[0] || "", suf = args[1]; p = p.replace(/\/+$/, ""); var b = p.split("/").pop() || (p === "" && args[0] ? "/" : ""); if(suf && b.slice(-suf.length) === suf && b !== suf) b = b.slice(0, -suf.length); io.out(b + "\n"); return 0; };
C.dirname = function(args, io){ args.forEach(function(p){ p = p.replace(/\/+$/, ""); var i = p.lastIndexOf("/"); io.out((i < 0 ? "." : i === 0 ? "/" : p.slice(0, i)) + "\n"); }); return 0; };
C.head = function(args, io){
  var o = getopt(args, "nc"), n = o.f.n !== undefined ? Number(o.f.n) : (o.f.num !== undefined ? Number(o.f.num) : 10), c = o.f.c;
  var multi = o.a.length > 1, first = true;
  return readInput(this, io, o.a, "head", function(t, name){
    if(multi){ io.out((first ? "" : "\n") + "==> " + name + " <==\n"); first = false; }
    if(c !== undefined){ io.out(t.slice(0, Number(c))); return; }
    var l = t.split("\n"); var had = t.length && t.charAt(t.length - 1) === "\n"; if(had) l.pop();
    var sel = n < 0 ? l.slice(0, Math.max(0, l.length + n)) : l.slice(0, n);
    if(sel.length) io.out(sel.join("\n") + (had || sel.length < l.length ? "\n" : ""));
  });
};
C.tail = async function(args, io){
  var o = getopt(args, "nc"), n = o.f.n !== undefined ? o.f.n : (o.f.num !== undefined ? o.f.num : "10"), c = o.f.c;
  var multi = o.a.length > 1, first = true, follow = o.f.f || o.f.F;
  var st = readInput(this, io, o.a, "tail", function(t, name){
    if(multi){ io.out((first ? "" : "\n") + "==> " + name + " <==\n"); first = false; }
    if(c !== undefined){ io.out(t.slice(-Number(c))); return; }
    var l = t.split("\n"); var had = t.length && t.charAt(t.length - 1) === "\n"; if(had) l.pop();
    var sel = String(n).charAt(0) === "+" ? l.slice(Number(String(n).slice(1)) - 1) : l.slice(Math.max(0, l.length - Number(n)));
    if(sel.length) io.out(sel.join("\n") + (had ? "\n" : ""));
  });
  if(follow && o.a.length){
    // follow: poll for appended text; the lab stops at the step limit, a timeout, or Ctrl-C
    var sh = this, last; try{ last = sh.fs.readFile(o.a[0], sh.cwd, sh.user); }catch(e){ return st; }
    var until = Date.now() + (sh.followLimit || 4000);
    while(Date.now() < until && !sh.cancelled){
      await new Promise(function(r){ setTimeout(r, 120); });
      var now; try{ now = sh.fs.readFile(o.a[0], sh.cwd, sh.user); }catch(e){ break; }
      if(now.length > last.length){ io.out(now.slice(last.length)); last = now; }
      if(sh.followFlush) await sh.followFlush();
    }
  }
  return st;
};
C.wc = function(args, io){
  var o = getopt(args), tot = {l: 0, w: 0, c: 0, m: 0}, rows = [], any = o.f.l || o.f.w || o.f.c || o.f.m;
  var st = readInput(this, io, o.a, "wc", function(t, name){
    var r = {l: (t.match(/\n/g) || []).length, w: (t.match(/\S+/g) || []).length, c: new TextEncoder().encode(t).length, m: t.length, name: name === "-" && !o.a.length ? "" : name};
    tot.l += r.l; tot.w += r.w; tot.c += r.c; tot.m += r.m; rows.push(r);
  });
  var w = !any && o.a.length === 0 ? 7 : (o.a.length > 1 ? String(Math.max(tot.l, tot.w, tot.c)).length : String(Math.max.apply(null, rows.map(function(r){ return Math.max(r.l, r.w, r.c); }).concat([0]))).length);
  if(rows.length === 1 && any && [o.f.l, o.f.w, o.f.c, o.f.m].filter(Boolean).length === 1) w = 0;
  function line(r){ var p = []; if(!any || o.f.l) p.push(pad(r.l, w)); if(!any || o.f.w) p.push(pad(r.w, w)); if(!any || o.f.c) p.push(pad(r.c, w)); if(o.f.m) p.push(pad(r.m, w)); return p.join(" ") + (r.name ? " " + r.name : ""); }
  rows.forEach(function(r){ io.out(line(r) + "\n"); });
  if(rows.length > 1) io.out(line({l: tot.l, w: tot.w, c: tot.c, m: tot.m, name: "total"}) + "\n");
  return st;
};
C.sort = function(args, io){
  var o = getopt(args, "kt"), keyspec = o.f.k, sep = o.f.t, sh = this;
  var all = [];
  var st = readInput(this, io, o.a, "sort", function(t){ lines(t).forEach(function(l){ all.push(l); }); });
  function key(l){
    var v = l;
    if(keyspec){ var m = /^(\d+)(?:,(\d+))?/.exec(keyspec); var parts = sep ? l.split(sep) : l.trim().split(/\s+/); var a = Number(m[1]) - 1, b = m[2] ? Number(m[2]) : parts.length; v = parts.slice(a, b).join(sep || " "); if(!sep && /b/.test(keyspec)) v = v.trim(); }
    return v;
  }
  var numeric = o.f.n || /n/.test(keyspec || "") && false, hum = o.f.h, ver = o.f.V, ci = o.f.f;
  function numv(s){ var m = /^\s*(-?\d+(?:\.\d+)?)/.exec(s); return m ? Number(m[1]) : 0; }
  function humv(s){ var m = /^\s*(\d+(?:\.\d+)?)([KMGT]?)/.exec(s); if(!m) return 0; return Number(m[1]) * Math.pow(1024, "KMGT".indexOf(m[2]) + 1); }
  function cmp(a, b){
    var x = key(a), y = key(b), r;
    if(numeric || (keyspec && /n/.test(keyspec.replace(/^\d+(,\d+)?/, "")))) r = numv(x) - numv(y);
    else if(hum) r = humv(x) - humv(y);
    else if(ver){ r = x.localeCompare(y, "en", {numeric: true}); }
    else { if(ci){ x = x.toLowerCase(); y = y.toLowerCase(); } r = x < y ? -1 : x > y ? 1 : 0; if(r === 0 && !ci) r = 0; }
    if(r === 0 && !o.f.s) r = a < b ? -1 : a > b ? 1 : 0;
    return r;
  }
  if(!(o.f.n || o.f.h || o.f.V || o.f.f || keyspec)){ all.sort(function(a, b){ var x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : (a < b ? 1 : a > b ? -1 : 0); }); }
  else all.sort(cmp);
  if(o.f.r) all.reverse();
  if(o.f.u){ var seen = {}; all = all.filter(function(l){ var k = key(l); if(seen[k]) return false; seen[k] = 1; return true; }); }
  if(all.length) io.out(all.join("\n") + "\n");
  return st;
};
C.uniq = function(args, io){
  var o = getopt(args), prev = null, cnt = 0, out = [];
  function flush(){ if(prev === null) return; if(o.f.d && cnt < 2) return; if(o.f.u && cnt > 1) return; out.push(o.f.c ? pad(cnt, 7) + " " + prev : prev); }
  var st = readInput(this, io, o.a.slice(0, 1), "uniq", function(t){ lines(t).forEach(function(l){ var k = o.f.i ? l.toLowerCase() : l; if(prev !== null && (o.f.i ? prev.toLowerCase() : prev) === k) cnt++; else { flush(); prev = l; cnt = 1; } }); });
  flush();
  if(out.length) io.out(out.join("\n") + "\n");
  return st;
};
C.cut = function(args, io){
  var o = getopt(args, "dfcb"), delim = o.f.d !== undefined ? o.f.d : "\t", spec = o.f.f || o.f.c || o.f.b, isChar = !o.f.f;
  function ranges(sp){ return sp.split(",").map(function(r){ var m = /^(\d*)(-?)(\d*)$/.exec(r); return {a: m[1] ? Number(m[1]) : 1, b: m[2] ? (m[3] ? Number(m[3]) : Infinity) : Number(m[1])}; }); }
  var rg = ranges(String(spec));
  function inR(i){ return rg.some(function(r){ return i >= r.a && i <= r.b; }); }
  return readInput(this, io, o.a, "cut", function(t){
    lines(t).forEach(function(l){
      if(isChar){ io.out(l.split("").filter(function(c, i){ return inR(i + 1); }).join("") + "\n"); return; }
      if(l.indexOf(delim) < 0){ if(!o.f.s) io.out(l + "\n"); return; }
      var parts = l.split(delim);
      io.out(parts.filter(function(p, i){ return o.f["--complement"] ? !inR(i + 1) : inR(i + 1); }).join(o.f["--output-delimiter"] || delim) + "\n");
    });
  });
};
C.tr = function(args, io){
  var o = getopt(args), set1 = o.a[0], set2 = o.a[1];
  function expand(s){
    if(s === undefined) return "";
    s = s.replace(/\[:([a-z]+):\]/g, function(m, c){ return {upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lower: "abcdefghijklmnopqrstuvwxyz", digit: "0123456789", alpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", alnum: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", space: " \t\n\r\f\v", punct: "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~", blank: " \t"}[c] || ""; });
    s = s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
    return s.replace(/(.)-(.)/g, function(m, a, b){ var r = ""; for(var c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) r += String.fromCharCode(c); return r; });
  }
  var a = expand(set1), b = expand(set2), t = io.in || "";
  var out = "";
  if(o.f.d){ for(var i = 0; i < t.length; i++) if((a.indexOf(t.charAt(i)) >= 0) === !o.f.c) out += t.charAt(i); }
  else if(o.f.s && b === "" && set2 === undefined){ var prev = ""; for(var j = 0; j < t.length; j++){ var ch = t.charAt(j); if((a.indexOf(ch) >= 0) !== !!o.f.c ? false : false){} if(a.indexOf(ch) >= 0 && ch === prev) continue; out += ch; prev = ch; } }
  else {
    for(var k = 0; k < t.length; k++){
      var ch2 = t.charAt(k), idx = a.indexOf(ch2);
      if(o.f.c){ out += idx < 0 ? b.charAt(b.length - 1) : ch2; continue; }
      if(idx >= 0){ out += b.length ? (b.charAt(Math.min(idx, b.length - 1))) : ch2; } else out += ch2;
    }
    if(o.f.s){ var o2 = "", pv = ""; for(var m2 = 0; m2 < out.length; m2++){ var c3 = out.charAt(m2); if(c3 === pv && b.indexOf(c3) >= 0) continue; o2 += c3; pv = c3; } out = o2; }
  }
  io.out(out); return 0;
};
C.tee = function(args, io){
  var o = getopt(args), sh = this, t = io.in || "";
  o.a.forEach(function(p){ try{ sh.fs.writeFile(p, t, sh.cwd, sh.user, !!o.f.a, sh.umask); }catch(e){ if(e instanceof SysErr) io.err("tee: " + p + ": " + e.message + "\n"); else throw e; } });
  io.out(t); return 0;
};
C.paste = function(args, io){
  var o = getopt(args, "d"), d = o.f.d || "\t", cols = [], sh = this;
  readInput(sh, io, o.a, "paste", function(t){ cols.push(lines(t)); });
  if(o.f.s){ cols.forEach(function(c){ io.out(c.join(d) + "\n"); }); return 0; }
  var n = Math.max.apply(null, cols.map(function(c){ return c.length; }).concat([0]));
  for(var i = 0; i < n; i++) io.out(cols.map(function(c){ return c[i] === undefined ? "" : c[i]; }).join(d) + "\n");
  return 0;
};
C.seq = function(args, io){
  var n = args.filter(function(a){ return !/^-[sw]/.test(a); }).map(Number), a = 1, step = 1, b;
  var sep = "\n", eq = false; args.forEach(function(x, i){ if(x === "-s") sep = args[i + 1]; if(x === "-w") eq = true; });
  n = args.filter(function(x, i){ return x !== "-s" && args[i - 1] !== "-s" && x !== "-w"; }).map(Number);
  if(n.length === 1) b = n[0]; else if(n.length === 2){ a = n[0]; b = n[1]; } else { a = n[0]; step = n[1]; b = n[2]; }
  var out = [], w = String(b).length;
  for(var i = a; step > 0 ? i <= b : i >= b; i += step){ out.push(eq ? pad(i, w).replace(/ /g, "0") : String(Math.round(i * 1e9) / 1e9)); if(out.length > 100000) break; }
  io.out(out.join(sep) + "\n"); return 0;
};
C.yes = function(args, io){ var s = (args.join(" ") || "y") + "\n"; var buf = ""; for(var i = 0; i < 2000; i++) buf += s; io.out(buf); return 0; };
C.sleep = async function(args, io){
  var ms = 0; args.forEach(function(a){ var m = /^([\d.]+)([smhd]?)$/.exec(a); if(m) ms += Number(m[1]) * ({"": 1, s: 1, m: 60, h: 3600, d: 86400}[m[2]]) * 1000; });
  var sh = this, scale = sh.timeScale === undefined ? 0.15 : sh.timeScale;
  var end = Date.now() + Math.min(ms * scale, 3000);
  sh.virtualTime = (sh.virtualTime || 0) + ms;
  while(Date.now() < end && !sh.cancelled) await new Promise(function(r){ setTimeout(r, Math.min(50, Math.max(1, end - Date.now()))); });
  if(sh.cancelled) throw new Exit(130);
  return 0;
};
C.timeout = async function(args, io){
  var i = 0; while(args[i] && args[i].charAt(0) === "-") i++;
  var dur = args[i], cmd = args.slice(i + 1), m = /^([\d.]+)([smhd]?)$/.exec(dur || "");
  if(!m || !cmd.length){ io.err("timeout: missing operand\n"); return 125; }
  var sec = Number(m[1]) * ({"": 1, s: 1, m: 60, h: 3600, d: 86400}[m[2]]);
  var sh = this, saved = sh.followLimit; sh.followLimit = Math.min(sec * 1000 * 0.4, 3500);
  try{
    if(cmd[0] === "sleep"){ var want = Number((/^[\d.]+/.exec(cmd[1] || "0") || [0])[0]); if(want > sec){ await C.sleep.call(sh, [String(sec)], io); return 124; } }
    return await sh.exec(cmd, io);
  } finally { sh.followLimit = saved; }
};
C.date = function(args, io){
  var o = getopt(args, "d"), d = o.f.d ? new Date(o.f.d) : new Date(), fmt = null, utc = o.f.u;
  args.forEach(function(a){ if(a.charAt(0) === "+") fmt = a.slice(1); });
  var g = utc ? {Y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes(), S: d.getUTCSeconds(), w: d.getUTCDay()} : {Y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), H: d.getHours(), M: d.getMinutes(), S: d.getSeconds(), w: d.getDay()};
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if(fmt === null){ io.out(DAYS[g.w] + " " + MON[g.m - 1] + " " + pad(g.d, 2) + " " + two(g.H) + ":" + two(g.M) + ":" + two(g.S) + " " + (utc ? "UTC" : "UTC") + " " + g.Y + "\n"); return 0; }
  io.out(fmt.replace(/%([YmdHMSsNjaAbBFTyzZ%eu])/g, function(m, c){
    switch(c){ case "Y": return g.Y; case "m": return two(g.m); case "d": return two(g.d); case "H": return two(g.H); case "M": return two(g.M); case "S": return two(g.S); case "s": return Math.floor(d.getTime() / 1000);
      case "N": return pad(String((d.getTime() % 1000) * 1000000), 9).replace(/ /g, "0"); case "F": return g.Y + "-" + two(g.m) + "-" + two(g.d); case "T": return two(g.H) + ":" + two(g.M) + ":" + two(g.S);
      case "a": return DAYS[g.w]; case "b": return MON[g.m - 1]; case "y": return two(g.Y % 100); case "z": return "+0000"; case "Z": return "UTC"; case "e": return pad(g.d, 2); case "u": return g.w || 7; case "j": return "001"; case "%": return "%"; default: return m; }
  }) + "\n");
  return 0;
};
C.expr = function(args, io){
  var e = args.join(" ");
  var m = /^(.*) (:|=|!=|<|>|<=|>=) (.*)$/.exec(e);
  try{
    if(args[0] === "length" && args.length === 2){ io.out(args[1].length + "\n"); return 0; }
    if(args.length === 3 && args[1] === ":"){ var mm = new RegExp("^" + args[2]).exec(args[0]); io.out((mm ? (mm[1] !== undefined ? mm[1] : mm[0].length) : 0) + "\n"); return mm ? 0 : 1; }
    var js = args.join(" ").replace(/\\\*/g, "*");
    if(!/^[\d\s+\-*\/%()]+$/.test(js)){ io.err("expr: syntax error\n"); return 2; }
    var v = this.arith(js); io.out(v + "\n"); return v === 0 ? 1 : 0;
  }catch(err){ io.err("expr: " + (err.message || "error") + "\n"); return 2; }
};
C.stat = function(args, io){
  var o = getopt(args, "c"), sh = this, st = 0, fmt = o.f.c || o.f["--format"];
  o.a.forEach(function(p){
    try{
      var r = sh.fs.lookup(p, sh.cwd, sh.user, !o.f.L === false ? true : false);
      if(!r.node) throw new SysErr("ENOENT");
      var n = r.node;
      if(fmt){
        io.out(fmt.replace(/%([nsaAUGuFgihNyYxXzZ%dDbBoOtTCdf])/g, function(m, c){
          switch(c){ case "n": return p; case "N": return "'" + p + "'" + (n.t === "l" ? " -> '" + n.target + "'" : ""); case "s": return sizeOf(n); case "a": return (n.mode & 4095).toString(8); case "A": return modeStr(n);
            case "U": return uname(sh, n.uid); case "G": return gname(sh, n.gid); case "u": return n.uid; case "g": return n.gid; case "h": return n.nlink; case "i": return n.ino;
            case "F": return n.t === "d" ? "directory" : n.t === "l" ? "symbolic link" : n.data.length === 0 ? "regular empty file" : "regular file";
            case "y": return mtimeStr(n.mtime, "long-iso") + ":00.000000000 +0000"; case "Y": return Math.floor(n.mtime / 1000); case "b": return Math.ceil(sizeOf(n) / 512); case "%": return "%"; default: return m; }
        }) + "\n"); return;
      }
      io.out("  File: " + p + (n.t === "l" ? " -> " + n.target : "") + "\n  Size: " + pad(sizeOf(n), 10, true) + "\tBlocks: " + pad(Math.ceil(sizeOf(n) / 4096) * 8, 10, true) + " IO Block: 4096   " + (n.t === "d" ? "directory" : n.t === "l" ? "symbolic link" : n.data.length ? "regular file" : "regular empty file") +
        "\nDevice: 8,1\tInode: " + pad(n.ino, 10, true) + "  Links: " + n.nlink + "\nAccess: (" + pad((n.mode & 4095).toString(8), 4).replace(/ /g, "0") + "/" + modeStr(n) + ")  Uid: (" + pad(n.uid, 5) + "/" + pad(uname(sh, n.uid), 8) + ")   Gid: (" + pad(n.gid, 5) + "/" + pad(gname(sh, n.gid), 8) + ")\nModify: " + mtimeStr(n.mtime, "long-iso") + ":00.000000000 +0000\n");
    }catch(e){ if(e instanceof SysErr){ io.err("stat: cannot statx '" + p + "': " + e.message + "\n"); st = 1; } else throw e; }
  });
  return st;
};
function chmodTree(sh, p, fn, rec){
  var r = sh.fs.lookup(p, sh.cwd, sh.user, true);
  if(!r.node) throw new SysErr("ENOENT");
  (function rec2(n){ fn(n); if(rec && n.t === "d") n.kids.forEach(function(v){ if(v.t !== "l") rec2(v); }); })(r.node);
}
C.chmod = function(args, io){
  var o = getopt(args), sh = this, st = 0, rec = o.f.R;
  if(o.a.length < 2){ io.err("chmod: missing operand\n"); return 1; }
  var spec = o.a[0];
  if(!/^[0-7]+$|^[ugoa]*[-+=][rwxXst]*([,][ugoa]*[-+=][rwxXst]*)*$|^[ugoa]*[-+=][ugo]$/.test(spec)){ io.err("chmod: invalid mode: '" + spec + "'\n"); return 1; }
  o.a.slice(1).forEach(function(p){
    try{
      var r0 = sh.fs.lookup(p, sh.cwd, sh.user, true);
      if(!r0.node) throw new SysErr("ENOENT");
      if(sh.user.uid !== 0 && r0.node.uid !== sh.user.uid) throw new SysErr("EPERM");
      chmodTree(sh, p, function(n){ var m = parseMode(spec, n.mode, n.t === "d", sh.umask); if(m === null) throw new SysErr("EINVAL"); n.mode = m & 4095; }, rec);
    }catch(e){ if(e instanceof SysErr){ io.err("chmod: " + (e.code === "ENOENT" ? "cannot access '" + p + "'" : "changing permissions of '" + p + "'") + ": " + (e.code === "EPERM" ? "Operation not permitted" : e.message) + "\n"); st = 1; } else throw e; }
  });
  return st;
};
function chownImpl(name, args, io, sh, isGrp){
  var o = getopt(args), st = 0, rec = o.f.R;
  if(o.a.length < 2){ io.err(name + ": missing operand\n"); return 1; }
  var spec = o.a[0], uidv = null, gidv = null;
  var pw = passwd(sh), gr = groups(sh);
  if(isGrp){ var g0 = gr.filter(function(g){ return g.name === spec || String(g.gid) === spec; })[0]; if(!g0){ io.err("chgrp: invalid group: '" + spec + "'\n"); return 1; } gidv = g0.gid; }
  else {
    var parts = spec.split(/[:.]/);
    if(parts[0]){ var u0 = pw.filter(function(u){ return u.name === parts[0] || String(u.uid) === parts[0]; })[0]; if(!u0){ io.err("chown: invalid user: '" + spec + "'\n"); return 1; } uidv = u0.uid; }
    if(parts.length > 1 && parts[1] !== ""){ var g1 = gr.filter(function(g){ return g.name === parts[1] || String(g.gid) === parts[1]; })[0]; if(!g1){ io.err("chown: invalid group: '" + spec + "'\n"); return 1; } gidv = g1.gid; }
    else if(parts.length > 1 && /:$/.test(spec) && uidv !== null){ gidv = (pw.filter(function(u){ return u.uid === uidv; })[0] || {}).gid; }
  }
  o.a.slice(1).forEach(function(p){
    try{
      if(sh.user.uid !== 0){ var nd = sh.fs.get(p, sh.cwd, sh.user, true); if(isGrp ? (nd.uid !== sh.user.uid) : true) throw new SysErr("EPERM"); }
      chmodTree(sh, p, function(n){ if(uidv !== null) n.uid = uidv; if(gidv !== null) n.gid = gidv; if(uidv !== null && n.t === "f") n.mode &= ~3072; }, rec);
    }catch(e){ if(e instanceof SysErr){ io.err(name + ": " + (e.code === "ENOENT" ? "cannot access '" + p + "'" : "changing ownership of '" + p + "'") + ": " + (e.code === "EPERM" ? "Operation not permitted" : e.message) + "\n"); st = 1; } else throw e; }
  });
  return st;
}
C.chown = function(args, io){ return chownImpl("chown", args, io, this, false); };
C.chgrp = function(args, io){ return chownImpl("chgrp", args, io, this, true); };
C.file = function(args, io){
  var sh = this;
  args.filter(function(a){ return a.charAt(0) !== "-"; }).forEach(function(p){
    try{
      var n = sh.fs.get(p, sh.cwd, sh.user, false), d;
      if(n.t === "d") d = "directory"; else if(n.t === "l") d = "symbolic link to " + n.target;
      else if(n.data === "") d = "empty";
      else if(/^#!.*\b(ba)?sh\b/.test(n.data)) d = "Bourne-Again shell script, ASCII text executable";
      else if(/^#!.*python/.test(n.data)) d = "Python script, ASCII text executable";
      else if(/^\x7fELF/.test(n.data)) d = "ELF 64-bit LSB executable";
      else if(/^<\?xml|^<!DOCTYPE html|^<html/i.test(n.data)) d = "HTML document, ASCII text";
      else if(/^[\x20-\x7e\n\t\r]*$/.test(n.data)) d = "ASCII text"; else d = "UTF-8 Unicode text";
      io.out(p + ": " + d + "\n");
    }catch(e){ io.out(p + ": cannot open `" + p + "' (No such file or directory)\n"); }
  });
  return 0;
};
C.du = function(args, io){
  var o = getopt(args, "d"), sh = this, targets = o.a.length ? o.a : ["."];
  function blocks(n){ return n.t === "l" ? 0 : Math.max(4, Math.ceil(sizeOf(n) / 4096) * 4) * 1024; }
  targets.forEach(function(t){
    try{
      var maxd = o.f.d !== undefined ? Number(o.f.d) : (o.f.s ? 0 : Infinity);
      (function rec(n, p, depth){
        var total = blocks(n);
        if(n.t === "d") n.kids.forEach(function(v, k){ total += rec(v, p + "/" + k, depth + 1); });
        if((n.t === "d" || o.f.a) && depth <= maxd) io.out((o.f.h ? human(total) : Math.ceil(total / 1024)) + "\t" + p + "\n");
        return total;
      })(sh.fs.get(t, sh.cwd, sh.user, true), t.replace(/\/+$/, "") || "/", 0);
    }catch(e){ if(e instanceof SysErr) io.err("du: cannot access '" + t + "': " + e.message + "\n"); else throw e; }
  });
  return 0;
};
C.df = function(args, io){
  var o = getopt(args), h = o.f.h, row = function(n, sz, used, av, use, mnt){ return pad(n, 15, true) + " " + pad(sz, h ? 4 : 10) + " " + pad(used, h ? 5 : 10) + " " + pad(av, h ? 5 : 10) + " " + pad(use, 4) + " " + mnt + "\n"; };
  if(o.f.i){ io.out(row("Filesystem", "Inodes", "IUsed", "IFree", "IUse%", "Mounted on").replace(/ +/g, " ").replace("Filesystem ", "Filesystem      ")); io.out("overlay         3276800   150000   3126800   5% /\n"); return 0; }
  io.out(row("Filesystem", h ? "Size" : "1K-blocks", "Used", h ? "Avail" : "Available", "Use%", "Mounted on"));
  io.out(row("overlay", h ? "50G" : "51474044", h ? "12G" : "12800000", h ? "36G" : "38674044", "25%", "/"));
  io.out(row("tmpfs", h ? "3.9G" : "4048000", h ? "0" : "0", h ? "3.9G" : "4048000", "0%", "/dev/shm"));
  return 0;
};
C.free = function(args, io){
  var o = getopt(args), h = o.f.h || o.f.m;
  if(o.f.g){ io.out("               total        used        free      shared  buff/cache   available\nMem:               7           1           4           0           1           5\nSwap:              0           0           0\n"); return 0; }
  if(o.f.h){ io.out("               total        used        free      shared  buff/cache   available\nMem:           7.8Gi       1.9Gi       4.6Gi        12Mi       1.4Gi       5.6Gi\nSwap:             0B          0B          0B\n"); }
  else if(o.f.m){ io.out("               total        used        free      shared  buff/cache   available\nMem:            7977        1946        4730          12        1434        5738\nSwap:              0           0           0\n"); }
  else io.out("               total        used        free      shared  buff/cache   available\nMem:         8168448     1992396     4843000       12480     1468000     5876000\nSwap:              0           0           0\n");
  return 0;
};
C.uptime = function(args, io){ io.out(" " + two(new Date().getHours()) + ":" + two(new Date().getMinutes()) + ":00 up  1:12,  1 user,  load average: 0.08, 0.05, 0.01\n"); return 0; };
C.nproc = function(args, io){ io.out("4\n"); return 0; };
C.hostname = function(args, io){ io.out((this.get("HOSTNAME") || "lab") + "\n"); return 0; };
C.uname = function(args, io){
  var o = getopt(args), all = o.f.a;
  var parts = [];
  if(!args.length || o.f.s) parts.push("Linux"); if(all || o.f.n) parts.push("lab"); if(all || o.f.r) parts.push("6.8.0-lab"); if(all || o.f.v) parts.push("#1 SMP"); if(all || o.f.m) parts.push("x86_64");
  if(all) parts.push("GNU/Linux");
  io.out(parts.join(" ") + "\n"); return 0;
};
C.whoami = function(args, io){ io.out(this.user.name + "\n"); return 0; };
C.id = function(args, io){
  var o = getopt(args), name = o.a[0] || this.user.name, sh = this;
  var u = passwd(sh).filter(function(x){ return x.name === name; })[0];
  if(!u){ io.err("id: '" + name + "': no such user\n"); return 1; }
  var gs = name === this.user.name ? this.user.groups : userGroups(sh, name);
  if(o.f.u){ io.out(u.uid + "\n"); return 0; } if(o.f.g){ io.out(u.gid + "\n"); return 0; }
  if(o.f.n && o.f.G){ io.out(gs.map(function(g){ return gname(sh, g); }).join(" ") + "\n"); return 0; }
  io.out("uid=" + u.uid + "(" + u.name + ") gid=" + u.gid + "(" + gname(sh, u.gid) + ") groups=" + gs.map(function(g){ return g + "(" + gname(sh, g) + ")"; }).join(",") + "\n");
  return 0;
};
C.groups = function(args, io){ var name = args[0] || this.user.name, sh = this; var gs = name === this.user.name ? this.user.groups : userGroups(sh, name); io.out((args[0] ? name + " : " : "") + gs.map(function(g){ return gname(sh, g); }).join(" ") + "\n"); return 0; };
C.getent = function(args, io){
  var db = args[0], key = args[1], sh = this;
  if(db === "passwd"){ var u = passwd(sh).filter(function(x){ return !key || x.name === key || String(x.uid) === key; }); if(!u.length) return 2; u.forEach(function(x){ io.out(x.name + ":x:" + x.uid + ":" + x.gid + ":" + (x.gecos || "") + ":" + x.home + ":" + x.shell + "\n"); }); return 0; }
  if(db === "group"){ var g = groups(sh).filter(function(x){ return !key || x.name === key || String(x.gid) === key; }); if(!g.length) return 2; g.forEach(function(x){ io.out(x.name + ":x:" + x.gid + ":" + x.members.join(",") + "\n"); }); return 0; }
  if(db === "hosts"){ if(key && !/^(localhost|lab)$/.test(key)) return 2; io.out("127.0.0.1       " + (key || "localhost") + "\n"); return 0; }
  return 2;
};
C.nohup = async function(args, io){ return await this.exec(args, io); };
C.nice = async function(args, io){ var a = args.slice(); if(a[0] === "-n") a = a.slice(2); else if(/^-\d+$/.test(a[0] || "")) a = a.slice(1); if(!a.length){ io.out("0\n"); return 0; } return await this.exec(a, io); };
C.clear = function(args, io){ io.out("\x1b[2J\x1b[H"); return 0; };
C.less = C.more = function(args, io){ return C.cat.call(this, args, io); };
C.xargs = async function(args, io){
  var cut = 0; while(cut < args.length && args[cut].charAt(0) === "-"){ cut += /^-[nIdLP]$/.test(args[cut]) ? 2 : 1; }
  var o = getopt(args.slice(0, cut), "nIdLP"), sh = this, cmd = args.length > cut ? args.slice(cut) : ["echo"], items;
  var t = io.in || "";
  if(o.f.d !== undefined) items = t.split(o.f.d === "\\n" ? "\n" : o.f.d).filter(function(x, i, a){ return x !== "" || i < a.length - 1; });
  else if(o.f["0"]) items = t.split("\0").filter(Boolean);
  else items = t.split(/\s+/).filter(Boolean);
  if(!items.length && !o.f.r) { if(o.f.r) return 0; }
  var st = 0;
  if(o.f.I){
    for(var i = 0; i < items.length; i++){ st = await sh.exec(cmd.map(function(c){ return c.split(o.f.I).join(items[i]); }), io) || st; }
    return st;
  }
  var per = o.f.n ? Number(o.f.n) : items.length || 1;
  if(!items.length && o.f.r) return 0;
  for(var k = 0; k === 0 || k < items.length; k += per){ var r = await sh.exec(cmd.concat(items.slice(k, k + per)), io); if(r) st = 123; if(!items.length) break; }
  return st;
};
C.find = async function(args, io){
  var sh = this, paths = [], i = 0;
  while(i < args.length && args[i].charAt(0) !== "-" && args[i] !== "!" && args[i] !== "(") paths.push(args[i++]);
  if(!paths.length) paths = ["."];
  var expr = args.slice(i), p = 0, st = 0;
  var maxdepth = Infinity, mindepth = 0;
  // pull out global options
  var e2 = []; for(var q = 0; q < expr.length; q++){ if(expr[q] === "-maxdepth"){ maxdepth = Number(expr[++q]); } else if(expr[q] === "-mindepth"){ mindepth = Number(expr[++q]); } else if(expr[q] === "-depth" || expr[q] === "-xdev"){ } else e2.push(expr[q]); }
  expr = e2;
  var hasAction = expr.some(function(x){ return /^-(print|print0|exec|delete|ok|ls)$/.test(x); });
  function parseOr(){ var l = parseAnd(); while(expr[p] === "-o" || expr[p] === "-or"){ p++; var r = parseAnd(); l = {o: [l, r]}; } return l; }
  function parseAnd(){ var l = parseNot(); while(p < expr.length && expr[p] !== "-o" && expr[p] !== "-or" && expr[p] !== ")"){ if(expr[p] === "-a" || expr[p] === "-and") p++; var r = parseNot(); l = {a: [l, r]}; } return l; }
  function parseNot(){ if(expr[p] === "!" || expr[p] === "-not"){ p++; return {n: parseNot()}; } return parsePrim(); }
  function parsePrim(){
    var t = expr[p++];
    if(t === "("){ var e = parseOr(); p++; return e; }
    switch(t){
      case "-name": case "-iname": case "-path": case "-wholename": case "-ipath": case "-regex": return {k: t, v: expr[p++]};
      case "-newermt": case "-type": case "-user": case "-group": case "-perm": case "-size": case "-mtime": case "-mmin": case "-newer": case "-links": case "-uid": case "-gid": case "-atime": case "-ctime": return {k: t, v: expr[p++]};
      case "-empty": case "-print": case "-print0": case "-delete": case "-readable": case "-writable": case "-executable": case "-prune": case "-true": case "-false": case "-ls": return {k: t};
      case "-exec": case "-ok": { var cmd = []; while(p < expr.length && expr[p] !== ";" && expr[p] !== "+") cmd.push(expr[p++]); var plus = expr[p] === "+"; p++; return {k: "-exec", cmd: cmd, plus: plus}; }
      default: throw new SysErr("EINVAL", "unknown predicate `" + t + "'");
    }
  }
  var tree;
  try{ tree = expr.length ? parseOr() : {k: "-true"}; }catch(e){ if(e instanceof SysErr){ io.err("find: " + e.extra + "\n"); return 1; } throw e; }
  var plusBatches = {};
  async function evalN(t, n, path, name){
    if(t.o) return (await evalN(t.o[0], n, path, name)) || (await evalN(t.o[1], n, path, name));
    if(t.a) return (await evalN(t.a[0], n, path, name)) && (await evalN(t.a[1], n, path, name));
    if(t.n) return !(await evalN(t.n, n, path, name));
    switch(t.k){
      case "-true": return true; case "-false": return false;
      case "-name": return new RegExp("^" + L.globToRegex(t.v).replace(/\[\^\/\]/g, "[\\s\\S]") + "$").test(name);
      case "-iname": return new RegExp("^" + L.globToRegex(t.v).replace(/\[\^\/\]/g, "[\\s\\S]") + "$", "i").test(name);
      case "-path": case "-wholename": return new RegExp("^" + L.globToRegex(t.v).replace(/\[\^\/\]/g, "[\\s\\S]") + "$").test(path);
      case "-regex": return new RegExp("^" + t.v + "$").test(path);
      case "-type": return {f: "f", d: "d", l: "l"}[t.v] === n.t;
      case "-user": return uname(sh, n.uid) === t.v || String(n.uid) === t.v;
      case "-group": return gname(sh, n.gid) === t.v || String(n.gid) === t.v;
      case "-uid": return String(n.uid) === t.v; case "-gid": return String(n.gid) === t.v;
      case "-perm": { var want = t.v.charAt(0) === "-" ? parseInt(t.v.slice(1), 8) : t.v.charAt(0) === "/" ? parseInt(t.v.slice(1), 8) : parseInt(t.v, 8); var have = n.mode & 4095; return t.v.charAt(0) === "-" ? (have & want) === want : t.v.charAt(0) === "/" ? (have & want) !== 0 : have === want; }
      case "-size": { var m = /^([+-]?)(\d+)([cwbkMG]?)$/.exec(t.v); if(!m) return false; var unit = {c: 1, w: 2, b: 512, k: 1024, M: 1048576, G: 1073741824}[m[3] || "b"]; var sz = sizeOf(n), cnt = Math.ceil(sz / unit); var val = Number(m[2]); return m[1] === "+" ? cnt > val : m[1] === "-" ? cnt < val : cnt === val; }
      case "-mtime": case "-atime": case "-ctime": { var days = Math.floor((Date.now() - n.mtime) / 86400000), mm = /^([+-]?)(\d+)$/.exec(t.v); return mm[1] === "+" ? days > Number(mm[2]) : mm[1] === "-" ? days < Number(mm[2]) : days === Number(mm[2]); }
      case "-mmin": { var mins = Math.floor((Date.now() - n.mtime) / 60000), m3 = /^([+-]?)(\d+)$/.exec(t.v); return m3[1] === "+" ? mins > Number(m3[2]) : m3[1] === "-" ? mins < Number(m3[2]) : mins === Number(m3[2]); }
      case "-newermt": { var tt = Date.parse(t.v); return n.mtime > tt; }
      case "-newer": try{ return n.mtime > sh.fs.get(t.v, sh.cwd, sh.user, true).mtime; }catch(e){ return false; }
      case "-links": return String(n.nlink) === t.v;
      case "-empty": return n.t === "d" ? n.kids.size === 0 : n.t === "f" && n.data === "";
      case "-readable": return sh.fs.can(n, sh.user, 4); case "-writable": return sh.fs.can(n, sh.user, 2); case "-executable": return sh.fs.can(n, sh.user, 1);
      case "-print": io.out(path + "\n"); return true; case "-print0": io.out(path + "\0"); return true;
      case "-ls": io.out(n.ino + " " + modeStr(n) + " " + n.nlink + " " + uname(sh, n.uid) + " " + gname(sh, n.gid) + " " + sizeOf(n) + " " + mtimeStr(n.mtime) + " " + path + "\n"); return true;
      case "-prune": return true;
      case "-delete": try{ if(n.t === "d") sh.fs.rmdir(path, "/", sh.user); else sh.fs.unlink(path, "/", sh.user); return true; }catch(e){ if(e instanceof SysErr){ io.err("find: cannot delete '" + path + "': " + e.message + "\n"); st = 1; return false; } throw e; }
      case "-exec": {
        if(t.plus){ (plusBatches[t.cmd.join(" ")] = plusBatches[t.cmd.join(" ")] || {cmd: t.cmd, items: []}).items.push(path); return true; }
        var cmd = t.cmd.map(function(c){ return c.split("{}").join(path); });
        var sub = sh.fork(); sub.io = io;
        var r = await sub.exec(cmd, io); return r === 0;
      }
    }
    return false;
  }
  for(var pi = 0; pi < paths.length; pi++){
    var base = paths[pi], root;
    try{ root = sh.fs.lookup(base, sh.cwd, sh.user, true); }catch(e){ if(e instanceof SysErr){ io.err("find: '" + base + "': " + e.message + "\n"); st = 1; continue; } throw e; }
    if(!root.node){ io.err("find: '" + base + "': No such file or directory\n"); st = 1; continue; }
    var prune = false;
    async function rec(n, shown, depth){
      sh.tickStep();
      var nm = shown.split("/").pop() || shown;
      var matched = depth >= mindepth ? await evalN(tree, n, shown, nm) : false;
      if(matched && !hasAction && depth >= mindepth) io.out(shown + "\n");
      if(n.t === "d" && depth < maxdepth){
        if(!sh.fs.can(n, sh.user, 4)){ io.err("find: '" + shown + "': Permission denied\n"); st = 1; return; }
        if(JSON.stringify(tree).indexOf('"-prune"') >= 0 && matched && /-prune/.test(expr.join(" "))) return;
        var kids = Array.from(n.kids.keys());
        for(var k = 0; k < kids.length; k++) await rec(n.kids.get(kids[k]), (shown === "/" ? "" : shown.replace(/\/$/, "")) + "/" + kids[k], depth + 1);
      }
    }
    await rec(root.node, base, 0);
  }
  var pk = Object.keys(plusBatches);
  for(var b = 0; b < pk.length; b++){ var bt = plusBatches[pk[b]]; var cmd2 = []; bt.cmd.forEach(function(c){ if(c === "{}") bt.items.forEach(function(x){ cmd2.push(x); }); else cmd2.push(c); }); await sh.exec(cmd2, io); }
  return st;
};
C.tar = function(args, io){
  var sh = this, f = "", mode = "", files = [], dir = null, verbose = false, i = 0, gz = false;
  var first = args[0] || "";
  var flagStr = /^-?[a-zA-Z]+$/.test(first) ? first.replace(/^-/, "") : "";
  if(flagStr){ i = 1; }
  var chars = flagStr;
  for(; i < args.length; i++){
    var a = args[i];
    if(a === "-C"){ dir = args[++i]; continue; }
    if(a === "-f"){ f = args[++i]; continue; }
    if(/^-[a-zA-Z]+$/.test(a)){ chars += a.slice(1); if(/f/.test(a) && a.charAt(a.length - 1) === "f") f = args[++i]; continue; }
    if(a.indexOf("--") === 0){ if(a === "--gzip") gz = true; continue; }
    files.push(a);
  }
  if(/f/.test(flagStr) && !f && files.length){ f = files.shift(); }
  if(chars.indexOf("c") >= 0) mode = "c"; else if(chars.indexOf("x") >= 0) mode = "x"; else if(chars.indexOf("t") >= 0) mode = "t";
  verbose = chars.indexOf("v") >= 0;
  var cwd = dir ? sh.fs.lookup(dir, sh.cwd, sh.user, true).path : sh.cwd;
  try{
    if(mode === "c"){
      var entries = [];
      files.forEach(function(p){
        var r = sh.fs.lookup(p, cwd, sh.user, true);
        if(!r.node) throw new SysErr("ENOENT", p);
        (function rec(n, path){ var o = {p: path + (n.t === "d" && path.slice(-1) !== "/" ? "/" : ""), t: n.t, m: n.mode, d: n.data, l: n.target, u: n.uid, g: n.gid}; entries.push(o); if(verbose) io.out(o.p + "\n"); if(n.t === "d") Array.from(n.kids.keys()).sort().forEach(function(k){ rec(n.kids.get(k), path.replace(/\/$/, "") + "/" + k); }); })(r.node, p.replace(/^\.\//, "").replace(/^\//, "") === "" ? p : p.replace(/^\//, ""));
      });
      var blob = "LABTAR1\n" + JSON.stringify(entries);
      if(f === "-" || f === "") io.out(blob); else sh.fs.writeFile(f, blob, sh.cwd, sh.user, false, sh.umask);
      return 0;
    }
    var raw = f === "-" || !f ? (io.in || "") : sh.fs.readFile(f, sh.cwd, sh.user);
    if(raw.indexOf("LABTAR1\n") !== 0){ io.err("tar: This does not look like a tar archive\n"); return 2; }
    var ents = JSON.parse(raw.slice(8));
    if(mode === "t"){ ents.forEach(function(e){ io.out(e.p + "\n"); }); return 0; }
    if(mode === "x"){
      ents.forEach(function(e){
        if(files.length && !files.some(function(x){ return e.p.indexOf(x) === 0; })) return;
        var path = e.p.replace(/\/$/, "");
        if(verbose) io.out(e.p + "\n");
        if(e.t === "d"){ if(!sh.fs.exists(path, cwd, sh.user)) { sh.fs.mkdirp(path, cwd, sh.user, sh.umask); } }
        else if(e.t === "l"){ try{ sh.fs.symlink(e.l, path, cwd, sh.user); }catch(err){} }
        else { var n = sh.fs.writeFile(path, e.d, cwd, sh.user, false, sh.umask); n.mode = e.m; }
      });
      return 0;
    }
    io.err("tar: You must specify one of the '-Acdtrux' options\n"); return 2;
  }catch(e){ if(e instanceof SysErr){ io.err("tar: " + (e.extra || f) + ": Cannot open: " + e.message + "\n"); return 2; } throw e; }
};
C.gzip = C.gunzip = C.zcat = function(args, io, name){ io.err(name + ": compression is not emulated in the lab\n"); return 1; };
C.diff = function(args, io){
  var o = getopt(args), sh = this;
  if(o.f.r || o.f.q){
    var A = sh.fs.lookup(o.a[0], sh.cwd, sh.user, true), B2 = sh.fs.lookup(o.a[1], sh.cwd, sh.user, true), differ = 0;
    if(!A.node || !B2.node){ io.err("diff: " + (A.node ? o.a[1] : o.a[0]) + ": No such file or directory\n"); return 2; }
    (function rec(a, b, pa, pb){
      if(a.t === "d" && b.t === "d"){
        var names = {}; a.kids.forEach(function(_, k){ names[k] = 1; }); b.kids.forEach(function(_, k){ names[k] = 1; });
        Object.keys(names).sort().forEach(function(k){
          var x = a.kids.get(k), y = b.kids.get(k);
          if(!x){ io.out("Only in " + pb + ": " + k + "\n"); differ = 1; } else if(!y){ io.out("Only in " + pa + ": " + k + "\n"); differ = 1; }
          else rec(x, y, pa + "/" + k, pb + "/" + k);
        });
      } else if(a.t === "f" && b.t === "f"){
        if(a.data !== b.data){ differ = 1; if(o.f.q) io.out("Files " + pa + " and " + pb + " differ\n"); else { io.out("diff -r " + pa + " " + pb + "\n"); var t1 = a.data.split("\n"), t2 = b.data.split("\n"); io.out("(contents differ)\n"); } }
      }
    })(A.node, B2.node, o.a[0].replace(/\/$/, ""), o.a[1].replace(/\/$/, ""));
    return differ;
  }
  if(o.a.length < 2){ io.err("diff: missing operand\n"); return 2; }
  var a, b;
  try{ a = lines(sh.fs.readFile(o.a[0], sh.cwd, sh.user)); b = lines(sh.fs.readFile(o.a[1], sh.cwd, sh.user)); }catch(e){ if(e instanceof SysErr){ io.err("diff: " + (e.extra || o.a[0]) + ": " + e.message + "\n"); return 2; } throw e; }
  var n = a.length, m = b.length, dp = [];
  for(var i = 0; i <= n; i++){ dp.push(new Array(m + 1).fill(0)); }
  for(var x = n - 1; x >= 0; x--) for(var y = m - 1; y >= 0; y--) dp[x][y] = a[x] === b[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
  var ops = [], x2 = 0, y2 = 0;
  while(x2 < n || y2 < m){
    if(x2 < n && y2 < m && a[x2] === b[y2]){ ops.push([" ", a[x2]]); x2++; y2++; }
    else if(y2 < m && (x2 === n || dp[x2][y2 + 1] >= dp[x2 + 1][y2])){ ops.push(["+", b[y2]]); y2++; }
    else { ops.push(["-", a[x2]]); x2++; }
  }
  if(!ops.some(function(op){ return op[0] !== " "; })) return 0;
  if(o.f.u || o.f.U){
    io.out("--- " + o.a[0] + "\n+++ " + o.a[1] + "\n@@ -1," + n + " +1," + m + " @@\n");
    ops.forEach(function(op){ io.out(op[0] + op[1] + "\n"); });
    return 1;
  }
  var k = 0, la = 0, lb = 0;
  while(k < ops.length){
    if(ops[k][0] === " "){ la++; lb++; k++; continue; }
    var dels = [], adds = [], sa = la, sb = lb;
    while(k < ops.length && ops[k][0] !== " "){ if(ops[k][0] === "-"){ dels.push(ops[k][1]); la++; } else { adds.push(ops[k][1]); lb++; } k++; }
    var ra = dels.length ? (dels.length > 1 ? (sa + 1) + "," + la : String(sa + 1)) : String(sa), rb = adds.length ? (adds.length > 1 ? (sb + 1) + "," + lb : String(sb + 1)) : String(sb);
    io.out(ra + (dels.length && adds.length ? "c" : dels.length ? "d" : "a") + rb + "\n");
    dels.forEach(function(d){ io.out("< " + d + "\n"); }); if(dels.length && adds.length) io.out("---\n"); adds.forEach(function(d){ io.out("> " + d + "\n"); });
  }
  return 1;
};
C.base64 = function(args, io){
  var o = getopt(args), t = io.in || "";
  if(o.a.length){ try{ t = this.fs.readFile(o.a[0], this.cwd, this.user); }catch(e){ io.err("base64: " + o.a[0] + ": No such file or directory\n"); return 1; } }
  if(o.f.d || o.f.D || o.f["--decode"]){ try{ io.out(decodeURIComponent(escape(atob(t.replace(/\s+/g, ""))))); }catch(e){ io.err("base64: invalid input\n"); return 1; } return 0; }
  var enc = btoa(unescape(encodeURIComponent(t))), out = "";
  if(o.f.w === "0" || o.f["--wrap=0"]) out = enc; else { for(var i = 0; i < enc.length; i += 76) out += enc.slice(i, i + 76) + "\n"; }
  io.out(out + (o.f.w === "0" ? "" : "")); if(o.f.w === "0") io.out("\n"); return 0;
};
C.sha256sum = C.md5sum = C.sha1sum = async function(args, io, name){
  var algo = {sha256sum: "SHA-256", sha1sum: "SHA-1"}[name], sh = this, st = 0;
  var items = args.length ? args : ["-"];
  for(var i = 0; i < items.length; i++){
    var t;
    try{ t = items[i] === "-" ? (io.in || "") : sh.fs.readFile(items[i], sh.cwd, sh.user); }catch(e){ if(e instanceof SysErr){ io.err(name + ": " + items[i] + ": " + e.message + "\n"); st = 1; continue; } throw e; }
    var hex;
    if(algo && typeof crypto !== "undefined" && crypto.subtle){ var buf = await crypto.subtle.digest(algo, new TextEncoder().encode(t)); hex = Array.from(new Uint8Array(buf)).map(function(b){ return (b < 16 ? "0" : "") + b.toString(16); }).join(""); }
    else hex = L.md5 ? L.md5(t) : "0".repeat(32);
    io.out(hex + "  " + (items[i] === "-" ? "-" : items[i]) + "\n");
  }
  return st;
};
C.dd = function(args, io){
  var kv = {}; args.forEach(function(a){ var m = /^(\w+)=(.*)$/.exec(a); if(m) kv[m[1]] = m[2]; });
  var bs = kv.bs ? Number(kv.bs.replace(/K$/i, "000").replace(/M$/i, "000000")) || 1 : 512; var mult = /K$/i.test(kv.bs || "") ? 1024 : /M$/i.test(kv.bs || "") ? 1048576 : 1; bs = (Number((kv.bs || "512").replace(/[KMG]$/i, "")) || 512) * mult;
  var cnt = Number(kv.count || 0), data = "";
  try{
    if(kv["if"] === "/dev/zero") data = "\0".repeat(Math.min(bs * cnt, 4194304)); else if(kv["if"] === "/dev/urandom" || kv["if"] === "/dev/random"){ for(var i = 0; i < Math.min(bs * cnt, 65536); i++) data += String.fromCharCode(Math.floor(Math.random() * 256)); } else if(kv["if"]) data = this.fs.readFile(kv["if"], this.cwd, this.user); else data = io.in || "";
    if(kv.count && kv["if"] !== "/dev/zero" && kv["if"] !== "/dev/urandom") data = data.slice(0, bs * cnt);
    if(kv.of) this.fs.writeFile(kv.of, data, this.cwd, this.user, false, this.umask); else io.out(data);
  }catch(e){ if(e instanceof SysErr){ io.err("dd: failed to open '" + (kv["if"] || kv.of) + "': " + e.message + "\n"); return 1; } throw e; }
  if(kv.status !== "none") io.err(cnt + "+0 records in\n" + cnt + "+0 records out\n" + data.length + " bytes copied, 0.001 s, 1.0 MB/s\n");
  return 0;
};
C.strings = function(args, io){ return readInput(this, io, args, "strings", function(t){ (t.match(/[\x20-\x7e]{4,}/g) || []).forEach(function(s){ io.out(s + "\n"); }); }); };
C.od = C.hexdump = C.xxd = function(args, io, name){
  return readInput(this, io, args.filter(function(a){ return a.charAt(0) !== "-"; }), name, function(t){
    for(var i = 0; i < t.length; i += 16){ var chunk = t.slice(i, i + 16); var hex = chunk.split("").map(function(c){ return pad(c.charCodeAt(0).toString(16), 2).replace(/ /g, "0"); }).join(" "); io.out(pad(i.toString(16), 8).replace(/ /g, "0") + ": " + hex + "  " + chunk.replace(/[^\x20-\x7e]/g, ".") + "\n"); }
  });
};
C.mktemp = function(args, io){
  var o = getopt(args), name = "/tmp/tmp." + Math.random().toString(36).slice(2, 12), tmpl = o.a[0];
  if(tmpl) name = tmpl.replace(/X+$/, function(x){ return Math.random().toString(36).slice(2, 2 + x.length).padEnd(x.length, "x"); });
  if(tmpl && tmpl.indexOf("/") < 0 && !o.f.p) name = "/tmp/" + name;
  if(o.f.d) this.fs.mkdir(name, "/", this.user, 448, 0); else this.fs.writeFile(name, "", "/", this.user, false, 63);
  io.out(name + "\n"); return 0;
};
C.install = function(args, io){ return C.cp.call(this, args.filter(function(a){ return !/^-[mdD]/.test(a) && !/^\d{3,4}$/.test(a); }), io); };
C.man = function(args, io){ io.err("No manual entry for " + (args[0] || "") + " (the lab has no man pages; try `COMMAND --help` or `help COMMAND`)\n"); return 16; };
C.watch = function(args, io){ io.err("watch: the lab shows one run only\n"); return this.exec(args.filter(function(a){ return !/^-/.test(a); }), io); };
C.script = null; delete C.script;
C.shuf = function(args, io){ return readInput(this, io, args, "shuf", function(t){ var l = lines(t); for(var i = l.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)); var x = l[i]; l[i] = l[j]; l[j] = x; } if(l.length) io.out(l.join("\n") + "\n"); }); };
C.fold = function(args, io){ var o = getopt(args, "w"), w = Number(o.f.w || 80); return readInput(this, io, o.a, "fold", function(t){ lines(t).forEach(function(l){ for(var i = 0; i < Math.max(1, l.length); i += w) io.out(l.slice(i, i + w) + "\n"); }); }); };
C.column = function(args, io){
  var o = getopt(args, "ts");
  return readInput(this, io, o.a, "column", function(t){
    var rows = lines(t).map(function(l){ return o.f.t ? l.trim().split(o.f.s ? new RegExp("[" + o.f.s + "]") : /\s+/) : [l]; });
    var w = []; rows.forEach(function(r){ r.forEach(function(c, i){ w[i] = Math.max(w[i] || 0, c.length); }); });
    rows.forEach(function(r){ io.out(r.map(function(c, i){ return i < r.length - 1 ? pad(c, w[i] + 2, true) : c; }).join("") + "\n"); });
  });
};
C.comm = function(args, io){
  var o = getopt(args), sh = this, a = lines(sh.fs.readFile(o.a[0], sh.cwd, sh.user)), b = lines(sh.fs.readFile(o.a[1], sh.cwd, sh.user)), i = 0, j = 0;
  var s1 = o.f["1"], s2 = o.f["2"], s3 = o.f["3"];
  while(i < a.length || j < b.length){
    if(j >= b.length || (i < a.length && a[i] < b[j])){ if(!s1) io.out(a[i] + "\n"); i++; }
    else if(i >= a.length || b[j] < a[i]){ if(!s2) io.out((s1 ? "" : "\t") + b[j] + "\n"); j++; }
    else { if(!s3) io.out((s1 ? "" : "\t") + (s2 ? "" : "\t") + a[i] + "\n"); i++; j++; }
  }
  return 0;
};
C.join = function(args, io){ io.err("join: not implemented in the lab\n"); return 1; };
C.cmp = function(args, io){ var sh = this; try{ var a = sh.fs.readFile(args[0], sh.cwd, sh.user), b = sh.fs.readFile(args[1], sh.cwd, sh.user); if(a === b) return 0; io.out(args[0] + " " + args[1] + " differ\n"); return 1; }catch(e){ io.err("cmp: " + e.message + "\n"); return 2; } };
C.lsof = function(args, io){ io.out("COMMAND   PID    USER   FD   TYPE DEVICE SIZE/OFF   NODE NAME\n"); return 0; };

/* ---------------------------------------------------------------- processes (simulated) */
C.ps = function(args, io){
  var sh = this, o = getopt(args.filter(function(a){ return a.indexOf("--") !== 0; }), "oup"), full = o.f.e || o.f.A || (args.join(" ").indexOf("aux") >= 0) || o.f.a || o.f.x;
  var rows = [{pid: 1, ppid: 0, user: "root", cmd: "/sbin/init", tty: "?", state: "Ss"}];
  rows.push({pid: sh.ppid, ppid: 1, user: sh.user.name, cmd: "-bash", tty: "pts/0", state: "Ss"});
  sh.procs.forEach(function(p){ if(!p.done) rows.push({pid: p.pid, ppid: p.ppid || sh.ppid, user: p.user || sh.user.name, cmd: p.cmd, tty: "pts/0", state: p.state || "S", ni: p.ni || 0}); else if(!p.reaped && p.state === "Z" && o.f.l) rows.push({pid: p.pid, ppid: sh.ppid, user: sh.user.name, cmd: "[" + p.cmd.split(" ")[0] + "] <defunct>", tty: "pts/0", state: "Z"}); });
  rows.push({pid: sh.pid + 500, ppid: sh.ppid, user: sh.user.name, cmd: "ps " + args.join(" "), tty: "pts/0", state: "R+"});
  if(o.f.p){ var want = String(o.f.p).split(","); rows = rows.filter(function(r){ return want.indexOf(String(r.pid)) >= 0; }); if(!rows.length && typeof o.f.o !== "string"){ io.out("    PID TTY          TIME CMD\n"); return 1; } }
  var wide = args.join(" ").indexOf("aux") >= 0 || o.f.f;
  if(typeof o.f.o === "string"){
    var cols = o.f.o.split(","), names = {ni: "NI", pid: "PID", ppid: "PPID", user: "USER", comm: "COMMAND", cmd: "CMD", args: "COMMAND", stat: "STAT", state: "S", tty: "TTY", etime: "ELAPSED", pcpu: "%CPU", pmem: "%MEM", rss: "RSS", vsz: "VSZ", nice: "NI", pri: "PRI"};
    var keys = cols.map(function(c){ return c.split("=")[0]; });
    var NUMERIC = {pid: 1, ppid: 1, ni: 1, nice: 1, pcpu: 1, pmem: 1, rss: 1, vsz: 1, pri: 1};
    var data = rows.filter(function(r){ return full || r.tty === "pts/0"; }).map(function(r){
      return keys.map(function(k){ return String({pid: r.pid, ppid: r.ppid, user: r.user, comm: r.cmd.split(" ")[0].replace(/^-/, "").replace(/^.*\//, ""), cmd: r.cmd, args: r.cmd, stat: r.state, state: r.state.charAt(0), tty: r.tty, etime: "00:01", pcpu: "0.0", pmem: "0.1", rss: "1024", vsz: "9000", nice: r.ni || 0, ni: r.ni || 0, pri: "19"}[k] === undefined ? "-" : {pid: r.pid, ppid: r.ppid, user: r.user, comm: r.cmd.split(" ")[0].replace(/^-/, "").replace(/^.*\//, ""), cmd: r.cmd, args: r.cmd, stat: r.state, state: r.state.charAt(0), tty: r.tty, etime: "00:01", pcpu: "0.0", pmem: "0.1", rss: "1024", vsz: "9000", nice: r.ni || 0, ni: r.ni || 0, pri: "19"}[k]); });
    });
    var heads = keys.map(function(k, i){ var c = cols[i], eq = c.indexOf("="); return eq > 0 ? c.slice(eq + 1) : (names[k] || k.toUpperCase()); });
    var minw = {pid: 5, ppid: 5, user: 8, ni: 3, nice: 3}; 
    var widths = keys.map(function(k, i){ return Math.max(minw[k] || 0, heads[i].length, Math.max.apply(null, [0].concat(data.map(function(r){ return r[i].length; })))); });
    function fmtRow(r){ return r.map(function(v, i){ var last = i === r.length - 1; return NUMERIC[keys[i]] ? pad(v, widths[i]) : (last ? v : pad(v, widths[i], true)); }).join(" "); }
    if(heads.some(function(h){ return h !== ""; })) io.out(fmtRow(heads) + "\n");
    data.forEach(function(r){ io.out(fmtRow(r) + "\n"); });
    return 0;
  }
  if(args.join(" ").indexOf("aux") >= 0){
    io.out("USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n");
    rows.forEach(function(r){ io.out(pad(r.user, 8, true) + " " + pad(r.pid, 7) + "  0.0  0.1   9000  1024 " + pad(r.tty, 8, true) + " " + pad(r.state, 4, true) + " 10:00   0:00 " + r.cmd + "\n"); });
    return 0;
  }
  if(o.f.f && !o.f.e){
    io.out("UID          PID    PPID  C STIME TTY          TIME CMD\n");
    rows.filter(function(r){ return r.tty === "pts/0"; }).forEach(function(r){ io.out(pad(r.user, 8, true) + " " + pad(r.pid, 8) + " " + pad(r.ppid, 7) + "  0 10:00 " + pad(r.tty, 8, true) + " 00:00:00 " + r.cmd + "\n"); });
    return 0;
  }
  if(o.f.e || o.f.A){ io.out("    PID TTY          TIME CMD\n"); rows.forEach(function(r){ io.out(pad(r.pid, 7) + " " + pad(r.tty, 8, true) + " 00:00:00 " + r.cmd.split(" ")[0].replace(/^-/, "").split("/").pop() + "\n"); }); return 0; }
  io.out("    PID TTY          TIME CMD\n");
  rows.filter(function(r){ return r.tty === "pts/0"; }).forEach(function(r){ io.out(pad(r.pid, 7) + " " + pad(r.tty, 8, true) + " 00:00:00 " + r.cmd.split(" ")[0].replace(/^-/, "").split("/").pop() + "\n"); });
  return 0;
};
C.pgrep = function(args, io){
  var o = getopt(args, "u"), pat = o.a[0], sh = this, found = 0;
  sh.procs.forEach(function(p){ if(!p.done && (o.f.f ? p.cmd : p.cmd.split(" ")[0]).indexOf(pat) >= 0){ io.out((o.f.l ? p.pid + " " + p.cmd.split(" ")[0] : p.pid) + "\n"); found++; } });
  return found ? 0 : 1;
};
C.pkill = function(args, io){
  var o = getopt(args), sh = this, sig = "TERM", pat;
  var rest = o.a;
  if(o.f.num) sig = o.f.num;
  Object.keys(o.f).forEach(function(k){ if(/^[A-Z]+$/.test(k) && k !== "num") sig = k; });
  pat = rest[0]; var n = 0;
  sh.procs.forEach(function(p){ if(!p.done && (o.f.f ? p.cmd : p.cmd.split(" ")[0]).indexOf(pat) >= 0){ B.kill.call(sh, ["-" + sig, String(p.pid)], io); n++; } });
  return n ? 0 : 1;
};
C.top = function(args, io){ io.out("top - " + two(new Date().getHours()) + ":" + two(new Date().getMinutes()) + ":00 up 1:12, 1 user, load average: 0.08, 0.05, 0.01\nTasks:   4 total,   1 running,   3 sleeping\n%Cpu(s):  1.0 us,  0.5 sy,  0.0 ni, 98.5 id\nMiB Mem :   7977.0 total,   4730.0 free,   1946.0 used\n\n    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n      1 root      20   0   18000   1024    900 S   0.0   0.1   0:00.10 init\n"); return 0; };
C.lscpu = function(args, io){ io.out("Architecture:             x86_64\nCPU(s):                   4\nModel name:               Virtual CPU\n"); return 0; };
C.ss = C.netstat = function(args, io){ io.out("Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port\n"); io.err("(the lab has no network stack; ss/netstat show an empty table)\n"); return 0; };
C.ip = function(args, io){
  if(args[0] === "addr" || args[0] === "a" || args[0] === "address"){ io.out("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN\n    inet 127.0.0.1/8 scope host lo\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP\n    inet 10.0.2.15/24 brd 10.0.2.255 scope global eth0\n"); io.err("(simulated: the lab has no real network)\n"); return 0; }
  io.err("ip: only `ip addr` is simulated in the lab\n"); return 1;
};

/* ---------------------------------------------------------------- users and sudo */
function writeEtc(sh, path, text){ sh.fs.writeFile(path, text, "/", null, false, 0); }
function appendEtc(sh, path, line){ var cur = sh.fs.readFile(path, "/", null); sh.fs.writeFile(path, cur + line + "\n", "/", null, false, 0); }
C.useradd = function(args, io){
  var o = getopt(args, "GgsudcCkKpefb"), sh = this;
  if(sh.user.uid !== 0){ io.err("useradd: Permission denied.\n"); return 1; }
  var name = o.a[0], pw = passwd(sh);
  if(!name){ io.err("Usage: useradd [options] LOGIN\n"); return 2; }
  if(pw.some(function(u){ return u.name === name; })){ io.err("useradd: user '" + name + "' already exists\n"); return 9; }
  var uid = 1000; while(pw.some(function(u){ return u.uid === uid; })) uid++;
  var grp = groups(sh), gid = uid; while(grp.some(function(g){ return g.gid === gid; })) gid++;
  var primary = gid;
  if(o.f.g){ var pg = grp.filter(function(g){ return g.name === o.f.g || String(g.gid) === o.f.g; })[0]; if(!pg){ io.err("useradd: group '" + o.f.g + "' does not exist\n"); return 6; } primary = pg.gid; }
  else appendEtc(sh, "/etc/group", name + ":x:" + gid + ":");
  var home = o.f.d || "/home/" + name;
  appendEtc(sh, "/etc/passwd", name + ":x:" + uid + ":" + primary + "::" + home + ":" + (o.f.s || "/bin/sh"));
  if(o.f.G){
    o.f.G.split(",").forEach(function(gn){
      var g = groups(sh).filter(function(x){ return x.name === gn; })[0];
      if(!g){ io.err("useradd: group '" + gn + "' does not exist\n"); return; }
      var txt = lines(sh.fs.readFile("/etc/group", "/", null)).map(function(l){ var p = l.split(":"); if(p[0] === gn){ var mem = p[3] ? p[3].split(",") : []; mem.push(name); p[3] = mem.join(","); } return p.join(":"); }).join("\n") + "\n";
      writeEtc(sh, "/etc/group", txt);
    });
  }
  if(o.f.m){ sh.fs.mkdirp(home, "/", null, 0); var h = sh.fs.get(home, "/", null, true); h.uid = uid; h.gid = primary; h.mode = 493; }
  return 0;
};
C.userdel = function(args, io){
  var o = getopt(args), sh = this, name = o.a[0];
  if(sh.user.uid !== 0){ io.err("userdel: Permission denied.\n"); return 1; }
  var u = passwd(sh).filter(function(x){ return x.name === name; })[0];
  if(!u){ io.err("userdel: user '" + name + "' does not exist\n"); return 6; }
  writeEtc(sh, "/etc/passwd", lines(sh.fs.readFile("/etc/passwd", "/", null)).filter(function(l){ return l.split(":")[0] !== name; }).join("\n") + "\n");
  var txt = lines(sh.fs.readFile("/etc/group", "/", null)).filter(function(l){ var p = l.split(":"); return !(p[0] === name && Number(p[2]) === u.gid); }).map(function(l){ var p = l.split(":"); p[3] = (p[3] ? p[3].split(",") : []).filter(function(m){ return m !== name; }).join(","); return p.join(":"); }).join("\n") + "\n";
  writeEtc(sh, "/etc/group", txt);
  if(o.f.r){ try{ rmRec(sh, u.home, true, io); }catch(e){} }
  return 0;
};
C.groupadd = function(args, io){ var sh = this, name = args.filter(function(a){ return a.charAt(0) !== "-"; }).pop(); if(sh.user.uid !== 0){ io.err("groupadd: Permission denied.\n"); return 1; } var gs = groups(sh); if(gs.some(function(g){ return g.name === name; })){ io.err("groupadd: group '" + name + "' already exists\n"); return 9; } var gid = 1000; while(gs.some(function(g){ return g.gid === gid; })) gid++; appendEtc(sh, "/etc/group", name + ":x:" + gid + ":"); return 0; };
C.groupdel = function(args, io){ var sh = this, name = args[0]; if(sh.user.uid !== 0){ io.err("groupdel: Permission denied.\n"); return 1; } if(!groups(sh).some(function(g){ return g.name === name; })){ io.err("groupdel: group '" + name + "' does not exist\n"); return 6; } writeEtc(sh, "/etc/group", lines(sh.fs.readFile("/etc/group", "/", null)).filter(function(l){ return l.split(":")[0] !== name; }).join("\n") + "\n"); return 0; };
C.usermod = function(args, io){
  var o = getopt(args, "Gg"), sh = this, name = o.a[0];
  if(sh.user.uid !== 0){ io.err("usermod: Permission denied.\n"); return 1; }
  if(o.f.G){
    var add = o.f.a || o.f.G; var gn = o.f.G;
    var txt = lines(sh.fs.readFile("/etc/group", "/", null)).map(function(l){ var p = l.split(":"); if(gn.split(",").indexOf(p[0]) >= 0){ var mem = p[3] ? p[3].split(",") : []; if(mem.indexOf(name) < 0) mem.push(name); p[3] = mem.join(","); } return p.join(":"); }).join("\n") + "\n";
    writeEtc(sh, "/etc/group", txt);
  }
  return 0;
};
C.passwd = function(args, io){ io.err("passwd: the lab does not store passwords\n"); return 0; };
C.sudo = async function(args, io){
  var sh = this, target = "root", i = 0, shellMode = false;
  while(i < args.length && args[i].charAt(0) === "-"){ if(args[i] === "-u"){ target = args[++i]; } else if(args[i] === "-i" || args[i] === "-s") shellMode = true; else if(args[i] === "-n" || args[i] === "-E" || args[i] === "-H") {} i++; }
  var cmd = args.slice(i);
  var u = passwd(sh).filter(function(x){ return x.name === target; })[0];
  if(!u){ io.err("sudo: unknown user " + target + "\n"); return 1; }
  if(sh.user.uid !== 0 && sh.user.groups.indexOf(27) < 0){ io.err(sh.user.name + " is not in the sudoers file.\n"); return 1; }
  var saved = sh.user, savedHome = sh.get("HOME"), savedUmask = sh.umask;
  if(u.uid !== 0 && u.uid === u.gid) sh.umask = 2;
  sh.user = {name: u.name, uid: u.uid, gid: u.gid, groups: [u.gid].concat(userGroups(sh, u.name).filter(function(g){ return g !== u.gid; }))};
  try{
    if(!cmd.length){ if(shellMode) return 0; io.err("usage: sudo [-u user] command\n"); return 1; }
    return await sh.exec(cmd, io);
  } finally { sh.user = saved; sh.umask = savedUmask; }
};
C.su = function(args, io){ io.err("su: not available in the lab; use sudo -u USER command\n"); return 1; };
C.chpasswd = function(){ return 0; };
C.systemctl = function(args, io){ io.err("System has not been booted with systemd as init system (PID 1). Can't operate.\nFailed to connect to bus: Host is down\n(the lab has no systemd: use a real Linux machine for service units)\n"); return 1; };
C.journalctl = function(args, io){ io.err("No journal files were found. (the lab has no systemd)\n"); return 1; };
C["apt-get"] = C.apt = function(args, io){ io.err("E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\n(the lab cannot install packages: it is a simulation, not a distro)\n"); return 100; };
C.dpkg = function(args, io){
  if(args[0] === "-l" || args[0] === "--list"){ io.out("Desired=Unknown/Install/Remove/Purge/Hold\nii  bash        5.2.21-2ubuntu4  amd64  GNU Bourne Again SHell\nii  coreutils   9.4-3ubuntu6    amd64  GNU core utilities\n"); return 0; }
  if(args[0] === "-L"){ io.out("/usr/bin/" + (args[1] || "") + "\n"); return 0; }
  if(args[0] === "-s"){ io.out("Package: " + args[1] + "\nStatus: install ok installed\n"); return 0; }
  io.err("dpkg: only -l, -L and -s are simulated in the lab\n"); return 1;
};
C.mount = function(args, io){ if(!args.length){ io.out("overlay on / type overlay (rw,relatime)\nproc on /proc type proc (rw,nosuid,nodev,noexec,relatime)\ntmpfs on /dev type tmpfs (rw,nosuid)\n"); return 0; } io.err("mount: only root on a real machine can mount (the lab cannot)\n"); return 32; };
C.umount = function(args, io){ io.err("umount: not available in the lab\n"); return 32; };
C.findmnt = function(args, io){ io.out("TARGET SOURCE  FSTYPE OPTIONS\n/      overlay overlay rw,relatime\n"); return 0; };
C.unshare = function(args, io){ io.err("unshare: unshare failed: Operation not permitted\n(namespaces need a real kernel: use the Codespaces or Cloud Shell lab for lesson 12)\n"); return 1; };

L.always = {sudo: 1, bash: 1, sh: 1};
/* shells and python live in builtins but should also be found by `which`/PATH checks */

/* ---------------------------------------------------------------- starting filesystem */
L.CtlClass = function(){ return L._Ctl; };
L.bootFS = function(){
  var fs = new L.FS(), t0 = Date.parse("2026-01-15T09:00:00");
  fs.clock = t0; fs.tick = function(){ return this.clock; };
  function dir(p, mode, uid, gid){ fs.mkdirp(p, "/", null, 0); var n = fs.get(p, "/", null, true); n.mode = mode === undefined ? 493 : mode; n.uid = uid || 0; n.gid = gid || 0; n.mtime = t0; return n; }
  function file(p, data, mode, uid, gid){ var d = p.slice(0, p.lastIndexOf("/")) || "/"; fs.mkdirp(d, "/", null, 0); var n = fs.writeFile(p, data, "/", null, false, 0); n.mode = mode === undefined ? 420 : mode; n.uid = uid || 0; n.gid = gid || 0; n.mtime = t0; return n; }
  ["/usr/bin", "/usr/sbin", "/usr/local/bin", "/usr/games", "/etc", "/root", "/srv", "/opt", "/mnt", "/media", "/boot", "/run", "/sys", "/usr/share", "/usr/lib"].forEach(function(d){ dir(d); });
  dir("/root", 448); dir("/tmp", 1023 | 512); dir("/var/tmp", 1023 | 512); dir("/var/log"); dir("/var/lib"); dir("/var/cache"); dir("/dev"); dir("/proc");
  file("/etc/passwd", "root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\nstudent:x:1000:1000:Student:/home/student:/bin/bash\n");
  file("/etc/group", "root:x:0:\ndaemon:x:1:\nsudo:x:27:student\nshadow:x:42:\nwww-data:x:33:\nstudent:x:1000:\n");
  file("/etc/shadow", "root:*:19000:0:99999:7:::\nstudent:!:19000:0:99999:7:::\n", 416, 0, 42);
  file("/etc/hostname", "lab\n"); file("/etc/hosts", "127.0.0.1\tlocalhost\n10.0.2.15\tlab\n");
  file("/etc/os-release", 'PRETTY_NAME="Ubuntu 24.04.4 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.4 LTS (Noble Numbat)"\nID=ubuntu\nID_LIKE=debian\n');
  file("/etc/shells", "/bin/sh\n/bin/bash\n"); file("/etc/resolv.conf", "nameserver 127.0.0.53\n");
  file("/etc/sudoers", "root ALL=(ALL:ALL) ALL\n%sudo ALL=(ALL:ALL) NOPASSWD: ALL\n", 288);
  file("/etc/crontab", "# m h dom mon dow user command\n17 * * * * root cd / && run-parts --report /etc/cron.hourly\n");
  file("/proc/cpuinfo", "processor\t: 0\nmodel name\t: Virtual CPU\n\nprocessor\t: 1\nmodel name\t: Virtual CPU\n");
  file("/proc/meminfo", "MemTotal:        8168448 kB\nMemFree:         4843000 kB\nMemAvailable:    5876000 kB\n");
  file("/proc/loadavg", "0.08 0.05 0.01 1/120 1234\n"); file("/proc/uptime", "4320.50 8600.10\n"); file("/proc/version", "Linux version 6.8.0-lab (lab@lab) #1 SMP\n");
  file("/dev/null", "", 438); file("/dev/zero", "", 438); file("/dev/urandom", "", 438);
  file("/var/log/syslog", "Jan 15 09:00:01 lab CRON[101]: (root) CMD (run-parts)\n", 416, 0, 4); file("/var/log/auth.log", "Jan 15 09:00:05 lab sshd[88]: Server listening on 0.0.0.0 port 22.\n", 416, 0, 4);
  // command stubs so PATH lookup, `which` and `ls /usr/bin` behave
  fs.symlink("usr/bin", "/bin", "/", null); fs.symlink("usr/sbin", "/sbin", "/", null);
  Object.keys(C).forEach(function(name){
    var where = /^(useradd|userdel|groupadd|groupdel|usermod|chpasswd)$/.test(name) ? "/usr/sbin/" : "/usr/bin/";
    if(name === "passwd") file("/usr/bin/passwd", "#!lab:passwd\n", 2541 + 1024 - 1024 + 2048 - 2048 + 0, 0, 0);
    else file(where + name, "#!lab:" + name + "\n", 493, 0, 0);
  });
  fs.get("/usr/bin/passwd", "/", null, true).mode = 2048 | 493;
  ["sh", "bash", "python3", "env"].forEach(function(n){ file("/usr/bin/" + n, "#!lab:" + n + "\n", 493); });
  file("/usr/bin/env", "#!lab:env\n", 493); file("/usr/bin/bash", "#!lab:bash\n", 493);
  ["echo", "printf", "test", "["].forEach(function(n){ file("/usr/bin/" + n, "#!lab:" + n + "\n", 493); });
  L.builtinStubs = ["echo", "printf", "test", "[", "env", "bash", "sh", "python3", "true", "false", "pwd", "kill", "printenv", "which", "sleep"];
  // the student's home and the course lab folder
  dir("/home", 493); dir("/home/student", 493, 1000, 1000);
  file("/home/student/.bashrc", "# ~/.bashrc\nalias ll='ls -alF'\n", 420, 1000, 1000); file("/home/student/.profile", "# ~/.profile\n", 420, 1000, 1000);
  var lab = dir("/home/student/lab", 493, 1000, 1000);
  dir("/home/student/lab/docs", 493, 1000, 1000); dir("/home/student/lab/ev", 493, 1000, 1000);
  ["config", "logs", "scripts", "archive"].forEach(function(d){ dir("/home/student/lab/ev/" + d, 493, 1000, 1000); });
  file("/home/student/lab/docs/readme.txt", "Welcome to the EV01 lab\n", 420, 1000, 1000);
  file("/home/student/lab/docs/notes.txt", "Remember: look before you delete.\n", 420, 1000, 1000);
  file("/home/student/lab/ev/config/evault.conf", "# Enterprise Vault server settings (pretend)\nserver_name = EV01\nsql_server = SQL01\nindexing_enabled = yes\nmax_threads = 8\nlog_level = info\n", 420, 1000, 1000);
  file("/home/student/lab/ev/scripts/check.sh", '#!/bin/bash\necho "checking EV01"\n', 420, 1000, 1000);
  file("/home/student/lab/ev/logs/indexing.log", [
    "2026-09-30 09:10:02 INFO  Indexing service started", "2026-09-30 09:10:05 INFO  Connected to SQL01", "2026-09-30 09:11:00 INFO  Indexed 1200 items",
    "2026-09-30 09:12:18 ERROR SQL connection timeout (SQL01)", "2026-09-30 09:12:19 WARN  Retrying connection, attempt 1", "2026-09-30 09:12:34 ERROR SQL connection timeout (SQL01)",
    "2026-09-30 09:12:35 WARN  Retrying connection, attempt 2", "2026-09-30 09:12:50 INFO  Connected to SQL01", "2026-09-30 10:02:11 INFO  Indexed 2100 items",
    "2026-09-30 11:05:00 INFO  Indexed 3400 items", "2026-09-30 11:40:22 WARN  Name resolution slow for SQL01", "2026-09-30 12:15:41 ERROR Name resolution failed for SQL01",
    "2026-09-30 12:15:42 ERROR SQL connection timeout (SQL01)", "2026-09-30 12:16:10 ERROR Indexing paused: database unreachable"].join("\n") + "\n", 420, 1000, 1000);
  file("/home/student/lab/ev/logs/storage.log", ["2026-09-30 09:10:03 INFO  Storage service started", "2026-09-30 09:30:00 INFO  Volume D: 61% full", "2026-09-30 10:30:00 INFO  Volume D: 63% full", "2026-09-30 11:30:00 WARN  Volume D: 81% full", "2026-09-30 12:30:00 INFO  Cleanup finished"].join("\n") + "\n", 420, 1000, 1000);
  fs.root.mtime = t0; delete fs.tick;
  return fs;
};
L.boot = function(out, fsJson){
  var fs = fsJson ? L.FS.fromJSON(fsJson) : L.bootFS();
  var sh = new L.Shell({fs: fs, out: out});
  sh.cwd = "/home/student/lab"; sh.set("PWD", sh.cwd, true);
  sh.interactive = true;
  return sh;
};
