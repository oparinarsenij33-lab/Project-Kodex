// === КОДЕКС PWA · build 7 · Firebase Compat + fixes ===
const BUILD='build 7 (Firebase Compat + fixes)';

function D(t){const el=document.getElementById('diag');if(!el)return;const d=document.createElement('div');d.textContent=new Date().toLocaleTimeString()+' › '+t;el.appendChild(d);el.scrollTop=el.scrollHeight;console.log('[КОДЕКС]',t);}
D('КОДЕКС '+BUILD+' загружен');

/* ---------- FIREBASE CONFIG ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyBcC0AX5BTSvrZVMQwiLKfRqTDdY5nDbMI",
  authDomain: "kodex-archive.firebaseapp.com",
  projectId: "kodex-archive",
  storageBucket: "kodex-archive.firebasestorage.app",
  messagingSenderId: "2107344225",
  appId: "1:2107344225:web:c3eca829035757b968b120"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let ME = null;
let editingId = null;

function esc(s){const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function msg(id,t,ok){const el=document.getElementById(id);if(!el)return;el.textContent=t;el.className='msg '+(ok?'ok':'err');setTimeout(()=>el.className='msg',6000);}
function now(){return new Date().toLocaleString('ru-RU');}
async function hashPin(p,salt){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+'::'+p));return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function salt(){return Math.random().toString(36).slice(2)+Date.now().toString(36);}

/* ---------- САНИТАЙЗЕР ---------- */
const ALLOWED=['B','STRONG','I','EM','U','S','STRIKE','BR','P','DIV','SPAN','H1','H2','H3','H4','UL','OL','LI','BLOCKQUOTE'];
function cleanNode(node){
  if(node.nodeType===3)return document.createTextNode(node.nodeValue);
  if(node.nodeType!==1)return document.createDocumentFragment();
  const tag=node.tagName;
  if(['SCRIPT','STYLE','IFRAME','OBJECT','LINK','META'].includes(tag))return document.createDocumentFragment();
  const kids=document.createDocumentFragment();
  node.childNodes.forEach(c=>kids.appendChild(cleanNode(c)));
  if(!ALLOWED.includes(tag))return kids;
  const el=document.createElement(tag.toLowerCase());
  const al=node.style&&node.style.textAlign;
  if(al&&['left','center','right','justify'].includes(al))el.style.textAlign=al;
  el.appendChild(kids);return el;
}
function sanitize(html){const t=document.createElement('div');t.innerHTML=html||'';const o=document.createElement('div');t.childNodes.forEach(c=>o.appendChild(cleanNode(c)));return o.innerHTML;}

/* ---------- РЕДАКТОР НА DOM ---------- */
function bodyEl(){return document.getElementById('edBody');}
let savedRange=null;

function captureRange(){
  const sel=window.getSelection();
  if(!sel||sel.rangeCount===0)return null;
  const r=sel.getRangeAt(0);
  const el=bodyEl();
  if(!el.contains(r.commonAncestorContainer))return null;
  return r.cloneRange();
}
function applyRange(r){
  const el=bodyEl();el.focus();
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);
}
function selectAllBody(){
  const el=bodyEl();const r=document.createRange();r.selectNodeContents(el);applyRange(r);return r;
}

function wrapInline(tag){
  let r=captureRange()||savedRange;
  if(!r){D('нет выделения — применяю ко всему тексту');r=selectAllBody();}
  applyRange(r);
  if(r.collapsed){D('выделение пустое');msg('edMsg','Выдели фрагмент текста, потом нажимай стиль.',false);return false;}

  let node=r.commonAncestorContainer;
  if(node.nodeType===3)node=node.parentNode;
  let existing=null,cur=node;
  while(cur&&cur!==bodyEl()){if(cur.tagName&&cur.tagName.toLowerCase()===tag){existing=cur;break;}cur=cur.parentNode;}

  if(existing){
    const parent=existing.parentNode;
    while(existing.firstChild)parent.insertBefore(existing.firstChild,existing);
    parent.removeChild(existing);
    bodyEl().normalize();
    D('снят стиль '+tag);
    return true;
  }

  const wrapper=document.createElement(tag);
  try{
    const frag=r.extractContents();
    wrapper.appendChild(frag);
    r.insertNode(wrapper);
  }catch(e){
    const txt=r.toString();
    r.deleteContents();
    wrapper.textContent=txt;
    r.insertNode(wrapper);
  }
  bodyEl().normalize();
  const nr=document.createRange();nr.selectNodeContents(wrapper);
  applyRange(nr);savedRange=nr.cloneRange();
  D('✓ применён стиль '+tag);
  return true;
}

