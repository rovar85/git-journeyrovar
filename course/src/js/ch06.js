/* Chapter 6 */

/* RAG stepper */
(function(){
  var RAG=[
    {t:"Prepare (done once, ahead of time)",b:"<p>Your company has many documents: refund policy, shipping rules, product guides. Cut each into small <b>chunks</b>. Turn each chunk into an <b>embedding</b> (a list of numbers that captures its meaning). Store the chunks and their numbers in a <b>vector database</b>.</p><div class='flow'><div class='node'>Documents</div><span class='arr'>→</span><div class='node'>Chunks</div><span class='arr'>→</span><div class='node hl'>Embeddings in a vector database</div></div>"},
    {t:"A question arrives",b:"<p>A customer asks: <i>\"Can I return a jacket I bought three weeks ago?\"</i> The system turns this question into an embedding too, using the same method.</p><div class='flow'><div class='node hl'>Question</div><span class='arr'>→</span><div class='node'>Question embedding</div></div>"},
    {t:"Search for the closest chunks",b:"<p>The database finds the stored chunks whose numbers are nearest to the question's numbers. This is a <b>nearest-neighbour search</b>. Keep the best few, for example the top 3. Say it finds the returns policy, the clothing exceptions, and the refund timeline. An optional <b>reranker</b> can reorder them.</p><div class='flow'><div class='node'>Question embedding</div><span class='arr'>→</span><div class='node hl'>Top-3 chunks</div></div>"},
    {t:"Build the prompt",b:"<p>Software writes a prompt that contains the chunks and the question, plus the safety rule from Chapter 5.</p><div class='promptbox'>Answer using only the text below. If the answer is not there, say you cannot find it.\n\n[chunk 1: returns policy]\n[chunk 2: clothing exceptions]\n[chunk 3: refund timeline]\n\nQuestion: Can I return a jacket I bought three weeks ago?</div>"},
    {t:"The model answers, with sources",b:"<p>The model reads the chunks and writes an answer based on them. Because you know which chunks you supplied, you can show the customer where the answer came from. Fewer made-up policies, and your private documents did the work.</p><div class='bubble model'><span class='who'>model</span>Yes. Clothing can be returned within 30 days if unworn, so three weeks is fine. (Source: returns policy, clothing exceptions.)</div>"}
  ];
  H.stepper($("#rag-step"),RAG,function(s,i,body){body.innerHTML="<p style='margin:0 0 6px'><b>"+s.t+"</b></p>"+s.b});
})();

/* chunking lab */
(function(){
  var TEXT="Items can be returned within 30 days of delivery for a full refund. Items must be unused and in original packaging. Clothing and jackets can be returned within 30 days if unworn and with tags attached. Swimwear and underwear cannot be returned for hygiene reasons. After we receive a returned item, refunds are issued to the original payment method within 5 to 7 business days. Standard shipping takes 3 to 5 business days. Express shipping takes 1 to 2 business days and costs extra.";
  var W=TEXT.split(/\s+/);
  var st={size:25,ov:5};
  var ctl=$("#ck-ctl");
  function draw(){
    var size=st.size,ov=Math.min(st.ov,size-1),step=Math.max(1,size-ov),chunks=[];
    for(var s=0;s<W.length;s+=step){chunks.push({s:s,e:Math.min(W.length,s+size)});if(s+size>=W.length)break}
    var h="<p style='margin:0'><b>"+W.length+" words</b> split into <b>"+chunks.length+" chunks</b>.</p>";
    chunks.forEach(function(c,i){
      var words=W.slice(c.s,c.e);var o=i>0?Math.min(ov,chunks[i-1].e-c.s):0;
      var html=words.map(function(w,k){return k<o?'<span class="add" style="background:var(--mark);border-radius:3px">'+esc(w)+"</span>":esc(w)}).join(" ");
      h+='<div class="out" style="margin:0"><b>Chunk '+(i+1)+'</b> <span style="color:var(--muted)">('+words.length+' words)</span><br>'+html+"</div>";
    });
    h+="<p style='margin:0;color:var(--muted);font-size:.9rem'>Highlighted words are the overlap copied from the previous chunk. Try size 12 with overlap 0, and find a rule that gets cut in half. Then add overlap and see whether it is whole in some chunk.</p>";
    $("#ck-out").innerHTML=h;
  }
  H.range(ctl,"Chunk size (words)",8,60,1,st.size,String,function(v){st.size=v;draw()});
  H.range(ctl,"Overlap (words)",0,15,1,st.ov,String,function(v){st.ov=v;draw()});
})();

