/* Chapter 2 */

/* ---- neuron ---- */
(function(){
  var st={x1:0.6,x2:-0.4,w1:1.2,w2:0.8,b:-0.2,act:"relu"};
  var ctl=$("#nr-ctl");
  function out(){
    var z=st.w1*st.x1+st.w2*st.x2+st.b;
    var y=st.act==="relu"?Math.max(0,z):1/(1+Math.exp(-z));
    $("#nr-out").innerHTML="Sum: "+H.fmt(st.w1,2)+"×"+H.fmt(st.x1,2)+" + "+H.fmt(st.w2,2)+"×"+H.fmt(st.x2,2)+" + "+H.fmt(st.b,2)+" = <b>"+H.fmt(z,3)+"</b><br>After "+(st.act==="relu"?"ReLU (negative becomes 0)":"sigmoid (squashed between 0 and 1)")+": <b>"+H.fmt(y,3)+"</b>";
  }
  [["x1","input x1",-1,1],["x2","input x2",-1,1],["w1","weight w1",-2,2],["w2","weight w2",-2,2],["b","bias",-1,1]].forEach(function(r){
    H.range(ctl,r[1],r[2],r[3],0.05,st[r[0]],function(v){return H.fmt(v,2)},function(v){st[r[0]]=v;out()});
  });
  var pk=$("#nr-act");
  [["relu","ReLU"],["sig","Sigmoid"]].forEach(function(a){
    var b=document.createElement("button");b.type="button";b.textContent=a[1];b.setAttribute("aria-pressed",a[0]===st.act);
    b.addEventListener("click",function(){st.act=a[0];$$("button",pk).forEach(function(x,i){x.setAttribute("aria-pressed",i===(a[0]==="relu"?0:1))});out()});pk.appendChild(b);
  });
  out();
})();

/* ---- pipeline ---- */
(function(){
  var P=[
    ["Text","Your raw input, for example \"The cat sat on the\"."],
    ["Tokenizer","Cuts the text into sub-word pieces: [\"The\", \" cat\", \" sat\", \" on\", \" the\"]. It has a fixed vocabulary, often tens of thousands of pieces."],
    ["Token IDs","Each piece becomes an integer, for example [464, 3797, 3332, 319, 262]. These are illustrative."],
    ["Embeddings + position","Each ID is looked up to get a vector of numbers. Position information is added so the model knows the order."],
    ["Transformer blocks","Repeated N times (dozens). Each block mixes information across tokens with attention and then transforms it with a feed-forward network."],
    ["Logits","The last layer produces one raw score for every token in the vocabulary. So the output size equals the vocabulary size."],
    ["Softmax","Turns the scores into probabilities that add up to 1."],
    ["Next token","A decoder (greedy, temperature, top-k, top-p) picks one token. It is added to the text and the whole loop repeats."]
  ];
  var pk=$("#pp-pick"),out=$("#pp-out"),cur=0;
  function draw(){
    $$("button",pk).forEach(function(b,i){b.setAttribute("aria-pressed",i===cur)});
    out.innerHTML="<b>"+(cur+1)+". "+P[cur][0]+"</b><br>"+P[cur][1];
  }
  P.forEach(function(p,i){var b=document.createElement("button");b.type="button";b.textContent=(i+1)+". "+p[0];b.addEventListener("click",function(){cur=i;draw()});pk.appendChild(b)});
  draw();
})();

