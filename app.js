// === КОДЕКС PWA · IndexedDB · редактор v3 ===
const DB_NAME='KodexDB', DB_VERSION=2;
let db=null, ME=null, editingId=null, editImage=null, savedRange=null;

/* ---------- БАЗА ---------- */
function openDB(){return new Promise((res,rej)=>{
  const rq=indexedDB.open(DB_NAME,DB_VERSION);
  rq.onupgradeneeded=e=>{const d=e.target.result;
    if(!d.objectStoreNames.contains('records'))d.createObjectStore('records',{keyPath:'id'});
    if(!d.objectStoreNames.contains('categories'))d.createObjectStore('categories',{keyPath:'name'});
    if(!d.objectStoreNames.contains('users'))d.createObjectStore('users',{keyPath:'name'});
    if(!d.objectStoreNames.contains('journal'))d.createObjectStore('journal',{keyPath:'id'});
  };
  rq.onsuccess=()=>{db=rq.result;res();};
  rq.onerror=()=>rej(rq.error);
});}
function put(s,v){return new Promise((res,rej)=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).put(v);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('транзакция прервана'));});}
function all(s){return new Promise((res,rej)=>{const tx=db.transaction(s,'readonly');const r=tx.objectStore(s).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}
function del(s,k){return new Promise((res,rej)=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).delete(k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('удаление прервано'));});}

/* ---------- УТИЛИТЫ ---------- */
function esc(s){const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function msg(id,t,ok){const el=document.getElementById(id);if(!el)return;el.textContent=t;el.className='msg '+(ok?'ok':'err');setTimeout(()=>el.className='msg',6000);}
function D(t){const el=document.getElementById('diag');if(!el)return;const d=document.createElement('div');d.textContent=new Date().toLocaleTimeString()+' › '+t;el.appendChild(d);el.scrollTop=el.scrollHeight;console.log('[КОДЕКС]',t);}
function now(){return new Date().toLocaleString('ru-RU');}
async function hashPin(p,salt){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+'::'+p));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function salt(){return Math.random().toString(36).slice(2)+Date.now().toString(36);}
async function addJournal(action,detail){try{await put('journal',{id:Date.now()+Math.random(),ts:now(),op:ME?ME.name:'система',action,detail:detail||''});}catch(e){D('журнал: '+e.message);}}

/* ---------- САНИТАЙЗЕР ---------- */
const ALLOWED=['B','STRONG','I','EM','U','S','STRIKE','BR','P','DIV','SPAN','H1','H2','H3','H4','UL','OL','LI','BLOCKQUOTE','FONT'];
function cleanNode(node){
  if(node.nodeType===3)return document.createTextNode(node.nodeValue);
  if(node.nodeType!==1)return document.createDocumentFragment();
  const tag=node.tagName;
  if(tag==='SCRIPT'||tag==='STYLE'||tag==='IFRAME'||tag==='OBJECT')return document.createDocumentFragment();
  const kids=document.createDocumentFragment();
  node.childNodes.forEach(c=>kids.appendChild(cleanNode(c)));
  if(!ALLOWED.includes(tag))return kids;
  const el=document.createElement(tag.toLowerCase());
  const align=node.style&&node.style.textAlign;
  if(align&&['left','center','right','justify'].includes(align))el.style.textAlign=align;
  el.appendChild(kids);
  return el;
}
function sanitize(html){
  const tmp=document.createElement('div');tmp.innerHTML=html||'';
  const out=document.createElement('div');
  tmp.childNodes.forEach(c=>out.appendChild(cleanNode(c)));
  return out.innerHTML;
}

/* ---------- РЕДАКТОР: ВЫДЕЛЕНИЕ ---------- */
function bodyEl(){return document.getElementById('edBody');}

function saveRange(){
  const sel=window.getSelection();
  if(!sel||sel.rangeCount===0)return;
  const r=sel.getRangeAt(0);
  if(bodyEl().contains(r.commonAncestorContainer))savedRange=r.cloneRange();
}

// Главная заплатка: восстанавливаем выделение, а если оно потеряно — берём весь блок
function restoreRange(){
  const el=bodyEl();
  el.focus();
  const sel=window.getSelection();
  if(savedRange && el.contains(savedRange.commonAncestorContainer)){
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return;
  }
  // запасной вариант: выделяем всё содержимое редактора
  const r=document.createRange();
  r.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(r);
  savedRange=r.cloneRange();
}

