// 校園改造遊戲 雲端資料（M5，115/11/05）：Firebase Auth（學校 Google 帳號）＋ Firestore REST
// 集合：cgClasses/{班級 id}、cgRoster/{學生電子郵件}（管理者限定，學生只能讀自己）、cgWorks/{班級 id}_g{組號}
// 規則檔：C:\Users\godof\Downloads\hlbh-firebase\firestore.rules（isGameAdmin、cgClasses、cgRoster、cgWorks 段）
// 網址加 ?cgmock=1 改用本機模擬後端（資料存在 localStorage 的 cg-mock-db），給無頭瀏覽器測試用，不連網
export const FB_KEY = 'AIzaSyBS3Y8Vj4-Ty-jmM2oGEWzZ3kXCgpbGOfE';   // Firebase 網頁金鑰本來就公開，已限制來源網域
export const ADMINS = ['igene@hlbh.hlc.edu.tw', 'walala@hlbh.hlc.edu.tw'];
const PROJ = 'hlbh-admin-duty', DOCS = `projects/${PROJ}/databases/(default)/documents`, BASE = `https://firestore.googleapis.com/v1/${DOCS}`;
export const MOCK = new URLSearchParams(location.search).get('cgmock') === '1';

// 班級：科、年級、可開的班（老師 115/11/05 指定；英科一年級只有甲班、二三年級甲乙）
export const DEPTS = [
  ['商', 'bus', { 1: '甲乙', 2: '甲乙', 3: '甲乙' }], ['會', 'acc', { 1: '甲乙', 2: '甲乙', 3: '甲' }], ['資', 'inf', { 1: '甲乙', 2: '甲乙', 3: '甲乙' }],
  ['英', 'eng', { 1: '甲', 2: '甲乙', 3: '甲乙' }], ['日', 'jpn', { 1: '甲' }], ['多', 'mmd', { 1: '甲', 2: '甲', 3: '甲' }], ['貿', 'trd', { 1: '甲' }]
];
export const GRADE = ['', '一', '二', '三'];
export const schoolYear = (d = new Date()) => d.getFullYear() - 1911 - (d.getMonth() < 7 ? 1 : 0);   // 8 月起算新學年
export const classId = (year, dept, grade, cls) => `${year}-${DEPTS.find((x) => x[0] === dept)[1]}-${grade}${cls === '甲' ? 'a' : 'b'}`;
export const workId = (cid, g) => `${cid}_g${g}`;

// ---------- 登入 ----------
let A = null, auth = null, user = null;
async function sdk(){
  if (A) return A;
  const V = '10.12.2';
  const [{ initializeApp, getApps }, M] = await Promise.all([import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`), import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`)]);
  const app = getApps()[0] || initializeApp({ apiKey: FB_KEY, authDomain: 'hlbh-admin-duty.firebaseapp.com', projectId: PROJ });
  A = M; auth = M.getAuth(app); return A;
}
const mockUser = () => { try { const e = localStorage.getItem('cg-mock-user'); return e ? { email: e } : null; } catch (er) { return null; } };
// 上次登入過就自動恢復（Firebase 會記住）；沒有則回傳 null
export async function restore(){
  if (MOCK){ user = mockUser(); return me(); }
  try { await sdk(); } catch (e){ return null; }
  user = await new Promise((r) => { const off = A.onAuthStateChanged(auth, (u) => { off(); r(u); }); });
  return me();
}
export async function login(){
  if (MOCK){ const e = (window.__cgMockEmail || prompt('模擬登入的電子郵件') || '').trim().toLowerCase(); if (!e) return null; localStorage.setItem('cg-mock-user', e); user = { email: e }; return me(); }
  await sdk(); const p = new A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  user = (await A.signInWithPopup(auth, p)).user; return me();
}
export async function logout(){ if (MOCK){ localStorage.removeItem('cg-mock-user'); user = null; return; } if (auth) await A.signOut(auth); user = null; }
export function me(){ if (!user || !user.email) return null; const email = user.email.toLowerCase(); return { email, admin: ADMINS.includes(email) }; }
export const loginError = (e) => e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request' ? '登入視窗被關掉了'
  : e.code === 'auth/popup-blocked' ? '瀏覽器擋住了登入視窗，請允許彈出視窗再按一次' : e.code === 'auth/unauthorized-domain' ? '這個網址還沒加入 Firebase 的授權網域'
  : e.code === 'auth/network-request-failed' ? '網路連不上' : (e.message || String(e));

