// 校園改造遊戲 校園評價計分（M4，115/11/05；規格書 §8，權重與常數皆暫定，待學習單）
// 純計算，不碰畫面：score(items, PTS, DARK, NEED) → { safe, calm, beauty, total, stars, pts, sets, dark, need }
// NEED：全班心情釘「怕／暗／想躲」的位置（M6）；≥ 3 支時安心分改以它們為需求點，否則用 8 個危險點
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

// 主要改造點計分（115/11/10，老師與學習單「一組改一處」對齊）：
// 主點 R 公尺內的安全值 → 安心指數、安心＋美化值 → 散心指數（各 25 分，從學習單填的現況分數往上加，沒填以 BASE 起算）；
// 總分＝主點兩個指數佔 MAIN 分，另外每照顧到一個其他危險點（該點安全值過半）加 OTHER 分，最多 OTHER_MAX 個
export const K2 = { R: 30, SAFE_FULL: 14, RELAX_FULL: 24, BASE: 12, MAIN: 70, OTHER: 10, OTHER_MAX: 3 };
export function siteScore(items, PTS, site, base, sc){
  const P = PTS.find((p) => p[0] === site); if (!P) return null;
  const c = { x: P[4], z: P[5] }, byA = [], byR = []; let sa = 0, sr = 0;
  for (const o of items){ const it = BY_ID[o.id]; if (!it) continue; const k = it.tags.includes('tile') ? K.TILE_K : 1, d = dist(c, o);
    if (it.safe && d <= Math.max(K2.R, it.r || 0)){ sa += it.safe * k; if (it.safe > 0 && !byA.includes(it.name)) byA.push(it.name); }
    const v = it.calm + it.beauty; if (v && d <= K2.R){ sr += v * k; if (v > 0 && !byR.includes(it.name)) byR.push(it.name); } }
  for (const s of sc.sets) if (dist(c, s) <= K2.R){ sa += s.safe; sr += s.calm + s.beauty; }
  const ok = (v) => typeof v === 'number' && v >= 5 && v <= 25, given = !!base && ok(base.a) && ok(base.s);
  const a0 = given ? base.a : K2.BASE, s0 = given ? base.s : K2.BASE;
  const after = (now, sum, full) => sum >= 0 ? now + (25 - now) * Math.min(1, sum / full) : Math.max(5, now + sum);
  const a = after(a0, sa, K2.SAFE_FULL), s = after(s0, sr, K2.RELAX_FULL);
  const others = sc.pts.filter((p) => p.n !== site && p.safe >= K.PER * .5).map((p) => p.title);
  const bonus = Math.min(K2.OTHER_MAX, others.length) * K2.OTHER, total = Math.min(100, K2.MAIN * (a + s) / 50 + bonus);
  return { n: site, title: P[2], given, a0, s0, a, s, sa, sr, byA, byR, others, bonus, total, stars: (K.STARS.find(([t]) => total >= t) || [0, 1])[1] };
}

export function score(items, PTS, DARK, NEED = []){
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
  let calm = Math.min(100, pts.reduce((s, p) => s + clamp(p.calm), 0)), need = null;
  if (NEED.length >= 3){   // 心情需求點：每點 15 m 內的安心值（兩難物件負值只在自己半徑內），各點達 12.5 為滿，取平均
    need = NEED.map((q) => { let c = 0; for (const o of L){ const v = o.it.calm; if (!v) continue; const R = v < 0 && o.it.r ? o.it.r : K.CALM_R; if (dist(q, o) <= R) c += v * (o.tile ? K.TILE_K : 1); }
      for (const st of sets) if (dist(q, st) <= K.CALM_R) c += st.calm; return { ...q, calm: c }; });
    calm = 100 * need.reduce((s, q) => s + clamp(q.calm), 0) / (need.length * K.PER);
  }
  // 美化：加總後看分布，集中一處打折
  let b = 0; const cells = new Map();
  for (const o of L){ const v = o.it.beauty * (o.tile ? K.TILE_K : 1); if (!v) continue; b += v;
    const key = Math.floor(o.x / 20) + ',' + Math.floor(o.z / 20); cells.set(key, (cells.get(key) || 0) + v); }
  b += sets.reduce((s, st) => s + st.beauty, 0);
  const conc = b >= 8 && Math.max(0, ...cells.values()) > b * .6;
  const beauty = Math.min(100, Math.max(0, b) * (conc ? K.CONC : 1) * 100 / K.BEAUTY_FULL);
  const total = K.W.safe * safe + K.W.calm * calm + K.W.beauty * beauty;
  const stars = (K.STARS.find(([t]) => total >= t) || [0, 1])[1];
  return { safe, calm, beauty, total, stars, pts, sets, dark, conc, need };
}
