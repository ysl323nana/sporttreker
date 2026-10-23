const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'db.json');

const EXERCISES = [
  ['Приседания со штангой', 'Ноги', 'Базовое упражнение для квадрицепсов и ягодиц.', 'Штанга на трапециях, стопы на ширине плеч. Опуститесь до параллели бёдер с полом, спина прямая, вставайте на выдохе.'],
  ['Приседания с собственным весом', 'Ноги', 'Лёгкий вариант для разминки и дома.', 'Руки перед собой, колени смотрят туда же, куда носки. Опускайтесь медленно, пятки не отрывайте.'],
  ['Выпады', 'Ноги', 'Работа ног и баланса.', 'Шагните вперёд, опустите заднее колено к полу, оттолкнитесь передней ногой и вернитесь.'],
  ['Жим лёжа', 'Грудь', 'Главное упражнение на грудные мышцы.', 'Лопатки сведены, штанга опускается к середине груди, жмите вверх без отрыва таза от скамьи.'],
  ['Отжимания', 'Грудь', 'Грудь, плечи и трицепс без оборудования.', 'Тело прямое от головы до пяток, локти под углом 45°, опуститесь до касания грудью пола.'],
  ['Разводка гантелей', 'Грудь', 'Изолированная нагрузка на грудь.', 'Лёжа, руки слегка согнуты. Разводите гантели дугой и сводите над грудью.'],
  ['Становая тяга', 'Спина', 'Тяжёлая база для спины и ног.', 'Штанга у голеней, спина ровная. Тяните, разгибая ноги и таз одновременно.'],
  ['Подтягивания', 'Спина', 'Ширина спины и сила рук.', 'Хват чуть шире плеч, тянитесь грудью к перекладине, опускайтесь полностью.'],
  ['Тяга гантели в наклоне', 'Спина', 'Толщина спины, каждая сторона отдельно.', 'Упритесь рукой в скамью, тяните гантель к поясу, локоть вдоль тела.'],
  ['Жим гантелей сидя', 'Плечи', 'Развивает дельты.', 'Гантели у плеч, выжимайте вверх до почти прямых рук и опускайте под контролем.'],
  ['Махи в стороны', 'Плечи', 'Средняя дельта.', 'Лёгкие гантели, поднимайте руки до уровня плеч, локти чуть согнуты.'],
  ['Сгибания на бицепс', 'Руки', 'Классика для бицепса.', 'Локти прижаты к корпусу, поднимайте гантели без раскачки.'],
  ['Французский жим', 'Руки', 'Нагрузка на трицепс.', 'Лёжа, опускайте штангу к ушам, сгибая только локти.'],
  ['Планка', 'Пресс', 'Статичное упражнение для кора.', 'Опора на предплечья, тело прямое, живот напряжён. Фиксируйте время.'],
  ['Скручивания', 'Пресс', 'Прямая мышца живота.', 'Лёжа, ноги согнуты, поднимайте лопатки от пола, поясница прижата.'],
  ['Бег', 'Кардио', 'Выносливость и сердце.', 'Держите ровный темп, дышите свободно. Фиксируйте дистанцию и время.'],
  ['Скакалка', 'Кардио', 'Быстрое кардио в любом месте.', 'Прыгайте на носках, запястья крутят скакалку, колени мягкие.'],
].map((e, i) => ({
  id: i + 1, name: e[0], group: e[1], description: e[2], instruction: e[3],
  videoUrl: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(e[0] + ' техника выполнения'),
}));

let db = { seq: 1, users: [], workouts: [], sessions: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch (e) { }
const persist = () => {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
};
const nextId = () => db.seq++;
const reply = (status, data) => ({ __reply: true, status, data });

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
const hashPass = (pass, salt = crypto.randomBytes(16).toString('hex')) =>
  salt + ':' + crypto.scryptSync(pass, salt, 32).toString('hex');
const checkPass = (pass, stored) => {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(pass, salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, age: u.age, weight: u.weight, goal: u.goal, createdAt: u.createdAt });
const num = (v, name) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `Поле «${name}» должно быть неотрицательным числом`);
  return n;
};

