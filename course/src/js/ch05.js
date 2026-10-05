/* Chapter 5 */
(function(){
  var BASE="Write about our water bottle.";
  var HABITS=[
    {id:"clear",label:"Be clear and detailed",add:"Write a description of about 50 words for a 1-litre insulated steel water bottle. The readers are hikers. Use a friendly tone and mention that it keeps drinks cold for 24 hours.",why:"Now the model knows the length, the product, the audience, the tone and a key fact. Nothing is left to guesswork."},
    {id:"fewshot",label:"Show an example",add:"Example of the style I want:\nProduct: bamboo toothbrush\nDescription: Gentle on teeth, kinder to the planet. Soft bristles, plastic-free handle.",why:"The model copies the length, rhythm and tone of your example. Showing beats describing."},
    {id:"facts",label:"Give it the facts and a safety rule",add:"Use only these facts: steel body, 1 litre, 24 hours cold, fits car cup holders. If something is not listed, do not invent it.",why:"The model now writes from supplied facts and is told not to invent others. This reduces hallucination."},
    {id:"think",label:"Ask it to think first",add:"First list the three benefits hikers care about most. Then write the description using those benefits.",why:"The written list becomes part of the text the model reads, so the final description is better organised."}
  ];
  var plc=$("#pl-checks");
  HABITS.forEach(function(h){
    var l=document.createElement("label");
    l.innerHTML='<input type="checkbox" id="pl-'+h.id+'"> <span>'+h.label+"</span>";
    l.querySelector("input").addEventListener("change",plRender);plc.appendChild(l);
  });
  function plRender(){
    var parts=[],why=[];
    var clear=$("#pl-clear").checked;
    parts.push(clear?'<span class="add">'+esc(HABITS[0].add)+"</span>":esc(BASE));
    if(clear)why.push(HABITS[0].why);
    HABITS.slice(1).forEach(function(h){
      if($("#pl-"+h.id).checked){parts.push('<span class="add">'+esc(h.add)+"</span>");why.push(h.why)}
    });
    $("#pl-box").innerHTML=parts.join("\n\n");
    $("#pl-why").textContent=why.length?why.join(" "):"With no habits ticked, the model has to guess almost everything. Tick a box to improve it.";
  }
  plRender();
})();

/* context budget */
(function(){
  var win=32,items=[["System rules",2],["Tool definitions",3],["Conversation so far",5],["Retrieved documents",6],["Tool results",9],["Current request",1],["Room reserved for the answer",2]];
  var vals=items.map(function(i){return i[1]});
  var pk=$("#cb-win"),ctl=$("#cb-ctl");
  [8,32,128,200].forEach(function(w){var b=document.createElement("button");b.type="button";b.textContent=w+"k window";b.addEventListener("click",function(){win=w;build()});pk.appendChild(b)});
  function out(){
    var tot=vals.reduce(function(a,b){return a+b},0),pct=tot/win*100;
    var bars=items.map(function(it,i){return '<div class="brow"><span style="font-size:.78rem">'+it[0]+'</span><span class="t"><span class="f" style="width:'+Math.min(100,vals[i]/win*100)+'%"></span></span><span class="n">'+vals[i]+'k</span></div>'}).join("");
    var msg=pct>100?"Over budget by "+H.fmt(tot-win,1)+"k tokens. Something must be trimmed or summarised, or the call fails or loses information.":(pct>80?"Tight: about "+Math.round(pct)+"% used. Add one more tool result and you may overflow.":"Comfortable: about "+Math.round(pct)+"% used.");
    $("#cb-out").innerHTML='<div class="bars">'+bars+'</div><b>'+H.fmt(tot,1)+'k of '+win+'k tokens.</b> '+msg;
  }
  function build(){
    $$("button",pk).forEach(function(b){b.setAttribute("aria-pressed",b.textContent===win+"k window")});
    ctl.innerHTML="";
    items.forEach(function(it,i){H.range(ctl,it[0],0,Math.max(10,win),0.5,vals[i],function(v){return H.fmt(v,1)+"k"},function(v){vals[i]=v;out()})});
    out();
  }
  build();
})();

Q.c5=[
  {q:"Which prompt is better?",o:["Write about our bottle.","Write a 50-word description of our 1-litre steel bottle for hikers in a friendly tone.","Bottle."],a:1,f:"Detail removes guesswork. The model cannot read your mind."},
  {q:"You paste a policy into the prompt and add \"if the answer is not in the text, say you cannot find it\". What are you mainly reducing?",o:["Cost","Hallucination","Speed"],a:1,f:"Grounding the answer in supplied text, with permission to say \"not found\", reduces made-up answers."},
  {q:"Why does asking a model to reason step by step often help?",o:["The written steps become part of the text the model reads when it continues","It makes the model run faster","It unlocks a secret mode"],a:0,f:"The model's own earlier words are context for its later words, so a good plan helps."},
  {q:"An agent has used 28k of a 32k context window after a few tool calls. What is the best response?",o:["Ignore it","Summarise old content and trim tool outputs to the fields that matter","Switch off logging"],a:1,f:"Context is a finite budget. Managing it is a core skill for agents."},
  {q:"What is a router?",o:["A device that connects to Wi-Fi","Software that sends each request to the most suitable prompt or model","A kind of database"],a:1,f:"A router sends simple requests to cheap models and hard ones to strong models."}
];
