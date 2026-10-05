/* Chapter 14 */

/* design workbook */
(function(){
  var TOOLS=[
    ["get_service_status",true,"state of one Windows service on one server"],
    ["get_event_logs",true,"recent event-log entries for a source"],
    ["check_dns",true,"does a host name resolve?"],
    ["check_spn",true,"are service principal names registered correctly?"],
    ["get_ev_service_status",true,"state of an Enterprise Vault service"],
    ["collect_dtrace",true,"collect a diagnostic trace"],
    ["inspect_configuration",true,"read configuration (no changes)"],
    ["test_sql_connectivity",true,"can the server reach its SQL database?"],
    ["run_readonly_query",true,"a restricted, read-only SQL query"],
    ["restart_service",false,"WRITE: restart a service"],
    ["change_configuration",false,"WRITE: change configuration"]
  ];
  var SAFE=[
    ["ro","All tools are read-only in version 1",true],
    ["appr","Human approval required before any write action",true],
    ["deny","Unknown tools are denied by default (allow list)",true],
    ["audit","Every tool call is logged with arguments and result",true],
    ["untrust","Documents and tool output are treated as untrusted data, never as instructions",true],
    ["priv","Credentials use least privilege",true]
  ];
  var EV=[
    ["succ","Task success rate",true],["diag","Diagnosis accuracy",true],["evid","Evidence sufficiency",true],["toolsel","Tool selection accuracy",true],
    ["safev","Safety violations",true],["lat","Latency",true],["cost","Cost per task",true],["esc","Escalation rate",false],["reg","Regression rate",true]
  ];
  /* tools: show name + description, default checked only if read-only */
  var tbox=$("#wb-tools");
  TOOLS.forEach(function(t){var l=document.createElement("label");l.innerHTML='<input type="checkbox" id="wt-'+t[0]+'"'+(t[1]?" checked":"")+"> <span><code>"+t[0]+"</code> "+esc(t[2])+"</span>";tbox.appendChild(l)});
  var sbox=$("#wb-safe");SAFE.forEach(function(s){var l=document.createElement("label");l.innerHTML='<input type="checkbox" id="ws-'+s[0]+'"'+(s[2]?" checked":"")+"> <span>"+esc(s[1])+"</span>";sbox.appendChild(l)});
  var ebox=$("#wb-eval");EV.forEach(function(s){var l=document.createElement("label");l.innerHTML='<input type="checkbox" id="we-'+s[0]+'"'+(s[2]?" checked":"")+"> <span>"+esc(s[1])+"</span>";ebox.appendChild(l)});
  var st={cases:50,steps:15,budget:0.5};
  H.range($("#wb-ctl"),"Test scenarios",10,200,5,st.cases,String,function(v){st.cases=v});
  H.range($("#wb-ctl"),"Max steps per run",3,40,1,st.steps,String,function(v){st.steps=v});
  H.range($("#wb-ctl"),"Max cost per run",0.05,5,0.05,st.budget,function(v){return "$"+H.fmt(v,2)},function(v){st.budget=v});
  var text="";
  function gen(){
    var tools=TOOLS.filter(function(t){return $("#wt-"+t[0]).checked});
    var writes=tools.filter(function(t){return !t[1]});
    var L=[];
    L.push("ENTERPRISE VAULT DIAGNOSTIC AGENT: DESIGN BRIEF","");
    L.push("1. GOAL",$("#wb-goal").value.trim(),"");
    L.push("2. ARCHITECTURE","User -> agent host -> agent loop (LLM + RAG over runbooks + task state) -> MCP client -> MCP server -> Enterprise Vault / Windows / SQL. Evidence, evaluation, human approval for risky actions, verification, audit trail.","");
    L.push("3. TOOLS ("+tools.length+")");
    tools.forEach(function(t){L.push("  - "+t[0]+(t[1]?" [read-only]":" [WRITE, needs approval]")+": "+t[2].replace("WRITE: ",""))});
    if(!tools.length)L.push("  (no tools selected: the agent cannot gather evidence)");
    L.push("");
    L.push("4. SAFETY POLICY");
    SAFE.forEach(function(s){if($("#ws-"+s[0]).checked)L.push("  - "+s[1])});
    if(writes.length&&!$("#ws-appr").checked)L.push("  !! WARNING: write tools are selected but human approval is not required.");
    if(writes.length&&$("#ws-ro").checked)L.push("  !! NOTE: write tools conflict with 'all tools are read-only'. Decide which stage you are building.");
    L.push("");
    L.push("5. LIMITS","  - Max "+st.steps+" steps and $"+H.fmt(st.budget,2)+" per run; stop and escalate to a human when exceeded.","");
    L.push("6. EVALUATION","  - Test set: "+st.cases+" controlled failure scenarios, kept as a regression suite"+(st.cases<50?" (your notes recommend 50 or more)":""));
    EV.forEach(function(s){if($("#we-"+s[0]).checked)L.push("  - Measure: "+s[1])});
    L.push("  - Judge the trajectory (tool choice, evidence) as well as the final answer.","  - Capability (pass@k) and reliability (pass^k) are both reported.","");
    L.push("7. ROLLOUT","  Phase 1 Observe (read-only diagnosis) -> Phase 2 Verify (cross-checks, regression suite) -> Phase 3 Remediate (approval-gated fixes) -> Phase 4 Learn (traces, versioned prompts and tools).");
    text=L.join("\n");$("#wb-out").textContent=text;
  }
  $("#wb-gen").addEventListener("click",gen);
  $("#wb-copy").addEventListener("click",function(){if(!text)gen();H.copy($("#wb-copy"),text)});
})();

