/* Chapter 4 */
(function(){
  var STAGES=[
    {t:"Stage 1: Pre-training",d:[["Goal","Learn the patterns and knowledge of language."],["Data","Huge amounts of internet text (about 10 TB for Llama 2 70B). Quantity matters most and quality is mixed."],["Compute","About 6,000 GPUs for about 12 days, roughly $2 million, for Llama 2 70B. Frontier models cost 10× or more."],["How often","Rarely: once every few months or a year."],["Result","A <b>base model</b>: a text continuer with lots of knowledge."]]},
    {t:"Stage 2: Fine-tuning (SFT)",d:[["Goal","Teach the model to answer like a helpful assistant."],["Data","Roughly 100,000 or fewer high-quality conversations written by people following detailed labeling instructions. Quality matters most."],["Compute","Far smaller. About a day."],["How often","Often. Companies fix bad answers and retrain weekly or even daily."],["Result","An <b>assistant model</b> you can chat with."]]},
    {t:"Stage 3: Preferences (RLHF or DPO)",d:[["Goal","Polish answers using what people prefer."],["Data","Comparisons: people look at several answers to the same question and pick the best. Often around a million comparisons."],["Why comparisons","Choosing the better of two answers is easier than writing the perfect answer."],["Methods","RLHF with a reward model and PPO, or DPO on preferred versus rejected pairs."],["Result","A model that tends to produce answers people like more."]]}
  ];
  H.tabs($("#st-tabs"),STAGES.map(function(s){
    return {label:s.t.split(":")[0],html:'<p style="margin-top:0"><b>'+s.t+'</b></p><dl class="kv">'+s.d.map(function(r){return "<dt>"+r[0]+"</dt><dd>"+r[1]+"</dd>"}).join("")+"</dl>"};
  }));
  var improve='<p style="margin:12px 0 0;font-size:.95rem"><b>The fix-it loop:</b> deploy, watch for bad answers, have a person write the correct answer for each bad case, add it to the fine-tuning data, train again. Because fine-tuning is cheap, this loop runs quickly.</p>';
  $("#st-tabs").insertAdjacentHTML("beforeend",improve);
})();

$$("#labeler [data-pick]").forEach(function(b){
  b.addEventListener("click",function(){
    $("#lab-out").innerHTML="You picked <b>"+b.dataset.pick+"</b>. That click is one <b>comparison label</b>. Collect many of these from many people and a reward model can learn what answers humans tend to prefer. Neither answer is wrong. The point is that choosing was easy, while writing the best haiku from scratch would have been hard.";
  });
});

/* Elo */
(function(){
  var a=1000,b=1000,n=0,K=32;
  function exp(ra,rb){return 1/(1+Math.pow(10,(rb-ra)/400))}
  function round(winA){
    var ea=exp(a,b);
    a=a+K*((winA?1:0)-ea);
    b=b+K*((winA?0:1)-(1-ea));
    n++;
  }
  function draw(){
    $("#elo-a").textContent=Math.round(a);$("#elo-b").textContent=Math.round(b);
    var ea=exp(a,b);
    $("#elo-out").innerHTML="Rounds: <b>"+n+"</b>. Based on the ratings, A is expected to win <b>"+Math.round(ea*100)+"%</b> of future matchups. Update rule (K = "+K+"): rating ← rating + K × (result − expected). An upset against a higher-rated model moves the numbers more.";
  }
  $("#elo-wa").addEventListener("click",function(){round(true);draw()});
  $("#elo-wb").addEventListener("click",function(){round(false);draw()});
  $("#elo-sim").addEventListener("click",function(){for(var i=0;i<100;i++)round(Math.random()<0.7);draw()});
  $("#elo-rs").addEventListener("click",function(){a=1000;b=1000;n=0;draw()});
  draw();
})();

Q.c4=[
  {q:"Why can't we just use the base model as an assistant?",o:["It is too large","It was trained to continue text, so it may answer a question with more questions","It does not know any facts"],a:1,f:"A base model imitates internet text. Post-training teaches it to follow instructions."},
  {q:"What did the LIMA result suggest about SFT?",o:["More SFT data always keeps helping a lot","A small set of good examples is enough, because SFT mostly teaches style and format","SFT teaches the model new facts"],a:1,f:"The knowledge is already in the pre-trained model. SFT picks out which kind of answerer to be."},
  {q:"What is the difference between SFT and preference methods like RLHF and DPO?",o:["SFT learns from demonstrations. Preference methods learn from pairwise judgements","There is no difference","SFT is only for images"],a:0,f:"Demonstrations show what a good answer looks like. Preferences say which of two answers is better."},
  {q:"A new model is scored 'better' mostly because it writes longer answers, and your judge is another LLM. What is the likely problem?",o:["Judge bias toward long answers","The judge cannot read","Elo ratings are random"],a:0,f:"Both humans and LLM judges tend to prefer length. Control for it and check with task-specific tests."},
  {q:"Your model scores very high on a famous benchmark. Which question should you ask first?",o:["What exactly did this test measure, and could it have leaked into the training data?","Is the font nice?","How many users like it?"],a:0,f:"Contamination and inconsistent protocols can make scores look better than real ability."}
];
