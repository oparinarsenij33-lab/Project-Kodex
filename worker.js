// ═══════════════════════════════════════════════════════════
//  КОДЕКС v2 — АРХИВ ОРДЕНА ВОЛЬНЫХ ДЖЕДАЕВ
//  Cloudflare Worker + D1. Криптография на клиенте, CPU < 10 мс.
//  Биндинги: DB (D1), ASSETS (статика). /api/salt уже встроен.
// ═══════════════════════════════════════════════════════════
const now = () => new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
function json(d, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } }); }
async function log(env, op, action, detail) {
  await env.DB.prepare("INSERT INTO journal(ts,op,action,detail) VALUES(?,?,?,?)").bind(now(), op, action, detail || "").run();
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (!p.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (p === "/api/status") {
        const r = await env.DB.prepare("SELECT COUNT(*) c FROM users").first();
        return json({ initialized: r.c > 0 });
      }
      if (p === "/api/salt") {
        const nm = url.searchParams.get("name") || "";
        const u = await env.DB.prepare("SELECT salt FROM users WHERE name=?").bind(nm).first();
        return json({ salt: u ? u.salt : null });
      }
      if (p === "/api/setup" && request.method === "POST") {
        const r = await env.DB.prepare("SELECT COUNT(*) c FROM users").first();
        if (r.c > 0) return json({ error: "Совет уже создан." }, 400);
        const { name, verifier, salt } = await request.json();
        if (!name || !verifier || !salt) return json({ error: "Неполные данные." }, 400);
        await env.DB.prepare("INSERT INTO users(name,role,clearance,salt,verifier,created) VALUES(?,?,?,?,?,?)")
          .bind(name, "МАГИСТР", 5, salt, verifier, now()).run();
        await log(env, name, "ПЕРВОЕ ПРОБУЖДЕНИЕ");
        return json({ ok: true });
      }
      if (p === "/api/login" && request.method === "POST") {
        const { name, verifier } = await request.json();
        const u = await env.DB.prepare("SELECT * FROM users WHERE name=?").bind(name || "").first();
        if (!u || u.verifier !== verifier) {
          await log(env, name || "?", "ОТКАЗ ДОСТУПА");
          return json({ error: "Доступ отклонён. Сила не чувствует тебя…" }, 401);
        }
        const token = hex(crypto.getRandomValues(new Uint8Array(32)));
        await env.DB.prepare("INSERT INTO sessions(token,name,vault_key,expires) VALUES(?,?,?,?)")
          .bind(token, u.name, "", Date.now() + 12 * 3600 * 1000).run();
        await log(env, u.name, "ВХОД");
        return json({ token, name: u.name, role: u.role, clearance: u.clearance, salt: u.salt });
      }
      const token = request.headers.get("x-token");
      const s = token && await env.DB.prepare("SELECT * FROM sessions WHERE token=?").bind(token).first();
      if (!s || s.expires < Date.now()) return json({ error: "Сеанс истёк. Войдите заново." }, 401);
      const user = await env.DB.prepare("SELECT * FROM users WHERE name=?").bind(s.name).first();

      if (p === "/api/logout" && request.method === "POST") {
        await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
        await log(env, user.name, "ВЫХОД"); return json({ ok: true });
      }
      if (p === "/api/categories" && request.method === "GET")
        return json((await env.DB.prepare("SELECT * FROM categories ORDER BY name").all()).results);
      if (p === "/api/categories" && request.method === "POST") {
        const { name, prefix } = await request.json();
        const n = (name || "").toUpperCase().trim(), pr = (prefix || "ЗАП").toUpperCase().slice(0, 3);
        if (!n) return json({ error: "Пустое имя категории." }, 400);
        try { await env.DB.prepare("INSERT INTO categories VALUES(?,?)").bind(n, pr).run(); }
        catch (e) { return json({ error: "Категория уже существует." }, 400); }
        await log(env, user.name, "НОВАЯ КАТЕГОРИЯ", n); return json({ ok: true });
      }
      if (p === "/api/records" && request.method === "GET") {
        const r = await env.DB.prepare("SELECT id,code,title,category,clearance,tags,source,author,created,updated FROM records ORDER BY id DESC").all();
        return json(r.results.map(x => x.clearance > user.clearance ? { id: x.id, locked: true, clearance: x.clearance } : x));
      }
      if (p === "/api/records" && request.method === "POST") {
        const { title, category, clearance, tags, source, body_enc } = await request.json();
        if (!title || !body_enc) return json({ error: "Пустое название или тело." }, 400);
        const cl = Math.max(1, Math.min(5, parseInt(clearance) || 1));
        const cat = category || "ДОСЬЕ";
        const c = await env.DB.prepare("SELECT prefix FROM categories WHERE name=?").bind(cat).first();
        const pr = c ? c.prefix : "ЗАП";
        const cnt = await env.DB.prepare("SELECT COUNT(*) c FROM records").first();
        let n = cnt.c + 1, code;
        while (true) {
          code = pr + "-" + String(n).padStart(4, "0");
          if (!(await env.DB.prepare("SELECT 1 FROM records WHERE code=?").bind(code).first())) break;
          n++;
        }
        const res = await env.DB.prepare("INSERT INTO records(code,title,category,clearance,tags,body_enc,source,author,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)")
          .bind(code, title, cat, cl, tags || "", body_enc, source || "", user.name, now(), now()).run();
        await log(env, user.name, "СОЗДАНИЕ", code);
        return json({ id: res.meta.last_row_id, code });
      }
      const recMatch = p.match(/^\/api\/records\/(\d+)$/);
      if (recMatch) {
        const id = parseInt(recMatch[1]);
        const r = await env.DB.prepare("SELECT * FROM records WHERE id=?").bind(id).first();
        if (!r) return json({ error: "Запись не найдена." }, 404);
        if (r.clearance > user.clearance) { await log(env, user.name, "ПОПЫТКА ДОСТУПА", r.code); return json({ error: "Недостаточный допуск." }, 403); }
        if (request.method === "GET") {
          await log(env, user.name, "ЧТЕНИЕ", r.code);
          const files = await env.DB.prepare("SELECT id,filename,size,sha256 FROM attachments WHERE record_id=?").bind(id).all();
          return json({ ...r, files: files.results });
        }
        if (request.method === "PUT") {
          const { title, category, clearance, tags, source, body_enc } = await request.json();
          const cl = Math.max(1, Math.min(5, parseInt(clearance) || r.clearance));
          await env.DB.prepare("UPDATE records SET title=?,category=?,clearance=?,tags=?,source=?,body_enc=?,updated=? WHERE id=?")
            .bind(title || r.title, category || r.category, cl, tags ?? r.tags, source ?? r.source, body_enc || r.body_enc, now(), id).run();
          await log(env, user.name, "РЕДАКТИРОВАНИЕ", r.code); return json({ ok: true });
        }
        if (request.method === "DELETE") {
          if (user.clearance < Math.max(4, r.clearance)) return json({ error: "Удаление требует допуск 4+." }, 403);
          await env.DB.prepare("DELETE FROM attachments WHERE record_id=?").bind(id).run();
          await env.DB.prepare("DELETE FROM records WHERE id=?").bind(id).run();
          await log(env, user.name, "УДАЛЕНИЕ", r.code); return json({ ok: true });
        }
      }
      const upMatch = p.match(/^\/api\/records\/(\d+)\/files$/);
      if (upMatch && request.method === "POST") {
        const id = parseInt(upMatch[1]);
        const r = await env.DB.prepare("SELECT * FROM records WHERE id=?").bind(id).first();
        if (!r) return json({ error: "Запись не найдена." }, 404);
        if (r.clearance > user.clearance) return json({ error: "Недостаточный допуск." }, 403);
        const form = await request.formData();
        let count = 0;
        for (const f of form.getAll("files")) {
          if (typeof f === "string") continue;
          if (f.size > 4 * 1024 * 1024) return json({ error: "Файл " + f.name + " больше 4 МБ." }, 400);
          const buf = await f.arrayBuffer();
          const h = hex(await crypto.subtle.digest("SHA-256", buf));
          const a = new Uint8Array(buf); let bs = "";
          for (let i = 0; i < a.length; i += 8192) bs += String.fromCharCode(...a.subarray(i, i + 8192));
          await env.DB.prepare("INSERT INTO attachments(record_id,filename,sha256,size,data) VALUES(?,?,?,?,?)")
            .bind(id, f.name, h, buf.byteLength, btoa(bs)).run();
          await log(env, user.name, "ВЛОЖЕНИЕ", r.code + ":" + f.name); count++;
        }
        return json({ ok: true, count });
      }
      const fileMatch = p.match(/^\/api\/files\/(\d+)(\/check)?$/);
      if (fileMatch) {
        const a = await env.DB.prepare("SELECT a.*, r.clearance, r.code FROM attachments a JOIN records r ON r.id=a.record_id WHERE a.id=?")
          .bind(parseInt(fileMatch[1])).first();
        if (!a) return json({ error: "Файл не найден." }, 404);
        if (a.clearance > user.clearance) return json({ error: "Недостаточный допуск." }, 403);
        const bytes = Uint8Array.from(atob(a.data), c => c.charCodeAt(0));
        if (fileMatch[2]) {
          const h = hex(await crypto.subtle.digest("SHA-256", bytes));
          const ok = h === a.sha256;
          await log(env, user.name, ok ? "ПРОВЕРКА ФАЙЛА OK" : "ЦЕЛОСТНОСТЬ НАРУШЕНА", a.filename);
          return json({ ok, sha256: a.sha256 });
        }
        await log(env, user.name, "СКАЧИВАНИЕ", a.code + ":" + a.filename);
        return new Response(bytes, { headers: { "Content-Type": "application/octet-stream",
          "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(a.filename) } });
      }
      if (p === "/api/journal") {
        if (user.clearance < 4) return json({ error: "Журнал доступен с допуска 4." }, 403);
        return json((await env.DB.prepare("SELECT * FROM journal ORDER BY id DESC LIMIT 200").all()).results);
      }
      if (p === "/api/users" && request.method === "GET") {
        if (user.clearance < 5) return json({ error: "Только Совет." }, 403);
        return json((await env.DB.prepare("SELECT name,role,clearance,created FROM users").all()).results);
      }
      if (p === "/api/users" && request.method === "POST") {
        if (user.clearance < 5) return json({ error: "Только Совет." }, 403);
        const { name, verifier, salt, role, clearance } = await request.json();
        if (!name || !verifier || !salt) return json({ error: "Неполные данные." }, 400);
        try {
          await env.DB.prepare("INSERT INTO users(name,role,clearance,salt,verifier,wrapped_vault,created) VALUES(?,?,?,?,?,?,?)")
            .bind(name, role || "РЫЦАРЬ", Math.max(1, Math.min(5, parseInt(clearance) || 2)), salt, verifier, null, now()).run();
        } catch (e) { return json({ error: "Имя уже занято." }, 400); }
        await log(env, user.name, "НОВЫЙ ОПЕРАТОР", name); return json({ ok: true });
      }
      const userMatch = p.match(/^\/api\/users\/(.+)$/);
      if (userMatch && request.method === "PUT") {
        if (user.clearance < 5) return json({ error: "Только Совет." }, 403);
        const nm = decodeURIComponent(userMatch[1]);
        const cl = Math.max(1, Math.min(5, parseInt((await request.json()).clearance) || 1));
        await env.DB.prepare("UPDATE users SET clearance=? WHERE name=?").bind(cl, nm).run();
        await log(env, user.name, "СМЕНА ДОПУСКА", nm + "→" + cl); return json({ ok: true });
      }
      if (p === "/api/backup") {
        if (user.clearance < 5) return json({ error: "Только Магистр." }, 403);
        const data = {
          records: (await env.DB.prepare("SELECT * FROM records").all()).results,
          categories: (await env.DB.prepare("SELECT * FROM categories").all()).results,
          exported: now()
        };
        await log(env, user.name, "РЕЗЕРВНАЯ КОПИЯ"); return json(data);
      }
      return json({ error: "Путь не найден." }, 404);
    } catch (e) { return json({ error: "Ошибка Храма: " + e.message }, 500); }
  }
};
