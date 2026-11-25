// === KONDEX PWA APP ===
const DB_NAME = 'KodexDB';
const DB_VERSION = 1;
let db, editingId = null;
const PIN = localStorage.getItem('kodex_pin') || '1234'; // PIN по умолчанию

// Инициализация IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('records')) d.createObjectStore('records', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('categories')) d.createObjectStore('categories', { keyPath: 'name' });
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}

// CRUD операции
function dbPut(store, data) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(data);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

function dbGetAll(store) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function dbDelete(store, key) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// Утилиты
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function msg(id, t, ok) { const el = document.getElementById(id); el.textContent = t; el.className = 'msg ' + (ok ? 'ok' : 'err'); setTimeout(() => el.className = 'msg', 5000); }
function D(t) { const el = document.getElementById('diag'); const d = document.createElement('div'); d.textContent = new Date().toLocaleTimeString() + ' › ' + t; el.appendChild(d); el.scrollTop = el.scrollHeight; }
function now() { return new Date().toLocaleString('ru-RU'); }
function execCmd(cmd, val = null) { document.execCommand(cmd, false, val); document.getElementById('edBody').focus(); }

// Вход
async function login() {
  const p = document.getElementById('loginPass').value;
  if (p === PIN) {
    sessionStorage.setItem('kodex_auth', 'true');
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainScreen').classList.remove('hidden');
    await initApp();
  } else {
    msg('authMsg', 'Неверный PIN-код', false);
  }
}

function logout() {
  sessionStorage.removeItem('kodex_auth');
  location.reload();
}

// Инициализация
async function initApp() {
  await openDB();
  // Создаём категории если пусто
  const cats = await dbGetAll('categories');
  if (cats.length === 0) {
    await dbPut('categories', { name: 'ДОСЬЕ', prefix: 'ДОС' });
    await dbPut('categories', { name: 'АНОМАЛИЯ', prefix: 'АНО' });
    await dbPut('categories', { name: 'АРТЕФАКТ', prefix: 'АРТ' });
  }
  fillCatSelect();
  showTab('list');
}

// Табы
const TABS = ['list', 'view', 'editor', 'cats'];
function showTabRaw(t) { TABS.forEach(x => document.getElementById('tab-' + x).classList.toggle('hidden', x !== t)); }
function showTab(t) {
  showTabRaw(t);
  if (t === 'list') renderList();
  if (t === 'cats') renderCats();
}

// Список записей
async function renderList() {
  const q = (document.getElementById('searchBox').value || '').toLowerCase();
  const box = document.getElementById('recList'); box.innerHTML = '';
  const recs = await dbGetAll('records');
  recs.sort((a, b) => b.id - a.id);
  for (const r of recs) {
    if (q && !((r.title + r.tags + r.code).toLowerCase().includes(q))) continue;
    const div = document.createElement('div'); div.className = 'rec';
    div.innerHTML = '<span class="code">' + esc(r.code) + '</span> │ <b>' + esc(r.title) + '</b><div class="meta">' + esc(r.category) + ' · ' + esc(r.updated) + '</div>';
    div.onclick = () => viewRecord(r);
    box.appendChild(div);
  }
  if (!box.children.length) box.innerHTML = '<p class="meta">Архив пуст.</p>';
}