const hasResult = (i) => i.reps + i.weight + i.time + i.dist > 0;
const itemPoints = (i) => hasResult(i) ? 10 + i.reps + Math.floor(i.time / 60) + Math.floor(i.dist / 100) : 0;
const workoutPoints = (w) => w.items.reduce((a, i) => a + itemPoints(i), 0);
const exById = (id) => EXERCISES.find((e) => e.id === Number(id));

function userStats(userId) {
  const ws = db.workouts.filter((w) => w.userId === userId);
  const done = ws.filter((w) => w.items.some(hasResult));
  const items = done.flatMap((w) => w.items.filter(hasResult));
  const points = ws.reduce((a, w) => a + workoutPoints(w), 0);
  const byGroup = {};
  items.forEach((i) => { const g = exById(i.exerciseId).group; byGroup[g] = (byGroup[g] || 0) + 1; });
  const achievements = [
    ['first', 'Первый шаг', done.length >= 1],
    ['five', 'Пятёрка', done.length >= 5],
    ['hundred', 'Сотня', points >= 100],
    ['universal', 'Универсал', Object.keys(byGroup).length >= 4],
    ['iron', 'Железо', items.some((i) => i.weight >= 50)],
  ].map(([id, title, earned]) => ({ id, title, earned }));
  return {
    points, level: Math.floor(points / 100) + 1, pointsToNextLevel: 100 - (points % 100),
    workoutsTotal: ws.length, workoutsCompleted: done.length, exercisesCompleted: items.length,
    totalReps: items.reduce((a, i) => a + i.reps, 0),
    totalVolumeKg: items.reduce((a, i) => a + i.reps * i.weight, 0),
    totalTimeSec: items.reduce((a, i) => a + i.time, 0),
    totalDistanceM: items.reduce((a, i) => a + i.dist, 0),
    byGroup, achievements,
    history: done.sort((a, b) => a.date.localeCompare(b.date)).map((w) => ({ workoutId: w.id, name: w.name, date: w.date, points: workoutPoints(w) })),
  };
}
const rating = () => db.users
  .map((u) => ({ userId: u.id, name: u.name, points: userStats(u.id).points }))
  .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  .map((r, i) => ({ rank: i + 1, ...r }));

function validateUser(b, { partial = false } = {}) {
  const out = {};
  if (!partial || b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim()) throw new HttpError(400, 'Укажите имя');
    out.name = b.name.trim().slice(0, 60);
  }
  if (!partial || b.email !== undefined) {
    if (typeof b.email !== 'string' || !/^\S+@\S+\.\S+$/.test(b.email.trim())) throw new HttpError(400, 'Введите корректную почту');
    out.email = b.email.trim().toLowerCase();
  }
  if (!partial || b.password !== undefined) {
    if (typeof b.password !== 'string' || b.password.length < 6) throw new HttpError(400, 'Пароль должен быть не короче 6 символов');
    out.password = b.password;
  }
  if (b.age !== undefined) out.age = b.age === '' || b.age === null ? null : num(b.age, 'age');
  if (b.weight !== undefined) out.weight = b.weight === '' || b.weight === null ? null : num(b.weight, 'weight');
  if (b.goal !== undefined) out.goal = String(b.goal).slice(0, 200);
  return out;
}
const workoutView = (w) => ({
  id: w.id, name: w.name, date: w.date, points: workoutPoints(w),
  items: w.items.map((i) => ({ ...i, exercise: exById(i.exerciseId)?.name, group: exById(i.exerciseId)?.group })),
});
const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

function ownWorkout(ctx) {
  const w = db.workouts.find((x) => x.id === Number(ctx.params.id));
  if (!w) throw new HttpError(404, 'Тренировка не найдена');
  if (w.userId !== ctx.user.id) throw new HttpError(403, 'Это чужая тренировка');
  return w;
}
function ownUserParam(ctx) {
  const id = Number(ctx.params.id);
  if (id !== ctx.user.id) throw new HttpError(403, 'Можно изменять только свой профиль');
  return db.users.find((u) => u.id === id);
}

