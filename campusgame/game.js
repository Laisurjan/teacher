// 校園改造遊戲 建造模式（M2、M3，115/11/05）：型錄面板、放置、選取、移動、旋轉、複製、收回、改色、復原／重做、本機存檔；
// M3：拆除原有物件（樹、棕櫚、樹籬、路燈、中庭桌椅）、可放在資訊館平台與司令台台面
// M4：磁磚拖曳連鋪、校園評價星等、套組觸發、圖層（危險點、暗區、照明、求助）、顧問提示
// 由 index.html 在「同材質合併」之後載入，學生物件掛在 studentRoot，每種「物件＋顏色」一組 InstancedMesh，不參與合併。
// 規格：C:\1031hlbhschool\校園改造遊戲規格書.md §4.2–4.6、§10
import * as THREE from '../campus3d/lib/three.module.js';
import { CATS, ITEMS, PALETTE, BY_ID, bake, build, variants } from './items.js';
import { REMOVE } from './items-data.js';
import { score, isLight, isHelp, inPoly as inP, K as SK } from './score.js';

const BUDGET = 1000, MAX_ITEMS = 300, MAX_TILES = 400, GRID = .5, UNDO_MAX = 50, SAVE_KEY = 'campusgame-work-v1';
const D2R = Math.PI / 180;
const isTile = (id) => BY_ID[id].tags.includes('tile');
const OPEN = ITEMS.filter((it) => !it.tags.includes('hidden'));   // 文化審查未過的物件先不開放（規格書 §6.2 K 類）
const keyOf = (it) => it.id + '#' + (it.v || 0);
const fxText = (it) => [['安全', it.safe], ['安心', it.calm], ['美化', it.beauty]].filter(([, v]) => v).map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`).join(' ');

const CSS = `
#app{z-index:0}   /* 標籤層自成一層，不會蓋到型錄面板 */
#gHud{background:var(--panel);padding:6px 10px;border-radius:8px;font-size:13px;font-weight:800;pointer-events:auto}
#bBuild{background:var(--accent);color:#fff;border:0;padding:7px 12px;border-radius:8px;font:inherit;font-size:13px;font-weight:800;pointer-events:auto;cursor:pointer}
#bBuild.off{background:var(--panel);color:var(--ink)}
#gCat{position:absolute;right:12px;top:60px;bottom:calc(66px + env(safe-area-inset-bottom));width:300px;z-index:11;background:var(--panel);
  border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden}
.building #gCat{display:flex} .building.catHide #gCat{display:none}
#gCat .top{display:flex;gap:6px;padding:8px 8px 4px;align-items:center;flex:none}
#gCat input{flex:1;min-width:0;font:inherit;font-size:14px;padding:7px 10px;border:1px solid var(--line);border-radius:9px;background:var(--btn);color:var(--ink)}
#gCat .tabs{display:flex;gap:4px;overflow-x:auto;padding:4px 8px 8px;flex:none;scrollbar-width:thin}
#gCat .tabs button{flex:none;font:inherit;font-size:13px;font-weight:800;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer}
#gCat .tabs button.on{background:var(--ink);color:var(--bg);border-color:transparent}
#gCat .grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 8px 10px;align-content:start;touch-action:pan-y;-webkit-overflow-scrolling:touch}
.gc{position:relative;border:2px solid transparent;border-radius:11px;background:var(--btn);padding:4px 4px 6px;text-align:center;cursor:pointer;
  box-shadow:0 1px 3px rgba(0,0,0,.1);user-select:none;-webkit-user-select:none}
.gc.on{border-color:var(--accent);box-shadow:0 0 0 3px rgba(31,111,235,.25)}
.gc img{display:block;width:100%;aspect-ratio:20/17;border-radius:8px;background:#eef3ef}
.gc b{display:block;font-size:13px;font-weight:800;line-height:1.25;margin-top:3px}
.gc span{display:block;font-size:11px;color:var(--sub);font-weight:700}
.gc .fx{color:#2e7d4f} .gc .fx i{font-style:normal;color:#d32f2f}
.gc em{position:absolute;left:6px;top:6px;font-style:normal;font-size:10px;font-weight:900;color:#fff;padding:1px 6px;border-radius:999px}
.gc em.dil{background:#e8963a} .gc em.cul{background:#7b2cbf}
#gTools{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(10px + env(safe-area-inset-bottom));display:none;gap:6px;z-index:11;
  flex-wrap:wrap;justify-content:center;width:calc(100% - 24px);max-width:760px}
.building #gTools{display:flex} .building .bar{display:none} .building #hint{display:none}
#gTools button{flex:0 1 auto;min-width:56px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:var(--btn);color:var(--btnInk);
  font:inherit;font-size:14px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.12);cursor:pointer}
#gTools button.on{background:var(--accent);color:#fff;border-color:transparent}
#gTools button:disabled{opacity:.4}
#gStat{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(64px + env(safe-area-inset-bottom));z-index:11;background:var(--panel);
  padding:6px 12px;border-radius:9px;font-size:13px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.15);display:none;max-width:calc(100% - 24px);text-align:center}
.building #gStat.show{display:block}
#gSel{position:absolute;z-index:12;background:var(--panel);border-radius:12px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,.25);display:none;
  transform:translate(-50%,-100%);pointer-events:auto}
#gSel .row{display:flex;gap:5px}
#gSel button{font:inherit;font-size:13px;font-weight:800;padding:7px 10px;border-radius:9px;border:1px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer;white-space:nowrap}
#gSel button.del{color:#c62828}
#gSel .sw{display:flex;gap:5px;justify-content:center;margin-top:6px;flex-wrap:wrap;max-width:260px}
#gSel .sw i{width:22px;height:22px;border-radius:50%;border:2px solid rgba(0,0,0,.2);cursor:pointer}
#gSel .sw i.on{border-color:var(--ink);box-shadow:0 0 0 2px var(--panel) inset}
#gSel .nm{font-size:12px;color:var(--sub);text-align:center;margin-bottom:4px;font-weight:800}
.building #peg{right:326px}
@media (orientation:portrait){
  #gCat{left:8px;right:8px;width:auto;top:auto;height:36vh;bottom:calc(60px + env(safe-area-inset-bottom))}
  #gCat .grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}
  #gStat{bottom:calc(36vh + 68px + env(safe-area-inset-bottom))}
  .building #peg{right:14px;bottom:calc(36vh + 70px + env(safe-area-inset-bottom))}
  .building.catHide #gStat{bottom:calc(64px + env(safe-area-inset-bottom))}
  .building.catHide #peg{bottom:calc(76px + env(safe-area-inset-bottom))}
}
.building.catHide #peg{right:14px}
#gFrame{position:absolute;inset:0;border:5px solid #e53935;z-index:9;pointer-events:none;display:none}
.demolish #gFrame{display:block}
#gTools button.demo.on{background:#e53935}
#gTools button.reset{color:#c62828}
#gConfirm{position:absolute;inset:0;z-index:40;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;padding:16px}
#gConfirm.show{display:flex}
#gConfirm .box{background:var(--panel);color:var(--ink);border-radius:14px;padding:18px 20px;max-width:420px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,.35)}
#gConfirm h3{margin:0 0 8px;font-size:18px;font-weight:900}
#gConfirm p{margin:0 0 14px;font-size:15px;line-height:1.6;color:var(--sub);font-weight:700}
#gConfirm .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
#gConfirm button{font:inherit;font-size:15px;font-weight:800;padding:10px 16px;border-radius:10px;border:1px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer}
#gConfirm button.go{background:#e53935;color:#fff;border-color:transparent}
#gStar{background:var(--panel);border:0;padding:6px 10px;border-radius:8px;font:inherit;font-size:13px;font-weight:900;pointer-events:auto;cursor:pointer;color:#e0a800;letter-spacing:1px}
#gStar small{color:var(--ink);letter-spacing:0;margin-left:4px}
#gScore{position:absolute;left:12px;top:60px;z-index:13;width:min(340px,calc(100% - 24px));max-height:calc(100% - 140px);overflow-y:auto;background:var(--panel);
  border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,.25);padding:12px 14px;display:none;font-size:13px}