// ---------- Firestore 值的轉換 ----------
export function enc(v){
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
export function dec(v){
  if (!v) return null;
  if ('integerValue' in v) return +v.integerValue; if ('doubleValue' in v) return +v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue; if ('stringValue' in v) return v.stringValue; if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
}
const decDoc = (d) => ({ id: decodeURIComponent(d.name.split('/').pop()), data: dec({ mapValue: { fields: d.fields || {} } }), updateTime: d.updateTime });
const seg = (path) => path.split('/').map(encodeURIComponent).join('/');

// ---------- 本機模擬後端（?cgmock=1） ----------
const mdb = { load(){ try { return JSON.parse(localStorage.getItem('cg-mock-db') || '{}'); } catch (e){ return {}; } }, save(d){ localStorage.setItem('cg-mock-db', JSON.stringify(d)); } };
const now = () => new Date().toISOString();
function mockPatch(path, data, mask){
  const db = mdb.load(), doc = db[path] ? db[path].data : {};
  if (!mask) Object.keys(doc).forEach((k) => delete doc[k]);
  const paths = mask || Object.keys(data);
  for (const mp of paths){ const ks = mp.split('.'); let src = data, dst = doc;
    for (let i = 0; i < ks.length - 1; i++){ src = src && src[ks[i]]; if (typeof dst[ks[i]] !== 'object' || !dst[ks[i]]) dst[ks[i]] = {}; dst = dst[ks[i]]; }
    const last = ks[ks.length - 1], val = src && src[last];
    if (val === undefined) delete dst[last]; else dst[last] = JSON.parse(JSON.stringify(val)); }
  db[path] = { data: doc, updateTime: now() }; mdb.save(db); return db[path].updateTime;
}

// ---------- 讀寫 ----------
async function call(url, opt = {}){
  const h = { 'Content-Type': 'application/json' };
  if (user && user.getIdToken) h.Authorization = 'Bearer ' + await user.getIdToken();
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'key=' + FB_KEY, { ...opt, headers: h });
  if (r.status === 404) return null;
  if (!r.ok){ let m = r.status + ''; try { m = (await r.json()).error.message || m; } catch (e) {} const er = new Error(m); er.status = r.status; throw er; }
  return r.status === 204 ? {} : r.json();
}
export async function getDoc(path){
  if (MOCK){ const d = mdb.load()[path]; return d ? { id: path.split('/').pop(), data: JSON.parse(JSON.stringify(d.data)), updateTime: d.updateTime } : null; }
  const d = await call(`${BASE}/${seg(path)}`); return d ? decDoc(d) : null;
}
// 寫入：mask 給欄位路徑（如 items.i123）＝只改這幾個欄位，路徑在 mask 但 data 裡沒有＝刪除該欄位
export async function patch(path, data, mask){
  if (MOCK) return mockPatch(path, data, mask);
  const q = mask ? mask.map((m) => 'updateMask.fieldPaths=' + encodeURIComponent(m)).join('&') : '';
  const r = await call(`${BASE}/${seg(path)}${q ? '?' + q : ''}`, { method: 'PATCH', body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r && r.updateTime;
}
export async function del(path){ if (MOCK){ const db = mdb.load(); delete db[path]; mdb.save(db); return; } await call(`${BASE}/${seg(path)}`, { method: 'DELETE' }); }
// 一次寫多筆（最多 500）：[{ path, data, mask? } 或 { path, del: true }]
export async function commit(writes){
  for (let i = 0; i < writes.length; i += 450){
    const part = writes.slice(i, i + 450);
    if (MOCK){ part.forEach((w) => w.del ? (() => { const db = mdb.load(); delete db[w.path]; mdb.save(db); })() : mockPatch(w.path, w.data, w.mask)); continue; }
    await call(`https://firestore.googleapis.com/v1/${DOCS}:commit`, { method: 'POST', body: JSON.stringify({ writes: part.map((w) => w.del ? { delete: `${DOCS}/${w.path}` }
      : { update: { name: `${DOCS}/${w.path}`, fields: enc(w.data).mapValue.fields }, ...(w.mask ? { updateMask: { fieldPaths: w.mask } } : {}) }) }) });
  }
}
// 查一個集合裡某欄位等於某值的文件
export async function query(col, field, value){
  if (MOCK){ const db = mdb.load(); return Object.entries(db).filter(([p, d]) => p.startsWith(col + '/') && p.split('/').length === 2 && d.data[field] === value).map(([p, d]) => ({ id: p.split('/')[1], data: d.data, updateTime: d.updateTime })); }
  const r = await call(`https://firestore.googleapis.com/v1/${DOCS}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } }, limit: 1000 } }) });
  return (r || []).filter((x) => x.document).map((x) => decDoc(x.document));
}
export async function list(col){
  if (MOCK){ const db = mdb.load(); return Object.entries(db).filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: d.data, updateTime: d.updateTime })); }
  const out = []; let tok = '';
  do { const r = await call(`${BASE}/${col}?pageSize=300${tok ? '&pageToken=' + tok : ''}`); (r && r.documents || []).forEach((d) => out.push(decDoc(d))); tok = r && r.nextPageToken; } while (tok);
  return out;
}
