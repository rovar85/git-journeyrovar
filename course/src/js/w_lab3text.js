/* In-browser lab, part 3: regular expressions (POSIX BRE/ERE to JS), grep, sed, awk. No DOM. */

var L = window.LabCore, SysErr = L.SysErr, C = L.cmds, U = L.util;
var getopt = U.getopt, lines = U.lines, readInput = U.readInput;

/* ---------------------------------------------------------------- regex translation */
function bracket(pat, i){            // pat[i] === "["; returns {js, end}
  var j = i + 1, neg = false, out = "";
  if(pat.charAt(j) === "^"){ neg = true; j++; }
  if(pat.charAt(j) === "]"){ out += "\\]"; j++; }
  while(j < pat.length && pat.charAt(j) !== "]"){
    if(pat.charAt(j) === "[" && pat.charAt(j + 1) === ":"){ var e = pat.indexOf(":]", j); if(e > 0){ out += L.posixClass(pat.slice(j + 2, e)); j = e + 2; continue; } }
    if(pat.charAt(j) === "[" && (pat.charAt(j + 1) === "." || pat.charAt(j + 1) === "=")){ var d = pat.charAt(j + 1), e2 = pat.indexOf(d + "]", j); if(e2 > 0){ out += L.escRe(pat.slice(j + 2, e2)); j = e2 + 2; continue; } }
    var c = pat.charAt(j);
    out += (c === "\\" || c === "[" || c === "^") ? "\\" + c : c; j++;
  }
  if(j >= pat.length) return null;
  return {js: "[" + (neg ? "^" : "") + out + "]", end: j};
}
function toJS(pat, ere, flags){
  var out = "", i = 0, n = pat.length, first = true;
  while(i < n){
    var c = pat.charAt(i);
    if(c === "["){ var b = bracket(pat, i); if(b){ out += b.js; i = b.end + 1; first = false; continue; } out += "\\["; i++; first = false; continue; }
    if(c === "\\" && i + 1 < n){
      var d = pat.charAt(i + 1); i += 2;
      if(!ere && d === "("){ out += "("; first = true; continue; } if(!ere && d === ")"){ out += ")"; continue; }
      if(!ere && d === "{"){ out += "{"; continue; } if(!ere && d === "}"){ out += "}"; continue; }
      if(!ere && d === "|"){ out += "|"; first = true; continue; } if(!ere && (d === "+" || d === "?")){ out += d; continue; }
      if(d === "<" || d === ">"){ out += "\\b"; continue; }
      if(d === "w" || d === "W" || d === "s" || d === "S" || d === "b" || d === "B"){ out += "\\" + d; continue; }
      if(/[1-9]/.test(d)){ out += "\\" + d; continue; }
      if(d === "n"){ out += "\\n"; continue; } if(d === "t"){ out += "\\t"; continue; }
      out += L.escRe(d); first = false; continue;
    }
    if(ere){
      if(c === "{" && !/^\{\d*(,\d*)?\}/.test(pat.slice(i))){ out += "\\{"; i++; continue; }
      if(c === "*" && first){ out += "\\*"; i++; continue; }
      if(c === "(" || c === "|") first = true; else first = false;
      out += c; i++; continue;
    }
    if(c === "*" && first){ out += "\\*"; i++; first = false; continue; }
    if(c === "^" && !first && i > 0 && !/[\(|]$/.test(out.slice(-1)) ){ out += "\\^"; i++; continue; }
    if(c === "$" && i < n - 1 && !/^\\[)|]/.test(pat.slice(i + 1, i + 3))){ out += "\\$"; i++; continue; }
    if("(){}|+?".indexOf(c) >= 0){ out += "\\" + c; i++; first = false; continue; }
    if(c === "^") { out += "^"; first = true; i++; continue; }
    out += c; i++; first = false;
  }
  return out;
}
L.toJS = toJS;
function mkRe(pat, ere, flags){
  try{ return new RegExp(toJS(pat, ere), flags); }catch(e){ throw new SysErr("EINVAL", "Invalid regular expression"); }
}
L.mkRe = mkRe;

/* ---------------------------------------------------------------- grep */
function grepMain(args, io, defE, defF){
  var o = getopt(args, "eAfBCm"), sh = this, f = o.f;
  var pats = [];
  if(f.e !== undefined){ pats.push(f.e); }
  var files = o.a;
  if(f.f){ try{ lines(sh.fs.readFile(f.f, sh.cwd, sh.user)).forEach(function(l){ pats.push(l); }); }catch(e){ io.err("grep: " + f.f + ": No such file or directory\n"); return 2; } }
  else if(f.e === undefined){ if(!files.length){ io.err("Usage: grep [OPTION]... PATTERNS [FILE]...\n"); return 2; } pats.push(files.shift()); }
  // collect extra -e occurrences
  for(var i = 0; i < args.length; i++){ if(args[i] === "-e" && args[i + 1] !== undefined && pats.indexOf(args[i + 1]) < 0) pats.push(args[i + 1]); }
  var ere = f.E || defE, fixed = f.F || defF, ci = f.i || f["--ignore-case"], word = f.w, whole = f.x;
  var res;
  try{
    res = pats.reduce(function(acc, p){ return acc.concat(p.indexOf("\n") >= 0 ? p.split("\n") : [p]); }, []).map(function(p){
      var src = fixed ? L.escRe(p).replace(/\\-/g, "-") : toJS(p, ere);
      if(whole) src = "^(?:" + src + ")$"; else if(word) src = "(?<![A-Za-z0-9_])(?:" + src + ")(?![A-Za-z0-9_])";
      return new RegExp(src, (ci ? "i" : "") + "g");
    });
  }catch(e){ io.err("grep: Invalid regular expression\n"); return 2; }
  var rec = f.r || f.R || f["--recursive"], count = f.c, listf = f.l, listn = f.L, invert = f.v, num = f.n, only = f.o, quiet = f.q, noname = f.h, withname = f.H, silent = f.s;
  var after = Number(f.A || f.C || (f.num && f.num) || 0), before = Number(f.B || f.C || (f.num && f.num) || 0), maxc = f.m ? Number(f.m) : Infinity;
  var inc = f["--include"], exc = f["--exclude"];
  var targets = [];
  if(rec){
    var roots = files.length ? files : ["."];
    roots.forEach(function(r){
      try{ sh.fs.walk(r, sh.cwd, function(n, p){ if(n.t === "f"){ var base = p.split("/").pop(); if(inc && !new RegExp("^" + L.globToRegex(inc) + "$").test(base)) return; if(exc && new RegExp("^" + L.globToRegex(exc) + "$").test(base)) return; targets.push(files.length && r !== "." ? p.replace(sh.fs.norm(r, sh.cwd), r.replace(/\/$/, "")) : p.replace(sh.fs.norm(".", sh.cwd) + "/", "")); } }, sh.user); }catch(e){ if(e instanceof SysErr && !silent) io.err("grep: " + r + ": " + e.message + "\n"); }
    });
  } else targets = files;
  var multi = (targets.length > 1 || rec) && !noname || withname, any = false, st = 0;
  var hadErr = false;
  var src = targets.length ? targets : ["-"];
  src.forEach(function(file){
    var text;
    try{ text = file === "-" ? (io.in || "") : sh.fs.readFile(file, sh.cwd, sh.user); }
    catch(e){ if(e instanceof SysErr){ if(!silent) io.err("grep: " + file + ": " + e.message + "\n"); hadErr = true; return; } throw e; }
    var ls = lines(text), matches = 0, printed = {}, lastPrinted = -1, pendingAfter = 0;
    function out(idx, sepc){ var pre = (multi ? file + sepc : "") + (num ? (idx + 1) + sepc : ""); io.out(pre + ls[idx] + "\n"); }
    var hits = [];
    for(var k = 0; k < ls.length && matches < maxc; k++){
      var m = res.some(function(re){ re.lastIndex = 0; return re.test(ls[k]); });
      if(m !== !!invert){ matches++; hits.push(k); }
    }
    if(matches) any = true;
    if(quiet) return;
    if(listf){ if(matches) io.out(file + "\n"); return; }
    if(listn){ if(!matches) io.out(file + "\n"); return; }
    if(count){ io.out((multi ? file + ":" : "") + matches + "\n"); return; }
    if(only && !invert){
      hits.forEach(function(k2){ res.forEach(function(re){ re.lastIndex = 0; var mm; while((mm = re.exec(ls[k2])) !== null){ if(mm[0] === ""){ re.lastIndex++; continue; } io.out((multi ? file + ":" : "") + (num ? (k2 + 1) + ":" : "") + mm[0] + "\n"); } }); });
      return;
    }
    var shown = {}, lastIdx = -1;
    hits.forEach(function(h){
      var from = Math.max(0, h - before), to = Math.min(ls.length - 1, h + after);
      if((before || after) && lastIdx >= 0 && from > lastIdx + 1) io.out("--\n");
      for(var q = Math.max(from, lastIdx + 1); q <= to; q++){ if(shown[q]) continue; shown[q] = 1; out(q, q === h || hits.indexOf(q) >= 0 ? ":" : "-"); }
      lastIdx = Math.max(lastIdx, to);
    });
  });
  if(quiet && any) return 0;
  return any ? (hadErr && !quiet ? 2 : 0) : (hadErr ? 2 : 1);
}
C.grep = function(args, io){ return grepMain.call(this, args, io, false, false); };
C.egrep = function(args, io){ return grepMain.call(this, args, io, true, false); };
C.fgrep = function(args, io){ return grepMain.call(this, args, io, false, true); };