function execCmd(cmd,val=null){
  restoreRange();
  try{document.execCommand('styleWithCSS',false,false);}catch(e){}
  let ok=false;
  try{ok=document.execCommand(cmd,false,val);}catch(e){D('исключение: '+cmd+' '+e.message);}
  // если команда не сработала — пробуем ручную обёртку для стилей
  if(!ok&&['bold','italic','underline','strikeThrough'].includes(cmd)){
    ok=manualWrap(cmd);
  }
  saveRange();refreshToolbar();
  D((ok?'✓ ':'✗ ')+cmd);
}

// Ручное применение стиля, когда execCommand бессилен
function manualWrap(cmd){
  const sel=window.getSelection();
  if(!sel||sel.rangeCount===0)return false;
  const range=sel.getRangeAt(0);
  if(range.collapsed)return false;
  const tagMap={bold:'b',italic:'i',underline:'u',strikeThrough:'s'};
  const tag=tagMap[cmd];
  const frag=range.extractContents();
  // если внутри уже есть этот тег — снимаем его (toggle)
  const already=frag.querySelector&&frag.querySelector(tag);
  const wrapper=document.createElement(tag);
  if(already){
    while(frag.firstChild)wrapper.appendChild(frag.firstChild);
    const parent=already.parentNode;
    // упрощённо: просто вставляем без тега
    const plain=document.createElement('span');
    plain.innerHTML=frag.textContent;
    range.insertNode(plain);
    sel.removeAllRanges();
    const r=document.createRange();r.selectNodeContents(plain);sel.addRange(r);
    return true;
  }
  wrapper.appendChild(frag);
  range.insertNode(wrapper);
  sel.removeAllRanges();
  const r=document.createRange();r.selectNodeContents(wrapper);sel.addRange(r);
  return true;
}

function execBlock(tag){execCmd('formatBlock','<'+tag+'>');}

function refreshToolbar(){
  const tb=document.getElementById('edToolbar');if(!tb)return;
  tb.querySelectorAll('button[data-cmd]').forEach(b=>{
    let on=false;try{on=document.queryCommandState(b.dataset.cmd);}catch(e){}
    b.classList.toggle('active',!!on);
  });
  let blk='';try{blk=(document.queryCommandValue('formatBlock')||'').toLowerCase();}catch(e){}
  tb.querySelectorAll('button[data-block]').forEach(b=>b.classList.toggle('active',blk===b.dataset.block));
}

function initEditor(){
  const tb=document.getElementById('edToolbar'),el=bodyEl();
  if(!tb||!el)return;
  tb.querySelectorAll('button').forEach(b=>{
    const stop=e=>{e.preventDefault();e.stopPropagation();saveRange();};
    b.addEventListener('mousedown',stop);
    b.addEventListener('touchstart',stop,{passive:false});
    b.addEventListener('pointerdown',stop);
    b.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      if(b.dataset.block)execBlock(b.dataset.block);
      else if(b.dataset.cmd)execCmd(b.dataset.cmd);
    });
  });
  // сохраняем выделение при любом изменении
  ['keyup','mouseup','input','focus','touchend','select'].forEach(ev=>el.addEventListener(ev,()=>{saveRange();refreshToolbar();}));
  document.addEventListener('selectionchange',()=>{
    const sel=window.getSelection();
    if(sel&&sel.rangeCount>0&&el.contains(sel.getRangeAt(0).commonAncestorContainer)){saveRange();refreshToolbar();}
  });
  el.addEventListener('blur',saveRange);
  // вставка: чистый текст, но с сохранением выделения после вставки
  el.addEventListener('paste',e=>{
    e.preventDefault();
    const txt=(e.clipboardData||window.clipboardData).getData('text/plain');
    const html=(e.clipboardData||window.clipboardData).getData('text/html');
    if(html){
      document.execCommand('insertHTML',false,sanitize(html));
    }else{
      document.execCommand('insertHTML',false,esc(txt).replace(/\n/g,'<br>'));
    }
    saveRange();
    D('вставка выполнена');
  });
  D('редактор v3 инициализирован');
}

