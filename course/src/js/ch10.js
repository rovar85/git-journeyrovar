/* Chapter 10 */

/* architecture */
(function(){
  var P=[
    ["User","Asks for something, such as \"Why is EV indexing down?\", and approves risky actions."],
    ["Host (AI application)","The user-facing AI application: a chat app, an editor, or your own agent. It contains the model and the agent loop, and decides which servers to connect to."],
    ["MCP client","Lives inside the host. Manages the connection to one server: asks what it offers (list tools, resources, prompts) and sends requests."],
    ["MCP server","A program that wraps a system and advertises its capabilities as tools, resources and prompts. Built once, usable by any compatible client. It often holds the business logic, such as retries and credentials."],
    ["Tools · resources · prompts","The three primitives a server exposes (see below)."],
    ["External systems","Where the real data and actions live: Enterprise Vault, Windows services, SQL Server, GitHub, files, APIs."]
  ];
  var cur=0,pk=$("#ar-pick");
  function draw(){$$("button",pk).forEach(function(b,i){b.setAttribute("aria-pressed",i===cur)});$("#ar-out").innerHTML="<b>"+P[cur][0]+"</b><br>"+P[cur][1]}
  P.forEach(function(p,i){var b=document.createElement("button");b.type="button";b.textContent=(i+1)+". "+p[0];b.addEventListener("click",function(){cur=i;draw()});pk.appendChild(b)});
  draw();
})();

/* primitive sorter */
(function(){
  var T=[
    ["The model decides to check the service state of a server during an investigation.","tool","The model decides when to call it. That is a tool."],
    ["The application automatically attaches the SQL runbook to the conversation when a database error appears.","resource","The application decides what to attach. That is a resource."],
    ["A user types /summarise-incident and a pre-written, parameterised template is loaded.","prompt","A user chooses a reusable template. That is a prompt."],
    ["The model chooses to run a read-only SQL query to confirm a hypothesis.","tool","Model-controlled action. A tool."],
    ["The server lets the client subscribe to a log file and gets notified when it changes.","resource","Application-facing data with change notifications. A resource."]
  ];
  var i=0,score=0,root=$("#pm-body");
  function show(){
    if(i>=T.length){root.innerHTML="<p style='margin:0'><b>Done: "+score+" of "+T.length+".</b> Remember: model-controlled = tool, application-controlled = resource, user-controlled = prompt.</p><button class='btn ghost' id='pm-r' type='button' style='margin-top:8px'>Try again</button>";$("#pm-r").addEventListener("click",function(){i=0;score=0;show()});return}
    root.innerHTML="<p style='margin:0 0 8px'><b>"+(i+1)+" of "+T.length+".</b> "+esc(T[i][0])+'</p><div class="picker"></div><div class="out" hidden></div>';
    var pk=$(".picker",root),out=$(".out",root);
    ["tool","resource","prompt"].forEach(function(k){
      var b=document.createElement("button");b.type="button";b.textContent=k;
      b.addEventListener("click",function(){
        if(!out.hidden)return;var ok=k===T[i][1];if(ok)score++;
        $$("button",pk).forEach(function(x){x.disabled=true;if(x.textContent===T[i][1])x.style.borderColor="var(--good)"});
        out.hidden=false;out.innerHTML=(ok?"<b>Correct.</b> ":"<b>It is a "+T[i][1]+".</b> ")+esc(T[i][2])+' <button class="btn" type="button" id="pm-n" style="margin-left:8px">Next</button>';
        $("#pm-n").addEventListener("click",function(){i++;show()});
      });pk.appendChild(b);
    });
  }
  show();
})();