/* ---------------------------------------------------------------- sed */
function parseSed(script, ere){
  var cmds = [], i = 0, n = script.length;
  function skipWs(){ while(i < n && /[ \t]/.test(script.charAt(i))) i++; }
  function readDelim(d){            // read until unescaped delimiter
    var s = "";
    while(i < n && script.charAt(i) !== d){
      if(script.charAt(i) === "\\" && i + 1 < n){ if(script.charAt(i + 1) === d && d !== "/") { s += d; i += 2; continue; } s += script.charAt(i) + script.charAt(i + 1); i += 2; continue; }
      s += script.charAt(i++);
    }
    if(i >= n) throw new SysErr("EINVAL", "unterminated `s' command");
    i++; return s;
  }
  function address(){
    skipWs();
    var c = script.charAt(i);
    if(/\d/.test(c)){ var m = /^\d+/.exec(script.slice(i)); i += m[0].length; if(script.charAt(i) === "~"){ i++; var st = /^\d+/.exec(script.slice(i)); i += st[0].length; return {step: [Number(m[0]), Number(st[0])]}; } return {line: Number(m[0])}; }
    if(c === "$"){ i++; return {last: true}; }
    if(c === "/" || c === "\\"){ var d = "/"; if(c === "\\"){ i++; d = script.charAt(i); } i++; var re = readDelim(d); var fl = ""; while(/[Ii]/.test(script.charAt(i))){ fl += "i"; i++; } return {re: mkRe(re, ere, fl)}; }
    return null;
  }
  while(i < n){
    while(i < n && /[\s;]/.test(script.charAt(i))) i++;
    if(i >= n) break;
    var a1 = address(), a2 = null;
    if(a1 && script.charAt(i) === ","){ i++; skipWs(); if(script.charAt(i) === "+"){ i++; var pm = /^\d+/.exec(script.slice(i)); i += pm[0].length; a2 = {plus: Number(pm[0])}; } else a2 = address(); }
    skipWs();
    var neg = false; while(script.charAt(i) === "!"){ neg = true; i++; skipWs(); }
    var c = script.charAt(i++);
    var cmd = {a1: a1, a2: a2, neg: neg, c: c};
    if(c === "{"){ cmd.c = "{"; }
    else if(c === "}"){ }
    else if(c === "s"){
      var d = script.charAt(i++); var pat = readDelim(d), rep = readDelim(d), fl = "";
      cmd.flags = ""; while(i < n && /[gpiIme0-9w]/.test(script.charAt(i))){ var ch = script.charAt(i); if(ch === "w"){ i++; skipWs(); cmd.wfile = script.slice(i).split(/[\n;]/)[0].trim(); i = n; break; } fl += ch; i++; }
      cmd.g = fl.indexOf("g") >= 0; cmd.p = fl.indexOf("p") >= 0; cmd.nth = (/\d+/.exec(fl) || [0])[0] ? Number(/\d+/.exec(fl)[0]) : 0;
      cmd.re = mkRe(pat, ere, (/[iI]/.test(fl) ? "i" : "") + "g");
      cmd.rep = rep;
    }
    else if(c === "y"){ var d2 = script.charAt(i++); var s1 = readDelim(d2), s2 = readDelim(d2); cmd.map = {}; for(var q = 0; q < s1.length; q++) cmd.map[s1.charAt(q)] = s2.charAt(q); }
    else if(c === "a" || c === "i" || c === "c"){
      skipWs(); if(script.charAt(i) === "\\"){ i++; if(script.charAt(i) === "\n") i++; }
      var e = script.indexOf("\n", i); if(e < 0) e = n; cmd.text = script.slice(i, e).replace(/\\(.)/g, "$1"); i = e + 1;
    }
    else if(c === "r" || c === "w"){ skipWs(); var e2 = script.indexOf("\n", i); if(e2 < 0) e2 = n; cmd.file = script.slice(i, e2).trim(); i = e2 + 1; }
    else if(c === "q" || c === "Q"){ skipWs(); var qm = /^\d+/.exec(script.slice(i)); if(qm){ cmd.code = Number(qm[0]); i += qm[0].length; } }
    else if(c === "b" || c === "t" || c === "T" || c === ":"){ skipWs(); var e3 = i; while(e3 < n && !/[\n;]/.test(script.charAt(e3))) e3++; cmd.label = script.slice(i, e3).trim(); i = e3; }
    else if("dDpPnNgGhHxl=zF".indexOf(c) < 0) throw new SysErr("EINVAL", "unknown command: `" + c + "'");
    cmds.push(cmd);
  }
  // resolve braces and labels
  var stack = [];
  cmds.forEach(function(cm, idx){ if(cm.c === "{") stack.push(idx); else if(cm.c === "}"){ var o = stack.pop(); cmds[o].end = idx; } });
  var labels = {}; cmds.forEach(function(cm, idx){ if(cm.c === ":") labels[cm.label] = idx; });
  return {cmds: cmds, labels: labels};
}
function sedReplace(m, rep, str){
  return rep.replace(/\\(.)|&/g, function(x, c){
    if(x === "&") return m[0];
    if(/[1-9]/.test(c)) return m[Number(c)] === undefined ? "" : m[Number(c)];
    if(c === "n") return "\n"; if(c === "t") return "\t";
    return c;
  });
}
C.sed = function(args, io){
  var sh = this, quiet = false, ere = false, inplace = null, scripts = [], files = [], sep = false;
  for(var i = 0; i < args.length; i++){
    var a = args[i];
    if(a === "-n" || a === "--quiet" || a === "--silent") quiet = true;
    else if(a === "-E" || a === "-r" || a === "--regexp-extended") ere = true;
    else if(a === "-s") sep = true;
    else if(a === "-e"){ scripts.push(args[++i]); }
    else if(a === "-f"){ try{ scripts.push(sh.fs.readFile(args[++i], sh.cwd, sh.user)); }catch(e){ io.err("sed: couldn't open file " + args[i] + ": No such file or directory\n"); return 1; } }
    else if(/^-i/.test(a) || a === "--in-place"){ inplace = a.slice(2); }
    else if(/^-[nEr]+$/.test(a)){ if(a.indexOf("n") >= 0) quiet = true; if(/[Er]/.test(a)) ere = true; }
    else if(a === "--expression"){ scripts.push(args[++i]); }
    else if(a.indexOf("--") === 0){}
    else if(!scripts.length && !files.length && a.charAt(0) !== "-") scripts.push(a);
    else files.push(a);
  }
  if(!scripts.length){ io.err("Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...\n"); return 1; }
  var prog;
  try{ prog = parseSed(scripts.join("\n"), ere); }catch(e){ if(e instanceof SysErr){ io.err("sed: -e expression #1, char 0: " + e.extra + "\n"); return 1; } throw e; }
  var cmds = prog.cmds, outputs = [], st = 0;
  var wfiles = {};
  function runText(text, emit, fname){
    var ls = text.length ? text.split("\n") : []; var trailing = text.length && text.charAt(text.length - 1) === "\n"; if(trailing) ls.pop();
    var hold = "", rangeState = new Array(cmds.length).fill(false), rangeEnd = new Array(cmds.length).fill(0), quit = false, appended = [];
    function matchAddr(cm, idx, ln, line){
      function one(ad){ if(ad.line) return ln === ad.line; if(ad.last) return ln === ls.length; if(ad.re){ ad.re.lastIndex = 0; return ad.re.test(line); } if(ad.step) return ad.step[1] === 0 ? ln === ad.step[0] : ln >= ad.step[0] && (ln - ad.step[0]) % ad.step[1] === 0; return false; }
      if(!cm.a1) return true;
      if(!cm.a2) return one(cm.a1);
      if(rangeState[idx]){
        if(cm.a2.plus !== undefined){ if(ln >= rangeEnd[idx]) rangeState[idx] = false; return true; }
        if(cm.a2.line){ if(ln >= cm.a2.line) rangeState[idx] = false; return true; }
        if(one(cm.a2)) rangeState[idx] = false; return true;
      }
      if(one(cm.a1)){
        if(cm.a2.plus !== undefined){ rangeEnd[idx] = ln + cm.a2.plus; rangeState[idx] = cm.a2.plus > 0; return true; }
        if(cm.a2.line){ rangeState[idx] = ln < cm.a2.line; return true; }
        if(cm.a2.last){ rangeState[idx] = ln < ls.length; return true; }
        rangeState[idx] = true; return true;
      }
      return false;
    }
    for(var ln = 1; ln <= ls.length && !quit; ln++){
      var ps = ls[ln - 1], subst = false, deleted = false, pc = 0, guard = 0;
      appended = [];
      while(pc < cmds.length){
        if(++guard > 100000){ break; }
        var cm = cmds[pc];
        if(cm.c === "}" || cm.c === ":"){ pc++; continue; }
        var m = matchAddr(cm, pc, ln, ps); if(cm.neg) m = !m;
        if(!m){ pc = cm.c === "{" ? cm.end + 1 : pc + 1; continue; }
        switch(cm.c){
          case "{": break;
          case "s": {
            var count = 0, did = false;
            cm.re.lastIndex = 0;
            var res = ps.replace(cm.re, function(){
              var mm = Array.prototype.slice.call(arguments, 0, -2).concat([]);
              count++;
              if(cm.nth && count < cm.nth) return mm[0];
              if(!cm.g && did) return mm[0];
              if(cm.nth && !cm.g && count > cm.nth) return mm[0];
              did = true;
              return sedReplace(mm, cm.rep);
            });
            if(did){ ps = res; subst = true; if(cm.p) emit(ps + "\n"); if(cm.wfile) (wfiles[cm.wfile] = wfiles[cm.wfile] || []).push(ps); }
            break;
          }
          case "y": ps = ps.split("").map(function(ch){ return cm.map[ch] !== undefined ? cm.map[ch] : ch; }).join(""); break;
          case "d": deleted = true; pc = cmds.length; continue;
          case "D": { var nl = ps.indexOf("\n"); if(nl < 0) deleted = true; else { ps = ps.slice(nl + 1); } pc = cmds.length; continue; }
          case "p": emit(ps + "\n"); break;
          case "P": emit(ps.split("\n")[0] + "\n"); break;
          case "n": if(!quiet) emit(ps + "\n"); if(ln >= ls.length){ deleted = true; quit = true; pc = cmds.length; continue; } ln++; ps = ls[ln - 1]; break;
          case "N": if(ln >= ls.length){ pc = cmds.length; continue; } ln++; ps = ps + "\n" + ls[ln - 1]; break;
          case "g": ps = hold; break; case "G": ps = ps + "\n" + hold; break; case "h": hold = ps; break; case "H": hold = hold + "\n" + ps; break;
          case "x": var tmp = ps; ps = hold; hold = tmp; break;
          case "=": emit(ln + "\n"); break;
          case "l": emit(ps.replace(/\\/g, "\\\\").replace(/\t/g, "\\t") + "$\n"); break;
          case "a": appended.push(cm.text + "\n"); break;
          case "i": emit(cm.text + "\n"); break;
          case "c": if(!cm.a2 || !rangeState[pc]) emit(cm.text + "\n"); deleted = true; pc = cmds.length; continue;
          case "r": try{ appended.push(sh.fs.readFile(cm.file, sh.cwd, sh.user)); }catch(e){} break;
          case "w": (wfiles[cm.file] = wfiles[cm.file] || []).push(ps); break;
          case "q": if(!quiet) emit(ps + "\n"); appended.forEach(function(x){ emit(x); }); quit = true; st = cm.code || 0; deleted = true; pc = cmds.length; continue;
          case "Q": quit = true; st = cm.code || 0; deleted = true; pc = cmds.length; continue;
          case "b": pc = cm.label ? prog.labels[cm.label] : cmds.length; continue;
          case "t": if(subst){ subst = false; pc = cm.label ? prog.labels[cm.label] : cmds.length; continue; } break;
          case "T": if(!subst){ pc = cm.label ? prog.labels[cm.label] : cmds.length; continue; } subst = false; break;
          case "z": ps = ""; break;
          case "F": emit((fname || "-") + "\n"); break;
        }
        pc++;
      }
      if(!deleted && !quiet) emit(ps + "\n");
      appended.forEach(function(x){ emit(x); });
    }
    if(!trailing && ls.length) { /* sed adds no newline if the input had none; keep simple */ }
  }
  var inputs = [];
  if(!files.length) inputs.push({name: "-", text: io.in || ""});
  else files.forEach(function(f){ try{ inputs.push({name: f, text: f === "-" ? (io.in || "") : sh.fs.readFile(f, sh.cwd, sh.user)}); }catch(e){ if(e instanceof SysErr){ io.err("sed: can't read " + f + ": " + e.message + "\n"); st = 2; } else throw e; } });
  if(inplace !== null){
    inputs.forEach(function(inp){ var buf = ""; runText(inp.text, function(s){ buf += s; }, inp.name); if(inplace) sh.fs.writeFile(inp.name + inplace, inp.text, sh.cwd, sh.user, false, sh.umask); sh.fs.writeFile(inp.name, buf, sh.cwd, sh.user, false, sh.umask); });
  } else if(sep) inputs.forEach(function(inp){ runText(inp.text, io.out, inp.name); });
  else runText(inputs.map(function(x){ return x.text; }).map(function(t){ return t.length && t.charAt(t.length - 1) !== "\n" ? t + "\n" : t; }).join(""), io.out, inputs[0] && inputs[0].name);
  Object.keys(wfiles).forEach(function(f){ if(f === "/dev/stdout") io.out(wfiles[f].join("\n") + "\n"); else try{ sh.fs.writeFile(f, wfiles[f].join("\n") + "\n", sh.cwd, sh.user, false, sh.umask); }catch(e){} });
  return st;
};

