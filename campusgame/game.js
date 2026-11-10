// 校園改造遊戲 建造模式（M2、M3，115/11/05）：型錄面板、放置、選取、移動、旋轉、複製、收回、改色、復原／重做、本機存檔；
// M3：拆除原有物件（樹、棕櫚、樹籬、路燈、中庭桌椅）、可放在資訊館平台與司令台台面
// M4：磁磚拖曳連鋪、校園評價星等、套組觸發、圖層（危險點、暗區、照明、求助）、顧問提示
// M5：學校 Google 帳號登入，依名單進入自己那一組，作品存在 Firestore cgWorks（每 5 秒同步同組隊友）
// M6：探勘階段放心情釘（怕／吵／暗／想待／想躲，每種 3 支），老師開放後看全班熱區；安心分改以全班「怕／暗／想躲」為需求點
// M7：方案面板（改造理念、提案海報 PNG）；展示階段看別組方案（唯讀）並投「我願意在這裡待」
// 115/11/10：資訊館周遭設施可移除（雜草、矮牆、花台、水塔、走廊…）；改造前照片（每組 6 張，對位後左右拉桿比較「改造前照片／改造後 3D」）
// 由 index.html 在「同材質合併」之後載入，學生物件掛在 studentRoot，每種「物件＋顏色」一組 InstancedMesh，不參與合併。
// 規格：C:\1031hlbhschool\校園改造遊戲規格書.md §4.2–4.6、§10
import * as THREE from '../campus3d/lib/three.module.js';
import { CATS, ITEMS, PALETTE, BY_ID, bake, build, variants } from './items.js';
import { REMOVE } from './items-data.js';
import { score, siteScore, isLight, isHelp, inPoly as inP, K as SK, K2 } from './score.js';
import * as CL from './cloud.js';
import { CSS2DObject } from '../campus3d/lib/CSS2DRenderer.js';

let BUDGET = 2000, SAVE_KEY = 'campusgame-work-v1';   // 登入班級後改用班級預算與該組的存檔鍵
// 預算預設 2000 點（115/11/10 老師決定，原 1000）。115/11/10 前建的班都存著舊預設 1000，一律當成 2000；老師之後在後台另外設定的（b2 標記）才照設定值
const budgetOf = (c) => c && c.budget && (c.b2 || c.budget !== 1000) ? c.budget : 2000;
const MAX_ITEMS = 300, MAX_TILES = 400, GRID = .5, UNDO_MAX = 50;
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
/* 起始頁（115/11/06）：每次開遊戲先看到，學生登入後看到自己的班、組與這個階段要做什麼；老師可進後台或示範 */
#gStart{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(12,22,32,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
#gStart.show{display:flex}
#gStart .card{background:var(--panel);color:var(--ink);border-radius:18px;width:100%;max-width:460px;max-height:calc(100% - 8px);overflow:auto;padding:22px 22px 18px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
#gStart h2{margin:0 0 4px;font-size:24px;font-weight:900}
#gStart .lead{margin:0 0 14px;color:var(--sub);font-size:15px;font-weight:600;line-height:1.55}
#gStart .who{margin:0 0 12px;font-size:17px;font-weight:900}
#gStart .who small{display:block;font-size:13px;color:var(--sub);font-weight:600;margin-top:2px;word-break:break-all}
#gStart ol{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:6px}
#gStart li{border:1px solid var(--line);border-radius:12px;padding:8px 12px;font-size:14px;font-weight:600;color:var(--sub);line-height:1.5}
#gStart li b{display:block;font-size:15px;font-weight:900;color:var(--ink)}
#gStart li.now{border:2px solid var(--accent);color:var(--ink);background:rgba(31,111,235,.08)}
#gStart li.now b::after{content:'　← 現在';color:var(--accent);font-size:13px}
#gStart .warn{background:rgba(229,57,53,.1);border-radius:10px;padding:9px 12px;font-size:14px;font-weight:700;margin:0 0 12px;line-height:1.5}
#gStart .btns{display:flex;flex-direction:column;gap:8px}
#gStart button{font:inherit;font-size:16px;font-weight:900;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer}
#gStart button.go{background:var(--accent);color:#fff;border-color:transparent;font-size:17px}
#gStart button.lk{border:0;background:none;color:var(--sub);font-size:14px;font-weight:700;padding:6px;text-decoration:underline}
#gBgm{background:var(--panel);border:0;padding:6px 9px;border-radius:8px;font:inherit;font-size:14px;font-weight:800;pointer-events:auto;cursor:pointer;color:var(--ink)}
#gBgmPop{position:fixed;top:58px;right:12px;z-index:30;width:220px;background:var(--panel);color:var(--ink);border-radius:12px;padding:10px 12px;box-shadow:0 4px 16px rgba(0,0,0,.25);display:none;flex-direction:column;gap:8px;font-size:14px;font-weight:800}
#gBgmPop.show{display:flex}
#gBgmPop label{display:flex;align-items:center;gap:8px;cursor:pointer}
#gBgmPop input[type=range]{width:100%;accent-color:var(--accent)}
#gBgmPop small{color:var(--sub);font-weight:700;font-size:12px;line-height:1.4}
#gAdmin{background:#fff3e0;color:#e65100;border:0;padding:6px 10px;border-radius:8px;font:inherit;font-size:13px;font-weight:800;pointer-events:auto;cursor:pointer;display:none}
#gLogin{background:var(--panel);border:0;padding:6px 10px;border-radius:8px;font:inherit;font-size:13px;font-weight:800;pointer-events:auto;cursor:pointer;color:var(--ink)}
#gLogin.in{background:#e8f5e9;color:#1b5e20}
#gLogin i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#2ecc71;margin-left:6px;vertical-align:middle}
#gLogin i.busy{background:#f2c230} #gLogin i.err{background:#e53935}
#gMood{position:absolute;z-index:13;background:var(--panel);border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.25);padding:8px;display:none;gap:6px;flex-wrap:wrap;max-width:min(420px,calc(100% - 16px))}
#gMood.show{display:flex}
#gMood button{font:inherit;font-size:14px;font-weight:800;padding:8px 10px;border-radius:10px;border:2px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer;min-width:74px}
#gMood button.on{border-color:var(--accent);box-shadow:0 0 0 3px rgba(31,111,235,.25)}
#gMood button small{display:block;font-size:11px;color:var(--sub)}
#gMood p{flex-basis:100%;margin:2px 4px 0;font-size:12px;color:var(--sub);font-weight:700}
.mpin{font-size:20px;line-height:1;background:#fff;border:3px solid;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:30px;height:30px;display:flex;align-items:center;justify-content:center;
  box-shadow:0 2px 6px rgba(0,0,0,.35);pointer-events:none;margin-top:-30px}
.mpin span{transform:rotate(45deg)}
#gPlanBtn{background:var(--panel);border:0;padding:6px 10px;border-radius:8px;font:inherit;font-size:13px;font-weight:800;pointer-events:auto;cursor:pointer;color:var(--ink)}
#gPlans{position:absolute;left:12px;top:60px;z-index:13;width:min(340px,calc(100% - 24px));max-height:calc(100% - 140px);overflow-y:auto;background:var(--panel);
  border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,.25);padding:12px 14px;display:none;font-size:13px}
#gPlans.show{display:block}
#gPlans h3{margin:0 0 8px;font-size:16px;font-weight:900;display:flex;justify-content:space-between;align-items:center}
#gPlans h3 button{border:0;background:none;font-size:20px;color:var(--sub);cursor:pointer;padding:0 4px}
#gPlans h4{margin:12px 0 6px;font-size:13px;font-weight:900;color:var(--sub)}
#gPlans textarea{width:100%;box-sizing:border-box;min-height:60px;font:inherit;font-size:14px;font-weight:700;padding:8px;border:1px solid var(--line);border-radius:9px;background:var(--btn);color:var(--ink);resize:vertical}
#gPlans .pb{display:block;width:100%;margin:6px 0;font:inherit;font-size:14px;font-weight:800;padding:9px 10px;border-radius:10px;border:1px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer;text-align:left}
#gPlans .pb.me{border-color:var(--accent)} #gPlans .pb.on{background:var(--accent);color:#fff}
#gPlans .pb small{float:right;color:inherit;opacity:.8}
#gPlans .go{background:var(--accent);color:#fff;border-color:transparent;text-align:center}
#gView{position:absolute;left:50%;top:62px;transform:translateX(-50%);z-index:14;background:#37474f;color:#fff;border-radius:12px;padding:8px 10px;display:none;gap:8px;align-items:center;
  box-shadow:0 4px 14px rgba(0,0,0,.3);font-size:14px;font-weight:800;flex-wrap:wrap;justify-content:center;max-width:calc(100% - 24px)}
.viewing #gView{display:flex}
#gView button{font:inherit;font-size:14px;font-weight:800;padding:7px 12px;border-radius:9px;border:0;cursor:pointer}
#gView .vote{background:#ffca28;color:#3d2c00} #gView .vote.on{background:#43a047;color:#fff} #gView .home{background:#fff;color:#37474f}
#gFrameV{position:absolute;inset:0;border:6px solid #90a4ae;z-index:9;pointer-events:none;display:none}
.viewing #gFrameV{display:block}
.viewing #gCat,.viewing #gTools,.viewing #gSel,.viewing #gStat{display:none!important}
/* 主要改造點、全班共創校園（115/11/10） */
#gSite{position:fixed;inset:0;z-index:45;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;padding:14px}
#gSite.show{display:flex}
#gSite .box{background:var(--panel);color:var(--ink);border-radius:16px;padding:16px 18px;max-width:520px;width:100%;max-height:calc(100% - 8px);overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.35)}
#gSite h3{margin:0 0 6px;font-size:19px;font-weight:900}
#gSite p{margin:0 0 10px;font-size:14px;line-height:1.55;color:var(--sub);font-weight:700}
#gSite .ls{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:12px}
#gSite .ls button{font:inherit;text-align:left;font-size:15px;font-weight:800;padding:9px 11px;border-radius:11px;border:2px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer}
#gSite .ls button.on{border-color:var(--accent);background:rgba(31,111,235,.1)}
#gSite .ls small{display:block;font-size:12px;font-weight:700;color:var(--sub)} #gSite .ls small.many{color:#c62828}
#gSite .bs{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:14px;font-weight:800;margin-bottom:12px}
#gSite .bs input{width:64px;font:inherit;font-size:16px;font-weight:800;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--btn);color:var(--ink)}
#gSite .row{display:flex;gap:8px;justify-content:flex-end}
#gSite .row button{font:inherit;font-size:15px;font-weight:800;padding:10px 16px;border-radius:10px;border:1px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer}
#gSite .row button.go{background:var(--accent);color:#fff;border-color:transparent} #gSite .row button:disabled{opacity:.45}
@media (max-width:520px){ #gSite .ls{grid-template-columns:1fr} }
#gPlans .site{border:2px solid var(--accent);border-radius:10px;padding:8px 10px;margin-bottom:10px;font-size:14px;font-weight:800;display:flex;gap:8px;align-items:center;justify-content:space-between}
#gPlans .site button{font:inherit;font-size:13px;font-weight:800;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer;flex:none}
#gCo{position:absolute;left:12px;top:60px;z-index:13;width:min(340px,calc(100% - 24px));max-height:calc(100% - 140px);overflow-y:auto;background:var(--panel);
  border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,.25);padding:12px 14px;display:none;font-size:13px}
#gCo.show{display:block}
#gCo h3{margin:0 0 6px;font-size:16px;font-weight:900} #gCo p{margin:0 0 8px;color:var(--sub);font-weight:700;line-height:1.55}
#gCo .cs{border:1px solid var(--line);border-radius:10px;padding:7px 9px;margin:6px 0}
#gCo .cs b{display:block;font-size:14px;font-weight:900;cursor:pointer} #gCo .cs b small{font-weight:700;color:var(--sub);margin-left:6px}
#gCo .cg{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
#gCo button{font:inherit;font-size:13px;font-weight:800;padding:6px 9px;border-radius:8px;border:1px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer}
#gCo button.on{background:var(--accent);color:#fff;border-color:transparent} #gCo button.cv{background:#ffca28;color:#3d2c00;border-color:transparent;margin-top:5px} #gCo button.cv.on{background:#43a047;color:#fff}
.photoing #gCo,.photoing #gSite{display:none!important}
/* 改造前照片（115/11/10） */
.ppin{font-size:17px;line-height:1;width:34px;height:34px;border-radius:50%;background:#fff;border:3px solid #1f6feb;display:flex;align-items:center;justify-content:center;
  box-shadow:0 2px 6px rgba(0,0,0,.35);pointer-events:auto;cursor:pointer}
.photoing .lbl,.photoing .pin,.photoing .mpin,.photoing .ppin{display:none!important}
.photoing header,.photoing #gCat,.photoing #gTools,.photoing #gSel,.photoing #gStat,.photoing #peg,.photoing #gTip,.photoing #gView,.photoing #gPhoto,.photoing #gScore,.photoing #gPlans,
.photoing #gFrameV,.photoing #gFrame,.photoing #gLayers,.photoing #gMood{display:none!important}
#gPhoto{position:absolute;left:12px;top:60px;z-index:13;width:min(340px,calc(100% - 24px));max-height:calc(100% - 140px);overflow-y:auto;background:var(--panel);
  border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,.25);padding:12px 14px;display:none;font-size:13px}
#gPhoto.show{display:block}
#gPhoto h3{margin:0 0 8px;font-size:16px;font-weight:900;display:flex;justify-content:space-between;align-items:center}
#gPhoto h3 button{border:0;background:none;font-size:20px;color:var(--sub);cursor:pointer;padding:0 4px}
#gPhoto p{margin:0 0 8px;color:var(--sub);font-weight:700;line-height:1.55}
#gPhoto .pr{display:flex;gap:8px;align-items:center;margin:6px 0;padding:6px;border:1px solid var(--line);border-radius:10px}
#gPhoto .pr img{width:72px;height:54px;object-fit:cover;border-radius:6px;background:#dde3e8;flex:none}
#gPhoto .pr span{flex:1;font-weight:800;min-width:0;word-break:break-all;color:var(--ink)}
#gPhoto .pr button,#gPhoto .go{font:inherit;font-size:13px;font-weight:800;padding:7px 10px;border-radius:9px;border:1px solid var(--line);background:var(--btn);color:var(--ink);cursor:pointer;flex:none}
#gPhoto .pr button.del{color:#c62828}
#gPhoto .go{display:block;width:100%;margin-top:8px;background:var(--accent);color:#fff;border-color:transparent;padding:10px;font-size:14px}
#gPho{position:fixed;inset:0;z-index:30;display:none;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}
.photoing #gPho{display:block}
#gPho .fr{position:absolute;box-shadow:0 0 0 200vmax rgba(0,0,0,.82);pointer-events:none}
#gPho.al .fr{box-shadow:0 0 0 200vmax rgba(0,0,0,.35);outline:2px dashed rgba(255,255,255,.9)}
#gPho .fr img{position:absolute;inset:0;width:100%;height:100%;display:block}
#gPho .dv{position:absolute;top:0;bottom:0;width:4px;margin-left:-2px;background:#fff;box-shadow:0 0 6px rgba(0,0,0,.6)}
#gPho .dv::after{content:'⇔';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:50%;background:#fff;color:#1d2a33;font-size:22px;font-weight:900;
  display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.45)}