const routes = [];
const route = (method, pattern, auth, handler) => routes.push({
  method, pattern, auth, handler,
  re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$'),
});

route('POST', '/api/auth/register', false, (ctx) => {
  const u = validateUser(ctx.body);
  if (db.users.some((x) => x.email === u.email)) throw new HttpError(409, 'Такая почта уже зарегистрирована');
  const user = { id: nextId(), name: u.name, email: u.email, pass: hashPass(u.password), age: u.age ?? null, weight: u.weight ?? null, goal: u.goal ?? '', createdAt: new Date().toISOString() };
  db.users.push(user);
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = user.id;
  persist();
  return reply(201, { token, user: publicUser(user) });
});
route('POST', '/api/auth/login', false, (ctx) => {
  const email = String(ctx.body.email || '').trim().toLowerCase();
  const user = db.users.find((u) => u.email === email);
  if (!user || !checkPass(String(ctx.body.password || ''), user.pass)) throw new HttpError(401, 'Неверная почта или пароль');
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = user.id;
  persist();
  return { token, user: publicUser(user) };
});
route('POST', '/api/auth/logout', true, (ctx) => { delete db.sessions[ctx.token]; persist(); return { ok: true }; });
route('GET', '/api/me', true, (ctx) => publicUser(ctx.user));

route('GET', '/api/users', true, () => db.users.map((u) => ({ id: u.id, name: u.name })));
route('GET', '/api/users/:id', true, (ctx) => {
  const u = db.users.find((x) => x.id === Number(ctx.params.id));
  if (!u) throw new HttpError(404, 'Пользователь не найден');
  return u.id === ctx.user.id ? publicUser(u) : { id: u.id, name: u.name, goal: u.goal };
});
route('PUT', '/api/users/:id', true, (ctx) => {
  const u = ownUserParam(ctx);
  const upd = validateUser(ctx.body, { partial: true });
  if (upd.email && db.users.some((x) => x.email === upd.email && x.id !== u.id)) throw new HttpError(409, 'Такая почта уже занята');
  if (upd.password) { u.pass = hashPass(upd.password); delete upd.password; }
  Object.assign(u, upd);
  persist();
  return publicUser(u);
});
route('DELETE', '/api/users/:id', true, (ctx) => {
  const u = ownUserParam(ctx);
  db.users = db.users.filter((x) => x.id !== u.id);
  db.workouts = db.workouts.filter((w) => w.userId !== u.id);
  for (const t of Object.keys(db.sessions)) if (db.sessions[t] === u.id) delete db.sessions[t];
  persist();
  return reply(204);
});

route('GET', '/api/exercises', true, (ctx) => {
  const q = (ctx.query.get('q') || '').toLowerCase(), g = (ctx.query.get('group') || '').toLowerCase();
  return EXERCISES.filter((e) => (!q || e.name.toLowerCase().includes(q)) && (!g || e.group.toLowerCase() === g));
});
route('GET', '/api/exercises/:id', true, (ctx) => {
  const e = exById(ctx.params.id);
  if (!e) throw new HttpError(404, 'Упражнение не найдено');
  return e;
});

route('GET', '/api/workouts', true, (ctx) =>
  db.workouts.filter((w) => w.userId === ctx.user.id).sort((a, b) => b.date.localeCompare(a.date)).map(workoutView));
