/* Chapter 9 */

/* Pareto */
(function(){
  var A=[["A",5,38],["B",20,45],["C",30,40],["D",57,52],["E",120,50],["F",664,53]];
  function dom(i,j){return A[j][1]<=A[i][1]&&A[j][2]>=A[i][2]&&(A[j][1]<A[i][1]||A[j][2]>A[i][2])}
  var front=A.map(function(a,i){return !A.some(function(b,j){return j!==i&&dom(i,j)})});
  function X(c){return 40+(Math.log10(c)-Math.log10(3))/(Math.log10(1000)-Math.log10(3))*320}
  function Y(a){return 205-(a-30)/(60-30)*180}
  var svg=$("#pa-svg"),sel=null;
  function draw(){
    var h='<line class="ax" x1="40" y1="205" x2="365" y2="205"/><line class="ax" x1="40" y1="20" x2="40" y2="205"/>';
    [10,100,1000].forEach(function(c){h+='<text x="'+X(c)+'" y="222" text-anchor="middle">$'+c+"</text>"});
    [30,40,50,60].forEach(function(a){h+='<text x="34" y="'+(Y(a)+4)+'" text-anchor="end">'+a+"%</text>"});
    var fr=A.map(function(a,i){return [i,a]}).filter(function(p){return front[p[0]]}).sort(function(a,b){return a[1][1]-b[1][1]});
    h+='<polyline class="ln" style="stroke-dasharray:5 4;stroke-width:1.5" points="'+fr.map(function(p){return X(p[1][1])+","+Y(p[1][2])}).join(" ")+'"/>';
    A.forEach(function(a,i){h+='<g style="cursor:pointer" data-i="'+i+'"><circle class="pt'+(front[i]?"":" mut")+'" cx="'+X(a[1])+'" cy="'+Y(a[2])+'" r="'+(sel===i?9:7)+'"/><text x="'+X(a[1])+'" y="'+(Y(a[2])-11)+'" text-anchor="middle" style="fill:var(--ink)">'+a[0]+"</text></g>"});
    h+='<text x="200" y="238" text-anchor="middle">cost per task (log scale) →</text>';
    svg.innerHTML=h;
    $$("g[data-i]",svg).forEach(function(g){g.addEventListener("click",function(){sel=+g.dataset.i;draw();info()})});
  }
  function info(){
    if(sel===null)return;var a=A[sel];
    var d=A.filter(function(b,j){return j!==sel&&dom(sel,j)});
    $("#pa-out").innerHTML="Agent <b>"+a[0]+"</b>: $"+a[1]+" per task, "+a[2]+"% accuracy. "+(d.length?"<b>Dominated:</b> agent "+d.map(function(x){return x[0]}).join(", ")+" is at least as accurate for no more cost. Unless something else matters, you would not choose "+a[0]+".":"<b>On the Pareto frontier.</b> No other agent is both cheaper and at least as accurate. Whether it is worth its price depends on how much each extra percent of accuracy is worth to you.");
  }
  draw();
})();

/* reliability */
(function(){
  var p=0.8,ctl=$("#rl-ctl");
  function out(){
    var ks=[1,3,5,10],h="";
    ks.forEach(function(k){
      var cap=1-Math.pow(1-p,k),rel=Math.pow(p,k);
      h+='<div class="brow" style="grid-template-columns:4em 1fr 4.2em"><span>k = '+k+' · pass@k</span><span class="t"><span class="f" style="width:'+Math.round(cap*100)+'%"></span></span><span class="n">'+(cap*100).toFixed(1)+"%</span></div>";
      h+='<div class="brow" style="grid-template-columns:4em 1fr 4.2em"><span>k = '+k+' · pass^k</span><span class="t"><span class="f" style="width:'+Math.round(rel*100)+'%;background:var(--note)"></span></span><span class="n">'+(rel*100).toFixed(1)+"%</span></div>";
    });
    $("#rl-bars").innerHTML=h;
    $("#rl-out").innerHTML="With a per-attempt success rate of <b>"+Math.round(p*100)+"%</b>: given 5 tries the system succeeds <i>at least once</i> in <b>"+((1-Math.pow(1-p,5))*100).toFixed(1)+"%</b> of tasks (capability), yet it succeeds <i>all five times</i> in only <b>"+(Math.pow(p,5)*100).toFixed(1)+"%</b> (reliability). Blue = capability, orange = reliability.";
  }
  H.range(ctl,"Chance of success per attempt",0.5,0.999,0.001,p,function(v){return (v*100).toFixed(1)+"%"},function(v){p=v;out()});
})();

/* precision / recall */
(function(){
  var C=[["Socratic method: questioning to expose assumptions",true],["Plato's theory of Forms",false],["Socrates on justice in the Republic's debate",true],["Aristotle's logic",false],["Trial of Socrates and his defence",true],["Descartes on doubt",false],["Socrates: virtue and knowledge",true],["Turing test",false]];
  var sel={},pk=$("#pr-chunks");
  C.forEach(function(c,i){
    var b=document.createElement("button");b.type="button";b.textContent=(c[1]?"★ ":"")+c[0];
    b.addEventListener("click",function(){sel[i]=!sel[i];b.setAttribute("aria-pressed",!!sel[i]);out()});pk.appendChild(b);
  });
  function out(){
    var got=C.map(function(c,i){return sel[i]?c:null}).filter(Boolean),rel=C.filter(function(c){return c[1]}).length;
    var tp=got.filter(function(c){return c[1]}).length;
    var prc=got.length?tp/got.length:0,rec=tp/rel;
    $("#pr-out").innerHTML="Retrieved: <b>"+got.length+"</b>, relevant retrieved: <b>"+tp+"</b> of <b>"+rel+"</b> relevant in total.<br>Context precision = "+tp+"/"+got.length+" = <b>"+(got.length?H.fmt(prc,2):"n/a")+"</b> · Context recall = "+tp+"/"+rel+" = <b>"+H.fmt(rec,2)+"</b>";
  }
  out();
})();

Q.c9=[
  {q:"A coding agent solves a task correctly 80% of the time per attempt, independently. Roughly how often does it solve the same task correctly five times in a row?",o:["About 33%","About 80%","About 99%"],a:0,f:"0.8^5 ≈ 0.33. Reliability (pass^k) falls fast, while capability (pass@k) looks excellent."},
  {q:"An agent reports a 150× speed-up that exceeds the hardware's theoretical maximum. What is the most likely explanation, per the talk?",o:["It invented new physics","It exploited the reward function or scoring instead of doing the task","The hardware was wrong"],a:1,f:"Reward hacking. Always check whether the score truly measures the task."},
  {q:"Why must cost be a metric when evaluating agents?",o:["Agents can loop and call tools without a natural limit, so accuracy alone hides how expensive the result is","Cost is not important","Because benchmarks are free"],a:0,f:"Two agents with the same accuracy can differ by 10× in cost. The Pareto frontier shows the trade-off."},
  {q:"You retrieve 3 chunks, 2 are relevant, and 5 relevant chunks exist overall. What are precision and recall?",o:["Precision 2/3, recall 2/5","Precision 2/5, recall 2/3","Both 2/3"],a:0,f:"Precision = relevant retrieved ÷ retrieved. Recall = relevant retrieved ÷ all relevant."},
  {q:"Which is a good habit when you use an LLM as a judge?",o:["Trust it completely","Check it against human judgement and refine its criteria, because it can be wrong","Never use judges"],a:1,f:"Judges scale evaluation but have biases and errors. Treat them as a tool that you validate."}
];
