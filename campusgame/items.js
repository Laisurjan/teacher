// 校園改造遊戲 物件模型（115/11/05，規格書 §6）
// 全部用程式畫的低多邊形幾何體，不載入外部模型。物件中心在原點、正面朝 +z、底面 y=0，單位公尺。
// 遊戲裡用 bake(id) 把一個物件依材質合併成少數幾塊，再做成 InstancedMesh。
import * as THREE from '../campus3d/lib/three.module.js';
import { mergeGeometries } from '../campus3d/lib/BufferGeometryUtils.js';
import { CATS, ITEMS, PALETTE, SETS } from './items-data.js';
export { CATS, ITEMS, PALETTE, SETS };

const PI = Math.PI, DS = THREE.DoubleSide;
const FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';

// ---------- 材質（依參數快取，相同顏色共用一個材質，合併時才能併在一起） ----------
const MC = new Map();
const keyOf = (o) => JSON.stringify(o, (k, v) => (v && v.isTexture ? v.uuid : v));
export function mat(c, o = {}){
  const key = 'L' + c + keyOf(o);
  let m = MC.get(key);
  if (!m){ m = new THREE.MeshLambertMaterial({ color: c, ...o }); MC.set(key, m); }
  return m;
}
function phong(c, o = {}){
  const key = 'P' + c + keyOf(o);
  let m = MC.get(key);
  if (!m){ m = new THREE.MeshPhongMaterial({ color: c, ...o }); MC.set(key, m); }
  return m;
}
const glow = (c, k = 1) => mat(c, { emissive: c, emissiveIntensity: k });
const glass = () => mat(0xbfe3f0, { transparent: true, opacity: .3, depthWrite: false, side: DS });
const water = () => mat(0x5fb3e6, { transparent: true, opacity: .85 });

// ---------- 貼圖（canvas 畫，依名稱快取） ----------
const TX = new Map();
function tex(key, w, h, draw){
  if (TX.has(key)) return TX.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  TX.set(key, t); return t;
}
const tmat = (t, o = {}) => mat(0xffffff, { map: t, ...o });
function sign(key, text, { w = 256, h = 128, bg = '#fff', fg = '#222', size = 48, border = null } = {}){
  return tex(key, w, h, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    if (border){ x.lineWidth = 8; x.strokeStyle = border; x.strokeRect(4, 4, w - 8, h - 8); }
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 ${size}px ${FONT}`;
    const L = text.split('\n');
    L.forEach((s, i) => x.fillText(s, w / 2, h / 2 + (i - (L.length - 1) / 2) * size * 1.18));
  });
}
function rng(seed){ let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// ---------- 建模小工具：B/C/K 的 y 是底面，S/T/P 的 y 是中心 ----------
function mesh(g, geo, m, x = 0, y = 0, z = 0){
  const mm = typeof m === 'number' ? mat(m) : m;
  const o = new THREE.Mesh(geo, mm); o.position.set(x, y, z);
  o.castShadow = !mm.transparent; o.receiveShadow = true; g.add(o); return o;
}
const B = (g, w, h, d, m, x = 0, y = 0, z = 0, ry = 0) => { const o = mesh(g, new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z); o.rotation.y = ry; return o; };
const C = (g, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 8) => mesh(g, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);
const S = (g, r, m, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, det = 1) => { const o = mesh(g, new THREE.IcosahedronGeometry(r, det), m, x, y, z); o.scale.set(sx, sy, sz); return o; };
const K = (g, r, h, m, x = 0, y = 0, z = 0, seg = 8) => mesh(g, new THREE.ConeGeometry(r, h, seg), m, x, y + h / 2, z);
const T = (g, R, t, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, arc = 2 * PI, seg = 12, rad = 5) => { const o = mesh(g, new THREE.TorusGeometry(R, t, rad, seg, arc), m, x, y, z); o.rotation.set(rx, ry, rz); return o; };
function Rod(g, a, b, r, m, seg = 5){
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const o = mesh(g, new THREE.CylinderGeometry(r, r, A.distanceTo(Bv), seg), m);
  o.position.copy(A).add(Bv).multiplyScalar(.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize()); return o;
}
const P = (g, w, h, m, x = 0, y = 0, z = 0, ry = 0) => { const o = mesh(g, new THREE.PlaneGeometry(w, h), m, x, y, z); o.rotation.y = ry; o.castShadow = false; return o; };
const Fl = (g, w, d, m, y = .005, x = 0, z = 0) => { const o = mesh(g, new THREE.PlaneGeometry(w, d), m, x, y, z); o.rotation.x = -PI / 2; o.castShadow = false; return o; };
function Leaf(g, x, y, z, len, wid, m, ry, tilt){   // 葉片：從 (x,y,z) 往外伸，tilt 正值下垂、負值上揚
  const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.order = 'YXZ'; p.rotation.y = ry; p.rotation.x = tilt; g.add(p);
  mesh(p, new THREE.BoxGeometry(wid, .02, len), m, 0, 0, len / 2);
}
function Frond(g, x, y, z, len, wid, m, ry, up = .7, droop = .5){   // 拱形葉：前 55% 上揚、後段下垂
  const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.order = 'YXZ'; p.rotation.y = ry; p.rotation.x = -up; g.add(p);
  const a = len * .55, b = len - a;
  mesh(p, new THREE.BoxGeometry(wid, .02, a), m, 0, 0, a / 2);
  const q = new THREE.Group(); q.position.z = a; q.rotation.x = up + droop; p.add(q);
  mesh(q, new THREE.BoxGeometry(wid * .7, .02, b), m, 0, 0, b / 2);
}
function tri(g, m, a, b, c){   // 單一三角形（雙面）
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, .5, 1], 2));
  geo.computeVertexNormals();
  const o = mesh(g, geo, typeof m === 'number' ? mat(m, { side: DS }) : m); o.castShadow = true; return o;
}
const sub = (g, x = 0, y = 0, z = 0, ry = 0) => { const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = ry; g.add(p); return p; };

// ---------- 常用顏色 ----------
const WOOD = 0xa8763e, WOOD_D = 0x6b4423, WOOD_L = 0xc89a62, MET = 0x4a5056, MET_L = 0xb8bec4, STONE = 0xa9a59b, STONE_D = 0x7d7a73,
  POT = 0xb8643a, SOIL = 0x4a3424, LEAF = 0x4d8a3f, LEAF2 = 0x3f7a35, LEAF3 = 0x6aa84f, WHITE = 0xf2f0ea, RED = 0xd63b2f,
  ORANGE = 0xf4511e, YELLOW = 0xf2c230, BLACK = 0x222222, TRUNK = 0x6b4a2f, RATTAN = 0x8a6a45, CREAM = 0xe8dcc0;
const FLOWERS = [0xe53935, 0xffd54f, 0xffffff, 0xf06292, 0xba68c8];
function pot(g, rt, rb, h, c = POT){
  C(g, rt, rb, h, c, 0, 0, 0, 10); C(g, rt * 1.08, rt * 1.08, .04, c, 0, h - .04, 0, 10); C(g, rt * .95, rt * .95, .01, SOIL, 0, h, 0, 10);
}

// ---------- 貼圖內容 ----------
function drawSosSign(x, w, h){   // 校內 SOS 求助柱頂端的藍色屋形牌（老師照片 560768.jpg）
  x.beginPath(); x.moveTo(2, 88); x.lineTo(w / 2, 2); x.lineTo(w - 2, 88); x.lineTo(w - 2, h - 2); x.lineTo(2, h - 2); x.closePath();
  x.fillStyle = '#8ec5e8'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#5e9cc4'; x.stroke();
  x.beginPath(); x.arc(w / 2, 58, 26, 0, 7); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#333'; x.stroke();
  x.fillStyle = '#222'; x.font = '700 30px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('10', w / 2, 60);
  x.fillStyle = '#fff'; x.fillRect(26, 110, w - 52, 112);
  x.fillStyle = '#e03a3a'; x.font = '900 84px Arial'; x.fillText('SOS', w / 2, 168);
}
function drawSosWin(x, w, h){
  const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#b8c8d2'); gr.addColorStop(1, '#8fa3b0');
  x.fillStyle = gr; x.fillRect(0, 0, w, h);
  x.fillStyle = '#d32f2f'; x.font = '900 40px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  ['S', 'O', 'S'].forEach((s, i) => x.fillText(s, 34, 34 + i * 48));
  x.fillStyle = '#3a3f44'; x.fillRect(84, 26, 86, 110);
  x.fillStyle = '#d32f2f'; x.beginPath(); x.arc(127, 106, 14, 0, 7); x.fill();
  x.fillStyle = '#cfd8dc'; x.beginPath(); x.arc(127, 58, 16, 0, 7); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 10; x.beginPath(); x.moveTo(10, 150); x.lineTo(150, 10); x.stroke();
}
function drawAed(x, w, h){
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#00a650'; x.fillRect(28, 20, w - 56, w - 56);
  const cx = w / 2, cy = 20 + (w - 56) / 2;
  x.fillStyle = '#fff'; x.beginPath(); x.moveTo(cx, cy + 50); x.bezierCurveTo(cx - 80, cy - 10, cx - 40, cy - 70, cx, cy - 30);
  x.bezierCurveTo(cx + 40, cy - 70, cx + 80, cy - 10, cx, cy + 50); x.fill();
  x.fillStyle = '#00a650'; x.beginPath(); x.moveTo(cx + 8, cy - 40); x.lineTo(cx - 18, cy + 4); x.lineTo(cx, cy + 4); x.lineTo(cx - 10, cy + 40);
  x.lineTo(cx + 20, cy - 6); x.lineTo(cx + 2, cy - 6); x.closePath(); x.fill();
  x.fillStyle = '#00a650'; x.font = '900 64px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('AED', cx, h - 50);
}
function drawCross(x, w, h){
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#d32f2f'; x.fillRect(w / 2 - 22, 30, 44, 130); x.fillRect(w / 2 - 65, 73, 130, 44);
  x.font = `900 46px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('急救箱', w / 2, h - 40);
}
function drawMap(x, w, h){
  x.fillStyle = '#f6f1e3'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#3d2373'; x.fillRect(0, 0, w, 44); x.fillStyle = '#fff'; x.font = `900 30px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('校園安全地圖', w / 2, 23);
  x.fillStyle = '#c75b39'; x.beginPath(); x.ellipse(260, 150, 90, 60, 0, 0, 7); x.fill();
  x.fillStyle = '#7cb85f'; x.beginPath(); x.ellipse(260, 150, 70, 42, 0, 0, 7); x.fill();
  x.fillStyle = '#9aa1a6'; [[30, 60, 40, 150], [90, 70, 70, 30], [90, 120, 70, 30], [100, 200, 120, 34], [330, 60, 40, 40]].forEach(([a, b, c, d]) => x.fillRect(a, b, c, d));
  [[60, 225, '#d7263d'], [150, 180, '#e0457b'], [355, 210, '#f29bb3'], [200, 60, '#f29bb3']].forEach(([a, b, c]) => {
    x.beginPath(); x.arc(a, b, 10, 0, 7); x.fillStyle = c; x.fill(); x.lineWidth = 3; x.strokeStyle = '#ffe14d'; x.stroke(); });
  x.fillStyle = '#d32f2f'; x.beginPath(); x.arc(240, 230, 8, 0, 7); x.fill(); x.fillStyle = '#222'; x.font = `700 16px ${FONT}`; x.fillText('你在這裡', 300, 232);
}
function drawAssembly(x, w, h){
  x.fillStyle = '#00873e'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(14, 14, w - 28, w - 70);
  x.fillStyle = '#fff';
  [[w / 2 - 34, 92], [w / 2, 82], [w / 2 + 34, 92], [w / 2, 128]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b - 20, 11, 0, 7); x.fill(); x.fillRect(a - 10, b - 6, 20, 30); });
  [[30, 40, 60, 70], [w - 30, 40, w - 60, 70], [30, w - 90, 60, w - 120], [w - 30, w - 90, w - 60, w - 120]].forEach(([a, b, c, d]) => {
    x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); });
  x.font = `900 34px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('緊急集合點', w / 2, h - 30);
}
function drawNoSmoke(x, w, h){
  x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 2, 0, 7); x.fill();
  x.fillStyle = '#555'; x.fillRect(w * .22, h * .47, w * .45, h * .08); x.fillStyle = '#e8a03c'; x.fillRect(w * .67, h * .47, w * .1, h * .08);
  x.strokeStyle = '#d32f2f'; x.lineWidth = w * .09; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - w * .07, 0, 7); x.stroke();
  x.beginPath(); x.moveTo(w * .22, h * .22); x.lineTo(w * .78, h * .78); x.stroke();
}
function drawGuide(x, w, h){
  x.fillStyle = '#f2c230'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#5a4500';
  for (let i = 0; i < 6; i++){ const a = 20 + i * 84; x.beginPath(); x.moveTo(a, 6); x.lineTo(a + 30, h / 2); x.lineTo(a, h - 6); x.lineTo(a + 14, h / 2); x.closePath(); x.fill(); }
}
function drawCctvSign(x, w, h){
  x.fillStyle = '#f2c230'; x.fillRect(0, 0, w, h); x.strokeStyle = '#222'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
  x.fillStyle = '#222'; x.fillRect(22, 40, 60, 34); x.beginPath(); x.moveTo(82, 46); x.lineTo(104, 34); x.lineTo(104, 80); x.lineTo(82, 68); x.fill();
  x.font = `900 34px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('錄影', 180, 42); x.fillText('監視中', 180, 86);
}
function drawExt(x, w, h){
  x.fillStyle = '#e8eef1'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#d32f2f'; x.fillRect(w / 2 - 22, 50, 44, 110); x.beginPath(); x.arc(w / 2, 50, 22, PI, 0); x.fill();
  x.fillStyle = '#222'; x.fillRect(w / 2 - 8, 14, 16, 18); x.fillRect(w / 2 + 6, 18, 30, 8);
  x.fillStyle = '#fff'; x.fillRect(w / 2 - 16, 90, 32, 30);
  x.fillStyle = '#d32f2f'; x.font = `900 30px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('滅火器', w / 2, h - 22);
}
function drawInfo(x, w, h){
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#2e7d4f'; x.fillRect(0, 0, w, 60);
  x.fillStyle = '#fff'; x.font = `900 42px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('告 示', w / 2, 32);
  x.fillStyle = '#222'; x.font = `800 30px ${FONT}`; x.fillText('校園內請放慢腳步', w / 2, 105); x.fillText('互相照應 注意安全', w / 2, 150);
  x.fillStyle = '#888'; x.font = `600 20px ${FONT}`; x.fillText('（學生可自訂文字）', w / 2, 200);
}
function drawChess(x, w, h){
  x.fillStyle = '#e9d3a0'; x.fillRect(0, 0, w, h); x.strokeStyle = '#6b3d1a'; x.lineWidth = 2;
  const m = 20, cw = (w - 2 * m) / 8, ch = (h - 2 * m) / 9;
  for (let i = 0; i <= 9; i++){ x.beginPath(); x.moveTo(m, m + i * ch); x.lineTo(w - m, m + i * ch); x.stroke(); }
  for (let j = 0; j <= 8; j++){ if (j === 0 || j === 8){ x.beginPath(); x.moveTo(m + j * cw, m); x.lineTo(m + j * cw, h - m); x.stroke(); continue; }
    x.beginPath(); x.moveTo(m + j * cw, m); x.lineTo(m + j * cw, m + 4 * ch); x.moveTo(m + j * cw, m + 5 * ch); x.lineTo(m + j * cw, h - m); x.stroke(); }
  x.fillStyle = '#6b3d1a'; x.font = `900 22px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('楚 河', w * .3, m + 4.5 * ch); x.fillText('漢 界', w * .7, m + 4.5 * ch);
  [[2, 0, '#c62828', '帥'], [6, 9, '#222', '將'], [1, 2, '#c62828', '炮'], [7, 7, '#222', '馬']].forEach(([a, b, c, s]) => {
    x.beginPath(); x.arc(m + a * cw, m + b * ch, 11, 0, 7); x.fillStyle = '#f7e7c4'; x.fill(); x.strokeStyle = c; x.stroke();
    x.fillStyle = c; x.font = `900 13px ${FONT}`; x.fillText(s, m + a * cw, m + b * ch + 1); });
}
function drawPingpong(x, w, h){
  x.fillStyle = '#1e5aa8'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
  x.lineWidth = 3; x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
}
function drawFlag(x, w, h){
  x.fillStyle = '#2b7bbf'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2c230'; x.fillRect(0, h * .78, w, h * .1);
  x.fillStyle = '#fff'; x.font = `900 ${h * .42}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('花商', w / 2, h * .42);
}
function drawGraffiti(x, w, h){
  x.fillStyle = '#d9d4ca'; x.fillRect(0, 0, w, h);
  const r = rng(11), cols = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#f15bb5'];
  for (let i = 0; i < 26; i++){ x.fillStyle = cols[i % cols.length]; x.globalAlpha = .85; x.beginPath();
    x.ellipse(r() * w, r() * h, 20 + r() * 70, 14 + r() * 40, r() * 3, 0, 7); x.fill(); }
  x.globalAlpha = 1; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  [['PEACE', 135, 95, '#fff', '#1982c4', 76], ['加油！', 390, 175, '#ffca3a', '#222', 70], ['你很棒', 190, 285, '#fff', '#f15bb5', 76]].forEach(([s, a, b, f, st, sz]) => {
    x.font = `900 ${sz}px ${FONT}`; x.lineWidth = 12; x.strokeStyle = st; x.strokeText(s, a, b); x.fillStyle = f; x.fillText(s, a, b); });
  x.fillStyle = '#ff595e'; [[60, 300], [450, 300], [470, 40]].forEach(([a, b]) => { x.beginPath(); x.moveTo(a, b + 18); x.bezierCurveTo(a - 30, b - 4, a - 12, b - 26, a, b - 8); x.bezierCurveTo(a + 12, b - 26, a + 30, b - 4, a, b + 18); x.fill(); });
}
function drawChalk(x, w, h){
  x.fillStyle = '#2e4a3a'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.9)'; x.font = `800 40px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText('今天的心情是？', 24, 46);
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 4;
  [[70, 140], [190, 140], [310, 140]].forEach(([a, b], i) => { x.beginPath(); x.arc(a, b, 30, 0, 7); x.stroke();
    x.beginPath(); x.arc(a - 10, b - 8, 3, 0, 7); x.arc(a + 10, b - 8, 3, 0, 7); x.stroke();
    x.beginPath(); if (i === 0) x.arc(a, b + 4, 14, .2, PI - .2); else if (i === 1){ x.moveTo(a - 12, b + 12); x.lineTo(a + 12, b + 12); } else x.arc(a, b + 22, 14, PI + .3, -.3); x.stroke(); });
  x.fillStyle = '#f7d774'; x.font = `800 26px ${FONT}`; x.fillText('想說的話寫這裡 ↓', 24, 210);
}
function drawUsb(x, w, h){
  x.fillStyle = '#263238'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#7CFC9A'; x.font = `900 30px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('充電', w / 2, 30);
  x.fillStyle = '#90a4ae'; [70, 120, 170].forEach((b) => x.fillRect(w / 2 - 22, b, 44, 22));
  x.fillStyle = '#263238'; [70, 120, 170].forEach((b) => x.fillRect(w / 2 - 14, b + 6, 28, 8));
}
function drawKeys(x, w, h){
  x.fillStyle = '#fafafa'; x.fillRect(0, 0, w, h); x.strokeStyle = '#999'; x.lineWidth = 1;
  const n = 26, kw = w / n; for (let i = 0; i <= n; i++){ x.beginPath(); x.moveTo(i * kw, 0); x.lineTo(i * kw, h); x.stroke(); }
  x.fillStyle = '#111'; for (let i = 0; i < n - 1; i++){ if ([2, 6].includes(i % 7)) continue; x.fillRect((i + 1) * kw - kw * .3, 0, kw * .6, h * .6); }
}
function drawPianoArt(x, w, h){
  x.fillStyle = '#f2a65a'; x.fillRect(0, 0, w, h);
  const cols = ['#e76f51', '#2a9d8f', '#e9c46a', '#264653', '#f4a261'];
  for (let i = 0; i < 9; i++){ x.fillStyle = cols[i % 5]; x.beginPath(); x.arc(30 + i * 56, h / 2 + Math.sin(i) * 24, 18 + (i % 3) * 8, 0, 7); x.fill(); }
  x.fillStyle = '#fff'; x.font = `900 40px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♪ 彈一首吧 ♫', w / 2, h / 2);
}
function drawCarriageWin(x, w, h){
  x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#d4af37'; x.beginPath(); x.moveTo(20, h - 10); x.lineTo(20, 60); x.arc(w / 2, 60, w / 2 - 20, PI, 0); x.lineTo(w - 20, h - 10); x.fill();
  x.fillStyle = '#9fd3e8'; x.beginPath(); x.moveTo(30, h - 18); x.lineTo(30, 62); x.arc(w / 2, 62, w / 2 - 30, PI, 0); x.lineTo(w - 30, h - 18); x.fill();
  x.fillStyle = '#f48fb1'; x.fillRect(30, 50, 22, h - 70); x.fillRect(w - 52, 50, 22, h - 70);
}
const stripes = (key, a, b, n, vertical = true) => tex(key, 256, 256, (x, w, h) => {
  for (let i = 0; i < n; i++){ x.fillStyle = i % 2 ? b : a; if (vertical) x.fillRect(i * w / n, 0, w / n + 1, h); else x.fillRect(0, i * h / n, w, h / n + 1); } });

// ---------- 地板磁磚貼圖（1 m × 1 m ＝ 256 px） ----------
// ---------- J／K／L 擴充用貼圖（115/11/05） ----------
function heart(x, a, b, s){ x.beginPath(); x.moveTo(a, b + s * .7); x.bezierCurveTo(a - s * 1.2, b - s * .1, a - s * .5, b - s, a, b - s * .35); x.bezierCurveTo(a + s * .5, b - s, a + s * 1.2, b - s * .1, a, b + s * .7); x.fill(); }
function drawBuddy(x, w, h){
  x.fillStyle = '#fff7e0'; x.fillRect(0, 0, w, h); x.strokeStyle = '#3f8fd2'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#e8505b'; heart(x, w / 2, 44, 24);
  x.fillStyle = '#1d3557'; x.font = `900 46px ${FONT}`; x.fillText('夥伴長凳', w / 2, 100);
  x.fillStyle = '#3f6f9f'; x.font = `800 22px ${FONT}`; x.fillText('想有人陪，就坐這裡', w / 2, 150);
}
function drawTalk(x, w, h){
  x.fillStyle = '#fff7e0'; x.fillRect(0, 0, w, h); x.fillStyle = '#e9a23b';
  x.beginPath(); x.ellipse(w / 2, h * .44, w * .45, h * .37, 0, 0, 7); x.fill();
  x.beginPath(); x.moveTo(w * .3, h * .7); x.lineTo(w * .2, h * .97); x.lineTo(w * .44, h * .76); x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 40px ${FONT}`; x.fillText('想聊聊嗎？', w / 2, h * .44);
}
function drawMood(x, w, h){
  x.fillStyle = '#fffaf0'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#3d2373'; x.fillRect(0, 0, w, 80); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 46px ${FONT}`; x.fillText('今天的心情', w / 2, 42);
  const rows = [['#ff8a65', '超開心', 3], ['#ffd54f', '還不錯', 5], ['#aed581', '普通', 4], ['#81d4fa', '有點累', 3], ['#9575cd', '想找人聊', 1]];
  const gr = x.createLinearGradient(0, 110, 0, h - 40); rows.forEach(([c], i) => gr.addColorStop(i / 4, c));
  x.fillStyle = gr; x.fillRect(32, 110, 36, h - 150); x.fillStyle = '#9575cd'; x.beginPath(); x.arc(50, h - 40, 30, 0, 7); x.fill();
  rows.forEach(([c, t, n], i) => { const y = 130 + i * 84, k = (2 - i) * 5;
    x.fillStyle = c; x.beginPath(); x.arc(120, y, 28, 0, 7); x.fill(); x.fillStyle = '#333';
    [110, 130].forEach((a) => { x.beginPath(); x.arc(a, y - 7, 4, 0, 7); x.fill(); });
    x.strokeStyle = '#333'; x.lineWidth = 4; x.beginPath(); x.moveTo(108, y + 9 - k * .3); x.quadraticCurveTo(120, y + 9 + k, 132, y + 9 - k * .3); x.stroke();
    x.textAlign = 'left'; x.font = `800 30px ${FONT}`; x.fillText(t, 162, y);
    for (let j = 0; j < n; j++){ x.fillStyle = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#e76f51'][(i + j) % 5]; x.beginPath(); x.arc(300 + j * 19, y, 8, 0, 7); x.fill(); }
  });
}
function drawMarble(x, w, h){
  x.fillStyle = '#eceae4'; x.fillRect(0, 0, w, h); const r = rng(77);
  for (let i = 0; i < 10; i++){ x.strokeStyle = i % 3 ? 'rgba(150,150,158,.3)' : 'rgba(110,110,120,.4)'; x.lineWidth = .6 + r() * 1.2;
    let a = r() * w, b = r() * h; x.beginPath(); x.moveTo(a, b); for (let k = 0; k < 6; k++){ a += (r() - .3) * 60; b += (r() - .5) * 50; x.lineTo(a, b); } x.stroke(); }
}
function drawSchool(x, w, h){
  x.fillStyle = '#8f8b83'; x.fillRect(0, 0, w, h); const r = rng(5);
  for (let i = 0; i < 260; i++){ x.fillStyle = r() < .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; x.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 4); }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 108px ${FONT}`;
  x.fillStyle = 'rgba(0,0,0,.35)'; x.fillText('花蓮高商', w / 2 + 3, h * .42 + 3); x.fillStyle = '#b3261e'; x.fillText('花蓮高商', w / 2, h * .42);
  x.font = `800 30px ${FONT}`; x.fillStyle = '#2b2620'; x.fillText('國立花蓮高級商業職業學校', w / 2, h * .8);
}
function drawHands(x, w, h){
  x.fillStyle = '#f7f3ea'; x.fillRect(0, 0, w, h);
  const r = rng(23), cols = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#9b5de5', '#f15bb5', '#00b4d8', '#80b918', '#ffb703'];
  for (let i = 0; i < 46; i++){ const a = 60 + r() * (w - 120), b = 170 + r() * (h - 220), s = 24 + r() * 10, t = (r() - .5) * .8;
    x.save(); x.translate(a, b); x.rotate(t); x.fillStyle = cols[i % cols.length]; x.globalAlpha = .85;
    x.beginPath(); x.ellipse(0, s * .4, s * .9, s, 0, 0, 7); x.fill();
    [[-.95, -.1, -.7], [-.4, -1.05, -.12], [.05, -1.25, 0], [.48, -1.1, .12], [.85, -.6, .4]].forEach(([fx, fy, fr]) => { x.beginPath(); x.ellipse(fx * s, fy * s, s * .22, s * .5, fr, 0, 7); x.fill(); });
    x.restore(); }
  x.globalAlpha = 1; x.fillStyle = 'rgba(247,243,234,.9)'; x.fillRect(0, 20, w, 100);
  x.fillStyle = '#1d3557'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 64px ${FONT}`; x.fillText('我們在這裡長大', w / 2, 70);
}
function drawClock(x, w, h){
  const c = w / 2; x.fillStyle = '#1f4d3a'; x.fillRect(0, 0, w, h); x.fillStyle = '#fbf8ef'; x.beginPath(); x.arc(c, c, w * .47, 0, 7); x.fill();
  x.strokeStyle = '#222'; x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 30px ${FONT}`;
  for (let i = 0; i < 12; i++){ const a = i / 12 * 2 * PI; x.lineWidth = i % 3 ? 3 : 6;
    x.beginPath(); x.moveTo(c + Math.sin(a) * 100, c - Math.cos(a) * 100); x.lineTo(c + Math.sin(a) * 112, c - Math.cos(a) * 112); x.stroke();
    if (i % 3 === 0) x.fillText(String(i || 12), c + Math.sin(a) * 80, c - Math.cos(a) * 80); }
  const hand = (a, l, lw) => { x.lineWidth = lw; x.lineCap = 'round'; x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.sin(a) * l, c - Math.cos(a) * l); x.stroke(); };
  hand((7 + 50 / 60) / 12 * 2 * PI, 55, 8); hand(50 / 60 * 2 * PI, 85, 5);
}
// 太魯閣族織布的菱形紋（待原民老師審查配色與紋樣）：紅底，黑白同心菱形
function rhombusBand(x, cx, cy, rw, rh){
  [['#f5efe0', 1], ['#1b1b1b', .78], ['#a3161a', .58], ['#f5efe0', .4], ['#1b1b1b', .2]].forEach(([c, k]) => { x.fillStyle = c;
    x.beginPath(); x.moveTo(cx, cy - rh * k); x.lineTo(cx + rw * k, cy); x.lineTo(cx, cy + rh * k); x.lineTo(cx - rw * k, cy); x.closePath(); x.fill(); });
}
function drawRhombus(x, w, h){
  x.fillStyle = '#a3161a'; x.fillRect(0, 0, w, h);
  [[.05, '#1b1b1b'], [.09, '#f5efe0'], [.88, '#f5efe0'], [.92, '#1b1b1b']].forEach(([y, c]) => { x.fillStyle = c; x.fillRect(0, h * y, w, h * .025); });
  const n = 5, rw = w / n / 2; for (let i = 0; i < n; i++) rhombusBand(x, rw * (2 * i + 1), h / 2, rw * .9, h * .26);
  x.fillStyle = '#f5efe0'; for (let i = 0; i <= n * 2; i++) [.18, .82].forEach((yy) => { const a = i * rw;
    x.beginPath(); x.moveTo(a, h * (yy - .035)); x.lineTo(a + rw * .35, h * yy); x.lineTo(a, h * (yy + .035)); x.lineTo(a - rw * .35, h * yy); x.fill(); });
}
function drawRhombusTile(x, w, h){ x.fillStyle = '#a3161a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#1b1b1b'; x.lineWidth = 12; x.strokeRect(6, 6, w - 12, h - 12); rhombusBand(x, w / 2, h / 2, w * .4, h * .4); }
function drawEco(x, w, h){
  x.fillStyle = '#f4efe1'; x.fillRect(0, 0, w, h); x.fillStyle = '#2e7d4f'; x.fillRect(0, 0, w, 56);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 36px ${FONT}`; x.fillText('生態觀察站', w / 2, 30);
  x.fillStyle = '#f08a24'; [-1, 1].forEach((s) => { x.beginPath(); x.ellipse(80 + s * 24, 112, 22, 30, s * .5, 0, 7); x.fill(); x.beginPath(); x.ellipse(80 + s * 18, 152, 14, 18, -s * .4, 0, 7); x.fill(); });
  x.fillStyle = '#222'; x.fillRect(77, 96, 6, 70);
  x.fillStyle = '#d62828'; x.beginPath(); x.arc(200, 134, 34, 0, 7); x.fill(); x.fillStyle = '#222'; x.beginPath(); x.arc(200, 100, 14, 0, 7); x.fill(); x.fillRect(198, 100, 4, 68);
  [[186, 124], [214, 124], [184, 150], [216, 150]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 6, 0, 7); x.fill(); });
  x.fillStyle = '#5a9e3a'; x.beginPath(); x.ellipse(320, 132, 26, 44, .6, 0, 7); x.fill(); x.strokeStyle = '#2e5e22'; x.lineWidth = 4; x.beginPath(); x.moveTo(298, 164); x.lineTo(342, 100); x.stroke();
  x.fillStyle = '#333'; x.font = `800 24px ${FONT}`; ['蝴蝶', '昆蟲', '植物'].forEach((t, i) => x.fillText(t, 80 + i * 120, 210));
}