#gScore.show{display:block}
#gScore h3{margin:0 0 8px;font-size:16px;font-weight:900;display:flex;justify-content:space-between;align-items:center}
#gScore h3 button{border:0;background:none;font-size:20px;color:var(--sub);cursor:pointer;padding:0 4px}
#gScore .sbar{display:grid;grid-template-columns:42px 1fr 38px;gap:6px;align-items:center;margin:4px 0;font-weight:800}
#gScore .sbar i{display:block;height:10px;border-radius:5px;background:var(--line);overflow:hidden}
#gScore .sbar i b{display:block;height:100%;border-radius:5px}
#gScore h4{margin:10px 0 4px;font-size:13px;font-weight:900;color:var(--sub)}
#gScore li{margin:2px 0;line-height:1.45;font-weight:700}
#gScore ul{margin:0;padding-left:18px}
#gScore .ok{color:#2e7d4f} #gScore .no{color:#c62828}
#gLayers{position:absolute;z-index:13;background:var(--panel);border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.25);padding:8px 12px;display:none;font-size:14px;font-weight:800}
#gLayers.show{display:block}
#gLayers label{display:flex;gap:8px;align-items:center;padding:5px 0;cursor:pointer}
#gLayers label.off{opacity:.45;cursor:default}
#gLayers input{width:18px;height:18px;margin:0}
#gLayers i{width:14px;height:14px;border-radius:50%;display:inline-block}
#gTip{position:absolute;right:12px;bottom:calc(66px + env(safe-area-inset-bottom));z-index:12;max-width:min(320px,calc(100% - 24px));background:#fffbe6;color:#3d3000;
  border:2px solid #f2c230;border-radius:14px 14px 4px 14px;padding:10px 12px;font-size:14px;font-weight:800;line-height:1.55;box-shadow:0 4px 14px rgba(0,0,0,.2);
  opacity:0;transform:translateY(8px);transition:opacity .4s,transform .4s;pointer-events:none}
