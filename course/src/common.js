/* Shared helpers. Chapter scripts register quizzes on Q and call H.* helpers. */
window.Q = {};
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
    /* nav chips + roadmap */
    var chips=$("#chips"), road=$("#road");
    $$(".chapter[data-title]").forEach(function(c,k){
      var a=document.createElement("a");a.href="#"+c.id;a.textContent=c.dataset.title;a.dataset.t=c.id;chips.appendChild(a);
      if(road && c.dataset.road){
        var d=document.createElement("div");
        d.innerHTML='<span>'+(k+1)+'</span><p style="margin:0"><a href="#'+c.id+'" style="text-decoration:none;color:inherit"><b>'+esc(c.dataset.road)+'</b></a><small>'+esc(c.dataset.sub||"")+'</small></p>';
        road.appendChild(d);
      }
    });
    function marks(){ $$("a",chips).forEach(function(a){ var s=H.store("agentschool-"+a.dataset.t.replace("ch","c")); a.classList.toggle("done", s!==null && s!==undefined); }); }
    marks();
    function onScroll(){
      var h=document.documentElement.scrollHeight-innerHeight;
      $("#barfill").style.width=(h>0?Math.min(100,scrollY/h*100):0)+"%";
      var cur=null;
      $$(".chapter").forEach(function(c){if(c.getBoundingClientRect().top<140)cur=c.id});
      $$("a",chips).forEach(function(a){
        var on=a.dataset.t===cur;a.classList.toggle("on",on);
        if(on){var box=chips.getBoundingClientRect(),r=a.getBoundingClientRect();if(r.left<box.left||r.right>box.right){chips.scrollLeft+=r.left-box.left-20}}
      });
    }
    addEventListener("scroll",onScroll,{passive:true});onScroll();

    /* copy buttons on code blocks */
    $$(".codewrap").forEach(function(w){
      var b=document.createElement("button");b.type="button";b.className="copy";b.textContent="Copy";
      b.addEventListener("click",function(){H.copy(b,w.querySelector("code").textContent)});w.appendChild(b);
    });

    /* quizzes */
    $$(".quiz").forEach(function(box){
      var id=box.dataset.quiz, qs=Q[id]; if(!qs) return;
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
            if(done===qs.length){score.hidden=false;score.textContent="You got "+got+" of "+qs.length+(got===qs.length?". Excellent, on to the next chapter!":". Re-read the parts behind the ones you missed, then continue.");H.store("agentschool-"+id,String(got));marks()}
          });
          ch.appendChild(b);
        });
        box.insertBefore(d,score);
      });
    });
  };
  return H;
})();
