W.rollout=function(el){
  el.innerHTML='<div class="lab-head"><b>Rolling update simulator</b> watch Pods move from v1 to v2</div><div class="lay-ctl"><label>replicas <input type="number" class="ro-n" value="4" min="1" max="8" style="width:4em"></label> <label>maxSurge <input type="number" class="ro-s" value="1" min="0" max="4" style="width:4em"></label> <label>maxUnavailable <input type="number" class="ro-u" value="1" min="0" max="4" style="width:4em"></label> <button class="btn ro-go">Roll out v2</button> <button class="btn ro-bad">Roll out a broken v2</button></div><div class="ro-board" role="img" aria-label="Pods during the rollout"></div><p class="ro-msg" role="status"></p>';
  const board=$('.ro-board',el),msg=$('.ro-msg',el);
  const N=()=>Math.max(1,Math.min(8,+$('.ro-n',el).value||1));
  const S=()=>Math.max(0,+$('.ro-s',el).value||0);
  const U=()=>Math.max(0,+$('.ro-u',el).value||0);
  let timer=null;
  function draw(pods,note){
    board.innerHTML=pods.map(p=>'<span class="ro-pod ro-'+p.s+'">'+p.v+'<small>'+p.s+'</small></span>').join('');
    msg.textContent=note;
    const live=pods.filter(p=>p.s==='ready').length;
    msg.textContent=note+'  ·  serving traffic: '+live+' ready Pod'+(live===1?'':'s');
  }
  function run(bad){
    clearInterval(timer);
    const n=N(),surge=S(),unav=U();
    if(surge===0&&unav===0){msg.textContent='maxSurge and maxUnavailable cannot both be 0 (nothing could ever move).';return}
    let pods=[];for(let i=0;i<n;i++)pods.push({v:'v1',s:'ready'});
    draw(pods,'Start: '+n+' Pods on v1');
    let step=0;
    timer=setInterval(()=>{
      step++;
      const oldP=pods.filter(p=>p.v==='v1'),newP=pods.filter(p=>p.v==='v2');
      const ready=pods.filter(p=>p.s==='ready').length;
      const total=pods.length;
      // new pods starting become ready (unless bad)
      let changed=false;
      pods.forEach(p=>{if(p.v==='v2'&&p.s==='starting'){if(bad){p.s='failing'}else{p.s='ready'}changed=true}});
      if(changed&&!bad){draw(pods,'New Pods pass their readiness check');return}
      // terminate old pods while keeping availability
      const minReady=n-unav;
      let canKill=ready-minReady;
      const removable=oldP.filter(p=>p.s==='ready');
      for(let i=0;i<removable.length&&canKill>0;i++){pods.splice(pods.indexOf(removable[i]),1);canKill--;changed=true}
      // start new pods within surge limit
      const newCount=pods.filter(p=>p.v==='v2').length;
      const oldCount=pods.filter(p=>p.v==='v1').length;
      let room=n+surge-pods.length;
      let need=n-newCount;
      const toStart=Math.max(0,Math.min(room,need));
      for(let i=0;i<toStart;i++){pods.push({v:'v2',s:'starting'});changed=true}
      if(bad){
        draw(pods,'v2 Pods never become ready: the rollout stalls, but v1 Pods keep serving (maxUnavailable protects them)');
        if(step>6)clearInterval(timer);
        return}
      const done=pods.filter(p=>p.v==='v2'&&p.s==='ready').length===n&&pods.length===n;
      draw(pods,done?'Done: all '+n+' Pods are v2':'Step '+step+': replacing v1 with v2');
      if(done)clearInterval(timer);
    },900);
  }
  $('.ro-go',el).addEventListener('click',()=>run(false));
  $('.ro-bad',el).addEventListener('click',()=>run(true));
  draw(Array.from({length:4},()=>({v:'v1',s:'ready'})),'Press a button to start.');
};