/* ---------------------------------------------------------------- awk */
function awkLex(src){
  var toks = [], i = 0, n = src.length, prevSig = null;
  function regexAllowed(){ return !prevSig || /^(op|kw|\()$/.test(prevSig.t) && !(prevSig.t === "op" && /^(\)|\]|\+\+|--)$/.test(prevSig.v)) || prevSig.t === "nl" || prevSig.t === "," || prevSig.t === "{" || prevSig.t === ";" || prevSig.t === "&&" || prevSig.t === "||" || prevSig.t === "!"; }
  var KW = {BEGIN: 1, END: 1, "function": 1, func: 1, "if": 1, "else": 1, "while": 1, "for": 1, "do": 1, "break": 1, "continue": 1, next: 1, exit: 1, "return": 1, delete: 1, "in": 1, print: 1, printf: 1, getline: 1};
  function push(t){ toks.push(t); prevSig = t; }
  while(i < n){
    var c = src.charAt(i);
    if(c === " " || c === "\t" || c === "\r"){ i++; continue; }
    if(c === "\\" && src.charAt(i + 1) === "\n"){ i += 2; continue; }
    if(c === "#"){ while(i < n && src.charAt(i) !== "\n") i++; continue; }
    if(c === "\n"){ push({t: "nl"}); i++; continue; }
    if(/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src.charAt(i + 1)))){ var m = /^(0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][-+]?\d+)?|\d+\.)/.exec(src.slice(i)); i += m[0].length; push({t: "num", v: Number(m[0])}); continue; }
    if(/[A-Za-z_]/.test(c)){ var m2 = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)); i += m2[0].length; if(KW[m2[0]]) push({t: "kw", v: m2[0] === "func" ? "function" : m2[0]}); else if(src.charAt(i) === "(") push({t: "fname", v: m2[0]}); else push({t: "id", v: m2[0]}); continue; }
    if(c === '"'){ var s = ""; i++; while(i < n && src.charAt(i) !== '"'){ if(src.charAt(i) === "\\"){ i++; var e = src.charAt(i); s += ({n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "/": "/", a: "\x07"}[e] !== undefined ? {n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "/": "/", a: "\x07"}[e] : "\\" + e); i++; continue; } s += src.charAt(i++); } i++; push({t: "str", v: s}); continue; }
    if(c === "/" && regexAllowed()){ var r = ""; i++; var inb = false; while(i < n && (src.charAt(i) !== "/" || inb)){ if(src.charAt(i) === "\\" && src.charAt(i + 1) === "/"){ r += "/"; i += 2; continue; } if(src.charAt(i) === "\\"){ r += src.charAt(i) + src.charAt(i + 1); i += 2; continue; } if(src.charAt(i) === "[") inb = true; else if(src.charAt(i) === "]") inb = false; r += src.charAt(i++); } i++; push({t: "re", v: r}); continue; }
    var three = src.substr(i, 3), two = src.substr(i, 2);
    if(three === "**="){ i += 3; push({t: "op", v: "^="}); continue; }
    if(["&&", "||", "==", "!=", "<=", ">=", "++", "--", "+=", "-=", "*=", "/=", "%=", "^=", "!~", ">>", "**"].indexOf(two) >= 0){ i += 2; push({t: two === "&&" ? "&&" : two === "||" ? "||" : "op", v: two === "**" ? "^" : two}); continue; }
    i++;
    if(c === "{" || c === "}" || c === "(" || c === ")" || c === "[" || c === "]" || c === ";" || c === ",") push({t: c === "{" ? "{" : c === ";" ? ";" : c === "," ? "," : c === "(" ? "(" : "op", v: c}); else if(c === "!") push({t: "!", v: "!"}); else push({t: "op", v: c});
  }
  toks.push({t: "nl"}); toks.push({t: "eof"});
  return toks;
}
function awkParse(src){
  var toks = awkLex(src), p = 0;
  function peek(){ return toks[p]; }
  function nxt(){ return toks[p++]; }
  function isT(t, v){ var k = toks[p]; return k.t === t && (v === undefined || k.v === v); }
  function isOp(v){ var k = toks[p]; return (k.t === "op" || k.t === "{" || k.t === ";" || k.t === "," || k.t === "(" || k.t === "!") && (k.v === v || k.t === v); }
  function skipNl(){ while(toks[p].t === "nl" || toks[p].t === ";") p++; }
  function skipNlOnly(){ while(toks[p].t === "nl") p++; }
  function expectOp(v){ skipNlOnly(); if(!isOp(v)) throw new SysErr("EINVAL", "syntax error at source line 1 near `" + (toks[p].v !== undefined ? toks[p].v : toks[p].t) + "'"); p++; }
  var prog = {begin: [], end: [], rules: [], funcs: {}};
  skipNl();
  while(!isT("eof")){
    if(isT("kw", "function")){
      p++; var name = nxt().v, params = [];
      expectOp("("); while(!isOp(")")){ if(isT(",")) { p++; continue; } params.push(nxt().v); } p++;
      skipNlOnly(); var body = block(); prog.funcs[name] = {params: params, body: body};
    } else if(isT("kw", "BEGIN")){ p++; skipNlOnly(); prog.begin.push(block()); }
    else if(isT("kw", "END")){ p++; skipNlOnly(); prog.end.push(block()); }
    else {
      var pat = null, pat2 = null;
      if(!isOp("{")){ pat = expr(); if(isT(",")){ p++; skipNlOnly(); pat2 = expr(); } }
      var act = null; if(isOp("{")) act = block();
      prog.rules.push({pat: pat, pat2: pat2, act: act, on: false});
    }
    skipNl();
  }
  return prog;
  function block(){
    expectOp("{"); var stmts = []; skipNl();
    while(!isOp("}")){ if(isT("eof")) throw new SysErr("EINVAL", "syntax error: unexpected end of program"); stmts.push(stmt()); skipNl(); }
    p++; return {k: "block", s: stmts};
  }
  function simpleOrBlock(){ skipNlOnly(); if(isOp("{")) return block(); var s = stmt(); return s; }
  function endStmt(){ if(isT(";") || isT("nl")) { while(isT(";") || isT("nl")) p++; } }
  function stmt(){
    var k = peek();
    if(isOp("{")) return block();
    if(k.t === "kw"){
      switch(k.v){
        case "if": { p++; expectOp("("); var c = expr(); expectOp(")"); var th = simpleOrBlock(); var save = p; skipNl(); var el = null; if(isT("kw", "else")){ p++; el = simpleOrBlock(); } else p = save; return {k: "if", c: c, t: th, e: el}; }
        case "while": { p++; expectOp("("); var c2 = expr(); expectOp(")"); if(isT(";")) { p++; return {k: "while", c: c2, b: {k: "block", s: []}}; } return {k: "while", c: c2, b: simpleOrBlock()}; }
        case "do": { p++; var b = simpleOrBlock(); skipNl(); if(!isT("kw", "while")) throw new SysErr("EINVAL", "syntax error: expected while"); p++; expectOp("("); var c3 = expr(); expectOp(")"); endStmt(); return {k: "do", c: c3, b: b}; }
        case "for": {
          p++; expectOp("(");
          if(isT("id") && toks[p + 1].t === "kw" && toks[p + 1].v === "in"){ var v = nxt().v; p++; var arr = nxt().v; expectOp(")"); return {k: "forin", v: v, a: arr, b: simpleOrBlock()}; }
          var init = null, cond = null, step = null;
          if(!isT(";")) init = simple(); expectOp(";"); skipNlOnly(); if(!isT(";")) cond = expr(); expectOp(";"); skipNlOnly(); if(!isOp(")")) step = simple(); expectOp(")");
          return {k: "for", i: init, c: cond, s: step, b: simpleOrBlock()};
        }
        case "break": p++; endStmt(); return {k: "break"}; case "continue": p++; endStmt(); return {k: "continue"};
        case "next": p++; endStmt(); return {k: "next"};
        case "exit": { p++; var e = null; if(!isT(";") && !isT("nl") && !isOp("}")) e = expr(); endStmt(); return {k: "exit", e: e}; }
        case "return": { p++; var r = null; if(!isT(";") && !isT("nl") && !isOp("}")) r = expr(); endStmt(); return {k: "return", e: r}; }
        case "delete": { p++; var nm = nxt().v, idx = null; if(isOp("[")){ p++; idx = exprList(); expectOp("]"); } endStmt(); return {k: "delete", a: nm, i: idx}; }
      }
    }
    var s = simple(); endStmt(); return s;
  }
  function simple(){
    if(isT("kw", "print") || isT("kw", "printf")){
      var kind = nxt().v, args = [], redir = null;
      if(!isT(";") && !isT("nl") && !isOp("}") && !isOp(">") && !isOp(">>") && !isOp("|")){
        if(isOp("(")){                                  // print (a, b) > "f"
          var save = p; p++; var lst = exprList(); if(isOp(")") && (toks[p + 1].t === "nl" || toks[p + 1].t === ";" || toks[p + 1].t === "{" || (toks[p + 1].t === "op" && /^[>|]|>>/.test(toks[p + 1].v)) || toks[p + 1].t === "eof")){ p++; args = lst; } else { p = save; args = exprList(true); }
        } else args = exprList(true);
      }
      if(isOp(">") || isOp(">>") || isOp("|")){ var rk = nxt().v; redir = {k: rk, e: concat()}; }
      return {k: kind, a: args, r: redir};
    }
    return {k: "expr", e: expr()};
  }
  function exprList(noGt){ var l = [expr(noGt)]; while(isT(",")){ p++; skipNlOnly(); l.push(expr(noGt)); } return l; }
  function expr(noGt){ return ternary(noGt); }
  function ternary(ng){
    var c = orE(ng);
    if(isOp("?")){ p++; skipNlOnly(); var a = ternary(ng); skipNlOnly(); expectOp(":"); skipNlOnly(); var b = ternary(ng); return {k: "tern", c: c, a: a, b: b}; }
    if(c.k === "var" || c.k === "idx" || c.k === "field"){
      var t = peek();
      if(t.t === "op" && /^(=|\+=|-=|\*=|\/=|%=|\^=)$/.test(t.v)){ p++; skipNlOnly(); var rhs = ternary(ng); return {k: "assign", op: t.v, l: c, r: rhs}; }
    }
    return c;
  }
  function orE(ng){ var l = andE(ng); while(isT("||")){ p++; skipNlOnly(); l = {k: "or", a: l, b: andE(ng)}; } return l; }
  function andE(ng){ var l = inE(ng); while(isT("&&")){ p++; skipNlOnly(); l = {k: "and", a: l, b: inE(ng)}; } return l; }
  function inE(ng){ var l = matchE(ng); while(isT("kw", "in")){ p++; var a = nxt().v; l = {k: "in", i: l, a: a}; } return l; }
  function matchE(ng){
    var l = cmpE(ng);
    while((isOp("~") || isOp("!~"))){ var neg = nxt().v === "!~"; var r = cmpE(ng); l = {k: "match", neg: neg, a: l, b: r}; }
    return l;
  }
  function cmpE(ng){
    var l = concat();
    var t = peek();
    if(t.t === "op" && /^(<|<=|==|!=|>=)$/.test(t.v) || (t.t === "op" && t.v === ">" && !ng)){ p++; var r = concat(); return {k: "cmp", op: t.v, a: l, b: r}; }
    return l;
  }
  function concat(){
    var l = additive();
    for(;;){
      var t = peek();
      if(t.t === "num" || t.t === "str" || t.t === "id" || t.t === "fname" || (t.t === "op" && (t.v === "$" || t.v === "-" && false)) || t.t === "!" && false || (t.t === "(" ) || (t.t === "op" && (t.v === "++" || t.v === "--") ) || t.t === "re" && false){
        if(t.t === "op" && (t.v === "++" || t.v === "--") && l.k !== undefined && false) break;
        if(isT("kw")) break;
        var r = additive(); l = {k: "cat", a: l, b: r}; continue;
      }
      if(t.t === "!" ) { var r2 = additive(); l = {k: "cat", a: l, b: r2}; continue; }
      break;
    }
    return l;
  }
  function additive(){ var l = mul(); while(isOp("+") || isOp("-")){ var o = nxt().v; l = {k: "bin", op: o, a: l, b: mul()}; } return l; }
  function mul(){ var l = unary(); while(isOp("*") || isOp("/") || isOp("%")){ var o = nxt().v; l = {k: "bin", op: o, a: l, b: unary()}; } return l; }
  function unary(){
    if(isT("!")){ p++; return {k: "not", a: unary()}; }
    if(isOp("-")){ p++; return {k: "neg", a: unary()}; }
    if(isOp("+")){ p++; return {k: "pos", a: unary()}; }
    return power();
  }
  function power(){ var b = postfix(); if(isOp("^")){ p++; var e = unary(); return {k: "bin", op: "^", a: b, b: e}; } return b; }
  function postfix(){
    var e = primary();
    if((e.k === "var" || e.k === "idx" || e.k === "field") && peek().t === "op" && (peek().v === "++" || peek().v === "--")){ var o = nxt().v; return {k: "post", op: o, l: e}; }
    return e;
  }
  function primary(){
    var t = nxt();
    switch(t.t){
      case "num": return {k: "num", v: t.v};
      case "str": return {k: "str", v: t.v};
      case "re": return {k: "regex", v: t.v};
      case "(": { var e = expr(); skipNlOnly(); if(isT(",")){ var lst = [e]; while(isT(",")){ p++; lst.push(expr()); } expectOp(")"); if(isT("kw", "in")){ p++; return {k: "in", i: {k: "multi", l: lst}, a: nxt().v}; } return {k: "multi", l: lst}; } expectOp(")"); return {k: "group", e: e}; }
      case "op":
        if(t.v === "$"){ var f = (peek().t === "op" && (peek().v === "++" || peek().v === "--")) ? primary() : primaryNoPost(); return {k: "field", e: f}; }
        if(t.v === "++" || t.v === "--"){ var l = primary(); return {k: "pre", op: t.v, l: l}; }
        break;
      case "fname": {
        p++; var args = []; skipNlOnly(); if(!isOp(")")) args = exprList(); expectOp(")");
        return {k: "call", n: t.v, a: args};
      }
      case "kw": if(t.v === "getline"){ var v = null; if(isT("id")) v = {k: "var", n: nxt().v}; var file = null; if(isOp("<")){ p++; file = primaryNoPost(); } return {k: "getline", v: v, f: file}; } break;
      case "id": {
        if(t.v === "length" && !isOp("[")) return {k: "call", n: "length", a: []};
        if(isOp("[")){ p++; var idx = exprList(); expectOp("]"); return {k: "idx", n: t.v, i: idx}; }
        return {k: "var", n: t.v};
      }
    }
    throw new SysErr("EINVAL", "syntax error at source line 1 near `" + (t.v !== undefined ? t.v : t.t) + "'");
  }
  function primaryNoPost(){ return primary(); }
}
var AWKFUNCS = {length: 1, substr: 1, index: 1, split: 1, sub: 1, gsub: 1, match: 1, sprintf: 1, tolower: 1, toupper: 1, int: 1, sqrt: 1, exp: 1, log: 1, sin: 1, cos: 1, atan2: 1, rand: 1, srand: 1, system: 1, close: 1, fflush: 1};
function numStr(v, convfmt){
  if(typeof v === "string") return v;
  if(Number.isInteger(v) && Math.abs(v) < 1e16) return String(v);
  if(!isFinite(v)) return v !== v ? "nan" : (v > 0 ? "inf" : "-inf");
  var s = L.fmtPrintf([convfmt || "%.6g", v]);
  return s;
}
function toNum(v){
  if(typeof v === "number") return v;
  var m = /^\s*[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?|0[xX][0-9a-fA-F]+)/.exec(v);
  return m ? Number(m[0].replace(/^\s+/, "")) : 0;
}
function looksNum(v){ return typeof v === "number" || /^\s*[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?)\s*$/.test(v); }
function awkRun(sh, io, prog, inputs, vars){
  var globals = Object.create(null), arrays = Object.create(null), fields = [""], nf = 0, outputs = {}, steps = 0, exitCode = null;
  var SPECIAL = {FS: " ", OFS: " ", ORS: "\n", RS: "\n", NR: 0, NF: 0, FNR: 0, FILENAME: "", SUBSEP: "\x1c", CONVFMT: "%.6g", RSTART: 0, RLENGTH: -1, ENVIRON: null};
  Object.keys(SPECIAL).forEach(function(k){ globals[k] = SPECIAL[k]; });
  Object.keys(vars || {}).forEach(function(k){ globals[k] = vars[k]; });
  arrays.ENVIRON = sh.env();
  function Next(){} function ExitE(){} function RetE(v){ this.v = v; } function Brk(){} function Cont(){}
  var reCache = {};
  function re(src){ if(!reCache[src]) reCache[src] = mkRe(src, true, ""); return reCache[src]; }
  function reg(src, flags){ return new RegExp(re(src).source, flags || ""); }
  function setRecord(line){ fields = [line]; var fs = String(globals.FS); var parts; if(fs === " ") parts = line.split(/[ \t\n]+/).filter(function(x){ return x !== ""; }); else if(fs.length === 1 && fs !== "\\") parts = line === "" ? [] : line.split(fs === "\t" ? "\t" : fs.replace(/^\\(.)$/, "$1")); else parts = line === "" ? [] : line.split(reg(fs)); if(fs.length === 1 && fs !== " " && line !== "") parts = line.split(fs); nf = parts.length; for(var i = 0; i < parts.length; i++) fields[i + 1] = parts[i]; globals.NF = nf; }
  function getField(i){ i = Math.trunc(i); if(i === 0) return fields[0]; if(i < 0) throw new SysErr("EINVAL", "attempt to access field " + i); return i <= nf ? fields[i] : ""; }
  function setField(i, v){ i = Math.trunc(i); v = numStr(v, globals.CONVFMT); if(i === 0){ setRecord(v); return; } while(nf < i){ fields[++nf] = ""; } fields[i] = v; globals.NF = nf; fields[0] = fields.slice(1, nf + 1).join(String(globals.OFS)); }
  function sval(v){ return typeof v === "number" ? numStr(v, globals.CONVFMT) : v; }
  function cmpVals(a, b, fromField){ if((typeof a === "number" || a.strnum) && (typeof b === "number" || b.strnum)) { return null; } return null; }
  var locals = null;
  function lookupVar(n){ if(locals && Object.prototype.hasOwnProperty.call(locals, n)) return {s: locals, n: n}; return {s: globals, n: n}; }
  function getVar(n){ var l = lookupVar(n); if(n === "NF" && !locals) return nf; var v = l.s[n]; return v === undefined ? "" : v; }
  function setVar(n, v){ var l = lookupVar(n); l.s[n] = v; if(n === "NF" && l.s === globals){ nf = Math.max(0, Math.trunc(toNum(v))); fields[0] = fields.slice(1, nf + 1).join(String(globals.OFS)); } if(n === "$0") setRecord(sval(v)); }
  function getArr(n){ if(locals && Object.prototype.hasOwnProperty.call(locals, n) && typeof locals[n] === "object" && locals[n] !== null) return locals[n]; if(locals && locals[n] === undefined && n in locals) { locals[n] = Object.create(null); return locals[n]; } return arrays[n] || (arrays[n] = Object.create(null)); }
  function key(idx){ return idx.map(function(e){ return sval(ev(e)); }).join(String(globals.SUBSEP)); }
  function toBool(v){ if(typeof v === "number") return v !== 0; if(v && v.strnum !== undefined) return v.strnum ? toNum(v.s) !== 0 : v.s !== ""; return v !== ""; }
  function ev(e){
    switch(e.k){
      case "num": return e.v; case "str": return e.v;
      case "group": return ev(e.e);
      case "regex": return re(e.v).test(fields[0]) ? 1 : 0;
      case "var": return getVar(e.n);
      case "field": { var fv = getField(toNum(ev(e.e))); return looksNum(fv) && fv !== "" ? new Number(0) && {strnum: true, s: fv, valueOf: function(){ return toNum(fv); }, toString: function(){ return fv; }} : fv; }
      case "idx": { var a = getArr(e.n), k = key(e.i); if(!(k in a)) a[k] = ""; return a[k]; }
      case "assign": {
        var rv = ev(e.r); if(rv && rv.strnum !== undefined) rv = rv.s;
        var val;
        if(e.op === "=") val = rv; else { var cur = toNum(unwrap(ev(e.l))), rn = toNum(unwrap(rv)); val = e.op === "+=" ? cur + rn : e.op === "-=" ? cur - rn : e.op === "*=" ? cur * rn : e.op === "/=" ? cur / rn : e.op === "%=" ? cur % rn : Math.pow(cur, rn); }
        assignTo(e.l, val); return val;
      }
      case "pre": { var v0 = toNum(unwrap(ev(e.l))) + (e.op === "++" ? 1 : -1); assignTo(e.l, v0); return v0; }
      case "post": { var v1 = toNum(unwrap(ev(e.l))); assignTo(e.l, v1 + (e.op === "++" ? 1 : -1)); return v1; }
      case "tern": return toBool(ev(e.c)) ? ev(e.a) : ev(e.b);
      case "or": return toBool(ev(e.a)) || toBool(ev(e.b)) ? 1 : 0;
      case "and": return toBool(ev(e.a)) && toBool(ev(e.b)) ? 1 : 0;
      case "not": return toBool(ev(e.a)) ? 0 : 1;
      case "neg": return -toNum(unwrap(ev(e.a))); case "pos": return toNum(unwrap(ev(e.a)));
      case "in": { var kk = e.i.k === "multi" ? e.i.l.map(function(x){ return sval(unwrap(ev(x))); }).join(String(globals.SUBSEP)) : sval(unwrap(ev(e.i))); return kk in getArr(e.a) ? 1 : 0; }
      case "multi": return e.l.map(function(x){ return sval(unwrap(ev(x))); }).join(String(globals.SUBSEP));
      case "cat": return sval(unwrap(ev(e.a))) + sval(unwrap(ev(e.b)));
      case "match": { var s = sval(unwrap(ev(e.a))); var rx = e.b.k === "regex" ? re(e.b.v) : re(sval(unwrap(ev(e.b)))); var mres = rx.test(s); return (mres !== e.neg) ? 1 : 0; }
      case "cmp": {
        var x = ev(e.a), y = ev(e.b), r;
        var xn = typeof x === "number" || (x && x.strnum), yn = typeof y === "number" || (y && y.strnum);
        if(xn && yn){ var nx = toNum(unwrap(x)), ny = toNum(unwrap(y)); r = nx < ny ? -1 : nx > ny ? 1 : 0; }
        else { var sx = sval(unwrap(x)), sy = sval(unwrap(y)); r = sx < sy ? -1 : sx > sy ? 1 : 0; }
        return (e.op === "<" ? r < 0 : e.op === "<=" ? r <= 0 : e.op === "==" ? r === 0 : e.op === "!=" ? r !== 0 : e.op === ">" ? r > 0 : r >= 0) ? 1 : 0;
      }
      case "bin": { var a1 = toNum(unwrap(ev(e.a))), b1 = toNum(unwrap(ev(e.b))); switch(e.op){ case "+": return a1 + b1; case "-": return a1 - b1; case "*": return a1 * b1; case "/": if(b1 === 0) throw new SysErr("EINVAL", "division by zero"); return a1 / b1; case "%": if(b1 === 0) throw new SysErr("EINVAL", "division by zero in %"); return a1 % b1; case "^": return Math.pow(a1, b1); } return 0; }
      case "getline": {
        if(e.f){ var fname = sval(unwrap(ev(e.f))); var st0 = inFiles[fname]; if(!st0){ try{ st0 = inFiles[fname] = lines(sh.fs.readFile(fname, sh.cwd, sh.user)); }catch(err){ return -1; } } if(!st0.length) return 0; var ln = st0.shift(); if(e.v) assignTo(e.v, ln); else setRecord(ln); return 1; }
        var nr = nextRecord(); if(nr === null) return 0; if(e.v) assignTo(e.v, nr); else setRecord(nr); globals.NR = toNum(globals.NR) + 1; return 1;
      }
      case "call": return call(e);
    }
    throw new Error("awk: bad expression " + e.k);
  }
  var inFiles = {};
  function unwrap(v){ return v && v.strnum !== undefined ? (v.strnum ? v.s : v.s) : v; }
  function assignTo(l, v){
    v = unwrap(v);
    if(l.k === "var") setVar(l.n, v);
    else if(l.k === "field") setField(toNum(unwrap(ev(l.e))), v);
    else if(l.k === "idx") getArr(l.n)[key(l.i)] = v;
  }
  function call(e){
    var n = e.n, a = e.a;
    if(prog.funcs[n]){
      var f = prog.funcs[n], newLocals = Object.create(null);
      f.params.forEach(function(pn, i){
        if(i < a.length){ if(a[i].k === "var" && ((locals && typeof locals[a[i].n] === "object" && locals[a[i].n] !== null && !(locals[a[i].n].strnum !== undefined)) || (!locals && arrays[a[i].n]))){ newLocals[pn] = getArr(a[i].n); } else newLocals[pn] = unwrap(ev(a[i])); }
        else newLocals[pn] = undefined;
      });
      f.params.forEach(function(pn, i){ if(i >= a.length) { newLocals[pn] = undefined; } });
      var saved = locals; locals = newLocals;
      var ret = "";
      try{ exec(f.body); }catch(x){ if(x instanceof RetE) ret = x.v; else { locals = saved; throw x; } }
      locals = saved; return ret === undefined ? "" : ret;
    }
    function A(i){ return unwrap(ev(a[i])); }
    switch(n){
      case "length": { if(!a.length) return fields[0].length; if(a[0].k === "var" && ((locals && locals[a[0].n] && typeof locals[a[0].n] === "object" && locals[a[0].n].strnum === undefined) || arrays[a[0].n])) return Object.keys(getArr(a[0].n)).length; return sval(A(0)).length; }
      case "substr": { var s = sval(A(0)), m = Math.round(toNum(A(1))), len = a.length > 2 ? Math.round(toNum(A(2))) : Infinity; var from = Math.max(m, 1), to = m + len; return s.slice(from - 1, Math.max(from - 1, to - 1)); }
      case "index": return sval(A(0)).indexOf(sval(A(1))) + 1;
      case "split": {
        var str = sval(A(0)), arr = getArr(a[1].n); Object.keys(arr).forEach(function(k){ delete arr[k]; });
        var sepv = a.length > 2 ? (a[2].k === "regex" ? {re: a[2].v} : sval(A(2))) : String(globals.FS), parts;
        if(str === "") parts = [];
        else if(sepv.re) parts = str.split(reg(sepv.re)); else if(sepv === " ") parts = str.split(/[ \t\n]+/).filter(Boolean); else if(sepv.length === 1) parts = str.split(sepv); else parts = str.split(reg(sepv));
        parts.forEach(function(x, i){ arr[String(i + 1)] = x; }); return parts.length;
      }
      case "sub": case "gsub": {
        var rxs = a[0].k === "regex" ? a[0].v : sval(A(0)), rep = sval(A(1)), target = a.length > 2 ? a[2] : {k: "field", e: {k: "num", v: 0}};
        var cur = sval(unwrap(ev(target))), cnt = 0;
        var rx = reg(rxs, n === "gsub" ? "g" : "");
        var res = cur.replace(rx, function(){ var mm = arguments[0]; cnt++; return rep.replace(/\\&|&|\\\\/g, function(x){ return x === "\\&" ? "&" : x === "\\\\" ? "\\" : mm; }); });
        if(cnt) assignTo(target, res); return cnt;
      }
      case "match": { var ms = sval(A(0)); var mm = (a[1].k === "regex" ? re(a[1].v) : re(sval(A(1)))).exec(ms); if(mm){ globals.RSTART = mm.index + 1; globals.RLENGTH = mm[0].length; return mm.index + 1; } globals.RSTART = 0; globals.RLENGTH = -1; return 0; }
      case "sprintf": return L.fmtPrintf(a.map(function(x, i){ return i === 0 ? sval(A(0)) : sval(A(i)); }).map(function(v, i){ return v; }));
      case "tolower": return sval(A(0)).toLowerCase(); case "toupper": return sval(A(0)).toUpperCase();
      case "int": return Math.trunc(toNum(A(0))); case "sqrt": return Math.sqrt(toNum(A(0))); case "exp": return Math.exp(toNum(A(0))); case "log": return Math.log(toNum(A(0)));
      case "sin": return Math.sin(toNum(A(0))); case "cos": return Math.cos(toNum(A(0))); case "atan2": return Math.atan2(toNum(A(0)), toNum(A(1)));
      case "rand": return Math.random(); case "srand": return 0;
      case "system": return 0; case "close": case "fflush": return 0;
    }
    throw new SysErr("EINVAL", "calling undefined function " + n);
  }
  function emit(s, redir){
    if(!redir){ io.out(s); return; }
    var target = sval(unwrap(ev(redir.e)));
    if(redir.k === "|"){ outputs["|" + target] = (outputs["|" + target] || "") + s; return; }
    if(target === "/dev/stderr"){ io.err(s); return; } if(target === "/dev/stdout" || target === "-"){ io.out(s); return; }
    var o = outputs[target] = outputs[target] || {buf: "", append: redir.k === ">>"};
    o.buf += s;
  }
  function exec(s){
    if(++steps > 3000000 || sh.cancelled) throw new L.Exit(-1);
    switch(s.k){
      case "block": for(var i = 0; i < s.s.length; i++) exec(s.s[i]); return;
      case "expr": ev(s.e); return;
      case "print": { var parts = s.a.length ? s.a.map(function(x){ var v = unwrap(ev(x)); return typeof v === "number" ? numStr(v, globals.OFMT || "%.6g") : v; }) : [fields[0]]; emit(parts.join(String(globals.OFS)) + String(globals.ORS), s.r); return; }
      case "printf": { var vals = s.a.map(function(x){ return unwrap(ev(x)); }); var fmt = sval(vals[0]); var rest = vals.slice(1).map(function(v){ return typeof v === "number" ? v : v; }); emit(L.fmtPrintf([fmt].concat(rest.map(function(v){ return typeof v === "number" ? String(v) : (looksNum(v) ? v : v); }))), s.r); return; }
      case "if": if(toBool(ev(s.c))) exec(s.t); else if(s.e) exec(s.e); return;
      case "while": while(toBool(ev(s.c))){ try{ exec(s.b); }catch(x){ if(x instanceof Brk) break; if(x instanceof Cont) continue; throw x; } } return;
      case "do": do { try{ exec(s.b); }catch(x){ if(x instanceof Brk) break; if(x instanceof Cont) continue; throw x; } } while(toBool(ev(s.c))); return;
      case "for": if(s.i) exec(s.i); while(!s.c || toBool(ev(s.c))){ try{ exec(s.b); }catch(x){ if(x instanceof Brk) break; if(!(x instanceof Cont)) throw x; } if(s.s) exec(s.s); } return;
      case "forin": { var arr = getArr(s.a); var ks = Object.keys(arr); for(var q = 0; q < ks.length; q++){ setVar(s.v, ks[q]); try{ exec(s.b); }catch(x){ if(x instanceof Brk) break; if(!(x instanceof Cont)) throw x; } } return; }
      case "break": throw new Brk(); case "continue": throw new Cont();
      case "next": throw new Next();
      case "exit": if(s.e) exitCode = Math.trunc(toNum(unwrap(ev(s.e)))); throw new ExitE();
      case "return": throw new RetE(s.e ? unwrap(ev(s.e)) : "");
      case "delete": { var ar = getArr(s.a); if(s.i) delete ar[key(s.i)]; else Object.keys(ar).forEach(function(k){ delete ar[k]; }); return; }
    }
  }
  // input handling
  var cur = {i: 0, lines: null, text: ""};
  var fileIdx = 0, pending = [];
  function nextRecord(){
    for(;;){
      if(pending.length) return pending.shift();
      if(fileIdx >= inputs.length) return null;
      var inp = inputs[fileIdx++];
      globals.FILENAME = inp.name === "-" ? "" : inp.name; globals.FNR = 0;
      var rs = String(globals.RS);
      var text = inp.text;
      if(rs === "\n") pending = lines(text); else if(rs === "") pending = text.split(/\n\n+/).map(function(x){ return x.replace(/\n+$/, ""); }).filter(Boolean); else pending = text.split(rs).filter(function(x, i, arr){ return x !== "" || i < arr.length - 1; });
    }
  }
  var rangeOn = new Array(prog.rules.length).fill(false);
  var fin = false;
  try{
    try{
      prog.begin.forEach(function(b){ exec(b); });
      if(prog.rules.length || prog.end.length){
        for(var rec = nextRecord(); rec !== null; rec = nextRecord()){
          globals.NR = toNum(globals.NR) + 1; globals.FNR = toNum(globals.FNR) + 1; setRecord(rec);
          try{
            for(var ri = 0; ri < prog.rules.length; ri++){
              var rule = prog.rules[ri], hit;
              if(!rule.pat) hit = true;
              else if(rule.pat2){
                if(rangeOn[ri]){ hit = true; if(toBool(ev(rule.pat2))) rangeOn[ri] = false; }
                else if(toBool(ev(rule.pat))){ hit = true; if(!toBool(ev(rule.pat2))) rangeOn[ri] = true; } else hit = false;
              } else hit = toBool(ev(rule.pat));
              if(!hit) continue;
              if(rule.act) exec(rule.act); else io.out(fields[0] + String(globals.ORS));
            }
          }catch(x){ if(!(x instanceof Next)) throw x; }
        }
      }
    }catch(x){ if(!(x instanceof ExitE)) throw x; fin = true; }
    try{ prog.end.forEach(function(b){ exec(b); }); }catch(x){ if(!(x instanceof ExitE)) throw x; }
  } finally {
    Object.keys(outputs).forEach(function(k){ if(k.charAt(0) === "|"){ /* piping to commands is not emulated; show the text */ io.out(outputs[k]); return; } try{ sh.fs.writeFile(k, outputs[k].buf, sh.cwd, sh.user, outputs[k].append, sh.umask); }catch(e){} });
  }
  return exitCode || 0;
}
C.awk = C.gawk = C.mawk = function(args, io){
  var sh = this, vars = {}, fs = null, progText = null, files = [];
  for(var i = 0; i < args.length; i++){
    var a = args[i];
    if(a === "-F"){ fs = args[++i]; }
    else if(a.indexOf("-F") === 0 && a.length > 2){ fs = a.slice(2); }
    else if(a === "-v"){ var kv = args[++i], eq = kv.indexOf("="); vars[kv.slice(0, eq)] = kv.slice(eq + 1).replace(/\\n/g, "\n").replace(/\\t/g, "\t"); }
    else if(a === "-f"){ try{ progText = (progText || "") + sh.fs.readFile(args[++i], sh.cwd, sh.user) + "\n"; }catch(e){ io.err("awk: can't open file " + args[i] + "\n"); return 2; } }
    else if(a === "--"){ continue; }
    else if(progText === null && a.charAt(0) !== "-"){ progText = a; }
    else if(a.charAt(0) === "-" && a.length > 1 && !files.length && progText === null) {}
    else files.push(a);
  }
  if(progText === null){ io.err("usage: awk [-F fs][-v var=value][prog | -f progfile][file ...]\n"); return 2; }
  if(fs !== null){ vars.FS = fs === "t" ? "\t" : fs.replace(/\\t/g, "\t"); }
  var prog;
  try{ prog = awkParse(progText); }catch(e){ if(e instanceof SysErr){ io.err("awk: " + e.extra + "\n"); return 2; } throw e; }
  var inputs = [], st = 0;
  var assigns = [];
  if(!files.length) inputs.push({name: "-", text: io.in || ""});
  else files.forEach(function(f){
    var m = /^([A-Za-z_]\w*)=(.*)$/.exec(f);
    if(m){ vars[m[1]] = m[2]; return; }
    try{ inputs.push({name: f, text: f === "-" ? (io.in || "") : sh.fs.readFile(f, sh.cwd, sh.user)}); }catch(e){ if(e instanceof SysErr){ io.err("awk: cannot open " + f + " (" + e.message + ")\n"); st = 2; } else throw e; }
  });
  try{ var r = awkRun(sh, io, prog, inputs, vars); return r || st; }
  catch(e){ if(e instanceof SysErr){ io.err("awk: " + (e.extra || e.message) + "\n"); return 2; } throw e; }
};