function setBlock(tag){
  let r=captureRange()||savedRange;
  if(!r)r=selectAllBody();
  applyRange(r);
  let node=r.commonAncestorContainer;
  if(node.nodeType===3)node=node.parentNode;
  let block=node;
  while(block&&block.parentNode!==bodyEl())block=block.parentNode;
  if(!block||block===bodyEl()){
    const p=document.createElement(tag);
    p.innerHTML=bodyEl().innerHTML||'<br>';
    bodyEl().innerHTML='';bodyEl().appendChild(p);
    D('✓ блок '+tag+' (весь текст)');return true;
  }
  const fresh=document.createElement(tag);
  fresh.innerHTML=block.innerHTML||'<br>';
  if(block.style&&block.style.textAlign)fresh.style.textAlign=block.style.textAlign;
  block.parentNode.replaceChild(fresh,block);
  const nr=document.createRange();nr.selectNodeContents(fresh);applyRange(nr);savedRange=nr.cloneRange();
  D('✓ блок '+tag);return true;
}

function setAlign(dir){
  let r=captureRange()||savedRange;
  if(!r)r=selectAllBody();
  applyRange(r);
  let node=r.commonAncestorContainer;
  if(node.nodeType===3)node=node.parentNode;
  let block=node;
  while(block&&block.parentNode!==bodyEl())block=block.parentNode;
  if(!block||block===bodyEl()){bodyEl().style.textAlign=dir;D('✓ выравнивание всего: '+dir);return true;}
  block.style.textAlign=dir;
  D('✓ выравнивание '+dir);return true;
}

function makeList(type){
  let r=captureRange()||savedRange;
  if(!r)r=selectAllBody();
  applyRange(r);
  const text=r.toString()||bodyEl().innerText||'пункт';
  const lines=text.split(/\n+/).filter(x=>x.trim());
  if(lines.length===0)lines.push('пункт');
  const list=document.createElement(type);
  lines.forEach(l=>{const li=document.createElement('li');li.textContent=l.trim();list.appendChild(li);});
  if(r.collapsed){bodyEl().appendChild(list);}
  else{r.deleteContents();r.insertNode(list);}
  D('✓ список '+type);return true;
}

function clearFormat(){
  let r=captureRange()||savedRange;
  if(!r||r.collapsed)r=selectAllBody();
  applyRange(r);
  const txt=r.toString();
  r.deleteContents();
  const tn=document.createTextNode(txt);
  r.insertNode(tn);
  bodyEl().normalize();
  D('✓ форматирование снято');return true;
}

function refreshToolbar(){
  const tb=document.getElementById('edToolbar');if(!tb)return;
  const sel=window.getSelection();
  let node=sel&&sel.rangeCount?sel.getRangeAt(0).commonAncestorContainer:null;
  if(node&&node.nodeType===3)node=node.parentNode;
  const tags=[];let cur=node;
  while(cur&&cur!==bodyEl()){if(cur.tagName)tags.push(cur.tagName.toLowerCase());cur=cur.parentNode;}
  tb.querySelectorAll('button[data-inline]').forEach(b=>b.classList.toggle('active',tags.includes(b.dataset.inline)||(b.dataset.inline==='b'&&tags.includes('strong'))||(b.dataset.inline==='i'&&tags.includes('em'))));
  tb.querySelectorAll('button[data-block]').forEach(b=>b.classList.toggle('active',tags.includes(b.dataset.block)));
}