/* ---------- ПЕРВЫЙ ЗАПУСК ---------- */
async function ensureMaster(){
  const users=await all('users');
  if(users.length===0){
    const old=localStorage.getItem('kodex_pin')||'1234';
    const s=salt();
    await put('users',{name:'Аранэль Хальдарон',role:'МАГИСТР',clearance:5,salt:s,pinHash:await hashPin(old,s),created:now()});
    localStorage.removeItem('kodex_pin');
    D('Совет создан. PIN Магистра: '+old);
  }
  const cats=await all('categories');
  if(cats.length===0){
    for(const c of [{name:'ДОСЬЕ',prefix:'ДОС'},{name:'АНОМАЛИЯ',prefix:'АНО'},{name:'АРТЕФАКТ',prefix:'АРТ'},{name:'ПРОТОКОЛ',prefix:'ПРТ'},{name:'ЛОКАЦИЯ',prefix:'ЛОК'},{name:'ЗНАНИЕ',prefix:'ЗНН'}])await put('categories',c);
  }
}

/* ---------- ВХОД ---------- */
async function login(){
  try{
    const nm=document.getElementById('loginName').value.trim();
    const p=document.getElementById('loginPass').value;
    if(!nm||!p)throw new Error('Введи имя и PIN.');
    const u=(await all('users')).find(x=>x.name.toLowerCase()===nm.toLowerCase());
    if(!u)throw new Error('Оператор не найден в Совете.');
    if(await hashPin(p,u.salt)!==u.pinHash)throw new Error('Неверный PIN-код.');
    ME=u;localStorage.setItem('kodex_session',JSON.stringify({name:u.name,pinHash:u.pinHash}));
    await enterMain();D('вход: '+u.name);
  }catch(e){msg('authMsg',e.message,false);D('вход: '+e.message);}
}
function logout(){localStorage.removeItem('kodex_session');location.reload();}
async function enterMain(){
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
  document.getElementById('topInfo').innerHTML='Приветствую, оператор <b>'+esc(ME.name)+'</b> · '+esc(ME.role)+' · допуск '+ME.clearance;
  document.getElementById('councilBtn').style.display=ME.clearance>=5?'':'none';
  document.getElementById('journalBtn').style.display=ME.clearance>=4?'':'none';
  fillCatSelect();fillClearSelect();showTab('list');
}

/* ---------- ТАБЫ ---------- */
const TABS=['list','view','editor','cats','council','journal'];
function showTabRaw(t){TABS.forEach(x=>document.getElementById('tab-'+x).classList.toggle('hidden',x!==t));}
function showTab(t){showTabRaw(t);
  if(t==='list')renderList();
  if(t==='cats')renderCats();
  if(t==='council')renderCouncil();
  if(t==='journal')renderJournal();
}

/* ---------- СПИСОК ---------- */
async function renderList(){
  const q=(document.getElementById('searchBox').value||'').toLowerCase();
  const box=document.getElementById('recList');box.innerHTML='';
  const recs=(await all('records')).sort((a,b)=>b.id-a.id);
  let shown=0;
  for(const r of recs){
    if((r.clearance||1)>ME.clearance){
      if(q)continue;
      const d=document.createElement('div');d.className='rec';d.style.cursor='default';
      d.innerHTML='<span class="locked">▓▓▓▓ │ [ЗАСЕКРЕЧЕНО — требуется допуск '+r.clearance+']</span>';
      box.appendChild(d);shown++;continue;
    }
    if(q&&!((r.title||'')+(r.tags||'')+r.code+(r.category||'')+(r.source||'')).toLowerCase().includes(q))continue;
    const d=document.createElement('div');d.className='rec';
    const info=document.createElement('div');
    info.innerHTML='<span class="code">'+esc(r.code)+'</span> │ <b>'+esc(r.title)+'</b><div class="meta">'+esc(r.category)+' · допуск '+(r.clearance||1)+' · '+esc(r.updated)+'</div>';
    info.onclick=()=>viewRecord(r);
    d.appendChild(info);
    if(ME.clearance>=4){
      const b=document.createElement('button');b.type='button';b.className='danger';b.textContent='✖ УДАЛИТЬ';
      b.onclick=ev=>{ev.stopPropagation();deleteRecord(r);};
      d.appendChild(b);
    }
    box.appendChild(d);shown++;
  }
  if(!shown)box.innerHTML='<p class="meta">Архив молчит…</p>';
}
async function deleteRecord(r){
  if(!confirm('Удалить запись '+r.code+' «'+r.title+'» навсегда?'))return;
  try{
    D('удаление '+r.code);
    await del('records',r.id);
    const left=await all('records');
    if(left.some(x=>x.id===r.id)){
      const tx=db.transaction('records','readwrite');
      tx.objectStore('records').openCursor().onsuccess=e=>{const c=e.target.result;if(c){if(c.value.code===r.code)c.delete();c.continue();}};
      await new Promise(res=>{tx.oncomplete=res;tx.onerror=res;});
    }
    await addJournal('УДАЛЕНИЕ',r.code);D('✓ удалено: '+r.code);showTab('list');
  }catch(e){D('ОШИБКА удаления: '+e.message);alert('Не удалось удалить: '+e.message);}
}