// 阿美族服飾配色的幾何紋（待阿美族老師審查）：紅底，黑白鋸齒帶，黃綠細線，中段黑菱格
function drawAmis(x, w, h){
  x.fillStyle = '#c4161c'; x.fillRect(0, 0, w, h);
  const band = (y0, bh, up) => { x.fillStyle = '#111'; x.fillRect(0, y0, w, bh); x.fillStyle = '#f5efe0'; const n = 16, tw = w / n;
    for (let i = 0; i < n; i++){ x.beginPath(); x.moveTo(i * tw, up ? y0 + bh : y0); x.lineTo(i * tw + tw / 2, up ? y0 : y0 + bh); x.lineTo(i * tw + tw, up ? y0 + bh : y0); x.fill(); } };
  band(h * .1, h * .12, true); band(h * .78, h * .12, false);
  [[.27, '#f2c230'], [.31, '#1f8a4c'], [.67, '#1f8a4c'], [.71, '#f2c230']].forEach(([y, c]) => { x.fillStyle = c; x.fillRect(0, h * y, w, h * .025); });
  const n = 8, cw = w / n; for (let i = 0; i < n; i++){ const cx = cw * (i + .5), cy = h * .49;
    x.fillStyle = '#111'; x.beginPath(); x.moveTo(cx, cy - h * .13); x.lineTo(cx + cw * .42, cy); x.lineTo(cx, cy + h * .13); x.lineTo(cx - cw * .42, cy); x.fill();
    x.fillStyle = '#f2c230'; x.beginPath(); x.arc(cx, cy, h * .03, 0, 7); x.fill();
    x.fillStyle = '#f5efe0'; [-1, 1].forEach((sg) => { x.beginPath(); x.arc(cx + sg * cw * .25, cy, h * .018, 0, 7); x.fill(); }); }
}
function drawAmisTile(x, w, h){
  x.fillStyle = '#c4161c'; x.fillRect(0, 0, w, h); x.strokeStyle = '#111'; x.lineWidth = 14; x.strokeRect(7, 7, w - 14, h - 14);
  x.fillStyle = '#f5efe0'; const n = 8, tw = (w - 28) / n;
  for (let i = 0; i < n; i++) [[14, 1], [h - 14, -1]].forEach(([y, d]) => { x.beginPath(); x.moveTo(14 + i * tw, y); x.lineTo(14 + i * tw + tw / 2, y + d * tw * .6); x.lineTo(14 + (i + 1) * tw, y); x.fill(); });
  x.fillStyle = '#111'; x.beginPath(); x.moveTo(w / 2, h * .25); x.lineTo(w * .75, h / 2); x.lineTo(w / 2, h * .75); x.lineTo(w * .25, h / 2); x.fill();
  x.fillStyle = '#f2c230'; x.beginPath(); x.arc(w / 2, h / 2, w * .07, 0, 7); x.fill(); x.fillStyle = '#1f8a4c'; x.beginPath(); x.arc(w / 2, h / 2, w * .03, 0, 7); x.fill();
}
const TILE = {
  tile_brick: ['#cfc6b8', (x, w, h) => { x.fillStyle = '#cfc6b8'; x.fillRect(0, 0, w, h); const c = ['#b5523b', '#a8472f', '#c0603f'], r = rng(3);
    for (let j = 0; j < 8; j++) for (let i = -1; i < 4; i++){ x.fillStyle = c[Math.floor(r() * 3)]; x.fillRect(i * 64 + (j % 2) * 32 + 3, j * 32 + 3, 58, 26); } }],
  tile_slate: ['#5f6467', (x, w, h) => { x.fillStyle = '#4b4f52'; x.fillRect(0, 0, w, h); const r = rng(5);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++){ const g = 100 + Math.floor(r() * 40); x.fillStyle = `rgb(${g},${g + 4},${g + 8})`; x.fillRect(i * 85 + 4 + r() * 4, j * 85 + 4 + r() * 4, 76, 76); } }],
  tile_terracotta: ['#e5d6c2', (x, w, h) => { x.fillStyle = '#e5d6c2'; x.fillRect(0, 0, w, h); const c = ['#c96f3b', '#bd6332', '#d27a45'];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++){ x.fillStyle = c[(i + j * 2) % 3]; x.fillRect(i * 128 + 5, j * 128 + 5, 118, 118); } }],
  tile_mosaic: ['#eee', (x, w, h) => { const r = rng(9), c = ['#e63946', '#f1c453', '#2a9d8f', '#457b9d', '#f4a261', '#ffffff', '#8ecae6'];
    x.fillStyle = '#f5f0e6'; x.fillRect(0, 0, w, h); for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++){ x.fillStyle = c[Math.floor(r() * c.length)]; x.fillRect(i * 16 + 1, j * 16 + 1, 14, 14); } }],
  tile_wood: ['#7a5230', (x, w, h) => { const c = ['#a8763e', '#9a6a35', '#b4824a', '#a06e3a', '#93622f'];
    for (let i = 0; i < 5; i++){ x.fillStyle = c[i]; x.fillRect(i * 51.2, 0, 51.2, h); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(i * 51.2, 0, 2, h);
      x.strokeStyle = 'rgba(80,45,15,.35)'; x.lineWidth = 2; for (let k = 0; k < 3; k++){ x.beginPath(); x.moveTo(i * 51.2 + 10 + k * 14, 0); x.bezierCurveTo(i * 51.2 + 20 + k * 10, 90, i * 51.2 + 4 + k * 14, 170, i * 51.2 + 12 + k * 14, h); x.stroke(); } } }],
  tile_grass: ['#5f9b3a', (x, w, h) => { x.fillStyle = '#6fae4a'; x.fillRect(0, 0, w, h); const r = rng(13), c = ['#5f9b3a', '#7fbf55', '#4e8a33', '#8acb60'];
    x.lineWidth = 2; for (let i = 0; i < 700; i++){ x.strokeStyle = c[i % 4]; const a = r() * w, b = r() * h; x.beginPath(); x.moveTo(a, b); x.lineTo(a + (r() - .5) * 6, b - 6 - r() * 6); x.stroke(); } }],
  tile_rubber: ['#b33a2e', (x, w, h) => { x.fillStyle = '#c0392b'; x.fillRect(0, 0, w, h); const r = rng(17), c = ['#1d3557', '#f1c453', '#2a9d8f', '#fff', '#8b1e14'];
    for (let i = 0; i < 1600; i++){ x.fillStyle = c[i % 5]; x.fillRect(r() * w, r() * h, 2, 2); } }],
  tile_checker: ['#222', (x, w, h) => { for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++){ x.fillStyle = (i + j) % 2 ? '#1d1d1d' : '#f2f0ea'; x.fillRect(i * 64, j * 64, 64, 64); } }],
  tile_gravel: ['#9e978b', (x, w, h) => { x.fillStyle = '#b9b2a6'; x.fillRect(0, 0, w, h); const r = rng(19), c = ['#8f887c', '#d2cbbf', '#a39a8a', '#7a7368', '#c4b8a4'];
    for (let i = 0; i < 1100; i++){ x.fillStyle = c[i % 5]; x.beginPath(); x.arc(r() * w, r() * h, 1.5 + r() * 2.5, 0, 7); x.fill(); } }],
  tile_pebble: ['#6f6b64', (x, w, h) => { x.fillStyle = '#6f6b64'; x.fillRect(0, 0, w, h); const r = rng(23), c = ['#d8d4cc', '#b9b4aa', '#e9e4da', '#a7a196', '#c9b9a0'];
    for (let i = 0; i < 70; i++){ x.fillStyle = c[i % 5]; x.beginPath(); x.ellipse(r() * w, r() * h, 9 + r() * 9, 6 + r() * 6, r() * 3, 0, 7); x.fill(); } }],
  tile_glow: ['#1b2b4a', (x, w, h) => { x.fillStyle = '#1b2b4a'; x.fillRect(0, 0, w, h); const r = rng(29);
    x.strokeStyle = '#5ff0ff'; x.lineWidth = 4; x.beginPath(); x.arc(w / 2, h / 2, 70, 0, 7); x.stroke(); x.beginPath(); x.arc(w / 2, h / 2, 30, 0, 7); x.stroke();
    x.fillStyle = '#9ffcff'; for (let i = 0; i < 40; i++){ x.beginPath(); x.arc(r() * w, r() * h, 1.5 + r() * 2.5, 0, 7); x.fill(); } }, true],
  tile_warn: ['#e0b00c', (x, w, h) => { x.fillStyle = '#f2c230'; x.fillRect(0, 0, w, h); x.fillStyle = '#222';   // 警示地貼：黃底黑斜紋邊＋驚嘆號（115/11/10）
    x.save(); x.beginPath(); x.rect(0, 0, w, 34); x.rect(0, h - 34, w, 34); x.clip(); for (let i = -h; i < w; i += 44){ x.beginPath(); x.moveTo(i, h); x.lineTo(i + 22, h); x.lineTo(i + 22 + h, 0); x.lineTo(i + h, 0); x.fill(); } x.restore();
    x.beginPath(); x.moveTo(w / 2, 58); x.lineTo(w - 62, h - 58); x.lineTo(62, h - 58); x.closePath(); x.fill(); x.fillStyle = '#f2c230'; x.fillRect(w / 2 - 7, 104, 14, 56); x.beginPath(); x.arc(w / 2, 178, 9, 0, 7); x.fill(); }],
  tile_tactile: ['#d9a90f', (x, w, h) => { x.fillStyle = '#f2c230'; x.fillRect(0, 0, w, h); x.strokeStyle = '#c99a08'; x.lineWidth = 2;
    x.strokeRect(1, 1, w - 2, h - 2); x.fillStyle = '#e0b00c'; for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++){ x.beginPath(); x.arc(22 + i * 42.4, 22 + j * 42.4, 12, 0, 7); x.fill(); x.stroke(); } }],
  hopscotch: ['#7f7f78', (x, w, h) => { x.fillStyle = '#8f8f88'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 5;
    x.fillStyle = '#fff'; x.font = `900 34px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const rows = [[1], [2], [3], [4, 5], [6], [7, 8]], cs = 64;   // 由下往上
    rows.forEach((r, k) => { const y = h - 8 - (k + 1) * cs, n = r.length;
      r.forEach((num, i) => { const bw = n === 1 ? cs : w / 2 - 8, x0 = n === 1 ? w / 2 - cs / 2 : 8 + i * (w / 2 - 8);
        x.strokeRect(x0, y, bw, cs); x.fillText(String(num), x0 + bw / 2, y + cs / 2); }); });
    x.beginPath(); x.arc(w / 2, 26, 22, PI, 0); x.stroke(); }, false, 128, 384],
  rainbow_crossing: ['#4a4a4a', (x, w, h) => { x.fillStyle = '#4a4a4a'; x.fillRect(0, 0, w, h); const c = ['#e63946', '#f4a261', '#f1c453', '#2a9d8f', '#457b9d', '#8e44ad'];
    c.forEach((col, i) => { x.fillStyle = col; x.fillRect(16 + i * 62, 10, 44, h - 20); }); }, false, 384, 256],
  rhombus_tile: ['#7a1a1a', drawRhombusTile],   // 太魯閣族菱形紋（待文化審查）
  amis_tile: ['#7a1014', drawAmisTile],         // 阿美族紋樣（待文化審查）
};

// ---------- 各物件模型 ----------
const BUILD = {
  // ===== A. 植栽 =====
  pot_l(g){ pot(g, .42, .32, .55); C(g, .06, .08, 1.0, TRUNK, 0, .55, 0, 6); S(g, .55, LEAF, 0, 1.8, 0, 1, .9, 1); S(g, .38, LEAF2, .28, 1.6, .12, 1, 1, 1, 0); S(g, .34, LEAF3, -.25, 1.68, -.12, 1, 1, 1, 0); },
  pot_m(g){ pot(g, .28, .21, .42); S(g, .36, LEAF, 0, .78, 0, 1, .85, 1); S(g, .26, LEAF2, .15, 1.0, .05, 1, 1, 1, 0); S(g, .24, LEAF3, -.15, .95, -.08, 1, 1, 1, 0); },
  pot_s(g){ pot(g, .14, .1, .2); S(g, .12, LEAF3, 0, .3, 0, 1, .8, 1, 0);
    [[.06, .38, .04], [-.06, .37, .05], [0, .4, -.06], [.07, .35, -.05], [-.05, .34, -.06]].forEach(([x, y, z], i) => S(g, .04, FLOWERS[i], x, y, z, 1, 1, 1, 0)); },
  planter_box(g){ B(g, 1.6, .45, .5, WOOD); B(g, 1.5, .02, .4, SOIL, 0, .44);
    for (let i = 0; i < 5; i++){ const x = -.6 + i * .3; S(g, .17, i % 2 ? LEAF : LEAF3, x, .56, 0, 1, .8, 1, 0); S(g, .06, FLOWERS[i], x + .04, .68, .07, 1, 1, 1, 0); } },
  flower_bed(g){ C(g, .9, .92, .32, STONE, 0, 0, 0, 10); C(g, .84, .84, .02, SOIL, 0, .32, 0, 10); S(g, .3, LEAF2, 0, .5, 0, 1, .8, 1);
    for (let i = 0; i < 12; i++){ const a = i / 12 * 2 * PI, r = i % 2 ? .62 : .45; S(g, .1, FLOWERS[i % 5], Math.cos(a) * r, .42, Math.sin(a) * r, 1, .7, 1, 0); } },
  herb_box(g){ B(g, 1.2, .45, .5, WOOD_D); B(g, 1.12, .02, .42, SOIL, 0, .44);
    [-.4, 0, .4].forEach((x, i) => { K(g, .14, .34, [LEAF3, LEAF, 0x8fbc6a][i], x, .45, 0, 6); S(g, .1, LEAF2, x + .08, .54, .05, 1, 1, 1, 0); });
    P(g, .34, .12, tmat(sign('herb', '香草園', { w: 256, h: 96, bg: '#f4ecd8', fg: '#3f6b2a', size: 56 })), 0, .25, .252); },
  bamboo(g){ C(g, .48, .5, .06, 0x6b5a3f, 0, 0, 0, 8);   // 竹竿＋上半部一層層葉團，整叢像一根羽毛
    [[0, 0], [.2, .1], [-.18, .14], [.1, -.2], [-.15, -.15], [.28, -.08], [-.3, 0]].forEach(([x, z], i) => {
      const h = 2.7 + ((i * 37) % 9) / 10; C(g, .03, .04, h, i % 2 ? 0x8fae4a : 0x7d9e3c, x, .06, z, 4); });
    [[0, 3.2, 0, .55], [.25, 2.6, .1, .5], [-.25, 2.45, .05, .5], [.05, 1.9, -.2, .45], [-.1, 1.5, .2, .4]].forEach(([x, y, z, r], i) =>
      S(g, r, i % 2 ? 0x5f9b3a : 0x6fae45, x, y, z, 1, 1.5, 1, 0)); },
  sunflower(g){ B(g, 1.2, .3, .6, WOOD); B(g, 1.12, .02, .52, SOIL, 0, .29);
    [-.4, 0, .4].forEach((x, i) => { const h = 1.2 + (i % 2) * .25; C(g, .02, .025, h, 0x5d8a33, x, .3, 0, 5);
      Leaf(g, x, .3 + h * .45, 0, .25, .12, LEAF3, i % 2 ? PI / 2 : -PI / 2, -.3);
      const hd = C(g, .17, .17, .04, 0xf5c518, x, .3 + h, .05, 10); hd.rotation.x = PI / 2;
      const ce = C(g, .08, .08, .05, 0x5b3a1a, x, .3 + h, .07, 8); ce.rotation.x = PI / 2; }); },
  cactus(g){ const G = 0x4f8a3c; pot(g, .2, .15, .25, 0xd9a066); C(g, .1, .12, .75, G, 0, .25, 0, 8); S(g, .1, G, 0, 1.0, 0, 1, 1, 1, 0);
    Rod(g, [0, .62, 0], [.2, .62, 0], .055, G); C(g, .055, .055, .22, G, .2, .62, 0, 6); S(g, .055, G, .2, .84, 0, 1, 1, 1, 0);
    Rod(g, [0, .5, 0], [-.18, .5, 0], .05, G); C(g, .05, .05, .16, G, -.18, .5, 0, 6); S(g, .05, G, -.18, .66, 0, 1, 1, 1, 0);
    S(g, .045, 0xff6f91, 0, 1.1, 0, 1, .7, 1, 0); },
  palm_pot(g){ pot(g, .34, .26, .45, 0xd8d2c4); C(g, .06, .1, 1.25, 0x9b8a6c, 0, .45, 0, 6);
    for (let k = 0; k < 7; k++) Frond(g, 0, 1.68, 0, .8, .2, k % 2 ? LEAF : LEAF3, k / 7 * 2 * PI, .5, .9); S(g, .08, LEAF2, 0, 1.72, 0, 1, 1, 1, 0); },
  fern(g){ pot(g, .2, .15, .25, POT); for (let k = 0; k < 11; k++) Frond(g, 0, .26, 0, .45 + (k % 3) * .05, .07, k % 2 ? LEAF : LEAF3, k / 11 * 2 * PI + (k % 2) * .2, .85, 1.1); },
  succulent(g){ C(g, .2, .16, .12, 0xe8e4dc, 0, 0, 0, 10); C(g, .18, .18, .01, SOIL, 0, .115, 0, 10);
    [[0, 0, 0x8fbf9f, .08], [.1, .04, 0xc58fa8, .06], [-.09, .05, 0x7fa86a, .06], [.02, -.1, 0xa3c486, .05]].forEach(([x, z, c, r]) => {
      K(g, r, r * 1.2, c, x, .12, z, 6); S(g, r * .8, c, x, .12 + r * .4, z, 1, .6, 1, 0); }); },
  tree_round(g){ C(g, .12, .18, 2.3, TRUNK, 0, 0, 0, 6); S(g, 1.2, LEAF, 0, 3.5, 0, 1, .85, 1); S(g, .85, LEAF2, .7, 3.0, .3); S(g, .8, LEAF3, -.6, 3.1, -.35, 1, 1, 1, 0); },
  tree_pine(g){ C(g, .1, .14, .9, TRUNK, 0, 0, 0, 6); [[1, 1.6, .7], [.8, 1.4, 1.6], [.58, 1.3, 2.5], [.32, 1.0, 3.4]].forEach(([r, h, y], i) => K(g, r, h, i % 2 ? 0x356f3f : 0x2f6b3a, 0, y, 0, 8)); },
  tree_sakura(g){ const T0 = 0x5b3a2a; C(g, .1, .16, 1.8, T0, 0, 0, 0, 6); Rod(g, [0, 1.6, 0], [.6, 2.3, .2], .06, T0); Rod(g, [0, 1.7, 0], [-.5, 2.4, -.2], .06, T0);
    S(g, 1.0, 0xf4b6c8, 0, 2.9, 0, 1, .8, 1); S(g, .75, 0xf7cfd9, .75, 2.55, .25, 1, 1, 1, 0); S(g, .7, 0xf0a3bb, -.65, 2.6, -.25, 1, 1, 1, 0); S(g, .55, 0xf7cfd9, .1, 3.4, .35, 1, 1, 1, 0);
    C(g, 1.3, 1.3, .01, 0xf7d7e0, 0, .003, 0, 12); },
  tree_maple(g){ const T0 = 0x5b3a2a; C(g, .1, .16, 1.8, T0, 0, 0, 0, 6); Rod(g, [0, 1.6, 0], [.6, 2.3, .2], .06, T0); Rod(g, [0, 1.7, 0], [-.5, 2.4, -.2], .06, T0);
    S(g, 1.0, 0xd2502d, 0, 2.9, 0, 1, .8, 1); S(g, .75, 0xe8892f, .75, 2.55, .25, 1, 1, 1, 0); S(g, .7, 0xc0392b, -.65, 2.6, -.25, 1, 1, 1, 0); S(g, .55, 0xf0a040, .1, 3.4, .35, 1, 1, 1, 0);
    C(g, 1.3, 1.3, .01, 0xd9773f, 0, .003, 0, 12); },
  hedge_box(g){ B(g, 1, .74, .5, LEAF); B(g, 1.02, .06, .52, LEAF3, 0, .74); },
  hedge_ball(g){ C(g, .14, .16, .06, SOIL, 0, 0, 0, 8); S(g, .4, LEAF, 0, .44, 0); },
  topiary_bear(g){ B(g, .9, .15, .7, WOOD_D); const G = LEAF;
    S(g, .36, G, 0, .6, 0, 1, 1.1, .9); S(g, .26, LEAF3, 0, 1.18, 0); S(g, .09, G, .18, 1.4, 0, 1, 1, 1, 0); S(g, .09, G, -.18, 1.4, 0, 1, 1, 1, 0);
    S(g, .1, LEAF3, 0, 1.12, .22, 1, .8, 1, 0); S(g, .12, G, .32, .72, .12, 1, 1, 1, 0); S(g, .12, G, -.32, .72, .12, 1, 1, 1, 0);
    S(g, .14, G, .18, .27, .15, 1, 1, 1, 0); S(g, .14, G, -.18, .27, .15, 1, 1, 1, 0); },
  green_wall(g){ B(g, 2, 2, .12, MET); B(g, 1.9, 1.88, .06, LEAF2, 0, .06, .06);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) S(g, .26, [LEAF, LEAF3, 0x7bb661][(i + j) % 3], -.72 + j * .48, .4 + i * .6, .1, 1, 1, .45, 0);
    [[-.5, .75], [.4, 1.3], [.7, .5], [-.2, 1.6]].forEach(([x, y], i) => S(g, .06, FLOWERS[i], x, y, .2, 1, 1, 1, 0)); },
  pergola(g){ [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].forEach(([x, z]) => B(g, .12, 2.5, .12, WOOD_D, x, 0, z));
    [-1.3, 1.3].forEach((z) => B(g, 2.9, .14, .12, WOOD_D, 0, 2.5, z)); for (let i = 0; i < 6; i++) B(g, .08, .08, 2.9, WOOD, -1.25 + i * .5, 2.64, 0);
    [[-.6, -.5], [.6, .5], [.5, -.6], [-.5, .6]].forEach(([x, z], i) => S(g, .55, i % 2 ? LEAF : LEAF3, x, 2.78, z, 1, .35, 1, 0));
    [[1.3, 1.3], [-1.3, 1.3]].forEach(([x, z]) => S(g, .25, LEAF2, x, 1.9, z, 1, 2.2, 1, 0));
    [[.2, .2], [-.8, -.1], [.9, -.9]].forEach(([x, z]) => S(g, .08, 0xb39ddb, x, 2.95, z, 1, 1, 1, 0)); },
  lawn_roll(g){ B(g, 2, .05, 2, 0x6fae4a); const r = rng(31); for (let i = 0; i < 8; i++) K(g, .06, .14, 0x5f9b3a, (r() - .5) * 1.7, .05, (r() - .5) * 1.7, 4); },

  // ===== B. 休息座椅 =====
  bench_wood(g){ [-.7, .7].forEach((x) => { B(g, .06, .42, .5, MET, x, 0, 0); B(g, .06, .5, .06, MET, x, .42, -.22); });
    [-.15, 0, .15].forEach((z) => B(g, 1.6, .04, .13, WOOD, 0, .42, z)); [.58, .76].forEach((y) => B(g, 1.6, .1, .03, WOOD, 0, y, -.25)); },
  bench_metal(g){ const c = 0x2e5b4a; [-.7, .7].forEach((x) => { B(g, .05, .42, .05, c, x, 0, .18); B(g, .05, .8, .05, c, x, 0, -.22); B(g, .05, .05, .45, c, x, .62, 0); B(g, .05, .2, .05, c, x, .42, .18); });
    B(g, 1.6, .04, .45, c, 0, .42); B(g, 1.6, .3, .03, c, 0, .48, -.22); },
  stool(g){ B(g, .4, .04, .28, WOOD, 0, .41); [[-.15, -.1], [.15, -.1], [-.15, .1], [.15, .1]].forEach(([x, z]) => B(g, .04, .41, .04, WOOD_D, x, 0, z)); B(g, .3, .03, .03, WOOD_D, 0, .16, 0); },
  rocking_chair(g){ const R = 1.1, arc = .9; [-.27, .27].forEach((x) => T(g, R, .025, WOOD_D, x, R + .03, 0, 0, PI / 2, -PI / 2 - arc / 2, arc, 10, 4));
    B(g, .55, .05, .5, WOOD, 0, .42); [[-.25, -.2], [.25, -.2], [-.25, .2], [.25, .2]].forEach(([x, z]) => B(g, .04, .37, .04, WOOD_D, x, .05, z));
    const bk = B(g, .55, .6, .04, WOOD, 0, .45, -.27); bk.rotation.x = -.18;
    [-.3, .3].forEach((x) => { B(g, .05, .04, .5, WOOD, x, .62, 0); B(g, .04, .2, .04, WOOD_D, x, .44, .2); }); },
  chair(g){ B(g, .45, .04, .45, WOOD, 0, .43); [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]].forEach(([x, z]) => B(g, .03, .43, .03, MET, x, 0, z));
    [-.2, .2].forEach((x) => B(g, .03, .45, .03, MET, x, .45, -.21)); B(g, .45, .25, .03, WOOD, 0, .62, -.21); },
  cushion(g){ C(g, .26, .27, .1, 0xc9a86a, 0, 0, 0, 12); S(g, .25, 0xd8bd85, 0, .1, 0, 1, .18, 1); C(g, .04, .04, .02, 0x8a6a3a, 0, .135, 0, 8); },
  stone_bench(g){ [-.42, .42].forEach((x) => B(g, .22, .35, .36, STONE_D, x, 0, 0)); B(g, 1.2, .1, .4, STONE, 0, .35); },
  sofa(g){ B(g, 1.8, .28, .85, RATTAN, 0, .06); [[-.8, -.35], [.8, -.35], [-.8, .35], [.8, .35]].forEach(([x, z]) => B(g, .06, .06, .06, MET, x, 0, z));
    B(g, 1.8, .42, .2, RATTAN, 0, .34, -.32); [-.81, .81].forEach((x) => B(g, .18, .3, .85, RATTAN, x, .34));
    [-.36, .36].forEach((x) => { B(g, .7, .13, .62, CREAM, x, .34, .08); B(g, .7, .32, .12, CREAM, x, .42, -.17); });
    S(g, .13, 0xe07a5f, -.52, .62, -.06, 1, 1, .5, 0); S(g, .13, 0x3d85c6, .52, .62, -.06, 1, 1, .5, 0); },
  sofa_round(g){ C(g, 1.2, 1.2, .3, RATTAN, 0, .05, 0, 14); C(g, 1.12, 1.12, .1, CREAM, 0, .35, 0, 14);
    T(g, 1.08, .15, RATTAN, 0, .6, 0, PI / 2, 0, .75 * PI, 1.5 * PI, 12, 5);
    [[-.6, -.6, 0xe07a5f], [.6, -.6, 0x3d85c6], [0, -.85, 0xf1c453]].forEach(([x, z, c]) => S(g, .15, c, x, .6, z, 1, 1, .6, 0)); },
  egg_chair(g){ C(g, .38, .42, .05, MET, 0, 0, 0, 10); Rod(g, [0, .05, -.36], [0, 2.0, -.36], .035, MET); Rod(g, [0, 2.0, -.36], [0, 2.0, 0], .03, MET); Rod(g, [0, 2.0, 0], [0, 1.64, 0], .012, MET, 4);
    const sh = mesh(g, new THREE.SphereGeometry(.48, 12, 8, PI / 2 + .3 * PI, 1.4 * PI, 0, PI), mat(0x9a7448, { side: DS }), 0, 1.1, 0); sh.scale.set(1, 1.15, 1);
    S(g, .32, 0xf3ead8, 0, .9, .06, 1, .4, 1); },
  picnic_table(g){ B(g, 1.8, .05, .7, WOOD, 0, .7); [-.65, .65].forEach((z) => B(g, 1.8, .04, .28, WOOD, 0, .42, z));
    [-.7, .7].forEach((x) => { Rod(g, [x, 0, .72], [x, .7, .12], .03, WOOD_D, 4); Rod(g, [x, 0, -.72], [x, .7, -.12], .03, WOOD_D, 4); B(g, .06, .05, 1.6, WOOD_D, x, .37, 0); }); },
  tree_ring(g){ C(g, .6, .6, .02, SOIL, 0, 0, 0, 6);
    for (let k = 0; k < 6; k++){ const p = sub(g, 0, 0, 0, k * PI / 3); B(p, 1.15, .05, .4, WOOD, 0, .4, .95); B(p, .06, .4, .06, MET, 0, 0, .95); B(p, 1.15, .3, .04, WOOD, 0, .45, .77); } },
  step_seats(g){ [[1.2, 0, 0], [.8, .3, -.2], [.4, .6, -.4]].forEach(([d, y, z]) => { B(g, 2.4, .27, d, 0xbdb8ae, 0, y, z); B(g, 2.4, .03, d, WOOD, 0, y + .27, z); });
    [[-.6, .3, .4, 0xe07a5f], [.5, .6, 0, 0x3d85c6], [0, .9, -.4, 0xf1c453]].forEach(([x, y, z, c]) => B(g, .45, .06, .32, c, x, y, z)); },
  lounger(g){ const F = WHITE, Cu = 0x2a9d8f;
    B(g, .6, .06, 1.1, F, 0, .28, .3); B(g, .56, .06, 1.05, Cu, 0, .34, .3);
    const bk = B(g, .6, .06, .7, F, 0, .48, -.54); bk.rotation.x = .6; const bc = B(g, .56, .06, .66, Cu, 0, .53, -.5); bc.rotation.x = .6;
    [[-.27, .8], [.27, .8], [-.27, -.2], [.27, -.2]].forEach(([x, z]) => B(g, .04, .28, .04, F, x, 0, z)); },
  swing_bench(g){ const Fr = WOOD_D; [-1, 1].forEach((x) => { Rod(g, [x, 0, .6], [x, 2.15, 0], .05, Fr); Rod(g, [x, 0, -.6], [x, 2.15, 0], .05, Fr); });
    Rod(g, [-1.05, 2.15, 0], [1.05, 2.15, 0], .06, Fr);
    [-.65, .65].forEach((x) => { Rod(g, [x, 2.1, 0], [x, .52, .2], .01, MET, 3); Rod(g, [x, 2.1, 0], [x, .95, -.22], .01, MET, 3); });
    B(g, 1.4, .05, .45, WOOD, 0, .48); B(g, 1.4, .45, .04, WOOD, 0, .5, -.22); B(g, 2.2, .04, 1.3, 0xe9e2d0, 0, 2.22); },
  beanbag(g){ S(g, .45, 0xe67e22, 0, .25, .05, 1, .55, 1); S(g, .36, 0xe67e22, 0, .45, -.2, 1, .8, .55); },
  bar_stool(g){ C(g, .2, .22, .03, MET, 0, 0, 0, 10); C(g, .03, .03, .72, MET_L, 0, .03, 0, 6); T(g, .15, .012, MET_L, 0, .3, 0, PI / 2, 0, 0, 2 * PI, 10, 3); C(g, .18, .17, .06, 0xc0392b, 0, .74, 0, 12); },
  deck(g){ B(g, 2.4, .24, 2.4, WOOD_D); for (let i = 0; i < 8; i++) B(g, .29, .04, 2.4, i % 2 ? WOOD : WOOD_L, -1.05 + i * .3, .24, 0); },
  hammock(g){ B(g, 3, .08, .12, WOOD_D); [-1.45, 1.45].forEach((x) => B(g, .1, .06, .8, WOOD_D, x, 0, 0));
    [-1, 1].forEach((s) => { Rod(g, [s * 1.45, 0, 0], [s * 1.3, 1.5, 0], .06, WOOD_D, 6); Rod(g, [s * 1.3, 1.45, 0], [s * 1.1, .92, 0], .012, 0xd8c8a0, 3); B(g, .04, .04, .8, WOOD, s * 1.1, .88, 0); });
    const geo = new THREE.PlaneGeometry(2.2, .8, 10, 1); geo.rotateX(-PI / 2); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++){ const x = p.getX(i); p.setY(i, .5 + .4 * (x / 1.1) ** 2); } geo.computeVertexNormals();
    mesh(g, geo, tmat(stripes('hammock', '#d9534f', '#f6efe0', 8), { side: DS })); },
  log_seat(g){ const l = C(g, .2, .2, 1.2, 0x7a5432, 0, 0, 0, 8); l.rotation.z = PI / 2; l.position.y = .2;
    [-.601, .601].forEach((x) => { const c = C(g, .18, .18, .01, 0xd9b382, 0, 0, 0, 8); c.rotation.z = PI / 2; c.position.set(x, .2, 0); });
    B(g, 1.12, .02, .22, 0xd9b382, 0, .37); },

  // ===== C. 求助與安全設施 =====
  sos_post(g){ const OR = 0xe8a03c;   // 依老師照片：深灰柱、橘色箱、玻璃窗內求助機、紅色緊急按鈕、頂上藍色屋形 SOS 牌
    B(g, .12, 1.05, .12, 0x3d3d3d); B(g, .42, .66, .3, OR, 0, 1.0); B(g, .5, .04, .38, OR, 0, 1.66); B(g, .43, .012, .31, 0xc98530, 0, 1.31);
    P(g, .32, .28, tmat(tex('sos_win', 192, 168, drawSosWin)), 0, 1.48, .152);
    const b1 = C(g, .045, .045, .04, 0xd81e1e, 0, 0, 0, 10); b1.rotation.x = PI / 2; b1.position.set(.09, 1.2, .16);
    const b2 = C(g, .04, .04, .03, 0xc0c4c8, 0, 0, 0, 10); b2.rotation.x = PI / 2; b2.position.set(-.06, 1.1, .16);
    P(g, .17, .07, tmat(sign('sos_lbl', '緊急按鈕→', { w: 256, h: 104, bg: '#fff', fg: '#d81e1e', size: 44 })), -.07, 1.21, .151);
    const sh = new THREE.Shape([[-.21, 0], [.21, 0], [.21, .245], [0, .39], [-.21, .245]].map((p) => new THREE.Vector2(...p)));
    mesh(g, new THREE.ExtrudeGeometry(sh, { depth: .04, bevelEnabled: false }), 0x8ec5e8, 0, 1.7, -.02);
    P(g, .42, .39, tmat(tex('sos_sign', 256, 238, drawSosSign), { transparent: true, alphaTest: .5 }), 0, 1.7 + .195, .022); },
  // 115/11/10 依學生學習單增補：水邊安全、地面濕滑、蚊蟲
  water_sign(g){ [-.28, .28].forEach((x) => B(g, .05, 1.7, .05, MET, x)); B(g, .66, .62, .04, YELLOW, 0, 1.02);
    [1, -1].forEach((d) => P(g, .62, .58, tmat(sign('water_warn', '水深危險\n請勿靠近', { w: 320, h: 300, bg: '#f2c230', fg: '#c62828', size: 64, border: '#222' })), 0, 1.33, d * .022, d > 0 ? 0 : PI)); },
  wet_sign(g){ [1, -1].forEach((d) => { const o = B(g, .42, .7, .03, YELLOW, 0, 0, d * .12); o.rotation.x = -d * .33;
      const p = P(g, .38, .5, tmat(sign('wet_floor', '小心\n地滑', { w: 192, h: 256, bg: '#f2c230', fg: '#222', size: 72 })), 0, .36, d * .14, d > 0 ? 0 : PI); p.rotation.x = -d * .33; }); B(g, .4, .03, .05, 0x222222, 0, .68); },
  life_ring(g){ B(g, .08, 1.6, .08, 0xf2f0ea); B(g, .5, .5, .04, 0xf2f0ea, 0, .95, .06); T(g, .19, .055, 0xf4511e, 0, 1.2, .12, 0, 0, 0, 2 * PI, 16, 6);
    [0, 1, 2, 3].forEach((i) => { const a = i * PI / 2 + PI / 4; B(g, .07, .07, .125, 0xf2f0ea, Math.cos(a) * .19, 1.2 + Math.sin(a) * .19 - .035, .12); });
    P(g, .44, .12, tmat(sign('life_lbl', '救生圈', { w: 256, h: 72, bg: '#fff', fg: '#c62828', size: 50 })), 0, 1.52, .081); B(g, .5, .16, .04, 0xf2f0ea, 0, 1.44, .06); },
  mosquito_lamp(g){ C(g, .13, .16, .06, MET, 0, 0, 0, 10); C(g, .03, .03, 1.1, MET, 0, .06, 0, 6); C(g, .12, .12, .05, MET, 0, 1.16, 0, 10);
    C(g, .07, .07, .26, mat(0x9b7bff, { emissive: 0x6a3cff, emissiveIntensity: .9 }), 0, 1.21, 0, 8);
    for (let i = 0; i < 8; i++){ const a = i * PI / 4; B(g, .012, .26, .012, MET, Math.cos(a) * .11, 1.21, Math.sin(a) * .11); } C(g, .15, .12, .06, MET, 0, 1.47, 0, 10); },
  help_bell(g){ B(g, .14, 1.0, .1, 0x6c7a86); B(g, .22, .28, .14, YELLOW, 0, 1.0); B(g, .26, .03, .18, 0x6c7a86, 0, 1.28);
    const b = C(g, .05, .05, .04, 0xd81e1e, 0, 0, 0, 10); b.rotation.x = PI / 2; b.position.set(0, 1.1, .08);
    P(g, .18, .07, tmat(sign('bell', '求助', { w: 192, h: 80, bg: '#f2c230', fg: '#222', size: 54 })), 0, 1.22, .071); },
  aed_box(g){ B(g, .35, .03, .3, MET_L); B(g, .1, .9, .1, MET_L, 0, .03); B(g, .45, .6, .28, WHITE, 0, .92);
    P(g, .4, .55, tmat(tex('aed', 256, 352, drawAed)), 0, 1.22, .141); C(g, .04, .04, .06, glow(0xff3b30, .9), 0, 1.52, 0, 8); },
  first_aid(g){ B(g, .35, .03, .3, MET_L); B(g, .08, .95, .08, MET_L, 0, .03); B(g, .55, .62, .3, WHITE, 0, .95);
    P(g, .5, .55, tmat(tex('cross', 256, 280, drawCross)), 0, 1.26, .152); },
  emergency_light(g){ C(g, .06, .07, 2.55, 0x6c7a86, 0, 0, 0, 8); C(g, .072, .072, .14, 0xff5a36, 0, 1.6, 0, 8);
    B(g, .26, .22, .2, 0x444444, 0, 2.55); P(g, .22, .14, glow(0xfff2b0), 0, 2.66, .101); C(g, .06, .06, .12, glow(0xff3b30), 0, 2.77, 0, 8); },
  convex_mirror(g){ C(g, .04, .045, 2.3, 0xe86f2c, 0, 0, 0, 8); [1.2, 1.6].forEach((y) => C(g, .047, .047, .1, WHITE, 0, y, 0, 8));
    const d = C(g, .32, .32, .05, 0xe86f2c, 0, 0, 0, 14); d.rotation.x = PI / 2; d.position.set(0, 2.25, .07);
    const m = mesh(g, new THREE.SphereGeometry(.3, 14, 5, 0, 2 * PI, 0, PI / 2), phong(0xdfe8ef, { specular: 0xffffff, shininess: 90 }), 0, 2.25, .095); m.rotation.x = PI / 2; m.scale.set(1, .3, 1); },
  info_sign(g){ [-.55, .55].forEach((x) => B(g, .06, 1.8, .06, MET, x)); B(g, 1.2, .8, .05, 0x2e7d4f, 0, .95);
    P(g, 1.12, .72, tmat(tex('info', 384, 248, drawInfo)), 0, 1.35, .026); },
  direction_sign(g){ C(g, .04, .04, 2.4, MET, 0, 0, 0, 8); S(g, .06, MET, 0, 2.42, 0, 1, 1, 1, 0);
    [['圖書館 ▶', '#2b7bbf', 2.15, .3], ['操場 ▶', '#2e7d4f', 1.9, -.6], ['活動中心 ▶', '#c0392b', 1.65, 1.1]].forEach(([t, c, y, a], i) => {
      const p = sub(g, 0, y, 0, a); B(p, .6, .15, .03, parseInt(c.slice(1), 16), .32, -.075, 0);
      P(p, .58, .13, tmat(sign('dir' + i, t, { w: 320, h: 72, bg: c, fg: '#fff', size: 42 })), .32, 0, .016); }); },
  map_board(g){ [-.75, .75].forEach((x) => B(g, .08, 1.95, .08, WOOD_D, x)); B(g, 1.6, 1.1, .06, WOOD_D, 0, .75);
    P(g, 1.5, 1.0, tmat(tex('map', 384, 256, drawMap)), 0, 1.3, .031); B(g, 1.8, .05, .4, 0x8b3a2b, 0, 1.95); },
  assembly_sign(g){ B(g, .06, 2.2, .06, MET, 0, 0, -.02); B(g, .5, .55, .03, 0x00873e, 0, 1.55, .02);
    P(g, .46, .51, tmat(tex('assembly', 256, 284, drawAssembly)), 0, 1.825, .036); },
  nosmoke_sign(g){ B(g, .05, 1.8, .05, MET); const d = C(g, .2, .2, .02, WHITE, 0, 0, 0, 16); d.rotation.x = PI / 2; d.position.set(0, 1.62, .03);
    P(g, .38, .38, tmat(tex('nosmoke', 256, 256, drawNoSmoke), { transparent: true, alphaTest: .5 }), 0, 1.62, .042); },
  cone(g){ B(g, .4, .04, .4, BLACK); K(g, .17, .62, ORANGE, 0, .04, 0, 12);
    [.2, .36].forEach((y) => { const r = (yy) => .17 * (1 - (yy - .04) / .62) + .004; C(g, r(y + .07), r(y), .07, WHITE, 0, y, 0, 12); }); },
  guardrail(g){ [-.97, 0, .97].forEach((x) => B(g, .07, 1.0, .07, 0x9aa3a8, x)); [.5, .92].forEach((y) => B(g, 2, .06, .05, YELLOW, 0, y, .04));
    [-.5, .5].forEach((x) => B(g, .08, .04, .01, glow(0xff3b30, .5), x, .93, .07)); },
  handrail(g){ [-.7, .7].forEach((x) => { C(g, .025, .025, .9, MET_L, x, 0, 0, 8); C(g, .07, .07, .02, MET_L, x, 0, 0, 8); });
    const r = C(g, .03, .03, 1.55, MET_L, 0, 0, 0, 8); r.rotation.z = PI / 2; r.position.y = .9; },
  antislip(g){ B(g, 1.2, .01, .6, 0x9a9a92); [-.2, 0, .2].forEach((z) => B(g, 1.2, .012, .07, YELLOW, 0, .01, z)); },
  speed_bump(g){ for (let i = 0; i < 6; i++) B(g, .5, .08, .4, i % 2 ? BLACK : YELLOW, -1.25 + i * .5); },
  guide_line(g){ Fl(g, 2, .15, tmat(tex('guide', 512, 40, drawGuide)), .012); },
  extinguisher(g){ B(g, .34, .06, .26, MET); B(g, .3, .6, .22, 0xd32f2f, 0, .06); P(g, .24, .42, tmat(tex('ext', 160, 280, drawExt)), 0, .38, .111); },
  cctv(g){ const Gy = 0x8c949a; C(g, .06, .08, 3.2, Gy, 0, 0, 0, 8); B(g, .05, .05, .45, Gy, 0, 3.18, .2);
    const p = sub(g, 0, 3.12, .45); p.rotation.x = .35; B(p, .13, .13, .32, WHITE, 0, -.065, 0);
    const l = C(p, .045, .045, .02, BLACK, 0, 0, 0, 8); l.rotation.x = PI / 2; l.position.set(0, 0, .17); S(p, .015, glow(0xff3b30), .045, .04, .14, 1, 1, 1, 0);
    P(g, .3, .2, tmat(tex('cctvsign', 256, 128, drawCctvSign)), 0, 2.0, .085); },
  floodlight(g){ const Gy = 0x8c949a; C(g, .07, .11, 4.6, Gy, 0, 0, 0, 8); B(g, .9, .06, .06, Gy, 0, 4.55);
    [-.3, .3].forEach((x) => { const p = sub(g, x, 4.45, .1); p.rotation.x = .5; B(p, .35, .28, .12, 0x333333, 0, -.14, 0); P(p, .3, .22, glow(0xffffe0), 0, 0, .061); }); },
  wall_high(g){ B(g, 3, 2.5, .3, 0xb8b4aa); B(g, 3.1, .08, .36, 0x9a968c, 0, 2.5);
    [-1.4, 1.4].forEach((x) => Rod(g, [x, 2.58, 0], [x, 2.95, 0], .015, MET_L, 4));
    for (let i = 0; i < 5; i++) T(g, .14, .008, MET_L, -1.2 + i * .6, 2.76, 0, 0, PI / 2, 0, 2 * PI, 8, 3); },

  // ===== E. 桌子 =====
  table_round(g){ const c = 0x2f5d45; C(g, .25, .28, .03, c, 0, 0, 0, 12); C(g, .04, .04, .7, c, 0, .03, 0, 6); C(g, .5, .5, .04, c, 0, .71, 0, 14); },
  table_square(g){ B(g, .8, .04, .8, WOOD, 0, .71); [[-.35, -.35], [.35, -.35], [-.35, .35], [.35, .35]].forEach(([x, z]) => B(g, .05, .71, .05, WOOD_D, x, 0, z)); },
  table_long(g){ B(g, 2.4, .05, .8, WOOD, 0, .7); [[-1.1, -.33], [1.1, -.33], [-1.1, .33], [1.1, .33]].forEach(([x, z]) => B(g, .06, .7, .06, WOOD_D, x, 0, z)); B(g, 2.2, .05, .05, WOOD_D, 0, .2, 0); },
  chess_table(g){ C(g, .15, .2, .7, STONE, 0, 0, 0, 8); B(g, .72, .06, .72, STONE, 0, .68); Fl(g, .66, .66, tmat(tex('chess', 256, 288, drawChess)), .741);
    [-.6, .6].forEach((x) => C(g, .17, .18, .45, STONE, x, 0, 0, 8)); },
  bar_table(g){ C(g, .22, .24, .03, MET, 0, 0, 0, 10); C(g, .035, .035, 1.04, MET, 0, .03, 0, 6); C(g, .3, .3, .04, WOOD, 0, 1.06, 0, 12); },
  stone_table(g){ C(g, .2, .28, .62, STONE_D, 0, 0, 0, 8); C(g, .6, .58, .08, STONE, 0, .62, 0, 12); },
  pingpong(g){ B(g, 2.74, .04, 1.525, 0x1e5aa8, 0, .72); Fl(g, 2.72, 1.5, tmat(tex('pingpong', 384, 216, drawPingpong)), .761);
    B(g, .02, .15, 1.65, mat(0x222222, { transparent: true, opacity: .7 }), 0, .76); [-.83, .83].forEach((z) => B(g, .03, .17, .03, BLACK, 0, .74, z));
    [[-1.2, -.6], [1.2, -.6], [-1.2, .6], [1.2, .6]].forEach(([x, z]) => B(g, .06, .72, .06, 0x333333, x, 0, z)); },

  // ===== F. 燈具 =====
  lamp_tall(g){ const c = 0x3d4246; C(g, .15, .18, .35, c, 0, 0, 0, 8); C(g, .05, .08, 4.1, c, 0, .35, 0, 8); Rod(g, [0, 4.4, 0], [0, 4.45, .55], .035, c);
    B(g, .28, .1, .55, c, 0, 4.38, .6); B(g, .22, .02, .45, glow(0xfff1c1), 0, 4.365, .6); },
  lamp_bollard(g){ const c = 0x3d4246; C(g, .1, .1, .6, c, 0, 0, 0, 10); C(g, .095, .095, .2, glow(0xfff1c1, .9), 0, .6, 0, 10); C(g, .12, .1, .08, c, 0, .8, 0, 10); },
  lamp_globe(g){ C(g, .18, .22, .25, BLACK, 0, 0, 0, 10); C(g, .045, .06, 2.4, BLACK, 0, .25, 0, 8); C(g, .1, .06, .08, BLACK, 0, 2.62, 0, 8);
    S(g, .25, glow(0xfff6dc, .9), 0, 2.93, 0); C(g, .05, .08, .05, BLACK, 0, 3.17, 0, 8); },
  string_lights(g){ [-1.9, 1.9].forEach((x) => C(g, .05, .05, 3, WOOD_D, x, 0, 0, 6));
    const N = 11, pt = (i) => { const x = -1.9 + i * 3.8 / N; return [x, 2.9 - .5 * (1 - (x / 1.9) ** 2), 0]; };
    const cols = [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2, 0xffffff];
    for (let i = 0; i < N; i++){ Rod(g, pt(i), pt(i + 1), .006, BLACK, 3); if (i){ const [x, y] = pt(i); S(g, .05, glow(cols[i % 5], .9), x, y - .07, 0, 1, 1.3, 1, 0); } } },
  floor_lamp(g){ C(g, .22, .24, .04, 0x333333, 0, 0, 0, 12); C(g, .022, .022, 1.6, 0x333333, 0, .04, 0, 6);
    C(g, .16, .26, .3, mat(0xf4ead2, { emissive: 0xf4d9a0, emissiveIntensity: .6 }), 0, 1.6, 0, 12); },
  solar_ground(g){ [-.75, -.25, .25, .75].forEach((x) => { C(g, .012, .012, .18, 0x333333, x, 0, 0, 4); C(g, .05, .045, .08, glow(0xfff1c1, .8), x, .18, 0, 8); B(g, .11, .015, .11, 0x1d3557, x, .26, 0); }); },
  lantern(g){ const R0 = 0x8b2b1f, GOLD = 0xd4a017; C(g, .18, .2, .06, R0, 0, 0, 0, 8); C(g, .045, .05, 2.2, R0, 0, .06, 0, 8);
    Rod(g, [0, 2.2, 0], [0, 2.2, .3], .025, R0); Rod(g, [0, 2.2, .3], [0, 2.02, .3], .008, BLACK, 3);
    S(g, .2, mat(0xd62d20, { emissive: 0xff5a2a, emissiveIntensity: .45 }), 0, 1.8, .3, 1, 1.15, 1);
    C(g, .1, .1, .04, GOLD, 0, 1.99, .3, 8); C(g, .1, .1, .04, GOLD, 0, 1.55, .3, 8); C(g, .015, .03, .15, GOLD, 0, 1.4, .3, 6); },
  stone_lantern(g){ C(g, .26, .3, .14, STONE, 0, 0, 0, 6); C(g, .09, .1, .55, STONE, 0, .14, 0, 6); C(g, .26, .2, .1, STONE, 0, .69, 0, 6);
    B(g, .3, .28, .3, STONE, 0, .79); B(g, .2, .16, .31, glow(0xffd27a, .8), 0, .85); B(g, .31, .16, .2, glow(0xffd27a, .8), 0, .85);
    K(g, .38, .26, STONE_D, 0, 1.07, 0, 6); S(g, .06, STONE, 0, 1.38, 0, 1, 1, 1, 0); },
  wall_light(g){ B(g, .26, 2.1, .26, 0x8c8579); B(g, .2, .22, .1, 0x333333, 0, 1.85, .17); P(g, .16, .16, glow(0xfff1c1), 0, 1.96, .221); B(g, .3, .05, .3, 0x6c665c, 0, 2.1); },
  fairy_tree(g){ C(g, .08, .12, 1.3, TRUNK, 0, 0, 0, 6); C(g, .5, .5, .01, SOIL, 0, .003, 0, 8);
    for (let k = 0; k < 6; k++){ const a = k / 6 * 2 * PI, y0 = 1.05 + (k % 2) * .2, tip = [Math.cos(a) * .65, 2.3 + (k % 3) * .25, Math.sin(a) * .65];
      Rod(g, [0, y0, 0], tip, .025, TRUNK, 4);
      [.45, .75, 1].forEach((t) => S(g, .075, glow(0xffe9a8, 1), tip[0] * t, y0 + (tip[1] - y0) * t + .05, tip[2] * t, 1, 1, 1, 0)); } },

  // ===== G. 裝飾品 =====
  vase(g){ B(g, .42, .55, .42, WHITE);
    const pts = [[0, 0], [.1, 0], [.16, .12], [.17, .25], [.11, .42], [.07, .5], [.1, .58]].map(([a, b]) => new THREE.Vector2(a, b));
    mesh(g, new THREE.LatheGeometry(pts, 12), mat(0x2f5fa8, { side: DS }), 0, .55, 0);
    [[.1, 1.38, .02], [-.08, 1.42, -.04], [0, 1.48, .06]].forEach(([x, y, z], i) => { Rod(g, [0, 1.1, 0], [x, y, z], .008, 0x5d8a33, 3); S(g, .07, FLOWERS[i], x, y, z, 1, .8, 1, 0); }); },
  plush_bear(g){ const Br = 0xb5835a, Cr = 0xf1dcc0;
    S(g, .26, Br, 0, .36, 0, 1, 1.1, .9); S(g, .17, Cr, 0, .33, .12, 1, 1.1, .6, 0); S(g, .21, Br, 0, .78, 0);
    [-.15, .15].forEach((x) => { S(g, .07, Br, x, .95, 0, 1, 1, .6, 0); S(g, .09, Br, x * 1.7, .45, .08, .8, 1.5, .8, 0); S(g, .11, Br, x, .13, .16, 1, .8, 1.3, 0); S(g, .025, BLACK, x * .45, .82, .18, 1, 1, 1, 0); });
    S(g, .085, Cr, 0, .73, .18, 1, .8, 1, 0); S(g, .03, BLACK, 0, .77, .26, 1, 1, 1, 0);
    [-.06, .06].forEach((x) => K(g, .05, .1, 0xd63b2f, x, .57, .16, 4).rotation.z = x > 0 ? PI / 2 : -PI / 2); },
  stone_lion(g){ B(g, .6, .3, .9, STONE_D); S(g, .27, STONE, 0, .6, -.15, 1, 1, 1.2); S(g, .3, 0x8f8b80, 0, .95, .1, 1, 1, .7, 0); S(g, .22, STONE, 0, 1.0, .2);
    [-.12, .12].forEach((x) => { B(g, .09, .35, .1, STONE, x, .3, .2); S(g, .03, BLACK, x * .6, 1.05, .4, 1, 1, 1, 0); }); S(g, .1, STONE, .22, .4, .33, 1, 1, 1, 0); S(g, .07, 0x8f8b80, 0, .95, .41, 1.3, .8, 1, 0); },
  stone_abstract(g){ B(g, .8, .2, .5, STONE_D); T(g, .55, .17, 0xe6e2da, 0, .9, 0, 0, .3, 0, 2 * PI, 14, 6); S(g, .15, 0x9e7b5a, 0, .9, 0); },
  figure_robot(g){ const Bl = 0x5aa9e6, Gy = 0xb0bec5; C(g, .3, .3, .05, 0x455a64, 0, 0, 0, 10);
    [-.1, .1].forEach((x) => B(g, .12, .35, .14, Gy, x, .05)); B(g, .4, .45, .3, Bl, 0, .4); P(g, .24, .14, glow(0x6ff0ff, .6), 0, .65, .151);
    [-.27, .27].forEach((x) => { const a = B(g, .1, .35, .1, Gy, x, .45); a.rotation.z = x > 0 ? .2 : -.2; });
    B(g, .32, .26, .28, Gy, 0, .87); [-.07, .07].forEach((x) => S(g, .04, glow(0x6ff0ff), x, 1.01, .14, 1, 1, .5, 0));
    C(g, .01, .01, .14, BLACK, 0, 1.13, 0, 4); S(g, .035, glow(0xff3b30), 0, 1.29, 0, 1, 1, 1, 0); },
  figure_cat(g){ const O = 0xe39a4f; B(g, .4, .12, .4, STONE); S(g, .17, O, 0, .33, 0, 1, 1.3, .95); S(g, .1, WHITE, 0, .38, .12, 1, 1.2, .6, 0); S(g, .14, O, 0, .62, .04, 1, .95, 1);
    [-.08, .08].forEach((x) => { K(g, .05, .1, O, x, .7, .04, 4); S(g, .02, BLACK, x * .6, .64, .17, 1, 1, 1, 0); }); S(g, .015, 0xf48fb1, 0, .6, .18, 1, 1, 1, 0);
    T(g, .12, .025, O, .12, .2, -.08, PI / 2, 0, 0, PI, 8, 4); },
  gnome(g){ [-.05, .05].forEach((x) => S(g, .05, 0x3b2a1a, x, .04, .02, 1, .7, 1.4, 0)); K(g, .14, .32, 0x2f6db5, 0, .02, 0, 10); C(g, .1, .107, .03, 0x3b2a1a, 0, .08, 0, 10);
    S(g, .075, 0xf3c9a8, 0, .36, 0); const b = K(g, .08, .2, WHITE, 0, 0, 0, 8); b.rotation.x = PI + .35; b.position.set(0, .27, .085);
    K(g, .085, .3, RED, 0, .39, 0, 10); S(g, .022, 0xf0a58a, 0, .36, .075, 1, 1, 1, 0); },
  carriage(g){ const GOLD = 0xd4af37, WD = 0x5b3a1a;
    [[-.6, .35], [.6, .25]].forEach(([x, r]) => [-.55, .55].forEach((z) => { const w = C(g, r, r, .05, WD, 0, 0, 0, 12); w.rotation.x = PI / 2; w.position.set(x, r, z);
      const h = C(g, .06, .06, .07, GOLD, 0, 0, 0, 6); h.rotation.x = PI / 2; h.position.set(x, r, z); }));
    B(g, 1.2, .75, .85, WHITE, 0, .55); B(g, 1.3, .08, .95, GOLD, 0, 1.3); B(g, 1.3, .06, .95, GOLD, 0, .52);
    S(g, .42, WHITE, 0, 1.38, 0, 1.4, .45, 1.05); S(g, .07, GOLD, 0, 1.6, 0, 1, 1, 1, 0);
    [.426, -.426].forEach((z) => P(g, .5, .45, tmat(tex('cwin', 128, 128, drawCarriageWin)), 0, .95, z, z > 0 ? 0 : PI));
    [-.3, .3].forEach((z) => Rod(g, [.6, .5, z], [1.1, .38, z], .025, WD, 4)); [-.5, .5].forEach((z) => S(g, .05, glow(0xffe08a, .8), .62, 1.15, z * .9, 1, 1.3, 1, 0)); },
  fountain(g){ C(g, 1.2, 1.2, .3, STONE, 0, 0, 0, 16); C(g, 1.1, 1.1, .08, water(), 0, .3, 0, 16); T(g, 1.14, .07, STONE, 0, .42, 0, PI / 2, 0, 0, 2 * PI, 16, 4);
    C(g, .12, .16, .75, STONE, 0, .3, 0, 8); C(g, .5, .18, .16, STONE, 0, 1.0, 0, 12); C(g, .46, .46, .02, water(), 0, 1.16, 0, 12);
    const jet = mat(0xbfe6ff, { transparent: true, opacity: .7 }); C(g, .02, .05, .35, jet, 0, 1.16, 0, 6); S(g, .09, jet, 0, 1.55, 0, 1, .7, 1, 0); },
  pond(g){ const e = C(g, 1, 1, .12, STONE_D, 0, 0, 0, 12); e.scale.z = .75; const w = C(g, .9, .9, .02, 0x3f8fc4, 0, .12, 0, 12); w.scale.z = .75;
    [[-.4, .1], [.3, -.2], [.1, .3], [-.1, -.35]].forEach(([x, z]) => C(g, .12, .12, .01, 0x4f9a3c, x, .14, z, 8));
    [[-.4, .1], [.3, -.2]].forEach(([x, z]) => S(g, .045, 0xf48fb1, x, .17, z, 1, .6, 1, 0));
    [[.95, 0], [-.9, .3], [.4, .7], [-.5, -.65]].forEach(([x, z]) => S(g, .16, STONE, x, .1, z, 1, .7, 1, 0)); },
  bridge(g){ const RD = 0xc0392b, f = (x) => .45 * (1 - (x / 1.2) ** 2);
    for (let i = 0; i < 11; i++){ const x = -1.1 + i * .22; const p = B(g, .2, .05, .9, WOOD, x, f(x), 0); p.rotation.z = Math.atan(-.45 * 2 * x / 1.44); }
    const xs = [-1.1, -.55, 0, .55, 1.1];
    [-.42, .42].forEach((z) => { xs.forEach((x) => B(g, .05, .45, .05, RD, x, f(x), z)); for (let i = 0; i < 4; i++) Rod(g, [xs[i], f(xs[i]) + .45, z], [xs[i + 1], f(xs[i + 1]) + .45, z], .025, RD, 4); }); },
  arch(g){ [-.75, .75].forEach((x) => [-.15, .15].forEach((z) => B(g, .08, 1.5, .08, WHITE, x, 0, z)));
    [-.15, .15].forEach((z) => T(g, .75, .04, WHITE, 0, 1.5, z, 0, 0, 0, PI, 10, 4));
    for (let i = 1; i < 5; i++){ const a = i / 5 * PI; B(g, .04, .04, .34, WHITE, Math.cos(a) * .75, 1.48 + Math.sin(a) * .75, 0); }
    for (let i = 0; i < 9; i++){ const a = i / 8 * PI, x = Math.cos(a) * .78, y = 1.5 + Math.sin(a) * .78; S(g, .12, i % 2 ? LEAF : LEAF3, x, y, .05, 1, 1, 1, 0); S(g, .07, [0xf48fb1, 0xffffff, 0xf06292][i % 3], x, y + .04, .15, 1, 1, 1, 0); } },
  birdhouse(g){ C(g, .03, .035, 1.5, WOOD_D, 0, 0, 0, 6); B(g, .26, .28, .26, 0xe9c46a, 0, 1.5);
    [-1, 1].forEach((s) => { const r = B(g, .21, .02, .34, 0xc0392b, s * .085, 1.83); r.rotation.z = -s * .75; });
    const h = C(g, .04, .04, .01, BLACK, 0, 0, 0, 8); h.rotation.x = PI / 2; h.position.set(0, 1.68, .131); Rod(g, [0, 1.6, .13], [0, 1.6, .2], .008, WOOD_D, 3);
    S(g, .05, 0x4a90d9, .02, 1.98, 0, 1.3, 1, 1, 0); },
  windmill(g){ C(g, .22, .38, 1.5, WHITE, 0, 0, 0, 8); K(g, .3, .4, RED, 0, 1.5, 0, 8); P(g, .16, .28, mat(0x6b4423), 0, .14, .36, 0);
    const hb = C(g, .05, .05, .12, 0x555555, 0, 0, 0, 8); hb.rotation.x = PI / 2; hb.position.set(0, 1.62, .3);
    const p = sub(g, 0, 1.62, .36); p.rotation.z = .4; for (let k = 0; k < 4; k++){ const q = new THREE.Group(); q.rotation.z = k * PI / 2; p.add(q); B(q, .12, .8, .02, 0xf5e6c8, 0, .05, 0); } },
  wind_chime(g){ Rod(g, [0, 0, 0], [0, 1.9, 0], .015, BLACK, 4); T(g, .15, .012, BLACK, .15, 1.9, 0, 0, 0, 0, PI, 8, 3); Rod(g, [.3, 1.9, 0], [.3, 1.62, 0], .004, 0x888888, 3);
    C(g, .1, .1, .02, WOOD, .3, 1.6, 0, 10);
    for (let k = 0; k < 5; k++){ const a = k / 5 * 2 * PI, len = .25 + k * .05; C(g, .012, .012, len, MET_L, .3 + Math.cos(a) * .07, 1.58 - len, Math.sin(a) * .07, 6); }
    C(g, .03, .03, .01, WOOD, .3, 1.35, 0, 8); },
  flag(g){ C(g, .03, .04, 4, MET_L, 0, 0, 0, 8); S(g, .05, 0xd4af37, 0, 4.03, 0, 1, 1, 1, 0);
    const geo = new THREE.PlaneGeometry(1, .65, 8, 1); geo.translate(.5, 0, 0); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, .06 * Math.sin(p.getX(i) * 6)); geo.computeVertexNormals();
    mesh(g, geo, tmat(tex('flag', 256, 166, drawFlag), { side: DS }), .03, 3.6, 0); },
  bunting(g){ [-1.9, 1.9].forEach((x) => C(g, .03, .03, 2.5, WHITE, x, 0, 0, 6));
    const N = 10, pt = (t) => { const x = -1.9 + t * 3.8; return [x, 2.4 - .4 * (1 - (x / 1.9) ** 2), 0]; };
    for (let i = 0; i < N; i++) Rod(g, pt(i / N), pt((i + 1) / N), .006, 0x888888, 3);
    const cols = [0xe63946, 0xf1c453, 0x2a9d8f, 0x457b9d, 0xf4a261];
    for (let i = 1; i < N; i++){ const [x, y] = pt(i / N); tri(g, cols[i % 5], [x - .12, y, 0], [x + .12, y, 0], [x, y - .28, 0]); } },
  balloons(g){ B(g, .12, .1, .12, 0x888888);
    [[0, 2.0, 0, 0xe63946], [.2, 1.8, .1, 0xf1c453], [-.18, 1.85, .05, 0x457b9d], [.05, 1.7, -.18, 0x2a9d8f]].forEach(([x, y, z, c]) => {
      Rod(g, [0, .1, 0], [x, y - .2, z], .003, 0xdddddd, 3); S(g, .17, c, x, y, z, 1, 1.18, 1); }); },
  mailbox(g){ const Pk = 0xf28482; B(g, .08, .9, .08, WOOD_D); B(g, .38, .3, .3, Pk, 0, .9);
    const top = mesh(g, new THREE.CylinderGeometry(.15, .15, .38, 10, 1, false, 0, PI), Pk, 0, 1.2, 0); top.rotation.z = PI / 2;
    B(g, .2, .02, .02, BLACK, 0, 1.12, .151); P(g, .3, .1, tmat(sign('mail', '♥ 心情信箱', { w: 256, h: 84, bg: '#fff5f5', fg: '#d6336c', size: 40 })), 0, 1.0, .151); },
  message_board(g){ [-.98, .98].forEach((x) => B(g, .08, 2.0, .08, WOOD_D, x)); B(g, 1.9, 1.3, .06, 0xc69c6d, 0, .55);
    P(g, 1.0, .2, tmat(sign('mood', '心情牆', { w: 320, h: 64, bg: '#3d2373', fg: '#fff', size: 44 })), 0, 1.72, .04);
    const pastel = [0xfff59d, 0xffccbc, 0xc5e1a5, 0xb3e5fc, 0xf8bbd0, 0xd1c4e9];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) B(g, .22, .22, .01, pastel[(i * 4 + j) % 6], -.66 + j * .44 + (i % 2) * .08, .68 + i * .36, .035);
    B(g, 2.1, .05, .35, 0x8b3a2b, 0, 2.0); },
  graffiti_wall(g){ B(g, 3, 2.2, .3, 0xbdb8ae); P(g, 2.9, 2.1, tmat(tex('graffiti', 512, 372, drawGraffiti)), 0, 1.1, .151); },
  mirror_sphere(g){ C(g, .28, .32, .4, 0x333333, 0, 0, 0, 10); S(g, .5, phong(0xcfd8df, { specular: 0xffffff, shininess: 120 }), 0, .9, 0, 1, 1, 1, 2); },
  deer_statue(g){ const D = 0xb5793e, Sp = 0xf5e6d0; B(g, .6, .1, 1.4, STONE_D);
    S(g, .3, D, 0, .85, 0, .8, .75, 1.5); [[-.12, -.3], [.12, -.3], [-.12, .3], [.12, .3]].forEach(([x, z]) => C(g, .035, .03, .6, D, x, .1, z, 5));
    Rod(g, [0, 1.0, .35], [0, 1.3, .5], .07, D); S(g, .12, D, 0, 1.35, .6, .9, .9, 1.4); S(g, .03, BLACK, 0, 1.33, .76, 1, 1, 1, 0);
    [-1, 1].forEach((s) => { K(g, .04, .1, D, s * .1, 1.42, .55, 4); Rod(g, [s * .05, 1.45, .55], [s * .2, 1.75, .5], .015, 0x6b4a2f, 3); Rod(g, [s * .12, 1.6, .53], [s * .18, 1.7, .65], .012, 0x6b4a2f, 3);
      [[.2, .9, -.15], [.21, .82, .1], [.18, .95, .2]].forEach(([x, y, z]) => S(g, .03, Sp, s * x, y, z, 1, 1, 1, 0)); });
    S(g, .05, Sp, 0, .95, -.45, 1, 1, 1, 0); },
  dino(g){ const G = 0x5aa05a, Or = 0xf4a261; S(g, .5, G, 0, .9, 0, 1.4, .8, .8);
    const t = K(g, .3, 1.2, G, 0, 0, 0, 8); t.rotation.z = PI / 2; t.position.set(-1.15, .8, 0);
    Rod(g, [.55, 1.0, 0], [.85, 1.35, 0], .16, G, 6); S(g, .22, G, 1.0, 1.45, 0, 1.4, .9, .9);
    [[-.35, -.22], [-.35, .22], [.35, -.22], [.35, .22]].forEach(([x, z]) => C(g, .1, .12, .55, G, x, 0, z, 6));
    for (let i = 0; i < 5; i++) K(g, .07, .2, Or, -.5 + i * .25, 1.27 - Math.abs(i - 2) * .04, 0, 4);
    [-.1, .1].forEach((z) => S(g, .03, BLACK, 1.15, 1.52, z * 1.6, 1, 1, 1, 0)); },

  // ===== H. 遮蔽與角落 =====
  umbrella(g){ C(g, .25, .25, .04, MET_L, 0, 0, 0, 10); C(g, .025, .025, 2.3, MET_L, 0, 0, 0, 6); C(g, .4, .4, .04, WHITE, 0, .7, 0, 12); C(g, .05, .08, .66, WHITE, 0, .04, 0, 6);
    K(g, 1.2, .45, tmat(stripes('umb', '#d9534f', '#ffffff', 8)), 0, 1.95, 0, 8); S(g, .05, WHITE, 0, 2.42, 0, 1, 1, 1, 0);
    [-.85, .85].forEach((x) => C(g, .18, .18, .45, 0x2a9d8f, x, 0, 0, 10)); },
  gazebo(g){ const R0 = 0x8b3a2b; C(g, 1.9, 1.95, .2, STONE, 0, 0, 0, 6);
    const pp = []; for (let k = 0; k < 6; k++){ const a = k * PI / 3 + PI / 6; pp.push([Math.cos(a) * 1.6, Math.sin(a) * 1.6]); C(g, .08, .08, 2.1, R0, pp[k][0], .2, pp[k][1], 8); }
    for (let k = 0; k < 6; k++){ const [a, b] = pp[k], [c, d] = pp[(k + 1) % 6]; Rod(g, [a, 2.3, b], [c, 2.3, d], .06, R0, 4); }
    K(g, 2.2, .9, 0x5b2a20, 0, 2.3, 0, 6); K(g, .08, .3, 0xd4af37, 0, 3.15, 0, 6);
    for (let k = 1; k < 6; k += 2){ const a = k * PI / 3 + PI / 2; const p = sub(g, 0, 0, 0, -a); B(p, 1.4, .06, .4, WOOD, 0, .62, 1.15); B(p, 1.4, .42, .3, WOOD_D, 0, .2, 1.15); } },
  tent(g){ const sh = new THREE.Shape([new THREE.Vector2(-.95, 0), new THREE.Vector2(.95, 0), new THREE.Vector2(0, 1.6)]);
    mesh(g, new THREE.ExtrudeGeometry(sh, { depth: 2, bevelEnabled: false }), 0x2a9d8f, 0, 0, -1);
    tri(g, 0x1d5f57, [-.4, 0, 1.005], [.4, 0, 1.005], [0, 1.0, 1.005]);
    [-1, 1].forEach((s) => Rod(g, [0, 1.6, s], [0, 0, s * 1.35], .006, 0x888888, 3)); },
  canopy(g){ const P1 = [-1.8, 3, -1.6], P2 = [1.8, 2.6, -1.4], P3 = [0, 2.8, 1.8];
    [P1, P2, P3].forEach(([x, y, z]) => { C(g, .05, .06, y, MET_L, x, 0, z, 6); Rod(g, [x, y, z], [x * 1.25, 0, z * 1.25], .006, 0x888888, 3); });
    tri(g, mat(0xf1e6c8, { side: DS }), P1, P3, P2); },
  nook(g){ const W = 0xd8cfc0, Cu = 0xe07a5f;
    for (let k = 0; k < 9; k++){ const f = (k + .5) / 9 * PI; B(g, .42, 1.2, .18, W, Math.cos(f) * 1.1, 0, -Math.sin(f) * 1.0 + .45, f + PI / 2); }
    for (let k = 0; k < 7; k++){ const f = (k + .5) / 7 * PI; B(g, .4, .42, .32, WOOD, Math.cos(f) * .82, 0, -Math.sin(f) * .72 + .45, f + PI / 2); B(g, .38, .06, .28, Cu, Math.cos(f) * .82, .42, -Math.sin(f) * .72 + .45, f + PI / 2); }
    for (let k = 0; k < 6; k++){ const f = (k + .5) / 6 * PI; S(g, .16, k % 2 ? LEAF : LEAF3, Math.cos(f) * 1.1, 1.26, -Math.sin(f) * 1.0 + .45, 1, .8, 1, 0); } },
  booth(g){ const F = WOOD_D; B(g, 1.6, .1, 1.6, F); [[-.76, -.76], [.76, -.76], [-.76, .76], [.76, .76]].forEach(([x, z]) => B(g, .08, 2.2, .08, F, x, .1, z));
    B(g, 1.75, .1, 1.75, WOOD, 0, 2.3); const G2 = glass();
    B(g, 1.5, 2.2, .02, G2, 0, .1, -.76); [-.76, .76].forEach((x) => B(g, .02, 2.2, 1.5, G2, x, .1, 0)); [-.5, .5].forEach((x) => B(g, .5, 2.2, .02, G2, x, .1, .76)); B(g, .5, .4, .02, G2, 0, 1.9, .76);
    B(g, .9, .05, .45, WOOD_L, 0, .72, -.45); [-.4, .4].forEach((x) => B(g, .04, .62, .4, WOOD_L, x, .1, -.45)); C(g, .16, .16, .45, 0x2a9d8f, 0, .1, .05, 8);
    B(g, .3, 1.3, .7, WOOD, .58, .1, -.1); [.5, .95].forEach((y) => [0xe63946, 0x457b9d, 0xf1c453, 0x2a9d8f].forEach((c, i) => B(g, .22, .3, .12, c, .55, y, -.35 + i * .15))); },

  // ===== I. 生活與活動設施 =====
  trash(g){ C(g, .22, .2, .78, 0x2e7d4f, 0, 0, 0, 10); C(g, .235, .235, .06, 0x1f5a38, 0, .78, 0, 10); P(g, .18, .1, mat(0x111111), 0, .68, .222); },
  recycle(g){ [['紙類', '#2d6cdf'], ['塑膠', '#e0a800'], ['一般', '#3a9a4f']].forEach(([t, c], i) => { const x = -.5 + i * .5, col = parseInt(c.slice(1), 16);
    B(g, .45, .8, .45, col, x); B(g, .47, .05, .47, 0x333333, x, .8); P(g, .36, .18, tmat(sign('rc' + i, t, { w: 192, h: 96, bg: '#fff', fg: c, size: 56 })), x, .55, .226); }); },
  water(g){ B(g, .55, 1.0, .45, 0xc8ccd0); B(g, .55, .08, .45, 0x9aa1a6, 0, 1.0); B(g, .45, .03, .3, 0x6c757d, 0, 1.05, .02);
    const s = C(g, .015, .015, .1, MET_L, 0, 0, 0, 6); s.position.set(0, 1.12, -.05);
    P(g, .4, .35, tmat(sign('water', '飲水機\n💧', { w: 192, h: 168, bg: '#2b7bbf', fg: '#fff', size: 44 })), 0, .65, .226); S(g, .025, glow(0x4fc3f7), .18, .95, .23, 1, 1, .5, 0); },
  bike_rack(g){ [-.75, -.25, .25, .75].forEach((x) => { T(g, .28, .02, MET_L, x, .5, 0, 0, PI / 2, 0, PI, 8, 4); [-.28, .28].forEach((z) => Rod(g, [x, .5, z], [x, 0, z], .02, MET_L, 4)); });
    [-.28, .28].forEach((z) => B(g, 2, .03, .05, MET_L, 0, 0, z)); },
  book_box(g){ const Cb = 0x2a9d8f; [[-.25, -.15], [.25, -.15], [-.25, .15], [.25, .15]].forEach(([x, z]) => B(g, .04, .4, .04, WOOD_D, x, 0, z));
    B(g, .6, 1.0, .03, Cb, 0, .4, -.185); [-.285, .285].forEach((x) => B(g, .03, 1.0, .4, Cb, x, .4)); [.4, .78, 1.37].forEach((y) => B(g, .6, .03, .4, Cb, 0, y));
    [-1, 1].forEach((s) => { const r = B(g, .38, .03, .5, 0xe76f51, s * .15, 1.47); r.rotation.z = -s * .55; });
    [.43, .81].forEach((y) => [0xe63946, 0x457b9d, 0xf1c453, 0xf4a261, 0x6a4c93].forEach((c, i) => B(g, .08, .24 + (i % 2) * .05, .25, c, -.2 + i * .1, y, -.03)));
    B(g, .54, .95, .01, glass(), 0, .42, .2); P(g, .5, .12, tmat(sign('book', '漂書站', { w: 256, h: 64, bg: '#fff', fg: '#2a9d8f', size: 44 })), 0, 1.3, .21); },
  blackboard(g){ [-.83, .83].forEach((x) => B(g, .07, 1.8, .07, WOOD_D, x)); B(g, 1.66, 1.06, .05, WOOD, 0, .7);
    P(g, 1.56, .96, tmat(tex('chalk', 400, 246, drawChalk)), 0, 1.23, .026); B(g, 1.6, .03, .08, WOOD, 0, .68, .05); B(g, 1.8, .04, .25, WOOD_D, 0, 1.8); },
  hoop(g){ const N = 0x1d3557; B(g, .8, .3, 1.0, N, 0, 0, -.4); C(g, .07, .08, 2.8, N, 0, .3, -.6, 8); B(g, .08, .08, .65, N, 0, 3.05, -.3);
    B(g, 1.1, .72, .04, WHITE, 0, 2.75); P(g, 1.06, .68, tmat(tex('board', 256, 164, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d63b2f'; x.lineWidth = 8;
      x.strokeRect(6, 6, w - 12, h - 12); x.strokeRect(w / 2 - 34, h - 70, 68, 52); })), 0, 3.11, .021);
    T(g, .23, .018, ORANGE, 0, 3.05, .27, PI / 2, 0, 0, 2 * PI, 12, 4); mesh(g, new THREE.CylinderGeometry(.23, .15, .4, 10, 1, true), mat(WHITE, { wireframe: true }), 0, 2.85, .27); },
  swing(g){ const Fr = 0xc0392b; [-1.4, 1.4].forEach((x) => { Rod(g, [x, 0, .7], [x, 2.4, 0], .05, Fr); Rod(g, [x, 0, -.7], [x, 2.4, 0], .05, Fr); });
    Rod(g, [-1.45, 2.4, 0], [1.45, 2.4, 0], .06, Fr);
    [-.55, .55].forEach((x) => { [-.2, .2].forEach((d) => Rod(g, [x + d, 2.38, 0], [x + d, .46, 0], .008, 0x888888, 3)); B(g, .48, .04, .2, YELLOW, x, .43); }); },
  seesaw(g){ B(g, .25, .3, .35, 0x2a9d8f); const p = B(g, 3, .06, .28, 0xf4a261, 0, .3); p.rotation.z = .15;
    [[1.137, .36 + .172], [-1.137, .36 - .172]].forEach(([x, y]) => { Rod(g, [x, y, -.1], [x, y + .3, -.1], .02, MET, 4); Rod(g, [x, y, .1], [x, y + .3, .1], .02, MET, 4); Rod(g, [x, y + .3, -.12], [x, y + .3, .12], .02, MET, 4); }); },
  piano(g){ B(g, 1.5, 1.2, .55, 0xf2a65a, 0, 0, -.35); B(g, 1.4, .08, .25, 0x333333, 0, .66, .05); Fl(g, 1.3, .18, tmat(tex('keys', 512, 72, drawKeys)), .745, 0, .07);
    P(g, 1.4, .45, tmat(tex('pianoart', 512, 164, drawPianoArt)), 0, .97, -.074); [-.65, .65].forEach((x) => B(g, .08, .66, .08, 0xd98a42, x, 0, .1));
    B(g, .8, .45, .32, WOOD_D, 0, 0, .48); },
  stage(g){ B(g, 4, .45, 3, WOOD_D, 0, 0, -.2); Fl(g, 4, 3, tmat(tex('stageplank', 256, 192, (x, w, h) => { const c = ['#a8763e', '#9a6a35', '#b4824a'];
      for (let i = 0; i < 12; i++){ x.fillStyle = c[i % 3]; x.fillRect(0, i * 16, w, 16); x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(0, i * 16, w, 1); } })), .452, 0, -.2);
    P(g, 4, .4, mat(0x8b1e2b), 0, .22, 1.302); B(g, .8, .22, .36, WOOD, 1.4, 0, 1.48); },
  speaker(g){ C(g, .2, .22, .05, MET, 0, 0, 0, 10); C(g, .04, .04, 1.55, MET, 0, .05, 0, 8); B(g, .32, .46, .26, BLACK, 0, 1.55);
    [[1.85, .1], [1.66, .05]].forEach(([y, r]) => { const c = C(g, r, r, .02, 0x555555, 0, 0, 0, 10); c.rotation.x = PI / 2; c.position.set(0, y, .135); }); },
  charger(g){ B(g, .95, .06, .5, WOOD, -.125, .43); [-.55, .25].forEach((x) => B(g, .05, .43, .45, MET, x, 0, 0));
    B(g, .25, 1.0, .5, 0x2f3e46, .475); P(g, .18, .3, tmat(tex('usb', 128, 210, drawUsb)), .475, .7, .251);
    B(g, .3, .03, .55, 0x1d3557, .475, 1.0); B(g, .02, .6, .02, glow(0x7cfc9a), .37, .3, .251); },

  // ===== J. 心靈陪伴（115/11/05 擴充） =====
  buddy_bench(g){ const Bl = 0x3f8fd2;
    [-.85, .45].forEach((x) => { B(g, .06, .42, .5, MET, x, 0, 0); B(g, .06, .5, .06, MET, x, .42, -.22); });
    [-.15, 0, .15].forEach((z) => B(g, 1.4, .04, .13, Bl, -.2, .42, z)); [.58, .76].forEach((y) => B(g, 1.4, .1, .03, Bl, -.2, y, -.25));
    B(g, .06, 1.6, .06, WOOD_D, .78, 0, -.15); B(g, .5, .38, .04, WOOD_D, .78, 1.12, -.15);
    P(g, .46, .34, tmat(tex('buddy', 256, 190, drawBuddy)), .78, 1.31, -.129); },
  thanks_tree(g){ C(g, .45, .5, .4, WOOD_D, 0, 0, 0, 10); C(g, .42, .42, .02, SOIL, 0, .4, 0, 10); C(g, .06, .09, 1.2, TRUNK, 0, .4, 0, 6);
    const pastel = [0xfff59d, 0xffccbc, 0xc5e1a5, 0xb3e5fc, 0xf8bbd0, 0xd1c4e9];
    for (let k = 0; k < 5; k++){ const a = k / 5 * 2 * PI + .3, tip = [Math.cos(a) * .7, 2.0 + (k % 2) * .22, Math.sin(a) * .7];
      Rod(g, [0, 1.55, 0], tip, .035, TRUNK, 4); S(g, .2, LEAF3, tip[0], tip[1] + .06, tip[2], 1, .7, 1, 0);
      [.45, .8].forEach((t, j) => { const px = tip[0] * t, py = 1.55 + (tip[1] - 1.55) * t, pz = tip[2] * t;
        Rod(g, [px, py, pz], [px, py - .09, pz], .004, 0xeeeeee, 3); B(g, .1, .14, .01, pastel[(k * 2 + j) % 6], px, py - .23, pz, -a); }); }
    S(g, .3, LEAF, 0, 1.75, 0, 1, .8, 1, 0); },
  step_quotes(g){ const Cn = 0xd9d4ca;
    [['你可以的', '#e76f51'], ['慢慢來', '#2a9d8f'], ['我們都在', '#457b9d']].forEach(([t, c], i) => {
      const z = .4 - i * .4, hh = .2 * (i + 1); B(g, 1.6, hh, .4, Cn, 0, 0, z);
      P(g, 1.56, .18, tmat(sign('step' + i, t, { w: 512, h: 60, bg: c, fg: '#fff', size: 44 })), 0, hh - .1, z + .201); }); },
  mood_meter(g){ [-.55, .55].forEach((x) => B(g, .06, 1.85, .06, WOOD_D, x)); B(g, 1.04, 1.36, .05, WOOD, 0, .47, -.01);
    P(g, 1.0, 1.3, tmat(tex('moodmeter', 400, 520, drawMood)), 0, 1.15, .017); B(g, 1.2, .05, .22, WOOD_D, 0, 1.85); },
  peace_stones(g){ const Gy = 0x9fb3bf, cols = [0xf28482, 0xf6bd60, 0x84a59d, 0x6fa8dc, 0xb39ddb];
    for (let k = 0; k < 6; k++){ const a = k / 6 * 2 * PI; S(g, .12, Gy, Math.cos(a) * .27, .06, Math.sin(a) * .27, 1, .5, .85, 0); }
    [[.15, .07], [.12, .19], [.1, .29], [.08, .37], [.06, .44]].forEach(([r, y], i) => S(g, r, cols[i], (i % 2) * .02, y, 0, 1, .5, 1, 0));
    [[.3, .25, cols[3]], [-.28, .2, cols[0]]].forEach(([x, z, c]) => S(g, .06, c, x, .14, z, 1, .5, 1, 0)); },
  wish_rack(g){ [-.85, .85].forEach((x) => { B(g, .08, 1.8, .08, WOOD, x); B(g, .3, .06, .3, WOOD_D, x); });
    [1.0, 1.35].forEach((y) => B(g, 1.7, .05, .05, WOOD, 0, y));
    B(g, 1.9, .06, .4, WOOD_D, 0, 1.8); B(g, .74, .2, .03, WOOD_D, 0, 1.56);
    P(g, .7, .16, tmat(sign('wish', '心願卡', { w: 320, h: 72, bg: '#fff3d6', fg: '#b5452b', size: 48 })), 0, 1.66, .016);
    const pastel = [0xfff59d, 0xffccbc, 0xc5e1a5, 0xb3e5fc, 0xf8bbd0, 0xd1c4e9]; let n = 0;
    [1.0, 1.35].forEach((y) => { for (let i = 0; i < 8; i++, n++) B(g, .12, .17, .01, pastel[n % 6], -.72 + i * .205 + (n % 3) * .015, y - .2, .035, (n % 3 - 1) * .15); }); },
  talk_corner(g){ const Ch = 0xe9a23b;
    [[-.6, PI / 2], [.6, -PI / 2]].forEach(([x, ry]) => { const c = sub(g, x, 0, .1, ry);
      [[-.21, -.21], [.21, -.21], [-.21, .21], [.21, .21]].forEach(([a, b]) => B(c, .04, .4, .04, WOOD_D, a, 0, b));
      B(c, .5, .07, .5, Ch, 0, .4); B(c, .5, .5, .06, Ch, 0, .47, -.22); });
    C(g, .05, .07, .5, WOOD_D, 0, 0, .1, 6); C(g, .28, .28, .04, WOOD_L, 0, .5, .1, 12);
    B(g, .05, 1.2, .05, WOOD_D, 0, 0, -.5); B(g, .56, .3, .03, WOOD_D, 0, 1.15, -.5);
    P(g, .52, .26, tmat(tex('talk', 256, 128, drawTalk)), 0, 1.3, -.484); },

  // ===== K. 花蓮在地與校園認同 =====
  driftwood_bench(g){ const Dw = 0xb7a58a, Dd = 0x8f7f68;
    [-.62, .62].forEach((x) => C(g, .13, .15, .14, Dd, x, 0, 0, 7));
    const l = C(g, .18, .2, 1.95, Dw, 0, 0, 0, 7); l.rotation.z = PI / 2; l.position.set(0, .3, 0);
    B(g, 1.7, .03, .24, 0xcbbb9e, 0, .45);
    Rod(g, [.7, .35, .1], [.82, .52, .27], .04, Dw, 5); Rod(g, [-.5, .3, -.12], [-.6, .42, -.27], .035, Dw, 5); },
  driftwood_art(g){ const Dw = 0xb7a58a, Dd = 0x8f7f68, Dl = 0xcfc0a4;
    B(g, .6, .25, .4, STONE_D); Rod(g, [0, .25, 0], [0, 1.15, -.04], .04, Dd, 5);
    S(g, .14, Dw, 0, 1.25, 0, .9, .8, 1.9, 0); S(g, .09, Dl, 0, 1.33, .2, 1, 1, 1.2, 0);
    const bk = K(g, .03, .1, Dd, 0, 0, 0, 4); bk.rotation.x = PI / 2; bk.position.set(0, 1.33, .3);
    [-1, 1].forEach((s) => { for (let i = 0; i < 5; i++){ const z0 = .12 - i * .07;
      Rod(g, [s * .08, 1.28, z0], [s * (.58 - i * .05), 1.45 + i * .06 - (i % 2) * .03, z0 - .1 - i * .02], .022, i % 2 ? Dw : Dl, 4); } });
    [-.08, 0, .08].forEach((x) => Rod(g, [0, 1.25, -.2], [x * 1.5, 1.3, -.3], .02, Dd, 4)); },
  dolphin_statue(g){ const Dl = 0x7d8fa3, Bl = 0x2f6fb0;
    C(g, .5, .55, .25, STONE_D, 0, 0, 0, 10);
    [[-.2, .1, .2], [.2, -.1, .18], [0, .25, .14], [.25, .25, .12]].forEach(([x, z, r]) => { S(g, r, Bl, x, .27, z, 1.2, .8, 1, 0); S(g, r * .45, WHITE, x + r * .5, .27 + r * .6, z, 1, .6, 1, 0); });
    const fish = (x, y, z, ry, rx, k) => { const p = sub(g, x, y, z, ry); p.rotation.order = 'YXZ'; p.rotation.x = rx; p.scale.setScalar(k);
      S(p, .16, Dl, 0, 0, 0, .85, .9, 3, 0); S(p, .07, Dl, 0, -.02, .5, .8, .7, 1.4, 0);
      tri(p, Dl, [0, .12, .05], [0, .13, -.18], [0, .3, -.16]);
      [-1, 1].forEach((s) => { tri(p, Dl, [0, 0, -.44], [s * .24, .03, -.62], [s * .06, 0, -.5]); tri(p, Dl, [s * .1, -.06, .15], [s * .26, -.12, -.02], [s * .1, -.08, -.02]); }); };
    fish(-.12, 1.05, 0, .35, -1.0, 1); fish(.25, .78, .05, -.5, -.55, .8);
    Rod(g, [-.18, .3, -.15], [-.21, .64, -.24], .03, Dl, 5); Rod(g, [.35, .3, -.1], [.4, .57, -.23], .03, Dl, 5); },
  marble_rock(g){ const M = tmat(tex('marble', 256, 256, drawMarble));
    S(g, .5, M, 0, .36, 0, 1.38, .9, .95, 1); S(g, .16, M, .45, .08, .32, 1, .7, 1, 0);
    [[-.55, .35], [.4, -.42], [-.2, .45]].forEach(([x, z]) => K(g, .06, .16, 0x5f9b3a, x, 0, z, 4)); },
  school_stone(g){ const St = 0x8f8b83;
    B(g, 1.8, .15, .6, STONE_D); B(g, 1.6, .95, .4, St, 0, .15); B(g, 1.5, .08, .34, St, 0, 1.1);
    P(g, 1.5, .9, tmat(tex('schoolstone', 512, 300, drawSchool)), 0, .62, .201);
    [-.75, .75].forEach((x) => S(g, .12, LEAF, x, .2, .18, 1.2, .8, 1, 0)); },
  abacus(g){ const Fr = WOOD_D, Bd = 0x8b2b1f;
    const oct = (x, y) => { const o = mesh(g, new THREE.OctahedronGeometry(.085), Bd, x, y, 0); o.scale.set(1, .55, .75); };
    [-.95, .95].forEach((x) => { B(g, .1, 1.4, .14, Fr, x); B(g, .16, .06, .5, Fr, x); });
    [[.45, .1], [1.0, .06], [1.3, .1]].forEach(([y, t]) => B(g, 1.8, t, .12, Fr, 0, y));
    const val = [0, 0, 0, 0, 1, 1, 5];   // 撥出「115」
    for (let i = 0; i < 7; i++){ const x = -.78 + i * .26, v = val[i], lo = v % 5; C(g, .012, .012, .75, MET_L, x, .55, 0, 4);
      oct(x, v >= 5 ? 1.11 : 1.24);
      for (let k = 0; k < 4; k++) oct(x, k < lo ? .95 - k * .095 : .6 + (3 - k) * .095); } },
  handprint_wall(g){ B(g, 3, 1.92, .3, 0xf2efe6); B(g, 3.1, .08, .34, 0x8c7b6b, 0, 1.92);
    P(g, 2.9, 1.86, tmat(tex('hands', 1024, 656, drawHands)), 0, .96, .151); },
  clock_post(g){ const Gn = 0x1f4d3a, Au = 0xc9a23a;
    C(g, .26, .3, .3, Gn, 0, 0, 0, 10); C(g, .2, .26, .1, Au, 0, .3, 0, 10); C(g, .07, .09, 2.1, Gn, 0, .4, 0, 8); C(g, .12, .1, .2, Au, 0, 2.45, 0, 8);
    const d = C(g, .3, .3, .12, Gn, 0, 0, 0, 16); d.rotation.x = PI / 2; d.position.set(0, 2.8, 0);
    [.06, -.06].forEach((z) => T(g, .3, .02, Au, 0, 2.8, z, 0, 0, 0, 2 * PI, 16, 4));
    const f = tmat(tex('clock', 256, 256, drawClock));
    [1, -1].forEach((s) => { const c = mesh(g, new THREE.CircleGeometry(.27, 20), f, 0, 2.8, s * .062); c.rotation.y = s > 0 ? 0 : PI; c.castShadow = false; });
    K(g, .07, .14, Au, 0, 3.1, 0, 8); },
  rhombus_wall(g){ B(g, 2.4, 1.5, .3, 0xe8e2d6); B(g, 2.5, .1, .36, 0x4a3b30, 0, 1.5);
    const t = tmat(tex('rhombus', 512, 300, drawRhombus)); P(g, 2.3, 1.3, t, 0, .8, .151); P(g, 2.3, 1.3, t, 0, .8, -.151, PI); },
  // 阿美族（115/11/05 追加，全部待阿美族老師審查）：生活器物為主，不做祭儀物件與人像
  amis_wall(g){ B(g, 2.4, 1.5, .3, 0xe8e2d6); B(g, 2.5, .1, .36, 0x4a3b30, 0, 1.5);
    const t = tmat(tex('amis', 512, 300, drawAmis)); P(g, 2.3, 1.3, t, 0, .8, .151); P(g, 2.3, 1.3, t, 0, .8, -.151, PI); },
  amis_pot(g){ const CL = 0x9c5a3c;   // 圓底陶壺放在藤圈上
    B(g, .56, .22, .56, WOOD_D); T(g, .13, .03, RATTAN, 0, .25, 0, PI / 2, 0, 0, 2 * PI, 12, 4);
    const pts = [[0, 0], [.12, .01], [.22, .08], [.27, .2], [.26, .33], [.19, .44], [.12, .5], [.12, .55], [.15, .59]].map(([r, y]) => new THREE.Vector2(r, y));
    mesh(g, new THREE.LatheGeometry(pts, 12), mat(CL, { side: DS }), 0, .26, 0);
    T(g, .2, .01, 0x6b3a24, 0, .26 + .44, 0, PI / 2, 0, 0, 2 * PI, 12, 3); },
  amis_hut(g){ const Bm = 0xc2a65a, Bd = 0x9c8443, St = 0xc9a85a;   // 竹構茅草頂工寮，後半部有竹床可坐
    [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].forEach(([x, z]) => C(g, .06, .07, 2.0, Bm, x, 0, z, 6));
    [-1.4, 1.4].forEach((z) => C(g, .06, .07, 2.72, Bm, 0, 0, z, 6));
    B(g, .1, .1, 3.0, Bd, 0, 2.66); [-1.3, 1.3].forEach((x) => B(g, .08, .08, 2.8, Bd, x, 1.92));
    [-1, 1].forEach((sg) => { const r = B(g, 1.76, .12, 3.1, St, sg * .75, 2.265); r.rotation.z = -sg * .515;
      const e = B(g, .1, .14, 3.1, 0xa88a45, sg * 1.5, 1.82); e.rotation.z = -sg * .515; });
    [[-1.1, -.25], [1.1, -.25], [-1.1, -1.25], [1.1, -1.25]].forEach(([x, z]) => C(g, .04, .04, .42, Bd, x, 0, z, 5));
    for (let i = 0; i < 9; i++) C(g, .055, .055, 2.4, i % 2 ? Bm : 0xb39a52, 0, 0, 0, 6).rotation.z = PI / 2;
    g.children.slice(-9).forEach((o, i) => o.position.set(0, .47, -.25 - i * .125)); },
  bamboo_raft(g){ const Bm = 0xc2a65a, Bd = 0x9c8443;   // 海岸漁撈用竹筏，架在兩個木架上展示
    [-1.0, 1.0].forEach((x) => B(g, .16, .34, 1.1, WOOD_D, x));
    for (let i = 0; i < 8; i++){ const o = C(g, .065, .065, 2.9, i % 2 ? Bm : 0xb39a52, 0, 0, 0, 6); o.rotation.z = PI / 2; o.position.set(0, .405, -.455 + i * .13); }
    [-1.15, -.3, .55].forEach((x) => B(g, .07, .06, 1.12, Bd, x, .46));
    Rod(g, [-.6, .5, .3], [.9, .55, .42], .025, WOOD_D, 5); B(g, .1, .02, .3, WOOD_D, .95, .53, .42);
    S(g, .16, 0x3d5a40, .55, .55, -.15, 1.2, .5, 1, 0); },

  // ===== L. 自然生態 =====
  bug_hotel(g){ const F = WOOD_D;
    [[-.33, -.15], [.33, -.15], [-.33, .15], [.33, .15]].forEach(([x, z]) => B(g, .05, .4, .05, F, x, 0, z));
    B(g, .74, 1.0, .04, F, 0, .4, -.17); [-.35, .35].forEach((x) => B(g, .04, 1.0, .38, F, x, .4, 0));
    [.4, .65, .9, 1.15, 1.38].forEach((y) => B(g, .74, .03, .38, F, 0, y, 0));
    const zc = (o, x, y) => { o.rotation.x = PI / 2; o.position.set(x, y, .02); };
    for (let i = 0; i < 8; i++) zc(C(g, .035, .035, .3, i % 2 ? 0xc9b46a : 0xb39b52, 0, 0, 0, 6), -.27 + (i % 4) * .18, .49 + Math.floor(i / 4) * .08);
    [-.22, 0, .22].forEach((x) => zc(C(g, .1, .1, .3, WOOD_L, 0, 0, 0, 8), x, .78));
    [-.24, -.08, .08, .24].forEach((x) => S(g, .07, 0x7a4b2a, x, 1.02, .05, 1, 1.4, 1, 0));
    B(g, .66, .2, .32, 0xd9b45a, 0, 1.17, .01);
    P(g, .36, .09, tmat(sign('bughotel', '昆蟲旅館', { w: 256, h: 64, bg: '#fff3d6', fg: '#6b4423', size: 40 })), 0, 1.27, .171);
    [-1, 1].forEach((s) => { const r = B(g, .46, .03, .46, 0x8b3a2b, s * .19, 1.515, 0); r.rotation.z = -s * .6; }); },
  bird_bath(g){ C(g, .2, .24, .08, STONE_D, 0, 0, 0, 10); C(g, .07, .1, .62, STONE, 0, .08, 0, 8); C(g, .3, .14, .16, STONE, 0, .7, 0, 12);
    C(g, .27, .27, .02, water(), 0, .83, 0, 12);
    const Br = 0x8d6e63; S(g, .055, Br, .2, .93, .05, 1.4, 1, 1, 0); S(g, .035, Br, .26, .98, .05, 1, 1, 1, 0);
    const bk = K(g, .012, .04, 0xf2a03d, 0, 0, 0, 4); bk.rotation.z = -PI / 2; bk.position.set(.31, .98, .05); },
  butterfly_bed(g){ B(g, 1.6, .35, 1, WOOD); B(g, 1.52, .02, .92, SOIL, 0, .34);
    const oct = (r, c, x, y, z) => mesh(g, new THREE.OctahedronGeometry(r), c, x, y, z), fc = [0xf26b1d, 0xe63946, 0xc77dff, 0xffd166, 0xff8fab];
    [[-.5, -.2, .26], [0, .15, .3], [.5, -.15, .24], [-.25, .3, .2], [.35, .3, .2]].forEach(([x, z, r], i) => { S(g, r, i % 2 ? LEAF : LEAF3, x, .36 + r * .7, z, 1, 1, 1, 0);
      for (let k = 0; k < 3; k++){ const a = k * 2.1 + i; oct(.045, fc[(i + k) % 5], x + Math.cos(a) * r * .7, .36 + r * 1.35, z + Math.sin(a) * r * .7); } });
    [[-.3, .82, .1, 0xf26b1d, .4], [.25, .76, -.2, 0xffd166, -.6]].forEach(([x, y, z, c, ry]) => { const p = sub(g, x, y, z, ry);
      [-1, 1].forEach((s) => { tri(p, c, [0, 0, .03], [s * .09, .05, .05], [s * .08, .01, -.04]); tri(p, c, [0, 0, -.01], [s * .06, -.01, -.06], [s * .02, 0, -.05]); });
      B(p, .012, .012, .07, BLACK, 0, -.006, 0); });
    B(g, .02, .5, .02, WOOD_D, .7, .35, .42); P(g, .26, .1, tmat(sign('nectar', '蜜源植物', { w: 256, h: 96, bg: '#fff', fg: '#2e7d4f', size: 46 })), .7, .8, .432); },
  rain_barrel(g){ const Bl = 0x2f6fb0, Bd = 0x245a90;
    B(g, .62, .16, .62, WOOD_D); C(g, .29, .27, .86, Bl, 0, .16, 0, 16); C(g, .3, .3, .04, Bd, 0, 1.02, 0, 16);
    [.35, .78].forEach((y) => C(g, .3, .3, .03, Bd, 0, y, 0, 16));
    Rod(g, [-.1, 1.03, -.1], [-.1, 1.1, -.1], .04, MET_L, 6); Rod(g, [-.1, 1.1, -.1], [-.1, 1.1, -.34], .04, MET_L, 6);
    B(g, .05, .05, .1, MET_L, 0, .24, .3);
    P(g, .24, .12, tmat(sign('rain', '雨水撲滿', { w: 256, h: 128, bg: '#e8f4ff', fg: '#245a90', size: 50 })), 0, .6, .29); },
  compost(g){ const F = WOOD;
    [[-.58, -.38], [.58, -.38], [-.58, .38], [.58, .38], [0, -.38], [0, .38]].forEach(([x, z]) => B(g, .06, .75, .06, WOOD_D, x, 0, z));
    [.05, .3, .55].forEach((y) => { [-.38, .38].forEach((z) => B(g, 1.2, .15, .03, F, 0, y, z)); [-.58, 0, .58].forEach((x) => B(g, .03, .15, .76, F, x, y, 0)); });
    B(g, 1.1, .6, .7, SOIL);
    const r = rng(9); for (let i = 0; i < 5; i++) S(g, .07, i % 3 ? LEAF3 : 0xd9822b, -.5 + r() * .4, .62, -.25 + r() * .5, 1, .4, 1, 0);
    B(g, .6, .03, .82, WOOD_D, .3, .75);
    const lid = B(g, .6, .03, .82, WOOD_D); lid.rotation.x = -.6; lid.position.set(-.3, .98, -.07);
    P(g, .26, .09, tmat(sign('compost', '堆肥箱', { w: 256, h: 88, bg: '#fff3d6', fg: '#6b4423', size: 50 })), .3, .52, .397); },
  cat_station(g){ const Rf = 0x8b3a2b, O = 0xe39a4f;
    B(g, .5, .4, .5, WOOD, -.12, 0, -.05);
    [-1, 1].forEach((s) => { const r = B(g, .36, .03, .6, Rf, -.12 + s * .149, .485, -.05); r.rotation.z = -s * .6; });
    tri(g, WOOD, [-.37, .4, .201], [.13, .4, .201], [-.12, .58, .201]);
    mesh(g, new THREE.CircleGeometry(.11, 12), BLACK, -.12, .18, .202).castShadow = false;
    P(g, .2, .065, tmat(sign('catsign', '校貓之家', { w: 256, h: 80, bg: '#fff3d6', fg: '#8b3a2b', size: 44 })), -.12, .44, .204);
    [[.15, .2, 0x4fa3d1, water()], [.3, .2, 0xf28482, 0x8d5524]].forEach(([x, z, c, f]) => { C(g, .07, .05, .04, c, x, 0, z, 10); C(g, .055, .055, .01, f, x, .035, z, 10); });
    S(g, .1, O, .28, .1, -.12, 1, 1, 1.3, 0); S(g, .07, O, .28, .24, -.04, 1, 1, 1, 0);
    [-.04, .04].forEach((dx) => K(g, .025, .06, O, .28 + dx, .29, -.04, 4));
    Rod(g, [.28, .06, -.25], [.36, .2, -.3], .018, O, 4); },
  eco_sign(g){ [-.33, .33].forEach((x) => B(g, .06, 1.15, .06, WOOD_D, x));
    const p = sub(g, 0, 1.25, 0); p.rotation.x = -.5; B(p, .8, .5, .04, WOOD, 0, -.5, 0); P(p, .74, .44, tmat(tex('eco', 400, 240, drawEco)), 0, -.25, .021); },
};

// 地板磁磚：底座 3 cm 厚＋上面一層貼圖
for (const [id, [base, draw, emit, tw = 256, th = 256]] of Object.entries(TILE)){
  BUILD[id] = (g, it) => {
    const [w, d] = it.fp, t = tex(id, tw, th, draw);
    B(g, w, .03, d, parseInt(base.slice(1), 16));
    Fl(g, w, d, emit ? mat(0xffffff, { map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .7 }) : tmat(t), .031);
  };
}

export const BY_ID = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
export const MISSING = ITEMS.filter((it) => !BUILD[it.id]).map((it) => it.id);

export const setsOf = (id) => SETS.filter((t) => t.members.includes(id));

// ---------- 改色（規格書 §6.3）：把物件的「主色」換成調色盤顏色 ----------
// 主色＝表面積最大、沒貼圖、不透明、不發光、也不是葉子／泥土／樹幹的顏色；認錯時在 KEY 手動指定
export const KEY = {};
const NOT_KEY = new Set([LEAF, LEAF2, LEAF3, SOIL, TRUNK].map((c) => new THREE.Color(c).getHex()));
const KC = new Map(), RCM = new Map();
const plain = (m) => m.isMeshLambertMaterial && !m.map && !m.transparent && m.emissive.getHex() === 0;
function surf(o){
  const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
  const p = geo.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let s = 0;
  for (let i = 0; i < p.count; i += 3){ a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); s += b.sub(a).cross(c.sub(a)).length() / 2; }
  geo.dispose(); return s;
}
export function keyColor(id){
  if (KC.has(id)) return KC.get(id);
  let best = null;
  if (BY_ID[id] && BY_ID[id].rc){
    if (KEY[id] !== undefined) best = new THREE.Color(KEY[id]).getHex();
    else {
      const g = build(id), area = new Map(); g.updateMatrixWorld(true);
      g.traverse((o) => { if (!o.isMesh || !plain(o.material)) return; const c = o.material.color.getHex(); if (NOT_KEY.has(c)) return; area.set(c, (area.get(c) || 0) + surf(o)); });
      let a0 = 0; for (const [c, a] of area) if (a > a0){ a0 = a; best = c; }
    }
  }
  KC.set(id, best); return best;
}
// 這件物件可用的顏色序號（0＝原色）；和主色太接近的色票略過
export function variants(id){
  const k = keyColor(id); if (k === null) return [0];
  const kc = new THREE.Color(k), out = [0];
  for (let i = 1; i < PALETTE.length; i++){ const c = new THREE.Color(PALETTE[i][1]); if (Math.abs(c.r - kc.r) + Math.abs(c.g - kc.g) + Math.abs(c.b - kc.b) > .12) out.push(i); }
  return out;
}

// 建出物件：回傳 THREE.Group（未合併，方便檢視）；v＝調色盤序號，0 是原色
export function build(id, v = 0){
  const it = BY_ID[id], g = new THREE.Group(); g.name = id;
  if (BUILD[id]) BUILD[id](g, it); else B(g, it.fp[0], it.h, it.fp[1], mat(0xff00ff));   // 沒有模型時用洋紅方塊提醒
  const k = v ? keyColor(id) : null, hex = v && PALETTE[v] ? PALETTE[v][1] : null;
  if (k !== null && hex) g.traverse((o) => {
    if (!o.isMesh || !plain(o.material) || o.material.color.getHex() !== k) return;
    const key = o.material.uuid + hex; let m = RCM.get(key);
    if (!m){ m = o.material.clone(); m.color.set(hex); RCM.set(key, m); }
    o.material = m;
  });
  return g;
}

// 依材質合併：回傳 [{ geometry, material, cast }]，遊戲端每個「物件＋顏色」的每一塊做一個 InstancedMesh
export function bake(id, v = 0){
  const g = build(id, v); g.updateMatrixWorld(true);
  const by = new Map();
  g.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.clearGroups();
    const k = o.material.uuid;
    if (!by.has(k)) by.set(k, { material: o.material, list: [], cast: o.castShadow });
    by.get(k).list.push(geo);
  });
  return [...by.values()].map((v) => ({ material: v.material, geometry: mergeGeometries(v.list, false), cast: v.cast }));
}

export function triCount(parts){ return parts.reduce((s, p) => s + p.geometry.attributes.position.count / 3, 0); }
