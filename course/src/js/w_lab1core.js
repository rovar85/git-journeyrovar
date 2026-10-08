/* In-browser lab, part 1: virtual filesystem, shell language (parser, expansion, execution).
   No DOM and no eval in here, so it also runs under Node for the conformance tests.
   Other parts (w_labcmds.js, w_labtext.js) register commands through window.LabParts. */

var L = window.LabCore = {};
L.parts = window.LabParts = window.LabParts || [];

/* ---------------------------------------------------------------- errors */
var ERRMSG = {PARAM: "", ENOENT: "No such file or directory", EACCES: "Permission denied", EEXIST: "File exists", ENOTDIR: "Not a directory",
  EISDIR: "Is a directory", ENOTEMPTY: "Directory not empty", EINVAL: "Invalid argument", EPERM: "Operation not permitted", ELOOP: "Too many levels of symbolic links", EXDEV: "Invalid cross-device link"};
function SysErr(code, extra){ this.code = code; this.message = ERRMSG[code] || code; this.extra = extra; }
SysErr.prototype = Object.create(Error.prototype);
L.SysErr = SysErr;
function Exit(code){ this.code = code; }
function Ctl(kind, n){ this.kind = kind; this.n = n || 1; }     // break / continue / return
L.Exit = Exit; L.Ctl = Ctl; L._Ctl = Ctl;

/* ------------------------------------------------------------ filesystem */
function FS(){
  this.ino = 1; this.clock = Date.now();
  this.root = this.mk("d", 493, 0, 0);
}
FS.prototype.mk = function(t, mode, uid, gid){
  return {t: t, mode: mode, uid: uid, gid: gid, mtime: this.clock, ino: this.ino++, nlink: t === "d" ? 2 : 1, data: "", kids: t === "d" ? new Map() : null, target: ""};
};
FS.prototype.tick = function(){ this.clock = Math.max(this.clock, Date.now()); return this.clock; };
FS.prototype.norm = function(path, cwd){
  var abs = path.charAt(0) === "/" ? path : (cwd === "/" ? "/" : cwd + "/") + path;
  var out = [], parts = abs.split("/");
  for(var i = 0; i < parts.length; i++){
    var p = parts[i];
    if(p === "" || p === ".") continue;
    if(p === "..") out.pop(); else out.push(p);
  }
  return "/" + out.join("/");
};
/* who: {uid, gid, groups}. Walk the path; follow symlinks except possibly the last one. */
FS.prototype.can = function(node, who, bit){
  if(who.uid === 0){ return bit !== 1 || node.t === "d" || (node.mode & 73) !== 0; }
  var m = node.mode;
  if(node.uid === who.uid) return ((m >> 6) & bit) !== 0;
  if(node.gid === who.gid || (who.groups && who.groups.indexOf(node.gid) >= 0)) return ((m >> 3) & bit) !== 0;
  return (m & bit) !== 0;
};
FS.prototype.lookup = function(path, cwd, who, followLast, depth){
  depth = depth || 0;
  if(depth > 20) throw new SysErr("ELOOP");
  var abs = this.norm(path, cwd), parts = abs.split("/").filter(Boolean);
  var node = this.root, cur = "/", parent = null, name = "";
  for(var i = 0; i < parts.length; i++){
    if(node.t !== "d") throw new SysErr("ENOTDIR");
    if(who && !this.can(node, who, 1)) throw new SysErr("EACCES");
    var kid = node.kids.get(parts[i]);
    parent = node; name = parts[i];
    if(!kid){
      if(i < parts.length - 1) throw new SysErr("ENOENT");
      return {node: null, parent: parent, name: name, path: abs};
    }
    if(kid.t === "l" && (i < parts.length - 1 || followLast)){
      var tgt = kid.target.charAt(0) === "/" ? kid.target : cur + "/" + kid.target;
      var rest = parts.slice(i + 1).join("/");
      return this.lookup(rest ? tgt + "/" + rest : tgt, "/", who, followLast, depth + 1);
    }
    node = kid; cur = cur === "/" ? "/" + parts[i] : cur + "/" + parts[i];
  }
  return {node: node, parent: parent, name: name, path: abs};
};
FS.prototype.get = function(path, cwd, who, followLast){
  var r = this.lookup(path, cwd, who, followLast !== false);
  if(!r.node) throw new SysErr("ENOENT");
  return r.node;
};
FS.prototype.exists = function(path, cwd, who){ try{ return !!this.lookup(path, cwd, who, true).node; }catch(e){ return false; } };
FS.prototype.readFile = function(path, cwd, who){
  var n = this.get(path, cwd, who, true);
  if(n.t === "d") throw new SysErr("EISDIR");
  if(who && !this.can(n, who, 4)) throw new SysErr("EACCES");
  return n.data;
};
FS.prototype.writeFile = function(path, data, cwd, who, append, umask, mode){
  var r = this.lookup(path, cwd, who, true);
  if(r.node){
    if(r.node.t === "d") throw new SysErr("EISDIR");
    if(who && !this.can(r.node, who, 2)) throw new SysErr("EACCES");
    r.node.data = append ? r.node.data + data : data; r.node.mtime = this.tick();
    return r.node;
  }
  if(!r.parent) throw new SysErr("ENOENT");
  if(who && !this.can(r.parent, who, 2)) throw new SysErr("EACCES");
  var m = (mode === undefined ? 438 : mode) & ~(umask === undefined ? 18 : umask);
  var n = this.mk("f", m, who ? who.uid : 0, (r.parent.mode & 1024) ? r.parent.gid : (who ? who.gid : 0));
  n.data = data; n.mtime = this.tick();
  r.parent.kids.set(r.name, n); r.parent.mtime = this.tick();
  return n;
};
FS.prototype.mkdir = function(path, cwd, who, mode, umask){
  var r = this.lookup(path, cwd, who, false);
  if(r.node) throw new SysErr("EEXIST");
  if(!r.parent) throw new SysErr("EEXIST");
  if(who && !this.can(r.parent, who, 2)) throw new SysErr("EACCES");
  var n = this.mk("d", (mode === undefined ? 511 : mode) & ~(umask === undefined ? 18 : umask), who ? who.uid : 0, who ? who.gid : 0);
  if(r.parent.mode & 1024){ n.gid = r.parent.gid; n.mode |= 1024; }
  r.parent.kids.set(r.name, n); r.parent.nlink++; r.parent.mtime = this.tick();
  return n;
};
FS.prototype.mkdirp = function(path, cwd, who, umask){
  var abs = this.norm(path, cwd), parts = abs.split("/").filter(Boolean), cur = "";
  for(var i = 0; i < parts.length; i++){
    cur += "/" + parts[i];
    var r = this.lookup(cur, "/", who, true);
    if(!r.node) this.mkdir(cur, "/", who, 511, umask);
    else if(r.node.t !== "d") throw new SysErr("ENOTDIR");
  }
};
FS.prototype.unlink = function(path, cwd, who){
  var r = this.lookup(path, cwd, who, false);
  if(!r.node) throw new SysErr("ENOENT");
  if(r.node.t === "d") throw new SysErr("EISDIR");
  this.checkSticky(r.parent, r.node, who);
  if(who && !this.can(r.parent, who, 2)) throw new SysErr("EACCES");
  r.parent.kids.delete(r.name); r.node.nlink--; r.parent.mtime = this.tick();
};
FS.prototype.checkSticky = function(parent, node, who){
  if(who && who.uid !== 0 && (parent.mode & 512) && parent.uid !== who.uid && node.uid !== who.uid) throw new SysErr("EPERM");
};
FS.prototype.rmdir = function(path, cwd, who){
  var r = this.lookup(path, cwd, who, false);
  if(!r.node) throw new SysErr("ENOENT");
  if(r.node.t !== "d") throw new SysErr("ENOTDIR");
  if(r.node.kids.size) throw new SysErr("ENOTEMPTY");
  if(!r.parent) throw new SysErr("EPERM");
  if(who && !this.can(r.parent, who, 2)) throw new SysErr("EACCES");
  r.parent.kids.delete(r.name); r.parent.nlink--; r.parent.mtime = this.tick();
};
FS.prototype.rename = function(from, to, cwd, who){
  var a = this.lookup(from, cwd, who, false);
  if(!a.node) throw new SysErr("ENOENT");
  var b = this.lookup(to, cwd, who, false);
  if(!b.parent) throw new SysErr("EINVAL");
  if(who && (!this.can(a.parent, who, 2) || !this.can(b.parent, who, 2))) throw new SysErr("EACCES");
  this.checkSticky(a.parent, a.node, who);
  if(b.node){
    if(b.node.t === "d" && a.node.t !== "d") throw new SysErr("EISDIR");
    if(b.node.t === "d" && b.node.kids.size) throw new SysErr("ENOTEMPTY");
    if(b.node.t === "d") b.parent.nlink--;
  }
  if((b.path + "/").indexOf(a.path + "/") === 0) throw new SysErr("EINVAL");
  a.parent.kids.delete(a.name);
  if(a.node.t === "d"){ a.parent.nlink--; b.parent.nlink++; }
  b.parent.kids.set(b.name, a.node); a.parent.mtime = b.parent.mtime = this.tick();
};
FS.prototype.clone = function(node, who){
  var n = this.mk(node.t, node.mode, who ? who.uid : node.uid, who ? who.gid : node.gid);
  n.data = node.data; n.target = node.target; n.mtime = this.tick();
  if(node.t === "d") node.kids.forEach(function(v, k){ n.kids.set(k, this.clone(v, who)); n.nlink += v.t === "d" ? 1 : 0; }, this);
  return n;
};
FS.prototype.symlink = function(target, path, cwd, who){
  var r = this.lookup(path, cwd, who, false);
  if(r.node) throw new SysErr("EEXIST");
  if(who && !this.can(r.parent, who, 2)) throw new SysErr("EACCES");
  var n = this.mk("l", 511, who ? who.uid : 0, who ? who.gid : 0); n.target = target;
  r.parent.kids.set(r.name, n);
};
FS.prototype.link = function(target, path, cwd, who){
  var a = this.get(target, cwd, who, true), r = this.lookup(path, cwd, who, false);
  if(r.node) throw new SysErr("EEXIST");
  if(a.t === "d") throw new SysErr("EPERM");
  if(who && !this.can(r.parent, who, 2)) throw new SysErr("EACCES");
  a.nlink++; r.parent.kids.set(r.name, a);
};
FS.prototype.walk = function(path, cwd, fn, who){
  var base = this.lookup(path, cwd, who, true);
  if(!base.node) throw new SysErr("ENOENT");
  var self = this;
  (function rec(node, p){
    fn(node, p);
    if(node.t === "d"){
      if(who && !self.can(node, who, 5)) return;
      Array.from(node.kids.keys()).sort().forEach(function(k){ rec(node.kids.get(k), p === "/" ? "/" + k : p + "/" + k); });
    }
  })(base.node, base.path);
};
FS.prototype.toJSON = function(){
  function enc(n){
    var o = {t: n.t, m: n.mode, u: n.uid, g: n.gid, mt: n.mtime};
    if(n.t === "f") o.d = n.data; else if(n.t === "l") o.l = n.target;
    else { o.k = {}; n.kids.forEach(function(v, k){ o.k[k] = enc(v); }); }
    return o;
  }
  return enc(this.root);
};
FS.fromJSON = function(j){
  var fs = new FS();
  function dec(o){
    var n = fs.mk(o.t, o.m, o.u, o.g); n.mtime = o.mt;
    if(o.t === "f") n.data = o.d; else if(o.t === "l") n.target = o.l;
    else for(var k in o.k){ var c = dec(o.k[k]); n.kids.set(k, c); if(c.t === "d") n.nlink++; }
    return n;
  }
  fs.root = dec(j); return fs;
};
L.FS = FS;

