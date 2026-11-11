/* Progress, XP, streaks, daily goal, badges and certificates. Everything is stored in this browser only (localStorage). */
var GKEY = "agentschool-game";
function today(d){ d = d || new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function load(){ try{ var s = JSON.parse(localStorage.getItem(GKEY) || "{}"); s.xp = s.xp || 0; s.days = s.days || {}; s.badges = s.badges || {}; s.ch = s.ch || 0; s.perfect = s.perfect || 0; return s; }catch(e){ return {xp: 0, days: {}, badges: {}, ch: 0, perfect: 0}; } }
function save(s){ try{ localStorage.setItem(GKEY, JSON.stringify(s)); }catch(e){} }
var GOAL = 50;
function streak(s){
  var n = 0, d = new Date();
  if(!s.days[today(d)]) d.setDate(d.getDate() - 1);          /* today not started yet: the streak is still alive */
  while(s.days[today(d)]){ n++; d.setDate(d.getDate() - 1); }
  return n;
}
function level(xp){ var l = 1, need = 100, left = xp; while(left >= need){ left -= need; l++; need = Math.round(need * 1.25); } return {n: l, into: left, need: need}; }
var TITLES = ["Newcomer", "Apprentice", "Operator", "Builder", "Engineer", "Senior engineer", "Staff engineer", "Principal", "Architect", "Legend"];
function chaptersOf(t){ return $$(".chapter").filter(function(c){ return c.dataset.track === t; }); }
function quizId(c){ var q = $(".quiz", c), id = q ? q.dataset.quiz : null; return id && window.Q[id] && window.Q[id].length ? id : null; }
function isDone(c){ var id = quizId(c); if(!id) return false; var v = null; try{ v = localStorage.getItem("agentschool-" + id); }catch(e){} return v !== null && v !== undefined; }
function counts(){
  var done = 0, tracksDone = [], all = 0;
  (window.TRACKS || []).forEach(function(t){
    var cs = chaptersOf(t.id).filter(function(c){ return quizId(c); }); if(!cs.length) return;
    var d = cs.filter(isDone).length; done += d; all += cs.length;
    if(d === cs.length) tracksDone.push(t);
  });
  return {done: done, all: all, tracksDone: tracksDone};
}
var BADGES = [
  ["first", "First steps", "Finish your first quiz", function(s, c){ return c.done >= 1; }],
  ["five", "Getting going", "Finish 5 lessons", function(s, c){ return c.done >= 5; }],
  ["twentyfive", "Committed", "Finish 25 lessons", function(s, c){ return c.done >= 25; }],
  ["hundred", "Centurion", "Finish 100 lessons", function(s, c){ return c.done >= 100; }],
  ["perfect", "Sharp", "Get every question right in a quiz", function(s){ return s.perfect >= 1; }],
  ["perfect10", "Precise", "Ten perfect quizzes", function(s){ return s.perfect >= 10; }],
  ["hands", "Hands on", "Solve a lab challenge", function(s){ return s.ch >= 1; }],
  ["hands10", "Terminal native", "Solve 10 lab challenges", function(s){ return s.ch >= 10; }],
  ["streak3", "Three in a row", "Study 3 days running", function(s){ return streak(s) >= 3; }],
  ["streak7", "A full week", "Study 7 days running", function(s){ return streak(s) >= 7; }],
  ["streak30", "Habit", "Study 30 days running", function(s){ return streak(s) >= 30; }],
  ["track", "Track complete", "Finish every lesson of one track", function(s, c){ return c.tracksDone.length >= 1; }],
  ["track3", "Well rounded", "Finish three tracks", function(s, c){ return c.tracksDone.length >= 3; }]
];
function toast(msg){
  var box = $("#toasts"); if(!box){ box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
  var t = document.createElement("div"); t.className = "toast"; t.textContent = msg; box.appendChild(t);
  setTimeout(function(){ t.classList.add("out"); setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 400); }, 3200);
}
function award(xp, why, mut){
  var s = load(); if(mut) mut(s);
  var before = level(s.xp).n, hadGoal = (s.days[today()] || 0) >= GOAL;
  s.xp += xp; s.days[today()] = (s.days[today()] || 0) + xp;
  var c = counts(), fresh = [];
  BADGES.forEach(function(b){ if(!s.badges[b[0]] && b[3](s, c)){ s.badges[b[0]] = today(); fresh.push(b[1]); } });
  save(s);
  toast("+" + xp + " XP  " + why);
  if(level(s.xp).n > before) toast("Level " + level(s.xp).n + ": " + TITLES[Math.min(TITLES.length, level(s.xp).n) - 1]);
  if(!hadGoal && s.days[today()] >= GOAL) toast("Daily goal reached. Streak: " + streak(s) + " day" + (streak(s) === 1 ? "" : "s"));
  fresh.forEach(function(n){ toast("Badge earned: " + n); });
  draw();
}
/* Hook the shared store: a quiz result or a solved challenge is written exactly once, which is the moment to award XP. */
var rawStore = H.store;
H.store = function(k, v){
  if(v !== undefined && typeof k === "string" && k.indexOf("agentschool-") === 0 && k !== GKEY){
    var had = null; try{ had = localStorage.getItem(k); }catch(e){}
    var r = rawStore(k, v);
    if(had === null){
      var id = k.slice(12), box = document.querySelector('.quiz[data-quiz="' + id + '"]');
      if(box){ var n = (window.Q[id] || []).length, got = Number(v) || 0; award(20 + 5 * got, "lesson quiz finished", function(s){ if(n && got === n) s.perfect++; }); }
    }
    return r;
  }
  return rawStore(k, v);
};
H.gameChallenge = function(){ award(30, "lab challenge solved", function(s){ s.ch++; }); };
function esc2(t){ return esc(t); }
function nextLesson(){
  var last = null; try{ last = localStorage.getItem("agentschool-last"); }catch(e){}
  var order = (window.TRACKS || []).map(function(t){ return t.id; });
  if(last && order.indexOf(last) >= 0){ order.splice(order.indexOf(last), 1); order.unshift(last); }
  for(var i = 0; i < order.length; i++){
    var cs = chaptersOf(order[i]), started = cs.some(isDone);
    if(i > 0 && !started) continue;
    for(var k = 0; k < cs.length; k++) if(quizId(cs[k]) && !isDone(cs[k])) return cs[k];
  }
  return null;
}
function draw(){
  var el = $("#gamepanel"); if(!el) return;
  var s = load(), c = counts(), lv = level(s.xp), st = streak(s), td = s.days[today()] || 0, nx = nextLesson();
  var week = []; for(var i = 6; i >= 0; i--){ var d = new Date(); d.setDate(d.getDate() - i); week.push([("SMTWTFS")[d.getDay()], s.days[today(d)] || 0]); }
  var badgeHtml = BADGES.map(function(b){ var on = !!s.badges[b[0]]; return '<span class="bdg' + (on ? " on" : "") + '" title="' + esc2(b[2]) + '">' + esc2(b[1]) + '</span>'; }).join("");
  var certs = c.tracksDone.map(function(t){ return '<button type="button" class="btn ghost" data-cert="' + esc2(t.id) + '">Certificate: ' + esc2(t.name) + '</button>'; }).join(" ");
  el.innerHTML = '<div class="board gp"><span class="tag">Your progress</span>' +
    '<div class="gp-grid">' +
      '<div class="gp-cell"><b class="gp-num">' + lv.n + '</b><span>Level: ' + esc2(TITLES[Math.min(TITLES.length, lv.n) - 1]) + '</span><span class="pbar wide"><i style="width:' + Math.round(lv.into / lv.need * 100) + '%"></i></span><small>' + s.xp + ' XP, ' + (lv.need - lv.into) + ' to the next level</small></div>' +
      '<div class="gp-cell"><b class="gp-num">' + st + '</b><span>day streak</span><div class="gp-week">' + week.map(function(w){ return '<i class="' + (w[1] >= GOAL ? "full" : w[1] > 0 ? "some" : "") + '"><em>' + w[0] + '</em></i>'; }).join("") + '</div><small>Study on consecutive days to keep it</small></div>' +
      '<div class="gp-cell"><b class="gp-num">' + Math.min(td, 999) + '<small>/' + GOAL + '</small></b><span>XP today</span><span class="pbar wide"><i style="width:' + Math.min(100, Math.round(td / GOAL * 100)) + '%"></i></span><small>' + (td >= GOAL ? "Daily goal reached" : "A quiz gives 20 to 35 XP, a lab challenge 30") + '</small></div>' +
      '<div class="gp-cell"><b class="gp-num">' + c.done + '<small>/' + c.all + '</small></b><span>lessons finished</span><span class="pbar wide"><i style="width:' + (c.all ? Math.round(c.done / c.all * 100) : 0) + '%"></i></span><small>' + c.tracksDone.length + ' track' + (c.tracksDone.length === 1 ? "" : "s") + ' complete</small></div>' +
    '</div>' +
    (nx ? '<p style="margin:14px 0 0"><a class="btn" href="#' + nx.id + '">' + (c.done ? "Continue" : "Start") + ': ' + esc2(nx.dataset.road || nx.dataset.title || "next lesson") + '</a></p>' : '') +
    '<div class="gp-badges" aria-label="Badges">' + badgeHtml + '</div>' +
    (certs ? '<p style="margin:12px 0 0">' + certs + '</p>' : '') +
    '<p class="muted" style="font-size:.82rem;margin:10px 0 0">Progress is saved in this browser only. A lesson counts when you finish its quiz.</p></div>';
  $$("[data-cert]", el).forEach(function(b){ b.addEventListener("click", function(){ certificate(b.dataset.cert); }); });
}
function certificate(tid){
  var t = (window.TRACKS || []).filter(function(x){ return x.id === tid; })[0]; if(!t) return;
  var s = load(), ov = document.createElement("div"); ov.className = "cert-ov";
  var n = chaptersOf(tid).filter(quizId).length, site = (window.SITE && window.SITE.name) || document.title || "Agent School";
  ov.innerHTML = '<div class="cert-box"><div class="cert-ctl"><label>Your name <input type="text" class="cert-name" maxlength="60" value="' + esc2(s.name || "") + '" placeholder="Name on the certificate"></label> <button type="button" class="btn" data-p>Print or save as PDF</button> <button type="button" class="btn ghost" data-x>Close</button></div>' +
    '<div class="cert" id="cert-print"><div class="cert-in"><span class="cert-brand">' + esc2(site) + '</span><h2>Certificate of completion</h2><p>This records that</p><p class="cert-who">Your name</p><p>finished all ' + n + ' lessons and quizzes of the track</p><p class="cert-track">' + esc2(t.name) + '</p><p class="cert-date">' + new Date().toLocaleDateString(undefined, {year: "numeric", month: "long", day: "numeric"}) + '</p><p class="cert-note">Self-paced course completion recorded in the learner\'s browser. This is not an accredited qualification.</p></div></div></div>';
  document.body.appendChild(ov);
  var inp = $(".cert-name", ov), who = $(".cert-who", ov);
  function upd(){ who.textContent = inp.value.trim() || "Your name"; }
  inp.addEventListener("input", function(){ upd(); var g = load(); g.name = inp.value.trim(); save(g); }); upd();
  $("[data-x]", ov).addEventListener("click", function(){ document.body.classList.remove("printing-cert"); ov.parentNode.removeChild(ov); });
  $("[data-p]", ov).addEventListener("click", function(){ document.body.classList.add("printing-cert"); window.print(); setTimeout(function(){ document.body.classList.remove("printing-cert"); }, 500); });
  inp.focus();
}
H.gameDraw = draw;
addEventListener("hashchange", function(){
  var h = location.hash.replace("#", ""), el = h && document.getElementById(h), t = null;
  if(el && el.classList.contains("chapter")) t = el.dataset.track; else if((window.TRACKS || []).some(function(x){ return x.id === h; })) t = h;
  if(t){ try{ localStorage.setItem("agentschool-last", t); }catch(e){} }
  if(!h || h === "hub") draw();
});
document.addEventListener("DOMContentLoaded", function(){ setTimeout(draw, 0); });
if(document.readyState !== "loading") setTimeout(draw, 0);