function initEditor(){
  const tb=document.getElementById('edToolbar'),el=bodyEl();
  if(!tb||!el){D('ОШИБКА: панель или поле редактора не найдены');return;}
  tb.querySelectorAll('button').forEach(b=>{
    const hold=e=>{e.preventDefault();e.stopPropagation();const r=captureRange();if(r)savedRange=r;};
    b.addEventListener('pointerdown',hold);
    b.addEventListener('mousedown',hold);
    b.addEventListener('touchstart',hold,{passive:false});
    b.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      if(b.dataset.inline)wrapInline(b.dataset.inline);
      else if(b.dataset.block)setBlock(b.dataset.block);
      else if(b.dataset.align)setAlign(b.dataset.align);
      else if(b.dataset.list)makeList(b.dataset.list);
      else if(b.dataset.clear)clearFormat();
      refreshToolbar();
    });
  });
  document.addEventListener('selectionchange',()=>{const r=captureRange();if(r){savedRange=r;refreshToolbar();}});
  el.addEventListener('paste',e=>{
    e.preventDefault();
    const cd=e.clipboardData||window.clipboardData;
    const html=cd.getData('text/html'),txt=cd.getData('text/plain');
    const r=captureRange()||selectAllBody();
    applyRange(r);
    if(!r.collapsed)r.deleteContents();
    if(html){
      const tmp=document.createElement('div');tmp.innerHTML=sanitize(html);
      const frag=document.createDocumentFragment();
      while(tmp.firstChild)frag.appendChild(tmp.firstChild);
      r.insertNode(frag);
    }else{
      const parts=(txt||'').split(/\n/);
      const frag=document.createDocumentFragment();
      parts.forEach((p,i)=>{if(i)frag.appendChild(document.createElement('br'));frag.appendChild(document.createTextNode(p));});
      r.insertNode(frag);
    }
    el.normalize();savedRange=null;
    D('вставка выполнена');
  });
  D('редактор инициализирован, кнопок: '+tb.querySelectorAll('button').length);
}

function selfTest(){
  const el=bodyEl();
  el.innerHTML='<p>Проверка форматирования КОДЕКС</p>';
  const p=el.firstChild;
  const r=document.createRange();
  r.setStart(p.firstChild,0);r.setEnd(p.firstChild,8);
  applyRange(r);savedRange=r.cloneRange();
  const ok=wrapInline('b');
  const hasBold=/<b>/i.test(el.innerHTML);
  D('ТЕСТ: wrapInline='+ok+', тег <b> в тексте='+hasBold);
  msg('edMsg',hasBold?'✓ Тест пройден: слово «Проверка» стало жирным. Редактор работает.':'✗ Тест провален. Сообщи Магистру строку ТЕСТ из журнала.',hasBold);
}

/* ---------- FIREBASE HELPERS ---------- */
async function fbGet(path){
  const snap=await db.doc(path).get();
  return snap.exists?snap.data():null;
}
async function fbSet(path,data){
  await db.doc(path).set(data,{merge:true});
}
async function fbDelete(path){
  await db.doc(path).delete();
}
async function fbGetAll(colPath){
  const snap=await db.collection(colPath).get();
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}

/* ---------- ПЕРВЫЙ ЗАПУСК ---------- */
async function ensureMaster(){
  const users=await fbGetAll('users');
  if(users.length===0){
    const old='1234';const s=salt();
    await fbSet('users/Аранэль_Хальдарон',{name:'Аранэль Хальдарон',role:'МАГИСТР',clearance:5,salt:s,pinHash:await hashPin(old,s),created:now()});
    D('Совет создан. PIN Магистра: '+old);
  }
  const cats=await fbGetAll('categories');
  if(cats.length===0){
    for(const c of [{name:'ДОСЬЕ',prefix:'ДОС'},{name:'АНОМАЛИЯ',prefix:'АНО'},{name:'АРТЕФАКТ',prefix:'АРТ'},{name:'ПРОТОКОЛ',prefix:'ПРТ'},{name:'ЛОКАЦИЯ',prefix:'ЛОК'},{name:'ЗНАНИЕ',prefix:'ЗНН'}]){
      await fbSet('categories/'+c.name,c);
    }
  }
}