/* ------------------------------------------------------------- glob/regex helpers */
function globToRegex(pat, opts){
  var re = "", i = 0, n = pat.length;
  while(i < n){
    var c = pat.charAt(i);
    if(c === "\\" && i + 1 < n){ re += escRe(pat.charAt(i + 1)); i += 2; continue; }
    if(c === "*"){ re += "[^/]*"; i++; continue; }
    if(c === "?"){ re += "[^/]"; i++; continue; }
    if(c === "["){
      var j = i + 1, neg = false;
      if(pat.charAt(j) === "!" || pat.charAt(j) === "^"){ neg = true; j++; }
      var cls = "";
      if(pat.charAt(j) === "]"){ cls += "\\]"; j++; }
      while(j < n && pat.charAt(j) !== "]"){
        if(pat.charAt(j) === "[" && pat.charAt(j + 1) === ":"){
          var e = pat.indexOf(":]", j); var nm = pat.slice(j + 2, e); cls += posixClass(nm); j = e + 2; continue;
        }
        cls += pat.charAt(j) === "\\" ? "\\\\" : pat.charAt(j); j++;
      }
      if(j >= n){ re += "\\["; i++; continue; }
      re += "[" + (neg ? "^" : "") + cls + "]"; i = j + 1; continue;
    }
    re += escRe(c); i++;
  }
  return re;
}
function escRe(c){ return /[.*+?^${}()|[\]\\\/-]/.test(c) ? "\\" + c : c; }
function posixClass(nm){
  return {alpha: "A-Za-z", digit: "0-9", alnum: "A-Za-z0-9", upper: "A-Z", lower: "a-z", space: " \\t\\n\\r\\f\\v", blank: " \\t", punct: "!-\\/:-@\\[-`{-~", xdigit: "0-9A-Fa-f", word: "A-Za-z0-9_", print: " -~", cntrl: "\\x00-\\x1f"}[nm] || "";
}
L.globToRegex = globToRegex; L.posixClass = posixClass; L.escRe = escRe;

/* ------------------------------------------------------------- tokenizer */
var OPS = ["<<<", "&>>", "<<-", ";;", "&&", "||", ">>", "<<", ">&", "<&", ">|", "&>", "|", "&", ";", "(", ")", "<", ">"];
var RESERVED = {"if": 1, "then": 1, "elif": 1, "else": 1, "fi": 1, "for": 1, "in": 1, "do": 1, "done": 1, "while": 1, "until": 1, "case": 1, "esac": 1, "function": 1, "{": 1, "}": 1, "!": 1, "[[": 1, "]]": 1, "time": 1};

function Syntax(msg){ this.message = msg; }
Syntax.prototype = Object.create(Error.prototype);