/* ---------- ПРОСМОТР ---------- */
function viewRecord(r){
  if((r.clearance||1)>ME.clearance){alert('Недостаточный допуск.');return;}
  const vc=document.getElementById('viewContent');
  vc.innerHTML='<h2 style="color:var(--holo2)">'+esc(r.code)+' ══ '+esc(r.title)+'</h2>'+
    '<div class="meta">'+esc(r.category)+' · допуск '+(r.clearance||1)+' · автор: '+esc(r.author)+' · изменено: '+esc(r.updated)+'</div>'+
    '<div>'+(r.tags||'').split(',').filter(t=>t.trim()).map(t=>'<span class="tag">'+esc(t.trim())+'</span>').join('')+'</div>'+
    (r.source?'<div class="meta">Источник: '+esc(r.source)+'</div>':'')+
    '<div class="body-text">'+sanitize(r.body)+'</div>'+
    (r.image?'<img src="'+r.image+'" class="img-dossier">':'')+
    '<div style="margin-top:10px"><button type="button" id="btnEdit">✎ РЕДАКТИРОВАТЬ</button>'+
    (ME.clearance>=4?' <button type="button" class="danger" id="btnDel">✖ УДАЛИТЬ</button>':'')+'</div>';
  document.getElementById('btnEdit').onclick=()=>openEditor(r);
  const bd=document.getElementById('btnDel');if(bd)bd.onclick=()=>deleteRecord(r);
  showTabRaw('view');
}

/* ---------- РЕДАКТОР ЗАПИСИ ---------- */
function fillCatSelect(){all('categories').then(cs=>{const s=document.getElementById('edCat');s.innerHTML='';cs.forEach(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=c.name;s.appendChild(o);});});}
function fillClearSelect(){const s=document.getElementById('edClear');s.innerHTML='';for(let i=1;i<=ME.clearance;i++){const o=document.createElement('option');o.value=i;o.textContent='Допуск '+i;if(i===Math.min(3,ME.clearance))o.selected=true;s.appendChild(o);}}
function openEditor(r){
  editingId=r||null;editImage=r?(r.image||null):null;savedRange=null;
  document.getElementById('editorTitle').textContent=r?'─── РЕДАКТИРОВАНИЕ '+r.code+' ───':'─── НОВАЯ ЗАПИСЬ ───';
  document.getElementById('edTitle').value=r?r.title:'';
  fillCatSelect();fillClearSelect();
  setTimeout(()=>{
    document.getElementById('edCat').value=r?r.category:'ДОСЬЕ';
    document.getElementById('edClear').value=r?(r.clearance||1):Math.min(3,ME.clearance);
  },0);
  document.getElementById('edTags').value=r?(r.tags||''):'';
  document.getElementById('edSource').value=r?(r.source||''):'';
  const el=bodyEl();
  el.innerHTML=r?sanitize(r.body):'<p><br></p>';
  document.getElementById('edFile').value='';
  const p=document.getElementById('imgPreview');
  if(editImage){p.src=editImage;p.style.display='block';}else{p.style.display='none';p.src='';}
  document.getElementById('edMsg').className='msg';
  showTabRaw('editor');
  el.focus();refreshToolbar();
}
document.getElementById('edFile').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  if(f.size>8*1024*1024){msg('edMsg','Фото больше 8 МБ — сожми его перед загрузкой.',false);e.target.value='';return;}
  const rd=new FileReader();rd.onload=ev=>{editImage=ev.target.result;const p=document.getElementById('imgPreview');p.src=editImage;p.style.display='block';};rd.readAsDataURL(f);
});
function clearPhoto(){editImage=null;const p=document.getElementById('imgPreview');p.style.display='none';p.src='';document.getElementById('edFile').value='';}