#gTip.show{opacity:1;transform:none}
#gTip b{display:block;font-size:12px;color:#8a6d00;margin-bottom:2px}
.building #gTip{right:326px}
@media (orientation:portrait){ .building #gTip{right:12px;bottom:calc(36vh + 68px + env(safe-area-inset-bottom))} }
.building.catHide #gTip{right:12px}
`;

export function init(G){
  const { scene, camera, controls, renderer, occBoxes, BOUND, QL, WALK, toast, groundAt, RM = [], rmSet = () => {}, SURF = [], PTS = [], DARK = [] } = G;
  const app = renderer.domElement.parentElement, body = document.body;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  // 整頁不該捲動（iPad 叫出鍵盤或程式捲動卡片時可能被推上去）：一捲就歸零
  const unscroll = () => { const e = document.scrollingElement || document.documentElement; if (e.scrollTop || e.scrollLeft){ e.scrollTop = 0; e.scrollLeft = 0; } if (document.body.scrollTop) document.body.scrollTop = 0; };
  addEventListener('scroll', unscroll, true); if (window.visualViewport) visualViewport.addEventListener('resize', () => setTimeout(unscroll, 50));

  // ---------- 狀態 ----------
  const S = { items: {}, removed: {} };   // items：uid → { id, x, y（所在表面高度）, z, rot（度）, v（調色盤序號） }；removed：拆掉的原有物件 id
  const RMI = new Map(RM.map((r) => [r.id, r]));
  let ON = true, TOOL = 'idle', PL = null, sel = null, SNAP = true, SOUND = true;   // TOOL：idle／place／moveTo／demolish
  const UNDO = [], REDO = [];
  const root = new THREE.Group(); root.name = 'studentRoot'; scene.add(root);
  const fx = new THREE.Group(); fx.name = 'buildFx'; scene.add(fx);   // 幽靈、占地框、描邊（不能被點選）
  let uidN = 0; const newUid = () => 'i' + Date.now().toString(36) + (uidN++).toString(36);

  // ---------- 繪製：每種「物件＋顏色」一組 InstancedMesh ----------
  const R = new Map(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SV3 = new THREE.Vector3(), YAX = new THREE.Vector3(0, 1, 0);
  const ANIM = new Map();   // uid → 開始時間（放下的彈跳）
  function bucket(key){
    let b = R.get(key);
    if (!b){ const [id, v] = key.split('#'); b = { parts: bake(id, +v), meshes: [], cap: 0, uids: [] }; R.set(key, b); }
    return b;
  }
  function ensureCap(b, n){
    if (n <= b.cap) return;
    const cap = Math.max(16, b.cap * 2, n);
    b.meshes.forEach((m) => { root.remove(m); m.dispose(); });
    b.meshes = b.parts.map((p) => { const m = new THREE.InstancedMesh(p.geometry, p.material, cap);
      m.castShadow = p.cast && QL === 0; m.receiveShadow = QL === 0; m.count = 0; m.userData.b = b; root.add(m); return m; });
    b.cap = cap;
  }
  const yOf = (it) => (it.y || 0) + (isTile(it.id) ? .05 : 0);
  function matOf(u, it){
    const t = ANIM.get(u), k = t === undefined ? 1 : 1 + .12 * Math.sin(Math.PI * Math.min(1, (performance.now() - t) / 160));
    return M4.compose(V.set(it.x, yOf(it), it.z), Q.setFromAxisAngle(YAX, it.rot * D2R), SV3.set(k, k, k));
  }
  function refresh(key){
    const b = bucket(key); b.uids = Object.keys(S.items).filter((u) => keyOf(S.items[u]) === key); ensureCap(b, b.uids.length);
    b.uids.forEach((u, i) => { const m = matOf(u, S.items[u]); b.meshes.forEach((im) => im.setMatrixAt(i, m)); });
    b.meshes.forEach((im) => { im.count = b.uids.length; im.instanceMatrix.needsUpdate = true; im.boundingSphere = null; im.boundingBox = null; });
  }

  // ---------- 可不可以放 ----------
  function corners(id, x, z, rot, pad = 0){
    const [w, d] = BY_ID[id].fp, c = Math.cos(rot * D2R), s = Math.sin(rot * D2R), hw = w / 2 - pad, hd = d / 2 - pad;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c]);
  }
  function inPoly(x, z){ let ins = false; for (let i = 0, j = BOUND.length - 1; i < BOUND.length; j = i++){ const [xi, zi] = BOUND[i], [xj, zj] = BOUND[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
  function overlap(A, B){
    for (const P of [A, B]) for (let i = 0; i < 4; i++){
      const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % 4], nx = z1 - z2, nz = x2 - x1;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, z] of A){ const p = x * nx + z * nz; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
      for (const [x, z] of B){ const p = x * nx + z * nz; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
      if (a1 <= b0 || b1 <= a0) return false;
    }
    return true;
  }
  const rectPoly = (q) => [[q.x0, q.z0], [q.x1, q.z0], [q.x1, q.z1], [q.x0, q.z1]];
  // 原有可拆物件的占地：樹與棕櫚只算樹幹附近，其他用整個外框
  RM.forEach((r) => { const c = r.box.getCenter(new THREE.Vector3()), k = r.kind === 'tree' || r.kind === 'palm' ? .5 : 0;
    r.foot = k ? [c.x - k, c.z - k, c.x + k, c.z + k] : [r.box.min.x, r.box.min.z, r.box.max.x, r.box.max.z]; });
  const rmName = (k) => ((REMOVE[k] && REMOVE[k].name) || '物件').replace(/（.*）/, '');
  function check(id, x, z, rot, ignore, y = 0){
    const C4 = corners(id, x, z, rot, .02);
    if (!C4.every(([a, b]) => inPoly(a, b))) return '超出校園範圍';
    if (y > 0){
      const q = SURF.find((o) => Math.abs(o.y - y) < .01);
      if (!q || !C4.every(([a, b]) => a > q.x0 && a < q.x1 && b > q.z0 && b < q.z1)) return `要整個放在${q ? q.name : '台'}上`;
      if (BY_ID[id].h > q.clear) return `太高了，${q.name}上放不下`;
    } else if (SURF.some((q) => overlap(C4, rectPoly(q)))) return '壓到平台或司令台的邊了，請放到台上或台下空地';
    const xs = C4.map((c) => c[0]), zs = C4.map((c) => c[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    if (occBoxes.some((b) => !b.off && b.min.y < y + 1 && b.max.y > y + .3 && b.max.x > x0 && b.min.x < x1 && b.max.z > z0 && b.min.z < z1)) return '這裡有建築或原有設施擋住';
    if (!isTile(id) && y === 0){ const r = RM.find((o) => !o.off && o.foot[2] > x0 && o.foot[0] < x1 && o.foot[3] > z0 && o.foot[1] < z1);
      if (r) return `這裡有原本的${rmName(r.kind)}（可以用「移除」移走）`; }
    const t = isTile(id);
    for (const [u, it] of Object.entries(S.items)){
      if (u === ignore || isTile(it.id) !== t || Math.abs((it.y || 0) - y) > .5) continue;
      if (Math.abs(it.x - x) > 6 || Math.abs(it.z - z) > 6) continue;
      if (overlap(C4, corners(it.id, it.x, it.z, it.rot, .02))) return t ? '這格已經鋪過磁磚' : '和其他物件重疊';
    }
    return '';
  }
  const spent = () => Object.values(S.items).reduce((s, it) => s + BY_ID[it.id].cost, 0)
    + Object.keys(S.removed).reduce((s, id) => s + ((RMI.get(id) && REMOVE[RMI.get(id).kind] || {}).cost || 0), 0);
  const snap = (v) => SNAP ? Math.round(v / GRID) * GRID : Math.round(v * 20) / 20;
  const tsnap = (id, v, axis) => { const w = BY_ID[id].fp[axis]; return Math.floor(v / w) * w + w / 2; };   // 磁磚對齊自己的格子，鋪起來才不會錯開

  // ---------- 動作、復原、存檔 ----------
  function apply(u, b){
    const old = S.items[u]; if (b) S.items[u] = { ...b }; else delete S.items[u];
    const ks = new Set(); if (old) ks.add(keyOf(old)); if (b) ks.add(keyOf(b)); ks.forEach(refresh);
  }
  let rmDirty = true;
  function setRm(id, on){ const r = RMI.get(id); if (!r) return; if (on) S.removed[id] = true; else delete S.removed[id]; rmSet(r, !!on); rmDirty = true; }
  const doOp = (o, v) => o.r ? setRm(o.r, v) : apply(o.u, v);   // 物件操作 {u,a,b}；拆除 {r,a,b}
  function commit(ops){ ops.forEach((o) => doOp(o, o.b)); UNDO.push(ops); if (UNDO.length > UNDO_MAX) UNDO.shift(); REDO.length = 0; changed(); }
  function undo(){ const ops = UNDO.pop(); if (!ops){ toast('沒有可以復原的動作'); return; }
    ops.slice().reverse().forEach((o) => doOp(o, o.a)); REDO.push(ops); if (sel && !S.items[sel]) deselect(); changed(); }
  function redo(){ const ops = REDO.pop(); if (!ops){ toast('沒有可以重做的動作'); return; }
    ops.forEach((o) => doOp(o, o.b)); UNDO.push(ops); if (sel && !S.items[sel]) deselect(); changed(); }
  let saveT = 0;
  function changed(){ clearTimeout(saveT); saveT = setTimeout(save, 300); hud(); showSel(); rescore(); }
  function save(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, t: Date.now(), items: S.items, removed: S.removed })); } catch (e) {} }
  function load(){
    try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!d || !d.items) return 0;
      let n = 0; for (const [u, it] of Object.entries(d.items)) if (BY_ID[it.id] && !BY_ID[it.id].tags.includes('hidden')){ S.items[u] = { id: it.id, x: +it.x, y: +it.y || 0, z: +it.z, rot: +it.rot || 0, v: +it.v || 0 }; n++; }
      for (const id of Object.keys(d.removed || {})) if (RMI.has(id)) setRm(id, true);
      new Set(Object.values(S.items).map(keyOf)).forEach(refresh); return n;
    } catch (e){ return 0; }
  }
  let actx = null;
  function pop(){ if (!SOUND) return; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(980, t + .07); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .12);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .13); } catch (e) {} }
  const bounce = (u) => { ANIM.set(u, performance.now()); pop(); };

  function tryPlace(id, v, x, z, rot, y = 0){
    const it = BY_ID[id], all = Object.values(S.items), tiles = all.filter((o) => isTile(o.id)).length;
    if (isTile(id) ? tiles >= MAX_TILES : all.length - tiles >= MAX_ITEMS){ toast(isTile(id) ? `磁磚最多 ${MAX_TILES} 格` : `物件最多 ${MAX_ITEMS} 件`); return false; }
    const left = BUDGET - spent(); if (it.cost > left){ toast(`預算不夠：${it.name}要 ${it.cost} 點，只剩 ${left} 點`); return false; }
    const why = check(id, x, z, rot, null, y); if (why){ toast(why); return false; }
    const u = newUid(); commit([{ u, a: null, b: { id, x, y, z, rot, v } }]); bounce(u); return u;
  }
  function canAdd(id){
    const all = Object.values(S.items), tiles = all.filter((o) => isTile(o.id)).length;
    if (isTile(id) ? tiles >= MAX_TILES : all.length - tiles >= MAX_ITEMS) return isTile(id) ? `磁磚最多 ${MAX_TILES} 格` : `物件最多 ${MAX_ITEMS} 件`;
    const left = BUDGET - spent(); if (BY_ID[id].cost > left) return `預算不夠：${BY_ID[id].name}要 ${BY_ID[id].cost} 點，只剩 ${left} 點`;
    return '';
  }

  // ---------- 幽靈、占地框、描邊 ----------
  const fpMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: .45, depthWrite: false });
  const fp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fpMat); fp.rotation.x = -Math.PI / 2; fp.renderOrder = 2; fp.visible = false; fx.add(fp);
  const GM = new Map(); let ghost = null;
  function ghostOf(id, v){
    const g = build(id, v);
    g.traverse((o) => { if (!o.isMesh) return; let m = GM.get(o.material.uuid);
      if (!m){ m = o.material.clone(); m.transparent = true; m.opacity = .55; m.depthWrite = false; GM.set(o.material.uuid, m); } o.material = m; o.castShadow = false; });
    return g;
  }
  function showFp(id, x, z, rot, color, y = 0){
    const [w, d] = BY_ID[id].fp; fp.scale.set(w, d, 1); fp.position.set(x, (y || 0) + (isTile(id) ? .1 : .06), z); fp.rotation.z = rot * D2R;
    fpMat.color.setHex(color); fp.visible = true;
  }
  const OUT = new THREE.MeshBasicMaterial({ color: 0x1f6feb, side: THREE.BackSide });
  let outline = null;
  function drawOutline(){
    if (outline){ fx.remove(outline); outline = null; }
    const it = sel && S.items[sel]; if (!it) return;
    outline = new THREE.Group(); bucket(keyOf(it)).parts.forEach((p) => { const m = new THREE.Mesh(p.geometry, OUT); outline.add(m); });
    outline.position.set(it.x, yOf(it) - .01, it.z); outline.rotation.y = it.rot * D2R; outline.scale.setScalar(1.05); fx.add(outline);
  }

  // ---------- 拾取 ----------
  const rc = new THREE.Raycaster(), NDC = new THREE.Vector2();
  function ray(cx, cy){ const r = renderer.domElement.getBoundingClientRect(); NDC.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1); rc.setFromCamera(NDC, camera); return rc.ray; }
  // 指到的可放表面：平台、司令台台面優先（離鏡頭近者），否則地面
  function ground(cx, cy){
    const o = ray(cx, cy).origin, d = rc.ray.direction; let best = null, bt = Infinity;
    for (const q of SURF){ if (Math.abs(d.y) < 1e-6) continue; const t = (q.y - o.y) / d.y; if (t <= 0 || t >= bt) continue;
      const x = o.x + d.x * t, z = o.z + d.z * t; if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1){ bt = t; best = { x, z, y: q.y }; } }
    if (best) return best;
    const g = groundAt(cx, cy); return g ? { x: g.x, z: g.z, y: 0 } : null;
  }
  function pick(cx, cy){
    ray(cx, cy);
    const hits = rc.intersectObjects(root.children, false);
    for (const h of hits) if (h.instanceId !== undefined){ const u = h.object.userData.b.uids[h.instanceId]; if (u && S.items[u]) return u; }
    const g = ground(cx, cy); if (!g) return null;   // 退而求其次：點在占地範圍內（磁磚、矮物件）
    let best = null, bd = Infinity;
    for (const [u, it] of Object.entries(S.items)){ if (Math.abs(it.x - g.x) > 4 || Math.abs(it.z - g.z) > 4 || Math.abs((it.y || 0) - g.y) > .5) continue;
      const P = corners(it.id, it.x, it.z, it.rot); if (!overlap(P, [[g.x - .05, g.z - .05], [g.x + .05, g.z - .05], [g.x + .05, g.z + .05], [g.x - .05, g.z + .05]])) continue;
      const d = Math.hypot(it.x - g.x, it.z - g.z) + (isTile(it.id) ? 10 : 0); if (d < bd){ bd = d; best = u; } }
    return best;
  }

  // ---------- 介面 ----------
  const header = document.querySelector('header'), h1 = header.querySelector('h1');
  header.insertAdjacentHTML('beforeend', '<button id="bBuild">🛠 建造中</button><span id="gHud"></span>');
  const hudEl = document.getElementById('gHud'), bBuild = document.getElementById('bBuild');
  function hud(){ const n = Object.keys(S.items).length, s = spent(), k = Object.keys(S.removed).length; hudEl.textContent = `花費 ${s}／${BUDGET} 點・${n} 件${k ? `・拆 ${k}` : ''}`; hudEl.style.color = s > BUDGET * .9 ? '#c62828' : ''; tb.undo.disabled = !UNDO.length; tb.redo.disabled = !REDO.length; }

  const cat = document.createElement('div'); cat.id = 'gCat';
  cat.innerHTML = `<div class="top"><input type="search" placeholder="搜尋物件，例如：長凳、燈" aria-label="搜尋物件"></div><div class="tabs"></div><div class="grid"></div>`;
  body.appendChild(cat);
  const tabsEl = cat.querySelector('.tabs'), gridEl = cat.querySelector('.grid'), qEl = cat.querySelector('input');
  let CAT = 'B';
  CATS.forEach((c) => { const b = document.createElement('button'); b.textContent = c.name; b.dataset.k = c.k; b.onclick = () => { CAT = c.k; qEl.value = ''; renderCat(); }; tabsEl.appendChild(b); });
  qEl.addEventListener('input', renderCat);
  function renderCat(){
    const q = qEl.value.trim();
    tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', !q && b.dataset.k === CAT));
    const list = q ? OPEN.filter((it) => it.name.includes(q) || it.note.includes(q)) : OPEN.filter((it) => it.cat === CAT);
    gridEl.innerHTML = list.length ? '' : '<p style="grid-column:1/-1;color:var(--sub);font-size:13px;padding:8px">找不到這個物件</p>';
    for (const it of list){
      const d = document.createElement('div'); d.className = 'gc' + (PL && PL.id === it.id ? ' on' : ''); d.dataset.id = it.id;
      const f = fxText(it).replace(/(安全|安心|美化)-(\d)/g, '<i>$1-$2</i>');
      d.innerHTML = `<img alt="">${it.tags.includes('dilemma') ? '<em class="dil">兩難</em>' : it.tags.includes('culture') ? '<em class="cul">待審</em>' : ''}<b>${it.name}</b><span>${it.cost} 點${isTile(it.id) ? '／格' : ''}</span><span class="fx">${f || '—'}</span>`;
      d.onclick = () => pickCard(it.id);
      gridEl.appendChild(d); thumbInto(it.id, d.querySelector('img'));
    }
    gridEl.scrollTop = 0;
  }

  const tools = document.createElement('div'); tools.id = 'gTools';
  tools.innerHTML = `<button data-t="cat" class="on">型錄</button><button data-t="layer">圖層</button><button data-t="demo" class="demo" title="點一下物件就移走（自己放的或原有的樹、樹籬、路燈、中庭桌椅）">移除</button><button data-t="rot">旋轉</button><button data-t="grid" class="on">格線</button>
    <button data-t="undo">↶ 復原</button><button data-t="redo">↷ 重做</button><button data-t="done">完成</button><button data-t="snd" class="on">音效</button><button data-t="reset" class="reset">全部重置</button>`;
  body.appendChild(tools);
  const tb = {}; tools.querySelectorAll('button').forEach((b) => tb[b.dataset.t] = b);
  tb.cat.onclick = () => { body.classList.toggle('catHide'); tb.cat.classList.toggle('on', !body.classList.contains('catHide')); };
  tb.rot.onclick = () => rotate();
  tb.demo.onclick = () => setDemolish(TOOL !== 'demolish');
  tb.grid.onclick = () => { SNAP = !SNAP; tb.grid.classList.toggle('on', SNAP); toast(SNAP ? '對齊 0.5 m 格線' : '自由放置（不對齊格線）'); };
  tb.undo.onclick = undo; tb.redo.onclick = redo;
  tb.done.onclick = () => { endPlace(); deselect(); setDemolish(false); };
  tb.snd.onclick = () => { SOUND = !SOUND; tb.snd.classList.toggle('on', SOUND); };
  tb.reset.onclick = () => askReset();

  // 全部重置：兩次確認；整批進復原堆疊，誤按還能「復原」拿回來
  const cf = document.createElement('div'); cf.id = 'gConfirm'; cf.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h3></h3><p></p><div class="row"></div></div>'; body.appendChild(cf);
  cf.addEventListener('pointerdown', (e) => { if (e.target === cf) cf.classList.remove('show'); });
  function dialog(title, msg, btns){
    cf.querySelector('h3').textContent = title; cf.querySelector('p').textContent = msg;
    const row = cf.querySelector('.row'); row.innerHTML = '';
    btns.forEach(([t, cls, fn]) => { const b = document.createElement('button'); b.textContent = t; if (cls) b.className = cls; b.onclick = () => { cf.classList.remove('show'); if (fn) fn(); }; row.appendChild(b); });
    cf.classList.add('show');
  }
  function askReset(){
    const n = Object.keys(S.items).length, k = Object.keys(S.removed).length;
    if (!n && !k){ toast('現在沒有東西可以重置'); return; }
    dialog('全部重置？', `會收回你放的 ${n} 件物件${k ? `，並把拆掉的 ${k} 件原有物件放回去` : ''}，校園回到一開始的樣子。`, [['取消'], ['下一步', 'go', () =>
      dialog('再確認一次', '真的要全部重置嗎？（重置後如果反悔，可以馬上按「復原」拿回來）', [['不要了'], ['確定全部重置', 'go', doReset]])]]);
  }
  function doReset(){
    endPlace(); deselect(); setDemolish(false);
    const ops = Object.entries(S.items).map(([u, it]) => ({ u, a: { ...it }, b: null }))
      .concat(Object.keys(S.removed).map((r) => ({ r, a: true, b: false })));
    if (ops.length){ commit(ops); toast('已全部重置（反悔可按「復原」）'); }
  }
  const stat = document.createElement('div'); stat.id = 'gStat'; body.appendChild(stat);
  function status(t){ stat.textContent = t || ''; stat.classList.toggle('show', !!t); }

  const pop2 = document.createElement('div'); pop2.id = 'gSel'; body.appendChild(pop2);
  pop2.addEventListener('pointerdown', (e) => e.stopPropagation());
  function showSel(){
    const it = sel && S.items[sel];
    drawOutline();
    if (!it){ pop2.style.display = 'none'; if (TOOL !== 'place') fp.visible = false; return; }
    const vs = BY_ID[it.id].rc ? variants(it.id) : [0];
    pop2.innerHTML = `<div class="nm">${BY_ID[it.id].name}</div><div class="row"><button data-a="move">移動</button><button data-a="rot">旋轉 45°</button><button data-a="copy">複製</button><button data-a="del" class="del">收回</button></div>`
      + (vs.length > 1 ? `<div class="sw">${vs.map((v) => `<i data-v="${v}" title="${PALETTE[v][0]}" class="${(it.v || 0) === v ? 'on' : ''}" style="background:${PALETTE[v][1] || 'conic-gradient(#e63946,#f4a261,#2a9d8f,#457b9d,#e63946)'}"></i>`).join('')}</div>` : '');
    pop2.querySelectorAll('button').forEach((b) => b.onclick = () => selAct(b.dataset.a));
    pop2.querySelectorAll('.sw i').forEach((i) => i.onclick = () => { const a = S.items[sel], v = +i.dataset.v; if (!a || (a.v || 0) === v) return; commit([{ u: sel, a: { ...a }, b: { ...a, v } }]); bounce(sel); });
    showFp(it.id, it.x, it.z, it.rot, 0x1f6feb, it.y || 0); pop2.style.display = 'block';
  }
  function selAct(a){
    const it = S.items[sel]; if (!it) return;
    if (a === 'move'){ TOOL = 'moveTo'; status(`移動「${BY_ID[it.id].name}」：點一下新位置，或直接拖曳物件・Esc 取消`); }
    else if (a === 'rot') rotate();
    else if (a === 'copy'){ startPlace(it.id, it.v || 0, it.rot); }
    else if (a === 'del'){ const u = sel; deselect(); commit([{ u, a: { ...it }, b: null }]); toast('已收回（可按「復原」拿回來）'); }
  }
  function select(u){ if (TOOL === 'place') endPlace(); setDemolish(false); sel = u; TOOL = 'idle'; status(''); showSel(); }
  function deselect(){ sel = null; if (TOOL === 'moveTo') TOOL = 'idle'; status(''); showSel(); }
  function rotate(){
    if (TOOL === 'place' && PL){ PL.rot = (PL.rot + 45) % 360; if (ghost) ghost.rotation.y = PL.rot * D2R; ghostAt(PL.x, PL.z); return; }
    const it = sel && S.items[sel]; if (!it){ toast('先點一下要旋轉的物件'); return; }
    const rot = (it.rot + 45) % 360, why = check(it.id, it.x, it.z, rot, sel, it.y || 0);
    if (why){ toast('轉不過去：' + why); return; }
    commit([{ u: sel, a: { ...it }, b: { ...it, rot } }]);
  }

  // 放置模式
  function pickCard(id){
    const it = BY_ID[id];
    if (WALK.on){   // 街景模式：放在視線前方 2.5 m
      const x = snap(WALK.pos.x + Math.sin(WALK.yaw) * 2.5), z = snap(WALK.pos.z + Math.cos(WALK.yaw) * 2.5);
      if (tryPlace(id, 0, x, z, Math.round(((WALK.yaw / D2R) + 180) / 45) * 45 % 360)) toast(`放好了：${it.name}`);
      return;
    }
    if (PL && PL.id === id){ endPlace(); return; }
    startPlace(id, 0, 0);
  }
  function startPlace(id, v, rot){
    deselect(); endPlace(); setDemolish(false); PL = { id, v, rot: rot || 0, x: null, y: 0, z: null }; TOOL = 'place';
    ghost = ghostOf(id, v); ghost.rotation.y = PL.rot * D2R; ghost.visible = false; fx.add(ghost);
    gridEl.querySelectorAll('.gc').forEach((c) => c.classList.toggle('on', c.dataset.id === id));
    status(isTile(id) ? `鋪「${BY_ID[id].name}」：點一格鋪一格、按住拖曳連續鋪・在同款磁磚上按住拖曳＝擦掉・要轉視角先按「完成」或用兩指`
      : `放置「${BY_ID[id].name}」：點地面放下（可連續放）・「旋轉」或 R 鍵轉向・「完成」結束`);
    const r = renderer.domElement.getBoundingClientRect(), g = ground(r.left + r.width * .45, r.top + r.height * .55);   // 先放在畫面中央預覽
    if (g) ghostAt(snap(g.x), snap(g.z), g.y);
  }
  function endPlace(){
    if (ghost){ fx.remove(ghost); ghost = null; }
    PL = null; if (TOOL === 'place') TOOL = 'idle'; fp.visible = false; status('');
    gridEl.querySelectorAll('.gc.on').forEach((c) => c.classList.remove('on'));
  }
  function ghostAt(x, z, y = PL ? PL.y : 0){
    if (!PL || x === null) return; if (isTile(PL.id)){ x = tsnap(PL.id, x, 0); z = tsnap(PL.id, z, 1); } PL.x = x; PL.z = z; PL.y = y;
    ghost.visible = true; ghost.position.set(x, y + (isTile(PL.id) ? .05 : 0), z);
    showFp(PL.id, x, z, PL.rot, check(PL.id, x, z, PL.rot, null, y) ? 0xe53935 : 0x2ecc71, y);
  }

  // ---------- 指標：點、長按、拖曳 ----------
  let down = null, drag = null, lp = 0; const ptrs = new Set();
  const canvas = renderer.domElement;
  function startDrag(u, pid, cx, cy){
    const it = S.items[u], g = ground(cx, cy);
    drag = { u, pid, a: { ...it }, off: g && Math.abs(g.y - (it.y || 0)) < .5 ? [it.x - g.x, it.z - g.z] : [0, 0], why: '', moved: false };
    controls.enabled = false; if (sel !== u) select(u);
  }
  function endDrag(ok){
    const d = drag; drag = null; controls.enabled = true; if (!d) return;
    if (!d.moved){ showSel(); return; }
    if (ok && !d.why){ commit([{ u: d.u, a: d.a, b: { ...S.items[d.u] } }]); bounce(d.u); }
    else { apply(d.u, d.a); showSel(); toast((d.why || '取消移動') + '，已放回原位'); }
  }
  app.addEventListener('pointerdown', (e) => {
    ptrs.add(e.pointerId);
    if (!ON || WALK.on || e.target !== canvas || (e.button !== undefined && e.button > 0)) return;
    if (ptrs.size > 1){ clearTimeout(lp); down = null; if (drag) endDrag(false); if (paint) endPaint(); return; }
    if (TOOL === 'place' && PL && isTile(PL.id)){ startPaint(e); e.stopPropagation(); e.preventDefault(); return; }
    const u = TOOL === 'place' || TOOL === 'demolish' ? null : pick(e.clientX, e.clientY);
    if (u && u === sel){ startDrag(u, e.pointerId, e.clientX, e.clientY); e.stopPropagation(); e.preventDefault(); return; }
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, u, moved: false };
    clearTimeout(lp);
    if (u) lp = setTimeout(() => { if (down && !down.moved && ptrs.size === 1){ const d = down; down = null; startDrag(d.u, d.id, d.x, d.y); toast('拖曳到新位置'); } }, 450);
  }, true);
  addEventListener('pointermove', (e) => {
    if (paint && e.pointerId === paint.pid){ paintAt(e.clientX, e.clientY); return; }
    if (drag && e.pointerId === drag.pid){
      const g = ground(e.clientX, e.clientY); if (!g) return;
      const it = S.items[drag.u], x = snap(g.x + drag.off[0]), z = snap(g.z + drag.off[1]), y = g.y;
      if (x === it.x && z === it.z && y === (it.y || 0)) return;
      drag.moved = true; drag.why = check(it.id, x, z, it.rot, drag.u, y);
      apply(drag.u, { ...it, x, y, z }); drawOutline(); showFp(it.id, x, z, it.rot, drag.why ? 0xe53935 : 0x1f6feb, y); return;
    }
    if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6){ down.moved = true; clearTimeout(lp); }
    if (ON && TOOL === 'place' && e.pointerType === 'mouse' && !WALK.on && e.target === canvas && !down){
      const g = ground(e.clientX, e.clientY); if (g) ghostAt(snap(g.x), snap(g.z), g.y); }
    if (ON && TOOL === 'demolish' && e.pointerType === 'mouse' && !WALK.on && e.target === canvas && !down) hoverRm(pickRm(e.clientX, e.clientY));
  });
  addEventListener('pointerup', (e) => {
    ptrs.delete(e.pointerId); clearTimeout(lp);
    if (paint && e.pointerId === paint.pid){ endPaint(); return; }
    if (drag && e.pointerId === drag.pid){ endDrag(true); return; }
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null;
    if (d.moved || performance.now() - d.t > 350) return;
    tap(e.clientX, e.clientY, d.u);
  });
  addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); clearTimeout(lp); down = null; if (drag && e.pointerId === drag.pid) endDrag(false); if (paint && e.pointerId === paint.pid) endPaint(); });
  let paint = null;
  function tileAt(id, x, z, y){ return Object.keys(S.items).find((u) => { const o = S.items[u]; return o.id === id && Math.abs(o.x - x) < .01 && Math.abs(o.z - z) < .01 && Math.abs((o.y || 0) - y) < .5; }); }
  function startPaint(e){
    const g = ground(e.clientX, e.clientY); if (!g) return;
    const x = tsnap(PL.id, g.x, 0), z = tsnap(PL.id, g.z, 1);
    paint = { pid: e.pointerId, ops: [], cells: new Set(), erase: !!tileAt(PL.id, x, z, g.y), warned: false };
    controls.enabled = false; paintAt(e.clientX, e.clientY);
  }
  function paintAt(cx, cy){
    const g = ground(cx, cy); if (!g) return;
    const x = tsnap(PL.id, g.x, 0), z = tsnap(PL.id, g.z, 1), key = x + ',' + z;
    ghostAt(x, z, g.y); if (paint.cells.has(key)) return; paint.cells.add(key);
    if (paint.erase){ const u = tileAt(PL.id, x, z, g.y); if (u){ paint.ops.push({ u, a: { ...S.items[u] }, b: null }); apply(u, null); hud(); } return; }
    const why = canAdd(PL.id) || check(PL.id, x, z, 0, null, g.y);
    if (why){ if (!paint.warned){ toast(why); paint.warned = true; } return; }
    const u = newUid(), b = { id: PL.id, x, y: g.y, z, rot: 0, v: 0 }; apply(u, b); paint.ops.push({ u, a: null, b }); hud();
  }
  function endPaint(){
    const P = paint; paint = null; controls.enabled = true; if (!P || !P.ops.length) return;
    UNDO.push(P.ops); if (UNDO.length > UNDO_MAX) UNDO.shift(); REDO.length = 0; changed(); pop();
    toast(P.erase ? `擦掉 ${P.ops.length} 格磁磚` : `鋪了 ${P.ops.length} 格磁磚`); if (!P.erase) advise(P.ops[P.ops.length - 1].u);
  }
  function tap(cx, cy, u){
    if (TOOL === 'place' && PL){
      const g = ground(cx, cy); if (!g) return; const x = snap(g.x), z = snap(g.z);
      ghostAt(x, z, g.y); const u = tryPlace(PL.id, PL.v, x, z, PL.rot, g.y); ghostAt(x, z, g.y); if (u) advise(u); return;
    }
    if (TOOL === 'moveTo' && sel){
      const g = ground(cx, cy), it = S.items[sel]; if (!g || !it) return;
      const x = snap(g.x), z = snap(g.z), why = check(it.id, x, z, it.rot, sel, g.y);
      if (why){ toast(why); return; }
      TOOL = 'idle'; status(''); commit([{ u: sel, a: { ...it }, b: { ...it, x, y: g.y, z } }]); bounce(sel); return;
    }
    if (TOOL === 'demolish'){ demolishAt(cx, cy); return; }
    if (u) select(u); else if (sel) deselect();
  }
  addEventListener('keydown', (e) => {
    if (!ON || WALK.on || e.target.closest && e.target.closest('input')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y'){ e.preventDefault(); redo(); }
    else if (k === 'escape'){ if (cf.classList.contains('show')){ cf.classList.remove('show'); return; } endPlace(); deselect(); setDemolish(false); }
    else if (k === 'r') rotate();
    else if ((k === 'delete' || k === 'backspace') && sel){ e.preventDefault(); selAct('del'); }
  });

  // ---------- 拆除原有物件（M3，模擬人生的鐵鎚） ----------
  const frame = document.createElement('div'); frame.id = 'gFrame'; body.appendChild(frame);
  const markGeo = new THREE.BufferGeometry(), markPos = new Float32Array(RM.length * 3);
  markGeo.setAttribute('position', new THREE.BufferAttribute(markPos, 3));
  const marks = new THREE.Points(markGeo, new THREE.PointsMaterial({ color: 0xe53935, size: 11, sizeAttenuation: false }));
  marks.visible = false; marks.frustumCulled = false; fx.add(marks);
  function updMarks(){ RM.forEach((r, i) => { const c = r.box.getCenter(V); markPos.set([c.x, r.off ? -999 : r.box.max.y + .6, c.z], i * 3); }); markGeo.attributes.position.needsUpdate = true; rmDirty = false; }
  const hov = new THREE.Box3Helper(new THREE.Box3(), 0xe53935); hov.visible = false; fx.add(hov);
  function hoverRm(r){ hov.visible = !!r; if (r) hov.box.copy(r.box); }
  function setDemolish(on){
    if (on === (TOOL === 'demolish')) return;
    if (on){ endPlace(); sel = null; showSel(); TOOL = 'demolish'; status('移除：點一下要移走的物件（自己放的，或頭上有紅點的原有樹、樹籬、路燈、中庭桌椅）・可復原・按「完成」結束'); }
    else { TOOL = 'idle'; status(''); hoverRm(null); }
    body.classList.toggle('demolish', on); tb.demo.classList.toggle('on', on); marks.visible = on;
  }
  const HV = new THREE.Vector3();
  function pickRm(cx, cy){
    const R0 = ray(cx, cy); let best = null, bd = Infinity;
    for (const r of RM){ if (r.off) continue; const h = R0.intersectBox(r.box, HV); if (!h) continue; const d = h.distanceTo(R0.origin); if (d < bd){ bd = d; best = r; } }
    if (!best) return null;
    for (const b of occBoxes){ if (b.off || b.rm && b.rm.userData.rm) continue; const h = R0.intersectBox(b, HV); if (h && h.distanceTo(R0.origin) < bd - .5) return null; }   // 被建築擋住
    return best;
  }
  function demolishAt(cx, cy){
    const u = pick(cx, cy);
    if (u){ const it = S.items[u]; commit([{ u, a: { ...it }, b: null }]); toast(`移除了：${BY_ID[it.id].name}（可復原）`); return; }
    const r = pickRm(cx, cy);
    if (r){ const cost = (REMOVE[r.kind] || {}).cost || 0, left = BUDGET - spent();
      if (cost > left){ toast(`預算不夠：移除${rmName(r.kind)}要 ${cost} 點`); return; }
      commit([{ r: r.id, a: false, b: true }]); hoverRm(null); pop(); toast(`移除了原有的${rmName(r.kind)}${cost ? `（${cost} 點）` : ''}・可按「復原」`); return; }
    ray(cx, cy);   // 只在點擊時對整個場景打一次射線：打到地面以上的東西＝建築、圍牆等拆不掉的
    const hit = rc.intersectObjects(scene.children.filter((o) => o.isMesh), false).find((h) => h.point.y > .3);
    if (hit){
      canvas.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 320 });
      toast('這個不能移除（建築、圍牆、道路）'); }
    else toast('這裡沒有可以移除的東西');
  }

  // ---------- 校園評價（M4，規格書 §8） ----------
  header.insertAdjacentHTML('beforeend', '<button id="gStar" title="校園評價：點開看分數細節"></button>');
  const starEl = document.getElementById('gStar');
  const sc = document.createElement('div'); sc.id = 'gScore'; body.appendChild(sc);
  starEl.onclick = () => { sc.classList.toggle('show'); renderScore(); };
  let SC = null, prevSets = null;
  function rescore(){
    const L = Object.values(S.items).filter((o) => BY_ID[o.id]);
    SC = score(L, PTS, DARK);
    starEl.innerHTML = '★'.repeat(SC.stars) + '<span style="color:var(--line)">' + '★'.repeat(5 - SC.stars) + `</span><small>${Math.round(SC.total)} 分</small>`;
    const keys = SC.sets.map((t) => t.id + t.k);
    if (prevSets){ SC.sets.filter((t) => !prevSets.includes(t.id + t.k)).forEach((t) =>
      tip(`觸發套組「${t.name}」${t.k > 1 ? '（5 種加倍）' : ''}：${[['安全', t.safe], ['安心', t.calm], ['美化', t.beauty]].filter(([, v]) => v).map(([k, v]) => k + '+' + v).join(' ')}`, '套組加成')); }
    prevSets = keys;
    if (sc.classList.contains('show')) renderScore();
    drawLayers();
  }
  function renderScore(){
    if (!SC) return; const bar = (k, v, c) => `<div class="sbar"><span>${k}</span><i><b style="width:${v}%;background:${c}"></b></i><span>${Math.round(v)}</span></div>`;
    const pt = (p) => { const s = Math.min(SK.PER, Math.max(0, p.safe)), c = Math.min(SK.PER, Math.max(0, p.calm)), ok = s >= SK.PER * .5 && c >= SK.PER * .5;
      return `<li class="${ok ? 'ok' : 'no'}">${p.n}. ${p.title}：安全 ${s.toFixed(1)}／${SK.PER}・安心 ${c.toFixed(1)}／${SK.PER}${p.by.length ? `<br><small style="color:var(--sub)">${p.by.slice(0, 4).join('、')}${p.by.length > 4 ? '…' : ''}</small>` : ''}</li>`; };
    sc.innerHTML = `<h3>校園評價 ${'★'.repeat(SC.stars)}${'☆'.repeat(5 - SC.stars)} ${Math.round(SC.total)} 分<button aria-label="關閉">×</button></h3>`
      + bar('安全', SC.safe, '#e53935') + bar('安心', SC.calm, '#1f6feb') + bar('美化', SC.beauty, '#2e9d5a')
      + `<div style="color:var(--sub);font-size:12px;margin-top:2px">總分＝安全 ${SK.W.safe * 100}%＋安心 ${SK.W.calm * 100}%＋美化 ${SK.W.beauty * 100}%（暫定，待學習單）${SC.conc ? '・美化集中在一處，打 7 折' : ''}</div>`
      + `<h4>8 個危險點（綠＝安全、安心都過半）</h4><ul>${SC.pts.map(pt).join('')}</ul>`
      + `<h4>暗區照明</h4><ul>${SC.dark.map((d) => `<li class="${d.f >= .5 ? 'ok' : 'no'}">${d.name}：照亮 ${Math.round(d.f * 100)}%</li>`).join('')}</ul>`
      + `<h4>套組加成</h4>${SC.sets.length ? `<ul>${SC.sets.map((t) => `<li class="ok">${t.name}（${t.kinds} 種${t.k > 1 ? '，加倍' : ''}）</li>`).join('')}</ul>` : '<div style="color:var(--sub)">還沒有觸發（同一套組 8 m 內擺 3 種）</div>'}`;
    sc.querySelector('h3 button').onclick = () => sc.classList.remove('show');
  }

  // ---------- 圖層（模擬城市的資料圖層） ----------
  const LY = { pts: true, dark: true, light: false, help: false };
  const lay = new THREE.Group(); lay.name = 'layers'; scene.add(lay);
  const flatMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });
  const darkMeshes = DARK.map((d) => { const sh = new THREE.Shape(d.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), flatMat(0x1a237e, .42)); m.rotation.x = -Math.PI / 2; m.position.y = .09; m.renderOrder = 1; lay.add(m); return m; });
  const ringGeo = new THREE.RingGeometry(3.2, 4.2, 40); ringGeo.rotateX(-Math.PI / 2);
  const ptRings = PTS.map(([, , , , x, z]) => { const m = new THREE.Mesh(ringGeo, flatMat(0xe53935, .8)); m.position.set(x, .12, z); m.renderOrder = 2; lay.add(m); return m; });
  const discGeo = new THREE.CircleGeometry(1, 36); discGeo.rotateX(-Math.PI / 2);
  const mkDiscs = (c, o) => { const m = new THREE.InstancedMesh(discGeo, flatMat(c, o), 400); m.count = 0; m.renderOrder = 1; m.frustumCulled = false; lay.add(m); return m; };
  const lightDiscs = mkDiscs(0xffc928, .2), helpDiscs = mkDiscs(0x2ecc71, .18);
  const RED = new THREE.Color(0xe53935), GRN = new THREE.Color(0x2ecc71), YEL = new THREE.Color(0xf2c230);
  function drawLayers(){
    if (!SC) return;
    darkMeshes.forEach((m, i) => { m.visible = LY.dark; m.material.opacity = .42 * (1 - Math.min(1, SC.dark[i].f)) + .04; });
    ptRings.forEach((m, i) => { const p = SC.pts[i], f = (Math.min(SK.PER, Math.max(0, p.safe)) + Math.min(SK.PER, Math.max(0, p.calm))) / (2 * SK.PER);
      m.visible = LY.pts; m.material.color.copy(f < .5 ? RED.clone().lerp(YEL, f * 2) : YEL.clone().lerp(GRN, (f - .5) * 2)); });
    const fill = (im, pick, on) => { let n = 0; if (on) for (const o of Object.values(S.items)){ if (!pick(o.id) || !BY_ID[o.id].r) continue; if (n >= 400) break;
        const r = BY_ID[o.id].r; im.setMatrixAt(n++, M4.compose(V.set(o.x, (o.y || 0) + .1 + n * .0004, o.z), Q.identity(), SC3.set(r, 1, r))); }
      im.count = n; im.instanceMatrix.needsUpdate = true; };
    fill(lightDiscs, isLight, LY.light); fill(helpDiscs, isHelp, LY.help);
  }
  const SC3 = new THREE.Vector3();
  const lyEl = document.createElement('div'); lyEl.id = 'gLayers'; body.appendChild(lyEl);
  lyEl.innerHTML = [['pts', '危險點（紅→綠＝處理程度）', '#e53935'], ['dark', '暗區（被燈照到會變亮）', '#1a237e'], ['light', '照明覆蓋', '#ffc928'], ['help', '求助與監看覆蓋', '#2ecc71']]
    .map(([k, t, c]) => `<label><input type="checkbox" data-k="${k}"${LY[k] ? ' checked' : ''}><i style="background:${c}"></i>${t}</label>`).join('')
    + '<label class="off"><input type="checkbox" disabled><i style="background:#9b5de5"></i>心情熱區（探勘後開放）</label>';
  lyEl.querySelectorAll('input[data-k]').forEach((c) => c.onchange = () => { LY[c.dataset.k] = c.checked; if (c.dataset.k === 'pts') G.app && G.app.classList.toggle('hidePin', !c.checked); drawLayers(); });
  lyEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  function toggleLayers(){ const r = tb.layer.getBoundingClientRect(); lyEl.style.left = Math.max(8, r.left) + 'px'; lyEl.style.bottom = (innerHeight - r.top + 8) + 'px'; lyEl.classList.toggle('show'); tb.layer.classList.toggle('on', lyEl.classList.contains('show')); }
  tb.layer.onclick = toggleLayers;
  addEventListener('pointerdown', (e) => { if (lyEl.classList.contains('show') && !e.target.closest('#gLayers') && e.target !== tb.layer){ lyEl.classList.remove('show'); tb.layer.classList.remove('on'); } }, true);

  // ---------- 顧問提示（右下泡泡，一次一句，5 秒淡出，同句 2 分鐘內不重複） ----------
  const tipEl = document.createElement('div'); tipEl.id = 'gTip'; body.appendChild(tipEl);
  const said = new Map(); let tipT = 0, deco = 0;
  function tip(msg, who = '顧問'){
    const now = performance.now(); if (said.has(msg) && now - said.get(msg) < 120000) return; said.set(msg, now);
    tipEl.innerHTML = `<b>💡 ${who}</b>${msg}`; tipEl.classList.add('show'); clearTimeout(tipT); tipT = setTimeout(() => tipEl.classList.remove('show'), 5500);
  }
  const nearPt = (o, r) => PTS.some(([, , , , x, z]) => Math.hypot(x - o.x, z - o.z) <= r);
  const inDark = (o) => DARK.some((d) => inP(d.poly, o.x, o.z));
  function advise(u){
    const o = S.items[u]; if (!o) return; const it = BY_ID[o.id], left = BUDGET - spent();
    if (it.safe > 0 || it.cat === 'C') deco = 0; else if ('AGK'.includes(it.cat) || isTile(o.id)) deco++;
    if (it.tags.includes('dilemma')){
      tip(o.id === 'cctv' ? `安全 +${it.safe}，安心 ${it.calm}。有沒有不用監視就能讓人安心的做法？` : `兩難：安全 ${it.safe >= 0 ? '+' : ''}${it.safe}、安心 ${it.calm >= 0 ? '+' : ''}${it.calm}。想想有沒有兩全的做法？`, '兩難');
    } else if (isLight(o.id) && !inDark(o) && !nearPt(o, 20)){
      tip('這裡白天就夠亮，晚上也沒什麼人經過；燈放到資訊館後方、車棚這些暗區更有用。');
    } else if (it.cat === 'B' && nearPt(o, 20) && !Object.values(S.items).some((l) => isLight(l.id) && BY_ID[l.id].r && Math.hypot(l.x - o.x, l.z - o.z) <= BY_ID[l.id].r)){
      tip('座椅會讓人停留，這裡靠近危險點：記得加燈，或讓這裡看得見。');
    } else if (left <= BUDGET * .1){
      tip(`預算快用完了（剩 ${left} 點），看看哪些東西可以用更便宜的替代。`);
    } else if (deco > 8 && SC){
      const n = SC.pts.filter((p) => p.safe < SK.PER * .5).length;
      if (n) tip(`很好看！但還有 ${n} 個危險點的安全不到一半，記得也照顧一下。`);
    }
  }

  // 建造／瀏覽切換
  function setOn(v){
    ON = v; body.classList.toggle('building', ON); bBuild.classList.toggle('off', !ON); bBuild.textContent = ON ? '🛠 建造中' : '🛠 建造';
    if (!ON){ endPlace(); deselect(); setDemolish(false); }
  }
  bBuild.onclick = () => setOn(!ON);

  // ---------- 型錄縮圖：借主畫布左下角一小塊畫完立刻複製下來（不另開 WebGL，省 iPad 記憶體） ----------
  const THUMB = {}, THQ = [], TW = 180, TH = 153;
  let ts = null;
  function thumbInto(id, img){ if (THUMB[id]) img.src = THUMB[id]; else THQ.push([id, img]); }
  function thumbScene(){
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0xeef3ef);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x9aa88a, 1.9)); const l = new THREE.DirectionalLight(0xffffff, 1.9); l.position.set(-3, 6, 4); sc.add(l);
    const cam = new THREE.PerspectiveCamera(28, TW / TH, .01, 500), cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
    return { sc, cam, cv, cx: cv.getContext('2d') };
  }
  const EL = 25 * D2R, AZ = 32 * D2R, DIR = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
  function shoot(id){
    ts = ts || thumbScene(); const { sc, cam, cv, cx } = ts, g = build(id); sc.add(g);
    const box = new THREE.Box3().setFromObject(g), ctr = box.getCenter(new THREE.Vector3()), pts = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [Math.max(0, box.min.y), box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
    const ok = (d) => { cam.position.copy(ctr).addScaledVector(DIR, d); cam.lookAt(ctr); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      return pts.every((p) => { const v = p.clone().project(cam); return Math.abs(v.x) < .86 && Math.abs(v.y) < .84 && v.z < 1; }); };
    cam.near = .01; cam.far = 1000; let lo = .05, hi = 300; for (let i = 0; i < 30; i++){ const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; } ok(hi);
    cam.near = hi / 50; cam.far = hi * 6; cam.updateProjectionMatrix();
    const pr = renderer.getPixelRatio(), H = renderer.domElement.height, size = renderer.getSize(new THREE.Vector2());
    renderer.setScissorTest(true); renderer.setScissor(0, 0, TW, TH); renderer.setViewport(0, 0, TW, TH);
    renderer.render(sc, cam);
    cx.clearRect(0, 0, TW, TH); cx.drawImage(renderer.domElement, 0, H - TH * pr, TW * pr, TH * pr, 0, 0, TW, TH);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y);
    sc.remove(g); return cv.toDataURL('image/png');
  }

  // ---------- 每幀（index.html 的繪圖迴圈在主畫面繪製前呼叫） ----------
  const SP = new THREE.Vector3();
  window.__gameTick = () => {
    if (document.documentElement.classList.contains('introOn')) return;
    for (let n = 0; n < 3 && THQ.length; n++){ const [id, img] = THQ.shift(); if (!img.isConnected && THUMB[id]) continue; THUMB[id] = THUMB[id] || shoot(id); img.src = THUMB[id]; }
    if (ANIM.size){ const now = performance.now(), ks = new Set();
      for (const [u, t] of ANIM){ const it = S.items[u]; if (it) ks.add(keyOf(it)); if (now - t > 170) ANIM.delete(u); }
      ks.forEach(refresh); }
    const it = sel && S.items[sel];
    if (it && ON && !WALK.on){
      SP.set(it.x, yOf(it) + BY_ID[it.id].h + .3, it.z).project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      if (SP.z < 1){ pop2.style.display = 'block'; pop2.style.left = Math.max(110, Math.min(r.width - 110, (SP.x + 1) / 2 * r.width + r.left)) + 'px'; pop2.style.top = Math.max(90, (1 - SP.y) / 2 * r.height + r.top) + 'px'; }
      else pop2.style.display = 'none';
    } else if (pop2.style.display !== 'none') pop2.style.display = 'none';
    if (rmDirty && marks.visible) updMarks();
    fx.visible = !WALK.on;
  };

  // ---------- 開始 ----------
  if (h1) h1.textContent = '花蓮高商・校園改造';
  const n = load(); renderCat(); setOn(true); hud();
  const k = Object.keys(S.removed).length;
  if (n || k) toast(`已載入上次的改造：${n} 件物件${k ? `、移除 ${k} 件原有物件` : ""}`);
  rescore();
  window.__gameState = { S, RM, SURF, askReset, doReset, get SC(){ return SC; }, tip, LY, drawLayers, tryPlace, check, select, undo, redo, startPlace, endPlace, setDemolish, pickRm, ground, get sel(){ return sel; }, get TOOL(){ return TOOL; } };   // 測試用
}