function tokenize(src){
  var toks = [], i = 0, n = src.length, pending = [];
  function readHeredocs(){
    for(var h = 0; h < pending.length; h++){
      var p = pending[h], lines = [], found = false;
      while(i < n){
        var e = src.indexOf("\n", i); if(e < 0) e = n;
        var line = src.slice(i, e); i = Math.min(e + 1, n);
        var cmp = p.strip ? line.replace(/^\t+/, "") : line;
        if(cmp === p.delim){ found = true; break; }
        lines.push(p.strip ? line.replace(/^\t+/, "") : line);
      }
      if(!found) toks.openHeredoc = true;
      p.tok.body = lines.length ? lines.join("\n") + "\n" : "";
    }
    pending = [];
  }
  function readBalanced(open, close){        // at src[i] === open; returns text including delimiters
    var depth = 0, start = i;
    while(i < n){
      var c = src.charAt(i);
      if(c === "\\"){ i += 2; continue; }
      if(c === "'" && open !== "`"){ var q = src.indexOf("'", i + 1); i = q < 0 ? n : q + 1; continue; }
      if(c === '"' && open !== "`"){ i++; while(i < n && src.charAt(i) !== '"'){ if(src.charAt(i) === "\\") i++; i++; } i++; continue; }
      if(c === open && open !== close) depth++;
      else if(c === close){ depth--; if(depth <= 0 || open === close){ i++; if(open === close && depth > -1 && false){} break; } }
      i++;
    }
    return src.slice(start, i);
  }
  function readWord(){
    var start = i;
    while(i < n){
      var c = src.charAt(i);
      if(c === "\\"){ if(src.charAt(i + 1) === "\n"){ i += 2; continue; } i += 2; continue; }
      if(c === "'"){ var q = src.indexOf("'", i + 1); if(q < 0) throw new Syntax("unexpected EOF while looking for matching `''"); i = q + 1; continue; }
      if(c === '"'){
        i++;
        while(i < n && src.charAt(i) !== '"'){
          var d = src.charAt(i);
          if(d === "\\"){ i += 2; continue; }
          if(d === "$" && src.charAt(i + 1) === "("){ i++; readBalanced("(", ")"); continue; }
          if(d === "$" && src.charAt(i + 1) === "{"){ i++; readBalanced("{", "}"); continue; }
          if(d === "`"){ readBalanced("`", "`"); continue; }
          i++;
        }
        if(i >= n) throw new Syntax("unexpected EOF while looking for matching `\"'");
        i++; continue;
      }
      if(c === "$" && src.charAt(i + 1) === "("){ i++; readBalanced("(", ")"); continue; }
      if(c === "$" && src.charAt(i + 1) === "{"){ i++; readBalanced("{", "}"); continue; }
      if(c === "`"){ readBalanced("`", "`"); continue; }
      if(c === "<" && src.charAt(i + 1) === "(" && false){}
      if(/[ \t\n|&;<>()]/.test(c)) break;
      i++;
    }
    return src.slice(start, i);
  }
  while(i < n){
    var c = src.charAt(i);
    if(c === " " || c === "\t"){ i++; continue; }
    if(c === "\\" && src.charAt(i + 1) === "\n"){ i += 2; continue; }
    if(c === "#"){ while(i < n && src.charAt(i) !== "\n") i++; continue; }
    if(c === "\n"){ toks.push({t: "nl"}); i++; if(pending.length) readHeredocs(); continue; }
    var op = null;
    for(var k = 0; k < OPS.length; k++){ if(src.substr(i, OPS[k].length) === OPS[k]){ op = OPS[k]; break; } }
    if(op){
      i += op.length;
      var tok = {t: "op", v: op};
      toks.push(tok);
      if(op === "<<" || op === "<<-"){
        while(src.charAt(i) === " " || src.charAt(i) === "\t") i++;
        var w = readWord();
        var quoted = /['"\\]/.test(w);
        var delim = w.replace(/['"\\]/g, "");
        var ht = {t: "word", v: w, heredoc: true, delim: delim, quotedDelim: quoted, body: ""};
        toks.push(ht); pending.push({tok: ht, delim: delim, strip: op === "<<-"});
      }
      continue;
    }
    var w2 = readWord();
    if(/^\d+$/.test(w2) && (src.charAt(i) === ">" || src.charAt(i) === "<")){ toks.push({t: "fd", v: Number(w2)}); continue; }
    toks.push({t: "word", v: w2});
  }
  if(pending.length) readHeredocs();
  toks.push({t: "eof"});
  return toks;
}
L.tokenize = tokenize;

/* ------------------------------------------------------------- parser */
function Parser(toks){ this.toks = toks; this.p = 0; }
Parser.prototype.peek = function(){ return this.toks[this.p]; };
Parser.prototype.next = function(){ return this.toks[this.p++]; };
Parser.prototype.isOp = function(v){ var t = this.peek(); return t.t === "op" && t.v === v; };
Parser.prototype.isWord = function(v){ var t = this.peek(); return t.t === "word" && t.v === v && !t.quotedRes; };
Parser.prototype.skipNl = function(){ while(this.peek().t === "nl" || this.isOp(";")) this.p++; };
Parser.prototype.skipNlOnly = function(){ while(this.peek().t === "nl") this.p++; };
Parser.prototype.parseProgram = function(){
  var list = this.parseList(null);
  if(this.peek().t !== "eof") throw new Syntax("syntax error near unexpected token `" + this.tokText(this.peek()) + "'");
  return list;
};
Parser.prototype.tokText = function(t){ return t.t === "op" ? t.v : t.t === "word" ? t.v : t.t === "nl" ? "newline" : "end of file"; };
var ENDERS = {"then": 1, "elif": 1, "else": 1, "fi": 1, "done": 1, "esac": 1, "do": 1, "}": 1, "]]": 1};
Parser.prototype.atEnd = function(){
  var t = this.peek();
  if(t.t === "eof") return true;
  if(t.t === "op" && (t.v === ")" || t.v === ";;")) return true;
  if(t.t === "word" && ENDERS[t.v]) return true;
  return false;
};
Parser.prototype.parseList = function(){
  var items = [];
  this.skipNl();
  while(!this.atEnd()){
    var pl = this.parseAndOr(), op = ";";
    if(this.isOp("&")){ this.p++; op = "&"; }
    else if(this.isOp(";") || this.peek().t === "nl"){ this.p++; }
    items.push({node: pl, op: op});
    this.skipNl();
  }
  return {type: "list", items: items};
};
Parser.prototype.parseAndOr = function(){
  var first = this.parsePipeline(), rest = [];
  for(;;){
    var op = this.isOp("&&") ? "&&" : this.isOp("||") ? "||" : null;
    if(!op) break;
    this.p++; this.skipNlOnly();
    rest.push({op: op, node: this.parsePipeline()});
  }
  return rest.length ? {type: "andor", first: first, rest: rest} : first;
};
Parser.prototype.parsePipeline = function(){
  var neg = false, timed = false;
  while(this.isWord("!") || this.isWord("time")){ if(this.next().v === "!") neg = !neg; else timed = true; }
  var cmds = [this.parseCommand()];
  while(this.isOp("|")){ this.p++; this.skipNlOnly(); cmds.push(this.parseCommand()); }
  return {type: "pipeline", cmds: cmds, neg: neg, timed: timed};
};
Parser.prototype.parseRedirs = function(into){
  for(;;){
    var t = this.peek(), fd = null;
    if(t.t === "fd"){ fd = t.v; this.p++; t = this.peek(); }
    if(t.t === "op" && /^(<|>|>>|<<|<<-|<<<|>&|<&|>\||&>|&>>)$/.test(t.v)){
      this.p++;
      var target = this.next();
      if(target.t !== "word") throw new Syntax("syntax error near unexpected token `" + this.tokText(target) + "'");
      var r = {op: t.v, fd: fd, word: target.v};
      if(target.heredoc){ r.body = target.body; r.quoted = target.quotedDelim; }
      into.push(r);
    } else break;
  }
};
Parser.prototype.parseCommand = function(){
  var t = this.peek(), redirs = [], node;
  if(t.t === "op" && t.v === "("){
    this.p++;
    var body = this.parseList();
    if(!this.isOp(")")) throw new Syntax("syntax error: expected `)'");
    this.p++;
    node = {type: "subshell", body: body};
  } else if(t.t === "word" && !t.heredoc){
    var w = t.v;
    if(w === "if"){ node = this.parseIf(); }
    else if(w === "for"){ node = this.parseFor(); }
    else if(w === "while" || w === "until"){ node = this.parseWhile(); }
    else if(w === "case"){ node = this.parseCase(); }
    else if(w === "{"){ this.p++; var b2 = this.parseList(); if(!this.isWord("}")) throw new Syntax("syntax error: expected `}'"); this.p++; node = {type: "group", body: b2}; }
    else if(w === "function"){ node = this.parseFunction(true); }
    else if(w === "[["){ node = this.parseDbl(); }
    else if(ENDERS[w] && w !== "]]"){ throw new Syntax("syntax error near unexpected token `" + w + "'"); }
    else if(this.toks[this.p + 1].t === "op" && this.toks[this.p + 1].v === "(" && this.toks[this.p + 2].t === "op" && this.toks[this.p + 2].v === ")" && /^[A-Za-z_][\w-]*$/.test(w)){ node = this.parseFunction(false); }
    else node = this.parseSimple();
  } else if(t.t === "op" || t.t === "eof" || t.t === "nl"){
    throw new Syntax("syntax error near unexpected token `" + this.tokText(t) + "'");
  } else node = this.parseSimple();
  if(node.type !== "simple"){ this.parseRedirs(redirs); node.redirs = redirs; }
  return node;
};
Parser.prototype.parseFunction = function(kw){
  var name;
  if(kw){ this.p++; name = this.next().v; if(this.isOp("(")){ this.p++; if(this.isOp(")")) this.p++; } }
  else { name = this.next().v; this.p += 2; }
  this.skipNlOnly();
  var body = this.parseCommand();
  return {type: "func", name: name, body: body};
};
Parser.prototype.parseIf = function(){
  this.p++;
  var clauses = [], els = null;
  var cond = this.parseList(); this.expectWord("then");
  var body = this.parseList(); clauses.push({cond: cond, body: body});
  for(;;){
    if(this.isWord("elif")){ this.p++; var c2 = this.parseList(); this.expectWord("then"); clauses.push({cond: c2, body: this.parseList()}); }
    else if(this.isWord("else")){ this.p++; els = this.parseList(); }
    else break;
  }
  this.expectWord("fi");
  return {type: "if", clauses: clauses, els: els};
};
Parser.prototype.expectWord = function(w){
  this.skipNl();
  if(!this.isWord(w)) throw new Syntax("syntax error: expected `" + w + "' near `" + this.tokText(this.peek()) + "'");
  this.p++;
};
Parser.prototype.parseFor = function(){
  this.p++;
  if(this.isOp("(")){                         // for ((init; cond; step))
    this.p++; if(!this.isOp("(")) throw new Syntax("syntax error near for");
    this.p++;
    var parts = [], cur = "", depth = 0;
    for(;;){
      var t = this.next();
      if(t.t === "eof") throw new Syntax("syntax error in for ((...))");
      if(t.t === "op" && t.v === ")" && depth === 0){ if(this.isOp(")")){ this.p++; break; } }
      var txt = t.t === "op" ? t.v : t.t === "word" ? t.v : t.t === "nl" ? " " : "";
      if(t.t === "op" && t.v === ";" ){ parts.push(cur); cur = ""; continue; }
      cur += (cur ? " " : "") + txt;
    }
    parts.push(cur);
    this.skipNl(); this.expectWord("do");
    var b = this.parseList(); this.expectWord("done");
    return {type: "cfor", init: parts[0] || "", cond: parts[1] || "", step: parts[2] || "", body: b};
  }
  var name = this.next().v, words = null;
  this.skipNlOnly();
  if(this.isWord("in")){
    this.p++; words = [];
    while(this.peek().t === "word" && !this.isWord("do")) words.push(this.next().v);
  }
  this.skipNl(); this.expectWord("do");
  var body = this.parseList(); this.expectWord("done");
  return {type: "for", name: name, words: words, body: body};
};
Parser.prototype.parseWhile = function(){
  var until = this.next().v === "until";
  var cond = this.parseList(); this.expectWord("do");
  var body = this.parseList(); this.expectWord("done");
  return {type: "while", cond: cond, body: body, until: until};
};
Parser.prototype.parseCase = function(){
  this.p++;
  var word = this.next().v; this.skipNl(); this.expectWord("in"); this.skipNl();
  var clauses = [];
  while(!this.isWord("esac")){
    if(this.isOp("(")) this.p++;
    var pats = [];
    for(;;){ var t = this.next(); if(t.t !== "word") throw new Syntax("syntax error in case pattern"); pats.push(t.v); if(this.isOp("|")){ this.p++; continue; } break; }
    if(!this.isOp(")")) throw new Syntax("syntax error: expected `)' in case");
    this.p++;
    var body = this.parseList();
    clauses.push({pats: pats, body: body});
    if(this.isOp(";;")) this.p++;
    this.skipNl();
  }
  this.p++;
  return {type: "case", word: word, clauses: clauses};
};
Parser.prototype.parseDbl = function(){
  this.p++;
  var words = [];
  while(!(this.peek().t === "word" && this.peek().v === "]]")){
    var t = this.next();
    if(t.t === "eof") throw new Syntax("unexpected EOF while looking for `]]'");
    if(t.t === "op") words.push({v: t.v, op: true}); else if(t.t === "word") words.push({v: t.v});
  }
  this.p++;
  return {type: "dbl", words: words};
};
Parser.prototype.parseSimple = function(){
  var assigns = [], words = [], redirs = [];
  for(;;){
    var t = this.peek();
    if(t.t === "fd" || (t.t === "op" && /^(<|>|>>|<<|<<-|<<<|>&|<&|>\||&>|&>>)$/.test(t.v))){ this.parseRedirs(redirs); continue; }
    if(t.t !== "word") break;
    if(!words.length && /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/.test(t.v) && !t.heredoc){
      this.p++;
      var v = t.v;
      var eq = v.indexOf("=");
      var rhs = v.slice(eq + 1);
      if(rhs === "" && this.isOp("(") && this.toks[this.p].t === "op"){          // array assignment a=(x y z)
        this.p++; var items = [];
        while(!this.isOp(")")){ var w = this.next(); if(w.t === "eof") throw new Syntax("syntax error in array assignment"); if(w.t === "word") items.push(w.v); }
        this.p++;
        assigns.push({name: v.slice(0, eq).replace(/\+$/, ""), append: /\+=/.test(v.slice(0, eq + 1)), array: items});
      } else assigns.push({name: v.slice(0, eq).replace(/\+$/, ""), append: /\+$/.test(v.slice(0, eq)), value: rhs});
      continue;
    }
    if(!words.length && ENDERS[t.v] && t.v !== "]]" ) break;
    words.push(t.v); this.p++;
  }
  if(!assigns.length && !words.length && !redirs.length) throw new Syntax("syntax error near unexpected token `" + this.tokText(this.peek()) + "'");
  return {type: "simple", assigns: assigns, words: words, redirs: redirs};
};
L.parse = function(src){ return new Parser(tokenize(src)).parseProgram(); };
/* true when the text is a valid start of a command that needs more lines (open quote, if without fi, heredoc without its end) */
L.incomplete = function(src){
  var toks;
  try{ toks = tokenize(src); }catch(e){ return e instanceof Syntax && /EOF/.test(e.message); }
  if(toks.openHeredoc) return true;
  var p = new Parser(toks);
  try{ p.parseProgram(); return false; }catch(e){ return e instanceof Syntax && p.peek().t === "eof"; }
};
L.Syntax = Syntax;

/* ------------------------------------------------------------- arithmetic */
function arith(expr, getVar, setVar){
  var s = expr, i = 0;
  function ws(){ while(i < s.length && /\s/.test(s.charAt(i))) i++; }
  function num(){
    ws();
    var m = /^(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*)/.exec(s.slice(i));
    if(m){ i += m[0].length; return /^0[xX]/.test(m[0]) ? parseInt(m[0], 16) : /^0[0-7]+$/.test(m[0]) ? parseInt(m[0], 8) : parseInt(m[0], 10); }
    return null;
  }
  function ident(){ ws(); var m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)); if(m){ i += m[0].length; return m[0]; } return null; }
  function toNum(v){ if(typeof v === "number") return v; var n = Number(v); return isNaN(n) ? 0 : Math.trunc(n); }
  function primary(){
    ws();
    var c = s.charAt(i);
    if(c === "("){ i++; var v = comma(); ws(); if(s.charAt(i) !== ")") throw new Error("syntax error: operand expected"); i++; return {v: v}; }
    if(c === "-"){ i++; return {v: -toNum(unary().v)}; }
    if(c === "+"){ i++; return {v: toNum(unary().v)}; }
    if(c === "!"){ i++; return {v: toNum(unary().v) ? 0 : 1}; }
    if(c === "~"){ i++; return {v: ~toNum(unary().v)}; }
    if(c === "$"){ i++; var nm = ident() || (function(){ var m = /^\d+|^[#?]/.exec(s.slice(i)); if(m){ i += m[0].length; return m[0]; } return ""; })(); return {v: toNum(getVar(nm))}; }
    var n = num(); if(n !== null) return {v: n};
    var id = ident();
    if(id){
      if(s.substr(i, 2) === "++" ){ i += 2; var o = toNum(getVar(id)); setVar(id, o + 1); return {v: o}; }
      if(s.substr(i, 2) === "--" ){ i += 2; var o2 = toNum(getVar(id)); setVar(id, o2 - 1); return {v: o2}; }
      return {v: toNum(getVar(id)), id: id};
    }
    if(s.substr(i, 2) === "++" || s.substr(i, 2) === "--"){ var d = s.substr(i, 2) === "++" ? 1 : -1; i += 2; var nm2 = ident(); var nv = toNum(getVar(nm2)) + d; setVar(nm2, nv); return {v: nv}; }
    throw new Error("syntax error: operand expected (error token is \"" + s.slice(i) + "\")");
  }
  function unary(){ return primary(); }
  var BIN = [["**"], ["*", "/", "%"], ["+", "-"], ["<<", ">>"], ["<=", ">=", "<", ">"], ["==", "!="], ["&"], ["^"], ["|"], ["&&"], ["||"]];
  function pow(){ var l = unary(); ws(); if(s.substr(i, 2) === "**"){ i += 2; var r = pow(); return {v: Math.pow(toNum(l.v), toNum(r.v))}; } return l; }
  function bin(level){
    if(level === 0) return pow();
    var ops = BIN[level];
    var l = bin(level - 1);
    for(;;){
      ws(); var found = null;
      for(var k = 0; k < ops.length; k++){ if(s.substr(i, ops[k].length) === ops[k] && !(ops[k].length === 1 && ((ops[k] === "&" && s.charAt(i + 1) === "&") || (ops[k] === "|" && s.charAt(i + 1) === "|") || (ops[k] === "<" && /[<=]/.test(s.charAt(i + 1))) || (ops[k] === ">" && /[>=]/.test(s.charAt(i + 1))) || (ops[k] === "*" && s.charAt(i + 1) === "*") || ((ops[k] === "+" || ops[k] === "-") && s.charAt(i + 1) === ops[k]) ))){ found = ops[k]; break; } }
      if(!found) break;
      i += found.length;
      var r = bin(level - 1), a = toNum(l.v), b = toNum(r.v), v;
      switch(found){
        case "*": v = a * b; break; case "/": if(b === 0) throw new Error("division by 0 (error token is \"" + s.slice(i - 1).trim() + "\")"); v = Math.trunc(a / b); break;
        case "%": if(b === 0) throw new Error("division by 0"); v = a % b; break; case "+": v = a + b; break; case "-": v = a - b; break;
        case "<<": v = a << b; break; case ">>": v = a >> b; break; case "<=": v = a <= b ? 1 : 0; break; case ">=": v = a >= b ? 1 : 0; break;
        case "<": v = a < b ? 1 : 0; break; case ">": v = a > b ? 1 : 0; break; case "==": v = a === b ? 1 : 0; break; case "!=": v = a !== b ? 1 : 0; break;
        case "&": v = a & b; break; case "^": v = a ^ b; break; case "|": v = a | b; break; case "&&": v = a && b ? 1 : 0; break; case "||": v = a || b ? 1 : 0; break;
      }
      l = {v: v};
    }
    return l;
  }
  function ternary(){
    var c = bin(BIN.length - 1); ws();
    if(s.charAt(i) === "?"){ i++; var a = assign(); ws(); if(s.charAt(i) !== ":") throw new Error("syntax error: `:' expected"); i++; var b = assign(); return {v: toNum(c.v) ? a.v : b.v}; }
    return c;
  }
  function assign(){
    ws();
    var save = i, id = ident();
    if(id){
      ws();
      var m = /^(\*\*=|<<=|>>=|\+=|-=|\*=|\/=|%=|&=|\^=|\|=|=(?!=))/.exec(s.slice(i));
      if(m){
        i += m[0].length;
        var r = assign(), cur = toNum(getVar(id)), rv = toNum(r.v), v;
        switch(m[0]){ case "=": v = rv; break; case "+=": v = cur + rv; break; case "-=": v = cur - rv; break; case "*=": v = cur * rv; break; case "/=": v = Math.trunc(cur / rv); break; case "%=": v = cur % rv; break;
          case "**=": v = Math.pow(cur, rv); break; case "<<=": v = cur << rv; break; case ">>=": v = cur >> rv; break; case "&=": v = cur & rv; break; case "^=": v = cur ^ rv; break; case "|=": v = cur | rv; break; }
        setVar(id, v); return {v: v};
      }
      i = save;
    }
    return ternary();
  }
  function comma(){ var r = assign(); ws(); while(s.charAt(i) === ","){ i++; r = assign(); ws(); } return r.v; }
  if(!s.trim()) return 0;
  var res = comma(); ws();
  if(i < s.length) throw new Error("syntax error in expression (error token is \"" + s.slice(i) + "\")");
  return res;
}
L.arith = arith;

/* ------------------------------------------------------------- the shell */
function Shell(opts){
  opts = opts || {};
  this.fs = opts.fs || new FS();
  this.out = opts.out || function(){};
  this.python = opts.python || null;
  this.vars = new Map();
  this.funcs = new Map();
  this.aliases = new Map();
  this.traps = new Map();
  this.cwd = "/home/student";
  this.user = {name: "student", uid: 1000, gid: 1000, groups: [1000, 27]};
  this.umask = 18;
  this.status = 0;
  this.pid = 1000; this.nextPid = 1001; this.ppid = 999;
  this.procs = [];                          // simulated background processes: {pid, cmd, state, job, done}
  this.jobCounter = 0;
  this.argv = ["bash"]; this.script = "bash";
  this.opts = {e: false, u: false, x: false, pipefail: false};
  this.steps = 0; this.maxSteps = 400000; this.deadline = 0; this.cancelled = false;
  this.depth = 0;
  this.setupEnv();
}
L.Shell = Shell;
Shell.prototype.setupEnv = function(){
  var env = {HOME: "/home/student", USER: "student", LOGNAME: "student", SHELL: "/bin/bash", PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games",
    PWD: this.cwd, HOSTNAME: "lab", LANG: "C.UTF-8", TERM: "xterm-256color", EDITOR: "nano", OLDPWD: ""};
  for(var k in env) this.vars.set(k, {v: env[k], x: true});
  this.vars.set("IFS", {v: " \t\n", x: false});
  this.vars.set("UID", {v: "1000", x: false}); this.vars.set("EUID", {v: "1000", x: false});
};
Shell.prototype.who = function(){ return this.user; };
Shell.prototype.fork = function(){                      // copy for subshells / pipeline segments
  var s = Object.create(Shell.prototype);
  for(var k in this) s[k] = this[k];
  s.vars = new Map(); this.vars.forEach(function(v, k){ s.vars.set(k, {v: v.v, x: v.x, arr: v.arr ? v.arr.slice() : undefined}); });
  s.funcs = new Map(this.funcs); s.aliases = new Map(this.aliases); s.traps = new Map(this.traps);
  s.user = {name: this.user.name, uid: this.user.uid, gid: this.user.gid, groups: this.user.groups.slice()};
  s.opts = {e: this.opts.e, u: this.opts.u, x: this.opts.x, pipefail: this.opts.pipefail};
  s.argv = this.argv.slice(); s.parent = this;
  return s;
};
Shell.prototype.get = function(name){
  switch(name){
    case "?": return String(this.status);
    case "$": return String(this.pid);
    case "#": return String(this.argv.length - 1);
    case "0": return this.script;
    case "PPID": return String(this.ppid);
    case "BASHPID": return String(this.pid);
    case "RANDOM": return String(Math.floor(Math.random() * 32768));
    case "SECONDS": return String(Math.floor((Date.now() - (this.t0 || (this.t0 = Date.now()))) / 1000));
    case "LINENO": return "1";
    case "!": return this.lastBg ? String(this.lastBg) : "";
    case "-": return "hB";
    case "PWD": return this.cwd;
  }
  if(/^\d+$/.test(name)) return this.argv[Number(name)] !== undefined && Number(name) > 0 ? this.argv[Number(name)] : (Number(name) === 0 ? this.script : "");
  var e = this.vars.get(name);
  if(!e) return undefined;
  return e.arr ? (e.arr[0] === undefined ? "" : e.arr[0]) : e.v;
};
Shell.prototype.set = function(name, value, exported){
  var e = this.vars.get(name);
  if(e && e.ro) throw new SysErr("EPERM", name + ": readonly variable");
  if(e){ e.v = value; e.arr = undefined; if(exported) e.x = true; } else this.vars.set(name, {v: value, x: !!exported});
  if(name === "PWD") this.cwd = value;
};
Shell.prototype.env = function(){
  var o = {}; this.vars.forEach(function(v, k){ if(v.x && !v.arr) o[k] = v.v; }); return o;
};
Shell.prototype.tickStep = function(){
  if(++this.steps > this.maxSteps || (this.deadline && Date.now() > this.deadline)) throw new Exit(-1);
  if(this.cancelled) throw new Exit(130);
};
Shell.prototype.say = function(msg){ this.errOut("bash: " + msg + "\n"); };
Shell.prototype.errOut = function(s){ (this.io ? this.io.err : this.out)(s); };

/* -------- word expansion -------- */
// A field is an array of {s: text, q: quoted?} pieces so unquoted pieces can be split and globbed.
Shell.prototype.expandBraces = function(w){
  // only on unquoted text; return array of words
  var i = 0, n = w.length, depth = 0, start = -1, commas = [], quote = null;
  for(i = 0; i < n; i++){
    var c = w.charAt(i);
    if(c === "\\"){ i++; continue; }
    if(quote){ if(c === quote) quote = null; continue; }
    if(c === "'" || c === '"'){ quote = c; continue; }
    if(c === "$" && w.charAt(i + 1) === "{"){ var d2 = 0; for(; i < n; i++){ if(w.charAt(i) === "{") d2++; else if(w.charAt(i) === "}"){ d2--; if(d2 === 0) break; } } continue; }
    if(c === "{"){ if(depth === 0){ start = i; commas = []; } depth++; }
    else if(c === "," && depth === 1) commas.push(i);
    else if(c === "}" && depth > 0){
      depth--;
      if(depth === 0){
        var body = w.slice(start + 1, i), pre = w.slice(0, start), post = w.slice(i + 1), parts = [];
        var seq = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(body), aseq = /^([a-zA-Z])\.\.([a-zA-Z])$/.exec(body);
        if(seq){
          var a = Number(seq[1]), b = Number(seq[2]), st = Math.abs(Number(seq[3] || 1)) || 1, wd = Math.max(/^-?0\d/.test(seq[1]) ? seq[1].length : 0, /^-?0\d/.test(seq[2]) ? seq[2].length : 0);
          if(a <= b) for(var x = a; x <= b; x += st) parts.push(pad(x, wd)); else for(var y = a; y >= b; y -= st) parts.push(pad(y, wd));
        } else if(aseq){
          var ca = aseq[1].charCodeAt(0), cb = aseq[2].charCodeAt(0);
          if(ca <= cb) for(var z = ca; z <= cb; z++) parts.push(String.fromCharCode(z)); else for(var z2 = ca; z2 >= cb; z2--) parts.push(String.fromCharCode(z2));
        } else if(commas.length){
          var last = start + 1;
          commas.concat([i]).forEach(function(cm){ parts.push(w.slice(last, cm)); last = cm + 1; });
        } else { continue; }
        var out = [];
        var self = this;
        parts.forEach(function(pt){ self.expandBraces(pre + pt + post).forEach(function(r){ out.push(r); }); });
        return out;
      }
    }
  }
  return [w];
  function pad(x, wd){ var s = String(Math.abs(x)); while(s.length < wd) s = "0" + s; return (x < 0 ? "-" : "") + s; }
};
Shell.prototype.expandWord = async function(raw, mode){
  // mode: {split: bool, glob: bool, noBrace: bool}. Returns array of strings.
  mode = mode || {split: true, glob: true};
  var words = mode.noBrace ? [raw] : this.expandBraces(raw), out = [];
  for(var w = 0; w < words.length; w++){
    var fields = await this.expandOne(words[w], mode);
    for(var f = 0; f < fields.length; f++){
      var field = fields[f], text = field.map(function(p){ return p.s; }).join("");
      if(mode.glob !== false && field.some(function(p){ return !p.q && /[*?\[]/.test(p.s); })){
        var matches = this.glob(field);
        if(matches.length){ matches.forEach(function(m){ out.push(m); }); continue; }
      }
      out.push(text);
    }
  }
  return out;
};
Shell.prototype.expandOne = async function(w, mode){
  var self = this, fields = [[]], i = 0, n = w.length, hadQuote = false;
  function cur(){ return fields[fields.length - 1]; }
  function add(s, q){ if(s !== "" || q) cur().push({s: s, q: q}); }
  function splitAdd(s, q){
    if(q || mode.split === false){ add(s, q); return; }
    var ifs = self.get("IFS"); if(ifs === undefined) ifs = " \t\n";
    if(ifs === ""){ add(s, false); return; }
    var ws = "", other = "";
    for(var k = 0; k < ifs.length; k++){ if(/\s/.test(ifs.charAt(k))) ws += ifs.charAt(k); else other += ifs.charAt(k); }
    var buf = "";
    for(var j = 0; j < s.length; j++){
      var ch = s.charAt(j);
      if(ifs.indexOf(ch) >= 0){
        if(buf !== ""){ add(buf, false); buf = ""; }
        if(other.indexOf(ch) >= 0 || (ws.indexOf(ch) >= 0 && cur().length > 0 && false)){}
        if(cur().length || fields.length === 1 && false){ fields.push([]); }
        else if(fields[fields.length - 1].length === 0 && other.indexOf(ch) >= 0){ fields.push([]); }
      } else buf += ch;
    }
    if(buf !== "") add(buf, false);
  }
  var dq = false;
  async function dollar(){        // at w[i] === "$"; returns {text, arr}
    var c = w.charAt(i + 1);
    if(c === "("){
      if(w.charAt(i + 2) === "("){                       // $(( ))
        var j = i + 3, depth = 2;
        while(j < n && depth > 0){ if(w.charAt(j) === "(") depth++; else if(w.charAt(j) === ")") depth--; j++; }
        var inner = w.slice(i + 3, j - 2); i = j;
        var ex = await self.expandString(inner);
        return {text: String(self.arith(ex))};
      }
      var d = 0, k = i + 1;
      for(; k < n; k++){ var ch = w.charAt(k); if(ch === "\\"){ k++; continue; } if(ch === "'"){ k = w.indexOf("'", k + 1); if(k < 0) k = n; continue; } if(ch === '"'){ k++; while(k < n && w.charAt(k) !== '"'){ if(w.charAt(k) === "\\") k++; k++; } continue; } if(ch === "(") d++; else if(ch === ")"){ d--; if(d === 0) break; } }
      var cmd = w.slice(i + 2, k); i = k + 1;
      return {text: await self.cmdSubst(cmd)};
    }
    if(c === "{"){
      var d2 = 0, k2 = i + 1;
      for(; k2 < n; k2++){ if(w.charAt(k2) === "{") d2++; else if(w.charAt(k2) === "}"){ d2--; if(d2 === 0) break; } }
      var body = w.slice(i + 2, k2); i = k2 + 1;
      return await self.paramExpand(body, dq);
    }
    var m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(w.slice(i + 1));
    if(m){ i += 1 + m[0].length; var val = self.get(m[0]); if(val === undefined){ if(self.opts.u) throw new SysErr("EINVAL", m[0] + ": unbound variable"); val = ""; } return {text: val}; }
    if(/[0-9?$#!@*\-]/.test(c)){
      i += 2;
      if(c === "@" || c === "*"){ var args = self.argv.slice(1); return {arr: args, star: c === "*"}; }
      var v2 = self.get(c); return {text: v2 === undefined ? "" : v2};
    }
    i++; return {text: "$"};
  }
  while(i < n){
    var c = w.charAt(i);
    if(c === "\\"){ add(w.charAt(i + 1), true); i += 2; hadQuote = true; continue; }
    if(c === "'"){ var q = w.indexOf("'", i + 1); add(w.slice(i + 1, q), true); i = q + 1; hadQuote = true; continue; }
    if(c === '"'){
      i++; dq = true; hadQuote = true;
      var buf = "";
      var startLen = cur().length;
      while(i < n && w.charAt(i) !== '"'){
        var d = w.charAt(i);
        if(d === "\\" && /[$`"\\\n]/.test(w.charAt(i + 1))){ if(w.charAt(i + 1) !== "\n") buf += w.charAt(i + 1); i += 2; continue; }
        if(d === "$"){
          var r = await dollar();
          if(r.arr){
            // "$@" -> separate fields
            if(r.star){ buf += r.arr.join((self.get("IFS") || " ").charAt(0)); }
            else { r.arr.forEach(function(a, idx){ if(idx === 0) buf += a; else { add(buf, true); buf = ""; fields.push([]); buf = a; } }); if(r.arr.length === 0 && false){} }
          } else buf += r.text;
          continue;
        }
        if(d === "`"){ var e = w.indexOf("`", i + 1); buf += await self.cmdSubst(w.slice(i + 1, e)); i = e + 1; continue; }
        buf += d; i++;
      }
      i++; dq = false;
      add(buf, true);
      continue;
    }
    if(c === "$"){
      var r2 = await dollar();
      if(r2.arr){
        if(r2.star && mode.split !== false){ splitAdd(r2.arr.join(" "), false); }
        else r2.arr.forEach(function(a, idx){ if(idx > 0) fields.push([]); splitAdd(a, false); });
      } else splitAdd(r2.text, false);
      continue;
    }
    if(c === "`"){ var e2 = w.indexOf("`", i + 1); splitAdd(await self.cmdSubst(w.slice(i + 1, e2)), false); i = e2 + 1; continue; }
    if(c === "~" && (i === 0) ){
      var m2 = /^~([A-Za-z0-9_-]*)(\/|$)/.exec(w);
      if(m2){
        var home = m2[1] === "" ? (self.get("HOME") || "/") : (m2[1] === self.user.name ? "/home/" + m2[1] : (m2[1] === "root" ? "/root" : "/home/" + m2[1]));
        add(home, true); i += 1 + m2[1].length; continue;
      }
    }
    // plain run
    var j = i;
    while(j < n && !/[\\'"$`]/.test(w.charAt(j)) && !(w.charAt(j) === "~" && j === 0)) j++;
    if(j === i){ add(c, false); i++; continue; }
    add(w.slice(i, j), false); i = j;
  }
  // drop empty unquoted-only fields (from empty expansions), keep fields that had quotes
  var res = fields.filter(function(f, idx){ return f.length > 0 || (hadQuote && fields.length === 1); });
  if(!res.length && hadQuote) res = [[{s: "", q: true}]];
  return res;
};
Shell.prototype.expandString = async function(s){ var r = await this.expandOne(s, {split: false, glob: false}); return r.map(function(f){ return f.map(function(p){ return p.s; }).join(""); }).join(" "); };
Shell.prototype.arith = function(expr){
  var self = this;
  try{
    return arith(expr, function(nm){ var v = self.get(nm); if(v === undefined || v === "") return 0; if(/^-?\d+$/.test(v)) return Number(v); var nested = self.get(v); return nested !== undefined && /^-?\d+$/.test(nested) ? Number(nested) : 0; }, function(nm, val){ self.set(nm, String(val)); });
  }catch(e){ throw new SysErr("EINVAL", expr + ": " + e.message); }
};
Shell.prototype.cmdSubst = async function(cmd){
  var sub = this.fork(), buf = "";
  sub.io = {in: "", out: function(s){ buf += s; }, err: this.io ? this.io.err : this.out};
  var st = await sub.runText(cmd);
  this.status = st;
  return buf.replace(/\n+$/, "");
};
/* ${...} */
Shell.prototype.paramExpand = async function(body, dq){
  var self = this;
  var m = /^([#!]?)([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*#?$!-])(\[([^\]]*)\])?(.*)$/s.exec(body);
  if(!m) return {text: ""};
  var pre = m[1], name = m[2], idx = m[4], rest = m[5];
  var raw, isArr = false, arr = null;
  if(idx !== undefined){
    var e = this.vars.get(name);
    var items = e ? (e.arr ? e.arr : (e.v === "" ? [] : [e.v])) : (name === "PIPESTATUS" ? (this.pipestatus || [String(this.status)]) : []);
    if(name === "PIPESTATUS" && !e) items = (this.pipestatus || [this.status]).map(String);
    if(idx === "@" || idx === "*"){ isArr = true; arr = items.slice(); raw = items.join(" "); }
    else { var ix = await this.expandString(idx); var k = /^-?\d+$/.test(ix) ? Number(ix) : this.arith(ix); raw = items[k < 0 ? items.length + k : k]; if(raw === undefined) raw = undefined; }
    if(pre === "#"){ return {text: String(isArr ? items.length : (raw === undefined ? 0 : raw.length))}; }
  } else if(name === "@" || name === "*"){
    isArr = true; arr = this.argv.slice(1); raw = arr.join(" ");
    if(pre === "#") return {text: String(arr.length)};
  } else {
    raw = this.get(name);
    if(pre === "#"){ return {text: String(raw === undefined ? 0 : raw.length)}; }
    if(pre === "!"){ var ind = raw === undefined ? undefined : this.get(raw); return {text: ind === undefined ? "" : ind}; }
  }
  if(rest === ""){ if(isArr) return {arr: arr, star: idx === "*" || name === "*"}; if(raw === undefined && this.opts.u) throw new SysErr("EINVAL", name + ": unbound variable"); return {text: raw === undefined ? "" : raw}; }
  var op = /^(:-|:=|:\?|:\+|-|=|\?|\+|##|#|%%|%|\/\/|\/|\^\^|\^|,,|,|:)(.*)$/s.exec(rest);
  if(!op) return {text: raw === undefined ? "" : raw};
  var o = op[1], arg = op[2], val = raw === undefined ? "" : raw;
  var unset = raw === undefined, empty = unset || raw === "";
  switch(o){
    case ":-": return {text: empty ? await this.expandString(arg) : val};
    case "-": return {text: unset ? await this.expandString(arg) : val};
    case ":=": if(empty){ var dv = await this.expandString(arg); this.set(name, dv); return {text: dv}; } return {text: val};
    case "=": if(unset){ var dv2 = await this.expandString(arg); this.set(name, dv2); return {text: dv2}; } return {text: val};
    case ":?": if(empty){ throw new SysErr("PARAM", name + ": " + (arg ? await this.expandString(arg) : "parameter null or not set")); } return {text: val};
    case "?": if(unset){ throw new SysErr("PARAM", name + ": " + (arg ? await this.expandString(arg) : "parameter not set")); } return {text: val};
    case ":+": return {text: empty ? "" : await this.expandString(arg)};
    case "+": return {text: unset ? "" : await this.expandString(arg)};
    case "#": case "##": case "%": case "%%": {
      var pat = new RegExp("^" + globToRegex(await this.expandString(arg)).replace(/\[\^\/\]/g, "[\\s\\S]").replace(/\[\^\/\]\*/g, "[\\s\\S]*") + "$");
      var s = val, res = s;
      if(o === "#"){ for(var a = 0; a <= s.length; a++){ if(pat.test(s.slice(0, a))){ res = s.slice(a); break; } } }
      else if(o === "##"){ for(var a2 = s.length; a2 >= 0; a2--){ if(pat.test(s.slice(0, a2))){ res = s.slice(a2); break; } } }
      else if(o === "%"){ for(var b = s.length; b >= 0; b--){ if(pat.test(s.slice(b))){ res = s.slice(0, b); break; } } }
      else { for(var b2 = 0; b2 <= s.length; b2++){ if(pat.test(s.slice(b2))){ res = s.slice(0, b2); break; } } }
      return {text: res};
    }
    case "/": case "//": {
      var sl = arg.indexOf("/"), pt = sl < 0 ? arg : arg.slice(0, sl), rp = sl < 0 ? "" : arg.slice(sl + 1);
      pt = await this.expandString(pt); rp = await this.expandString(rp);
      var anchor = pt.charAt(0) === "#" ? "^" : pt.charAt(0) === "%" ? "$" : "";
      if(anchor) pt = pt.slice(1);
      var rx = new RegExp((anchor === "^" ? "^" : "") + globToRegex(pt).replace(/\[\^\/\]/g, "[\\s\\S]") + (anchor === "$" ? "$" : ""), o === "//" ? "g" : "");
      return {text: val.replace(rx, function(){ return rp; })};
    }
    case "^^": return {text: val.toUpperCase()}; case "^": return {text: val.charAt(0).toUpperCase() + val.slice(1)};
    case ",,": return {text: val.toLowerCase()}; case ",": return {text: val.charAt(0).toLowerCase() + val.slice(1)};
    case ":": {
      var mm = /^\s*(-?[^:]*)(?::(.*))?$/s.exec(arg), off = this.arith(await this.expandString(mm[1])), len = mm[2] !== undefined ? this.arith(await this.expandString(mm[2])) : undefined;
      if(isArr){ var a3 = arr.slice(off < 0 ? Math.max(0, arr.length + off) : off, len === undefined ? undefined : (off < 0 ? arr.length + off : off) + len); return {arr: a3}; }
      var st = off < 0 ? Math.max(0, val.length + off) : off;
      return {text: len === undefined ? val.slice(st) : val.slice(st, len < 0 ? val.length + len : st + len)};
    }
  }
  return {text: val};
};
/* -------- globbing -------- */
Shell.prototype.glob = function(field){
  // rebuild a pattern where quoted chars are escaped
  var pat = field.map(function(p){ return p.q ? p.s.replace(/[*?\[\]\\]/g, "\\$&") : p.s; }).join("");
  var abs = pat.charAt(0) === "/", parts = pat.split("/").filter(function(x, i){ return x !== "" || i === 0 && false; });
  var results = [""], self = this;
  if(abs) results = ["/"];
  for(var pi = 0; pi < parts.length; pi++){
    var seg = parts[pi], next = [];
    var hasMagic = /[*?\[]/.test(seg.replace(/\\./g, ""));
    for(var ri = 0; ri < results.length; ri++){
      var base = results[ri];
      if(!hasMagic){
        var lit = seg.replace(/\\(.)/g, "$1"), p = base === "" ? lit : (base === "/" ? "/" + lit : base + "/" + lit);
        if(self.fs.exists(p, self.cwd, self.user)) next.push(p);
        continue;
      }
      var dir;
      try{ dir = self.fs.get(base === "" ? "." : base, self.cwd, self.user, true); }catch(e){ continue; }
      if(dir.t !== "d" || !self.fs.can(dir, self.user, 4)) continue;
      var rx = new RegExp("^" + globToRegex(seg) + "$");
      var names = Array.from(dir.kids.keys()).sort();
      names.forEach(function(nm){
        if(nm.charAt(0) === "." && seg.charAt(0) !== ".") return;
        if(rx.test(nm)){
          var p2 = base === "" ? nm : (base === "/" ? "/" + nm : base + "/" + nm);
          if(pi < parts.length - 1){ var nn = dir.kids.get(nm); if(nn.t !== "d" && !(nn.t === "l")) return; }
          next.push(p2);
        }
      });
    }
    results = next;
    if(!results.length) break;
  }
  if(pat.charAt(pat.length - 1) === "/") results = results.filter(function(r){ try{ return self.fs.get(r, self.cwd, self.user, true).t === "d"; }catch(e){ return false; } }).map(function(r){ return r + "/"; });
  return results;
};

/* -------- execution -------- */
Shell.prototype.runText = async function(src){
  var ast;
  try{ ast = L.parse(src); }catch(e){
    if(e instanceof Syntax){ this.errOut("bash: line 1: " + e.message + "\n"); this.status = 2; return 2; }
    throw e;
  }
  return await this.runList(ast);
};
Shell.prototype.runList = async function(list){
  var st = this.status;
  for(var i = 0; i < list.items.length; i++){
    var it = list.items[i];
    this.tickStep();
    if(this.steps % 200 === 0) await L.yield();
    if(it.op === "&"){ st = await this.runBackground(it.node); continue; }
    st = await this.runNode(it.node);
    this.status = st;
    if(this.opts.e && st !== 0 && it.node.type !== "andor" && !(it.node.type === "pipeline" && it.node.neg)) throw new Exit(st);
  }
  return st;
};
L.yield = function(){ return new Promise(function(r){ setTimeout(r, 0); }); };
Shell.prototype.runNode = async function(node){
  switch(node.type){
    case "list": return await this.runList(node);
    case "andor": {
      var st = await this.runNode(node.first);
      this.status = st;
      for(var i = 0; i < node.rest.length; i++){
        var r = node.rest[i];
        if((r.op === "&&" && st === 0) || (r.op === "||" && st !== 0)){ st = await this.runNode(r.node); this.status = st; }
      }
      return st;
    }
    case "pipeline": return await this.runPipeline(node);
    default: return await this.runCommand(node, this.io || {in: null, out: this.out, err: this.out});
  }
};
Shell.prototype.runBackground = async function(node){
  /* A command that would run for a long time (sleep, a script with an endless loop, tail -f) becomes a simulated process
     in the process table. Anything else just runs now, in a copy of the shell. */
  var text = L.unparse(node), job = ++this.jobCounter, pid = this.nextPid++, self = this;
  this.lastBg = pid;
  var plan = await this.bgPlan(node);
  var io = this.io || {in: null, out: this.out, err: this.out};
  if(plan){
    var p = {pid: pid, cmd: plan.cmdline, state: "S", job: job, done: false, ppid: this.pid, ni: plan.ni || 0, user: this.user.name};
    this.procs.push(p); L.procfs(this, p);
    if(plan.script !== undefined){
      var sub = this.fork(); sub.pid = pid; sub.ppid = this.pid; sub.script = plan.name; sub.argv = [plan.name].concat(plan.args); sub.localStack = [];
      var cur = io;
      var n0 = node.type === "pipeline" && node.cmds.length === 1 ? node.cmds[0] : node;
      if(n0.type === "simple" && n0.redirs.length){ try{ cur = await this.setupRedirs(n0.redirs, io); }catch(e){ if(!(e instanceof SysErr)) throw e; } }
      sub.io = {in: null, out: cur.out, err: cur.err};
      p.sub = sub; p.io = sub.io;
      try{ await sub.runText(plan.script); }catch(e){ if(e instanceof Exit){ p.done = true; p.state = "Z"; p.status = e.code; } else if(!(e instanceof Ctl)) throw e; }
      p.traps = sub.traps; 
    }
    if(this.interactive && this.io && this.io.err) this.io.err("[" + job + "] " + pid + "\n");
    return 0;
  }
  var pr = {pid: pid, cmd: text, state: "Z", job: job, done: true, status: 0, ppid: this.pid, announced: false};
  this.procs.push(pr);
  var sub2 = this.fork();
  sub2.pid = pid; sub2.io = this.io;
  try{ pr.status = await sub2.runNode(node); }catch(e){ if(e instanceof Exit) pr.status = e.code; else throw e; }
  this.status = 0;
  return 0;
};
var BLOCK_LINE = /^(while|until)\b[^\n]*\b(true|:)\b|^sleep\b|^tail -f|^read\b|^cat\s*$/m;
Shell.prototype.bgPlan = async function(node){
  var n = node.type === "pipeline" && node.cmds.length === 1 ? node.cmds[0] : node;
  if(n.type !== "simple" || !n.words.length) return null;
  var words = [];
  for(var i = 0; i < n.words.length; i++) (await this.expandWord(n.words[i])).forEach(function(x){ words.push(x); });
  var ni = 0;
  for(;;){
    if(words[0] === "nohup" || words[0] === "sudo" || words[0] === "time"){ words.shift(); continue; }
    if(words[0] === "nice"){ words.shift(); if(words[0] === "-n"){ ni = Number(words[1]) || 0; words.splice(0, 2); } continue; }
    break;
  }
  var first = words[0];
  if(!first) return null;
  var cmdline = words.join(" ");
  if(first === "sleep" || first === "ping" || first === "watch" || first === "yes" || (first === "tail" && words.indexOf("-f") > 0) || (/^python3?$/.test(first) && /http\.server/.test(cmdline))) return {cmdline: cmdline, ni: ni};
  if(first.indexOf("/") >= 0 || (!L.cmds[first] && !L.builtins[first] && !this.funcs.has(first) && this.findInPath(first))){
    try{
      var f = this.fs.get(first, this.cwd, this.user, true);
      if(f.t === "f" && this.fs.can(f, this.user, 1)){
        var m = BLOCK_LINE.exec(f.data);
        if(m) return {cmdline: cmdline, ni: ni, script: f.data.slice(0, m.index), name: first, args: words.slice(1)};
      }
    }catch(e){}
  }
  return null;
};
function firstWord(node){
  if(node.type === "pipeline") return firstWord(node.cmds[0]);
  if(node.type === "andor") return firstWord(node.first);
  if(node.type === "simple") return (node.words[0] || "").replace(/^['"]|['"]$/g, "");
  return "(" + node.type;
}
Shell.prototype.runPipeline = async function(p){
  var self = this;
  if(p.cmds.length === 1){
    var st;
    if(p.timed){ var t0 = Date.now(); st = await this.runCommand(p.cmds[0], this.io || {in: null, out: this.out, err: this.out}); var ms = Date.now() - t0; this.errOut("\nreal\t0m" + (ms / 1000).toFixed(3) + "s\nuser\t0m0.000s\nsys\t0m0.000s\n"); }
    else st = await this.runCommand(p.cmds[0], this.io || {in: null, out: this.out, err: this.out});
    this.pipestatus = [st];
    return p.neg ? (st === 0 ? 1 : 0) : st;
  }
  var data = this.io ? this.io.in : null, statuses = [], baseIo = this.io || {in: null, out: this.out, err: this.out};
  for(var i = 0; i < p.cmds.length; i++){
    var last = i === p.cmds.length - 1, buf = "";
    var sub = this.fork();
    var io = {in: data, out: last ? baseIo.out : function(s){ buf += s; }, err: baseIo.err};
    sub.io = io;
    var st2;
    try{ st2 = await sub.runCommand(p.cmds[i], io); }catch(e){ if(e instanceof Exit) st2 = e.code; else throw e; }
    statuses.push(st2);
    if(!last) data = buf;
    // keep jobs/process table shared
    this.nextPid = Math.max(this.nextPid, sub.nextPid);
    this.steps = sub.steps;
  }
  this.pipestatus = statuses;
  var res = statuses[statuses.length - 1];
  if(this.opts.pipefail){ for(var k = statuses.length - 1; k >= 0; k--){ if(statuses[k] !== 0){ res = statuses[k]; break; } } }
  return p.neg ? (res === 0 ? 1 : 0) : res;
};
/* open redirections: returns {io, close()} */
Shell.prototype.setupRedirs = async function(redirs, io){
  var fds = {0: io.in, out: {1: io.out, 2: io.err}};
  var cur = {in: io.in, out: io.out, err: io.err}, self = this, writers = [];
  function fileSink(path, append){
    var abs = self.fs.norm(path, self.cwd);
    if(abs === "/dev/null") return function(){};
    if(abs === "/dev/stdout") return io.out; if(abs === "/dev/stderr") return io.err;
    if(abs === "/dev/tty") return io.out;
    var r = self.fs.lookup(path, self.cwd, self.user, true);
    if(r.node && r.node.t === "d") throw new SysErr("EISDIR");
    self.fs.writeFile(path, append ? (r.node ? r.node.data : "") : "", self.cwd, self.user, false, self.umask);
    var node = self.fs.lookup(path, self.cwd, self.user, true).node;
    return function(s){ node.data += s; node.mtime = self.fs.tick(); };
  }
  for(var i = 0; i < redirs.length; i++){
    var r = redirs[i], op = r.op;
    var target = op === "<<" || op === "<<-" ? null : (await this.expandWord(r.word, {split: false, glob: false}))[0];
    if(op === "<"){
      var content;
      var abs = this.fs.norm(target, this.cwd);
      if(abs === "/dev/null") content = ""; else if(abs === "/dev/zero") content = "\0".repeat(1024 * 1024);
      else content = this.fs.readFile(target, this.cwd, this.user);
      if(r.fd === null || r.fd === 0) cur.in = content; else cur["fd" + r.fd] = content;
    } else if(op === "<<" || op === "<<-"){
      var body = r.body;
      if(!r.quoted) body = await this.expandHere(body);
      cur.in = body;
    } else if(op === "<<<"){
      cur.in = (await this.expandWord(r.word, {split: false, glob: false})).join(" ") + "\n";
    } else if(op === ">" || op === ">>" || op === ">|"){
      var sink = fileSink(target, op === ">>");
      if(r.fd === 2) cur.err = sink; else if(r.fd === null || r.fd === 1) cur.out = sink; else cur["fd" + r.fd] = sink;
    } else if(op === "&>" || op === "&>>"){
      var sink2 = fileSink(target, op === "&>>"); cur.out = sink2; cur.err = sink2;
    } else if(op === ">&" || op === "<&"){
      if(target === "-"){ if(r.fd !== null && r.fd >= 3) delete cur["fd" + r.fd]; continue; }
      if(/^\d+$/.test(target)){
        var tfd = Number(target), srcSink = tfd === 1 ? cur.out : tfd === 2 ? cur.err : (cur["fd" + tfd] || (tfd >= 3 ? function(){} : undefined));
        if(r.fd === 2) cur.err = srcSink || cur.err; else if(r.fd === null || r.fd === 1) cur.out = srcSink || cur.out; else cur["fd" + r.fd] = srcSink;
      } else { var sk = fileSink(target, false); cur.out = sk; cur.err = sk; }
    }
  }
  return cur;
};
Shell.prototype.expandHere = async function(body){
  // expand $var, $(cmd), `cmd`, $((..)) but keep other characters literally
  var out = "", i = 0, n = body.length;
  while(i < n){
    var c = body.charAt(i);
    if(c === "\\" && /[$`\\]/.test(body.charAt(i + 1))){ out += body.charAt(i + 1); i += 2; continue; }
    if(c === "$" && (body.charAt(i + 1) === "(" || body.charAt(i + 1) === "{" || /[A-Za-z_0-9?$#@*!]/.test(body.charAt(i + 1)))){
      var j = i;
      if(body.charAt(i + 1) === "("){ var d = 0; for(j = i + 1; j < n; j++){ if(body.charAt(j) === "(") d++; else if(body.charAt(j) === ")"){ d--; if(d === 0) break; } } j++; }
      else if(body.charAt(i + 1) === "{"){ j = body.indexOf("}", i) + 1; }
      else { var m = /^[A-Za-z_][A-Za-z0-9_]*|^[0-9?$#@*!]/.exec(body.slice(i + 1)); j = i + 1 + m[0].length; }
      out += await this.expandString(body.slice(i, j)); i = j; continue;
    }
    if(c === "`"){ var e = body.indexOf("`", i + 1); out += await this.cmdSubst(body.slice(i + 1, e)); i = e + 1; continue; }
    out += c; i++;
  }
  return out;
};
Shell.prototype.runCommand = async function(node, io){
  this.tickStep();
  var cur;
  try{ cur = node.redirs && node.redirs.length ? await this.setupRedirs(node.redirs, io) : null; }
  catch(e){
    if(e instanceof SysErr){ io.err("bash: " + (e.extra || (node.redirs[0] ? node.redirs[0].word : "")) + ": " + e.message + "\n"); return 1; }
    throw e;
  }
  var cio = cur ? {in: cur.in, out: cur.out, err: cur.err, fds: cur} : io;
  var saved = this.io; this.io = cio;
  try{
    switch(node.type){
      case "simple": return await this.runSimple(node, cio);
      case "subshell": { var sub = this.fork(); sub.io = cio; var st; try{ st = await sub.runList(node.body); }catch(e){ if(e instanceof Exit) st = e.code; else throw e; } this.steps = sub.steps; this.nextPid = Math.max(this.nextPid, sub.nextPid); this.procs = sub.procs; return st; }
      case "group": return await this.runList(node.body);
      case "if": {
        for(var i = 0; i < node.clauses.length; i++){
          var sv = this.opts.e; this.opts.e = false;
          var c = await this.runList(node.clauses[i].cond); this.opts.e = sv;
          this.status = c;
          if(c === 0) return await this.runList(node.clauses[i].body);
        }
        if(node.els) return await this.runList(node.els);
        return 0;
      }
      case "for": {
        var words = node.words === null ? this.argv.slice(1) : [];
        if(node.words !== null) for(var wi = 0; wi < node.words.length; wi++){ var ex = await this.expandWord(node.words[wi]); ex.forEach(function(x){ words.push(x); }); }
        var st2 = 0;
        for(var k = 0; k < words.length; k++){
          this.set(node.name, words[k]);
          try{ st2 = await this.runList(node.body); }catch(e){ if(e instanceof Ctl){ if(e.kind === "break"){ if(e.n > 1) throw new Ctl("break", e.n - 1); break; } if(e.kind === "continue"){ if(e.n > 1) throw new Ctl("continue", e.n - 1); continue; } } throw e; }
          this.tickStep();
        }
        return st2;
      }
      case "cfor": {
        var self = this; this.arith(node.init);
        var st3 = 0;
        while(!node.cond.trim() || this.arith(node.cond) !== 0){
          try{ st3 = await this.runList(node.body); }catch(e){ if(e instanceof Ctl){ if(e.kind === "break"){ if(e.n > 1) throw new Ctl("break", e.n - 1); break; } if(e.kind === "continue"){ if(e.n > 1) throw new Ctl("continue", e.n - 1); } else throw e; } else throw e; }
          this.arith(node.step || "0");
          this.tickStep();
          if(this.steps % 200 === 0) await L.yield();
        }
        return st3;
      }
      case "while": {
        var st4 = 0, guard = 0;
        for(;;){
          var sv2 = this.opts.e; this.opts.e = false;
          var cc = await this.runList(node.cond); this.opts.e = sv2;
          if(node.until ? cc === 0 : cc !== 0) break;
          try{ st4 = await this.runList(node.body); }catch(e){ if(e instanceof Ctl){ if(e.kind === "break"){ if(e.n > 1) throw new Ctl("break", e.n - 1); break; } if(e.kind === "continue"){ if(e.n > 1) throw new Ctl("continue", e.n - 1); continue; } } throw e; }
          this.tickStep();
          if(++guard % 100 === 0) await L.yield();
        }
        return st4;
      }
      case "case": {
        var val = (await this.expandWord(node.word, {split: false, glob: false})).join(" ");
        for(var ci = 0; ci < node.clauses.length; ci++){
          for(var pi = 0; pi < node.clauses[ci].pats.length; pi++){
            var pat = (await this.expandWord(node.clauses[ci].pats[pi], {split: false, glob: false})).join("");
            if(new RegExp("^" + globToRegex(pat).replace(/\[\^\/\]/g, "[\\s\\S]") + "$").test(val)) return await this.runList(node.clauses[ci].body);
          }
        }
        return 0;
      }
      case "func": this.funcs.set(node.name, node.body); return 0;
      case "dbl": return await this.evalDbl(node);
      default: throw new Error("unknown node " + node.type);
    }
  } finally { this.io = saved; }
};
/* [[ ... ]] */
Shell.prototype.evalDbl = async function(node){
  var self = this, toks = [];
  for(var i = 0; i < node.words.length; i++){
    var w = node.words[i];
    if(w.op) toks.push({op: w.v}); else toks.push({w: w.v, ex: (await this.expandWord(w.v, {split: false, glob: false})).join(" "), raw: w.v});
  }
  var p = 0;
  function peek(){ return toks[p]; }
  function orExpr(){ var l = andExpr(); while(peek() && peek().op === "||"){ p++; var r = andExpr(); l = l || r; } return l; }
  function andExpr(){ var l = notExpr(); while(peek() && peek().op === "&&"){ p++; var r = notExpr(); l = l && r; } return l; }
  function notExpr(){ if(peek() && peek().w === "!"){ p++; return !notExpr(); } return prim(); }
  function prim(){
    var t = peek();
    if(t && t.op === "("){ p++; var v = orExpr(); p++; return v; }
    if(t && /^-[a-z]$/.test(t.w || "") && toks[p + 1] && !toks[p + 1].op && !isBinary(toks[p + 2])){ p += 2; return unary(t.w, toks[p - 1].ex); }
    var a = toks[p++];
    var o = toks[p];
    if(o && (o.op === "<" || o.op === ">")){ p++; var b0 = toks[p++]; return o.op === "<" ? a.ex < b0.ex : a.ex > b0.ex; }
    if(o && isBinary(o)){
      p++; var b = toks[p++];
      switch(o.w){
        case "==": case "=": return globMatch(a.ex, b);
        case "!=": return !globMatch(a.ex, b);
        case "=~": try{ var m = new RegExp(L.ere(b.ex)).exec(a.ex); if(m){ self.vars.set("BASH_REMATCH", {v: m[0], x: false, arr: Array.prototype.slice.call(m).map(function(x){ return x === undefined ? "" : x; })}); } return !!m; }catch(e){ return false; }
        case "-eq": return self.arith(a.ex) === self.arith(b.ex); case "-ne": return self.arith(a.ex) !== self.arith(b.ex);
        case "-lt": return self.arith(a.ex) < self.arith(b.ex); case "-le": return self.arith(a.ex) <= self.arith(b.ex);
        case "-gt": return self.arith(a.ex) > self.arith(b.ex); case "-ge": return self.arith(a.ex) >= self.arith(b.ex);
      }
    }
    return a && a.ex !== "";
  }
  function isBinary(t){ return t && t.w && /^(==|=|!=|=~|-eq|-ne|-lt|-le|-gt|-ge)$/.test(t.w); }
  function globMatch(s, pat){ var raw = pat.raw; var quoted = /^["']/.test(raw); var g = quoted ? L.escRe(pat.ex) : globToRegex(pat.ex).replace(/\[\^\/\]/g, "[\\s\\S]"); return new RegExp("^" + g + "$").test(s); }
  function unary(op, v){ return L.testUnary(self, op, v); }
  try{ return orExpr() ? 0 : 1; }catch(e){ return 2; }
};
L.testUnary = function(sh, op, v){
  var n;
  switch(op){
    case "-z": return v === ""; case "-n": return v !== "";
    case "-e": return sh.fs.exists(v, sh.cwd, sh.user);
    case "-f": try{ return sh.fs.get(v, sh.cwd, sh.user, true).t === "f"; }catch(e){ return false; }
    case "-d": try{ return sh.fs.get(v, sh.cwd, sh.user, true).t === "d"; }catch(e){ return false; }
    case "-L": case "-h": try{ return sh.fs.get(v, sh.cwd, sh.user, false).t === "l"; }catch(e){ return false; }
    case "-s": try{ n = sh.fs.get(v, sh.cwd, sh.user, true); return n.t === "f" ? n.data.length > 0 : true; }catch(e){ return false; }
    case "-r": try{ return sh.fs.can(sh.fs.get(v, sh.cwd, sh.user, true), sh.user, 4); }catch(e){ return false; }
    case "-w": try{ return sh.fs.can(sh.fs.get(v, sh.cwd, sh.user, true), sh.user, 2); }catch(e){ return false; }
    case "-x": try{ n = sh.fs.get(v, sh.cwd, sh.user, true); return sh.fs.can(n, sh.user, 1); }catch(e){ return false; }
    case "-t": return false;
    case "-v": return sh.get(v) !== undefined;
  }
  return false;
};
L.ere = function(s){ return s.replace(/\[\[:([a-z]+):\]\]/g, function(_, c){ return "[" + posixClass(c) + "]"; }).replace(/\[:([a-z]+):\]/g, function(_, c){ return posixClass(c); }); };

/* -------- simple commands -------- */
Shell.prototype.runSimple = async function(node, io){
  var self = this;
  var words = [];
  // alias expansion (first word only, simple)
  var rawWords = node.words.slice();
  if(rawWords.length && this.aliases.has(rawWords[0]) && !this.noAlias){
    var al = this.aliases.get(rawWords[0]);
    rawWords = al.split(/\s+/).filter(Boolean).concat(rawWords.slice(1));
  }
  var saveVars = [];
  // assignments
  for(var a = 0; a < node.assigns.length; a++){
    var as = node.assigns[a];
    if(as.array){
      var arr = [];
      for(var ai = 0; ai < as.array.length; ai++){ (await this.expandWord(as.array[ai])).forEach(function(x){ arr.push(x); }); }
      var ex = this.vars.get(as.name);
      if(as.append && ex && ex.arr) arr = ex.arr.concat(arr);
      this.vars.set(as.name, {v: arr[0] || "", x: false, arr: arr});
      continue;
    }
    var val = (await this.expandWord(as.value, {split: false, glob: false})).join(" ");
    var im = /^([A-Za-z_][A-Za-z0-9_]*)\[([^\]]*)\]$/.exec(as.name);
    if(im){
      var e2 = this.vars.get(im[1]) || {v: "", x: false, arr: []}; if(!e2.arr) e2.arr = e2.v === "" ? [] : [e2.v];
      var idx = /^\d+$/.test(im[2]) ? Number(im[2]) : this.arith(im[2]);
      e2.arr[idx] = val; e2.v = e2.arr[0] || ""; this.vars.set(im[1], e2); continue;
    }
    if(rawWords.length){ saveVars.push([as.name, this.vars.get(as.name) ? {v: this.vars.get(as.name).v, x: this.vars.get(as.name).x} : null]); this.set(as.name, val, true); }
    else {
      var cur = this.vars.get(as.name);
      this.set(as.name, as.append && cur ? cur.v + val : val);
    }
  }
  if(!rawWords.length){ return 0; }
  for(var w = 0; w < rawWords.length; w++){
    var ex2 = await this.expandWord(rawWords[w]);
    ex2.forEach(function(x){ words.push(x); });
  }
  if(!words.length){ saveVars.forEach(function(sv){ if(sv[1]) self.vars.set(sv[0], sv[1]); else self.vars.delete(sv[0]); }); return 0; }
  if(this.opts.x) io.err("+ " + words.join(" ") + "\n");
  var status;
  try{
    status = await this.exec(words, io);
  } finally {
    saveVars.forEach(function(sv){ if(sv[1]) self.vars.set(sv[0], sv[1]); else self.vars.delete(sv[0]); });
  }
  return status;
};
Shell.prototype.exec = async function(words, io){
  var name = words[0], args = words.slice(1);
  if(this.funcs.has(name)){
    if(++this.depth > 100){ this.depth--; io.err("bash: " + name + ": maximum function nesting level exceeded\n"); return 1; }
    var body = this.funcs.get(name), saveArgv = this.argv;
    this.argv = [this.script].concat(args);
    var saved = this.io; this.io = io;
    var localStack = this.localStack; this.localStack = [];
    try{ var st = await this.runNode(body); return st; }
    catch(e){ if(e instanceof Ctl && e.kind === "return") return e.n; throw e; }
    finally { this.argv = saveArgv; this.io = saved; this.depth--; (this.localStack || []).forEach(function(l){ if(l.prev) this.vars.set(l.name, l.prev); else this.vars.delete(l.name); }, this); this.localStack = localStack; }
  }
  var b = L.builtins[name];
  if(b) return await b.call(this, args, io, name);
  var cmd = L.cmds[name];
  if(name.indexOf("/") < 0){
    if(cmd){
      var found = this.findInPath(name);
      if(!found && !(L.always && L.always[name])){ io.err("bash: " + name + ": command not found\n"); return 127; }
      return await this.runCmd(cmd, name, args, io);
    }
    io.err("bash: " + name + ": command not found\n"); return 127;
  }
  // path: script or a command by path
  var n;
  try{ n = this.fs.get(name, this.cwd, this.user, true); }catch(e){
    if(e instanceof SysErr){ io.err("bash: " + name + ": " + e.message + "\n"); return e.code === "EACCES" ? 126 : 127; } throw e;
  }
  if(n.t === "d"){ io.err("bash: " + name + ": Is a directory\n"); return 126; }
  if(!this.fs.can(n, this.user, 1)){ io.err("bash: " + name + ": Permission denied\n"); return 126; }
  var base = name.split("/").pop();
  if(/^#!lab:/.test(n.data) && L.cmds[base]) return await this.runCmd(L.cmds[base], base, args, io);
  return await this.runScript(n, name, args, io);
};
Shell.prototype.findInPath = function(name){
  var path = (this.get("PATH") || "").split(":");
  for(var i = 0; i < path.length; i++){
    var p = (path[i] || ".") + "/" + name;
    try{ var n = this.fs.get(p, this.cwd, this.user, true); if(n.t === "f" && this.fs.can(n, this.user, 1)) return p; }catch(e){}
  }
  return null;
};
Shell.prototype.runCmd = async function(fn, name, args, io){
  try{ var r = await fn.call(this, args, io, name); return typeof r === "number" ? r : 0; }
  catch(e){
    if(e instanceof SysErr){ io.err(name + ": " + (e.extra || "") + (e.extra ? ": " : "") + e.message + "\n"); return 1; }
    if(e instanceof Exit || e instanceof Ctl) throw e;
    throw e;
  }
};
Shell.prototype.runScript = async function(node, name, args, io){
  var text = node.data, first = text.split("\n")[0];
  var sub = this.fork();
  sub.io = io; sub.script = name; sub.argv = [name].concat(args); sub.pid = this.nextPid++; sub.ppid = this.pid; sub.localStack = [];
  var m = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(first);
  var interp = m ? (m[1] === "/usr/bin/env" ? m[2] : m[1].split("/").pop()) : "bash";
  var st;
  if(/^python3?$/.test(interp)){
    return await L.builtins.python3.call(this, [name].concat(args), io, "python3");
  }
  try{ st = await sub.runText(text); }catch(e){ if(e instanceof Exit) st = e.code; else if(e instanceof Ctl && e.kind === "return") st = e.n; else if(e instanceof SysErr){ io.err(name + ": " + (e.extra ? e.extra : "") + (e.code === "PARAM" ? "" : (e.extra ? ": " : "") + e.message) + "\n"); st = 1; } else throw e; }
  await sub.runTrap("EXIT");
  this.nextPid = Math.max(this.nextPid, sub.nextPid); this.procs = sub.procs; this.steps = sub.steps;
  return st;
};
Shell.prototype.runTrap = async function(sig){
  var t = this.traps.get(sig);
  if(t && t !== "") { this.traps.delete(sig); try{ await this.runText(t); }catch(e){ if(!(e instanceof Exit)) throw e; } }
};

/* -------- top-level entry: run a script text, writing to this.out -------- */
Shell.prototype.run = async function(text, opts){
  opts = opts || {};
  this.steps = 0; this.cancelled = false; this.deadline = Date.now() + (opts.timeout || 25000);
  this.io = {in: opts.stdin === undefined ? null : opts.stdin, out: opts.out || this.out, err: opts.err || opts.out || this.out};
  var st;
  try{ st = await this.runText(text); }
  catch(e){
    if(e instanceof Exit){ st = e.code; if(st === -1) this.io.err("lab: stopped (too many steps; this command waits for something the lab cannot simulate)\n"); else if(st === 130) this.io.err("^C\n"); }
    else if(e instanceof SysErr){ this.io.err("bash: " + (e.extra ? e.extra : "") + (e.code === "PARAM" ? "" : (e.extra ? ": " : "") + e.message) + "\n"); st = 1; }
    else if(e instanceof Ctl){ st = 0; }
    else { this.io.err("lab: internal error: " + (e && e.message) + "\n"); st = 1; }
  }
  this.status = st;
  this.io = null;
  return st;
};
Shell.prototype.interrupt = function(){ this.cancelled = true; };

L.builtins = {};
L.cmds = {};
L.always = {};
L.unparse = function(n){
  if(!n) return "";
  switch(n.type){
    case "simple": return n.assigns.map(function(a){ return a.name + "=" + (a.value || ""); }).concat(n.words).join(" ");
    case "pipeline": return n.cmds.map(L.unparse).join(" | ");
    case "andor": return L.unparse(n.first) + n.rest.map(function(r){ return " " + r.op + " " + L.unparse(r.node); }).join("");
    case "subshell": return "(" + L.unparse(n.body) + ")";
    case "group": return "{ " + L.unparse(n.body) + "; }";
    case "list": return n.items.map(function(i){ return L.unparse(i.node); }).join("; ");
    default: return n.type;
  }
};

/* /proc/<pid> entries for simulated processes so `ls /proc/PID` and `cat /proc/PID/status` have something to show */
var PROC_NAMES = "arch_status attr autogroup auxv cgroup clear_refs cmdline comm coredump_filter cpu_resctrl_groups cpuset cwd environ exe fd fdinfo gid_map io limits loginuid map_files maps mem mountinfo mounts mountstats net ns numa_maps oom_adj oom_score oom_score_adj pagemap patch_state personality projid_map root sched schedstat sessionid setgroups smaps smaps_rollup stack stat statm status syscall task timens_offsets timers timerslack_ns uid_map wchan".split(" ");
L.procfs = function(sh, p){
  try{
    var base = "/proc/" + p.pid, name = p.cmd.split(" ")[0].replace(/^.*\//, "");
    sh.fs.mkdirp(base, "/", null, 0);
    var d = sh.fs.get(base, "/", null, true); d.uid = sh.user.uid; d.gid = sh.user.gid; d.mode = 493;
    PROC_NAMES.forEach(function(n){ sh.fs.writeFile(base + "/" + n, "", "/", null, false, 0); });
    sh.fs.writeFile(base + "/comm", name + "\n", "/", null, false, 0);
    sh.fs.writeFile(base + "/cmdline", p.cmd.split(" ").join("\0") + "\0", "/", null, false, 0);
    sh.fs.writeFile(base + "/status", "Name:\t" + name + "\nUmask:\t" + ("0000" + sh.umask.toString(8)).slice(-4) + "\nState:\tS (sleeping)\nTgid:\t" + p.pid + "\nPid:\t" + p.pid + "\nPPid:\t" + p.ppid + "\n", "/", null, false, 0);
    sh.fs.unlink(base + "/cwd", "/", null);
    sh.fs.symlink(sh.cwd, base + "/cwd", "/", null);
    p.procPath = base;
  }catch(e){}
};
L.procGone = function(sh, p){ try{ if(p.procPath){ var r = sh.fs.lookup(p.procPath, "/", null, false); if(r.node && r.parent) r.parent.kids.delete(r.name); } }catch(e){} };