/* ---- BPE ---- */
(function(){
  var words=[["token",3],["tokens",2],["tokenizer",2],["to",2],["toe",1]];
  function run(){
    var seqs=words.map(function(w){return {s:w[0].split(""),c:w[1]}});
    var steps=[{title:"Start: every letter is its own token",merge:null,state:seqs.map(function(q){return q.s.slice()}),counts:null}];
    for(var k=0;k<8;k++){
      var cnt={};
      seqs.forEach(function(q){for(var i=0;i<q.s.length-1;i++){var p=q.s[i]+"\u0001"+q.s[i+1];cnt[p]=(cnt[p]||0)+q.c}});
      var best=null,bc=0;
      Object.keys(cnt).sort().forEach(function(p){if(cnt[p]>bc){bc=cnt[p];best=p}});
      if(!best||bc<2)break;
      var a=best.split("\u0001");
      seqs.forEach(function(q){var o=[];for(var i=0;i<q.s.length;i++){if(i<q.s.length-1&&q.s[i]===a[0]&&q.s[i+1]===a[1]){o.push(a[0]+a[1]);i++}else o.push(q.s[i])}q.s=o});
      steps.push({title:"Merge \""+a[0]+"\" + \""+a[1]+"\" → \""+a[0]+a[1]+"\" (seen "+bc+" times)",state:seqs.map(function(q){return q.s.slice()})});
    }
    return steps;
  }
  var steps=run();
  H.stepper($("#bpe-step"),steps,function(s,i,body){
    var html="<p style='margin:.3rem 0'><b>"+esc(s.title)+"</b></p><div class='tblwrap'><table class='tbl'><thead><tr><th>Word</th><th>×</th><th>Tokens now</th></tr></thead><tbody>";
    words.forEach(function(w,k){html+="<tr><td>"+w[0]+"</td><td>"+w[1]+"</td><td style='font-family:var(--f-mono)'>"+s.state[k].map(function(t){return "["+esc(t)+"]"}).join(" ")+"</td></tr>"});
    html+="</tbody></table></div>";
    if(i===steps.length-1)html+="<p>Finished. Common chunks like \"token\" became single tokens. The rare word \"toe\" stays as \"to\" + \"e\". Real tokenizers do this on gigabytes of text and stop at a chosen vocabulary size. When using one, they always pick the largest matching token available.</p>";
    body.innerHTML=html;
  });
})();

/* ---- embeddings ---- */
(function(){
  var W={cat:[2.2,4.2],kitten:[2.6,4.7],dog:[3.2,3.8],puppy:[3.6,4.3],car:[8.2,1.8],truck:[8.8,2.4],bus:[7.6,2.9],database:[1.6,-1.5],SQL:[2.4,-2.1],server:[3.3,-1.2]};
  var names=Object.keys(W);
  var svg=$("#emb-svg"),a=$("#emb-a"),b=$("#emb-b");
  names.forEach(function(n){[a,b].forEach(function(s){var o=document.createElement("option");o.value=n;o.textContent=n;s.appendChild(o)})});
  a.value="cat";b.value="kitten";
  function X(x){return 20+x*34}function Y(y){return 200-(y+2.5)*32}
  function cos(p,q){return (p[0]*q[0]+p[1]*q[1])/(Math.hypot(p[0],p[1])*Math.hypot(q[0],q[1]))}
  function draw(){
    var h='<line class="ax" x1="20" y1="215" x2="345" y2="215"/><line class="ax" x1="20" y1="10" x2="20" y2="215"/>';
    names.forEach(function(n){var on=n===a.value||n===b.value;h+='<circle class="pt'+(on?"":" mut")+'" cx="'+X(W[n][0])+'" cy="'+Y(W[n][1])+'" r="'+(on?6:4)+'"/><text x="'+(X(W[n][0])+8)+'" y="'+(Y(W[n][1])+4)+'" style="'+(on?"fill:var(--ink);font-weight:700":"")+'">'+n+"</text>"});
    var A=W[a.value],B=W[b.value];
    h+='<line x1="'+X(A[0])+'" y1="'+Y(A[1])+'" x2="'+X(B[0])+'" y2="'+Y(B[1])+'" stroke="var(--accent)" stroke-dasharray="4 3"/>';
    svg.innerHTML=h;
    var dot=A[0]*B[0]+A[1]*B[1],dist=Math.hypot(A[0]-B[0],A[1]-B[1]);
    $("#emb-out").innerHTML="Cosine similarity of the two arrows (from the origin): <b>"+H.fmt(cos(A,B),3)+"</b> (1 means pointing the same way). Dot product: <b>"+H.fmt(dot,2)+"</b>. Distance on the map: <b>"+H.fmt(dist,2)+"</b>. "+(dist<1.5?"Close together: similar meaning.":(dist>5?"Far apart: unrelated meaning.":"Some relation."));
  }
  a.addEventListener("change",draw);b.addEventListener("change",draw);draw();
})();

