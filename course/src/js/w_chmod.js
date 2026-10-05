W.chmod=function(el){
  const names=['Owner','Group','Others'],bits=['read (4)','write (2)','run (1)'];
  const st=[[1,1,0],[1,0,0],[1,0,0]];
  el.innerHTML='<div class="lab-head"><b>chmod calculator</b> tick the boxes, see the number</div><div class="chmod-grid"></div><div class="chmod-out"></div><label class="chmod-in">or type octal: <input type="text" maxlength="3" size="4" value="644" aria-label="octal mode"></label>';
  const grid=$('.chmod-grid',el),out=$('.chmod-out',el),inp=$('input',el);
  names.forEach((n,i)=>{
    const col=document.createElement('div');col.className='chmod-col';
    col.innerHTML='<b>'+n+'</b>'+bits.map((b,j)=>'<label><input type="checkbox" data-i="'+i+'" data-j="'+j+'"> '+b+'</label>').join('');
    grid.appendChild(col);
  });
  function draw(){
    const cbs=$$('input[type=checkbox]',el);
    cbs.forEach(c=>c.checked=!!st[c.dataset.i][c.dataset.j]);
    const digits=st.map(r=>r[0]*4+r[1]*2+r[2]);
    const str=st.map(r=>(r[0]?'r':'-')+(r[1]?'w':'-')+(r[2]?'x':'-')).join('');
    out.innerHTML='<code>chmod '+digits.join('')+' file</code> &nbsp; shows as <code>-'+esc(str)+'</code>';
    if(document.activeElement!==inp)inp.value=digits.join('');
  }
  grid.addEventListener('change',e=>{const c=e.target;st[c.dataset.i][c.dataset.j]=c.checked?1:0;draw();});
  inp.addEventListener('input',()=>{
    if(/^[0-7]{3}$/.test(inp.value)){[...inp.value].forEach((d,i)=>{d=+d;st[i]=[d>>2&1,d>>1&1,d&1];});draw();}
  });
  draw();
};