/* ---------- ВХОД ---------- */
async function login(){
  try{
    const nm=document.getElementById('loginName').value.trim(),p=document.getElementById('loginPass').value;
    if(!nm||!p)throw new Error('Введи имя и PIN.');
    const users=await fbGetAll('users');
    const u=users.find(x=>x.name.toLowerCase()===nm.toLowerCase());
    if(!u)throw new Error('Оператор не найден в Совете.');
    if(await hashPin(p,u.salt)!==u.pinHash)throw new Error('Неверный PIN-код.');
    ME=u;
    sessionStorage.setItem('kodex_me',JSON.stringify(ME));
    await enterMain();D('вход: '+u.name);
  }catch(e){msg('authMsg',e.message,false);D('вход: '+e.message);}
}
function logout(){sessionStorage.removeItem('kodex_me');location.reload();}
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
function showTab(t){showTabRaw(t);if(t==='list')renderList();if(t==='cats')renderCats();if(t==='council')renderCouncil();if(t==='journal')renderJournal();}

/* ---------- СПИСОК ---------- */
async function renderList(){
  const q=(document.getElementById('searchBox').value||'').toLowerCase();
  const box=document.getElementById('recList');box.innerHTML='';
  const recs=await fbGetAll('records');
  recs.sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
  let shown=0;
  for(const r of recs){
    if((r.clearance||1)>ME.clearance){
      if(q)continue;
      const d=document.createElement('div');d.className='rec';d.style.cursor='default';
      d.innerHTML='<span class="locked">▓▓▓▓ │ [ЗАСЕКРЕЧЕНО — допуск '+r.clearance+']</span>';
      box.appendChild(d);shown++;continue;
    }
    if(q&&!((r.title||'')+(r.tags||'')+r.code+(r.category||'')+(r.source||'')).toLowerCase().includes(q))continue;
    const d=document.createElement('div');d.className='rec';
    const info=document.createElement('div');
    info.innerHTML='<span class="code">'+esc(r.code)+'</span> │ <b>'+esc(r.title)+'</b><div class="meta">'+esc(r.category)+' · допуск '+(r.clearance||1)+' · '+esc(r.updated||'')+'</div>';
    info.onclick=()=>viewRecord(r);d.appendChild(info);
    if(ME.clearance>=4){const b=document.createElement('button');b.type='button';b.className='danger';b.textContent='✖ УДАЛИТЬ';b.onclick=ev=>{ev.stopPropagation();deleteRecord(r);};d.appendChild(b);}
    box.appendChild(d);shown++;
  }
  if(!shown)box.innerHTML='<p class="meta">Архив молчит…</p>';
}
async function deleteRecord(r){
  if(!confirm('Удалить '+r.code+' «'+r.title+'»?'))return;
  try{
    await fbDelete('records/'+r.id);
    await addJournal('УДАЛЕНИЕ',r.code);D('удалено '+r.code);showTab('list');
  }catch(e){alert('Не удалось удалить: '+e.message);}
}

