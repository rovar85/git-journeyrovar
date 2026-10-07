/* Shared helpers. Chapter scripts register quizzes on Q and call H.* helpers. */
window.Q = {};
window.W = {};
window.H = (function(){
  "use strict";
  var H = {};
  H.$ = function(s,r){return (r||document).querySelector(s)};
  H.$$ = function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  H.esc = function(t){return String(t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
  H.store = function(k,v){try{if(v===undefined){return localStorage.getItem(k)}localStorage.setItem(k,v)}catch(e){return null}};
  H.fmt = function(n,d){d=d===undefined?2:d;return Number(n).toFixed(d)};
  H.sci = function(n){if(n===0)return "0";var e=Math.floor(Math.log10(Math.abs(n)));var m=n/Math.pow(10,e);return m.toFixed(2)+" × 10^"+e};

  /* Generic back/next stepper. render(step, index, bodyEl, root) fills the body. */
  H.stepper = function(root, steps, render, opts){
    opts = opts || {};
    var i = 0;
    root.innerHTML = '<div class="step-controls"><button class="btn ghost" type="button" data-b>Back</button><button class="btn" type="button" data-n>Next step</button><span class="cnt"></span>'+(opts.reset?'<button class="btn ghost" type="button" data-r>Restart</button>':'')+'</div><div class="step-body" aria-live="polite"></div>';
    var b=root.querySelector("[data-b]"), n=root.querySelector("[data-n]"), c=root.querySelector(".cnt"), body=root.querySelector(".step-body");
    function draw(){
      c.textContent = "Step "+(i+1)+" of "+steps.length;
      b.disabled = i===0; n.disabled = i===steps.length-1;
      body.innerHTML = ""; render(steps[i], i, body, root);
    }
    b.addEventListener("click",function(){if(i>0){i--;draw()}});
    n.addEventListener("click",function(){if(i<steps.length-1){i++;draw()}});
    var r=root.querySelector("[data-r]"); if(r) r.addEventListener("click",function(){i=0;draw()});
    draw();
    return {go:function(k){i=Math.max(0,Math.min(steps.length-1,k));draw()}};
  };

  /* Tabs. items: [{label, html}] or [{label, render(panelEl)}] */
  H.tabs = function(root, items, start){
    var cur = start||0;
    root.innerHTML = '<div class="tabs" role="tablist"></div><div class="panel" role="tabpanel"></div>';
    var bar = root.querySelector(".tabs"), panel = root.querySelector(".panel");
    function draw(){
      bar.innerHTML = "";
      items.forEach(function(it,k){
        var b = document.createElement("button"); b.type="button"; b.setAttribute("role","tab");
        b.setAttribute("aria-selected", k===cur); b.textContent = it.label;
        b.addEventListener("click",function(){cur=k;draw()}); bar.appendChild(b);
      });
      panel.innerHTML = "";
      if(it_html(items[cur])) panel.innerHTML = items[cur].html; else items[cur].render(panel);
    }
    function it_html(it){return typeof it.html === "string"}
    draw();
  };

  /* Range slider row. Returns the input. */
  H.range = function(parent, label, min, max, step, val, fmt, onChange){
    var row = document.createElement("div"); row.className="rng";
    var id = "r"+Math.random().toString(36).slice(2,8);
    row.innerHTML = '<label for="'+id+'">'+label+'</label><input id="'+id+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'"><output></output>';
    var inp = row.querySelector("input"), out = row.querySelector("output");
    function upd(){out.textContent = fmt?fmt(Number(inp.value)):inp.value; onChange(Number(inp.value))}
    inp.addEventListener("input",upd); parent.appendChild(row); upd();
    return inp;
  };


  /* Step-through code player. T = {code:[lines], steps:[{l, f, v:[[name,value]], o}]} */
  H.tracer = function(root, T){
    var i = 0;
    root.innerHTML = '<div class="tr-code"></div><div class="step-controls"><button class="btn ghost" type="button" data-b>Back</button><button class="btn" type="button" data-n>Next line</button><button class="btn ghost" type="button" data-e>Run to end</button><button class="btn ghost" type="button" data-r>Restart</button><span class="cnt"></span></div><div class="two"><div><p style="margin:0 0 4px"><b>Variables</b> <small style="color:var(--muted)" data-f></small></p><div class="out" data-v style="margin:0"></div></div><div><p style="margin:0 0 4px"><b>Output so far</b></p><div class="pre-out" data-o style="min-height:4em"></div></div></div>';
    var codeEl = root.querySelector(".tr-code"), cnt = root.querySelector(".cnt");
    var html = '<div class="codewrap"><pre class="code" style="padding:10px 0">' + T.code.map(function(t,k){return '<span class="line" data-l="'+(k+1)+'"><span class="ln">'+(k+1)+'</span>'+H.esc(t)+'</span>'}).join("") + '</pre></div>';
    codeEl.innerHTML = html;
    var copyBtn = document.createElement("button"); copyBtn.type="button"; copyBtn.className="copy"; copyBtn.textContent="Copy";
    copyBtn.addEventListener("click", function(){H.copy(copyBtn, T.code.join("\n"))});
    codeEl.querySelector(".codewrap").appendChild(copyBtn);
    function draw(){
      var s = T.steps[i], last = i === T.steps.length - 1;
      Array.prototype.forEach.call(codeEl.querySelectorAll(".line"), function(e){e.classList.toggle("cur", !last && Number(e.dataset.l) === s.l)});
      var cur = codeEl.querySelector(".line.cur"); if(cur && cur.scrollIntoView && false) cur.scrollIntoView({block:"nearest"});
      cnt.textContent = last ? "Finished" : "About to run line " + s.l + " (step " + (i+1) + " of " + (T.steps.length-1) + ")";
      root.querySelector("[data-f]").textContent = "in " + s.f;
      root.querySelector("[data-v]").innerHTML = s.v.length ? '<table class="tbl" style="min-width:0;width:100%"><tbody>' + s.v.map(function(r){return '<tr><td>'+H.esc(r[0])+'</td><td style="font-family:var(--f-mono);font-size:.82rem;word-break:break-word">'+H.esc(r[1])+'</td></tr>'}).join("") + '</tbody></table>' : '<span style="color:var(--muted)">(nothing yet)</span>';
      root.querySelector("[data-o]").textContent = s.o || "(no output yet)";
      root.querySelector("[data-b]").disabled = i === 0;
      root.querySelector("[data-n]").disabled = last;
      root.querySelector("[data-e]").disabled = last;
    }
    root.querySelector("[data-b]").addEventListener("click", function(){if(i>0){i--;draw()}});
    root.querySelector("[data-n]").addEventListener("click", function(){if(i<T.steps.length-1){i++;draw()}});
    root.querySelector("[data-e]").addEventListener("click", function(){i=T.steps.length-1;draw()});
    root.querySelector("[data-r]").addEventListener("click", function(){i=0;draw()});
    draw();
  };

  H.copy = function(btn, text){
    function fallback(){
      var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();
      try{document.execCommand("copy");btn.textContent="Copied"}catch(e){btn.textContent="Select and copy"}
      document.body.removeChild(ta);setTimeout(function(){btn.textContent="Copy"},1500);
    }
    try{
      navigator.clipboard.writeText(text).then(function(){btn.textContent="Copied";setTimeout(function(){btn.textContent="Copy"},1500)},fallback);
    }catch(e){fallback()}
  };

  H.init = function(){
    var $=H.$,$$=H.$$,esc=H.esc;
    var tracks = window.TRACKS || [], byId = {};
    tracks.forEach(function(t){byId[t.id]=t});
    var chapters = $$(".chapter");
    function inTrack(t){return chapters.filter(function(c){return c.dataset.track===t})}
    function quizId(c){var q=$(".quiz",c);return q?q.dataset.quiz:null}
    function isDone(c){var id=quizId(c);return id?H.store("agentschool-"+id)!==null&&H.store("agentschool-"+id)!==undefined:false}
    var chips=$("#chips"), sel=$("#tracksel"), head=$("#trackhead"), hub=$("#hub"), studyEl=$("#studyview"), current="hub";

    /* ---- hub ---- */
    var total=chapters.length;
    var st=$("#stat-lessons"); if(st) st.textContent=total+" lessons in "+tracks.filter(function(t){return inTrack(t.id).length}).length+" tracks";
    function drawHub(){
      var box=$("#tracks"); if(!box) return; box.innerHTML="";
      var groups=[]; tracks.forEach(function(t){if(groups.indexOf(t.group)<0)groups.push(t.group)});
      groups.forEach(function(g){
        var h=document.createElement("h3");h.textContent=g;h.style.marginTop="1.6rem";box.appendChild(h);
        var grid=document.createElement("div");grid.className="tgrid";
        tracks.filter(function(t){return t.group===g}).forEach(function(t){
          var cs=inTrack(t.id),done=cs.filter(isDone).length;
          var a=document.createElement(cs.length?"a":"div");a.className="tcard"+(cs.length?"":" soon");if(cs.length)a.href="#"+t.id;
          a.innerHTML='<b>'+esc(t.name)+'</b><span class="lvl">'+esc(t.level)+'</span><p>'+esc(t.blurb)+'</p><p class="why"><i>Why: '+esc(t.why)+'</i></p><div class="prog">'+(cs.length?'<span class="pbar"><i style="width:'+Math.round(done/cs.length*100)+'%"></i></span> '+done+' of '+cs.length+' lessons':'Coming soon')+'</div>';
          grid.appendChild(a);
        });
        box.appendChild(grid);
      });
    }

    /* ---- selector ---- */
    sel.innerHTML='<option value="hub">All tracks</option>'+tracks.filter(function(t){return inTrack(t.id).length}).map(function(t){return '<option value="'+t.id+'">'+esc(t.name)+'</option>'}).join("");
    sel.addEventListener("change",function(){location.hash=sel.value});

    /* ---- prev / next on every lesson ---- */
    tracks.forEach(function(t){
      var cs=inTrack(t.id);
      cs.forEach(function(c,k){
        var nav=document.createElement("nav");nav.className="pn";
        var prev=cs[k-1],next=cs[k+1];
        nav.innerHTML=(prev?'<a href="#'+prev.id+'">← '+esc(prev.dataset.road||"Previous")+'</a>':'<a href="#'+t.id+'">← '+esc(t.name)+' overview</a>')+(next?'<a href="#'+next.id+'" class="nx">'+esc(next.dataset.road||"Next")+' →</a>':'<a href="#hub" class="nx">All tracks →</a>');
        c.appendChild(nav);
      });
    });

    /* ---- show a track ---- */
    function showView(view,focusId){
      current=view;
      sel.value=(view==="study"?"hub":view);
      document.body.dataset.view=view;
      if(studyEl) studyEl.hidden=(view!=="study");
      if(view==="study"){
        chapters.forEach(function(c){c.hidden=true});
        hub.hidden=true; head.hidden=true; chips.innerHTML="";
        return;
      }
      chapters.forEach(function(c){c.hidden=(c.dataset.track!==view)});
      hub.hidden=(view!=="hub");
      head.hidden=(view==="hub");
      chips.innerHTML="";
      if(view==="hub"){drawHub();return}
      var t=byId[view],cs=inTrack(view),done=cs.filter(isDone).length;
      head.innerHTML='<div style="padding-top:28px"><a href="#hub">← All tracks</a><span class="hand" style="display:block;margin-top:14px">'+esc(t.level)+'</span><h1>'+esc(t.name)+'</h1><p class="lede">'+esc(t.blurb)+'</p><p style="color:var(--muted)">'+done+' of '+cs.length+' lessons completed (a lesson counts when you finish its quiz).</p><h3>Lessons</h3><div class="road">'+cs.map(function(c,k){return '<div><span>'+(k+1)+'</span><p style="margin:0"><a href="#'+c.id+'" style="text-decoration:none;color:inherit"><b>'+esc(c.dataset.road)+'</b></a><small>'+esc(c.dataset.sub||"")+'</small></p></div>'}).join("")+'</div></div>';
      cs.forEach(function(c){var a=document.createElement("a");a.href="#"+c.id;a.textContent=c.dataset.title;a.dataset.t=c.id;a.className=isDone(c)?"done":"";chips.appendChild(a)});
    }
    function route(){
      var h=location.hash.replace("#","");
      var view="hub",focus=null;
      if(h==="study"||h.indexOf("study/")===0){
        if(current!=="study")showView("study");
        if(H.studyShow&&studyEl)H.studyShow(studyEl,h.replace(/^study\/?/,""));
        onScroll();return;
      }
      if(byId[h]&&inTrack(h).length){view=h}
      else if(h&&h!=="hub"&&h!=="top"){var el=document.getElementById(h);if(el&&el.classList.contains("chapter")){view=el.dataset.track;focus=el}}
      var changed=(view!==current)||(document.body.dataset.view===undefined);
      if(changed)showView(view);
      if(focus){setTimeout(function(){focus.scrollIntoView({block:"start"});scrollBy(0,-56)},0)}
      else if(changed||!h){scrollTo(0,0)}
      onScroll();
    }
    function refreshMarks(){
      $$("a",chips).forEach(function(a){var c=document.getElementById(a.dataset.t);a.classList.toggle("done",!!c&&isDone(c))});
    }
    H.refreshMarks=refreshMarks;
    function onScroll(){
      var h=document.documentElement.scrollHeight-innerHeight;
      $("#barfill").style.width=(h>0?Math.min(100,scrollY/h*100):0)+"%";
      var cur=null;
      chapters.forEach(function(c){if(!c.hidden&&c.getBoundingClientRect().top<140)cur=c.id});
      $$("a",chips).forEach(function(a){
        var on=a.dataset.t===cur;a.classList.toggle("on",on);
        if(on){var box=chips.getBoundingClientRect(),r=a.getBoundingClientRect();if(r.left<box.left||r.right>box.right){chips.scrollLeft+=r.left-box.left-20}}
      });
    }
    addEventListener("scroll",onScroll,{passive:true});
    addEventListener("hashchange",route);

    if(H.studyDecorate)H.studyDecorate(chapters);

    /* ---- code players, widgets, terminals, copy buttons ---- */
    $$('.tracer[data-trace]').forEach(function(el){var T=window.TRACES&&window.TRACES[el.dataset.trace]; if(T)H.tracer(el,T)});
    $$("[data-widget]").forEach(function(el){var f=window.W&&window.W[el.dataset.widget]; if(f){try{f(el)}catch(e){el.innerHTML='<p style="color:var(--bad)">This demo failed to load.</p>'}} else {el.innerHTML='<p style="color:var(--muted)">(demo not available)</p>'}});
    $$(".codewrap").forEach(function(w){
      if(w.querySelector(".copy"))return;
      var b=document.createElement("button");b.type="button";b.className="copy";b.textContent="Copy";
      b.addEventListener("click",function(){H.copy(b,w.querySelector("code").textContent)});w.appendChild(b);
    });
    $$(".term").forEach(function(t){
      if(!t.querySelector(".term-bar")) return;
      var b=document.createElement("button");b.type="button";b.className="copy";b.textContent="Copy commands";
      b.addEventListener("click",function(){H.copy(b,t.dataset.copy||"")});t.querySelector(".term-bar").appendChild(b);
    });

    /* ---- quizzes (data from chapter scripts or inline JSON) ---- */
    $$("script.quizdata").forEach(function(sc){try{Q[sc.dataset.for]=JSON.parse(sc.textContent)}catch(e){}});
    $$(".quiz").forEach(function(box){
      var id=box.dataset.quiz, qs=Q[id]; if(!qs) {box.hidden=true;return}
      var got=0,done=0,score=$(".score",box);
      qs.forEach(function(q,qi){
        var d=document.createElement("div");d.className="q";
        d.innerHTML="<p>"+(qi+1)+". "+esc(q.q)+'</p><div class="choices"></div><div class="fb" hidden></div>';
        var ch=$(".choices",d),fb=$(".fb",d);
        q.o.forEach(function(opt,oi){
          var b=document.createElement("button");b.type="button";b.textContent=opt;
          b.addEventListener("click",function(){
            if(d.dataset.answered)return;d.dataset.answered=1;done++;
            $$("button",ch)[q.a].classList.add("right");
            if(oi===q.a){got++;fb.textContent="Correct. "+q.f}else{b.classList.add("wrong");fb.textContent="Not quite. "+q.f}
            fb.hidden=false;
            if(done===qs.length){score.hidden=false;score.textContent="You got "+got+" of "+qs.length+(got===qs.length?". Excellent, on to the next lesson!":". Re-read the parts behind the ones you missed, then continue.");H.store("agentschool-"+id,String(got));refreshMarks()}
          });
          ch.appendChild(b);
        });
        box.insertBefore(d,score);
      });
    });

    route();
  };
  return H;
})();