#gPho .fr b{position:absolute;bottom:10px;font-size:15px;font-weight:900;color:#fff;background:rgba(0,0,0,.62);padding:4px 12px;border-radius:999px}
#gPho .tb{left:10px} #gPho .ta{right:10px}
#gPho.al .dv,#gPho.al .fr b,#gPho.mix .dv,#gPho.mix .fr b{display:none}
#gPho .top{position:absolute;left:0;right:0;top:0;display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;padding:calc(8px + env(safe-area-inset-top)) 10px 8px;pointer-events:none}
#gPho .top span{flex:1;min-width:140px;color:#fff;font-size:15px;font-weight:900;text-shadow:0 1px 4px #000,0 0 8px #000}
#gPho button{pointer-events:auto;font:inherit;font-size:14px;font-weight:800;padding:9px 13px;border-radius:10px;border:0;background:#fff;color:#1d2a33;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3)}
#gPho button.go{background:#1f6feb;color:#fff} #gPho button.del{color:#c62828} #gPho button.on{background:#ffca28}
#gPho button:disabled{opacity:.6}
#gPho.al .vw,#gPho:not(.al) .aw,#gPho.ro .ow{display:none}
#gPho .pan{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(8px + env(safe-area-inset-bottom));width:min(760px,calc(100% - 16px));box-sizing:border-box;background:rgba(20,28,36,.84);color:#fff;
  border-radius:14px;padding:10px 12px;display:none;gap:8px 14px;flex-wrap:wrap;align-items:center;font-size:13px;font-weight:800;cursor:default}