/* ---------- ПРОСМОТР ---------- */
function viewRecord(r){
  if((r.clearance||1)>ME.clearance){alert('Недостаточный допуск.');return;}
  const vc=document.getElementById('viewContent');
  vc.innerHTML='<h2 style="color:var(--holo2)">'+esc(r.code)+' ══ '+esc(r.title)+'</h2>'+
    '<div class="meta">'+esc(r.category)+' · допуск '+(r.clearance||1)+' · автор: '+esc(r.author)+' · изменено: '+esc(r.updated||'')+'</div>'+
    '<div>'+(r.tags||'').split(',').filter(t=>t.trim()).map(t=>'<span class="tag">'+esc(t.trim())+'</span>').join('')+'</div>'+
    (r.source?'<div class="meta">Источник: '+esc(r.source)+'</div>':'')+
    '<div class="body-text">'+sanitize(r.body||'')+'</div>'+
    (r.imageUrl?'<img src="'+esc(r.imageUrl)+'" class="img-dossier">':'')+
    '<div style="margin-top:10px"><button type="button" id="btnEdit">✎ РЕДАКТИРОВАТЬ</button>'+
    (ME.clearance>=4?' <button type="button" class="danger" id="btnDel">✖ УДАЛИТЬ</button>':'')+'</div>';
  document.getElementById('btnEdit').onclick=()=>openEditor(r);
  const bd=document.getElementById('btnDel');if(bd)bd.onclick=()=>deleteRecord(r);
  showTabRaw('view');
}

