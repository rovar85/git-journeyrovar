/* Study toolkit: gather -> refine -> drill -> round 2, built into the course.
   - Per-lesson study loop, notes and a drill link
   - Study view: Method, Drill (spaced repetition), Maps (+ sketch pad), Notebook (notes, practice log, exports)
   - Flashcards are generated from what is already in the lessons (quiz questions, recap sentences, command guides)
   Everything is stored in this browser (localStorage). */

var KEY = "agentschool-";
var STUDY = {cards: null, chapters: [], byId: {}};
var TYPE_NAME = {quiz: "Quiz question", cloze: "Recap, fill the gap", cmd: "Command", explain: "Explain it"};
var SCENARIO_TRACKS = {scenarios: 1, cloudsenior: 1};
var BOX_DAYS = [0, 0, 1, 3, 7, 21, 60];

function jget(k, d){ try{ var v = H.store(KEY + k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function jset(k, v){ H.store(KEY + k, JSON.stringify(v)); }
function hash(s){ var h = 5381, i; for(i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
function txt(el){ return (el.textContent || "").replace(/\s+/g, " ").trim(); }
function lessonLink(id){ return '<a href="#' + id + '">'; }
function chapterFor(track, n){
  var i, c;
  for(i = 0; i < STUDY.chapters.length; i++){ c = STUDY.chapters[i]; if(c.track === track && Number(c.n) === Number(n)) return c; }
  return null;
}
function trackName(id){ var t = (window.TRACKS || []).filter(function(x){ return x.id === id; })[0]; return t ? t.name : id; }

/* ---------- gather the lessons and make the cards ---------- */
function collect(){
  if(STUDY.cards) return STUDY.cards;
  var cards = [], seenCmd = {};
  STUDY.chapters = [];
  H.$$(".chapter").forEach(function(el){
    var c = {id: el.id, track: el.dataset.track, n: Number(el.dataset.n), title: el.dataset.road || el.dataset.title || el.id, el: el};
    STUDY.chapters.push(c); STUDY.byId[c.id] = c;
    var qd = H.$("script.quizdata", el), qs = null;
    if(qd){ try{ qs = JSON.parse(qd.textContent); }catch(e){} }
    if(!qs && window.Q) qs = window.Q[c.id];
    (qs || []).forEach(function(q){
      if(!q || !q.o || q.a === undefined) return;
      cards.push({id: hash(c.id + "q" + q.q), lesson: c.id, track: c.track, type: "quiz", front: q.q, back: q.o[q.a] + ". " + (q.f || "")});
    });
    H.$$(".recap li, .recap p", el).forEach(function(li){
      var b = H.$("b, strong", li), full = txt(li);
      if(!b || full.length < 28 || full.length > 320) return;
      var gap = txt(b); if(gap.length < 2 || gap.length > 60) return;
      var front = full.replace(gap, "[ ... ]");
      if(front === full) return;
      cards.push({id: hash(c.id + "c" + full), lesson: c.id, track: c.track, type: "cloze", front: front, back: full});
    });
    H.$$(".goals li", el).forEach(function(li){
      var t = txt(li); if(t.length < 20 || t.length > 260) return;
      cards.push({id: hash(c.id + "e" + t), lesson: c.id, track: c.track, type: "explain", front: "Explain in your own words: " + t, back: "Say it out loud or write it, then re-read the lesson section and compare. Be honest when rating."});
    });
    H.$$(".cmdguide dl", el).forEach(function(dl){
      var items = H.$$("dt", dl);
      items.forEach(function(dt){
        var cmd = txt(dt), dd = dt.nextElementSibling; if(!dd || dd.tagName !== "DD") return;
        if(seenCmd[cmd]) return; seenCmd[cmd] = 1;
        cards.push({id: hash("cmd" + cmd), lesson: c.id, track: c.track, type: "cmd", front: "What does this do, and when would you use it?  " + cmd, back: txt(dd)});
      });
    });
  });
  STUDY.cards = cards;
  return cards;
}
function cardState(id){ return jget("card-" + id, null); }
function saveState(id, s){ jset("card-" + id, s); }
function isDue(c, now){ var s = cardState(c.id); return !s || s.due <= now; }

function counts(filter){
  var now = Date.now(), all = collect().filter(filter || function(){ return true; }), due = 0, fresh = 0, mastered = 0, missed = 0;
  all.forEach(function(c){
    var s = cardState(c.id);
    if(!s){ fresh++; due++; } else { if(s.due <= now) due++; if(s.box >= 4) mastered++; if(s.wrong > 0 && s.box < 4) missed++; }
  });
  return {total: all.length, due: due, fresh: fresh, mastered: mastered, missed: missed};
}

/* ---------- per-lesson study loop ---------- */
var LOOP = [
  ["g", "Gathered", "Read it once, fast, and run the commands. Dump notes below."],
  ["r", "Refined", "Drew the map, wrote or reviewed the flashcards."],
  ["d", "Drilled", "Quiz, 'Your turn' tasks and cards until the theory stuck."],
  ["x", "Round 2", "Redid it with scenarios, new tools and edge cases."]
];
function decorate(chapters){
  collect();
  chapters.forEach(function(el){
    var id = el.id, head = H.$(".chapter-head", el); if(!head) return;
    var box = document.createElement("div"); box.className = "loopbox";
    var state = jget("loop-" + id, {}), n = counts(function(c){ return c.lesson === id; }).total;
    box.innerHTML = '<div class="loopline"><b>Study loop</b>' + LOOP.map(function(s){
        return '<label title="' + H.esc(s[2]) + '"><input type="checkbox" data-k="' + s[0] + '"' + (state[s[0]] ? " checked" : "") + '> ' + s[1] + '</label>';
      }).join("") +
      '<a class="btn ghost small" href="#study/drill/' + id + '">Drill this lesson (' + n + ' cards)</a></div>' +
      '<details class="notes"><summary>My notes for this lesson</summary><textarea rows="5" placeholder="Dump raw notes here while you gather. Refine them later in Study, Notebook."></textarea><small>Saved in this browser only.</small></details>';
    head.insertAdjacentElement("afterend", box);
    H.$$("input", box).forEach(function(i){ i.addEventListener("change", function(){ var s = jget("loop-" + id, {}); s[i.dataset.k] = i.checked ? 1 : 0; jset("loop-" + id, s); }); });
    var ta = H.$("textarea", box), saved = H.store(KEY + "notes-" + id);
    if(saved){ ta.value = saved; H.$("details", box).open = true; }
    var timer = null;
    ta.addEventListener("input", function(){ clearTimeout(timer); timer = setTimeout(function(){ H.store(KEY + "notes-" + id, ta.value); }, 400); });
  });
  var hubDue = H.$("#study-due");
  if(hubDue){ var c = counts(); hubDue.textContent = c.total + " flashcards made from the lessons; " + c.due + " due now."; }
}

/* ---------- the Study view ---------- */
var TABS = [["method", "Method"], ["drill", "Drill"], ["maps", "Maps"], ["notebook", "Notebook"]];
var DRILL = {queue: [], cur: null, shown: false, done: 0, scope: "all", types: {quiz: 1, cloze: 1, cmd: 1, explain: 0}, mode: "due"};

function show(root, hashRest){
  collect();
  var parts = (hashRest || "").split("/").filter(Boolean), tab = parts[0] || "method";
  if(!TABS.some(function(t){ return t[0] === tab; })) tab = "method";
  root.innerHTML = '<div style="padding-top:28px"><a href="#hub">← All tracks</a><span class="hand" style="display:block;margin-top:14px">Gather, refine, drill, then round 2</span><h1>Study toolkit</h1><nav class="studytabs" role="tablist">' +
    TABS.map(function(t){ return '<a role="tab" href="#study/' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + '</a>'; }).join("") + '</nav><div id="studybody"></div></div>';
  var body = H.$("#studybody", root);
  if(tab === "method") methodTab(body);
  else if(tab === "drill") drillTab(body, parts[1]);
  else if(tab === "maps") mapsTab(body, parts[1]);
  else notebookTab(body);
  window.scrollTo(0, 0);
}

function methodTab(body){
  var c = counts();
  body.innerHTML =
    '<p class="lede">A method that works for a lot of material: treat learning like a data pipeline. <b>Gather</b> quickly, <b>refine</b> into something compact, <b>drill</b> until it sticks, then <b>run it again</b> on the hard parts. This course has a tool for each step.</p>' +
    '<div class="loopgrid">' +
    step("1", "Gather", "Go through a track fast, the way you would watch a course at speed: read the goals and recap, run the commands, skim the rest. Two focused days is a good first pass.", ["Use the <b>Study loop</b> boxes on each lesson and the <b>notes</b> field to dump raw notes while you read.", "Do not stop to perfect anything. The goal is coverage and a list of what confused you."]) +
    step("2", "Refine", "Turn the pile into a map and a few cards. Security, networking and platforms are built in layers, so follow one request or one object from start to end and hang every topic on a hop.", ["Open <a href=\"#study/maps\">Maps</a>: the <b>round-up lesson</b> at the end of each track has a ready-made end-to-end map. Draw yours first on the sketch pad (or paper, or an iPad canvas), then compare.", "The <a href=\"#study/drill\">Drill</a> deck is generated from every quiz question, recap sentence and command guide, so you start with " + c.total + " cards and add your own gaps in <a href=\"#study/notebook\">Notebook</a>."]) +
    step("3", "Drill", "Pace the room with flashcards until the theory sticks, then do the practical drills: the 'Your turn' tasks, the practice sets and the scenario questions.", ["Rate each card honestly: Again, Hard, Good, Easy. The deck schedules cards you struggle with sooner (1, 3, 7, 21 days).", "Use the track's <b>practice sets</b> (for example the CKA practice set) and the <b>scenarios</b> tracks as mock exams."]) +
    step("4", "Round 2", "Run the pipeline again, but only on what is left: long scenarios, new tools, edge cases and odd details. Redo the mocks, then time yourself.", ["In Drill, choose <b>Round 2: missed cards</b>, or pick the scenario tracks only.", "Practise the long procedures until they are boring. Each round-up lesson lists them under 'Round 2'."]) +
    '</div>' +
    '<h3>Tips that apply to every track</h3><ul>' +
    '<li><b>Map every scenario to a documentation page</b>, or drill it until you do not need to look. Know where the answer lives.</li>' +
    '<li><b>Long procedures first.</b> The ones with many steps (backup and restore, upgrades, encryption setup, audit logging) are the ones that cost time. Repeat them until they are dull.</li>' +
    '<li><b>New tool, three pages.</b> When a tool\'s docs link to eight resources, you rarely need more than one to three pages: the concept page, the main task page and the reference for the object you configure. The round-up lessons list those for each track.</li>' +
    '<li><b>Know your recovery move.</b> If a component will not start, know which log or command shows why (for example the kubelet journal when a static pod manifest is wrong).</li>' +
    '<li><b>Make the editor friendly.</b> In Vim, <code>:set mouse=a</code> turns the mouse on, and <code>:set expandtab tabstop=2 shiftwidth=2</code> avoids YAML indentation errors.</li>' +
    '<li><b>Book the exam or interview first</b> if that helps you commit, then work backwards from the date.</li></ul>' +
    '<div class="board note"><span class="tag">Where things are stored</span><p>Notes, ticks, card schedules and sketches are saved in <b>this browser only</b>. Use <a href="#study/notebook">Notebook</a> to export notes and flashcards (including a file you can import into Anki) so nothing is lost.</p></div>' +
    '<p><a class="btn" href="#study/drill">Start drilling (' + c.due + ' due)</a> <a class="btn ghost" href="#study/maps">Open the maps</a></p>';
  function step(num, name, text, items){
    return '<div class="loopstep"><span class="loopnum">' + num + '</span><b>' + name + '</b><p>' + text + '</p><ul>' + items.map(function(i){ return '<li>' + i + '</li>'; }).join("") + '</ul></div>';
  }
}

/* ----- drill ----- */
function filterFor(scope, types){
  return function(c){
    if(!types[c.type]) return false;
    if(scope === "all") return true;
    if(scope === "scenarios") return !!SCENARIO_TRACKS[c.track];
    if(STUDY.byId[scope]) return c.lesson === scope;
    return c.track === scope;
  };
}
function buildQueue(){
  var now = Date.now(), f = filterFor(DRILL.scope, DRILL.types), pool = collect().filter(f), q;
  if(DRILL.mode === "due") q = pool.filter(function(c){ return isDue(c, now); });
  else if(DRILL.mode === "missed") q = pool.filter(function(c){ var s = cardState(c.id); return s && s.wrong > 0 && s.box < 4; });
  else q = pool.slice();
  q = q.map(function(c){ return [Math.random(), c]; }).sort(function(a, b){ return a[0] - b[0]; }).map(function(p){ return p[1]; });
  DRILL.queue = q; DRILL.done = 0; DRILL.shown = false; DRILL.cur = q.shift() || null;
}
function drillTab(body, scopeArg){
  if(scopeArg){ DRILL.scope = scopeArg; DRILL.mode = "all"; if(scopeArg === "scenarios") DRILL.mode = "due"; }
  var firstOpen = !body.dataset.opened; body.dataset.opened = 1;
  var tracks = (window.TRACKS || []).filter(function(t){ return t.count; });
  function render(){
    var st = counts(filterFor(DRILL.scope, DRILL.types));
    body.innerHTML =
      '<div class="drillbar"><label>Scope <select id="d-scope"><option value="all">Everything</option><option value="scenarios">Scenario tracks (long ones)</option>' +
      tracks.map(function(t){ return '<option value="' + t.id + '">' + H.esc(t.name) + '</option>'; }).join("") +
      (STUDY.byId[DRILL.scope] ? '<option value="' + DRILL.scope + '">Lesson: ' + H.esc(STUDY.byId[DRILL.scope].title) + '</option>' : '') + '</select></label> ' +
      '<label>Mode <select id="d-mode"><option value="due">Due and new</option><option value="missed">Round 2: missed cards</option><option value="all">Everything, shuffled</option></select></label></div>' +
      '<div class="drillbar">' + Object.keys(TYPE_NAME).map(function(k){ return '<label><input type="checkbox" data-t="' + k + '"' + (DRILL.types[k] ? " checked" : "") + '> ' + TYPE_NAME[k] + '</label>'; }).join(" ") + '</div>' +
      '<p class="muted">' + st.total + ' cards in this selection: <b>' + st.due + '</b> due or new, <b>' + st.missed + '</b> missed, <b>' + st.mastered + '</b> mastered. Cards are made from the lessons themselves.</p>' +
      '<div class="flash" id="flash"></div>';
    H.$("#d-scope", body).value = DRILL.scope; H.$("#d-mode", body).value = DRILL.mode;
    H.$("#d-scope", body).addEventListener("change", function(e){ DRILL.scope = e.target.value; buildQueue(); render(); });
    H.$("#d-mode", body).addEventListener("change", function(e){ DRILL.mode = e.target.value; buildQueue(); render(); });
    H.$$("input[data-t]", body).forEach(function(i){ i.addEventListener("change", function(){ DRILL.types[i.dataset.t] = i.checked ? 1 : 0; buildQueue(); render(); }); });
    card();
  }
  function card(){
    var box = H.$("#flash", body), c = DRILL.cur;
    if(!c){ box.innerHTML = '<div class="fcard done"><p><b>Nothing left in this selection.</b></p><p>' + (DRILL.done ? 'You reviewed ' + DRILL.done + ' cards this session.' : 'Try another mode, scope or card type.') + '</p><p><button class="btn" type="button" id="d-again">Reshuffle everything</button></p></div>';
      H.$("#d-again", body).addEventListener("click", function(){ DRILL.mode = "all"; buildQueue(); render(); }); return; }
    var ch = STUDY.byId[c.lesson];
    box.innerHTML = '<div class="fcard"><small class="muted">' + TYPE_NAME[c.type] + ' · ' + H.esc(trackName(c.track)) + ' · ' + lessonLink(c.lesson) + H.esc(ch ? ch.title : c.lesson) + '</a></small><p class="ffront">' + H.esc(c.front) + '</p>' +
      '<div class="fback" ' + (DRILL.shown ? "" : "hidden") + '><hr><p>' + H.esc(c.back) + '</p></div>' +
      '<div class="fbtns">' + (DRILL.shown ?
        '<button class="btn ghost" data-r="1" type="button">Again (1)</button><button class="btn ghost" data-r="2" type="button">Hard (2)</button><button class="btn" data-r="3" type="button">Good (3)</button><button class="btn" data-r="4" type="button">Easy (4)</button>' :
        '<button class="btn" id="d-show" type="button">Show answer (space)</button>') + '</div><small class="muted">' + (DRILL.queue.length + 1) + ' left in this session</small></div>';
    var sb = H.$("#d-show", box); if(sb) sb.addEventListener("click", reveal);
    H.$$("[data-r]", box).forEach(function(b){ b.addEventListener("click", function(){ rate(Number(b.dataset.r)); }); });
  }
  function reveal(){ DRILL.shown = true; card(); }
  function rate(r){
    var c = DRILL.cur; if(!c) return;
    var s = cardState(c.id) || {box: 1, wrong: 0, seen: 0};
    s.seen++;
    if(r === 1){ s.box = 1; s.wrong++; s.due = Date.now() + 60 * 1000; DRILL.queue.push(c); }
    else {
      s.box = r === 2 ? Math.max(1, s.box) : Math.min(6, s.box + (r === 4 ? 2 : 1));
      s.due = Date.now() + (r === 2 ? 1 : BOX_DAYS[s.box]) * 86400000;
    }
    saveState(c.id, s);
    DRILL.done++; DRILL.cur = DRILL.queue.shift() || null; DRILL.shown = false;
    var hubDue = H.$("#study-due"); if(hubDue){ var k = counts(); hubDue.textContent = k.total + " flashcards made from the lessons; " + k.due + " due now."; }
    render();
  }
  if(!H.studyKeys){
    H.studyKeys = true;
    document.addEventListener("keydown", function(e){
      if(document.body.dataset.view !== "study" || !H.$("#flash")) return;
      if(/input|textarea|select/i.test((e.target.tagName || ""))) return;
      var k = e.key;
      if(k === " " && !DRILL.shown && DRILL.cur){ e.preventDefault(); var b = H.$("#d-show"); if(b) b.click(); }
      else if(DRILL.shown && /^[1-4]$/.test(k)){ var rb = H.$('[data-r="' + k + '"]'); if(rb) rb.click(); }
    });
  }
  if(firstOpen || scopeArg) buildQueue();
  render();
}

/* ----- maps and sketch pad ----- */
function lessonId(track, n){ var c = chapterFor(track, n); return c ? c.id : null; }
function mapsTab(body, trackArg){
  var maps = window.STUDYMAPS || {}, tracks = (window.TRACKS || []).filter(function(t){ return t.count && maps[t.id]; });
  var cur = maps[trackArg] ? trackArg : (tracks[0] && tracks[0].id);
  body.innerHTML = '<p class="lede">Every track hangs on one path. <b>Draw it from memory first</b> on the pad below (finger, mouse or Apple Pencil), then reveal the map and compare. Fill the gaps in your notes.</p>' +
    '<div class="drillbar"><label>Track <select id="m-track">' + tracks.map(function(t){ return '<option value="' + t.id + '"' + (t.id === cur ? " selected" : "") + '>' + H.esc(t.name) + '</option>'; }).join("") + '</select></label></div><div id="m-body"></div>';
  H.$("#m-track", body).addEventListener("change", function(e){ location.hash = "study/maps/" + e.target.value; });
  var mb = H.$("#m-body", body); if(!cur) return;
  var m = maps[cur];
  mb.innerHTML = '<h3>' + H.esc(m.title) + '</h3><p>' + H.esc(m.intro) + '</p>' +
    '<div class="padwrap"><div class="padtools"><b>Sketch pad</b> ' +
    ['#1B5BD1', '#B5342B', '#17803F', '#16212A'].map(function(c){ return '<button class="swatch" type="button" data-c="' + c + '" style="background:' + c + '" aria-label="pen colour"></button>'; }).join("") +
    '<button class="btn ghost small" type="button" id="p-undo">Undo</button><button class="btn ghost small" type="button" id="p-clear">Clear</button><button class="btn ghost small" type="button" id="p-save">Download PNG</button></div>' +
    '<canvas id="pad" width="1200" height="520" aria-label="Drawing area"></canvas></div>' +
    '<p><button class="btn" type="button" id="m-reveal">Reveal the map and compare</button></p><div id="m-map" hidden></div>';
  pad(H.$("#pad", mb), cur, mb);
  H.$("#m-reveal", mb).addEventListener("click", function(){
    var box = H.$("#m-map", mb); box.hidden = !box.hidden;
    if(!box.hidden && !box.dataset.done){
      box.dataset.done = 1;
      box.innerHTML = '<ol class="hops">' + m.hops.map(function(h){
        return '<li><b>' + H.esc(h.label) + '</b><p>' + H.esc(h.text) + '</p>' + (h.lessons.length ? '<small>Lessons: ' + h.lessons.map(function(n){ var id = lessonId(cur, n); return id ? lessonLink(id) + n + '</a>' : n; }).join(", ") + '</small>' : '') + '</li>';
      }).join("") + '</ol>' +
        '<h4>Tips nobody tells you</h4><ul>' + m.tips.map(function(t){ return '<li>' + H.esc(t) + '</li>'; }).join("") + '</ul>' +
        '<h4>Read only these pages</h4><ul>' + m.docs.map(function(d){ return '<li><a href="' + H.esc(d.url) + '" target="_blank" rel="noopener">' + H.esc(d.label) + '</a></li>'; }).join("") + '</ul>' +
        '<p><a class="btn ghost" href="#study/drill/' + cur + '">Drill ' + H.esc(trackName(cur)) + ' flashcards</a></p>';
    }
  });
}
function pad(canvas, key, root){
  var ctx = canvas.getContext("2d"), color = "#1B5BD1", drawing = false, strokes = [], cur = null;
  function bg(){ ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  function redraw(){ bg(); strokes.forEach(function(s){ ctx.strokeStyle = s.c; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); s.p.forEach(function(p, i){ if(i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke(); }); }
  strokes = jget("sketch-" + key, []); redraw();
  function pos(e){ var r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; }
  canvas.addEventListener("pointerdown", function(e){ drawing = true; canvas.setPointerCapture(e.pointerId); cur = {c: color, p: [pos(e)]}; strokes.push(cur); e.preventDefault(); });
  canvas.addEventListener("pointermove", function(e){ if(!drawing) return; cur.p.push(pos(e)); redraw(); e.preventDefault(); });
  function end(){ if(!drawing) return; drawing = false; try{ jset("sketch-" + key, strokes); }catch(e){} }
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  H.$$(".swatch", root).forEach(function(b){ b.addEventListener("click", function(){ color = b.dataset.c; }); });
  H.$("#p-undo", root).addEventListener("click", function(){ strokes.pop(); redraw(); jset("sketch-" + key, strokes); });
  H.$("#p-clear", root).addEventListener("click", function(){ strokes = []; redraw(); jset("sketch-" + key, strokes); });
  H.$("#p-save", root).addEventListener("click", function(){ var a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = "map-" + key + ".png"; a.click(); });
}

/* ----- notebook ----- */
function download(name, text, type){
  var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type: type || "text/plain"})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function notebookTab(body){
  var notes = STUDY.chapters.map(function(c){ return {c: c, t: H.store(KEY + "notes-" + c.id)}; }).filter(function(x){ return x.t && x.t.trim(); });
  var tries = [];
  STUDY.chapters.forEach(function(c){
    H.$$(".board.ask li", c.el).forEach(function(li, k){ tries.push({c: c, k: k, t: txt(li)}); });
  });
  var cs = counts();
  body.innerHTML = '<h3>My notes</h3>' + (notes.length ? notes.map(function(x){ return '<div class="notecard"><b>' + lessonLink(x.c.id) + H.esc(trackName(x.c.track) + ' · ' + x.c.title) + '</a></b><pre>' + H.esc(x.t) + '</pre></div>'; }).join("") : '<p class="muted">No notes yet. Open any lesson and use "My notes for this lesson" while you gather.</p>') +
    '<p><button class="btn" type="button" id="n-notes"' + (notes.length ? "" : " disabled") + '>Export notes (Markdown)</button> <button class="btn ghost" type="button" id="n-cards">Export all flashcards (TSV for Anki)</button></p>' +
    '<p class="muted">The TSV has two columns, front and back. In Anki use File, Import and choose "Tab" as the separator. ' + cs.total + ' cards.</p>' +
    '<h3>Practice log: "Your turn" tasks</h3><p class="muted">Tick what you have actually done on a real machine. Second pass: redo the ones that were not boring.</p>' +
    '<div id="n-tries">' + (tries.length ? "" : '<p class="muted">No practice tasks found.</p>') + '</div>';
  var box = H.$("#n-tries", body), lastTrack = null;
  tries.forEach(function(x){
    if(x.c.track !== lastTrack){ lastTrack = x.c.track; box.insertAdjacentHTML("beforeend", '<h4>' + H.esc(trackName(lastTrack)) + '</h4>'); }
    var id = "try-" + x.c.id + "-" + x.k, on = !!H.store(KEY + id);
    var row = document.createElement("label"); row.className = "tryrow";
    row.innerHTML = '<input type="checkbox"' + (on ? " checked" : "") + '> <span>' + lessonLink(x.c.id) + H.esc(x.c.title) + ':</a> ' + H.esc(x.t) + '</span>';
    H.$("input", row).addEventListener("change", function(e){ H.store(KEY + id, e.target.checked ? "1" : ""); });
    box.appendChild(row);
  });
  H.$("#n-notes", body).addEventListener("click", function(){
    download("agent-school-notes.md", "# My notes\n\n" + notes.map(function(x){ return "## " + trackName(x.c.track) + " · " + x.c.title + "\n\n" + x.t.trim() + "\n"; }).join("\n"), "text/markdown");
  });
  H.$("#n-cards", body).addEventListener("click", function(){
    var rows = collect().filter(function(c){ return c.type !== "explain"; }).map(function(c){ return c.front.replace(/[\t\n]+/g, " ") + "\t" + c.back.replace(/[\t\n]+/g, " "); });
    download("agent-school-flashcards.tsv", rows.join("\n"), "text/tab-separated-values");
  });
}

/* ---------- widget: drill box inside each round-up lesson ---------- */
(window.TRACKS || []).forEach(function(t){
  window.W["drill_" + t.id] = function(el){
    el.innerHTML = '<div class="board ask"><span class="tag">Flashcards for this track</span><p class="dbcount">Counting the cards made from this track\'s lessons...</p></div>';
    setTimeout(function(){
      var c = counts(function(x){ return x.track === t.id; }), p = H.$(".dbcount", el);
      p.innerHTML = '<b>' + c.total + '</b> cards (quiz questions, recap gaps, commands, explain prompts), <b>' + c.due + '</b> due or new, <b>' + c.missed + '</b> missed. ' +
        '<a class="btn" href="#study/drill/' + t.id + '">Drill this track</a> <a class="btn ghost" href="#study/maps/' + t.id + '">Open the sketch pad and map</a>';
    }, 0);
  };
});

H.studyShow = show;
H.studyDecorate = decorate;