/* ---------- СОХРАНЕНИЕ ---------- */
async function saveRecord(){
  try{
    const title=document.getElementById('edTitle').value.trim();
    if(!title)throw new Error('Пустое название.');
    const cat=document.getElementById('edCat').value;
    if(!cat)throw new Error('Выбери категорию.');
    const cl=parseInt(document.getElementById('edClear').value);
    if(cl>ME.clearance)throw new Error('Нельзя задать допуск выше своего.');
    const body=sanitize(bodyEl().innerHTML);
    let code,id;
    if(editingId){code=editingId.code;id=editingId.id;}
    else{const cs=await all('categories');const c=cs.find(x=>x.name===cat);id=Date.now();code=(c?c.prefix:'ЗАП')+'-'+String(id).slice(-4);}
    const rec={id,code,title,category:cat,clearance:cl,
      tags:document.getElementById('edTags').value.trim(),
      source:document.getElementById('edSource').value.trim(),
      body,image:editImage||null,
      author:editingId?editingId.author:ME.name,updated:now()};
    await put('records',rec);
    await addJournal(editingId?'РЕДАКТИРОВАНИЕ':'СОЗДАНИЕ',code);
    msg('edMsg','✓ Запись '+code+' сохранена.',true);
    setTimeout(()=>viewRecord(rec),300);
  }catch(e){msg('edMsg',e.message,false);D('сохранение: '+e.message);}
}

/* ---------- КАТЕГОРИИ ---------- */
async function renderCats(){
  const cs=await all('categories');
  document.getElementById('catList').innerHTML=cs.map(c=>'<div class="rec" style="cursor:default"><span class="code">'+esc(c.prefix)+'</span> │ '+esc(c.name)+'</div>').join('');
}
async function addCategory(){
  const n=document.getElementById('newCatName').value.trim().toUpperCase();
  const p=document.getElementById('newCatPrefix').value.trim().toUpperCase()||'ЗАП';
  if(!n){msg('catMsg','Пустое имя.',false);return;}
  await put('categories',{name:n,prefix:p});await addJournal('КАТЕГОРИЯ',n);
  msg('catMsg','✓ Добавлена.',true);fillCatSelect();renderCats();
}

/* ---------- СОВЕТ ---------- */
async function renderCouncil(){
  const box=document.getElementById('userList');
  if(ME.clearance<5){box.innerHTML='<p style="color:var(--err)">✖ Требуется допуск 5.</p>';return;}
  const users=await all('users');box.innerHTML='';
  users.forEach(u=>{
    const row=document.createElement('div');row.className='rec';row.style.cursor='default';
    row.innerHTML='<b>'+esc(u.name)+'</b> <span class="meta">'+esc(u.role)+' · создан '+esc(u.created||'—')+'</span>';
    const line=document.createElement('div');line.className='row';line.style.marginTop='6px';
    const role=document.createElement('select');
    ['ПАДАВАН','РЫЦАРЬ','МАСТЕР','СОВЕТ','МАГИСТР'].forEach(r=>{const o=document.createElement('option');o.textContent=r;if(r===u.role)o.selected=true;role.appendChild(o);});
    role.onchange=async()=>{u.role=role.value;await put('users',u);await addJournal('РОЛЬ',u.name+' → '+u.role);renderCouncil();};
    const cl=document.createElement('select');
    [1,2,3,4,5].forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent='допуск '+n;if(n===u.clearance)o.selected=true;cl.appendChild(o);});
    cl.onchange=async()=>{
      u.clearance=parseInt(cl.value);await put('users',u);await addJournal('ДОПУСК',u.name+' → '+u.clearance);
      if(u.name===ME.name){ME=u;localStorage.setItem('kodex_session',JSON.stringify({name:u.name,pinHash:u.pinHash}));await enterMain();}
      renderCouncil();
    };
    const pin=document.createElement('input');pin.type='password';pin.placeholder='новый PIN (мин. 4)';
    const setPin=document.createElement('button');setPin.type='button';setPin.textContent='СМЕНИТЬ PIN';
    setPin.onclick=async()=>{
      const v=pin.value;
      if(v.length<4){msg('councilMsg','PIN минимум 4 знака.',false);return;}
      u.salt=salt();u.pinHash=await hashPin(v,u.salt);
      await put('users',u);await addJournal('СМЕНА PIN',u.name);
      if(u.name===ME.name){ME=u;localStorage.setItem('kodex_session',JSON.stringify({name:u.name,pinHash:u.pinHash}));}
      pin.value='';msg('councilMsg','✓ PIN обновлён для '+u.name,true);renderCouncil();
    };
    const rm=document.createElement('button');rm.type='button';rm.className='danger';rm.textContent='✖ УДАЛИТЬ ОПЕРАТОРА';
    rm.onclick=async()=>{
      if(u.name===ME.name){msg('councilMsg','Себя удалить нельзя.',false);return;}
      if(u.clearance>=5&&users.filter(x=>x.clearance>=5).length<=1){msg('councilMsg','Это последний Магистр.',false);return;}
      if(!confirm('Удалить оператора '+u.name+'?'))return;
      await del('users',u.name);await addJournal('УДАЛЕНИЕ ОПЕРАТОРА',u.name);renderCouncil();
    };
    line.appendChild(role);line.appendChild(cl);
    row.appendChild(line);row.appendChild(pin);
    const bl=document.createElement('div');bl.appendChild(setPin);bl.appendChild(rm);
    row.appendChild(bl);box.appendChild(row);
  });
}
async function addUser(){
  try{
    if(ME.clearance<5)throw new Error('Требуется допуск 5.');
    const n=document.getElementById('nuName').value.trim();
    const p=document.getElementById('nuPin').value;
    const cl=parseInt(document.getElementById('nuClear').value);
    if(!n||p.length<4)throw new Error('Имя и PIN (мин. 4 знака).');
    const users=await all('users');
    if(users.some(u=>u.name.toLowerCase()===n.toLowerCase()))throw new Error('Имя занято.');
    const s=salt();
    await put('users',{name:n,role:document.getElementById('nuRole').value,clearance:cl,salt:s,pinHash:await hashPin(p,s),created:now()});
    await addJournal('НОВЫЙ ОПЕРАТОР',n+' · допуск '+cl);
    document.getElementById('nuName').value='';document.getElementById('nuPin').value='';
    msg('councilMsg','✓ Оператор добавлен. Передай ему имя и PIN.',true);renderCouncil();
  }catch(e){msg('councilMsg',e.message,false);}
}

