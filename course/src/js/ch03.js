/* Chapter 3 */

/* loss calculator */
(function(){
  var st={p:0.62};
  H.range($("#ls-ctl"),"p (probability of the true token)",0.01,0.99,0.01,st.p,function(v){return H.fmt(v,2)},function(v){
    st.p=v;
    var l=-Math.log(v);
    $("#ls-out").innerHTML="Loss = −ln("+H.fmt(v,2)+") = <b>"+H.fmt(l,3)+"</b>. "+(v>=0.8?"The model was confident and right: small loss.":(v<=0.1?"The model gave the true token very little probability: large loss.":"Middling: the model was unsure."))+" A model with p = 0.01 on every token would have loss "+H.fmt(-Math.log(0.01),2)+", about "+H.fmt(-Math.log(0.01)/-Math.log(0.9),0)+"× worse than one with p = 0.9.";
  });
})();

/* gradient descent */
(function(){
  var lr=0.2,w0=-2,w=w0,path=[w0],steps=0;
  function f(x){return (x-3)*(x-3)}
  function X(x){return 20+(x+4)*(320/14)}   /* domain -4..10 */
  function Y(y){return 185-Math.min(y,40)*4}
  function draw(){
    var h='<line class="ax" x1="20" y1="185" x2="340" y2="185"/>';
    var d="";for(var x=-4;x<=10;x+=0.25){d+=(d?"L":"M")+X(x).toFixed(1)+" "+Y(f(x)).toFixed(1)}
    h+='<path class="ln" d="'+d+'"/>';
    path.forEach(function(p,i){if(p>=-4&&p<=10){h+='<circle class="pt'+(i===path.length-1?"":" mut")+'" cx="'+X(p)+'" cy="'+Y(f(p))+'" r="'+(i===path.length-1?6:3)+'"/>'}});
    h+='<text x="'+X(3)+'" y="198" text-anchor="middle">best w = 3</text>';
    $("#gd-svg").innerHTML=h;
    var cur=path[path.length-1];
    var msg=Math.abs(cur)>1e6?"The value exploded. The learning rate was too large.":"";
    $("#gd-out").innerHTML="Steps: <b>"+steps+"</b> · w = <b>"+(Math.abs(cur)>1e6?cur.toExponential(2):H.fmt(cur,4))+"</b> · loss = <b>"+(Math.abs(cur)>1e6?f(cur).toExponential(2):H.fmt(f(cur),4))+"</b>. Each step: w ← w − "+H.fmt(lr,2)+" × 2(w − 3)."+(msg?" <b>"+msg+"</b>":"");
  }
  function step(){w=w-lr*2*(w-3);path.push(w);steps++;draw()}
  function reset(){w=w0;path=[w0];steps=0;draw()}
  H.range($("#gd-ctl"),"Learning rate",0.05,1.25,0.05,lr,function(v){return H.fmt(v,2)},function(v){lr=v;reset()});
  $("#gd-step").addEventListener("click",step);
  $("#gd-run").addEventListener("click",function(){for(var i=0;i<10;i++){w=w-lr*2*(w-3);path.push(w);steps++}draw()});
  $("#gd-reset").addEventListener("click",reset);
  draw();
})();

/* data pipeline */
(function(){
  var S=[
    ["Crawl the web","Automated crawlers visit pages. Common Crawl adds new pages every month. Today that is on the order of 250 billion pages, about 1 petabyte (1,000,000 gigabytes)."],
    ["Extract the text","Pages arrive as HTML. You must pull out the real text and drop menus and footers. Maths and tables are hard to extract. Repeated forum headers and footers must not be repeated in the data."],
    ["Filter unwanted content","Remove unsafe or private material. Companies keep long blocklists of sites. Small classifier models can find personal information so it can be removed."],
    ["Remove duplicates","The same text appears again and again: boilerplate, the same page under many URLs, famous book passages copied thousands of times. Duplicates make the model over-weight them. Doing this at web scale is hard."],
    ["Heuristic quality filters","Simple rules catch junk. A page with an odd mix of words, unusually long words, only three words, or ten million words is suspicious."],
    ["Model-based quality filter","A trick: train a small classifier to tell apart pages that Wikipedia links to (usually decent quality) from random web pages. Keep more of what looks like the first group."],
    ["Balance the domains","Sort data into types such as code, books and entertainment. Up-weight those that help (code seems to help reasoning, books help) and down-weight others."],
    ["Finish on the best data","At the end of training the learning rate is lowered and the model is trained on very high-quality material, such as Wikipedia-like text, so it settles on the best patterns."]
  ];
  H.stepper($("#dt-step"),S,function(s,i,body){
    body.innerHTML="<p style='margin:.3rem 0'><b>"+(i+1)+". "+esc(s[0])+"</b></p><p style='margin:.3rem 0'>"+esc(s[1])+"</p>";
  });
})();

