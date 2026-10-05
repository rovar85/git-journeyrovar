/* Chapter 8 */

/* budget */
(function(){
  var st={budget:0.10,price:2.5,step:6};
  var ctl=$("#bg-ctl");
  function out(){
    var tokens=st.budget/st.price*1e6,steps=Math.floor(tokens/(st.step*1000));
    $("#bg-out").innerHTML="At $"+H.fmt(st.budget,2)+" per task and $"+H.fmt(st.price,2)+" per million tokens, you can afford about <b>"+Math.round(tokens).toLocaleString()+" tokens</b> per task. If each agent step re-reads about "+st.step+"k tokens of context, that is roughly <b>"+steps+" steps</b>. "+(steps<5?"That is not much exploration. A workflow for the common cases is probably the better design.":(steps<15?"A short agent run fits, but it will not survive many wrong turns.":"There is room for real exploration, if the task value justifies it."));
  }
  H.range(ctl,"Budget per task",0.01,5,0.01,st.budget,function(v){return "$"+H.fmt(v,2)},function(v){st.budget=v;out()});
  H.range(ctl,"Price per 1M tokens",0.5,15,0.1,st.price,function(v){return "$"+H.fmt(v,1)},function(v){st.price=v;out()});
  H.range(ctl,"Context per step (k)",1,40,1,st.step,function(v){return v+"k"},function(v){st.step=v;out()});
})();

/* rubric */
(function(){
  var Qs=[
    ["amb","The path is ambiguous. I cannot draw the whole decision tree in advance."],
    ["val","The task is valuable enough to justify the tokens an exploring agent will use."],
    ["cap","I have de-risked the critical capabilities (the model can do each needed sub-task, such as using the tools and recovering from errors)."],
    ["err","Errors are cheap or easy to detect (or I can limit access to read-only and add human approval)."]
  ];
  var st={},box=$("#rb-checks");
  Qs.forEach(function(q){
    var l=document.createElement("label");l.innerHTML='<input type="checkbox" id="rb-'+q[0]+'"> <span>'+q[1]+"</span>";
    l.querySelector("input").addEventListener("change",out);box.appendChild(l);
  });
  function out(){
    var a=$("#rb-amb").checked,v=$("#rb-val").checked,c=$("#rb-cap").checked,e=$("#rb-err").checked,msg;
    if(!a)msg="<b>Build a workflow (or a single call).</b> If you can map the decision tree, build it explicitly and optimise each step. It is cheaper and gives you more control.";
    else if(!v)msg="<b>Use a workflow for the common cases.</b> The task is ambiguous but not valuable enough to pay for open-ended exploration.";
    else if(!c)msg="<b>Reduce the scope first.</b> A missing capability will multiply your cost and delay. Simplify the task and try again.";
    else if(!e)msg="<b>An agent is possible, but limit its autonomy.</b> Start read-only, add human approval for risky actions, and measure heavily. Hard-to-detect errors are the main danger.";
    else msg="<b>Good agent candidate.</b> Start with environment, tools and a system prompt. Measure reliability and cost from day one (Chapter 9).";
    $("#rb-out").innerHTML=msg;
  }
  out();
})();

/* patterns */
(function(){
  function flow(nodes){return '<div class="flow">'+nodes.map(function(n,i){return (i?'<span class="arr">→</span>':"")+'<div class="node'+(n[2]?" hl":"")+'"><b>'+n[0]+"</b>"+(n[1]||"")+"</div>"}).join("")+"</div>"}
  var P=[
    {label:"1 · Prompt chaining",html:"<p style='margin-top:0'>A fixed series of model calls where each output feeds the next. Good when the subtasks are predictable. You can add a programmatic <b>gate</b> between steps to check progress.</p>"+flow([["Call 1","outline"],["Gate","check the outline"],["Call 2","write from outline"],["Call 3","polish"]])+"<p style='margin-bottom:0'><b>Example:</b> write marketing copy, then translate it. <b>Trade-off:</b> you spend extra time and tokens in return for higher accuracy at each simple step.</p>"},
    {label:"2 · Routing",html:"<p style='margin-top:0'>Classify the input and send it down a specialised path.</p>"+flow([["Input"],["Router","classify",true],["Path A","refunds"],["Path B","technical"]])+"<p style='margin-bottom:0'><b>Example:</b> send easy questions to a small cheap model and hard ones to a strong model. (This is the router from Chapter 5.)</p>"},
    {label:"3 · Parallelisation",html:"<p style='margin-top:0'>Run independent tasks at the same time to cut delay or to gain coverage. Two flavours: <b>sectioning</b> (split a task into independent parts) and <b>voting</b> (run the same task several times and compare).</p>"+flow([["Task"],["Worker 1"],["Worker 2"],["Worker 3"],["Combine",null,true]])+"<p style='margin-bottom:0'><b>Example:</b> one call answers the question while another screens it for safety. Or run a code-vulnerability review three times and flag what any reviewer finds.</p>"},
    {label:"4 · Orchestrator-workers",html:"<p style='margin-top:0'>A central model breaks the work into subtasks <i>dynamically</i>, hands them to worker calls, and combines the results. It differs from parallelisation because the subtasks are not known in advance.</p>"+flow([["Orchestrator","decides subtasks",true],["Worker","file A"],["Worker","file B"],["Synthesise"]])+"<p style='margin-bottom:0'><b>Example:</b> a coding task that changes an unknown number of files, or a research task that gathers from several sources.</p>"},
    {label:"5 · Evaluator-optimiser",html:"<p style='margin-top:0'>One call generates, another evaluates, and the system loops until the result meets clear criteria. Works when you have clear evaluation criteria and refinement visibly helps.</p>"+flow([["Generate"],["Evaluate","against criteria",true],["Feedback"],["Improve"]])+"<p style='margin-bottom:0'><b>Example:</b> literary translation refined by a critic, or code that is revised until tests pass. Remember Chapter 7: reflection helps but is not proof, so prefer real checks (tests) as the evaluator when you can.</p>"}
  ];
  H.tabs($("#pt-tabs"),P);
})();

Q.c8=[
  {q:"Your task has a fixed, well-understood sequence of steps. What does Chapter 8 recommend?",o:["A fully autonomous agent","A workflow that implements the steps explicitly","A bigger model"],a:1,f:"If you can map the decision tree, build it explicitly. It is cheaper and gives more control."},
  {q:"Which are the only two main design decisions for a simple agent, once the environment is fixed?",o:["Colour and font","The set of tools and the system prompt","The number of GPUs"],a:1,f:"Iterate on tools and prompt first. Optimise caching and parallelism later."},
  {q:"The 'orchestrator-workers' pattern differs from 'parallelisation' because...",o:["It uses no models","The subtasks are decided dynamically by the orchestrator, not fixed in advance","It is always slower"],a:1,f:"Parallelisation splits into known independent parts. Orchestrator-workers decides the split at run time."},
  {q:"An agent keeps making a wrong click. What is Barry Zhang's first debugging suggestion?",o:["Blame the model","Put yourself in the agent's context window and see what it can actually see and do","Add more agents"],a:1,f:"At each step the agent only knows what is in its context. Check whether that context and the tool descriptions are sufficient and coherent."},
  {q:"A task is ambiguous and valuable, capabilities are fine, but its errors are high-stakes and hard to detect. What is the best design?",o:["An autonomous agent with full access","An agent with limited autonomy: read-only access, human approval and heavy measurement","No AI at all, always"],a:1,f:"You can mitigate hard-to-detect errors by limiting scope, though that limits scaling too."}
];