/* ---------- РЕДАКТОР ЗАПИСИ ---------- */
function fillCatSelect(){fbGetAll('categories').then(cs=>{const s=document.getElementById('edCat');s.innerHTML='';cs.forEach(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=c.name;s.appendChild(o);});});}
function fillClearSelect(){const s=document.getElementById('edClear');s.innerHTML='';for(let i=1;i<=ME.clearance;i++){const o=document.createElement('option');o.value=i;o.textContent='Допуск '+i;if(i===Math.min(3,ME.clearance))o.selected=true;s.appendChild(o);}}
function openEditor(r){
  editingId=r||null;
  document.getElementById('editorTitle').textContent=r?'─── РЕДАКТИРОВАНИЕ '+r.code+' ───':'─── НОВАЯ ЗАПИСЬ ───';
  document.getElementById('edTitle').value=r?r.title:'';
  fillCatSelect();fillClearSelect();
  setTimeout(()=>{document.getElementById('edCat').value=r?r.category:'ДОСЬЕ';document.getElementById('edClear').value=r?(r.clearance||1):Math.min(3,ME.clearance);},0);
  document.getElementById('edTags').value=r?(r.tags||''):'';
  document.getElementById('edSource').value=r?(r.source||''):'';
  bodyEl().innerHTML=r?sanitize(r.body||''):'<p><br></p>';
  document.getElementById('edImageUrl').value=r?(r.imageUrl||''):'';
  const p=document.getElementById('imgPreview');
  if(r&&r.imageUrl){p.src=r.imageUrl;p.style.display='block';}else{p.style.display='none';p.src='';}
  document.getElementById('edMsg').className='msg';
  showTabRaw('editor');bodyEl().focus();
}
document.getElementById('edImageUrl').addEventListener('input',e=>{
  const url=e.target.value.trim();const p=document.getElementById('imgPreview');
  if(url&&url.startsWith('http')){p.src=url;p.style.display='block';p.onerror=()=>{p.style.display='none';};}
  else{p.style.display='none';p.src='';}
});
function clearPhoto(){
  const p=document.getElementById('imgPreview');
  p.style.display='none';p.src='';
  document.getElementById('edImageUrl').value='';
  if(editingId)editingId.imageUrl=null;
  D('фото удалено');
}
async function saveRecord(){
  try{
    const title=document.getElementById('edTitle').value.trim();
    if(!title)throw new Error('Пустое название.');
    const cat=document.getElementById('edCat').value;if(!cat)throw new Error('Выбери категорию.');
    const cl=parseInt(document.getElementById('edClear').value);
    if(cl>ME.clearance)throw new Error('Нельзя задать допуск выше своего.');
    const body=sanitize(bodyEl().innerHTML);
    const imageUrl=document.getElementById('edImageUrl').value.trim()||null;
    let code,id;
    if(editingId){code=editingId.code;id=editingId.id;}
    else{const cs=await fbGetAll('categories');const c=cs.find(x=>x.name===cat);id=Date.now().toString();code=(c?c.prefix:'ЗАП')+'-'+id.slice(-4);}
    const rec={id,code,title,category:cat,clearance:cl,tags:document.getElementById('edTags').value.trim(),source:document.getElementById('edSource').value.trim(),body,imageUrl,author:editingId?editingId.author:ME.name,updated:now(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    await fbSet('records/'+id,rec);
    await addJournal(editingId?'РЕДАКТИРОВАНИЕ':'СОЗДАНИЕ',code);
    msg('edMsg','✓ Запись '+code+' сохранена.',true);setTimeout(()=>viewRecord(rec),300);
  }catch(e){msg('edMsg',e.message,false);D('сохранение: '+e.message);}
}

/* ---------- КАТЕГОРИИ ---------- */
async function renderCats(){const cs=await fbGetAll('categories');document.getElementById('catList').innerHTML=cs.map(c=>'<div class="rec" style="cursor:default"><span class="code">'+esc(c.prefix)+'</span> │ '+esc(c.name)+'</div>').join('');}
async function addCategory(){
  const n=document.getElementById('newCatName').value.trim().toUpperCase(),p=document.getElementById('newCatPrefix').value.trim().toUpperCase()||'ЗАП';
  if(!n){msg('catMsg','Пустое имя.',false);return;}
  await fbSet('categories/'+n,{name:n,prefix:p});await addJournal('КАТЕГОРИЯ',n);
  msg('catMsg','✓ Добавлена.',true);fillCatSelect();renderCats();
}

/* ---------- СОВЕТ ---------- */
async function renderCouncil(){
  const box=document.getElementById('userList');
  if(ME.clearance<5){box.innerHTML='<p style="color:var(--err)">✖ Допуск 5.</p>';return;}
  const users=await fbGetAll('users');box.innerHTML='';
  users.forEach(u=>{
    const row=document.createElement('div');row.className='rec';row.style.cursor='default';
    row.innerHTML='<b>'+esc(u.name)+'</b> <span class="meta">'+esc(u.role)+' · '+esc(u.created||'')+'</span>';
    const line=document.createElement('div');line.className='row';
    const role=document.createElement('select');
    ['ПАДАВАН','РЫЦАРЬ','МАСТЕР','СОВЕТ','МАГИСТР'].forEach(r=>{const o=document.createElement('option');o.textContent=r;if(r===u.role)o.selected=true;role.appendChild(o);});
    role.onchange=async()=>{u.role=role.value;await fbSet('users/'+u.id,u);await addJournal('РОЛЬ',u.name);renderCouncil();};
    const cl=document.createElement('select');
    [1,2,3,4,5].forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent='допуск '+n;if(n===u.clearance)o.selected=true;cl.appendChild(o);});
    cl.onchange=async()=>{u.clearance=parseInt(cl.value);await fbSet('users/'+u.id,u);await addJournal('ДОПУСК',u.name);if(u.name===ME.name){ME=u;sessionStorage.setItem('kodex_me',JSON.stringify(ME));await enterMain();}renderCouncil();};
    const pin=document.createElement('input');pin.type='password';pin.placeholder='новый PIN (мин. 4)';
    const sp=document.createElement('button');sp.type='button';sp.textContent='СМЕНИТЬ PIN';
    sp.onclick=async()=>{const v=pin.value;if(v.length<4){msg('councilMsg','PIN минимум 4 знака.',false);return;}
      u.salt=salt();u.pinHash=await hashPin(v,u.salt);await fbSet('users/'+u.id,u);await addJournal('СМЕНА PIN',u.name);
      if(u.name===ME.name){ME=u;sessionStorage.setItem('kodex_me',JSON.stringify(ME));}
      pin.value='';msg('councilMsg','✓ PIN обновлён: '+u.name,true);renderCouncil();};
    const rm=document.createElement('button');rm.type='button';rm.className='danger';rm.textContent='✖ УДАЛИТЬ';
    rm.onclick=async()=>{
      if(u.name===ME.name){msg('councilMsg','Себя удалить нельзя.',false);return;}
      if(u.clearance>=5&&users.filter(x=>x.clearance>=5).length<=1){msg('councilMsg','Последний Магистр.',false);return;}
      if(!confirm('Удалить '+u.name+'?'))return;
      await fbDelete('users/'+u.id);await addJournal('УДАЛЕНИЕ ОПЕРАТОРА',u.name);renderCouncil();};
    line.appendChild(role);line.appendChild(cl);row.appendChild(line);row.appendChild(pin);
    const bl=document.createElement('div');bl.appendChild(sp);bl.appendChild(rm);row.appendChild(bl);box.appendChild(row);
  });
}
async function addUser(){
  try{
    if(ME.clearance<5)throw new Error('Допуск 5 нужен.');
    const n=document.getElementById('nuName').value.trim(),p=document.getElementById('nuPin').value,cl=parseInt(document.getElementById('nuClear').value);
    if(!n||p.length<4)throw new Error('Имя и PIN (мин. 4).');
    const users=await fbGetAll('users');
    if(users.some(u=>u.name.toLowerCase()===n.toLowerCase()))throw new Error('Имя занято.');
    const s=salt();const id=n.replace(/\s+/g,'_');
    await fbSet('users/'+id,{name:n,role:document.getElementById('nuRole').value,clearance:cl,salt:s,pinHash:await hashPin(p,s),created:now()});
    await addJournal('НОВЫЙ ОПЕРАТОР',n);
    document.getElementById('nuName').value='';document.getElementById('nuPin').value='';
    msg('councilMsg','✓ Добавлен.',true);renderCouncil();
  }catch(e){msg('councilMsg',e.message,false);}
}

