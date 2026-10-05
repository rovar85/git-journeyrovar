/* Chapter 7 */

/* sorter */
(function(){
  var T=[
    ["A website answers customers' questions about opening hours using a handful of fixed documents.","chatbot","A simple question-and-answer task. One or two model calls, maybe with retrieval, is enough."],
    ["For every incoming invoice: extract the fields, classify the department, route it, and always in that order.","workflow","The steps are known and fixed. Build them explicitly and optimise each step. It is cheaper and more controllable."],
    ["Find out why a company's search service stopped working, when you do not know where to look.","agent","The next step depends on what each check finds. This is ambiguous and multi-step, a good agent fit if the tools can verify progress."],
    ["Turn a bug report into a tested pull request.","agent","Ambiguous, high-value, and verifiable with tests. A classic agent use case."],
    ["Classify each support ticket into one of five categories, then draft a reply from a template.","workflow","Predictable steps. A routing step plus a chained prompt is easier to test than an autonomous agent."],
    ["Summarise this one document in five bullets.","chatbot","A single call. Do not over-engineer."]
  ];
  var i=0,score=0,root=$("#so-body");
  function show(){
    if(i>=T.length){root.innerHTML="<p style='margin:0'><b>Done: "+score+" of "+T.length+" correct.</b> Rule of thumb: if you can draw the whole decision tree in advance, build a workflow. If the next step depends on what you discover, consider an agent.</p><button class='btn ghost' id='so-r' type='button'>Try again</button>";$("#so-r").addEventListener("click",function(){i=0;score=0;show()});return}
    root.innerHTML="<p style='margin:0 0 8px'><b>"+(i+1)+" of "+T.length+".</b> "+esc(T[i][0])+'</p><div class="picker"></div><div class="out" hidden></div>';
    var pk=$(".picker",root),out=$(".out",root);
    ["chatbot","workflow","agent"].forEach(function(k){
      var b=document.createElement("button");b.type="button";b.textContent=k;
      b.addEventListener("click",function(){
        if(!out.hidden)return;var ok=k===T[i][1];if(ok)score++;
        $$("button",pk).forEach(function(x){x.disabled=true;if(x.textContent===T[i][1])x.style.borderColor="var(--good)"});
        out.hidden=false;out.innerHTML=(ok?"<b>Correct.</b> ":"<b>Best answer: "+T[i][1]+".</b> ")+esc(T[i][2])+' <button class="btn" type="button" id="so-n" style="margin-left:8px">Next</button>';
        $("#so-n").addEventListener("click",function(){i++;show()});
      });pk.appendChild(b);
    });
  }
  show();
})();