/* retrieval lab */
(function(){
  var DOCS=[
    ["Returns policy","Items can be returned within 30 days of delivery for a full refund. Items must be unused and in original packaging. Start a return from your account page."],
    ["Clothing exceptions","Clothing and jackets can be returned within 30 days if unworn and with tags attached. Swimwear and underwear cannot be returned for hygiene reasons."],
    ["Refund timeline","After we receive a returned item, refunds are issued to the original payment method within 5 to 7 business days."],
    ["Shipping options","Standard shipping takes 3 to 5 business days. Express shipping takes 1 to 2 business days and costs extra. Orders over 50 dollars ship free."],
    ["Order tracking","Once an order ships you receive an email with a tracking link. Tracking updates can take up to 24 hours to appear."],
    ["Warranty","Electronics carry a one year warranty against manufacturing defects. Damage from drops or water is not covered."],
    ["Gift cards","Gift cards never expire and can be used on any purchase. They cannot be exchanged for cash."],
    ["Password reset","Choose forgot password on the sign in page. We email a reset link that works for 30 minutes."],
    ["Store hours","Our support team is available Monday to Friday from 9 in the morning to 6 in the evening."]
  ];
  var STOP="a an the of to in on for and or is are be can i my me it we you your do does how what when with at by from this that if as after".split(" ");
  function tok(s){return s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(Boolean).map(function(w){return w.replace(/(ing|ed|es|s)$/,"")}).filter(function(w){return w.length>1&&STOP.indexOf(w)<0})}
  var docs=DOCS.map(function(d){return tok(d[0]+" "+d[1])});
  var df={};docs.forEach(function(t){var seen={};t.forEach(function(w){if(!seen[w]){df[w]=(df[w]||0)+1;seen[w]=1}})});
  var N=docs.length;
  function vec(t){var tf={};t.forEach(function(w){tf[w]=(tf[w]||0)+1});var v={};Object.keys(tf).forEach(function(w){v[w]=tf[w]*(Math.log((N+1)/((df[w]||0)+1))+1)});return v}
  function cos(a,b){var d=0,na=0,nb=0;Object.keys(a).forEach(function(w){na+=a[w]*a[w];if(b[w])d+=a[w]*b[w]});Object.keys(b).forEach(function(w){nb+=b[w]*b[w]});return na&&nb?d/Math.sqrt(na*nb):0}
  var dv=docs.map(vec),k=3;
  function search(){
    var q=$("#rt-q").value,qv=vec(tok(q));
    var r=dv.map(function(v,i){return {i:i,score:cos(qv,v)}}).sort(function(a,b){return b.score-a.score}).slice(0,k);
    var hits=r.filter(function(x){return x.score>0});
    var h="";
    h+='<div class="bars" style="margin-top:12px">'+r.map(function(x){return '<div class="brow'+(x.score>0?"":" dim")+'" style="grid-template-columns:9em 1fr 3.5em"><span style="font-size:.85rem">'+esc(DOCS[x.i][0])+'</span><span class="t"><span class="f" style="width:'+Math.min(100,x.score*180)+'%"></span></span><span class="n">'+x.score.toFixed(2)+"</span></div>"}).join("")+"</div>";
    var prompt="Answer using only the text below. If the answer is not there, say you cannot find it.\n\n"+(hits.length?hits.map(function(x,n){return "[chunk "+(n+1)+": "+DOCS[x.i][0]+"] "+DOCS[x.i][1]}).join("\n"):"(no relevant chunks found)")+"\n\nQuestion: "+q;
    h+='<p style="margin:10px 0 4px;font-weight:700">The prompt this system would send to the model:</p><div class="promptbox">'+esc(prompt)+"</div>";
    if(!hits.length)h+='<p style="margin:8px 0 0"><span class="pill bad">No match</span> The model would be told to say it cannot find an answer. That is a safe failure, but a failure.</p>';
    $("#rt-out").innerHTML=h;
  }
  H.range($("#rt-ctl"),"Top-k (chunks to keep)",1,5,1,k,String,function(v){k=v;search()});
  $("#rt-go").addEventListener("click",search);
  $("#rt-q").addEventListener("keydown",function(e){if(e.key==="Enter")search()});
  [["Can I return a jacket I bought three weeks ago?"],["I forgot my password"],["How long until I get my money back?"],["my laptop screen cracked after I dropped it"],["Do gift cards expire?"]].forEach(function(e,i){
    var b=document.createElement("button");b.type="button";b.textContent=e[0]+(i===2||i===3?" (tricky)":"");b.addEventListener("click",function(){$("#rt-q").value=e[0];search()});$("#rt-ex").appendChild(b);
  });
  search();
})();