#gPho.al .pan{display:flex}
#gPho .pad{display:grid;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(2,40px);gap:4px;flex:none}
#gPho .pad button{padding:0;font-size:15px}
#gPho .pan label{display:flex;align-items:center;gap:6px;flex:1 1 170px;white-space:nowrap}
#gPho .pan input[type=range]{flex:1;min-width:70px;accent-color:#ffca28}
#gPho .pan input[type=text]{flex:1 1 220px;min-width:0;font:inherit;font-size:14px;font-weight:700;padding:8px 10px;border-radius:9px;border:0;user-select:text;-webkit-user-select:text}
#gPho .pan p{flex:1 1 100%;margin:0;font-size:12px;font-weight:700;opacity:.9;line-height:1.5}
#gPho .acts{display:flex;gap:8px;margin-left:auto}
`;

export function init(G){
  const { scene, camera, controls, renderer, occBoxes, BOUND, QL, WALK, toast, groundAt, RM = [], rmSet = () => {}, SURF = [], SOLID = [], WATER = [], PTS = [], DARK = [], exitWalk = () => {} } = G;
  const app = renderer.domElement.parentElement, body = document.body;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  // 整頁不該捲動（iPad 叫出鍵盤或程式捲動卡片時可能被推上去）：一捲就歸零
  const unscroll = () => { const e = document.scrollingElement || document.documentElement; if (e.scrollTop || e.scrollLeft){ e.scrollTop = 0; e.scrollLeft = 0; } if (document.body.scrollTop) document.body.scrollTop = 0; };
  addEventListener('scroll', unscroll, true); if (window.visualViewport) visualViewport.addEventListener('resize', () => setTimeout(unscroll, 50));

  // ---------- 狀態 ----------
  const S = { items: {}, removed: {}, site: 0, base: null };   // site：主要改造點（危險點編號，0＝還沒選）；base：學習單現況分數 {a 安心, s 散心}；items：uid → { id, x, y（所在表面高度）, z, rot（度）, v（調色盤序號） }；removed：拆掉的原有物件 id
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
  RM.forEach((r) => { const c = r.box.getCenter(new THREE.Vector3()), k = r.kind === 'tree' || r.kind === 'palm' || r.kind === 'juniper' ? .5 : 0;
    r.foot = k ? [c.x - k, c.z - k, c.x + k, c.z + k] : [r.box.min.x, r.box.min.z, r.box.max.x, r.box.max.z];
    if (r.kind === 'corridor' || r.kind === 'awning') r.foot = null; });   // 有頂的走廊、遮陽棚：底下本來就能放東西
  const rmName = (k) => ((REMOVE[k] && REMOVE[k].name) || '物件').replace(/（.*）/, '');
  function check(id, x, z, rot, ignore, y = 0){
    const C4 = corners(id, x, z, rot, .02);
    if (!C4.every(([a, b]) => inPoly(a, b))) return '超出校園範圍';
    if (y > 0){
      const qs = SURF.filter((o) => Math.abs(o.y - y) < .01), q = qs.find((o) => C4.every(([a, b]) => a > o.x0 && a < o.x1 && b > o.z0 && b < o.z1));   // 同高度的台可能不只一個（資訊館平台、右翼平台）
      if (!q) return `要整個放在${qs[0] ? qs[0].name : '台'}上`;
      if (BY_ID[id].h > q.clear) return `太高了，${q.name}上放不下`;
    } else if (SURF.some((q) => overlap(C4, rectPoly(q)))) return '壓到平台或司令台的邊了，請放到台上或台下空地';
    else { const q = SOLID.find((o) => overlap(C4, rectPoly(o))); if (q) return `這裡是${q.name}，放不了東西`;
      const w = id === 'tile_wood' ? null : WATER.find((o) => inP(o.poly, x, z) || C4.some(([a, b]) => inP(o.poly, a, b)));   // 水池（115/11/10）：只有木棧板能鋪在水上
      if (w) return `這裡是${w.name}，不能放（木棧板可以鋪在水面上當棧道）`; }
    const xs = C4.map((c) => c[0]), zs = C4.map((c) => c[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    if (occBoxes.some((b) => !b.off && b.min.y < y + 1 && b.max.y > y + .3 && b.max.x > x0 && b.min.x < x1 && b.max.z > z0 && b.min.z < z1)) return '這裡有建築或原有設施擋住';
    if (!isTile(id) && y === 0){ const r = RM.find((o) => !o.off && o.foot && o.foot[2] > x0 && o.foot[0] < x1 && o.foot[3] > z0 && o.foot[1] < z1);
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
  function changed(){ clearTimeout(saveT); saveT = setTimeout(save, 300); hud(); showSel(); rescore(); if (CS.w) schedulePush(); }
  function save(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, t: Date.now(), items: S.items, removed: S.removed, site: S.site, base: S.base })); } catch (e) {} }
  function load(){
    try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!d || !d.items) return 0;
      let n = 0; for (const [u, it] of Object.entries(d.items)) if (BY_ID[it.id] && !BY_ID[it.id].tags.includes('hidden')){ S.items[u] = { id: it.id, x: +it.x, y: +it.y || 0, z: +it.z, rot: +it.rot || 0, v: +it.v || 0 }; n++; }
      for (const id of Object.keys(d.removed || {})) if (RMI.has(id)) setRm(id, true);
      S.site = +d.site || 0; S.base = d.base || null;
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
  function hud(){ const n = Object.keys(S.items).length, s = spent(), k = Object.keys(S.removed).length; hudEl.textContent = `花費 ${s}${BUDGET >= 99999 ? ' 點（示範不限）' : `／${BUDGET} 點`}・${n} 件${k ? `・拆 ${k}` : ''}`; hudEl.style.color = s > BUDGET * .9 ? '#c62828' : ''; tb.undo.disabled = !UNDO.length; tb.redo.disabled = !REDO.length; }

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
  tools.innerHTML = `<button data-t="cat" class="on">型錄</button><button data-t="mood" style="display:none">心情釘</button><button data-t="layer">圖層</button><button data-t="demo" class="demo" title="點一下物件就移走（自己放的，或頭上有紅點的原有物件：樹、樹籬、路燈、桌椅、雜草、矮牆、花台…）">移除</button><button data-t="photo" title="上傳改造前的照片，和改造後的 3D 左右比較">📷 照片</button><button data-t="rot">旋轉</button><button data-t="grid" class="on">格線</button>
    <button data-t="undo">↶ 復原</button><button data-t="redo">↷ 重做</button><button data-t="done">完成</button><button data-t="snd" class="on">音效</button><button data-t="reset" class="reset">全部重置</button>`;
  body.appendChild(tools);
  const tb = {}; tools.querySelectorAll('button').forEach((b) => tb[b.dataset.t] = b);
  tb.cat.onclick = () => { body.classList.toggle('catHide'); tb.cat.classList.toggle('on', !body.classList.contains('catHide')); };
  tb.rot.onclick = () => rotate();
  tb.demo.onclick = () => setDemolish(TOOL !== 'demolish');
  tb.grid.onclick = () => { SNAP = !SNAP; tb.grid.classList.toggle('on', SNAP); toast(SNAP ? '對齊 0.5 m 格線' : '自由放置（不對齊格線）'); };
  tb.undo.onclick = undo; tb.redo.onclick = redo;
  tb.done.onclick = () => { endPlace(); deselect(); setDemolish(false); if (TOOL === 'mood') setMood(null); };
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
  function select(u){ if (TOOL === 'place') endPlace(); setDemolish(false); if (TOOL === 'mood') setMood(null); sel = u; TOOL = 'idle'; status(''); showSel(); }
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
    deselect(); endPlace(); setDemolish(false); if (TOOL === 'mood') setMood(null); PL = { id, v, rot: rot || 0, x: null, y: 0, z: null }; TOOL = 'place';
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
    if (!ON || WALK.on || SH.view || e.target !== canvas || (e.button !== undefined && e.button > 0)) return;
    if (ptrs.size > 1){ clearTimeout(lp); down = null; if (drag) endDrag(false); if (paint) endPaint(); return; }
    if (TOOL === 'place' && PL && isTile(PL.id)){ startPaint(e); e.stopPropagation(); e.preventDefault(); return; }
    const u = TOOL === 'place' || TOOL === 'demolish' || TOOL === 'mood' || TOOL === 'photo' ? null : pick(e.clientX, e.clientY);
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
    if (TOOL === 'mood'){ moodAt(cx, cy); return; }
    if (TOOL === 'photo'){ phoSpot(cx, cy); return; }
    if (u) select(u); else if (sel) deselect();
  }
  addEventListener('keydown', (e) => {
    if (!ON || WALK.on || SH.view || e.target.closest && (e.target.closest('input') || e.target.closest('textarea'))) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y'){ e.preventDefault(); redo(); }
    else if (k === 'escape'){ if (cf.classList.contains('show')){ cf.classList.remove('show'); return; } if (TOOL === 'photo'){ TOOL = 'idle'; PHO.cur = null; status(''); } endPlace(); deselect(); setDemolish(false); if (TOOL === 'mood') setMood(null); }
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
    if (on){ endPlace(); if (TOOL === 'mood') setMood(null); sel = null; showSel(); TOOL = 'demolish'; status('移除：點一下要移走的物件（自己放的，或頭上有紅點的原有物件：樹、樹籬、路燈、桌椅、雜草、矮牆、花台…）・可復原・按「完成」結束'); }
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
    SC = score(L, PTS, DARK, MD.open ? MD.need : []);
    SC.site = S.site ? siteScore(L, PTS, S.site, S.base, SC) : null;   // 選了主要改造點：改用主點雙指數計分
    if (SC.site){ SC.total = SC.site.total; SC.stars = SC.site.stars; }
    starEl.innerHTML = '★'.repeat(SC.stars) + '<span style="color:var(--line)">' + '★'.repeat(5 - SC.stars) + `</span><small>${Math.round(SC.total)} 分</small>`;
    const keys = SC.sets.map((t) => t.id + t.k);
    if (prevSets){ SC.sets.filter((t) => !prevSets.includes(t.id + t.k)).forEach((t) =>
      tip(`觸發套組「${t.name}」${t.k > 1 ? '（5 種加倍）' : ''}：${[['安全', t.safe], ['安心', t.calm], ['美化', t.beauty]].filter(([, v]) => v).map(([k, v]) => k + '+' + v).join(' ')}`, '套組加成')); }
    prevSets = keys;
    if (sc.classList.contains('show')) renderScore();
    drawLayers();
  }
  function renderScore(){
    if (!SC) return;
    if (SC.site){ const T = SC.site, f1 = (v) => (Math.round(v * 10) / 10).toString(), ib = (k, v0, v, c) => `<div class="sbar" style="grid-template-columns:64px 1fr 76px"><span>${k}</span><i><b style="width:${v * 4}%;background:${c}"></b></i><span>${f1(v0)} → ${f1(v)}</span></div>`;
      sc.innerHTML = `<h3>校園評價 ${'★'.repeat(SC.stars)}${'☆'.repeat(5 - SC.stars)} ${Math.round(SC.total)} 分<button aria-label="關閉">×</button></h3>`
        + `<div style="font-weight:900;font-size:14px;margin-bottom:4px">📍 主要改造點：${T.n}. ${T.title}</div>` + ib('安心指數', T.a0, T.a, '#e53935') + ib('散心指數', T.s0, T.s, '#1f6feb')
        + `<div style="color:var(--sub);font-size:12px;margin-top:2px">各 25 分，和學習單第三題一樣：「現況 → 改造後」。${T.given ? '現況是你們學習單的分數。' : `還沒填學習單的現況分數，先以 ${K2.BASE} 分起算（到「📋 方案」更換改造點時可以填）。`}只算主點 ${K2.R} 公尺內的東西。</div>`
        + `<h4>安心指數：安全設施（求助、照明、護欄、警示…）</h4><div>${T.byA.length ? T.byA.slice(0, 8).join('、') + (T.byA.length > 8 ? '…' : '') : '<span class="no">主點附近還沒有安全設施</span>'}</div>`
        + `<h4>散心指數：讓人想停留的東西（座椅、遮蔭、植栽、美化…）</h4><div>${T.byR.length ? T.byR.slice(0, 8).join('、') + (T.byR.length > 8 ? '…' : '') : '<span class="no">主點附近還沒有</span>'}</div>`
        + `<h4>其他危險點加分（每照顧好一個 +${K2.OTHER}，最多 ${K2.OTHER_MAX} 個）</h4><div>${T.others.length ? `<span class="ok">${T.others.join('、')}　+${T.bonus}</span>` : '還沒有。預算有剩的話，也看看別的危險點。'}</div>`
        + `<div style="color:var(--sub);font-size:12px;margin-top:8px">總分＝主點兩個指數（佔 ${K2.MAIN} 分）＋其他危險點加分。</div>`
        + `<h4>套組加成</h4>${SC.sets.length ? `<ul>${SC.sets.map((t) => `<li class="ok">${t.name}（${t.kinds} 種${t.k > 1 ? '，加倍' : ''}）</li>`).join('')}</ul>` : '<div style="color:var(--sub)">還沒有觸發（同一套組 8 m 內擺 3 種）</div>'}`;
      sc.querySelector('h3 button').onclick = () => sc.classList.remove('show'); return; }
    const bar = (k, v, c) => `<div class="sbar"><span>${k}</span><i><b style="width:${v}%;background:${c}"></b></i><span>${Math.round(v)}</span></div>`;
    const pt = (p) => { const s = Math.min(SK.PER, Math.max(0, p.safe)), c = Math.min(SK.PER, Math.max(0, p.calm)), ok = s >= SK.PER * .5 && c >= SK.PER * .5;
      return `<li class="${ok ? 'ok' : 'no'}">${p.n}. ${p.title}：安全 ${s.toFixed(1)}／${SK.PER}・安心 ${c.toFixed(1)}／${SK.PER}${p.by.length ? `<br><small style="color:var(--sub)">${p.by.slice(0, 4).join('、')}${p.by.length > 4 ? '…' : ''}</small>` : ''}</li>`; };
    sc.innerHTML = `<h3>校園評價 ${'★'.repeat(SC.stars)}${'☆'.repeat(5 - SC.stars)} ${Math.round(SC.total)} 分<button aria-label="關閉">×</button></h3>`
      + bar('安全', SC.safe, '#e53935') + bar('安心', SC.calm, '#1f6feb') + bar('美化', SC.beauty, '#2e9d5a')
      + `<div style="color:var(--sub);font-size:12px;margin-top:2px">總分＝安全 ${SK.W.safe * 100}%＋安心 ${SK.W.calm * 100}%＋美化 ${SK.W.beauty * 100}%（暫定，待學習單）${SC.conc ? '・美化集中在一處，打 7 折' : ''}</div>`
      + (SC.need ? `<div style="color:#1f6feb;font-size:12px;margin-top:4px;font-weight:800">安心分以全班心情釘「怕／暗／想躲」${SC.need.length} 處為需求點（每處 15 m 內）</div>` : '')
      + `<h4>8 個危險點（綠＝安全、安心都過半）</h4><ul>${SC.pts.map(pt).join('')}</ul>`
      + `<h4>暗區照明</h4><ul>${SC.dark.map((d) => `<li class="${d.f >= .5 ? 'ok' : 'no'}">${d.name}：照亮 ${Math.round(d.f * 100)}%</li>`).join('')}</ul>`
      + `<h4>套組加成</h4>${SC.sets.length ? `<ul>${SC.sets.map((t) => `<li class="ok">${t.name}（${t.kinds} 種${t.k > 1 ? '，加倍' : ''}）</li>`).join('')}</ul>` : '<div style="color:var(--sub)">還沒有觸發（同一套組 8 m 內擺 3 種）</div>'}`;
    sc.querySelector('h3 button').onclick = () => sc.classList.remove('show');
  }

  // ---------- 圖層（模擬城市的資料圖層） ----------
  const LY = { pts: true, dark: true, light: false, help: false, mood: false };
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
    if (typeof heat !== 'undefined'){ heat.visible = LY.mood && MD.open; }
  }
  const SC3 = new THREE.Vector3();
  const lyEl = document.createElement('div'); lyEl.id = 'gLayers'; body.appendChild(lyEl);
  lyEl.innerHTML = [['pts', '危險點（紅→綠＝處理程度）', '#e53935'], ['dark', '暗區（被燈照到會變亮）', '#1a237e'], ['light', '照明覆蓋', '#ffc928'], ['help', '求助與監看覆蓋', '#2ecc71']]
    .map(([k, t, c]) => `<label><input type="checkbox" data-k="${k}"${LY[k] ? ' checked' : ''}><i style="background:${c}"></i>${t}</label>`).join('')
    + '<label class="off" id="lyMood"><input type="checkbox" data-k="mood" disabled><i style="background:#9b5de5"></i><span>心情熱區（老師開放後才看得到）</span></label>';
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

  // ---------- 雲端（M5）：學校 Google 帳號登入 → 名單找到班級組別 → 作品存 cgWorks，每 5 秒同步隊友 ----------
  const CS = { w: '', cls: null, g: 0, synced: { items: {}, removed: {} }, ut: '', busy: false, t: 0 };
  header.insertAdjacentHTML('beforeend', '<button id="gLogin" title="用學校 Google 帳號登入，作品會存到雲端、和同組同學一起編輯">登入</button>');
  const loginEl = document.getElementById('gLogin');
  header.insertAdjacentHTML('beforeend', '<button id="gAdmin" title="開啟管理後台（班級、名單、分組、階段）">⚙ 後台</button>');
  const adminEl = document.getElementById('gAdmin'), openAdmin = () => open('./admin.html' + (CL.MOCK ? '?cgmock=1' : ''), '_blank');
  adminEl.onclick = openAdmin;
  const deep = (o) => JSON.parse(JSON.stringify(o));
  function loginLabel(stat = ''){
    const m = CL.me();
    adminEl.style.display = m && m.admin ? 'inline-block' : 'none';
    if (!m){ loginEl.textContent = '登入'; loginEl.className = ''; return; }
    loginEl.className = 'in';
    loginEl.innerHTML = (CS.demo ? '👩‍🏫 示範模式' : CS.cls ? `${CS.cls.name}・第 ${CS.g} 組` : m.admin ? '管理者' : '未加入班級') + (CS.w ? `<i class="${stat}" title="${stat === 'busy' ? '同步中' : stat === 'err' ? '同步失敗，稍後重試' : '已同步'}"></i>` : '');
  }
  loginEl.onclick = async () => {
    const m = CL.me();
    if (!m){
      try { await CL.login(); try { localStorage.setItem('campusgame-login', '1'); } catch (e) {} await join(true); }
      catch (e){ toast('登入失敗：' + CL.loginError(e)); }
      return;
    }
    dialog(m.email, CS.demo ? '示範模式：不限預算，作品存在你自己的帳號（換裝置登入還在），不影響任何班級。要清空示範內容請按工具列「全部重置」。' : CS.cls ? `你在 ${CS.cls.year} 學年 ${CS.cls.name} 第 ${CS.g} 組，作品自動存到雲端。` : m.admin ? '管理者帳號：班級、名單、分組請到後台設定。' : '這個帳號還不在任何班級名單裡，作品只存在這台裝置。',
      [['關閉'], ...(m.admin ? [['開啟後台', '', openAdmin]] : []), ['登出', 'go', async () => { await CL.logout(); try { localStorage.removeItem('campusgame-login'); } catch (e) {} location.reload(); }]]);
  };
  async function join(fresh){
    const m = CL.me(); loginLabel(); if (!m) return;
    if (m.admin){   // 老師：示範模式（老師 115/11/05 要求）——不限預算，作品存在 cgWorks/demo_<帳號>，不屬於任何班級
      let d; try { d = await CL.getDoc('cgWorks/demo_' + m.email.split('@')[0].replace(/[^a-z0-9]/g, '')); } catch (e){ toast('讀取示範作品失敗：' + e.message); }
      CS.demo = true; CS.cls = { id: 'demo', name: '示範模式', year: CL.schoolYear() }; CS.g = 0; CS.w = 'demo_' + m.email.split('@')[0].replace(/[^a-z0-9]/g, '');
      BUDGET = 99999; SAVE_KEY = 'campusgame-work-' + CS.w;
      endPlace(); deselect(); UNDO.length = 0; REDO.length = 0;
      if (d) applyRemote(d); else { CS.synced = { items: {}, removed: {} }; phoSet({}); schedulePush(0); }
      hud(); rescore(); loginLabel();
      if (fresh) toast('老師示範模式：不限預算、自動存到你的帳號，不影響任何班級');
      clearInterval(CS.poll); CS.poll = setInterval(poll, 5000); moodInit(); return;
    }
    let r, c, d; CS.why = '';
    try { r = await CL.getDoc('cgRoster/' + m.email); }
    catch (e){ CS.why = '讀取名單失敗，請稍後重新整理。'; toast('讀取名單失敗：' + e.message); return; }
    if (!r || !r.data.w){ CS.why = r ? '老師還沒幫你分組，作品先存在這台裝置。' : '這個帳號不在任何班級名單裡。請確認登入的是學校給你的學生帳號（@stu.hlbh.hlc.edu.tw），或請老師把你加入名單。'; toast(r ? '老師還沒幫你分組，作品先存在這台裝置' : `${m.email} 不在任何班級名單裡，作品只存在這台裝置`); return; }
    try { c = await CL.getDoc('cgClasses/' + r.data.classId); d = await CL.getDoc('cgWorks/' + r.data.w); }
    catch (e){ CS.why = '讀取雲端資料失敗，請稍後重新整理。'; toast('讀取雲端資料失敗：' + e.message); return; }
    if (!c){ CS.why = '找不到你的班級（可能已被刪除），請問老師。'; toast('找不到你的班級（可能已被刪除）'); return; }
    CS.cls = { id: c.id, ...c.data }; CS.g = r.data.g; CS.w = r.data.w; BUDGET = budgetOf(c.data); SAVE_KEY = 'campusgame-work-' + CS.w;
    endPlace(); deselect(); UNDO.length = 0; REDO.length = 0;
    if (d){ applyRemote(d); toast(`歡迎！${CS.cls.name} 第 ${CS.g} 組：已載入全組的作品`); }
    else {   // 這組雲端還是空的：把這台裝置目前的作品當作起點送上去
      CS.synced = { items: {}, removed: {} }; phoSet({});
      const n = Object.keys(S.items).length + Object.keys(S.removed).length;
      toast(`歡迎！${CS.cls.name} 第 ${CS.g} 組${n ? '：這台裝置的作品已送到雲端，成為全組的起點' : ''}`);
      schedulePush(0);
    }
    hud(); rescore(); loginLabel();
    clearInterval(CS.poll); CS.poll = setInterval(poll, 5000);
    moodInit();
    if (CS.cls.phase !== 'explore') whenStarted(() => { if (!S.site && !SH.view && CS.w && !CS.demo) siteOpen(); });   // 還沒選主要改造點：開始後先選
    if (CS.cls.phase === 'explore' && fresh) whenStarted(() => tip('現在是探勘階段：按工具列「心情釘」，走到有感覺的地方釘下去（怕、吵、暗、想待、想躲）', '老師'));
  }
  function diff(){
    const a = CS.synced, mask = [], data = { items: {}, removed: {} };
    for (const u of new Set([...Object.keys(a.items), ...Object.keys(S.items)])){
      if (JSON.stringify(a.items[u]) !== JSON.stringify(S.items[u])){ mask.push('items.' + u); if (S.items[u]) data.items[u] = S.items[u]; } }
    for (const id of new Set([...Object.keys(a.removed), ...Object.keys(S.removed)])){
      if (!!a.removed[id] !== !!S.removed[id]){ mask.push('removed.' + id); if (S.removed[id]) data.removed[id] = true; } }
    return { mask, data };
  }
  function schedulePush(ms = 400){ clearTimeout(CS.t); CS.t = setTimeout(push, ms); }
  async function push(){
    if (!CS.w) return; if (CS.busy || SH.view){ schedulePush(1500); return; }
    const { mask, data } = diff(); if (!mask.length){ loginLabel(''); return; }
    CS.busy = true; loginLabel('busy');
    const sent = { items: deep(S.items), removed: { ...S.removed } };
    try {
      const ut = await CL.patch('cgWorks/' + CS.w, { ...data, classId: CS.cls.id, g: CS.g }, [...mask, 'classId', 'g']);
      // 只有送出的欄位算同步了：以送出當下的狀態為準
      for (const p of mask){ const [k, id] = p.split('.'); if (sent[k][id] === undefined) delete CS.synced[k][id]; else CS.synced[k][id] = deep(sent[k][id]); }
      CS.ut = ut || CS.ut; CS.busy = false; loginLabel('');
      if (diff().mask.length) schedulePush();
    } catch (e){ CS.busy = false; loginLabel('err'); if (e.status === 401 || e.status === 403) toast('雲端存檔被拒絕（可能登入過期），請重新登入'); schedulePush(5000); }
  }
  function applyRemote(d){
    const items = d.data.items || {}, removed = d.data.removed || {};
    for (const u of new Set([...Object.keys(S.items), ...Object.keys(items)])){
      const it = items[u] && BY_ID[items[u].id] && !BY_ID[items[u].id].tags.includes('hidden') ? { id: items[u].id, x: +items[u].x, y: +items[u].y || 0, z: +items[u].z, rot: +items[u].rot || 0, v: +items[u].v || 0 } : null;
      if (JSON.stringify(S.items[u] || null) !== JSON.stringify(it)) apply(u, it); }
    for (const id of new Set([...Object.keys(S.removed), ...Object.keys(removed)])) if (!!S.removed[id] !== !!removed[id] && RMI.has(id)) setRm(id, !!removed[id]);
    CS.synced = { items: deep(S.items), removed: { ...S.removed } }; CS.ut = d.updateTime;
    if (typeof d.data.theme === 'string' && document.activeElement !== themeEl){ CS.theme = d.data.theme; themeEl.value = CS.theme; }
    if (sel && !S.items[sel]) deselect();
    if (!SITE.busy){ S.site = +d.data.site || 0; S.base = d.data.base || null; }
    if (JSON.stringify(d.data.photos || {}) !== PHO.raw){ PHO.raw = JSON.stringify(d.data.photos || {}); phoSet(d.data.photos); }
    save(); hud(); showSel(); rescore();
  }
  async function poll(){
    if (!CS.w || CS.busy || SH.view || drag || paint || document.visibilityState !== 'visible' || diff().mask.length) return;
    try { const d = await CL.getDoc('cgWorks/' + CS.w); if (d && d.updateTime !== CS.ut && !CS.busy && !drag && !paint && !diff().mask.length) applyRemote(d); } catch (e) {}
  }
  // ---------- 起始頁（115/11/06 老師要求）：學生先登入、看到自己的班組與目前階段再開始；老師可進後台或示範。網址 ?start=0 略過 ----------
  const PH = [['explore', '🔍 探勘', '走進校園，在讓你覺得怕、暗、吵、想待、想躲的地方插「心情釘」。'],
    ['build', '🛠 改造', '和組員用預算放設施、鋪地磚、移除樹木，讓校園更安全、更安心。'],
    ['show', '🏆 展示', '寫下改造理念、做海報，參觀別組的方案並投票。']];
  document.body.insertAdjacentHTML('beforeend', '<div id="gStart"><div class="card"></div></div>');
  const stEl = document.getElementById('gStart'), stCard = stEl.querySelector('.card');
  let started = new URLSearchParams(location.search).get('start') === '0', afterStart = [];
  function whenStarted(fn){ if (started) setTimeout(fn, 1200); else afterStart.push(fn); }
  function startGo(){ started = true; stEl.classList.remove('show'); afterStart.splice(0).forEach((fn) => setTimeout(fn, 800)); }
  async function startLogout(){ await CL.logout(); try { localStorage.removeItem('campusgame-login'); } catch (e) {} location.reload(); }
  function renderStart(busy){
    if (started) return;
    const m = CL.me(), esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const head = '<h2>花商校園改造計畫</h2><p class="lead">在 3D 校園裡找出讓人不安的角落，和組員一起動手改造，讓每個人都更安心。</p>';
    const steps = (now) => '<ol>' + PH.map(([k, t, d]) => `<li class="${k === now ? 'now' : ''}"><b>${t}</b>${d}</li>`).join('') + '</ol>';
    let html, btns = [];
    if (busy) html = head + '<p class="who">登入中，正在找你的班級……</p>';
    else if (!m){
      html = head + steps('') + '<p class="lead" style="margin-bottom:10px">請用<b>學校給你的 Google 帳號</b>登入，作品會存到雲端，和同組同學一起編輯。</p>';
      btns = [['用學校 Google 帳號登入', 'go', startLogin], ['先不登入，隨便逛逛（作品只存在這台裝置）', 'lk', startGo]];
    } else if (m.admin){
      html = head + `<p class="who">老師您好<small>${esc(m.email)}</small></p><p class="lead">班級、名單、分組與階段請到後台設定；示範模式不限預算，作品存在你自己的帳號，不影響任何班級。</p>`;
      btns = [['⚙ 進入後台', 'go', openAdmin], ['👩‍🏫 進入示範模式', '', startGo], ['登出', 'lk', startLogout]];
    } else if (CS.cls && !CS.demo){
      const ph = CS.cls.phase || 'build', cur = PH.find((x) => x[0] === ph) || PH[1];
      html = head + `<p class="who">${esc(CS.cls.year)} 學年 ${esc(CS.cls.name)}・第 ${esc(CS.g)} 組<small>${esc(m.email)}</small></p>` + steps(ph)
        + `<p class="lead" style="margin-bottom:10px">現在是<b>「${cur[1].split(" ")[1]}」</b>階段。${ph === 'build' ? `你們這組的預算是 ${esc(budgetOf(CS.cls))} 點，同組同學改的東西會自動同步。` : ph === 'explore' ? '按工具列的「心情釘」開始。' : '按右上「📋 方案」看全班的方案。'}</p>`;
      btns = [['開始', 'go', startGo], ['不是你？登出換帳號', 'lk', startLogout]];
    } else {
      html = head + `<p class="who">${esc(m.email)}</p><p class="warn">${esc(CS.why || '找不到你的班級。')}</p>`;
      btns = [['登出換帳號', 'go', startLogout], ['先逛逛（作品只存在這台裝置）', 'lk', startGo]];
    }
    stCard.innerHTML = html + '<div class="btns"></div>';
    const row = stCard.querySelector('.btns');
    btns.forEach(([t, cls, fn]) => { const b = document.createElement('button'); b.textContent = t; if (cls) b.className = cls; b.onclick = fn; row.appendChild(b); });
  }
  async function startLogin(){
    try { await CL.login(); } catch (e){ toast('登入失敗：' + CL.loginError(e)); return; }
    try { localStorage.setItem('campusgame-login', '1'); } catch (e) {}
    renderStart(true); await join(true); renderStart();
  }
  if (!started){ renderStart(true); stEl.classList.add('show'); }
  (async () => { let on = CL.MOCK; try { on = on || localStorage.getItem('campusgame-login') === '1'; } catch (e) {}
    if (on && await CL.restore()) await join(false); else loginLabel();
    renderStart();
    const coId = new URLSearchParams(location.search).get('co');   // 老師從後台「看這班的全班共創校園」開過來
    if (coId && CL.me() && CL.me().admin){ try { const c = await CL.getDoc('cgClasses/' + coId); if (c){ startGo(); coOpen({ id: c.id, ...c.data }); } else toast('找不到這個班級'); } catch (e){ toast('讀取班級失敗：' + e.message); } } })();

  // ---------- 心情釘（M6，規格書 §7.1） ----------
  const MD = { id: '', pins: {}, all: [], need: [], open: false, allowed: false, sel: null, t: 0, busy: false };
  const MI = Object.fromEntries(CL.MOODS.map((m) => [m[0], m]));
  const moodEl = document.createElement('div'); moodEl.id = 'gMood'; body.appendChild(moodEl);
  moodEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  const pinRoot = new THREE.Group(); pinRoot.name = 'moodPins'; scene.add(pinRoot);
  const cnt = (m) => Object.values(MD.pins).filter((p) => p.m === m).length;
  function renderMoodBar(){
    moodEl.innerHTML = CL.MOODS.map(([k, e, n]) => `<button data-m="${k}" class="${MD.sel === k ? 'on' : ''}">${e} ${n}<small>${cnt(k)}／3</small></button>`).join('')
      + `<p>${WALK.on ? '點一下就釘在腳下；' : '選一種，再點地面釘下去；'}點自己的釘子可以拔掉。每種最多 3 支。</p>`;
    moodEl.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const m = b.dataset.m;
      if (WALK.on){ addPin(m, WALK.pos.x, WALK.pos.z); return; }
      setMood(MD.sel === m ? null : m);
    });
  }
  function setMood(m){
    MD.sel = m;
    if (m){ endPlace(); deselect(); setDemolish(false); TOOL = 'mood'; status(`心情釘「${MI[m][1]} ${MI[m][2]}」：點地面釘下去（還能放 ${3 - cnt(m)} 支）・點自己的釘子可拔掉`); }
    else if (TOOL === 'mood'){ TOOL = 'idle'; status(''); }
    renderMoodBar();
  }
  tb.mood.onclick = () => {
    const show = !moodEl.classList.contains('show');
    if (show){ const r = tb.mood.getBoundingClientRect(); moodEl.style.left = Math.max(8, Math.min(innerWidth - 430, r.left - 120)) + 'px'; moodEl.style.bottom = (innerHeight - r.top + 8) + 'px'; renderMoodBar(); }
    else setMood(null);
    moodEl.classList.toggle('show', show); tb.mood.classList.toggle('on', show);
  };
  function addPin(m, x, z){
    if (cnt(m) >= 3){ toast(`「${MI[m][2]}」已經放了 3 支，先拔掉一支再放`); return; }
    const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
    MD.pins[id] = { m, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, t: Date.now() };
    pop(); moodChanged(); toast(`釘下「${MI[m][1]} ${MI[m][2]}」`);
    if (cnt(m) >= 3 && TOOL === 'mood') setMood(null);
  }
  function moodAt(cx, cy){
    const g = ground(cx, cy); if (!g) return;
    const near = Object.entries(MD.pins).find(([, p]) => Math.hypot(p.x - g.x, p.z - g.z) < 1.5);
    if (near){ delete MD.pins[near[0]]; moodChanged(); toast('拔掉了一支心情釘'); return; }
    if (MD.sel) addPin(MD.sel, g.x, g.z);
  }
  function drawPins(){
    [...pinRoot.children].forEach((o) => pinRoot.remove(o));
    for (const p of Object.values(MD.pins)){ const [, e, , c] = MI[p.m] || MI.fear; const d = document.createElement('div'); d.className = 'mpin'; d.style.borderColor = c; d.innerHTML = `<span>${e}</span>`;
      const o = new CSS2DObject(d); o.position.set(p.x, .2, p.z); pinRoot.add(o); }
    pinRoot.visible = MD.allowed || LY.mood;
  }
  function moodChanged(){
    drawPins(); renderMoodBar(); mergeAll(); rescore();
    try { localStorage.setItem('campusgame-mood-' + MD.id, JSON.stringify(MD.pins)); } catch (e) {}
    clearTimeout(MD.t); MD.t = setTimeout(pushMood, 400);
  }
  async function pushMood(){
    if (!MD.id) return; if (MD.busy){ MD.t = setTimeout(pushMood, 600); return; }
    MD.busy = true;
    try { await CL.patch('cgMoods/' + MD.id, { pins: MD.pins, classId: CS.cls.id, g: CS.g }, ['pins', 'classId', 'g']); }
    catch (e){ toast('心情釘存檔失敗：' + e.message); }
    MD.busy = false;
  }
  // 全班熱區：每支釘子在地面畫一團模糊色塊（2 px／公尺，涵蓋 x −30～300、z −60～215）
  const HX0 = -30, HZ0 = -60, HW = 330, HD = 275, hcv = document.createElement('canvas'); hcv.width = HW * 2; hcv.height = HD * 2;
  const htex = new THREE.CanvasTexture(hcv); htex.colorSpace = THREE.SRGBColorSpace;
  const heatGeo = new THREE.PlaneGeometry(HW, HD); heatGeo.rotateX(-Math.PI / 2);
  const heat = new THREE.Mesh(heatGeo, new THREE.MeshBasicMaterial({ map: htex, transparent: true, depthWrite: false }));
  heat.position.set(HX0 + HW / 2, .15, HZ0 + HD / 2); heat.renderOrder = 3; heat.visible = false; lay.add(heat);
  function drawHeat(){
    const x = hcv.getContext('2d'); x.clearRect(0, 0, hcv.width, hcv.height); x.globalCompositeOperation = 'source-over';
    for (const p of MD.all){ const c = (MI[p.m] || MI.fear)[3], cx = (p.x - HX0) * 2, cy = (p.z - HZ0) * 2, R = 24;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, c + 'aa'); g.addColorStop(1, c + '00'); x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2); }
    htex.needsUpdate = true;
  }
  let otherPins = [];
  function mergeAll(){
    MD.all = otherPins.concat(Object.values(MD.pins));
    MD.need = MD.all.filter((p) => CL.NEED_MOODS.includes(p.m)).map((p) => ({ x: p.x, z: p.z }));
    if (MD.open) drawHeat();
  }
  async function loadAll(){
    if (!CS.cls || CS.demo){ otherPins = []; mergeAll(); return; }
    try { const docs = await CL.query('cgMoods', 'classId', CS.cls.id);
      otherPins = docs.filter((d) => d.id !== MD.id).flatMap((d) => Object.values(d.data.pins || {})); }
    catch (e) {}
    mergeAll(); rescore();
  }
  function applyClass(c){   // 班級設定：階段、熱區是否開放、預算
    CS.cls = { ...CS.cls, ...c };
    MD.allowed = CS.demo || c.phase === 'explore'; MD.open = CS.demo || !!c.moodOpen;
    tb.mood.style.display = MD.allowed ? '' : 'none'; if (!MD.allowed){ moodEl.classList.remove('show'); tb.mood.classList.remove('on'); if (TOOL === 'mood') setMood(null); }
    const lm = document.getElementById('lyMood'); lm.classList.toggle('off', !MD.open); lm.querySelector('input').disabled = !MD.open;
    lm.querySelector('span').textContent = MD.open ? '全班心情熱區' : '心情熱區（老師開放後才看得到）';
    if (!MD.open){ LY.mood = false; lm.querySelector('input').checked = false; }
    if (!CS.demo) BUDGET = budgetOf(CS.cls);
    drawPins(); hud(); plansClass();
  }
  async function moodInit(){
    const m = CL.me(); if (!m || !CS.cls) return;
    MD.id = CL.moodId(CS.cls.id, m.uid);
    try { const d = await CL.getDoc('cgMoods/' + MD.id); MD.pins = d ? d.data.pins || {} : {}; }
    catch (e){ try { MD.pins = JSON.parse(localStorage.getItem('campusgame-mood-' + MD.id) || '{}'); } catch (er) {} }
    applyClass(CS.cls); await loadAll(); drawPins();
    clearInterval(MD.poll); MD.poll = setInterval(async () => {   // 每 30 秒看老師有沒有改階段／開放熱區，並更新全班心情釘
      if (document.visibilityState !== 'visible') return;
      if (!CS.demo){ try { const c = await CL.getDoc('cgClasses/' + CS.cls.id); if (c) applyClass(c.data); } catch (e) {} }
      if (MD.open) loadAll();
    }, 30000);
  }

  // ---------- 方案面板（M7）：改造理念、提案海報、展示階段看別組與投票 ----------
  const SH = { view: 0, stash: null, votes: {}, vid: '' };
  header.insertAdjacentHTML('beforeend', '<button id="gPlanBtn" title="改造理念、提案海報；展示階段可以看別組方案並投票">📋 方案</button>');
  const planBtn = document.getElementById('gPlanBtn'), plans = document.createElement('div'); plans.id = 'gPlans'; body.appendChild(plans);
  plans.innerHTML = `<h3>方案與提案<button aria-label="關閉">×</button></h3><div class="site"></div>
    <h4>我們的改造理念（一句話，60 字內）</h4><textarea maxlength="60" placeholder="例如：讓資訊館後方晚上也有人敢走"></textarea>
    <button class="pb go" data-a="poster">📥 下載提案海報（PNG）</button><div class="list"></div>`;
  const themeEl = plans.querySelector('textarea'), listEl = plans.querySelector('.list');
  plans.querySelector('h3 button').onclick = () => plans.classList.remove('show');
  plans.addEventListener('pointerdown', (e) => e.stopPropagation());
  planBtn.onclick = () => { plans.classList.toggle('show'); if (plans.classList.contains('show')){ sc.classList.remove('show'); renderPlans(); } };
  plans.querySelector('[data-a="poster"]').onclick = () => poster();
  let themeT = 0; CS.theme = '';
  themeEl.addEventListener('input', () => { clearTimeout(themeT); themeT = setTimeout(saveTheme, 800); });
  themeEl.addEventListener('blur', () => { clearTimeout(themeT); saveTheme(); });
  async function saveTheme(){
    const t = themeEl.value.trim().slice(0, 60); if (!CS.w || SH.view || t === CS.theme) return; CS.theme = t;
    try { await CL.patch('cgWorks/' + CS.w, { theme: t, classId: CS.cls.id, g: CS.g }, ['theme', 'classId', 'g']); toast('改造理念已儲存'); } catch (e){ toast('儲存失敗：' + e.message); }
  }
  const showPhase = () => CS.cls && !CS.demo && CS.cls.phase === 'show';
  function plansClass(){

    if (!showPhase() && SH.view && !CO.teacher) backHome();
    if (CO.on && !CO.teacher && !CS.cls.coOpen) backHome();   // 老師收回開放
    if (showPhase() && !SH.vid){ const m = CL.me(); SH.vid = CL.voteId(CS.cls.id, m.uid); CL.getDoc('cgVotes/' + SH.vid).then((d) => { SH.votes = d && d.data.v || {}; renderPlans(); }).catch(() => {}); }
    if (plans.classList.contains('show')) renderPlans();
  }
  function renderPlans(){
    themeEl.disabled = !!SH.view || !CS.w; if (document.activeElement !== themeEl) themeEl.value = CS.theme || '';
    { const sp = PTS.find((p) => p[0] === S.site), se = plans.querySelector('.site');
      se.innerHTML = `<span>📍 主要改造點：${sp ? sp[0] + '. ' + sp[2] : '還沒選'}</span>${SH.view ? '' : `<button>${sp ? '更換' : '選擇'}</button>`}`;
      const sb = se.querySelector('button'); if (sb) sb.onclick = () => { plans.classList.remove('show'); siteOpen(); }; }
    if (!showPhase() && CL.me() && CL.me().admin){
      listEl.innerHTML = '<h4>老師：看一個班的「全班共創校園」</h4><select style="width:100%;font:inherit;font-size:14px;font-weight:800;padding:8px;border:1px solid var(--line);border-radius:9px;background:var(--btn);color:var(--ink)"><option value="">讀取班級中…</option></select><button class="pb go" data-a="tco">🏫 開啟（唯讀，不影響學生）</button><p style="color:var(--sub);margin:6px 0 0">學生要等老師在後台勾選「開放全班共創校園給學生看」，而且階段是「展示」才看得到。</p>';
      const sel = listEl.querySelector('select'), fill = (L) => { sel.innerHTML = L.length ? L.map((c) => `<option value="${c.id}">${c.data.year || ''} ${String(c.data.name || c.id).replace(/[<>&]/g, '')}（${c.data.groups || 0} 組）</option>`).join('') : '<option value="">還沒有班級</option>'; };
      if (CO.list) fill(CO.list); else CL.list('cgClasses').then((L) => { CO.list = L.sort((a, b) => a.id.localeCompare(b.id)); fill(CO.list); }).catch(() => { sel.innerHTML = '<option value="">讀取失敗</option>'; });
      listEl.querySelector('[data-a="tco"]').onclick = () => { const c = (CO.list || []).find((x) => x.id === sel.value); if (c) coOpen({ id: c.id, ...c.data }); };
      return; }
    if (!showPhase()){ listEl.innerHTML = CS.cls && !CS.demo ? '<p style="color:var(--sub)">老師把階段切到「展示」後，這裡會列出全班各組的方案，可以走進去看、投票。</p>' : ''; return; }
    const k = CS.cls.groups || 0, V = CS.cls.votesShown && CS.cls.votes || null;
    listEl.innerHTML = `${CS.cls.coOpen ? '<button class="pb go" data-a="co">🏫 全班共創校園（每個改造點選一組、投票）</button>' : ''}<h4>全班方案（點一下走進去看${V ? '・已公布票數' : '・每組可投一票，不能投自己組'}）</h4>` + Array.from({ length: k }, (_, i) => i + 1).map((g) =>
      `<button class="pb${g === CS.g ? ' me' : ''}${(SH.view || CS.g) === g ? ' on' : ''}" data-g="${g}">第 ${g} 組${g === CS.g ? '（我們）' : ''}<small>${V ? `👍 ${V['g' + g] || 0}` : SH.votes['g' + g] ? '已投 👍' : ''}</small></button>`).join('');
    listEl.querySelectorAll('.pb[data-g]').forEach((b) => b.onclick = () => viewGroup(+b.dataset.g));
    { const cb = listEl.querySelector('[data-a="co"]'); if (cb) cb.onclick = () => coOpen(); }
  }
  function setState(d){
    const items = d.items || {}, removed = d.removed || {};
    for (const u of new Set([...Object.keys(S.items), ...Object.keys(items)])){
      const it = items[u] && BY_ID[items[u].id] && !BY_ID[items[u].id].tags.includes('hidden') ? { id: items[u].id, x: +items[u].x, y: +items[u].y || 0, z: +items[u].z, rot: +items[u].rot || 0, v: +items[u].v || 0 } : null;
      if (JSON.stringify(S.items[u] || null) !== JSON.stringify(it)) apply(u, it); }
    for (const id of new Set([...Object.keys(S.removed), ...Object.keys(removed)])) if (!!S.removed[id] !== !!removed[id] && RMI.has(id)) setRm(id, !!removed[id]);
    S.site = +d.site || 0; S.base = d.base || null;
    hud(); rescore();
  }
  const viewEl = document.createElement('div'); viewEl.id = 'gView'; body.appendChild(viewEl);
  const frameV = document.createElement('div'); frameV.id = 'gFrameV'; body.appendChild(frameV);
  viewEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  let viewTheme = '';
  async function viewGroup(g){
    if (g === CS.g){ backHome(); return; }
    let d; try { d = await CL.getDoc('cgWorks/' + CL.workId(CS.cls.id, g)); } catch (e){ toast('讀取失敗：' + e.message); return; }
    if (!SH.view){ endPlace(); deselect(); setDemolish(false); if (TOOL === 'mood') setMood(null); SH.stash = { items: deep(S.items), removed: { ...S.removed }, photos: deep(PHO.meta), site: S.site, base: S.base }; }
    if (PHO.mode) phoExit(); CO.on = false; coEl.classList.remove('show');
    SH.view = g; viewTheme = d && d.data.theme || ''; setState(d ? d.data : {}); phoSet(d ? d.data.photos : {}); body.classList.add('viewing'); renderView(); renderPlans();
    toast(`走進第 ${g} 組的方案（唯讀）`);
  }
  function backHome(){
    if (!SH.view) return; if (PHO.mode) phoExit(); const st = SH.stash; SH.view = 0; SH.stash = null; CO.on = false; coEl.classList.remove('show'); body.classList.remove('viewing');
    setState(st || {}); phoSet(st && st.photos); renderPlans(); if (CS.w) schedulePush(300); toast('回到我們組');
  }
  function renderView(){
    if (CO.on){ viewEl.innerHTML = `🏫 全班共創校園${CO.teacher ? '・' + String(CO.cls.name || '').replace(/[<>&]/g, '') : ''}・唯讀 <button class="home">${CO.teacher ? '回示範模式' : '回我們組'}</button>`; viewEl.querySelector('.home').onclick = backHome; return; }
    const g = SH.view, on = !!SH.votes['g' + g];
    viewEl.innerHTML = `👀 第 ${g} 組的方案${viewTheme ? `：「${viewTheme.replace(/[<>&]/g, '')}」` : ''}・唯讀 <button class="vote${on ? ' on' : ''}">${on ? '✔ 已投「我願意在這裡待」' : '👍 我願意在這裡待'}</button><button class="home">回我們組</button>`;
    viewEl.querySelector('.home').onclick = backHome;
    viewEl.querySelector('.vote').onclick = () => vote(g);
  }
  async function vote(g){
    const k = 'g' + g, had = !!SH.votes[k]; if (had) delete SH.votes[k]; else SH.votes[k] = true; renderView();
    try { await CL.patch('cgVotes/' + SH.vid, { classId: CS.cls.id, g: CS.g, v: SH.votes }, ['classId', 'g', 'v']); toast(had ? '收回了這一票' : `投給第 ${g} 組：我願意在這裡待`); }
    catch (e){ if (had) SH.votes[k] = true; else delete SH.votes[k]; renderView(); toast('投票失敗：' + e.message); }
    renderPlans();
  }

  // 提案海報：1080×1920 PNG，俯視圖＋3 個代表視角＋分數＋物件清單＋改造理念（2D canvas 合成）
  async function poster(){
    const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const F = (w, s) => `${w} ${s}px "Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif`;
    const g = SH.view || CS.g, title = CS.cls ? (CS.demo ? '老師示範' : CO.on ? `${CO.cls.year} 學年 ${CO.cls.name}・全班共創校園` : `${CS.cls.year} 學年 ${CS.cls.name}・第 ${g} 組`) : '我的方案', theme = SH.view ? viewTheme : (themeEl.value.trim() || CS.theme || '');
    toast('海報產生中…');
    // 3D 截圖：暫時改畫布大小與相機，畫完立刻複製，再還原
    const sv = { p: camera.position.clone(), t: controls.target.clone(), fov: camera.fov, asp: camera.aspect, size: renderer.getSize(new THREE.Vector2()), pr: renderer.getPixelRatio(), fx: fx.visible, lay: lay.visible };
    fx.visible = false; lay.visible = false; scene.fog.near = 5000; scene.fog.far = 9000;
    const snapAt = (pos, tgt, w, h, fov) => { renderer.setPixelRatio(1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = fov; camera.position.set(...pos); camera.lookAt(...tgt); camera.updateProjectionMatrix();
      renderer.render(scene, camera); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(renderer.domElement, 0, 0); return c; };
    const top = snapAt([128, 330, 92], [128, 0, 80], 1000, 760, 45);
    // 代表視角：分數貢獻最大、彼此相距 25 m 以上的三件
    const L = Object.values(S.items).filter((o) => !isTile(o.id)).map((o) => ({ ...o, w: Math.abs(BY_ID[o.id].safe) + Math.abs(BY_ID[o.id].calm) + Math.abs(BY_ID[o.id].beauty) + BY_ID[o.id].cost / 100 })).sort((a, b) => b.w - a.w);
    const pick = []; for (const o of L){ if (pick.every((q) => Math.hypot(q.x - o.x, q.z - o.z) > 25)) pick.push(o); if (pick.length === 3) break; }
    // 相機試 8 個方向，挑不在建築裡、視線不被建築擋住的
    const camFor = (o) => { const tg = new THREE.Vector3(o.x, (o.y || 0) + 1, o.z), R = new THREE.Ray(), hv = new THREE.Vector3();
      const blk = occBoxes.filter((b) => !b.off).concat(RM.filter((r) => !r.off).map((r) => r.box));   // 建築＋原有的樹、路燈
      const pole = PTS.map(([, , , , px, pz]) => new THREE.Box3(new THREE.Vector3(px - .4, 0, pz - .4), new THREE.Vector3(px + .4, 9, pz + .4)));   // 危險點的標竿
      for (let k = 0; k < 16; k++){ const a = .65 + k * Math.PI / 8, dd = k < 8 ? 10 : 7, cp = new THREE.Vector3(o.x + Math.sin(a) * dd, (o.y || 0) + 5, o.z + Math.cos(a) * dd), d = tg.clone().sub(cp), L = d.length();
        R.set(cp, d.normalize()); if (!blk.concat(pole).some((b) => b.containsPoint(cp) || (R.intersectBox(b, hv) && hv.distanceTo(cp) < L - 1.2))) return [cp.x, cp.y, cp.z]; }
      return [o.x + 6, (o.y || 0) + 12, o.z + 8]; };
    const views = pick.map((o) => ({ c: snapAt(camFor(o), [o.x, (o.y || 0) + 1, o.z], 330, 300, 50), n: BY_ID[o.id].name }));
    renderer.setPixelRatio(sv.pr); renderer.setSize(sv.size.x, sv.size.y, false); camera.fov = sv.fov; camera.aspect = sv.asp; camera.position.copy(sv.p); controls.target.copy(sv.t); camera.updateProjectionMatrix(); controls.update();
    fx.visible = sv.fx; lay.visible = sv.lay; scene.fog.near = 450; scene.fog.far = 900;
    // 版面
    x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#1f6feb'; x.fillRect(0, 0, W, 210);
    x.fillStyle = '#fff'; x.font = F(900, 40); x.fillText('花蓮高商 校園改造提案', 40, 72); x.font = F(800, 34); x.fillText(title, 40, 128);
    x.font = F(800, 26); x.fillStyle = '#d6e6ff'; x.fillText(SC ? `${SC.site ? '主要改造點：' + SC.site.title + '　' : ''}校園評價 ${'★'.repeat(SC.stars)}${'☆'.repeat(5 - SC.stars)}　${Math.round(SC.total)} 分` : '', 40, 180);
    x.fillStyle = '#1d2a33'; x.font = F(900, 34); const wrap = (t, x0, y0, maxW, lh) => { let line = '', y = y0; for (const ch of t){ if (x.measureText(line + ch).width > maxW){ x.fillText(line, x0, y); line = ch; y += lh; } else line += ch; } if (line) x.fillText(line, x0, y); return y; };
    const ty = wrap(theme ? `「${theme}」` : '（還沒寫改造理念）', 40, 270, W - 80, 46);
    const y1 = ty + 30; x.drawImage(top, 40, y1, 1000, 760); x.strokeStyle = '#1d2a33'; x.lineWidth = 3; x.strokeRect(40, y1, 1000, 760);
    let y2 = y1 + 790; x.font = F(800, 22); x.fillStyle = '#4b5b66';
    views.forEach((v, i) => { const vx = 40 + i * 340; x.drawImage(v.c, vx, y2, 320, 290); x.strokeRect(vx, y2, 320, 290); x.fillText(v.n, vx + 4, y2 + 318); });
    if (!views.length){ x.fillText('（放上物件後會自動挑代表視角）', 40, y2 + 40); }
    let y3 = y2 + (views.length ? 360 : 80);
    if (SC){ const f1 = (v) => Math.round(v * 10) / 10; (SC.site ? [['安心指數', SC.site.a * 4, '#e53935', `${f1(SC.site.a0)}→${f1(SC.site.a)}`], ['散心指數', SC.site.s * 4, '#1f6feb', `${f1(SC.site.s0)}→${f1(SC.site.s)}`], ['他點加分', SC.site.bonus * 100 / 30, '#2e9d5a', '+' + SC.site.bonus]]
      : [['安全', SC.safe, '#e53935'], ['安心', SC.calm, '#1f6feb'], ['美化', SC.beauty, '#2e9d5a']]).forEach(([k, v, c, t], i) => { const yy = y3 + i * 44;
      x.fillStyle = '#1d2a33'; x.font = F(900, 26); x.fillText(k, 40, yy + 24); x.fillStyle = '#dde3e8'; x.fillRect(160, yy + 4, 700, 26); x.fillStyle = c; x.fillRect(160, yy + 4, 7 * Math.max(0, Math.min(100, v)), 26);
      x.fillStyle = '#1d2a33'; x.fillText(t || Math.round(v), 876, yy + 26); }); y3 += 150; }
    const cnt = {}; Object.values(S.items).forEach((o) => { const n = BY_ID[o.id].name; cnt[n] = (cnt[n] || 0) + 1; });
    const rows = Object.entries(cnt).sort((a, b) => b[1] - a[1]), nr = Object.keys(S.removed).length;
    x.fillStyle = '#1d2a33'; x.font = F(900, 28); x.fillText(`擺放 ${Object.keys(S.items).length} 件${nr ? `・移除原有物件 ${nr} 件` : ''}・花費 ${spent()} 點`, 40, y3); y3 += 44;
    x.font = F(700, 24); rows.slice(0, Math.max(0, Math.floor((H - 70 - y3) / 34)) * 2).forEach(([n, c], i) => x.fillText(`${n} × ${c}`, 40 + (i % 2) * 520, y3 + Math.floor(i / 2) * 34));
    x.fillStyle = '#8a97a0'; x.font = F(700, 20); x.fillText(`${CL.schoolYear()} 學年・花蓮高商 校園改造遊戲`, 40, H - 30);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png')), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${title.replace(/[\s/：・]/g, '')}_提案海報.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast('提案海報已下載'); window.__posterCanvas = cv;
  }

  // ---------- 主要改造點（115/11/10）：和學習單一樣一組主攻一處；選點時看得到同班已有幾組選了這裡 ----------
  const SITE = { busy: false, pick: 0 };
  document.body.insertAdjacentHTML('beforeend', '<div id="gSite"><div class="box" role="dialog" aria-modal="true"></div></div>');
  const siteEl = document.getElementById('gSite'), siteBox = siteEl.querySelector('.box');
  siteEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === siteEl && S.site) siteEl.classList.remove('show'); });
  async function siteCounts(){   // 同班其他組各選了哪個點
    const c = {}; if (!CS.cls || CS.demo || !CS.w) return c;
    const docs = await Promise.all(Array.from({ length: CS.cls.groups || 0 }, (_, i) => i + 1 === CS.g ? null : CL.getDoc('cgWorks/' + CL.workId(CS.cls.id, i + 1)).catch(() => null)));
    docs.forEach((d) => { const n = d && +d.data.site; if (n) c[n] = (c[n] || 0) + 1; }); return c;
  }
  function siteOpen(){
    if (SH.view){ toast('先回到我們組再選改造點'); return; }
    SITE.pick = S.site; const inClass = !!CS.w && !CS.demo;
    siteBox.innerHTML = `<h3>📍 選定主要改造點</h3><p>和學習單一樣，每組主攻<b>一個地點</b>：分數主要看這個點的「安心指數」和「散心指數」。預算有剩，再照顧其他危險點可以加分。之後可以到「📋 方案」更換。</p>
      <div class="ls">${PTS.map(([n, , t]) => `<button data-n="${n}" class="${n === SITE.pick ? 'on' : ''}">${n}. ${t}<small data-c="${n}">${inClass ? '查詢中…' : ''}</small></button>`).join('')}</div>
      <div class="bs">學習單第三題的現況總分（可不填）：安心 <input type="number" min="5" max="25" inputmode="numeric" data-b="a" value="${S.base && S.base.a || ''}">／25　散心 <input type="number" min="5" max="25" inputmode="numeric" data-b="s" value="${S.base && S.base.s || ''}">／25</div>
      <div class="row">${S.site ? '<button data-a="x">取消</button>' : ''}<button data-a="ok" class="go"${SITE.pick ? '' : ' disabled'}>確定</button></div>`;
    const okB = siteBox.querySelector('[data-a="ok"]');
    siteBox.querySelectorAll('.ls button').forEach((b) => b.onclick = () => { SITE.pick = +b.dataset.n; siteBox.querySelectorAll('.ls button').forEach((o) => o.classList.toggle('on', o === b)); okB.disabled = false; });
    const xB = siteBox.querySelector('[data-a="x"]'); if (xB) xB.onclick = () => siteEl.classList.remove('show');
    okB.onclick = () => { const v = (k) => { const n = Math.round(+siteBox.querySelector(`[data-b="${k}"]`).value); return n >= 5 && n <= 25 ? n : 0; }, a = v('a'), s = v('s');
      siteEl.classList.remove('show'); siteSet(SITE.pick, a && s ? { a, s } : null); };
    siteEl.classList.add('show');
    if (inClass) siteCounts().then((c) => siteBox.querySelectorAll('small[data-c]').forEach((el) => { const k = c[+el.dataset.c] || 0; el.textContent = k ? `已有 ${k} 組選這裡` : '還沒有別組選'; el.classList.toggle('many', k >= 2); }))
      .catch(() => siteBox.querySelectorAll('small[data-c]').forEach((el) => el.textContent = ''));
  }
  async function siteSet(n, base){
    const p = PTS.find((q) => q[0] === n); if (!p) return;
    S.site = n; S.base = base; save(); rescore(); if (plans.classList.contains('show')) renderPlans();
    if (!WALK.on && window.setView) window.setView(p[4] - 16, 46, p[5] + 52, p[4], 0, p[5]);
    toast(`主要改造點：${p[2]}。先把這裡做好，再看別的危險點`);
    if (!CS.w) return;
    SITE.busy = true;
    try { await CL.patch('cgWorks/' + CS.w, { site: n, ...(base ? { base } : {}), classId: CS.cls.id, g: CS.g }, ['site', 'base', 'classId', 'g']); }
    catch (e){ toast('改造點存檔失敗：' + e.message); }
    SITE.busy = false;
  }

  // ---------- 全班共創校園（115/11/10 試做）：每個改造點放進一組的方案；同一點有多組時可切換比較並投票，老師公布後留下得票最高的 ----------
  const CO = { on: false, docs: {}, sites: [], pick: {}, cls: null, g: 0, teacher: false }, CO_R = 50;   // cls／g：正在看哪一班、自己是第幾組（老師看班級時 g＝0、teacher＝true，不能投票）
  const coEl = document.createElement('div'); coEl.id = 'gCo'; body.appendChild(coEl);
  coEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  const ptOf = (x, z) => { let b = 0, bd = CO_R; for (const p of PTS){ const d = Math.hypot(p[4] - x, p[5] - z); if (d <= bd){ bd = d; b = p[0]; } } return b; };   // 這個位置算哪個危險點的範圍（50 m 內最近的）
  function guessSite(d){   // 還沒選主點的舊作品：看東西最多放在哪個點附近
    if (+d.site) return +d.site; const c = {};
    for (const v of Object.values(d.items || {})){ const n = ptOf(+v.x, +v.z); if (n) c[n] = (c[n] || 0) + 1; }
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return top ? +top[0] : 0;
  }
  async function coOpen(cls){   // cls：老師從後台（?co=班級 id）或示範模式的「📋 方案」指定的班級；學生不給，看自己班
    if (cls){ CO.cls = cls; CO.g = 0; CO.teacher = true; }
    else { if (!showPhase() || !CS.cls.coOpen){ toast('老師開放後才能看全班共創校園'); return; } CO.cls = CS.cls; CO.g = CS.g; CO.teacher = false; }
    toast('載入全班的方案…');
    const docs = await Promise.all(Array.from({ length: CO.cls.groups || 0 }, (_, i) => CL.getDoc('cgWorks/' + CL.workId(CO.cls.id, i + 1)).catch(() => null)));
    CO.docs = {}; const by = {};
    docs.forEach((d, i) => { if (!d || !Object.keys(d.data.items || {}).length) return; const n = guessSite(d.data); if (!n) return; CO.docs[i + 1] = d.data; (by[n] = by[n] || []).push(i + 1); });
    CO.sites = PTS.filter((p) => by[p[0]]).map((p) => ({ n: p[0], title: p[2], x: p[4], z: p[5], gs: by[p[0]] }));
    if (!CO.sites.length){ toast('還沒有任何一組放了東西'); return; }
    const win = CO.cls.votesShown && CO.cls.coWin || {};
    CO.pick = {}; CO.sites.forEach((s) => { const w = +win['s' + s.n], m = +SH.votes['s' + s.n]; CO.pick[s.n] = s.gs.includes(w) ? w : s.gs.includes(m) ? m : s.gs[0]; });
    if (PHO.mode) phoExit();
    if (!SH.view){ endPlace(); deselect(); setDemolish(false); if (TOOL === 'mood') setMood(null); SH.stash = { items: deep(S.items), removed: { ...S.removed }, photos: deep(PHO.meta), site: S.site, base: S.base }; }
    SH.view = -1; CO.on = true; body.classList.add('viewing'); plans.classList.remove('show'); coApply(); renderView(); coRender(); coEl.classList.add('show');
    toast('全班共創校園：每個改造點放進一組的方案');
  }
  function coApply(){
    const items = {}, removed = {}, photos = {};
    for (const s of CO.sites){ const g = CO.pick[s.n], d = CO.docs[g]; if (!d) continue;
      for (const [u, v] of Object.entries(d.items || {})) if (ptOf(+v.x, +v.z) === s.n) items['g' + g + '_' + u] = v;
      for (const id of Object.keys(d.removed || {})){ const r = RMI.get(id); if (!r) continue; const c = r.box.getCenter(new THREE.Vector3()); if (ptOf(c.x, c.z) === s.n) removed[id] = true; }
      for (const [k, p] of Object.entries(d.photos || {})) if (/^p[1-6]$/.test(k) && p && ptOf(+p.x, +p.z) === s.n) photos['g' + g + k] = { ...p, w: CL.workId(CO.cls.id, g), slot: k };
    }
    setState({ items, removed }); phoSet(photos);
  }
  function coRender(){
    const shown = !!CO.cls.votesShown, tally = shown && CO.cls.coVotes || {}, win = shown && CO.cls.coWin || {};
    coEl.innerHTML = `<h3>🏫 全班共創校園${CO.teacher ? '・' + (CO.cls.name || '') : ''}</h3><p>每個改造點放進<b>一組</b>的方案。同一個點有好幾組時，點組別切換比較${CO.teacher ? '（老師檢視：不能投票）。' : '，再投給你覺得最好的一組（不能投自己組）。'}${shown ? '<b>老師已公布：🏆 是得票最高的方案。</b>' : '老師公布後，得票最高的會留在全班的校園裡。'}</p>`
      + CO.sites.map((s) => { const cur = CO.pick[s.n], mine = +SH.votes['s' + s.n] || 0, many = s.gs.length > 1;
        return `<div class="cs"><b data-n="${s.n}">${s.n}. ${s.title}<small>${many ? s.gs.length + ' 組競選' : '只有一組'}</small></b><div class="cg">${s.gs.map((g) => { const t = (tally['s' + s.n] || {})['g' + g];
          return `<button data-n="${s.n}" data-g="${g}" class="${g === cur ? 'on' : ''}">${+win['s' + s.n] === g ? '🏆 ' : ''}第 ${g} 組${g === CO.g ? '（我們）' : ''}${shown && many ? `　👍 ${t || 0}` : ''}</button>`; }).join('')}</div>`
          + (many && cur !== CO.g && !CO.teacher ? `<button class="cv${mine === cur ? ' on' : ''}" data-v="${s.n}">${mine === cur ? `✔ 已投第 ${cur} 組（再按收回）` : `👍 這個點投給第 ${cur} 組`}</button>` : '') + '</div>'; }).join('');
    coEl.querySelectorAll('.cs b').forEach((b) => b.onclick = () => coFly(+b.dataset.n));
    coEl.querySelectorAll('.cg button').forEach((b) => b.onclick = () => coPick(+b.dataset.n, +b.dataset.g));
    coEl.querySelectorAll('.cv').forEach((b) => b.onclick = () => coVote(+b.dataset.v, CO.pick[+b.dataset.v]));
  }
  function coFly(n){ const s = CO.sites.find((o) => o.n === n); if (s && !WALK.on && window.setView) window.setView(s.x - 16, 40, s.z + 46, s.x, 0, s.z); }
  function coPick(n, g){ if (!CO.on) return; CO.pick[n] = g; coApply(); coRender(); coFly(n); }
  async function coVote(n, g){
    if (g === CO.g){ toast('不能投自己組'); return; }
    const k = 's' + n, old = SH.votes[k]; if (+old === g) delete SH.votes[k]; else SH.votes[k] = g; coRender();
    try { await CL.patch('cgVotes/' + SH.vid, { classId: CO.cls.id, g: CO.g, v: SH.votes }, ['classId', 'g', 'v']); toast(+old === g ? '收回了這一票' : `這個點投給第 ${g} 組`); }
    catch (e){ if (old === undefined) delete SH.votes[k]; else SH.votes[k] = old; coRender(); toast('投票失敗：' + e.message); }
  }

  // ---------- 改造前照片（115/11/10 老師要求：像「全能住宅改造王」看見改造前和改造後） ----------
  // 每組最多 6 張（p1–p6）。照片在瀏覽器縮成長邊 1280 的 JPEG，存 cgPhotos/{作品 id}_{p1..p6}（只有登入學校帳號的人讀得到）；
  // 拍攝位置與視角存在 cgWorks 的 photos 欄位，跟著作品同步。對位＝照片半透明疊在 3D 上，學生走動轉頭到兩者重合
  const PHO = { meta: {}, raw: '{}', cache: new Map(), mode: '', cur: null, k: '', pose: null, ar: 1.33, fw: 1, fh: 1, split: .5, op: .5, seen: false, busy: false, keys: new Set(), last: 0 };
  const PH_MAX = 6, PH_EDGE = 1280, PH_LIM = 700000, PH_HEAD = 'data:image/jpeg;base64,';
  const phoW = () => SH.view ? CL.workId(CS.cls.id, SH.view) : CS.w;
  const phoMine = () => !!CS.w && !SH.view;
  const phoRoot = new THREE.Group(); phoRoot.name = 'photoPins'; scene.add(phoRoot);
  const clampN = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
  function phoSet(m){
    PHO.meta = {};
    for (const [k, v] of Object.entries(m || {})) if (/^(g\d+)?p[1-6]$/.test(k) && v && isFinite(+v.x) && isFinite(+v.z))
      PHO.meta[k] = { w: v.w || '', slot: v.slot || '', x: +v.x, z: +v.z, h: clampN(v.h, .3, 40, 1.5), yaw: clampN(v.yaw, -1e3, 1e3, 0), pitch: clampN(v.pitch, -1.4, 1.4, 0), fov: clampN(v.fov, 15, 115, 53), ar: clampN(v.ar, .3, 3.5, 1.33), t: +v.t || 0, cap: String(v.cap || '').slice(0, 30) };
    phoPins(); if (phoEl.classList.contains('show')) phoList();
  }
  function phoPins(){
    [...phoRoot.children].forEach((o) => phoRoot.remove(o));
    for (const [k, p] of Object.entries(PHO.meta)){
      const d = document.createElement('div'); d.className = 'ppin'; d.textContent = '📷'; d.title = p.cap || '改造前照片：點一下比較改造前後';
      d.addEventListener('pointerdown', (e) => e.stopPropagation()); d.onclick = () => phoOpen(k);
      const o = new CSS2DObject(d); o.position.set(p.x, 2.6, p.z); phoRoot.add(o); }
  }
  async function phoImg(k){
    const p = PHO.meta[k], w = (p && p.w) || phoW(), slot = (p && p.slot) || k, key = w + '_' + slot + '_' + (p ? p.t : 0); if (PHO.cache.has(key)) return PHO.cache.get(key);
    const d = await CL.getDoc('cgPhotos/' + w + '_' + slot), img = d && typeof d.data.img === 'string' && d.data.img.startsWith(PH_HEAD) ? d.data.img : '';
    if (img) PHO.cache.set(key, img); return img;
  }
  const phoErr = (e) => e.status === 401 || e.status === 403 ? '要登入學校帳號才能看照片' : '照片讀取失敗：' + e.message;

  // 清單面板
  const phoEl = document.createElement('div'); phoEl.id = 'gPhoto'; body.appendChild(phoEl);
  phoEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  const phoFile = document.createElement('input'); phoFile.type = 'file'; phoFile.accept = 'image/*'; phoFile.style.display = 'none'; body.appendChild(phoFile);
  function phoList(){
    const ks = Object.keys(PHO.meta).sort(), mine = phoMine();
    phoEl.innerHTML = `<h3>📷 改造前照片<button aria-label="關閉">×</button></h3>
      <p>${SH.view ? `第 ${SH.view} 組拍的改造前照片。` : '把要改造的地方拍下來，放到地圖上、對好角度，就能左右拉動比較「改造前的照片」和「改造後的 3D」。每組最多 ' + PH_MAX + ' 張。'}</p>
      <div class="pl">${ks.length ? '' : '<p>還沒有照片。</p>'}</div>${mine && ks.length < PH_MAX ? '<button class="go" data-a="add">＋ 新增改造前照片</button>' : ''}
      ${!CS.w ? '<p style="margin-top:8px">登入學校帳號、加入班級後才能上傳照片。</p>' : ''}`;
    const pl = phoEl.querySelector('.pl');
    for (const k of ks){ const p = PHO.meta[k], r = document.createElement('div'); r.className = 'pr';
      r.innerHTML = `<img alt=""><span></span><button data-a="see">比較</button>${mine ? '<button data-a="del" class="del">刪除</button>' : ''}`;
      r.querySelector('span').textContent = p.cap || '（沒有寫說明）';
      r.querySelector('[data-a="see"]').onclick = () => phoOpen(k); if (mine) r.querySelector('[data-a="del"]').onclick = () => phoDel(k);
      pl.appendChild(r); phoImg(k).then((src) => { if (src) r.querySelector('img').src = src; }).catch(() => {}); }
    phoEl.querySelector('h3 button').onclick = () => phoPanel(false);
    const add = phoEl.querySelector('[data-a="add"]'); if (add) add.onclick = phoAdd;
  }
  function phoPanel(on){ phoEl.classList.toggle('show', on); tb.photo.classList.toggle('on', on); if (on){ sc.classList.remove('show'); plans.classList.remove('show'); phoList(); } }
  tb.photo.onclick = () => phoPanel(!phoEl.classList.contains('show'));
  function phoAdd(){
    if (!phoMine()){ toast('登入學校帳號、加入班級後才能上傳照片'); return; }
    if (Object.keys(PHO.meta).length >= PH_MAX){ toast(`每組最多 ${PH_MAX} 張，先刪掉一張再加`); return; }
    const go = () => { phoFile.value = ''; phoFile.click(); };
    if (PHO.seen) go();
    else dialog('上傳前請先看', '照片會給登入學校帳號的同學和老師看到。請拍「地方」，不要拍到同學的臉、車牌或個人資料；拍到了請換一張。', [['取消'], ['我知道了，選照片', 'go', () => { PHO.seen = true; go(); }]]);
  }
  // 縮圖：長邊 1280、JPEG，太大就降品質、再縮尺寸（Firestore 單一文件上限 1 MB）
  function phoShrink(f){ return new Promise((res, rej) => { const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => { try {
      let k = Math.min(1, PH_EDGE / Math.max(im.naturalWidth, im.naturalHeight)), q = .72, out = '';
      const cv = document.createElement('canvas'), cx = cv.getContext('2d');
      for (let i = 0; i < 8; i++){ cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k)); cx.drawImage(im, 0, 0, cv.width, cv.height);
        out = cv.toDataURL('image/jpeg', q); if (out.length <= PH_LIM) break; if (q > .5) q -= .1; else k *= .8; }
      URL.revokeObjectURL(url);
      if (out.length > PH_LIM || !out.startsWith(PH_HEAD)) rej(new Error('too big')); else res({ img: out, ar: cv.width / cv.height });
    } catch (e){ rej(e); } };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); }; im.src = url; }); }
  // 預設視野：假設是手機主鏡頭（等效 26 mm，對角約 79°），依照片長寬比換算垂直視角
  const phoPose0 = (ar) => ({ x: 0, z: 0, h: 1.5, yaw: 0, pitch: 0, fov: Math.round(2 * Math.atan(.832 / Math.hypot(1, ar)) / D2R) });
  phoFile.onchange = async () => {
    const f = phoFile.files && phoFile.files[0]; if (!f) return;
    let r; try { r = await phoShrink(f); } catch (e){ toast('這張照片讀不了，請改用 JPG 或 PNG 檔'); return; }
    const slot = Array.from({ length: PH_MAX }, (_, i) => 'p' + (i + 1)).find((k) => !PHO.meta[k]); if (!slot){ toast(`已經滿 ${PH_MAX} 張了`); return; }
    PHO.cur = { k: slot, img: r.img, ar: r.ar, fresh: true, cap: '', t: 0 }; phoPanel(false);
    if (WALK.on){ const p = { x: WALK.pos.x, z: WALK.pos.z, yaw: WALK.yaw }; phoAlign({ ...phoPose0(r.ar), ...p }); return; }   // 街景中：就用現在站的位置
    endPlace(); deselect(); setDemolish(false); if (TOOL === 'mood') setMood(null);
    TOOL = 'photo'; status('📷 點一下地面：拍這張照片的時候，你站在哪裡？（Esc 取消）');
  };
  function phoSpot(cx, cy){
    const g = groundAt(cx, cy); if (!g || !PHO.cur){ TOOL = 'idle'; status(''); return; }
    const d = V.subVectors(controls.target, camera.position), yaw = Math.atan2(d.x, d.z);
    TOOL = 'idle'; status(''); phoAlign({ ...phoPose0(PHO.cur.ar), x: g.x, z: g.z, yaw });
  }

  // 全螢幕舞台：對位（al）與前後對照
  const phoSt = document.createElement('div'); phoSt.id = 'gPho'; body.appendChild(phoSt);
  phoSt.innerHTML = `<div class="fr"><img alt="" draggable="false"><i class="dv"></i><b class="tb">改造前</b><b class="ta">改造後</b></div>
    <div class="top"><span></span><button data-a="mix" class="vw">疊圖</button><button data-a="edit" class="vw ow">重新對位</button><button data-a="del" class="vw ow del">刪除</button><button data-a="x" class="vw">✕ 關閉</button></div>
    <div class="pan"><div class="pad"><button data-m="up" title="升高">升</button><button data-m="f" title="往前走">▲</button><button data-m="dn" title="降低">降</button><button data-m="l" title="往左">◀</button><button data-m="b" title="後退">▼</button><button data-m="r" title="往右">▶</button></div>
      <label>視野 <input type="range" data-r="fov" min="15" max="115" step="1"></label><label>照片透明 <input type="range" data-r="op" min="0" max="100" step="1"></label>
      <input type="text" maxlength="30" placeholder="這裡的問題是…（30 字內，可不寫）">
      <div class="acts"><button data-a="cancel">取消</button><button data-a="save" class="go">儲存</button></div>
      <p>拖曳畫面＝轉頭；按鈕或方向鍵＝走動、升降；滾輪或兩指＝調視野。讓 3D 校園和半透明的照片疊在一起，再按「儲存」。</p></div>`;
  const phoFr = phoSt.querySelector('.fr'), phoIm = phoFr.querySelector('img'), phoDv = phoFr.querySelector('.dv'), phoTitle = phoSt.querySelector('.top span'),
    fovEl = phoSt.querySelector('[data-r="fov"]'), opEl = phoSt.querySelector('[data-r="op"]'), capEl = phoSt.querySelector('input[type=text]'), saveBtn = phoSt.querySelector('[data-a="save"]');
  let phoSave = null;
  function phoLayout(){
    if (!PHO.mode) return; const r = canvas.getBoundingClientRect(), fw = Math.min(r.width, r.height * PHO.ar), fh = fw / PHO.ar;
    PHO.fw = fw; PHO.fh = fh; PHO.fl = r.left + (r.width - fw) / 2;
    phoFr.style.left = PHO.fl + 'px'; phoFr.style.top = r.top + (r.height - fh) / 2 + 'px'; phoFr.style.width = fw + 'px'; phoFr.style.height = fh + 'px';
    const al = PHO.mode === 'align', mix = phoSt.classList.contains('mix');
    phoIm.style.opacity = al ? PHO.op : mix ? .5 : 1; phoIm.style.clipPath = al || mix ? 'none' : `inset(0 ${(1 - PHO.split) * 100}% 0 0)`; phoDv.style.left = PHO.split * 100 + '%';
  }
  addEventListener('resize', phoLayout); if (window.visualViewport) visualViewport.addEventListener('resize', phoLayout);
  function phoEnter(mode, pose){
    if (WALK.on) exitWalk();
    endPlace(); deselect(); setDemolish(false); if (TOOL === 'mood') setMood(null); phoPanel(false);
    if (!PHO.mode) phoSave = { p: camera.position.clone(), t: controls.target.clone(), fov: camera.fov, near: camera.near };
    PHO.mode = mode; PHO.pose = { x: pose.x, z: pose.z, h: pose.h, yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov }; PHO.keys.clear(); PHO.last = 0;
    controls.enabled = false; lay.visible = false; body.classList.add('photoing');
    phoSt.classList.toggle('al', mode === 'align'); phoSt.classList.remove('mix'); phoSt.classList.toggle('ro', !phoMine()); phoSt.querySelector('[data-a="mix"]').classList.remove('on');
    PHO.split = .5; phoLayout();
  }
  function phoExit(){
    if (!PHO.mode) return; PHO.mode = ''; PHO.cur = null; PHO.keys.clear(); body.classList.remove('photoing'); lay.visible = true;
    camera.position.copy(phoSave.p); controls.target.copy(phoSave.t); camera.fov = phoSave.fov; camera.near = phoSave.near; camera.updateProjectionMatrix();
    controls.enabled = true; controls.update(); phoIm.removeAttribute('src');
  }
  function phoTick(){
    const p = PHO.pose, now = performance.now(), dt = Math.min(.05, (now - (PHO.last || now)) / 1000); PHO.last = now;
    if (PHO.mode === 'align' && PHO.keys.size){ const K = PHO.keys, sp = (K.has('shift') ? 8 : 3) * dt;
      phoMove(((K.has('w') || K.has('arrowup') || K.has('f') ? 1 : 0) - (K.has('s') || K.has('arrowdown') || K.has('b') ? 1 : 0)) * sp, ((K.has('d') || K.has('arrowright') || K.has('r') ? 1 : 0) - (K.has('a') || K.has('arrowleft') || K.has('l') ? 1 : 0)) * sp,
        ((K.has('e') || K.has('up') ? 1 : 0) - (K.has('q') || K.has('dn') ? 1 : 0)) * sp * .5); }
    const H = canvas.getBoundingClientRect().height || 1;
    camera.position.set(p.x, p.h, p.z); camera.lookAt(p.x + Math.sin(p.yaw) * Math.cos(p.pitch), p.h + Math.sin(p.pitch), p.z + Math.cos(p.yaw) * Math.cos(p.pitch));
    camera.fov = 2 * Math.atan(Math.tan(p.fov * D2R / 2) * H / PHO.fh) / D2R; camera.near = .1; camera.updateProjectionMatrix();   // 照片框的垂直視角固定，畫面其餘部分是多出來的邊
  }
  function phoMove(fwd, side, up){
    const p = PHO.pose, sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    p.x = Math.max(-30, Math.min(300, p.x + sy * fwd - cy * side)); p.z = Math.max(-60, Math.min(215, p.z + cy * fwd + sy * side)); p.h = Math.max(.3, Math.min(40, p.h + up));
  }
  function phoAlign(pose){
    const c = PHO.cur; if (!c) return; PHO.ar = c.ar; PHO.op = .5; phoIm.src = c.img; capEl.value = c.cap || '';
    phoEnter('align', pose); fovEl.value = PHO.pose.fov; opEl.value = 50; phoTitle.textContent = '對位：讓 3D 校園和照片疊在一起';
  }
  async function phoOpen(k){
    const p = PHO.meta[k]; if (!p) return; let img;
    try { img = await phoImg(k); } catch (e){ toast(phoErr(e)); return; }
    if (!img){ toast('找不到這張照片（可能被刪掉了）'); return; }
    PHO.k = k; PHO.ar = p.ar; phoIm.src = img; phoEnter('view', p);
    phoTitle.textContent = (SH.view ? `第 ${SH.view} 組・` : '') + (p.cap || '改造前照片') + '　← 左右拉動比較 →';
  }
  async function phoCommit(){
    const c = PHO.cur, p = PHO.pose; if (!c || PHO.busy || PHO.mode !== 'align') return;
    if (!phoMine()){ toast('現在不能儲存（沒有登入，或正在看別組）'); return; }
    PHO.busy = true; saveBtn.disabled = true; saveBtn.textContent = '儲存中…';
    const rd = (v, n = 100) => Math.round(v * n) / n, t = c.fresh ? Date.now() : c.t;
    const meta = { x: rd(p.x), z: rd(p.z), h: rd(p.h), yaw: rd(Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw)), 1000), pitch: rd(p.pitch, 1000), fov: rd(p.fov, 10), ar: rd(c.ar, 1000), t, cap: capEl.value.trim().slice(0, 30) };
    try {
      if (c.fresh) await CL.patch('cgPhotos/' + CS.w + '_' + c.k, { w: CS.w, classId: CS.cls.id, g: CS.g, img: c.img, t });
      await CL.patch('cgWorks/' + CS.w, { photos: { [c.k]: meta }, classId: CS.cls.id, g: CS.g }, ['photos.' + c.k, 'classId', 'g']);
      PHO.cache.set(CS.w + '_' + c.k + '_' + t, c.img); PHO.meta[c.k] = meta; PHO.raw = ''; phoPins(); pop(); toast('照片存好了：左右拉動比較改造前後');
      PHO.cur = null; PHO.k = c.k; phoEnter('view', meta); phoTitle.textContent = (meta.cap || '改造前照片') + '　← 左右拉動比較 →';
    } catch (e){ toast('儲存失敗：' + (e.status === 401 || e.status === 403 ? '沒有權限（請確認已登入、老師已分組）' : e.message)); }
    PHO.busy = false; saveBtn.disabled = false; saveBtn.textContent = '儲存';
  }
  function phoDel(k){
    if (!phoMine() || !PHO.meta[k]) return;
    dialog('刪除這張照片？', '刪掉後全組都看不到，而且不能復原。', [['取消'], ['刪除', 'go', async () => {
      try { await CL.del('cgPhotos/' + CS.w + '_' + k); await CL.patch('cgWorks/' + CS.w, { photos: {}, classId: CS.cls.id, g: CS.g }, ['photos.' + k, 'classId', 'g']);
        delete PHO.meta[k]; PHO.raw = ''; phoPins(); if (PHO.mode) phoExit(); if (phoEl.classList.contains('show')) phoList(); toast('已刪除照片'); }
      catch (e){ toast('刪除失敗：' + e.message); } }]]);
  }
  phoSt.querySelectorAll('button[data-a]').forEach((b) => b.onclick = () => { const a = b.dataset.a;
    if (a === 'x' || a === 'cancel') phoExit();
    else if (a === 'mix'){ phoSt.classList.toggle('mix'); b.classList.toggle('on', phoSt.classList.contains('mix')); phoLayout(); }
    else if (a === 'edit'){ const p = PHO.meta[PHO.k]; if (!p || !phoMine()) return; PHO.cur = { k: PHO.k, img: phoIm.src, ar: p.ar, fresh: false, cap: p.cap, t: p.t }; phoAlign(p); }
    else if (a === 'del') phoDel(PHO.k);
    else if (a === 'save') phoCommit(); });
  // 走動按鈕：按一下走半步，按住連續走
  phoSt.querySelectorAll('button[data-m]').forEach((b) => { const m = b.dataset.m; let t = 0;
    const step = (k) => phoMove((m === 'f' ? 1 : m === 'b' ? -1 : 0) * k, (m === 'r' ? 1 : m === 'l' ? -1 : 0) * k, (m === 'up' ? 1 : m === 'dn' ? -1 : 0) * k * .5);
    const stop = () => { clearTimeout(t); PHO.keys.delete(m); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); step(.5); clearTimeout(t); t = setTimeout(() => PHO.keys.add(m), 350); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, stop)); });
  fovEl.oninput = () => { if (PHO.pose) PHO.pose.fov = +fovEl.value; };
  opEl.oninput = () => { PHO.op = opEl.value / 100; phoLayout(); };
  // 舞台上的拖曳：對位＝轉頭（兩指＝視野）；對照＝拉分隔線
  const phoPt = new Map(); let phoG = null;
  const phoSplit = (x) => { PHO.split = Math.max(0, Math.min(1, (x - PHO.fl) / PHO.fw)); phoLayout(); };
  phoSt.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, .pan')) return; e.preventDefault(); try { phoSt.setPointerCapture(e.pointerId); } catch (er) {}
    phoPt.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (document.activeElement === capEl) capEl.blur();
    if (PHO.mode === 'view'){ if (!phoSt.classList.contains('mix')) phoSplit(e.clientX); return; }
    const P = [...phoPt.values()];
    phoG = P.length === 1 ? { x: e.clientX, y: e.clientY, yaw: PHO.pose.yaw, pitch: PHO.pose.pitch } : { d: Math.hypot(P[0].x - P[1].x, P[0].y - P[1].y) || 1, fov: PHO.pose.fov };
  });
  phoSt.addEventListener('pointermove', (e) => {
    if (!phoPt.has(e.pointerId)) return; phoPt.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (PHO.mode === 'view'){ if (!phoSt.classList.contains('mix')) phoSplit(e.clientX); return; }
    if (!phoG) return; const P = [...phoPt.values()];
    if (phoG.d && P.length >= 2){ PHO.pose.fov = Math.max(15, Math.min(115, phoG.fov * phoG.d / (Math.hypot(P[0].x - P[1].x, P[0].y - P[1].y) || 1))); fovEl.value = PHO.pose.fov; }
    else if (!phoG.d){ const k = PHO.pose.fov * D2R / PHO.fh; PHO.pose.yaw = phoG.yaw + (e.clientX - phoG.x) * k; PHO.pose.pitch = Math.max(-1.4, Math.min(1.4, phoG.pitch + (e.clientY - phoG.y) * k)); }
  });
  const phoUp = (e) => { phoPt.delete(e.pointerId); phoG = null; };
  phoSt.addEventListener('pointerup', phoUp); phoSt.addEventListener('pointercancel', phoUp);
  phoSt.addEventListener('wheel', (e) => { e.preventDefault(); if (PHO.mode !== 'align') return; PHO.pose.fov = Math.max(15, Math.min(115, PHO.pose.fov + e.deltaY * .03)); fovEl.value = PHO.pose.fov; }, { passive: false });
  addEventListener('keydown', (e) => {
    if (!PHO.mode || cf.classList.contains('show')) return;
    if (e.target === capEl){ e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') capEl.blur(); return; }
    const k = e.key.toLowerCase(); e.stopImmediatePropagation();
    if (k === 'escape'){ phoExit(); return; }
    if (PHO.mode === 'align' && ['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)){ PHO.keys.add(k); e.preventDefault(); }
    if (PHO.mode === 'view' && (k === 'arrowleft' || k === 'arrowright')){ PHO.split = Math.max(0, Math.min(1, PHO.split + (k === 'arrowleft' ? -.05 : .05))); phoLayout(); }
  }, true);
  addEventListener('keyup', (e) => PHO.keys.delete(e.key.toLowerCase()), true);
  addEventListener('blur', () => PHO.keys.clear());

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
    fx.visible = !WALK.on && !PHO.mode;
    if (PHO.mode) phoTick();
  };

  // ---------- 背景音樂（115/11/06 老師要求）：改造／探勘／展示各一首 CC0 曲（music/README.txt），切換時交叉淡入淡出 ----------
  // 用 Web Audio 的 GainNode 調音量（iPad Safari 不理 audio.volume）；瀏覽器規定要先有一次點擊才能出聲，所以第一次點畫面（起始頁的按鈕也算）才開始播
  const BGM = { on: true, vol: .5, cur: '', ctx: null, master: null, tr: {}, armed: false };
  try { const v = JSON.parse(localStorage.getItem('campusgame-bgm') || '{}'); if (v.on === false) BGM.on = false; if (typeof v.vol === 'number') BGM.vol = Math.max(0, Math.min(1, v.vol)); } catch (e) {}
  const BGM_T = { explore: ['🔍 探勘', 'Hot Springs Town'], build: ['🛠 改造', 'Apple Cider'], show: ['🏆 展示', 'Loop Town'] };
  header.insertAdjacentHTML('beforeend', '<button id="gBgm" title="背景音樂：開關與音量"></button>');
  body.insertAdjacentHTML('beforeend', '<div id="gBgmPop"><label><input type="checkbox"> 背景音樂</label><input type="range" min="0" max="100" aria-label="音量"><small></small></div>');
  const bgmBtn = document.getElementById('gBgm'), bgmPop = document.getElementById('gBgmPop'), bgmChk = bgmPop.querySelector('input[type=checkbox]'), bgmVol = bgmPop.querySelector('input[type=range]'), bgmInfo = bgmPop.querySelector('small');
  const bgmSave = () => { try { localStorage.setItem('campusgame-bgm', JSON.stringify({ on: BGM.on, vol: BGM.vol })); } catch (e) {} };
  function bgmMode(){   // 參觀別組或展示階段＝展示曲；街景、瀏覽（建造關閉）、探勘階段、放心情釘＝探勘曲；其餘＝改造曲
    const ph = CS.cls && !CS.demo ? CS.cls.phase : '';
    if (SH.view || ph === 'show') return 'show';
    if (WALK.on || !ON || ph === 'explore' || TOOL === 'mood') return 'explore';
    return 'build';
  }
  function bgmUi(){
    bgmBtn.textContent = BGM.on && BGM.vol > 0 ? '🎵' : '🔇'; bgmChk.checked = BGM.on; bgmVol.value = Math.round(BGM.vol * 100);
    const t = BGM_T[bgmMode()]; bgmInfo.textContent = `音量 ${Math.round(BGM.vol * 100)}・現在：${t[0]}〈${t[1]}〉`;
  }
  function bgmTrack(k){
    if (BGM.tr[k]) return BGM.tr[k];
    const a = new Audio('music/' + k + '.mp3'); a.loop = true; a.preload = 'auto';
    const g = BGM.ctx.createGain(); g.gain.value = 0; BGM.ctx.createMediaElementSource(a).connect(g); g.connect(BGM.master);
    return (BGM.tr[k] = { a, g });
  }
  function bgmLevel(){ if (BGM.master) BGM.master.gain.setTargetAtTime(BGM.on ? BGM.vol * BGM.vol * .9 : 0, BGM.ctx.currentTime, .15); }   // 平方曲線：小音量比較好調
  function bgmSwitch(){
    bgmUi();
    if (!BGM.ctx) return;
    const want = BGM.on && BGM.vol > 0 && document.visibilityState === 'visible' ? bgmMode() : '';
    if (want === BGM.cur) return;
    const t = BGM.ctx.currentTime;
    if (BGM.cur){ const o = BGM.tr[BGM.cur], k = BGM.cur; o.g.gain.cancelScheduledValues(t); o.g.gain.setTargetAtTime(0, t, .4); setTimeout(() => { if (BGM.cur !== k) o.a.pause(); }, 2000); }
    BGM.cur = want;
    if (want){ const n = bgmTrack(want); n.g.gain.cancelScheduledValues(t); n.g.gain.setTargetAtTime(1, t + .3, .5); n.a.play().catch(() => {}); }
  }
  function bgmArm(){   // 第一次點擊：建立 AudioContext（必須在使用者手勢裡）
    if (BGM.armed) return; BGM.armed = true;
    try { BGM.ctx = new (window.AudioContext || window.webkitAudioContext)(); BGM.master = BGM.ctx.createGain(); BGM.master.connect(BGM.ctx.destination); bgmLevel(); BGM.ctx.resume(); } catch (e){ BGM.ctx = null; return; }
    bgmSwitch();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, bgmArm, { capture: true, passive: true }));
  bgmBtn.onclick = (e) => { e.stopPropagation(); bgmPop.classList.toggle('show'); bgmUi(); };
  document.addEventListener('pointerdown', (e) => { if (bgmPop.classList.contains('show') && !bgmPop.contains(e.target) && e.target !== bgmBtn) bgmPop.classList.remove('show'); });
  bgmChk.onchange = () => { BGM.on = bgmChk.checked; if (BGM.on && BGM.vol === 0) BGM.vol = .5; bgmSave(); bgmLevel(); bgmSwitch(); };
  bgmVol.oninput = () => { BGM.vol = bgmVol.value / 100; if (BGM.vol > 0) BGM.on = true; bgmSave(); bgmLevel(); bgmSwitch(); };
  document.addEventListener('visibilitychange', () => { if (!BGM.ctx) return; if (document.visibilityState === 'visible') BGM.ctx.resume(); bgmSwitch(); });
  setInterval(bgmSwitch, 500);
  window.__bgm = BGM;   // 測試用

  // ---------- 開始 ----------
  if (h1) h1.textContent = '花蓮高商・校園改造';
  const n = load(); renderCat(); setOn(true); hud();
  const k = Object.keys(S.removed).length;
  if (n || k) toast(`已載入上次的改造：${n} 件物件${k ? `、移除 ${k} 件原有物件` : ""}`);
  rescore();
  window.__gameState = { S, RM, SURF, CS, MD, SH, join, addPin, setMood, viewGroup, backHome, vote, poster, askReset, doReset, get SC(){ return SC; }, tip, LY, drawLayers, tryPlace, check, select, undo, redo, SITE, siteOpen, siteSet, CO, coOpen, coPick, coVote, PHO, phoSet, phoOpen, phoAlign, phoCommit, phoExit, phoShrink, phoAdd, startPlace, endPlace, setDemolish, pickRm, ground, get sel(){ return sel; }, get TOOL(){ return TOOL; } };   // 測試用
}