/* ---- attention ---- */
(function(){
  var T=["The","cat","which","was","hungry","ate","the","fish"];
  var S={ // illustrative raw scores [query][key]
    The:{The:1.5},
    cat:{The:1.4,cat:1.2,which:0.6},
    which:{cat:2.6,which:0.8,The:0.2},
    was:{cat:1.8,which:1.5,was:0.8},
    hungry:{cat:2.2,was:1.9,which:0.9,hungry:0.8},
    ate:{cat:2.4,hungry:2.8,fish:2.2,was:1.0,ate:0.8},
    the:{ate:1.6,fish:0.6,the:0.7},
    fish:{ate:2.3,the:2.0,fish:0.9,cat:0.8}
  };
  var q=5,pk=$("#at-pick"),mask=$("#at-mask");
  T.forEach(function(w,i){var b=document.createElement("button");b.type="button";b.textContent=w;b.addEventListener("click",function(){q=i;draw()});pk.appendChild(b)});
  function draw(){
    $$("button",pk).forEach(function(b,i){b.setAttribute("aria-pressed",i===q)});
    var sc=T.map(function(k,j){var base=(S[T[q]]&&S[T[q]][k]!==undefined)?S[T[q]][k]:0;return (mask.checked&&j>q)?null:base});
    var mx=Math.max.apply(null,sc.filter(function(v){return v!==null}));
    var ex=sc.map(function(v){return v===null?0:Math.exp(v-mx)});
    var tot=ex.reduce(function(a,b){return a+b},0);
    var box=$("#at-bars");box.innerHTML="";
    T.forEach(function(k,j){
      var p=ex[j]/tot;
      var r=document.createElement("div");r.className="brow"+(sc[j]===null?" dim":"");
      r.innerHTML='<span>'+k+'</span><span class="t"><span class="f" style="width:'+Math.round(p*100)+'%"></span></span><span class="n">'+(sc[j]===null?"masked":Math.round(p*100)+"%")+"</span>";
      box.appendChild(r);
    });
    $("#at-out").textContent="When processing \""+T[q]+"\", the model builds its new representation as a weighted mix of the Value vectors. The weights are learned numbers, not conscious attention."+(mask.checked?" Future words are masked, so they get zero weight.":"");
  }
  mask.addEventListener("change",draw);draw();
})();