/* master test */
(function(){
  var T=[
    ["Draw the full LLM pipeline.","Text → tokenizer → token IDs → embeddings plus position → Transformer blocks → logits → softmax or decoding → next token → repeat."],
    ["Explain attention with Q/K/V.","Each token makes a query (what am I looking for), a key (what do I offer) and a value (what I pass on). Compare each query with all keys for compatibility scores, softmax them into weights, then mix the values with those weights."],
    ["Explain pre-training versus post-training.","Pre-training predicts the next token on huge text and gives knowledge (a base model). Post-training (SFT, preference learning) uses much smaller, higher-quality data to make it follow instructions and behave helpfully and safely."],
    ["Explain SFT, RLHF and DPO.","SFT learns from demonstrations (good example answers). RLHF learns from human comparisons through a reward model and reinforcement learning. DPO uses the same preference pairs but trains directly to raise the preferred answer and lower the rejected one."],
    ["Explain RAG.","Chunk and embed documents into an index. For a question, embed it, retrieve the top-k chunks, put them in the prompt, and let the model answer with the evidence. It reduces hallucination and enables sources, but is not a guarantee."],
    ["Draw the agent loop.","Goal → model → tool → observation → state → model → … → done."],
    ["Explain workflow versus agent.","A workflow follows a path you defined. An agent lets the model direct its own steps based on observations. Choose the simplest that works."],
    ["Explain capability versus reliability.","Capability: it can succeed sometimes (pass@k). Reliability: it succeeds every time (pass^k). Products need reliability. 80% per try is about 33% for five in a row."],
    ["Draw MCP host / client / server.","User → host (AI application with model and loop) → MCP client → MCP server (tools, resources, prompts) → external systems."],
    ["Explain tools versus resources versus prompts.","Tools are model-controlled actions. Resources are application-controlled data. Prompts are user-controlled templates."],
    ["Explain why MCP does not replace an agent framework.","The framework owns the loop, state, memory and planning. MCP is a standard layer for reaching tools and context. They complement each other."],
    ["Explain sampling and composability.","Sampling: a server asks the client to run a model call, so the client controls model, cost and privacy. Composability: a node can be both client and server, so systems can be layered."],
    ["Explain the important 2026 MCP changes.","Your notes say a July 2026 specification moved toward a stateless request-and-response core and changed or deprecated some features. I could not verify this, so read the current specification and SDK documentation before you implement anything."],
    ["Design five read-only EV tools.","For example get_service_status, get_event_logs, check_dns, test_sql_connectivity and collect_dtrace. Each with a narrow job, typed inputs, structured output, clear errors and no side effects."],
    ["Design an EV evaluation case.","Name the injected fault, the environment, the expected evidence, the expected outcome (root cause plus evidence) and the safety constraint (read-only). Keep it reproducible, and store it in the regression suite."],
    ["Define a human approval boundary.","Any action that changes a system or is destructive: the agent proposes, a risk check runs, a human approves, a narrow action executes, the result is verified, and everything is audited."],
    ["Describe an observability trace.","An ordered record of each model call, tool call, arguments, results, timings, token use and the stopping decision, so you can reconstruct why the agent acted as it did."],
    ["Explain what PhiloAgents contributes.","A complete, open reference stack: game UI, WebSocket API, a LangGraph agent with agentic RAG, short- and long-term memory, versioned prompts, tracing and evaluation with judge metrics."],
    ["Present the EV agent design in 10 minutes.","Goal and non-goals; architecture; tools (read-only first); safety and approval; evaluation and test set; rollout in four phases; what you measured and what you learned."]
  ];
  var root=$("#mt");
  root.innerHTML=T.map(function(t,i){return '<details class="fold"><summary>'+(i+1)+". "+esc(t[0])+"</summary><p style='margin:.6rem 0 0'>"+esc(t[1])+"</p></details>"}).join("");
})();

Q.c14=[
  {q:"What should the first version of your diagnostic agent be?",o:["A fully autonomous fixer","A read-only diagnostic system, measured on 50+ known failure scenarios","A chatbot with no tools"],a:1,f:"Excellent diagnosis first. Add controlled remediation only after measurement."},
  {q:"How can your QA background be an advantage?",o:["It cannot","Reproducible failures, expected results and regression testing become the agent's evaluation harness","It replaces the need for tools"],a:1,f:"Known failure modes become controlled test cases, and every change is checked against the regression suite."},
  {q:"Which skill-ladder levels does reading alone mainly reach?",o:["Levels 1 to 3 (recognise, explain, draw)","Levels 6 to 8 (evaluate, design, operate)","None"],a:0,f:"Implementing, debugging, evaluating, designing and operating come from building and running real systems."},
  {q:"A tool in your design is write-capable, and the safety policy does not require human approval. What should you do?",o:["Ship it","Add approval, or make the tool read-only for this version","Rename the tool"],a:1,f:"Authorisation is software policy. Risky writes need approval, and the first release should be read-only."},
  {q:"What is the best next step after passing the master test?",o:["Watch more videos","Build the smallest agent, connect two tools, expose them through MCP, then measure it","Wait for a new framework"],a:1,f:"Understand first, code second, framework third. Now it is time for code."}
];