/* ---------- ЖУРНАЛ ---------- */
async function addJournal(action,detail){
  try{
    const id=Date.now().toString()+Math.random().toString(36).slice(2);
    await fbSet('journal/'+id,{ts:now(),op:ME?ME.name:'система',action,detail:detail||''});
  }catch(e){D('журнал: '+e.message);}
}
async function renderJournal(){
  const box=document.getElementById('journalList');
  if(ME.clearance<4){box.innerHTML='<p style="color:var(--err)">✖ Допуск 4+.</p>';return;}
  const j=await fbGetAll('journal');
  j.sort((a,b)=>(b.ts||'').localeCompare(a.ts||''));
  box.innerHTML=j.slice(0,150).map(x=>'<div class="journal-line">'+esc(x.ts)+' │ '+esc(x.op)+' │ '+esc(x.action)+' │ '+esc(x.detail)+'</div>').join('')||'<p class="meta">Пусто.</p>';
}

/* ---------- ОБНОВЛЕНИЕ ---------- */
async function forceUpdate(){
  try{
    if('serviceWorker' in navigator){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}
    if(window.caches){for(const k of await caches.keys())await caches.delete(k);}
    location.reload();
  }catch(e){alert(e.message);}
}

/* ---------- СТАРТ ---------- */
(async()=>{
  D('инициализация КОДЕКСА Firebase Compat…');
  try{
    await auth.signInAnonymously();
    D('анонимная авторизация выполнена');
    await ensureMaster();initEditor();
    const saved=sessionStorage.getItem('kodex_me');
    if(saved){
      ME=JSON.parse(saved);
      const users=await fbGetAll('users');
      const u=users.find(x=>x.name===ME.name);
      if(u&&u.pinHash===ME.pinHash){await enterMain();D('сессия восстановлена');return;}
      sessionStorage.removeItem('kodex_me');
    }
  }catch(e){D('ОШИБКА СТАРТА: '+e.message);msg('authMsg','Ошибка подключения к базе: '+e.message,false);}
})();

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').then(r=>{r.update();setInterval(()=>r.update(),60000);}).catch(e=>D('SW: '+e.message));
  let once=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(once)return;once=true;location.reload();});
}