/* tool use stepper */
(function(){
  var TOOL=[
    {c:"user",w:"user",x:"What's the weather in San Francisco?",e:"The user asks something the model cannot know from training. Weather changes every hour."},
    {c:"model",w:"model (text only)",x:'{"tool": "get_weather", "city": "San Francisco"}',e:"The prompt told the model which tools exist and what format to use. The model writes a structured request. It has not called anything yet. It only wrote text."},
    {c:"sw",w:"your software",x:"Spots the request, then calls the real weather service with city = San Francisco.",e:"Your program reads the model's text, checks it is an allowed tool, and runs the real function. This is the part that actually touches the outside world."},
    {c:"sw",w:"weather service replies",x:'{"temperature_c": 17, "sky": "foggy"}',e:"The service returns raw data. (These values are examples.)"},
    {c:"sw",w:"your software",x:"Adds the result to the conversation and asks the model to continue.",e:"The model now sees the real data as part of its input."},
    {c:"model",w:"model",x:"It's about 17°C and foggy in San Francisco right now, so bring a light jacket.",e:"The model turns the raw data into a friendly answer. Done."}
  ];
  var root=$("#tool-step");
  H.stepper(root,TOOL,function(s,i,body){
    var wrap='<div class="chat">';
    TOOL.slice(0,i+1).forEach(function(m,k){
      wrap+='<div class="bubble '+m.c+'"'+(k===i?' style="outline:2px solid var(--accent)"':"")+'><span class="who">'+esc(m.w)+"</span>"+(m.x.charAt(0)==="{"?"<pre>"+esc(m.x)+"</pre>":esc(m.x))+"</div>";
    });
    wrap+='</div><p style="margin-bottom:0;font-size:.95rem"><b>What is happening:</b> '+esc(s.e)+"</p>";
    body.innerHTML=wrap;
  });
})();

Q.c6=[
  {q:"What problem does RAG mainly address?",o:["Making the model larger","Letting the model use fresh or private documents and show sources","Making the screen brighter"],a:1,f:"RAG looks up relevant text and gives it to the model, like an open-book exam."},
  {q:"In the search lab, 'How long until I get my money back?' found nothing. Why?",o:["The database was empty","Keyword search needs shared words, and the question says 'money back' while the chunk says 'refunds'. Embeddings handle this better","The model was offline"],a:1,f:"Meaning-based (embedding) search can match 'money back' with 'refund'. Many systems combine keyword and vector search."},
  {q:"Chunks are cut too small. What is the likely problem?",o:["They lose surrounding context, so a rule can be split from its conditions","They are too accurate","The database becomes larger than the internet"],a:0,f:"Too small loses context. Too large dilutes relevance and uses up your context budget. Overlap helps."},
  {q:"In tool use, who actually calls the weather service?",o:["The language model","Your software, after reading the model's request","The user's phone"],a:1,f:"The model only writes the request as text. Your software runs the real function and returns the result. The model proposes, your software executes."},
  {q:"A model that can retrieve, use tools, and decide what to do next after seeing results is moving toward which idea?",o:["A calculator","An AI agent","A bigger file"],a:1,f:"That loop of acting and observing is what Chapter 7 is about."}
];