/* ---------- ЖУРНАЛ ---------- */
async function renderJournal(){
  const box=document.getElementById('journalList');
  if(ME.clearance<4){box.innerHTML='<p style="color:var(--err)">✖ Допуск 4+.</p>';return;}
  const j=(await all('journal')).sort((a,b)=>b.id-a.id).slice(0,150);
  box.innerHTML=j.map(x=>'<div class="journal-line">'+esc(x.ts)+' │ '+esc(x.op)+' │ '+esc(x.action)+' │ '+esc(x.detail)+'</div>').join('')||'<p class="meta">Пусто.</p>';
}

/* ---------- ЭКСПОРТ / ИМПОРТ ---------- */
async function exportData(){
  const data={records:await all('records'),categories:await all('categories'),users:await all('users'),journal:await all('journal'),exported:now()};
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='kodex_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();
  D('экспорт завершён');
}
function importData(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.json';
  inp.onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    try{
      const d=JSON.parse(await f.text());
      for(const r of d.records||[])await put('records',r);
      for(const c of d.categories||[])await put('categories',c);
      for(const u of d.users||[])await put('users',u);
      for(const j of d.journal||[])await put('journal',j);
      await addJournal('ИМПОРТ',(d.records||[]).length+' записей');
      alert('Архив обновлён.');fillCatSelect();showTab('list');
    }catch(err){alert('Ошибка импорта: '+err.message);}
  };
  inp.click();
}

/* ---------- ОБНОВЛЕНИЕ ---------- */
async function forceUpdate(){
  try{
    if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();for(const r of regs)await r.unregister();}
    if(window.caches){const keys=await caches.keys();for(const k of keys)await caches.delete(k);}
    D('кэш очищен, перезагрузка…');location.reload();
  }catch(e){alert('Ошибка обновления: '+e.message);}
}

/* ---------- СТАРТ ---------- */
(async()=>{
  D('инициализация КОДЕКСА PWA…');
  try{
    await openDB();await ensureMaster();initEditor();
    const s=JSON.parse(localStorage.getItem('kodex_session')||'null');
    if(s){
      const u=(await all('users')).find(x=>x.name===s.name);
      if(u&&u.pinHash===s.pinHash){ME=u;await enterMain();D('сессия восстановлена');return;}
      localStorage.removeItem('kodex_session');
    }
  }catch(e){D('ОШИБКА: '+e.message);}
})();
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').then(reg=>{reg.update();setInterval(()=>reg.update(),60000);}).catch(e=>D('SW: '+e.message));
  let reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloaded)return;reloaded=true;location.reload();});
}