/* agent loop simulator */
(function(){
  var SC={
    a:{label:"Service is stopped",steps:[
      {think:"I need to know whether the indexing service is even running.",tool:"get_service_status",args:'server="EV01", service="Indexing"',obs:'{"status":"Stopped","start_type":"Automatic","error":null}',evidence:["Indexing service is Stopped"],hyp:"The service stopped. Why?"},
      {think:"It is stopped but set to start automatically, so something made it stop. Check recent events.",tool:"get_event_logs",args:'server="EV01", source="Indexing", last_minutes=60',obs:'["09:12 ERROR SQL connection timeout","09:12 ERROR Indexing task aborted"]',evidence:["Indexing service is Stopped","Event log: SQL connection timeout at 09:12"],hyp:"A database (SQL) connection problem caused the stop."},
      {think:"Test the SQL hypothesis directly before blaming it.",tool:"test_sql_connectivity",args:'server="EV01", database="EVDirectory"',obs:'{"reachable":false,"error":"timeout after 15s"}',evidence:["Indexing service is Stopped","Event log: SQL connection timeout at 09:12","SQL connectivity test: FAILS (timeout)"],hyp:"SQL connectivity is the likely root cause."},
      {think:"Rule out name resolution, a common cause of timeouts.",tool:"check_dns",args:'host="sql01.corp.example"',obs:'{"resolved":true,"address":"10.0.4.21"}',evidence:["Indexing service is Stopped","Event log: SQL connection timeout at 09:12","SQL connectivity test: FAILS (timeout)","DNS resolves correctly (ruled out)"],hyp:"Root cause: the SQL server is unreachable. DNS is fine."},
      {think:"I have enough evidence to report. Any fix that changes the system needs a human to approve it.",tool:null,final:"<b>Report.</b> Probable root cause: the Indexing service stopped after repeated SQL timeouts (09:12). SQL connectivity test fails; DNS is fine. Confidence: high. Evidence: service state, event log, SQL test, DNS check. <b>Suggested next step (needs human approval):</b> investigate the SQL server, then restart the service. No changes were made."}
    ]},
    b:{label:"Service is running",steps:[
      {think:"First, is the indexing service running?",tool:"get_service_status",args:'server="EV01", service="Indexing"',obs:'{"status":"Running","start_type":"Automatic","error":null}',evidence:["Indexing service is Running"],hyp:"Not a stopped service. Something else is wrong."},
      {think:"The service runs, so look at what it is complaining about.",tool:"get_event_logs",args:'server="EV01", source="Indexing", last_minutes=60',obs:'["10:40 WARN Name resolution failed for sql01.corp.example","10:41 WARN Retrying connection (3)"]',evidence:["Indexing service is Running","Event log: name resolution failures for the SQL host"],hyp:"A name-resolution (DNS) problem on the way to SQL."},
      {think:"Check DNS directly.",tool:"check_dns",args:'host="sql01.corp.example"',obs:'{"resolved":false,"error":"no record found"}',evidence:["Indexing service is Running","Event log: name resolution failures for the SQL host","DNS lookup for the SQL host: FAILS"],hyp:"Root cause: the SQL host name is not resolving."},
      {think:"One more check to see whether SQL itself is healthy.",tool:"test_sql_connectivity",args:'server="EV01", database="EVDirectory", by_ip=true',obs:'{"reachable":true,"latency_ms":8}',evidence:["Indexing service is Running","Event log: name resolution failures for the SQL host","DNS lookup for the SQL host: FAILS","SQL reachable by IP address (healthy)"],hyp:"SQL is healthy. The problem is the DNS record."},
      {think:"Enough evidence. Report and stop.",tool:null,final:"<b>Report.</b> Probable root cause: the DNS record for the SQL host is missing or not resolving. The SQL server is healthy when reached by IP. Confidence: medium to high. <b>Suggested next step (needs human approval):</b> restore the DNS record. No changes were made."}
    ]}
  };
  var cur="a",pk=$("#sim-pick");
  Object.keys(SC).forEach(function(k){var b=document.createElement("button");b.type="button";b.textContent=SC[k].label;b.addEventListener("click",function(){cur=k;build()});pk.appendChild(b)});
  function build(){
    $$("button",pk).forEach(function(b,i){b.setAttribute("aria-pressed",Object.keys(SC)[i]===cur)});
    var steps=SC[cur].steps;
    H.stepper($("#sim-step"),steps,function(s,i,body){
      var ctx="GOAL: Why is Enterprise Vault indexing down? (read-only tools only)\n";
      steps.slice(0,i).forEach(function(p,k){ctx+="\n["+(k+1)+"] tool: "+p.tool+"("+p.args+")\n    result: "+p.obs});
      var ev=s.evidence||(steps[i-1]&&steps[i-1].evidence)||[];
      var hyp=s.hyp||(steps[i-1]&&steps[i-1].hyp)||"(none yet)";
      var h='<div class="two"><div><p style="margin:0 0 4px"><b>Context before this decision</b></p><div class="pre-out">'+esc(ctx)+'</div></div><div><p style="margin:0 0 4px"><b>Agent state after this step</b></p><div class="out" style="margin:0"><b>Evidence so far:</b><ul style="margin:.3rem 0">'+ev.map(function(e){return "<li>"+esc(e)+"</li>"}).join("")+'</ul><b>Working hypothesis:</b> '+esc(hyp)+"</div></div></div>";
      h+='<div class="bubble model" style="margin-top:10px"><span class="who">model decides</span>'+esc(s.think)+"</div>";
      if(s.tool){h+='<div class="bubble sw" style="margin-top:8px"><span class="who">your software runs the tool</span><pre>'+esc(s.tool+"("+s.args+")")+"</pre></div><div class='bubble' style='margin-top:8px'><span class='who'>observation returned to the model</span><pre>"+esc(s.obs)+"</pre></div>"}
      else{h+='<div class="bubble model" style="margin-top:8px"><span class="who">final answer</span>'+s.final+"</div>"}
      body.innerHTML=h;
    });
  }
  build();
})();

Q.c7=[
  {q:"Which best describes an agent?",o:["A larger language model","A system where an LLM chooses actions toward a goal, using tools and observations, in a loop","A chatbot with a nicer interface"],a:1,f:"The agent is the whole loop around the model: instructions, tools, environment, state and stopping rules."},
  {q:"You can write down the entire decision tree for a task in advance. What should you build?",o:["A fully autonomous agent","A workflow, optimising each step","Nothing"],a:1,f:"When the path is predictable a workflow is cheaper, faster, more controllable and easier to test."},
  {q:"In the simulator, why did scenarios A and B end with different reports?",o:["The model guessed","Each observation changed the next decision, so the agent followed different paths","One scenario was broken"],a:1,f:"The next step depends on what the previous tool returned. That adaptivity is what makes it an agent."},
  {q:"Reflection (draft, critique, improve) is best described as...",o:["Proof that the answer is correct","A way to often improve quality, but not a guarantee, so you still verify with real checks","A type of memory"],a:1,f:"A model can critique an answer and still miss the real defect."},
  {q:"What is a major cost of adding more agents to a system?",o:["Nothing","Each agent adds another context, another failure surface, more messages and more cost","They become faster by definition"],a:1,f:"Use multi-agent designs when the separation of concerns or parallelism is worth the complexity."}
];
