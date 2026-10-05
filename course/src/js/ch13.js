/* Chapter 13 */

/* architecture parts */
(function(){
  var P=[
    ["Offline: RAG feature pipeline","Before the game starts: download text about each philosopher from Wikipedia and the Stanford Encyclopedia of Philosophy, split it into chunks, remove near-duplicates, embed each chunk, and store the embeddings in MongoDB's vector search. This is the <b>long-term memory</b>."],
    ["Offline: evaluation data","A strong model generates realistic user-philosopher conversations grounded in the same chunks. These become the test set."],
    ["Online: game UI (Phaser)","A JavaScript browser game. When you press space near a philosopher and type, the UI opens a WebSocket connection to the backend and shows the streamed reply."],
    ["Online: FastAPI server","The API the game talks to. It has WebSocket and HTTP endpoints and calls the agent graph, streaming each chunk back."],
    ["Online: agent layer (LangGraph)","The workflow that implements the character's brain: nodes, edges, state, and the decision whether to retrieve."],
    ["Online: memory, retrieval, prompts","The graph state is saved in MongoDB (short-term memory). A retrieval tool searches the vector store (long-term memory). Prompts are managed and versioned."],
    ["Online: LLM gateway","The model provider. The project uses Groq with Llama 3.3 70B for conversation and Llama 3.1 8B for summaries."],
    ["Observability and evaluation (Opik)","Traces of every run, a prompt library with versions, datasets and experiments with scores."]
  ];
  var cur=0,pk=$("#a13-pick");
  function draw(){$$("button",pk).forEach(function(b,i){b.setAttribute("aria-pressed",i===cur)});$("#a13-out").innerHTML="<b>"+P[cur][0]+"</b><br>"+P[cur][1]}
  P.forEach(function(p,i){var b=document.createElement("button");b.type="button";b.textContent=p[0];b.addEventListener("click",function(){cur=i;draw()});pk.appendChild(b)});
  draw();
})();

/* follow one message */
(function(){
  var S=[
    ["The player asks","You stand next to Turing, press space, and type: \"Can you describe the Turing test?\" The game UI sends that text, with the philosopher's ID, over the open WebSocket."],
    ["FastAPI receives it","The server accepts the JSON message and checks it has a message and a philosopher ID. It looks up the philosopher's data (name, perspective, style) and calls the agent graph in streaming mode."],
    ["The graph starts","LangGraph loads the saved state for this philosopher's thread ID (the earlier chat history) from MongoDB and enters the conversation node."],
    ["The agent decides","The model sees the question is about a specific topic. It decides to call the retrieval tool. (For \"hello, how are you?\" it would not.)"],
    ["Retrieval runs","The tool searches the vector store and returns the best chunks about Turing from Wikipedia and the Stanford Encyclopedia. A small model summarises them to save tokens."],
    ["The model answers in character","Back in the conversation node, the model now has the evidence and writes the reply as Turing, in his style."],
    ["Streaming back","The server streams the answer chunk by chunk over the WebSocket. The game assembles it in the dialogue box. State is saved. A trace of the whole run goes to the observability tool."]
  ];
  H.stepper($("#p13-step"),S,function(s,i,body){body.innerHTML="<p style='margin:.3rem 0'><b>"+(i+1)+". "+esc(s[0])+"</b></p><p style='margin:.3rem 0'>"+esc(s[1])+"</p>"});
})();

/* graph walk */
(function(){
  var N={start:["START",""],conv:["conversation","model replies, or asks for the tool"],ret:["retrieve philosopher context","tool node: vector search"],sctx:["summarise context","compress retrieved text"],conn:["connector","does nothing, joins paths"],sconv:["summarise conversation","only if over 30 messages"],end:["END",""]};
  var order=["start","conv","ret","sctx","conn","sconv","end"];
  var SC=[
    {label:"\"Hello, who are you?\"",path:["start","conv","conn","end"],note:["Start of the workflow.","The model answers directly. No tool is needed.","The conditional edge sends the flow to the connector (no retrieval). The chat is short, so no summary is needed.","Done. The reply is returned."]},
    {label:"\"Explain the Chinese room argument\"",path:["start","conv","ret","sctx","conv","conn","end"],note:["Start.","The model decides it needs background and requests the retrieval tool.","The conditional edge routes to the retrieval node, which fetches chunks.","The retrieved text is summarised to save tokens.","Back to the conversation node (the loop). With the evidence in context it writes the in-character reply.","Now no further tool is requested, so the flow goes to the connector.","Done."]},
    {label:"A very long conversation (over 30 messages)",path:["start","conv","conn","sconv","end"],note:["Start.","The model replies.","The connector node feeds a second conditional edge: should the conversation be summarised?","Yes: the message count is over the limit, so an old history is compressed into a summary to keep the context small.","Done."]}
  ];
  var cur=0,pk=$("#g13-pick");
  SC.forEach(function(s,i){var b=document.createElement("button");b.type="button";b.textContent=s.label;b.addEventListener("click",function(){cur=i;build()});pk.appendChild(b)});
  function build(){
    $$("button",pk).forEach(function(b,i){b.setAttribute("aria-pressed",i===cur)});
    var sc=SC[cur];
    H.stepper($("#g13-step"),sc.path,function(id,i,body){
      var visited=sc.path.slice(0,i+1);
      var h='<div class="graph">'+order.map(function(k){return '<div class="gnode'+(k===id?" on":"")+(visited.indexOf(k)<0?"":"")+'" style="'+(visited.indexOf(k)>=0&&k!==id?"border-color:var(--muted)":"")+'"><b>'+N[k][0]+"</b>"+(N[k][1]?"<small>"+N[k][1]+"</small>":"")+(k===id?"<small style='color:var(--accent)'>← you are here</small>":"")+"</div>"}).join("")+"</div>";
      h+="<p style='margin:.3rem 0'>"+esc(sc.note[i])+"</p><p style='margin:.3rem 0;color:var(--muted);font-size:.9rem'>Path so far: "+visited.map(function(k){return N[k][0]}).join(" → ")+"</p>";
      body.innerHTML=h;
    });
  }
  build();
})();

