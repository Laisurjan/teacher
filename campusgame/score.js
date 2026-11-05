// 校園改造遊戲 校園評價計分（M4，115/11/05；規格書 §8，權重與常數皆暫定，待學習單）
// 純計算，不碰畫面：score(items, PTS, DARK) → { safe, calm, beauty, total, stars, pts, sets, dark }
import { BY_ID, SETS } from './items.js';

export const K = {
  W: { safe: .4, calm: .4, beauty: .2 },   // 星等總分權重
  PER: 12.5,          // 每個危險點的安全／安心上限（8 點 × 12.5 ＝ 100）
  CALM_R: 15,         // 安心值的作用範圍（公尺）
  DEF_R: 5,           // 沒有覆蓋半徑的安全物件（護欄、扶手…）視為 5 m 內有效
  DARK_BONUS: 5,      // 每個暗區被照亮（覆蓋 ≥ 50%）加安全分
  BEAUTY_FULL: 40,    // 美化值累積到 40 ＝ 100 分
  TILE_K: .25,        // 磁磚一格的分數只算 1/4（4 格＝1 件物件）
  CONC: .7,           // 美化集中在一個 20 m 方格內超過 60% 時打 7 折
  STARS: [[85, 5], [70, 4], [55, 3], [40, 2]]
};
const LIGHT = (it) => it.cat === 'F' || it.id === 'emergency_light' || it.id === 'floodlight';
export const isLight = (id) => LIGHT(BY_ID[id]);
export const isHelp = (id) => { const it = BY_ID[id]; return it.cat === 'C' && it.r > 0 && !LIGHT(it); };
export function inPoly(P, x, z){ let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++){ const [xi, zi] = P[i], [xj, zj] = P[j];
  if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 暗區取樣點（2 m 格），用來算被燈照到的比例
const SAMP = new WeakMap();
function samples(d){
  if (SAMP.has(d)) return SAMP.get(d);
  const xs = d.poly.map((p) => p[0]), zs = d.poly.map((p) => p[1]), out = [];
  for (let x = Math.min(...xs) + 1; x < Math.max(...xs); x += 2) for (let z = Math.min(...zs) + 1; z < Math.max(...zs); z += 2) if (inPoly(d.poly, x, z)) out.push({ x, z });
  SAMP.set(d, out); return out;
}

// 套組：同組成員兩兩距離 ≤ r 相連成一群，群內不同成員 ≥ need 種就觸發，5 種加倍，同一套組最多計 2 處
export function findSets(list){
  const out = [];
  for (const t of SETS){
    const ms = list.filter((o) => t.members.includes(o.id)); if (new Set(ms.map((o) => o.id)).size < t.need) continue;
    const seen = new Set(), comps = [];
    for (let i = 0; i < ms.length; i++){
      if (seen.has(i)) continue; const q = [i], c = []; seen.add(i);
      while (q.length){ const a = q.pop(); c.push(ms[a]); for (let j = 0; j < ms.length; j++) if (!seen.has(j) && dist(ms[a], ms[j]) <= t.r){ seen.add(j); q.push(j); } }
      comps.push(c);
    }
    comps.map((c) => ({ c, kinds: new Set(c.map((o) => o.id)).size })).filter((o) => o.kinds >= t.need).sort((a, b) => b.kinds - a.kinds).slice(0, 2)
      .forEach(({ c, kinds }) => { const k = kinds >= 5 ? 2 : 1;
        out.push({ id: t.id, name: t.name, kinds, k, x: c.reduce((s, o) => s + o.x, 0) / c.length, z: c.reduce((s, o) => s + o.z, 0) / c.length,
          safe: t.safe * k, calm: t.calm * k, beauty: t.beauty * k }); });
  }
  return out;
}

export function score(items, PTS, DARK){
  const L = items.map((o) => ({ ...o, it: BY_ID[o.id], tile: BY_ID[o.id].tags.includes('tile') }));
  const sets = findSets(L.filter((o) => !o.tile));
  const pts = PTS.map(([n, lv, title, , x, z]) => ({ n, lv, title, x, z, safe: 0, calm: 0, by: [] }));
  // 安全：覆蓋到危險點的安全值（負值也扣）
  for (const o of L){ const s = o.it.safe; if (!s) continue; const r = o.it.r || K.DEF_R, k = o.tile ? K.TILE_K : 1;
    for (const p of pts) if (dist(p, o) <= r){ p.safe += s * k; if (s > 0 && !p.by.includes(o.it.name)) p.by.push(o.it.name); } }
  // 安心：危險點 15 m 內的安心值；兩難物件的負值只在它自己的半徑內扣
  for (const o of L){ const c = o.it.calm; if (!c) continue; const k = o.tile ? K.TILE_K : 1;
    const R = c < 0 && o.it.r ? o.it.r : K.CALM_R;
    for (const p of pts) if (dist(p, o) <= R){ p.calm += c * k; if (c > 0 && !p.by.includes(o.it.name)) p.by.push(o.it.name); } }
  for (const st of sets) for (const p of pts) if (dist(p, st) <= K.CALM_R){ p.safe += st.safe; p.calm += st.calm; }
  // 暗區：被燈照到的取樣點比例
  const lights = L.filter((o) => isLight(o.id) && o.it.r);
  const dark = DARK.map((d) => { const S = samples(d); const lit = S.filter((q) => lights.some((o) => dist(q, o) <= o.it.r)).length;
    return { name: d.name, f: S.length ? lit / S.length : 0 }; });
  const clamp = (v) => Math.max(0, Math.min(K.PER, v));
  const safe = Math.min(100, pts.reduce((s, p) => s + clamp(p.safe), 0) + dark.reduce((s, d) => s + K.DARK_BONUS * Math.min(1, d.f / .5), 0));
  const calm = Math.min(100, pts.reduce((s, p) => s + clamp(p.calm), 0));
  // 美化：加總後看分布，集中一處打折
  let b = 0; const cells = new Map();
  for (const o of L){ const v = o.it.beauty * (o.tile ? K.TILE_K : 1); if (!v) continue; b += v;
    const key = Math.floor(o.x / 20) + ',' + Math.floor(o.z / 20); cells.set(key, (cells.get(key) || 0) + v); }
  b += sets.reduce((s, st) => s + st.beauty, 0);
  const conc = b >= 8 && Math.max(0, ...cells.values()) > b * .6;
  const beauty = Math.min(100, Math.max(0, b) * (conc ? K.CONC : 1) * 100 / K.BEAUTY_FULL);
  const total = K.W.safe * safe + K.W.calm * calm + K.W.beauty * beauty;
  const stars = (K.STARS.find(([t]) => total >= t) || [0, 1])[1];
  return { safe, calm, beauty, total, stars, pts, sets, dark, conc };
}