// Просмотр
async function viewRecord(r) {
  const vc = document.getElementById('viewContent');
  vc.innerHTML = '<h2 style="color:var(--holo2)">' + esc(r.code) + ' ══ ' + esc(r.title) + '</h2>' +
    '<div class="meta">' + esc(r.category) + ' · автор: ' + esc(r.author) + ' · ' + esc(r.updated) + '</div>' +
    '<div>' + (r.tags || '').split(',').filter(t => t.trim()).map(t => '<span class="tag">' + esc(t.trim()) + '</span>').join('') + '</div>' +
    (r.source ? '<div class="meta">Источник: ' + esc(r.source) + '</div>' : '') +
    '<div class="body-text">' + r.body + '</div>' +
    (r.image ? '<img src="' + r.image + '" class="img-dossier">' : '') +
    '<div style="margin-top:10px"><button onclick="openEditor(' + JSON.stringify(r).replace(/"/g, '&quot;') + ')">✎ РЕДАКТИРОВАТЬ</button> <button class="danger" onclick="deleteRecord(\'' + r.id + '\')">✖ УДАЛИТЬ</button></div>';
  showTabRaw('view');
}

async function deleteRecord(id) {
  if (!confirm('Удалить?')) return;
  await dbDelete('records', id);
  showTab('list');
}

// Редактор
function fillCatSelect() {
  dbGetAll('categories').then(cats => {
    const s = document.getElementById('edCat'); s.innerHTML = '';
    cats.forEach(c => { const o = document.createElement('option'); o.value = c.name; o.textContent = c.name; s.appendChild(o); });
  });
}

async function openEditor(r) {
  editingId = r || null;
  document.getElementById('editorTitle').textContent = r ? '─── РЕДАКТИРОВАНИЕ ' + r.code + ' ───' : '─── НОВАЯ ЗАПИСЬ ───';
  document.getElementById('edTitle').value = r ? r.title : '';
  document.getElementById('edCat').value = r ? r.category : 'ДОСЬЕ';
  document.getElementById('edClear').value = r ? r.clearance : 3;
  document.getElementById('edTags').value = r ? r.tags : '';
  document.getElementById('edSource').value = r ? r.source : '';
  document.getElementById('edBody').innerHTML = r ? r.body : '';
  document.getElementById('edFile').value = '';
  const p = document.getElementById('imgPreview');
  if (r && r.image) { p.src = r.image; p.style.display = 'block'; } else { p.style.display = 'none'; p.src = ''; }
  showTabRaw('editor');
}

// Превью фото
document.getElementById('edFile').addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const p = document.getElementById('imgPreview');
    p.src = ev.target.result; p.style.display = 'block';
  };
  reader.readAsDataURL(file);
});

// Сохранение
async function saveRecord() {
  const title = document.getElementById('edTitle').value.trim();
  if (!title) { msg('edMsg', 'Пустое название', false); return; }

  let image = editingId ? editingId.image : null;
  const fileInput = document.getElementById('edFile');
  if (fileInput.files.length > 0) {
    image = await new Promise(res => {
      const r = new FileReader();
      r.onload = (e) => res(e.target.result);
      r.readAsDataURL(fileInput.files[0]);
    });
  }

  const cat = document.getElementById('edCat').value;
  const cl = parseInt(document.getElementById('edClear').value);
  const tags = document.getElementById('edTags').value.trim();
  const source = document.getElementById('edSource').value.trim();
  const body = document.getElementById('edBody').innerHTML;

  let code, id;
  if (editingId) { code = editingId.code; id = editingId.id; }
  else {
    const cats = await dbGetAll('categories');
    const c = cats.find(x => x.name === cat);
    const pr = c ? c.prefix : 'ЗАП';
    id = Date.now(); code = pr + '-' + String(id).slice(-4);
  }

  const rec = { id, code, title, category: cat, clearance: cl, tags, source, body, image, author: 'Аранэль Хальдарон', updated: now() };
  await dbPut('records', rec);
  msg('edMsg', '✓ Сохранено', true);
  setTimeout(() => viewRecord(rec), 400);
}

// Категории
async function renderCats() {
  const cats = await dbGetAll('categories');
  document.getElementById('catList').innerHTML = cats.map(c => '<div class="rec"><span class="code">' + esc(c.prefix) + '</span> │ ' + esc(c.name) + '</div>').join('');
}

async function addCategory() {
  const n = document.getElementById('newCatName').value.trim().toUpperCase();
  const p = document.getElementById('newCatPrefix').value.trim().toUpperCase() || 'ЗАП';
  if (!n) { msg('catMsg', 'Пустое имя', false); return; }
  await dbPut('categories', { name: n, prefix: p });
  msg('catMsg', '✓ Добавлена', true);
  fillCatSelect(); renderCats();
}

// Экспорт / Импорт
async function exportData() {
  const records = await dbGetAll('records');
  const categories = await dbGetAll('categories');
  const data = { records, categories, exported: now() };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'kodex_backup_' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  D('Экспорт завершён');
}

function importData() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      for (const r of data.records || []) await dbPut('records', r);
      for (const c of data.categories || []) await dbPut('categories', c);
      D('Импорт завершён: ' + (data.records || []).length + ' записей');
      alert('Архив обновлён!');
      renderList();
    } catch (err) { alert('Ошибка импорта: ' + err.message); }
  };
  input.click();
}

// Старт
(async () => {
  D('Инициализация КОДЕКСА PWA...');
  if (sessionStorage.getItem('kodex_auth') === 'true') {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainScreen').classList.remove('hidden');
    await initApp();
  }
})();

// Регистрация Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js');
}
