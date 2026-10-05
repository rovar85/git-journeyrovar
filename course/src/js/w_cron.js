W.cron=function(el){
  el.innerHTML='<div class="lab-head"><b>Cron explainer</b> type five fields and see when it runs</div><label class="chmod-in">schedule: <input type="text" size="18" value="30 2 * * 0" aria-label="cron schedule"></label><div class="chmod-out"></div><div class="cron-next"></div>';
  const inp=$('input',el),out=$('.chmod-out',el),nx=$('.cron-next',el);
  const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const R=[[0,59],[0,23],[1,31],[1,12],[0,7]];
  function parse(f,[lo,hi]){
    const set=new Set();
    for(const part of f.split(',')){
      let m=part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
      if(!m)return null;
      let a,b,step=m[2]?+m[2]:1;
      if(m[1]==='*'){a=lo;b=hi}else if(m[1].includes('-')){[a,b]=m[1].split('-').map(Number)}else{a=b=+m[1];if(m[2])b=hi}
      if(a<lo||b>hi||a>b||step<1)return null;
      for(let v=a;v<=b;v+=step)set.add(v);
    }
    return set;
  }
  function pad(n){return String(n).padStart(2,'0')}
  function describe(p){
    const [mi,h,d,mo,w]=p;
    let s='';
    if(p[0]==='*'&&h==='*')s='every minute';
    else if(mi.startsWith('*/')&&h==='*')s='every '+mi.slice(2)+' minutes';
    else if(/^\d+$/.test(mi)&&/^\d+$/.test(h))s='at '+pad(h)+':'+pad(mi);
    else s='minute '+mi+' of hours '+h;
    if(w!=='*'){const dd=w.split(',').map(x=>{const m=x.match(/^(\d)-(\d)$/);return m?DAYS[m[1]%7]+' to '+DAYS[m[2]%7]:(/^\d$/.test(x)?DAYS[x%7]:x)});s+=' on '+dd.join(', ')}
    if(d!=='*')s+=' on day '+d+' of the month';
    if(mo!=='*')s+=' in month '+mo;
    return s;
  }
  function run(){
    const p=inp.value.trim().split(/\s+/);
    nx.innerHTML='';
    if(p.length!==5){out.textContent='Need exactly 5 fields: minute hour day-of-month month day-of-week.';return}
    const sets=p.map((f,i)=>parse(f,R[i]));
    if(sets.some(s=>!s)){out.textContent='One of the fields is not valid.';return}
    out.innerHTML='Runs <b>'+esc(describe(p))+'</b>.';
    const t=new Date(Date.UTC(2026,0,1,0,0));const res=[];
    for(let i=0;i<60*24*400&&res.length<5;i++){
      t.setUTCMinutes(t.getUTCMinutes()+1);
      const dow=t.getUTCDay();
      const domOk=sets[2].has(t.getUTCDate()),dowOk=sets[4].has(dow)||(dow===0&&sets[4].has(7));
      const dayOk=(p[2]!=='*'&&p[4]!=='*')?(domOk||dowOk):(domOk&&dowOk);
      if(sets[0].has(t.getUTCMinutes())&&sets[1].has(t.getUTCHours())&&sets[3].has(t.getUTCMonth()+1)&&dayOk)
        res.push(DAYS[dow].slice(0,3)+' '+t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate())+' '+pad(t.getUTCHours())+':'+pad(t.getUTCMinutes()));
    }
    nx.innerHTML='<small>Next runs counting from 1 Jan 2026 00:00:</small><ul>'+res.map(r=>'<li><code>'+r+'</code></li>').join('')+'</ul>';
  }
  inp.addEventListener('input',run);run();
};
