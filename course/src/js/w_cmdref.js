W.cmdref=function(el){
  const data=(window.CMDREF||[]).slice().sort((a,b)=>a.key.localeCompare(b.key));
  const tools=['All'].concat([...new Set(data.map(d=>d.tool))].sort());
  el.innerHTML='<div class="cr-bar"><label>Search <input type="search" class="cr-q" placeholder="e.g. grep, disk, restart" aria-label="Search commands"></label><label>Tool <select class="cr-t" aria-label="Filter by tool">'+tools.map(t=>'<option>'+esc(t)+'</option>').join('')+'</select></label><span class="cr-n" role="status"></span></div><div class="cr-list"></div>';
  const q=$('.cr-q',el),t=$('.cr-t',el),list=$('.cr-list',el),n=$('.cr-n',el);
  function draw(){
    const s=q.value.trim().toLowerCase(),tool=t.value;
    const hit=data.filter(d=>(tool==='All'||d.tool===tool)&&(!s||(d.key+' '+d.what+' '+d.when+' '+d.flags.map(f=>f.join(' ')).join(' ')).toLowerCase().includes(s)));
    n.textContent=hit.length+' of '+data.length+' commands';
    list.innerHTML=hit.map(d=>'<article class="cr-item"><h3><code>'+esc(d.key)+'</code> <small>'+esc(d.tool)+'</small></h3><p><b>What it does:</b> '+esc(d.what)+'</p><p><b>When to use it:</b> '+esc(d.when)+'</p>'+(d.flags.length?'<ul class="cr-flags">'+d.flags.map(f=>'<li><code>'+esc(f[0])+'</code> '+esc(f[1])+'</li>').join('')+'</ul>':'')+(d.careful?'<p class="gcare"><b>Careful:</b> '+esc(d.careful)+'</p>':'')+'</article>').join('')||'<p>No command matches. Try a shorter word.</p>';
  }
  q.addEventListener('input',draw);t.addEventListener('change',draw);draw();
};