route('POST', '/api/workouts', true, (ctx) => {
  const b = ctx.body;
  const date = b.date === undefined ? new Date().toISOString().slice(0, 10) : b.date;
  if (!validDate(date)) throw new HttpError(400, 'Дата должна быть в формате ГГГГ-ММ-ДД');
  const w = { id: nextId(), userId: ctx.user.id, name: String(b.name || 'Тренировка').trim().slice(0, 80) || 'Тренировка', date, items: [] };
  db.workouts.push(w);
  persist();
  return reply(201, workoutView(w));
});
route('GET', '/api/workouts/:id', true, (ctx) => workoutView(ownWorkout(ctx)));
route('PUT', '/api/workouts/:id', true, (ctx) => {
  const w = ownWorkout(ctx), b = ctx.body;
  if (b.name !== undefined) w.name = String(b.name).trim().slice(0, 80) || w.name;
  if (b.date !== undefined) { if (!validDate(b.date)) throw new HttpError(400, 'Дата должна быть в формате ГГГГ-ММ-ДД'); w.date = b.date; }
  persist();
  return workoutView(w);
});
route('DELETE', '/api/workouts/:id', true, (ctx) => {
  const w = ownWorkout(ctx);
  db.workouts = db.workouts.filter((x) => x !== w);
  persist();
  return reply(204);
});
route('POST', '/api/workouts/:id/exercises', true, (ctx) => {
  const w = ownWorkout(ctx);
  if (!exById(ctx.body.exerciseId)) throw new HttpError(404, 'Упражнение не найдено');
  const item = { id: nextId(), exerciseId: Number(ctx.body.exerciseId), reps: 0, weight: 0, time: 0, dist: 0 };
  w.items.push(item);
  persist();
  return reply(201, workoutView(w));
});
route('DELETE', '/api/workouts/:id/exercises/:itemId', true, (ctx) => {
  const w = ownWorkout(ctx);
  const i = w.items.findIndex((x) => x.id === Number(ctx.params.itemId));
  if (i < 0) throw new HttpError(404, 'Упражнение в тренировке не найдено');
  w.items.splice(i, 1);
  persist();
  return workoutView(w);
});
route('PUT', '/api/workouts/:id/exercises/:itemId/result', true, (ctx) => {
  const w = ownWorkout(ctx);
  const item = w.items.find((x) => x.id === Number(ctx.params.itemId));
  if (!item) throw new HttpError(404, 'Упражнение в тренировке не найдено');
  const b = ctx.body;
  const next = { reps: item.reps, weight: item.weight, time: item.time, dist: item.dist };
  for (const f of ['reps', 'weight', 'time', 'dist']) if (b[f] !== undefined) next[f] = num(b[f], f);
  Object.assign(item, next);
  persist();
  return workoutView(w);
});

route('GET', '/api/stats', true, (ctx) => userStats(ctx.user.id));
route('GET', '/api/rating', true, () => rating());

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
const send = (res, status, data) => {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
};
const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e6) { reject(new HttpError(413, 'Слишком большой запрос')); req.destroy(); } });
  req.on('end', () => {
    if (!raw) return resolve({});
    try { const b = JSON.parse(raw); resolve(b && typeof b === 'object' ? b : {}); }
    catch (e) { reject(new HttpError(400, 'Некорректный JSON')); }
  });
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

    if (req.method === 'GET' && !url.pathname.startsWith('/api')) {
      const f = path.join(__dirname, 'public', 'index.html');
      if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(f)); }
      return send(res, 200, { name: 'Форма роста API', docs: 'см. README.md', endpoints: routes.map((r) => `${r.method} ${r.pattern}`) });
    }

    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) {
      const other = routes.some((x) => x.re.test(url.pathname));
      throw new HttpError(other ? 405 : 404, other ? 'Метод не поддерживается' : 'Маршрут не найден');
    }
    const ctx = { params: r.re.exec(url.pathname).groups || {}, query: url.searchParams, body: {} };
    if (r.auth) {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      const uid = m && db.sessions[m[1]];
      const user = uid && db.users.find((u) => u.id === uid);
      if (!user) throw new HttpError(401, 'Нужна авторизация: передайте заголовок Authorization: Bearer <token>');
      ctx.user = user; ctx.token = m[1];
    }
    if (['POST', 'PUT'].includes(req.method)) ctx.body = await readBody(req);
    const out = await r.handler(ctx);
    if (out && out.__reply) send(res, out.status, out.data);
    else send(res, 200, out);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Внутренняя ошибка сервера' });
  }
});

if (require.main === module) server.listen(PORT, () => console.log(`Форма роста API: http://localhost:${PORT}`));
module.exports = server;