/* ---- decoding ---- */
(function(){
  var L=[["dog",4.7],["cat",2.1],["mat",1.2],["bird",0.9],["tree",0.3],["car",-0.4],["sun",-1.0],["the",-2.0]];
  var st={m:"temp",t:1,k:3,p:0.9},tally={};
  var mp=$("#dc-method"),ctl=$("#dc-ctl");
  var M=[["greedy","Greedy"],["temp","Temperature"],["topk","Top-k"],["topp","Top-p"]];
  M.forEach(function(m){var b=document.createElement("button");b.type="button";b.textContent=m[1];b.addEventListener("click",function(){st.m=m[0];tally={};build()});mp.appendChild(b)});
  function probs(){
    var T=st.m==="greedy"?1:st.t;
    var mx=Math.max.apply(null,L.map(function(x){return x[1]/T}));
    var ex=L.map(function(x){return Math.exp(x[1]/T-mx)});var s=ex.reduce(function(a,b){return a+b},0);
    var p=ex.map(function(e){return e/s});
    var keep=L.map(function(){return true});
    if(st.m==="greedy"){keep=L.map(function(x,i){return i===0})}
    if(st.m==="topk"){keep=L.map(function(x,i){return i<st.k})}
    if(st.m==="topp"){var acc=0;keep=L.map(function(x,i){var k=acc<st.p;acc+=p[i];return k})}
    var kept=p.map(function(v,i){return keep[i]?v:0});var ks=kept.reduce(function(a,b){return a+b},0);
    return {raw:p,fin:kept.map(function(v){return v/ks}),keep:keep};
  }
  function build(){
    $$("button",mp).forEach(function(b,i){b.setAttribute("aria-pressed",M[i][0]===st.m)});
    ctl.innerHTML="";
    if(st.m==="temp"||st.m==="topk"||st.m==="topp")H.range(ctl,"Temperature",0.1,2.5,0.05,st.t,function(v){return H.fmt(v,2)},function(v){st.t=v;draw()});
    if(st.m==="topk")H.range(ctl,"k (words kept)",1,8,1,st.k,String,function(v){st.k=v;draw()});
    if(st.m==="topp")H.range(ctl,"p (probability mass)",0.1,1,0.05,st.p,function(v){return H.fmt(v,2)},function(v){st.p=v;draw()});
    draw();
  }
  function draw(){
    var P=probs(),box=$("#dc-bars");box.innerHTML="";
    L.forEach(function(x,i){
      var r=document.createElement("div");r.className="brow"+(P.keep[i]?"":" dim");
      r.innerHTML='<span>'+x[0]+' <small style="color:var(--muted)">'+x[1]+'</small></span><span class="t"><span class="f" style="width:'+Math.round(P.fin[i]*100)+'%"></span></span><span class="n">'+(P.fin[i]*100).toFixed(1)+"%</span>";
      box.appendChild(r);
    });
    var t=Object.keys(tally).sort(function(a,b){return tally[b]-tally[a]}).map(function(k){return k+" ×"+tally[k]}).join("  ");
    $("#dc-tally").textContent=t;
  }
  $("#dc-draw").addEventListener("click",function(){
    tally={};var P=probs();
    for(var n=0;n<20;n++){var r=Math.random(),acc=0,pick=0;for(var i=0;i<L.length;i++){acc+=P.fin[i];if(r<=acc){pick=i;break}}tally[L[pick][0]]=(tally[L[pick][0]]||0)+1}
    draw();
  });
  build();
})();

Q.c2=[
  {q:"In one line, what does self-attention do?",o:["It stores facts in a database","It lets each token build a new representation by weighting and mixing information from other tokens","It splits text into tokens"],a:1,f:"Compare (Q with K), weight (softmax), mix (the V vectors)."},
  {q:"Why do models use sub-word tokens instead of whole words or single letters?",o:["Whole words cannot handle typos and rare words, and letters make sequences too long and costly","Sub-words are easier for humans to read","Letters are not stored in computers"],a:0,f:"Sub-words balance vocabulary size and sequence length. Attention cost grows roughly with the square of the length."},
  {q:"You raise the temperature from 0.2 to 2.0. What most likely happens?",o:["Output becomes more varied and less predictable","Output becomes identical every time","The model gets smarter"],a:0,f:"Higher temperature flattens the probabilities, so lower-ranked tokens get picked more often."},
  {q:"What does a causal mask do?",o:["Hides some words from the user","Stops a token from attending to future tokens, so generation can go left to right","Removes typos"],a:1,f:"At generation time future tokens do not exist yet, so the model must not use them."},
  {q:"Which best describes an embedding?",o:["A dictionary definition of a word","A learned list of numbers where similar meanings end up close together","The spelling of a word"],a:1,f:"It is a learned vector. Meaning is spread across the numbers and refined by the layers using context."}
];
