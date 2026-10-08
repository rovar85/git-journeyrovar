/* In-browser lab, part 4: the terminal dock, "Run in lab" buttons, Python bridge (Pyodide), saving. */

var L = window.LabCore, SysErr = L.SysErr;
var KEY = "agentschool.lab.v1";
var PYVER = "0.26.4", PYBASE = window.LAB_PYBASE || "https://cdn.jsdelivr.net/npm/pyodide@" + PYVER + "/full/";
var state = {sh: null, open: false, busy: false, hist: [], hi: 0, buf: "", setupDone: {}, dock: null, py: {state: "none", msg: ""}, queue: Promise.resolve()};

/* ------------------------------------------------------------ which commands the lab can run */
var REAL_ONLY = {kubectl: "Kubernetes", docker: "Docker", "docker-compose": "Docker", podman: "containers", terraform: "Terraform", helm: "Helm", ansible: "Ansible", "ansible-playbook": "Ansible", "ansible-vault": "Ansible", "ansible-inventory": "Ansible",
  git: "Git", curl: "the network", wget: "the network", ssh: "SSH", scp: "SSH", "ssh-keygen": "SSH", openssl: "OpenSSL", pwsh: "PowerShell", powershell: "PowerShell", jenkins: "Jenkins", promtool: "Prometheus", prometheus: "Prometheus", etcdctl: "etcd", crictl: "containers", ctr: "containers", nerdctl: "containers",
  kind: "Kubernetes", minikube: "Kubernetes", kubeadm: "Kubernetes", aws: "AWS", az: "Azure", gcloud: "Google Cloud", nc: "the network", ping: "the network", dig: "DNS", nslookup: "DNS", traceroute: "the network", iptables: "the kernel firewall", nft: "the kernel firewall", tcpdump: "the network", strace: "the kernel",
  ldd: "the toolchain", gcc: "the toolchain", make: "the toolchain", node: "Node.js", npm: "Node.js", pip: "pip", pip3: "pip", java: "Java", mvn: "Maven", go: "Go", rustc: "Rust", cargo: "Rust", vim: "an editor", nano: "an editor", vi: "an editor", emacs: "an editor", "mkfs.ext4": "disks", mkfs: "disks", fdisk: "disks", losetup: "disks", lsblk: "disks", blkid: "disks", ip6tables: "the kernel firewall", ip: "the network", ss: "the network", netstat: "the network", lsof: "open files", systemctl: "systemd", journalctl: "systemd", apt: "packages", "apt-get": "packages", dpkg: "packages", unshare: "namespaces", mount: "disks", umount: "disks", findmnt: "disks", top: "a TUI", lscpu: "hardware", getent: "name services", sysctl: "the kernel", modprobe: "the kernel", lsmod: "the kernel", dmesg: "the kernel", chroot: "namespaces", nsenter: "namespaces", systemd: "systemd", crontab: "cron", at: "cron", ntpq: "the network", openvpn: "the network", jq: "jq", yq: "yq", rsync: "rsync", zip: "zip", unzip: "zip", bzip2: "compression", xz: "compression", cowsay: "cowsay", htop: "a TUI", vmstat: "the kernel", iostat: "the kernel", sar: "the kernel", mpstat: "the kernel", perf: "the kernel", ulimit: "the kernel", "kubectx": "Kubernetes", "ab": "load tools", "hey": "load tools", "wrk": "load tools"};
