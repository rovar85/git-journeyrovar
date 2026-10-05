W.cidr=function(el){
  el.innerHTML='<div class="lab-head"><b>Subnet calculator</b> enter an address with a prefix</div><label class="chmod-in">address/prefix: <input type="text" size="18" value="192.168.1.10/24" aria-label="CIDR address"></label><div class="chmod-out"></div><pre class="cidr-bin"></pre>';
  const inp=$('input',el),out=$('.chmod-out',el),bin=$('.cidr-bin',el);
  const toInt=a=>a.split('.').reduce((s,o)=>s*256+ +o,0)>>>0;
  const toStr=n=>[24,16,8,0].map(s=>(n>>>s)&255).join('.');
  function run(){
    const m=inp.value.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
    if(!m||m.slice(1,5).some(x=>+x>255)||+m[5]>32){out.textContent='Enter something like 10.0.5.77/26';bin.textContent='';return}
    const ip=toInt(m.slice(1,5).join('.')),p=+m[5];
    const mask=p===0?0:(0xFFFFFFFF<<(32-p))>>>0;
    const net=(ip&mask)>>>0,bc=(net|(~mask>>>0))>>>0;
    const total=Math.pow(2,32-p),usable=p>=31?(p===32?1:2):total-2;
    const first=p>=31?net:net+1,last=p>=31?bc:bc-1;
    out.innerHTML='<table class="mini"><tr><th>mask</th><td>'+toStr(mask)+'</td></tr><tr><th>network</th><td>'+toStr(net)+'</td></tr><tr><th>broadcast</th><td>'+toStr(bc)+'</td></tr><tr><th>usable hosts</th><td>'+usable+'</td></tr><tr><th>range</th><td>'+toStr(first)+' - '+toStr(last)+'</td></tr></table>';
    const b=n=>[24,16,8,0].map(s=>((n>>>s)&255).toString(2).padStart(8,'0')).join('.');
    const mark=p+Math.floor((p-1)/8);const bits=b(ip);
    bin.innerHTML='address  '+esc(bits.slice(0,p>0?mark+(p%8===0?0:0):0))+'<b>'+esc(bits.slice(p>0?mark:0))+'</b>\nmask     '+b(mask)+'\n<small>plain = network bits, bold = host bits</small>';
  }
  inp.addEventListener('input',run);run();
};
