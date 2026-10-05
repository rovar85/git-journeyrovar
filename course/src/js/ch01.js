/* Chapter 1 */
var FALLBACK=[["and",.30],["the",.25],["to",.20],[".",.25]];
var NW={
  "":[["books",.38],["laptops",.24],["notebooks",.16],["textbooks",.12],["minds",.10]],
  "books":[["and",.34],["to",.22],[".",.20],["before",.14],["again",.10]],
  "laptops":[["and",.33],["to",.24],[".",.23],["during",.12],["quickly",.08]],
  "notebooks":[["and",.36],["to",.22],[".",.22],["carefully",.12],["slowly",.08]],
  "textbooks":[["and",.35],["to",.25],[".",.20],["on",.12],["again",.08]],
  "minds":[["to",.30],["and",.26],[".",.24],["during",.12],["slowly",.08]],
  "and":[["began",.28],["started",.24],["took",.20],["wrote",.16],["listened",.12]],
  "to":[["the",.34],["page",.20],["chapter",.18],["a",.16],["today's",.12]],
  "the":[["first",.25],["teacher",.22],["lesson",.20],["next",.18],["whole",.15]]
};
var ctx=[];
function pick(list){var r=Math.random(),t=0;for(var i=0;i<list.length;i++){t+=list[i][1];if(r<=t)return list[i][0]}return list[list.length-1][0]}
function nwRender(){
  var base="The students opened their";
  var html=base+(ctx.length?" "+ctx.map(function(w,i){return i===ctx.length-1?'<span class="new">'+esc(w)+"</span>":esc(w)}).join(" ").replace(/ \./g,"."):"");
  $("#nw-sentence").innerHTML=html;
  var last=ctx.length?ctx[ctx.length-1]:"";
  var done=last===".";
  var opts=done?[]:(NW[last]||FALLBACK);
  var box=$("#nw-opts");box.innerHTML="";
  opts.forEach(function(o){
    var b=document.createElement("button");b.className="opt";b.type="button";
    b.innerHTML='<span class="w">'+esc(o[0])+'</span><span class="track"><span class="fill" style="width:'+Math.round(o[1]*200)+'%"></span></span><span class="pc">'+Math.round(o[1]*100)+"%</span>";
    b.addEventListener("click",function(){ctx.push(o[0]);nwRender()});
    box.appendChild(b);
  });
  $("#nw-sample").disabled=done;
  $("#nw-msg").textContent=done?"The sentence ended. A real model keeps going until it picks a special stop token, and long answers are made the same way: one pick at a time.":(ctx.length>=12?"That is a long sentence. Real models do this for hundreds of tokens.":"Each bar is the model's estimated chance for that next word.");
}
$("#nw-sample").addEventListener("click",function(){
  var last=ctx.length?ctx[ctx.length-1]:"";if(last===".")return;
  ctx.push(pick(NW[last]||FALLBACK));nwRender();
});
$("#nw-reset").addEventListener("click",function(){ctx=[];nwRender()});
nwRender();

/* nesting diagram */
(function(){
  var items=[["AI","the broad goal"],["Machine learning","learn from data"],["Deep learning","many-layer networks"],["Transformer","sequence design"],["LLM","huge scale on text"]];
  var f=$("#c1-nest");
  items.forEach(function(it,i){
    var n=document.createElement("div");n.className="node"+(i===items.length-1?" hl":"");n.innerHTML="<b>"+it[0]+"</b>"+it[1];f.appendChild(n);
    if(i<items.length-1){var a=document.createElement("span");a.className="arr";a.textContent="⊃";f.appendChild(a)}
  });
})();

/* params calculator */
var sizes=[7,13,34,70],curSize=70,seg=$("#p-seg");
sizes.forEach(function(n){
  var b=document.createElement("button");b.type="button";b.textContent=n+"B";b.setAttribute("aria-pressed",n===curSize);
  b.addEventListener("click",function(){curSize=n;pcalc()});seg.appendChild(b);
});
function pcalc(){
  $$("button",seg).forEach(function(b,i){b.setAttribute("aria-pressed",sizes[i]===curSize)});
  var gb=curSize*2;
  $("#p-gb").textContent=gb+" GB";
  $("#p-math").textContent=curSize+" billion × 2 bytes = "+gb+" billion bytes";
  $("#p-note").textContent=curSize===70?"The biggest Llama 2 model. The file is far larger than the memory of a typical laptop, so running it there is slow.":(curSize===7?"The smallest Llama 2 model. This size can run on an ordinary modern laptop.":"A middle size. Bigger models know more but need more storage and more computing power.");
}
pcalc();

Q.c1=[
  {q:"In one sentence, what does a language model do?",o:["Looks up answers in a database of facts","Predicts the most likely next token given the text so far","Understands the world the way a person does"],a:1,f:"It predicts the next token. Long replies come from repeating that step, feeding each new word back in."},
  {q:"Which statement about ChatGPT is most accurate?",o:["It is just a Transformer and nothing else","It is a product: a model plus an interface, instructions, safety layers, and often tools and memory","It is a database of internet pages"],a:1,f:"The model is the engine. The product is the whole car. Agents follow the same idea: a model plus software around it."},
  {q:"A 7-billion-parameter model stores each parameter in 2 bytes. About how big is its parameters file?",o:["7 GB","14 GB","140 GB"],a:1,f:"7 billion × 2 bytes = 14 billion bytes, about 14 GB. The 70B model is 140 GB."},
  {q:"Why can a model state a false fact confidently?",o:["It is lying on purpose","It produces plausible text from a blurry memory, which is not the same as true text","It always copies from a wrong website"],a:1,f:"It is optimised to produce plausible continuations. That is why we add retrieval, tools and evaluation later."}
];