var KEYWORDS = /^(if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|time|\{|\}|!|\[\[|\]\])$/;
function wordsOf(script){
  var out = [], defined = {};
  var text = script.replace(/\\\n/g, " ");
  var ls = text.split("\n"), heredoc = null;
  ls.forEach(function(line){
    if(heredoc){ if(line.trim() === heredoc) heredoc = null; else if(heredoc.py) {} return; }
    var hm = /<<-?\s*['"]?(\w+)['"]?/.exec(line);
    var stripped = line.replace(/'[^']*'|"[^"]*"/g, '""');
    var fm = /^\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\s*\)/.exec(stripped); if(fm) defined[fm[1]] = 1;
    stripped.split(/\||&&|;|\(|\)|`|\$\(|\|\|/).forEach(function(seg){
      var w = seg.trim().split(/\s+/); var k = 0;
      while(k < w.length && (/^[A-Za-z_]\w*(\[[^\]]*\])?\+?=/.test(w[k]) || /^\d*[<>]/.test(w[k]) || w[k] === "sudo" || /^-/.test(w[k]) && w[k - 1] === "sudo" || w[k] === "time" || w[k] === "nohup" || w[k] === "env" || w[k] === "!")) k++;
      if(w[k - 1] === "sudo" && w[k] === "-u"){ k += 2; }
      var first = w[k]; if(!first || KEYWORDS.test(first) || /^[#>}<]/.test(first) || /^\$/.test(first) || /^\d/.test(first) || first === "") return;
      out.push(first.replace(/^\\/, ""));
    });
    if(hm){ heredoc = hm[1]; }
  });
  return {words: out, defined: defined};
}
var PY_UNSUPPORTED = /^\s*(?:import|from)\s+(torch|tensorflow|transformers|jax|openai|anthropic|mlflow|flask|fastapi|uvicorn|requests|boto3|kubernetes|docker|yaml|ray|vllm|langchain|datasets|peft|accelerate|bitsandbytes|onnxruntime|cv2|PIL)\b/m;
function compat(script){
  var info = wordsOf(script), bad = {}, py = false, extra = "";
  info.words.forEach(function(w){
    var base = w.replace(/^.*\//, "");
    if(info.defined[w] || /^\.\//.test(w) || /^~?\//.test(w)) { if(/^\.\//.test(w) || /^\//.test(w)) { if(!L.cmds[base] && !L.builtins[base]) return; } else return; }
    if(w === "python3" || w === "python") { py = true; return; }
    if(REAL_ONLY[base]){ bad[base] = REAL_ONLY[base]; return; }
    if(!L.cmds[base] && !L.builtins[base] && !info.defined[base] && !/^[A-Z]/.test(base) && !/[=:@]/.test(base) && !/^[.\d({\[]/.test(base) && !/^(true|false)$/.test(base)){ bad[base] = "a command the lab does not have"; }
  });
  if(py && PY_UNSUPPORTED.test(script)){ var m = PY_UNSUPPORTED.exec(script); bad["python:" + m[1]] = "the Python package " + m[1]; }
  return {ok: !Object.keys(bad).length, bad: bad, py: py};
}

/* ------------------------------------------------------------ saving */
function save(){
  try{
    if(!state.sh) return;
    var js = JSON.stringify({fs: state.sh.fs.toJSON(), cwd: state.sh.cwd, hist: state.hist.slice(-200), vars: (function(){ var o = {}; state.sh.vars.forEach(function(v, k){ if(v.x && !/^(PWD|OLDPWD|PATH|HOME|USER|LOGNAME|SHELL|HOSTNAME|LANG|TERM|EDITOR)$/.test(k)) o[k] = v.v; }); return o; })(), setupDone: state.setupDone});
    if(js.length < 3000000) localStorage.setItem(KEY, js);
  }catch(e){}
}
function loadSaved(){ try{ var j = localStorage.getItem(KEY); return j ? JSON.parse(j) : null; }catch(e){ return null; } }
var saveTimer = null; function saveSoon(){ clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }

/* ------------------------------------------------------------ terminal output */
function esc(s){ return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function put(text, cls){
  var out = state.dock && state.dock.out; if(!out) return;
  if(text.indexOf("\x1b[2J") >= 0){ out.textContent = ""; text = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""); }
  text = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r(?!\n)/g, "");
  if(!text) return;
  var last = out.lastChild;
  if(last && last.nodeType === 1 && last.className === (cls || "o")){ last.textContent += text; }
  else { var sp = document.createElement("span"); sp.className = cls || "o"; sp.textContent = text; out.appendChild(sp); }
  while(out.childNodes.length > 800) out.removeChild(out.firstChild);
  out.parentNode.scrollTop = out.parentNode.scrollHeight;
}
function prompt(){
  var sh = state.sh, cwd = sh.cwd, home = sh.get("HOME") || "/home/student";
  if(cwd === home) cwd = "~"; else if(cwd.indexOf(home + "/") === 0) cwd = "~" + cwd.slice(home.length);
  return sh.user.name + "@lab:" + cwd + (sh.user.uid === 0 ? "# " : "$ ");
}
function setPrompt(){ if(state.dock) state.dock.ps.textContent = state.buf ? "> " : prompt(); }

/* ------------------------------------------------------------ running a command line */
function runLine(text, opts){
  opts = opts || {};
  var sh = state.sh;
  state.queue = state.queue.then(async function(){
    state.busy = true; state.dock && state.dock.root.classList.add("busy");
    sh.history = state.hist;
    var out = function(s){ put(s, "o"); }, err = function(s){ put(s, "e"); };
    sh.followFlush = function(){ return L.yield(); };
    var st;
    try{ st = await sh.run(text, {out: out, err: err}); }catch(e){ err("lab: internal error: " + (e && e.message) + "\n"); st = 1; }
    state.busy = false; state.dock && state.dock.root.classList.remove("busy");
    setPrompt(); saveSoon();
    return st;
  });
  return state.queue;
}
function submit(line){
  var text = state.buf ? state.buf + "\n" + line : line;
  put((state.buf ? "> " : prompt()) + line + "\n", "c");
  if(text.trim() === ""){ state.buf = ""; setPrompt(); return; }
  if(L.incomplete(text)){ state.buf = text; setPrompt(); return; }
  state.buf = "";
  var h = text.replace(/\n/g, "; ");
  if(state.hist[state.hist.length - 1] !== text) state.hist.push(text);
  state.hi = state.hist.length;
  if(/^\s*(reset|labreset)\s*$/.test(text)){ resetLab(); return; }
  runLine(text);
}

/* ------------------------------------------------------------ lab-only commands */
L.builtins.labinfo = async function(args, io){
  io.out("Agent School lab, shell engine v1\n");
  io.out("  shell:        JavaScript bash subset, " + Object.keys(L.cmds).length + " commands + " + Object.keys(L.builtins).length + " builtins\n");
  io.out("  WebAssembly:  " + (typeof WebAssembly === "object" ? "yes" : "no") + "\n");
  io.out("  localStorage: " + (function(){ try{ localStorage.setItem("_t", "1"); localStorage.removeItem("_t"); return "yes (your work is saved in this browser)"; }catch(e){ return "no (work is lost when you close the tab)"; } })() + "\n");
  io.out("  Python:       " + state.py.state + (state.py.msg ? " (" + state.py.msg + ")" : "") + "\n");
  io.out("  sha256sum:    " + (typeof crypto !== "undefined" && crypto.subtle ? "yes" : "no") + "\n");
  if(args[0] === "--net"){
    io.out("  jsdelivr:     ");
    try{ var ctl = new AbortController(); setTimeout(function(){ ctl.abort(); }, 6000); var r = await fetch(PYBASE + "pyodide-lock.json", {method: "GET", signal: ctl.signal}); io.out(r.ok ? "reachable (Python can load)\n" : "HTTP " + r.status + "\n"); }
    catch(e){ io.out("NOT reachable: " + (e && e.message) + "\n"); }
  } else io.out("  (run `labinfo --net` to test whether Python can be downloaded)\n");
  return 0;
};
L.builtins.labhelp = function(args, io){
  io.out("Lab help\n  Run lesson commands with the 'Run in lab' button above each terminal block, or type here.\n  Up/Down = history, Tab = complete, Ctrl-C = stop a running command, Ctrl-L = clear.\n  `reset` starts over (fresh files). Your files are saved in this browser between visits.\n  This is a simulation of Linux in JavaScript: `labinfo` shows what is available.\n  `sleep` runs about 7x faster here. No network, no systemd, no containers: those lessons say 'needs a real machine'.\n");
  return 0;
};
L.builtins.lab = function(args, io){ if(args[0] === "info") return L.builtins.labinfo.call(this, args.slice(1), io); return L.builtins.labhelp.call(this, args, io); };

/* ------------------------------------------------------------ Python (Pyodide) */
var ROOTS = ["/home/student", "/tmp", "/srv", "/opt", "/mnt"];
function loadScript(src){ return new Promise(function(res, rej){ var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function(){ rej(new Error("could not load " + src)); }; document.head.appendChild(s); }); }
function loadPython(){
  if(state.py.promise) return state.py.promise;
  state.py.state = "loading"; refreshBar();
  put("Loading Python (about 10 MB, once)...\n", "n");
  state.py.promise = (async function(){
    try{
      if(typeof WebAssembly !== "object") throw new Error("this browser has no WebAssembly");
      if(!window.loadPyodide) await loadScript(PYBASE + "pyodide.js");
      var py = await window.loadPyodide({indexURL: PYBASE});
      state.py.inst = py; state.py.state = "ready"; state.py.msg = "Python " + py.runPython("import sys; sys.version.split()[0]"); refreshBar();
      put("Python is ready (" + state.py.msg + ").\n", "n");
      return py;
    }catch(e){
      state.py.state = "failed"; state.py.msg = (e && e.message) || String(e); state.py.promise = null; refreshBar();
      put("Python could not load: " + state.py.msg + "\nThe rest of the lab still works. Run `labinfo --net` and send me the output.\n", "e");
      throw e;
    }
  })();
  return state.py.promise;
}
function enc(s){ return new TextEncoder().encode(s); }
function mirrorToPy(sh, py){
  var FS = py.FS;
  function rmtree(p){ try{ var st = FS.stat(p); if(FS.isDir(st.mode)){ FS.readdir(p).forEach(function(n){ if(n !== "." && n !== "..") rmtree(p + "/" + n); }); if(p !== "/tmp") FS.rmdir(p); } else FS.unlink(p); }catch(e){} }
  ROOTS.forEach(function(r){
    rmtree(r);
    try{ var parts = r.split("/").filter(Boolean), cur = ""; parts.forEach(function(x){ cur += "/" + x; try{ FS.mkdir(cur); }catch(e){} }); }catch(e){}
    var rn; try{ rn = sh.fs.get(r, "/", null, true); }catch(e){ return; }
    (function rec(n, p){
      if(n.t === "d") n.kids.forEach(function(v, k){ var q = p + "/" + k; if(v.t === "d"){ try{ FS.mkdir(q); }catch(e){} rec(v, q); } else if(v.t === "f"){ try{ FS.writeFile(q, enc(v.data)); }catch(e){} } });
    })(rn, r);
  });
}
function mirrorFromPy(sh, py){
  var FS = py.FS, seen = {};
  ROOTS.forEach(function(r){
    (function rec(p){
      var names; try{ names = FS.readdir(p); }catch(e){ return; }
      names.forEach(function(n){
        if(n === "." || n === "..") return;
        var q = (p === "/" ? "" : p) + "/" + n, st; try{ st = FS.stat(q); }catch(e){ return; }
        seen[q] = 1;
        if(FS.isDir(st.mode)){ if(!sh.fs.exists(q, "/", null)){ try{ sh.fs.mkdirp(q, "/", null, 0); var d = sh.fs.get(q, "/", null, true); d.uid = sh.user.uid; d.gid = sh.user.gid; d.mode = 493; }catch(e){} } rec(q); }
        else if(FS.isFile(st.mode)){
          var data; try{ data = new TextDecoder("utf-8").decode(FS.readFile(q)); }catch(e){ return; }
          var ex = sh.fs.lookup(q, "/", null, true).node;
          if(ex){ if(ex.data !== data){ ex.data = data; ex.mtime = sh.fs.tick(); } }
          else { var nn = sh.fs.writeFile(q, data, "/", null, false, 0); nn.uid = sh.user.uid; nn.gid = sh.user.gid; nn.mode = 420; }
        }
      });
    })(r);
    // removed in Python?
    var rn; try{ rn = sh.fs.get(r, "/", null, true); }catch(e){ return; }
    (function prune(n, p){
      if(n.t !== "d") return;
      Array.from(n.kids.keys()).forEach(function(k){ var q = p + "/" + k, v = n.kids.get(k); if(v.t === "l") return; if(!seen[q]){ n.kids.delete(k); if(v.t === "d") n.nlink--; } else prune(v, q); });
    })(rn, r);
  });
}
L.python = async function(args, io){
  var sh = this, mode = null, code = null, script = null, rest = [];
  for(var i = 0; i < args.length; i++){
    var a = args[i];
    if(a === "-c"){ mode = "c"; code = args[++i]; rest = args.slice(i + 1); break; }
    if(a === "-m"){ mode = "m"; script = args[++i]; rest = args.slice(i + 1); break; }
    if(a === "-V" || a === "--version"){ io.out("Python 3.12.1\n"); return 0; }
    if(a === "-"){ mode = "stdin"; rest = args.slice(i + 1); break; }
    if(/^-[uBEsS]+$/.test(a)) continue;
    if(a.charAt(0) === "-") continue;
    mode = "file"; script = a; rest = args.slice(i + 1); break;
  }
  if(mode === null){ if(io.in){ mode = "stdin"; } else { io.err("python3: the lab has no interactive Python prompt; use python3 -c '...' or a script file\n"); return 1; } }
  if(mode === "stdin"){ code = io.in || ""; }
  if(mode === "file"){ try{ code = sh.fs.readFile(script, sh.cwd, sh.user); }catch(e){ if(e instanceof SysErr){ io.err("python3: can't open file '" + sh.fs.norm(script, sh.cwd) + "': [Errno 2] No such file or directory\n"); return 2; } throw e; } }
  if(mode === "m" && /^(http\.server|venv|pip|ensurepip|smtpd)$/.test(script)){ io.err("python3: -m " + script + " needs a real machine (network, processes or package installs)\n"); return 1; }
  var py;
  try{ py = await loadPython(); }catch(e){ io.err("python3: the Python engine is not available here (" + state.py.msg + ")\n"); return 127; }
  var out = "", errs = "";
  try{ await py.loadPackagesFromImports(code || script || "", {messageCallback: function(){}, errorCallback: function(){}}); }catch(e){}
  mirrorToPy(sh, py);
  py.setStdout({batched: function(s){ io.out(s + "\n"); }});
  py.setStderr({batched: function(s){ io.err(s + "\n"); }});
  var stdinLines = (io.in || "").split("\n"); var si = 0;
  py.setStdin({stdin: function(){ return si < stdinLines.length && !(si === stdinLines.length - 1 && stdinLines[si] === "") ? stdinLines[si++] : null; }});
  py.globals.set("_lab_mode", mode); py.globals.set("_lab_code", code || ""); py.globals.set("_lab_script", script || ""); py.globals.set("_lab_argv", rest); py.globals.set("_lab_cwd", sh.cwd);
  py.globals.set("_lab_env", Object.assign({}, sh.env()));
  var status = 0;
  try{
    var res = await py.runPythonAsync([
      "import sys, os, runpy, traceback",
      "os.environ.update(dict(_lab_env.to_py()) if hasattr(_lab_env, 'to_py') else _lab_env)",
      "os.chdir(_lab_cwd)",
      "_rc = 0",
      "_argv = list(_lab_argv.to_py()) if hasattr(_lab_argv, 'to_py') else list(_lab_argv)",
      "if _lab_mode == 'file': sys.argv = [_lab_script] + _argv",
      "elif _lab_mode == 'm': sys.argv = [_lab_script] + _argv",
      "elif _lab_mode == 'c': sys.argv = ['-c'] + _argv",
      "else: sys.argv = ['-']",
      "sys.path.insert(0, os.getcwd())",
      "try:",
      "    if _lab_mode == 'm': runpy.run_module(_lab_script, run_name='__main__', alter_sys=True)",
      "    else: exec(compile(_lab_code, _lab_script if _lab_mode == 'file' else '<string>', 'exec'), {'__name__': '__main__'})",
      "except SystemExit as e:",
      "    _rc = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)",
      "    if isinstance(e.code, str): print(e.code, file=sys.stderr)",
      "except BaseException:",
      "    _rc = 1",
      "    _tb = traceback.format_exc().split('\\n')",
      "    print('Traceback (most recent call last):', file=sys.stderr)",
      "    print('\\n'.join(l for l in _tb[1:] if 'File \"<exec>\"' not in l and '/lib/python' not in l and 'runpy' not in l).rstrip(), file=sys.stderr)",
      "finally:",
      "    sys.stdout.flush(); sys.stderr.flush()",
      "_rc"
    ].join("\n"));
    status = typeof res === "number" ? res : 0;
  }catch(e){ io.err("python3: " + (e && e.message ? e.message : e) + "\n"); status = 1; }
  mirrorFromPy(sh, py);
  return status;
};

/* ------------------------------------------------------------ tab completion */
function complete(){
  var inp = state.dock.inp, v = inp.value.slice(0, inp.selectionStart), sh = state.sh;
  var m = /(\S*)$/.exec(v), word = m[1], before = v.slice(0, v.length - word.length);
  var first = !/\S/.test(before) || /[|;&(]\s*$/.test(before);
  var cands = [];
  if(first && word.indexOf("/") < 0){
    var names = {}; Object.keys(L.builtins).concat(Object.keys(L.cmds)).forEach(function(n){ names[n] = 1; }); sh.funcs.forEach(function(_, k){ names[k] = 1; }); sh.aliases.forEach(function(_, k){ names[k] = 1; });
    cands = Object.keys(names).filter(function(n){ return n.indexOf(word) === 0 && !/^(lab|labinfo|labhelp)$/.test(n) || n === word; }).sort();
  } else {
    var slash = word.lastIndexOf("/"), dirPart = slash >= 0 ? word.slice(0, slash + 1) : "", base = word.slice(slash + 1);
    try{
      var dn = sh.fs.get(dirPart || ".", sh.cwd, sh.user, true);
      if(dn.t === "d") dn.kids.forEach(function(n, k){ if(k.indexOf(base) === 0 && (base || k.charAt(0) !== ".")) cands.push(dirPart + k + (n.t === "d" ? "/" : "")); });
    }catch(e){}
    cands.sort();
  }
  if(!cands.length) return;
  var pre = cands[0]; cands.forEach(function(c){ while(c.indexOf(pre) !== 0) pre = pre.slice(0, -1); });
  if(cands.length === 1){ var rep = cands[0] + (/\/$/.test(cands[0]) ? "" : " "); inp.value = before + rep + inp.value.slice(inp.selectionStart); }
  else if(pre.length > word.length) inp.value = before + pre + inp.value.slice(inp.selectionStart);
  else { put(prompt() + inp.value + "\n", "c"); put(cands.map(function(c){ return c.replace(/^.*\/(?=.)/, ""); }).join("  ") + "\n", "o"); }
}

/* ------------------------------------------------------------ dock UI */
function refreshBar(){
  if(!state.dock) return;
  var b = state.dock.pybtn;
  b.textContent = state.py.state === "ready" ? "Python ready" : state.py.state === "loading" ? "Python loading..." : state.py.state === "failed" ? "Python: retry" : "Load Python";
  b.disabled = state.py.state === "loading" || state.py.state === "ready";
}
function buildDock(){
  var root = document.createElement("div"); root.id = "labdock"; root.className = "labdock"; root.hidden = true;
  root.innerHTML = '<div class="lab-head"><b>Linux lab</b> <span class="muted">runs in your browser; nothing is installed</span><span class="lab-sp"></span>' +
    '<button type="button" data-a="py">Load Python</button><button type="button" data-a="clear">Clear</button><button type="button" data-a="reset">Reset</button><button type="button" data-a="help">?</button><button type="button" data-a="size" aria-label="Taller or shorter">&#8597;</button><button type="button" data-a="close" aria-label="Close the lab">&times;</button></div>' +
    '<div class="lab-body" tabindex="-1"><pre class="lab-out" aria-live="polite"></pre></div>' +
    '<div class="lab-in"><label class="sr" for="labinput">Lab command line</label><span class="lab-ps"></span><input id="labinput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Command line"></div>';
  document.body.appendChild(root);
  var d = state.dock = {root: root, out: root.querySelector(".lab-out"), body: root.querySelector(".lab-body"), inp: root.querySelector("input"), ps: root.querySelector(".lab-ps"), pybtn: root.querySelector('[data-a="py"]')};
  root.addEventListener("click", function(e){
    var a = e.target && e.target.dataset && e.target.dataset.a;
    if(a === "close") toggle(false);
    else if(a === "clear") d.out.textContent = "";
    else if(a === "reset") { if(confirm("Reset the lab? Your files in the lab go back to the start.")) resetLab(); }
    else if(a === "help") runLine("labhelp");
    else if(a === "py") loadPython().catch(function(){});
    else if(a === "size") root.classList.toggle("tall");
    else if(!window.getSelection().toString()) d.inp.focus();
  });
  d.inp.addEventListener("keydown", function(e){
    if(e.key === "Enter"){ e.preventDefault(); var v = d.inp.value; d.inp.value = ""; submit(v); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); if(state.hi > 0){ state.hi--; d.inp.value = (state.hist[state.hi] || "").replace(/\n/g, "; "); } }
    else if(e.key === "ArrowDown"){ e.preventDefault(); if(state.hi < state.hist.length - 1){ state.hi++; d.inp.value = (state.hist[state.hi] || "").replace(/\n/g, "; "); } else { state.hi = state.hist.length; d.inp.value = ""; } }
    else if(e.key === "Tab"){ e.preventDefault(); complete(); }
    else if(e.ctrlKey && (e.key === "c" || e.key === "C")){ e.preventDefault(); if(state.busy){ state.sh.interrupt(); } else { put(prompt() + d.inp.value + "^C\n", "c"); d.inp.value = ""; state.buf = ""; setPrompt(); } }
    else if(e.ctrlKey && (e.key === "l" || e.key === "L")){ e.preventDefault(); d.out.textContent = ""; }
    else if(e.ctrlKey && (e.key === "d" || e.key === "D") && !d.inp.value){ e.preventDefault(); toggle(false); }
    else if(e.key === "Escape"){ toggle(false); }
  });
  refreshBar();
}
function ensureShell(fresh){
  var saved = fresh ? null : loadSaved(), sh;
  if(saved && saved.fs){ try{ sh = L.boot(function(){}, saved.fs); if(saved.cwd) sh.cwd = saved.cwd; sh.set("PWD", sh.cwd, true); Object.keys(saved.vars || {}).forEach(function(k){ sh.set(k, saved.vars[k], true); }); state.hist = saved.hist || []; state.setupDone = saved.setupDone || {}; }catch(e){ sh = null; } }
  if(!sh){ sh = L.boot(function(){}); state.hist = []; state.setupDone = {}; }
  state.sh = sh; state.hi = state.hist.length; state.buf = "";
}
function resetLab(){
  try{ localStorage.removeItem(KEY); }catch(e){}
  state.queue = state.queue.then(function(){ ensureShell(true); put("The lab was reset: fresh files, starting in ~/lab.\n", "n"); setPrompt(); });
}
function toggle(open){
  if(!state.dock) { buildDock(); ensureShell(false); put("Welcome. This is a Linux-like shell running inside this page. Type `labhelp`, or use 'Run in lab' on any terminal block.\n", "n"); }
  state.open = open === undefined ? !state.open : open;
  state.dock.root.hidden = !state.open;
  document.body.classList.toggle("lab-open", state.open);
  var t = document.getElementById("labtoggle"); if(t) t.setAttribute("aria-pressed", state.open ? "true" : "false");
  if(state.open){ setPrompt(); state.dock.inp.focus(); }
}

/* ------------------------------------------------------------ "Run in lab" buttons */
function setupFor(lessonId){
  var el = document.querySelector('script.labsetup[data-for="' + lessonId + '"]');
  if(!el) return [];
  try{ return JSON.parse(el.textContent); }catch(e){ return []; }
}
function runInLab(term, btn){
  var script = term.dataset.copy || "", sec = term.closest("section.chapter"), lid = sec ? sec.id : "";
  toggle(true);
  var sh = state.sh;
  state.queue = state.queue.then(async function(){
    if(lid && !state.setupDone[lid]){
      var setups = setupFor(lid);
      if(setups.length){
        put("(preparing this lesson's practice files)\n", "n");
        var fix = sh.cwd; sh.cwd = (sh.get("HOME") || "/home/student") + "/lab"; sh.set("PWD", sh.cwd, true);
        for(var i = 0; i < setups.length; i++){ sh.history = state.hist; await sh.run(setups[i], {out: function(){}, err: function(s){ put(s, "e"); }}); }
        sh.cwd = fix; sh.set("PWD", fix, true);
      }
      state.setupDone[lid] = true;
    }
  });
  state.queue = state.queue.then(function(){
    var prs = term.querySelectorAll(".pr");
    prs.forEach(function(pr){ var cm = pr.nextElementSibling; put((pr.textContent === "$" ? prompt() : "> ") + (cm ? cm.textContent : "") + "\n", "c"); });
  });
  runLine(script);
}
function decorate(){
  document.querySelectorAll(".term").forEach(function(t){
    var bar = t.querySelector(".term-bar"); if(!bar || t.dataset.lab) return;
    if(!t.dataset.copy) return;
    t.dataset.lab = "1";
    var c = compat(t.dataset.copy);
    var b = document.createElement("button"); b.type = "button";
    if(c.ok){
      b.className = "copy run"; b.textContent = "Run in lab" + (c.py ? " (uses Python)" : "");
      b.addEventListener("click", function(){ runInLab(t, b); });
      bar.insertBefore(b, bar.querySelector(".copy"));
    } else {
      b.className = "copy noRun"; b.textContent = "Needs a real machine";
      var why = Object.keys(c.bad).map(function(k){ return k.replace(/^python:/, "") + " (" + c.bad[k] + ")"; }).slice(0, 4).join(", ");
      b.title = "The lab cannot run: " + why + ". See the Lab guide for free real-machine options.";
      b.addEventListener("click", function(){ var g = "#linux-13"; location.hash = g; });
      bar.insertBefore(b, bar.querySelector(".copy"));
    }
  });
  if(!document.getElementById("labtoggle")){
    var strip = document.querySelector(".strip-in"), link = document.querySelector(".studylink");
    if(strip && link){ var tg = document.createElement("button"); tg.type = "button"; tg.id = "labtoggle"; tg.className = "studylink labbtn"; tg.textContent = "Lab"; tg.setAttribute("aria-pressed", "false"); tg.title = "Open the in-browser Linux lab (Ctrl+`)"; tg.addEventListener("click", function(){ toggle(); }); link.parentNode.insertBefore(tg, link.nextSibling); }
  }
}
H.labDecorate = decorate;
document.addEventListener("keydown", function(e){ if(e.ctrlKey && e.key === "`"){ e.preventDefault(); toggle(); } });
L.ui = {state: state, runLine: runLine, compat: compat, toggle: toggle, loadPython: loadPython};