/* compute calculator */
(function(){
  var st={n:405,d:15.6,g:16000,u:0.4};
  var ctl=$("#cp-ctl"),out=$("#cp-out");
  var inputs={};
  function calc(){
    var N=st.n*1e9,D=st.d*1e12,flops=6*N*D;
    var perGpu=1e15*st.u,sec=flops/(st.g*perGpu),days=sec/86400;
    var gpuHours=st.g*sec/3600,cost=gpuHours*2;
    out.innerHTML="Training compute ≈ 6 × "+st.n+"B × "+st.d+"T = <b>"+H.sci(flops)+" FLOPs</b><br>Tokens per parameter: <b>"+H.fmt(D/N,1)+"</b> (Chinchilla-optimal is about 20)<br>With "+st.g.toLocaleString()+" GPUs at "+Math.round(st.u*100)+"% utilisation: about <b>"+H.fmt(days,0)+" days</b> and <b>"+H.fmt(gpuHours/1e6,1)+" million GPU-hours</b><br>Rough rental cost at $2 per GPU-hour: <b>$"+H.fmt(cost/1e6,0)+" million</b> (a lower bound; salaries and failed runs come on top)";
  }
  function build(){
    ctl.innerHTML="";
    inputs.n=H.range(ctl,"Parameters (billions)",1,1000,1,st.n,String,function(v){st.n=v;calc()});
    inputs.d=H.range(ctl,"Tokens (trillions)",0.1,30,0.1,st.d,function(v){return H.fmt(v,1)},function(v){st.d=v;calc()});
    inputs.g=H.range(ctl,"GPUs",100,30000,100,st.g,function(v){return v.toLocaleString()},function(v){st.g=v;calc()});
    inputs.u=H.range(ctl,"Utilisation",0.2,0.6,0.01,st.u,function(v){return Math.round(v*100)+"%"},function(v){st.u=v;calc()});
  }
  var P=[["Llama 3 405B (lecture example)",{n:405,d:15.6,g:16000,u:0.4}],["Chinchilla-style 70B",{n:70,d:1.4,g:2048,u:0.4}],["Small 7B trial",{n:7,d:2,g:512,u:0.4}]];
  var pk=$("#cp-presets");
  P.forEach(function(p){var b=document.createElement("button");b.type="button";b.textContent=p[0];b.addEventListener("click",function(){st={n:p[1].n,d:p[1].d,g:p[1].g,u:p[1].u};build()});pk.appendChild(b)});
  build();
})();

Q.c3=[
  {q:"In practice, which three of the five ingredients matter most, according to the Stanford lecture?",o:["Architecture, optimiser tricks and activation functions","Data, evaluation and systems","Colour of the logo, price and speed"],a:1,f:"Small architecture changes matter less than data quality, good measurement and efficient systems."},
  {q:"The model gives the correct next token probability 0.01. Compared with 0.9, the loss is...",o:["Much larger","Slightly smaller","The same"],a:0,f:"Loss = −ln(p). Low probability on the truth means a big loss, and training pushes it down."},
  {q:"You set the learning rate for the (w − 3)² example to 1.2. What happens?",o:["It converges slowly","It overshoots more each step and blows up","It lands exactly on w = 3"],a:1,f:"Above 1.0 the step is bigger than the distance to the target, so each step overshoots further."},
  {q:"What does Chinchilla's result suggest about training data?",o:["Use about 20 tokens per parameter for compute-optimal training","Always use as much data as possible with a tiny model","Data does not matter"],a:0,f:"Balance model size and data for a given compute budget. Models meant for heavy daily use are trained on more data than that, to keep them small."},
  {q:"Why can GPUs be idle even though they are fast?",o:["They get tired","Moving data to and from memory is slower than the arithmetic, so units wait","They only work at night"],a:1,f:"Memory and communication are the bottleneck. That is why low precision and operator fusion help."}
];
