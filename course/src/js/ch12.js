/* Chapter 12 */

/* injection lab */
(function(){
  var D=[
    ["label","Label retrieved web content as untrusted data, and tell the model never to follow instructions found in it"],
    ["approval","Require human approval before any message is sent or any file is read"],
    ["priv","Give the assistant only the tool it needs (summarise). No send_email and no read_files."],
    ["log","Log every proposed tool call"]
  ];
  var box=$("#ij-checks");
  D.forEach(function(d){var l=document.createElement("label");l.innerHTML='<input type="checkbox" id="ij-'+d[0]+'"> <span>'+d[1]+"</span>";l.querySelector("input").addEventListener("change",out);box.appendChild(l)});
  function out(){
    var lab=$("#ij-label").checked,app=$("#ij-approval").checked,pr=$("#ij-priv").checked,lg=$("#ij-log").checked;
    var h="";
    if(pr){h+="<span class='pill good'>Attack blocked</span> The assistant has no way to read files or send email, so even a fooled model has nothing dangerous to call. <b>Least privilege is the strongest single defence.</b>"}
    else if(app){h+="<span class='pill good'>Damage prevented</span> The model may be fooled and propose reading files and sending email, but a human sees the request and says no."+(lab?" Labelling the page as untrusted also makes the model less likely to be fooled in the first place.":"")}
    else if(lab){h+="<span class='pill bad'>Might still succeed</span> Labelling reduces the chance that the model obeys the hidden line, but it is not a guarantee, because the model sees one stream of text. With powerful tools and no approval step, a clever injection can still win."}
    else{h+="<span class='pill bad'>Attack likely succeeds</span> The model treats the hidden line as an instruction, reads the files and sends them out. Nothing stands in the way."}
    h+="<p style='margin:8px 0 0'>"+(lg?"Because you log proposed calls, you can see the attempt afterward and learn from it.":"With no logging, you may never find out an attempt happened.")+"</p>";
    $("#ij-out").innerHTML=h;
  }
  out();
})();

/* policy gate exercise */
(function(){
  var T=[
    ["get_service_status on a production server","allow","Read-only and low risk. Allow automatically (and log it)."],
    ["run_readonly_query against the configuration database","allow","Read-only. Still limit it to allowed queries and log it."],
    ["restart_service on a production server","ask","It changes a live system. Require human approval, then verify and audit."],
    ["change_configuration on a customer system","ask","A risky write. Human approval, a narrow scope, and a rollback plan."],
    ["delete_data for all mailboxes","deny","Destructive and irreversible. Do not offer this tool to an automated agent at all."],
    ["a tool the policy has never heard of","deny","Unknown tools are denied by default (allow list)."]
  ];
  var i=0,score=0,root=$("#gt-body");
  function show(){
    if(i>=T.length){root.innerHTML="<p style='margin:0'><b>Done: "+score+" of "+T.length+".</b></p><button class='btn ghost' id='gt-r' type='button' style='margin-top:8px'>Try again</button>";$("#gt-r").addEventListener("click",function(){i=0;score=0;show()});return}
    root.innerHTML="<p style='margin:0 0 8px'><b>"+(i+1)+" of "+T.length+".</b> The agent proposes: <code>"+esc(T[i][0])+'</code></p><div class="picker"></div><div class="out" hidden></div>';
    var pk=$(".picker",root),out=$(".out",root);
    [["allow","Allow automatically"],["ask","Ask a human"],["deny","Deny"]].forEach(function(o){
      var b=document.createElement("button");b.type="button";b.textContent=o[1];
      b.addEventListener("click",function(){
        if(!out.hidden)return;var ok=o[0]===T[i][1];if(ok)score++;
        $$("button",pk).forEach(function(x,k){x.disabled=true;if(["allow","ask","deny"][k]===T[i][1])x.style.borderColor="var(--good)"});
        out.hidden=false;out.innerHTML=(ok?"<b>Correct.</b> ":"<b>Better: "+({allow:"allow automatically",ask:"ask a human",deny:"deny"})[T[i][1]]+".</b> ")+esc(T[i][2])+' <button class="btn" type="button" id="gt-n" style="margin-left:8px">Next</button>';
        $("#gt-n").addEventListener("click",function(){i++;show()});
      });pk.appendChild(b);
    });
  }
  show();
})();

Q.c12=[
  {q:"Why is prompt injection especially dangerous for agents?",o:["Agents read outside content and may also have permission to act, so hostile text can steer real actions","Agents cannot read text","It only affects images"],a:0,f:"The attacker manipulates the decision-making layer. The danger grows with the agent's permissions."},
  {q:"Which is the strongest single defence in the injection lab?",o:["Politely asking the model to be careful","Least privilege: the assistant simply does not have the dangerous tools","Longer prompts"],a:1,f:"If the capability does not exist, a fooled model cannot misuse it. Defence in depth adds approval, labelling and logging."},
  {q:"Safety behaviour trained into a model should be treated as...",o:["A reliable security boundary","Helpful, but not a security boundary, since determined users can often get around it","Irrelevant"],a:1,f:"Design as if the model can be tricked. Put hard limits in software."},
  {q:"An agent proposes restarting a production service. What does a good policy do?",o:["Allow it because the model is confident","Require human approval, execute a narrow action, verify, and write an audit trace","Delete the tool"],a:1,f:"Risky writes need human approval. Confidence is not authorisation."},
  {q:"What is a data-poisoning 'backdoor'?",o:["A faster way into the data centre","Malicious training data teaches the model a trigger that changes its behaviour when it appears","A kind of firewall"],a:1,f:"The trigger phrase makes the poisoned model misbehave, while it seems normal otherwise."}
];