/* short-term memory demo */
(function(){
  var chk=$("#m13-on"),chat=$("#m13-chat");
  function draw(){
    var on=chk.checked;
    var msgs=[["user","Hello, my name is Miguel."],["model","Hello Miguel. I'm Alan Turing. Do you think machines can think?"],["user","Do you remember my name?"],["model",on?"Yes, Miguel. You told me a moment ago. Shall we return to the imitation game?":"I'm afraid I do not know your name. We have only just met."]];
    chat.innerHTML=msgs.map(function(m){return '<div class="bubble '+(m[0]==="model"?"model":"")+'"><span class="who">'+(m[0]==="model"?"Turing":"you")+"</span>"+esc(m[1])+"</div>"}).join("")+'<p style="margin:6px 0 0;font-size:.92rem;color:var(--muted)">'+(on?"With the checkpointer, the previous messages are loaded from the database for this thread ID and included in the prompt.":"Without saved state, each call starts fresh, so the model has no idea what was said before.")+"</p>";
  }
  chk.addEventListener("change",draw);draw();
})();

/* http vs websocket */
(function(){
  var out=$("#w13-out"),text="The Turing test is a way to ask whether a machine's conversation can be told apart from a human's.".split(" "),timers=[];
  function clear(){timers.forEach(clearTimeout);timers=[]}
  $("#w13-http").addEventListener("click",function(){
    clear();out.textContent="Waiting for the full answer… (the connection is open, nothing visible yet)";
    timers.push(setTimeout(function(){out.textContent=text.join(" ")},1600));
  });
  $("#w13-ws").addEventListener("click",function(){
    clear();out.textContent="";
    text.forEach(function(w,i){timers.push(setTimeout(function(){out.textContent+=(i?" ":"")+w},180*(i+1)))});
  });
})();

/* prompt versions */
(function(){
  var V=[["v1","You are a helpful assistant."],["v2","You are a helpful assistant. Talk like Mario Bros."],["v3","You are a helpful assistant. Talk like Mario Bros. Additionally, summarise every document you receive."]];
  var cur=2,pk=$("#pv-pick");
  V.forEach(function(v,i){var b=document.createElement("button");b.type="button";b.textContent=v[0]+(i===V.length-1?" (latest)":"");b.addEventListener("click",function(){cur=i;draw()});pk.appendChild(b)});
  function draw(){
    $$("button",pk).forEach(function(b,i){b.setAttribute("aria-pressed",i===cur)});
    var prev=cur>0?V[cur-1][1]:"",txt=V[cur][1];
    $("#pv-box").innerHTML=(prev&&txt.indexOf(prev)===0?esc(prev)+'<span class="add">'+esc(txt.slice(prev.length))+"</span>":esc(txt))+"\n\n"+(cur<V.length-1?"(An older version. You can compare it with the latest, or fall back to it if a change made things worse.)":"(The latest version. Highlighted text is what changed from the previous version.)");
  }
  draw();
})();

/* trace */
(function(){
  var S=[["start",2],["conversation (model decides)",900],["tool: retrieve context",350],["summarise context",420],["conversation (final answer)",1100],["save state",60]];
  var total=S.reduce(function(a,b){return a+b[1]},0);
  $("#tr-bars").innerHTML=S.map(function(s){return '<div class="brow" style="grid-template-columns:12em 1fr 4em"><span style="font-size:.85rem">'+s[0]+'</span><span class="t"><span class="f" style="width:'+(s[1]/total*100)+'%"></span></span><span class="n">'+s[1]+" ms</span></div>"}).join("");
  $("#tr-out").innerHTML="Total about <b>"+total+" ms</b>. In a real trace you would also see the prompt text, token counts and the tool arguments for every span. Two model calls (the first decides, the second answers) account for most of the time.";
})();

Q.c13=[
  {q:"What makes the PhiloAgents design 'agentic RAG' rather than plain RAG?",o:["It always retrieves for every message","A conditional edge lets the model decide whether to call the retrieval tool","It has no database"],a:1,f:"The agent decides when it needs retrieval. 'Hello' needs none, a question about the Chinese room does."},
  {q:"What is the difference between short-term and long-term memory in the project?",o:["Short-term is chat history saved in graph state. Long-term is the vector store of grounded knowledge","They are the same","Long-term is the chat history"],a:0,f:"The thread ID keeps each philosopher's history separate. The vector store holds biographies and ideas."},
  {q:"Why use WebSockets instead of plain HTTP for the game?",o:["They are older","One persistent two-way connection means low delay and real-time streaming of chunks","They are required by Python"],a:1,f:"HTTP opens a connection per request. A WebSocket stays open for both sides to send."},
  {q:"Why version prompts?",o:["Prompts never change","Prompts are edited many times, and versioning lets you compare, see progress and fall back, like code","It makes the model bigger"],a:1,f:"The project's character card reached 18 versions."},
  {q:"A judge model gives a low moderation score to a philosopher defending free speech. What is the lesson?",o:["The judge is always right","LLM judges can be wrong, so check them","Moderation metrics are useless"],a:1,f:"Treat the judge as a tool you validate, not as an oracle."}
];