/* request flow */
(function(){
  var S=[
    ["Start-up","The host starts and connects its MCP client to the EV server. The client asks: what do you offer?","client → server:  tools/list\nserver → client:  [ get_service_status, get_event_logs, test_sql_connectivity, ... ]  (with descriptions and input schemas)"],
    ["User asks","The user asks \"Why is EV indexing down?\". The host puts the user's request and the tool descriptions into the model's context.","context = system prompt + tool list + user question"],
    ["Model chooses","The model decides it needs service state and writes a tool request. It has not run anything.","model:  call get_service_status(server=\"EV01\", service=\"Indexing\")"],
    ["Host checks policy","The host validates the request: is this tool allowed, are the arguments valid, does this action need approval? Read-only calls may pass automatically.","policy: get_service_status is read-only -> allowed, logged"],
    ["Client calls the server","The client sends the call to the server.","client → server:  tools/call  get_service_status {server:\"EV01\", service:\"Indexing\"}"],
    ["Server does the real work","The server talks to the actual system, extracts the few useful fields, and returns a structured result.","server → client:  {\"status\":\"Stopped\",\"start_type\":\"Automatic\",\"error\":null}"],
    ["Back to the model","The result is added to the context. The model decides the next step. The loop continues until it can answer.","context += tool result  ->  model decides next action"]
  ];
  H.stepper($("#fl-step"),S,function(s,i,body){
    body.innerHTML="<p style='margin:.3rem 0'><b>"+(i+1)+". "+esc(s[0])+"</b></p><p style='margin:.3rem 0'>"+esc(s[1])+"</p><div class='pre-out'>"+esc(s[2])+"</div>";
  });
})();

/* tool design checker */
(function(){
  var C=[["one","One main job per tool"],["desc","A useful description (what it does, when to use it)"],["schema","An explicit input schema with types"],["struct","Structured output with only the fields that matter"],["err","Clear error responses"],["priv","Least-privilege credentials"],["side","Obvious side effects (read-only is stated, writes are flagged)"]];
  var box=$("#td-checks");
  C.forEach(function(c){var l=document.createElement("label");l.innerHTML='<input type="checkbox" id="td-'+c[0]+'"> <span>'+c[1]+"</span>";l.querySelector("input").addEventListener("change",out);box.appendChild(l)});
  function out(){
    var n=C.filter(function(c){return $("#td-"+c[0]).checked}).length;
    var missing=C.filter(function(c){return !$("#td-"+c[0]).checked}).map(function(c){return c[1].split(" (")[0].toLowerCase()});
    $("#td-out").innerHTML="<b>"+n+" of "+C.length+"</b> properties. "+(n===C.length?"This is a well-designed tool. A model can use it correctly, you can test it, and you can audit it.":(n>=4?"Getting there. Still missing: "+esc(missing.join("; "))+".":"Weak. The model will guess how to use it, results will be hard to test, and risks are hidden. Missing: "+esc(missing.join("; "))+"."));
  }
  out();
})();

Q.c10=[
  {q:"What problem does MCP mainly solve?",o:["Making models larger","The N × M explosion of custom integrations between AI applications and tools","Training models faster"],a:1,f:"Build a server once. Any compatible client can use it."},
  {q:"A user types /investigate-indexing-failure and a prewritten template is loaded. Which MCP primitive is this?",o:["Tool","Resource","Prompt"],a:2,f:"Prompts are user-controlled templates. Tools are model-controlled. Resources are application-controlled."},
  {q:"Does MCP replace an agent framework?",o:["Yes, completely","No. The framework runs the loop, state and memory. MCP provides a standard way to reach tools and context","Only for coding"],a:1,f:"They complement each other. Frameworks like LangGraph add MCP adapters."},
  {q:"A tool returns 5,000 lines of raw terminal output and takes one free-text argument. What should you do?",o:["Nothing, models are smart","Give it a typed input schema and return only the few structured fields that matter","Rename it"],a:1,f:"Put parsing and validation in code. Use the model for interpretation. Structured results help reliability and testing."},
  {q:"The model asks to restart a production service. Who decides whether that is allowed?",o:["The model, if it is confident","Software policy, possibly with human approval, not model confidence","Nobody"],a:1,f:"Never assume a tool is safe just because the model requested it."}
];
