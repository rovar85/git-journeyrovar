W.layers=function(el){
  const lines=[
    {t:'FROM busybox:latest',cost:1},
    {t:'WORKDIR /app',cost:1},
    {t:'COPY requirements.txt .',cost:1,src:'deps'},
    {t:'RUN install dependencies  (slow: 60 s)',cost:60},
    {t:'COPY . .   (your source code)',cost:1,src:'code'},
    {t:'CMD ["python", "app.py"]',cost:1}
  ];
  const alt=[lines[0],lines[1],{t:'COPY . .   (your source code)',cost:1,src:'code'},{t:'RUN install dependencies  (slow: 60 s)',cost:60},lines[5]];
  el.innerHTML='<div class="lab-head"><b>Layer cache simulator</b> change a file and see what rebuilds</div><div class="lay-ctl"><label><input type="radio" name="ord" value="good" checked> Good order (deps first)</label> <label><input type="radio" name="ord" value="bad"> Bad order (COPY . . first)</label></div><div class="lay-btn"><button class="btn" data-c="code">I edited app.py</button> <button class="btn" data-c="deps">I changed requirements.txt</button> <button class="btn" data-c="none">Rebuild with no changes</button></div><div class="lay-out" role="status"></div>';
  const out=$('.lay-out',el);
  let built=false;
  function order(){return $$('input[name=ord]',el).find(r=>r.checked).value==='good'?lines:alt}
  function draw(ls,rebuildFrom,total,msg){
    out.innerHTML='<p>'+esc(msg)+'</p><ol class="lay-list">'+ls.map((l,i)=>{
      const re=i>=rebuildFrom;
      return '<li class="'+(re?'lay-re':'lay-ca')+'"><code>'+esc(l.t)+'</code> <b>'+(re?'REBUILT (+'+l.cost+' s)':'CACHED')+'</b></li>'}).join('')+'</ol><p><b>Build time: '+total+' s</b></p>';
  }
  $$('button[data-c]',el).forEach(b=>b.addEventListener('click',()=>{
    const ls=order(),c=b.dataset.c;
    let from=ls.length;
    if(c==='none')from=ls.length;
    else{
      ls.forEach((l,i)=>{if(l.src===c||(ls===alt&&c==='deps'&&l.src==='code'))from=Math.min(from,i);});
      if(ls===alt&&c==='deps')from=2;
    }
    const total=ls.reduce((s,l,i)=>s+(i>=from?l.cost:0),0);
    draw(ls,from,total,c==='none'?'Nothing changed: everything comes from the cache.':'Everything from the first changed step onwards is rebuilt.');
  }));
  $$('input[name=ord]',el).forEach(r=>r.addEventListener('change',()=>{out.innerHTML=''}));
};
