"use strict";
const $ = (s) => document.querySelector(s);
const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const button = (label, fn, cls) => {
  const b = make("button", cls, label);
  b.type = "button";
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    Promise.resolve(fn(e)).catch(report);
  });
  return b;
};
const uid = () => crypto.randomUUID();
const clone = (value) => structuredClone(value);
const NODE_WIDTH = 360;
const ICONS = {
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5Z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5Z M16 9l6 6 M22 9l-6 6"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 16 5-5 4 4 4-3 5 5"/>',
  video:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  text: '<path d="M4 5h16M12 5v15M8 20h8M4 5v3M20 5v3"/>',
  upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5"/>',
  library:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  sliders:
    '<path d="M5 3v5m0 4v9M12 3v10m0 4v4M19 3v2m0 4v12"/><path d="M2 8h6v4H2zm7 5h6v4H9zm7-8h6v4h-6z"/>',
  undo: '<path d="M9 5 3 10l6 5M3 10h10a7 7 0 0 1 7 7v2"/>',
  redo: '<path d="m15 5 6 5-6 5m6-5H11a7 7 0 0 0-7 7v2"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  locate:
    '<circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16"/>',
  link: '<path d="m9 15 6-6m-6 9-1.5 1.5a4.2 4.2 0 0 1-6-6L6 9a4.2 4.2 0 0 1 6 0m0 6a4.2 4.2 0 0 0 6 0l4.5-4.5a4.2 4.2 0 0 0-6-6L15 6"/>',
  group:
    '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  landscape: '<path d="M3 20h18L15 8l-5 8-3-4Z"/><circle cx="6" cy="6" r="2"/>',
  layers: '<rect x="3" y="3" width="13" height="13" rx="2"/><path d="M8 20h11a2 2 0 0 0 2-2V8"/>',
  frame:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4m10 0h4M3 15h4m10 0h4"/>',
};
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] || ICONS.image;
  return svg;
}
function iconButton(label, name, fn) {
  const b = button("", fn);
  b.setAttribute("aria-label", label); b.title = label;
  b.append(icon(name), make("span", "", label));
  return b;
}
function actionMenu(label, entries, cls) {
  const trigger = button("···", e => CanvasUI.menu(entries, { anchor: e.currentTarget, label }), cls || "");
  trigger.setAttribute("aria-label", label);
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  return trigger;
}

function syncSelection() {
  let status = $("#node-selection-status");
  if(!status){status=make("div","node-selection-status");status.id="node-selection-status";status.setAttribute("role","status");$(".canvas-top").prepend(status);}
  status.textContent=selected.size ? `已选 ${selected.size} 个节点 · Shift 点选可增减` : "拖动空白处框选 · Shift 点选多选";
  document.querySelectorAll(".node").forEach((el) => {
    el.classList.toggle("selected", selected.has(el.dataset.id));
    el.setAttribute("aria-selected",String(selected.has(el.dataset.id)));
    el.classList.toggle(
      "focused",
      selected.size === 1 && selected.has(el.dataset.id),
    );
  });
}
const MODELS = {
  "lingganya-gpt-image-2.5-sunburst-special": {
    name: "GPT Image 2.5 · Sunburst Special",
    kind: "image",
    ratios: ["adaptive", "1:1", "16:9", "9:16", "3:2", "2:3"],
    resolutions: ["1K", "2K", "4K"],
    images: 8,
    videos: 0,
    hint: "智能比例按第一张参考图匹配",
  },
  "seedream50-pro-ark-direct": {
    name: "Seedream 5.0 Pro · 2K",
    kind: "image",
    ratios: [],
    resolutions: [],
    images: 8,
    videos: 0,
    hint: "支持多图参考 · 2K 画质",
  },
  "seedream43-ark-direct": {
    name: "Seedream 4.3 · 2K",
    kind: "image",
    ratios: [],
    resolutions: [],
    images: 8,
    videos: 0,
    hint: "支持多图参考 · 2K 画质",
  },
  "lingganya-sd-2.0-mini": {
    name: "SD 2.0 Mini · 720p",
    kind: "video",
    ratios: ["16:9", "9:16"],
    resolutions: ["720p"],
    durations: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    images: 6,
    videos: 3,
    hint: "5–15 秒；图片作为视觉参考，不提供专用首尾帧参数",
  },
  "seedance-reference-video-ark-direct": {
    name: "Seedance · Reference Video",
    kind: "video",
    ratios: ["9:16", "16:9", "1:1"],
    resolutions: ["720p"],
    durations: [5, 10, 15],
    images: 8,
    videos: 8,
    hint: "图片 / 视频参考；不承诺精确首尾帧控制",
  },
};
MODELS["lingganya-gpt-image-2.5-sunburst"] = {...MODELS["lingganya-gpt-image-2.5-sunburst-special"], name: "GPT Image 2.5 · Sunburst"};
MODELS["lingganya-gpt-image-2-special"] = {...MODELS["lingganya-gpt-image-2.5-sunburst-special"], name: "GPT Image 2 · Special", ratios: ["adaptive", "1:1", "16:9", "9:16"]};
MODELS["lingganya-sd-2.5-px-vip"] = {name:"SD 2.5 · PX VIP",kind:"video",ratios:["adaptive","16:9","9:16","4:3","3:4","1:1","21:9"],resolutions:["720p","1080p","480p"],durations:Array.from({length:26},(_,i)=>i+5),images:30,videos:10,hint:"5–30 秒"};
let doc = { revision: 0, projects: [] },
  projectId,
  boardId,
  selected = new Set(),
  activeShot = "",
  assets = [],
  tasks = [],
  undoStack = [],
  redoStack = [],
  dirty = false,
  saveTimer,
  saving = false,
  changed = 0,
  loadFailed = false,
  pickTarget = null,
  copyBuffer = [],
  pending = new Set(),
  space = false,
  pricing = null;
const assetById = new Map(), taskById = new Map(), tasksByNode = new Map();
let nodeIndex = new Map(), hiddenNodes = new Set(), indexedBoard = null, indexedNodes = null, indexedLength = -1;
function rebuildAssetIndex() { assetById.clear(); assets.forEach(a => assetById.set(a.id, a)); }
function rebuildTaskIndex() {
  taskById.clear(); tasksByNode.clear();
  for (const task of tasks) {
    taskById.set(task.id, task);
    const key = `${task.board_id}:${task.node_id}`;
    if (!tasksByNode.has(key)) tasksByNode.set(key, []);
    tasksByNode.get(key).push(task);
  }
  for (const list of tasksByNode.values()) list.sort((a,b) => b.created_at - a.created_at);
}
function indexBoard() {
  const b = board();
  indexedBoard = b; indexedNodes = b?.nodes; indexedLength = b?.nodes.length || 0;
  nodeIndex = new Map((b?.nodes || []).map(n => [n.id, n]));
  hiddenNodes = new Set();
}

const project = () => doc.projects.find((p) => p.id === projectId);
const board = () => project()?.boards.find((b) => b.id === boardId);
const node = (id) => {
  if (indexedBoard !== board() || indexedNodes !== board()?.nodes || indexedLength !== board()?.nodes.length) indexBoard();
  return nodeIndex.get(id);
};
const version = (n) =>
  n?.versions?.find((v) => v.id === n.currentVersion) || n?.versions?.at(-1);
const thumb = (v) =>
  v?.kind === "image" && v.url?.startsWith("/media/")
    ? v.url + "?thumbnail=1"
    : v?.url;
const mediaURL = (v) =>
  assetById.get(v?.assetId)?.url ||
  taskById.get(v?.taskId)?.[
    v.kind === "video" ? "local_video_url" : "local_image_url"
  ] ||
  v?.url;
const nodeSignature = (n) =>
  JSON.stringify([
    { ...n, x: 0, y: 0 },
    (tasksByNode.get(`${boardId}:${n.id}`) || []).map(t => [t.id, t.status, t.error]),
    pending.has(n.id),
    replacementUploads.has(n.id),
    board().shots.map(s => [s.id,s.name]),
    pricing,
  ]);
const statusName = (s) =>
  ({
    queued: "排队中",
    running: "生成中",
    completed: "已完成",
    failed: "失败",
    paused: "查询已暂停",
  })[s] || s;
const toast = (message) => {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").hidden = true), 5500);
};
const report = (error) => toast(error?.message || String(error));
async function api(path, options = {}) {
  const r = await fetch(path, options);
  const d = await r.json();
  if (!r.ok || d.ok === false) throw new Error(d.error || "请求失败");
  return d;
}
function journal() {
  try {
    localStorage.setItem("studio-board-draft", JSON.stringify(doc));
  } catch {
    $("#save-state").textContent = "浏览器备份空间不足，请保持页面打开";
  }
}
let journalTimer;
// Viewport preferences are local; panning is not a document edit.
const viewTimers = new Map();
function rememberView() {
  const id = boardId, view = {...board().view};
  clearTimeout(viewTimers.get(id));
  viewTimers.set(id, setTimeout(() => {
    try { localStorage.setItem("studio-view-" + id, JSON.stringify(view)); } catch {}
    viewTimers.delete(id);
  }, 350));
}
function restoreView() {
  try {
    const view = JSON.parse(localStorage.getItem("studio-view-" + boardId));
    if (view && [view.x, view.y, view.z].every(Number.isFinite) && view.z >= .15 && view.z <= 2)
      board().view = view;
  } catch {}
}
function touch() {
  if (loadFailed) return;
  dirty = true;
  changed++;
  $("#save-state").textContent = "保存中…";
  clearTimeout(journalTimer);
  journalTimer = setTimeout(journal, 180);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1500);
}
async function save() {
  if (saving || !dirty || loadFailed) return;
  saving = true;
  clearTimeout(journalTimer);
  journal();
  const serial = changed;
  try {
    const result = await api("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    doc.revision = result.revision;
    doc.storage = result.storage;
    if (changed === serial) {
      dirty = false;
      localStorage.removeItem("studio-board-draft");
      $("#save-state").textContent = doc.storage === "cloud" ? "云端已保存" : "已保存（本地）";
      $("#save-notice").hidden = true;
    } else journal();
  } catch (e) {
    $("#save-state").textContent = "尚未保存";
    $("#save-notice").hidden = false;
    $("#save-notice-message").textContent = e.message.includes("另一个窗口")
      ? "另一个窗口更新了画板，当前修改已保留在浏览器。"
      : "暂时无法保存，当前修改已保留在浏览器。";
    toast(e.message);
    if (e.message.includes("另一个窗口")) loadFailed = true;
  } finally {
    saving = false;
    if (dirty && !loadFailed)
      saveTimer = setTimeout(save, changed !== serial ? 600 : 6000);
  }
}
function checkpoint() {
  undoStack.push(
    clone({ nodes: board().nodes, shots: board().shots, view: board().view }),
  );
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  updateHistoryControls();
}
function updateHistoryControls() {
  $("#undo").disabled = !undoStack.length;
  $("#redo").disabled = !redoStack.length;
}
function history(from, to) {
  if (!from.length) return;
  to.push(
    clone({ nodes: board().nodes, shots: board().shots, view: board().view }),
  );
  Object.assign(board(), from.pop());
  indexBoard();
  selected.clear();
  touch();
  render();
}
function newBoard(name = "未命名画板") {
  return {
    id: uid(),
    name,
    nodes: [],
    shots: [],
    view: { x: 80, y: 110, z: 1 },
  };
}
function newProject(name) {
  return {
    id: uid(),
    name,
    style: "",
    ratio: "16:9",
    boards: [newBoard("第 1 集 · 场景 01")],
  };
}
function setBoard(id) {
  closeExpandedEditor(true);
  projectId = doc.projects.find(p => p.boards.some(b => b.id === id))?.id || projectId;
  boardId = id;
  if(scriptFrame){scriptFrame.hidden=true;$("#script-button").setAttribute("aria-expanded","false");}
  selected.clear();
  activeShot = "";
  undoStack = [];
  redoStack = [];
  sessionStorage.setItem("studio-board", id);
  restoreView();
  render();
}
function renderNavigation() {
  const p = project();
  $("#project-select").replaceChildren(
    ...doc.projects
      .filter((x) => !x.archived)
      .map((x) => {
        const o = make("option", "", x.name);
        o.value = x.id;
        o.selected = x.id === projectId;
        return o;
      }),
  );
  $("#board-list").replaceChildren(
    ...doc.projects.filter(p => !p.archived).flatMap(p => p.boards).filter(b => !b.archived).map((b) => {
      const row = button(
        b.name,
        () => setBoard(b.id),
        "board-row" + (b.id === boardId ? " active" : ""),
      );
      row.append(make("span", "", String(b.nodes.length)));
      return row;
    }),
  );
  $("#board-title").textContent = board().name;
  $("#board-caption").textContent = board().name;
  $("#node-count").textContent = board().nodes.length
    ? `${board().nodes.length} 个节点`
    : "";
}
function hiddenNode(n) { return hiddenNodes.has(n.id); }
function renderNodes() {
  indexBoard();
  const root = $("#nodes"), existing = new Map([...root.children].map(el => [el.dataset.id, el]));
  let slot = root.firstElementChild;
  for (const n of board().nodes) {
    if (hiddenNode(n)) continue;
    const old = existing.get(n.id), signature = nodeSignature(n);
    let el = old;
    if (!old || old._node !== n || old.dataset.signature !== signature) {
      el = renderNode(n);
      if (old) { old.querySelectorAll("video").forEach(media => nodeMediaObserver.unobserve(media)); old.replaceWith(el); }
      if (slot === old) slot = el;
    }
    el.style.left = n.x + "px"; el.style.top = n.y + "px";
    if (el !== slot) root.insertBefore(el, slot);
    slot = el.nextElementSibling;
    existing.delete(n.id);
  }
  existing.forEach(el => { el.querySelectorAll("video").forEach(media => nodeMediaObserver.unobserve(media)); el.remove(); });
  syncSelection();
}
function render() {
  if (!board()) return;
  if (resolvePendingReferences(board().nodes)) touch();
  renderNavigation();
  updateHistoryControls();
  renderNodes();
  refreshExpandedEditor();
  $("#empty").hidden = board().nodes.length > 0;
  applyView();
  drawEdges();
  renderShots(true);
  if ($("#library-dialog").open) renderAssets();
}
let viewFrame;
function applyView() {
  if (viewFrame) return;
  viewFrame = requestAnimationFrame(() => { viewFrame = 0; paintView(); });
}

function paintView() {
  const v = board().view;
  $("#world").style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
  $("#zoom-label").textContent = Math.round(v.z * 100) + "%";
  $("#viewport").style.backgroundSize = `${22 * v.z}px ${22 * v.z}px`;
  $("#viewport").style.backgroundPosition = `${v.x}px ${v.y}px`;
}
function worldPoint(x, y) {
  const rect = $("#viewport").getBoundingClientRect(),
    v = board().view;
  return { x: (x - rect.left - v.x) / v.z, y: (y - rect.top - v.y) / v.z };
}
function centerPoint() {
  const r = $("#viewport").getBoundingClientRect();
  return worldPoint(r.left + r.width / 2 - 130, r.top + r.height / 2 - 120);
}
function createNode(type, position = centerPoint(), overrides = {}, defer = false, placeExactly = false) {
  position = { ...position };
  while (
    !placeExactly && type !== "group" &&
    board().nodes.some(
      (n) =>
        n.type !== "group" &&
        Math.abs(n.x - position.x) < 330 &&
        Math.abs(n.y - position.y) < 400,
    )
  )
    position.x += 430;
  if (!defer) checkpoint();
  const profile = Object.keys(MODELS).find((k) => MODELS[k].kind === type);
  const m = MODELS[profile];
  const n = {
    id: uid(),
    type,
    name:
      {
        image: "图片生成",
        video: "视频生成",
        text: "剧本笔记",
        group: "场景分组",
      }[type] +
      " " +
      (board().nodes.filter((x) => x.type === type).length + 1),
    x: Math.round(position.x),
    y: Math.round(position.y),
    prompt: "",
    profile,
    ratio: m?.ratios[0] || "",
    resolution: m?.resolutions[0] || "",
    duration: String(m?.durations?.[0] || 5),
    refs: [],
    versions: [],
    shotId: "",
    ...overrides,
  };
  board().nodes.push(n);
  if (defer) return n;
  selected = new Set([n.id]);
  touch();
  render();
  requestAnimationFrame(() => ensureNodeVisible(n));
  return n;
}
function selectNode(id, add = false) {
  if (!add) selected.clear();
  if (id) selected.has(id) && add ? selected.delete(id) : selected.add(id);
  syncSelection();
  drawEdges();
}
function selector(options, value, fn, cls) {
  const e = make("select", cls);
  options.forEach(([v, label]) => {
    const o = make("option", "", label);
    o.value = v;
    o.selected = String(v) === String(value);
    e.append(o);
  });
  e.addEventListener("change", () => fn(e.value));
  return e;
}
// Dither field adapted from BeUI Image Generation (MIT).
// Only waiting and final media are shown: the provider supplies no preview frames.
function generationLoader(label) {
  const overlay = make("div", "generation-overlay");
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  const field = make("canvas", "generation-dither");
  field.setAttribute("aria-hidden", "true");
  overlay.append(field, make("span", "generation-label", label));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0, height = 0, x = 0, y = 0, stillPainted = false;
  const draw = time => {
    if (!overlay.isConnected) return; // Removed nodes must not retain animation loops.
    const w = overlay.clientWidth, h = overlay.clientHeight;
    const ctx = field.getContext("2d");
    if (!ctx || !w || !h) { requestAnimationFrame(draw); return; }
    if (w !== width || h !== height) {
      stillPainted = false;
      width = w; height = h; x = w / 2; y = h / 2;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      field.width = Math.round(w * dpr); field.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const still = reduce.matches;
    if (still && stillPainted) { requestAnimationFrame(draw); return; }
    stillPainted = still;
    x += (w / 2 + (still ? 0 : Math.sin(time / 1700) * w * .12) - x) * .045;
    y += (h / 2 + (still ? 0 : Math.cos(time / 2100) * h * .1) - y) * .045;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(field).color;
    const radius = Math.min(w, h) * .38;
    for (let row = 0; row <= Math.ceil(h / 10); row++) {
      for (let col = 0; col <= Math.ceil(w / 10); col++) {
        const ax = col * 10, ay = row * 10, dx = ax - x, dy = ay - y;
        const distance = Math.hypot(dx, dy), p = Math.max(0, 1 - distance / radius);
        const influence = p * p * (3 - 2 * p), shift = influence * influence * 9;
        ctx.globalAlpha = .12 + influence * .72;
        ctx.beginPath();
        ctx.arc(ax + (distance ? dx / distance * shift : 0), ay + (distance ? dy / distance * shift : 0), .65 + influence * .85, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return overlay;
}
// Same editor fields and handlers in compact and expanded views.
let expandedEditor = null;
function decorateHoverButton(button) {
  const label = button.textContent;
  button.classList.add("interactive-hover-button");
  const rest = make("span", "hover-button-rest");
  rest.append(make("i"), make("span", "", label));
  const active = make("span", "hover-button-active");
  active.setAttribute("aria-hidden", "true");
  active.append(make("span", "", label), make("span", "", "→"));
  button.replaceChildren(rest, active);
}
function openExpandedEditor(n) {
  if (expandedEditor) return;
  CanvasUI.close();
  const origin = document.querySelector(`#nodes [data-id="${n.id}"] .generation-editor`);
  const rect = origin?.getBoundingClientRect();
  const dialog = make("dialog", "prompt-editor-dialog");
  dialog.id = "prompt-editor-dialog";
  dialog.setAttribute("aria-label", n.name + " · 提示词编辑器");
  const host = make("div", "node focused expanded-editor-host");
  host.dataset.id = n.id;
  dialog.append(host); document.body.append(dialog);
  const mentions = $("#mention-menu"), home = mentions.parentElement;
  dialog.append(mentions);
  expandedEditor = {dialog,host,id:n.id,board:boardId,signature:null,mentions,home,closing:false};
  refreshExpandedEditor(); dialog.showModal();
  dialog.addEventListener("cancel", e => { e.preventDefault(); closeExpandedEditor(); });
  dialog.addEventListener("click", e => { if(e.target===dialog && (e.clientX<dialog.getBoundingClientRect().left||e.clientX>dialog.getBoundingClientRect().right||e.clientY<dialog.getBoundingClientRect().top||e.clientY>dialog.getBoundingClientRect().bottom)) closeExpandedEditor(); });
  if (rect && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const to = dialog.getBoundingClientRect();
    dialog.animate([{opacity:.5,transform:`translate(${rect.x+rect.width/2-to.x-to.width/2}px,${rect.y+rect.height/2-to.y-to.height/2}px) scale(${Math.min(1,rect.width/to.width)},${Math.min(1,rect.height/to.height)})`},{opacity:1,transform:"none"}],{duration:280,easing:"cubic-bezier(.22,1,.36,1)"});
  }
  host.querySelector("textarea")?.focus({preventScroll:true});
}
function refreshExpandedEditor() {
  const state = expandedEditor;
  if (!state || state.closing) return;
  const n = node(state.id);
  if (!n || state.board !== boardId) return closeExpandedEditor(true);
  const signature = nodeSignature(n);
  if (state.signature === signature) return;
  const old = state.host.querySelector("textarea"), focused = old === document.activeElement;
  if (state.host.querySelector(".rich-prompt")?.contains(document.activeElement)) return;
  const selection = old && [old.selectionStart,old.selectionEnd,old.scrollTop];
  state.host.replaceChildren(buildGenerationEditor(n,true));state.signature=signature;
  if(focused){const input=state.host.querySelector("textarea");input.focus({preventScroll:true});input.setSelectionRange(selection[0],selection[1]);input.scrollTop=selection[2];}
}
function closeExpandedEditor(immediate = false) {
  const state = expandedEditor;
  if (!state || state.closing) return;
  state.closing=true;CanvasUI.close();state.mentions.hidden=true;
  const finish = () => {
    state.home.append(state.mentions);state.dialog.close();state.dialog.remove();expandedEditor=null;
    renderNodes();
    document.querySelector(`#nodes [data-id="${state.id}"] .expand-editor`)?.focus({preventScroll:true});
  };
  if (immediate || !state.dialog.open || matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
  else state.dialog.animate([{opacity:1,transform:"none"},{opacity:0,transform:"translateY(8px) scale(.985)"}],{duration:160,easing:"ease-in",fill:"forwards"}).finished.then(finish);
}

function buildGenerationEditor(n, expanded = false) {
  const hasResult = !!n.versions?.length;
  const current = tasksByNode.get(`${boardId}:${n.id}`)?.[0];
    const editor = make("div", "generation-editor");
    const heading = make("div", "editor-heading");
    heading.append(
      make(
        "span",
        "",
        n.type === "text" ? "笔记" : "提示词",
      ),
      make("span", "", ""),
    );
    editor.append(heading);
    heading.append(button(expanded ? "⤡" : "⤢", () => expanded ? closeExpandedEditor() : openExpandedEditor(n), "expand-editor"));
    heading.lastChild.setAttribute("aria-label", expanded ? "收起提示词编辑器" : "展开提示词编辑器");
    heading.lastChild.title = expanded ? "收起编辑器 · Esc" : "展开编辑器";
    heading.lastChild.replaceChildren(icon("fit"));

    const prompt = make("textarea");
    if(n.type !== 'text') {
      const choices = imageMentionCandidates(n);
      for(const ref of n.refs || []) {
        const choice=choices.find(c=>c.id===ref.nodeId);
        if(choice && ref.name!==choice.name){n.prompt=n.prompt.split('@'+ref.name).join('@'+choice.name);ref.name=choice.name;}
      }
    }
    prompt.value = n.prompt;
    prompt.placeholder =
      n.type === "text"
        ? "记录剧本、角色设定或镜头想法…"
        : "描述画面，@ 引用节点";
    prompt.setAttribute("aria-label", n.name + " 提示词");
    prompt.addEventListener("focus", () => checkpoint());
    prompt.addEventListener("input", () => {
      n.prompt = prompt.value;
      touch();

    });
    prompt.addEventListener("keydown", (e) => {
      if (e.key === "Escape") $("#mention-menu").hidden = true;
      if (e.key === "ArrowDown" && !$("#mention-menu").hidden) {
        e.preventDefault();
        $("#mention-menu button")?.focus();
      }
    });
    if (n.type !== "text") {
    }
    editor.append(prompt);
    if(n.type!=="text"){
      const refreshReferences = () => requestAnimationFrame(() => {
        const offset = prompt._rich?.caret() ?? n.prompt.length;
        const focused = document.activeElement === prompt._rich?.editor;
        if(expandedEditor?.id===n.id){expandedEditor.signature=null;prompt._rich?.editor.blur();}
        render();
        if (focused) {
          const scope = expandedEditor?.id===n.id ? expandedEditor.host : document;
          const next = [...scope.querySelectorAll('textarea')].find(t => t.getAttribute('aria-label') === n.name + ' 提示词' && t._rich);
          next?._rich.restore(offset);
        }
      });
      const rich=RichPrompt.mount(prompt,{
        candidates:()=>imageMentionCandidates(n),
        onPick:c=>{if(!n.refs.some(r=>r.nodeId===c.id))n.refs.push({...binding(node(c.id)),name:c.name});refreshReferences();},
        onRemove:c=>{n.refs=n.refs.filter(r=>r.nodeId!==c.id);refreshReferences();}
      });
      prompt._rich=rich;prompt.focus=()=>rich.editor.focus();
    }
    if (n.type !== "text") {
      const refs = make("div", "reference-list");
      refs.setAttribute("aria-label", "参考素材");
      refs.addEventListener("dragover", (e) => e.preventDefault());
      refs.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const asset = assetById.get(e.dataTransfer.getData("application/studio-asset"));
        if (asset) {
          const source = assetNode(asset, { x: n.x - 440, y: n.y });
          try { addReference(n, source); selected = new Set([n.id]); syncSelection(); drawEdges(); } catch (error) { report(error); }
          return;
        }
        const id = e.dataTransfer.getData("application/studio-node");
        if (node(id)) {
          try {
            addReference(n, node(id));
          } catch (error) {
            report(error);
          }
        }
      });
      for (const ref of n.refs || []) {
        const chip = make("div", "ref-chip");
        chip.dataset.referenceId = ref.id;
        const order = n.refs.indexOf(ref) + 1;
        const handle = button(String(order).padStart(2, "0"), () => {}, "ref-sort-handle");
        handle.setAttribute("aria-label", `参考 ${order}，拖动排序，左右方向键调整`);
        chip.append(handle);
        bindReferenceSort(handle, chip, refs, n, ref);
        if (ref.kind === "image" && mediaURL(ref)) {
          const img = make("img");
          img.src = thumb(ref);
          img.alt = "";
          chip.append(img);
        }
        const locate = button("@" + ref.name, () => {
          if (node(ref.nodeId)) focusNodes([node(ref.nodeId)]);
          else previewVersions([ref]);
        });
        locate.title = ref.awaiting ? "等待上游生成" : ref.name + " · 固定版本";
        if (ref.awaiting) chip.classList.add("awaiting-reference");
        chip.append(locate);
        const remove = button("×", () => {
          checkpoint();
          n.refs = n.refs.filter((r) => r !== ref);
          n.prompt = removeImageMention(n.prompt, ref.name);
          touch();
          render();
        });
        remove.setAttribute("aria-label", "移除引用 " + ref.name);
        chip.append(remove);
        refs.append(chip);
      }
      refs.append(
        button(
          "＋ 参考素材",
          () => {
            if (expanded) closeExpandedEditor();
            pickTarget = n.id;
            $("#reference-mode").hidden = false;
          },
          "add-ref",
        ),
      );
      editor.append(refs);
      const params = make("div", "params");
      const model = selector(
        Object.entries(MODELS)
          .filter(([, m]) => m.kind === n.type)
          .map(([key, m]) => [key, m.name]),
        n.profile,
        (value) => {
          checkpoint();
          n.profile = value;
          const m = MODELS[value];
          n.ratio = m.ratios[0] || "";
          n.resolution = m.resolutions[0] || "";
          n.duration = String(m.durations?.[0] || 5);
          touch();
          render();
        },
        "model",
      );
      model.setAttribute("aria-label", "生成模型");
      params.append(model);
      const m = MODELS[n.profile];
      for (const [key, values, label] of [
        ["ratio", m?.ratios, "画幅"],
        ["resolution", m?.resolutions, "分辨率"],
        ["duration", m?.durations, "时长"],
      ])
        if (values?.length) {
          const option = selector(
            values.filter(value => key !== "ratio" || n.resolution === "1K" || !["3:2", "2:3"].includes(value)).map((value) => [
              value,
              key === "duration" ? value + " 秒" : value === "adaptive" ? "智能" : value,
            ]),
            n[key],
            (value) => {
              checkpoint();
              n[key] = value;
              if (key === "resolution" && value !== "1K" && ["3:2", "2:3"].includes(n.ratio)) n.ratio = "adaptive";
              touch();
              render();
            },
          );
          option.setAttribute("aria-label", label);
          params.append(option);
        }
      editor.append(params);
      const incompat = compatibility(n);
      if (incompat) editor.append(make("div", "status" + (n.refs?.some(r => r.awaiting) ? " waiting" : " error"), incompat));
      model.title = m?.hint || "请选择模型";
      const busy =
        pending.has(n.id) ||
        (current && ["queued", "running", "paused"].includes(current.status));
      const gen = make("div", "generate");
      gen.append(
        Object.assign(make("small", "cost", cost(n).split(" · ")[0]), { title: cost(n) }),
        button(
          current?.status === "paused"
            ? "继续查询"
            : busy
              ? "制作中…"
              : "生成",
          () =>
            current?.status === "paused" ? resumeTask(current) : submitNode(n),
          "primary",
        ),
      );
      decorateHoverButton(gen.lastChild);
      if ((busy && current?.status !== "paused") || incompat)
        gen.lastChild.disabled = true;
      editor.append(gen);
      if (current && ["failed", "paused"].includes(current.status))
        editor.append(
          make(
            "div",
            "status" + (current.status === "failed" ? " error" : ""),
            statusName(current.status) +
              (current.error ? " · " + current.error : ""),
          ),
        );
    }
  return editor;
}

function renderNode(n) {
  const focused = selected.size === 1 && selected.has(n.id);
  const hasResult = !!n.versions?.length;
  const current = tasksByNode.get(`${boardId}:${n.id}`)?.[0];
  const el = make(
    "article",
    "node" +
      (selected.has(n.id) ? " selected" : "") +
      (focused ? " focused" : "") +
      (hasResult ? " has-result" : "") +
      (n.type === "group" ? " group-node" : "") +
      (n.type === "text" ? " text-node" : "") +
      (n.source ? " source" : ""),
  );
  el._node = n;
  el.classList.toggle("is-uploading", replacementUploads.has(n.id));
  el.dataset.id = n.id;
  el.dataset.signature = nodeSignature(n);
  el.setAttribute("aria-label", n.name);
  el.style.left = n.x + "px";
  el.style.top = n.y + "px";
  const header = make("header", "node-header");
  const type = make("span", "node-type");
  type.append(icon(n.type === "group" ? "group" : n.type));
  const title = make("span", "node-name", n.name);
  title.title = n.name;
  const settings = button("···", e => CanvasUI.menu(nodeMenuEntries(n), { anchor: e.currentTarget, label: "节点操作" }), "node-menu-trigger");
  settings.setAttribute("aria-label", "节点菜单");
  settings.setAttribute("aria-haspopup", "menu");
  header.append(type, title, settings);
  el.append(header);
  header.addEventListener("pointerdown", (e) => startMove(e, n));
  el.addEventListener("pointerdown", (e) => {
    if (CanvasUI.isEditing(e.target)) { e.stopPropagation(); return; }
    if (pickTarget && n.id !== pickTarget) {
      e.preventDefault();
      e.stopPropagation();
      try {
        addReference(node(pickTarget), n);
        endPick();
      } catch (error) {
        report(error);
      }
      return;
    }
    if (
      !e.target.closest(
        "button,input,textarea,select,video,a,summary,details",
      ) &&
      !pickTarget
    )
      startMove(e, n);
  });
  el.addEventListener("dblclick", (e) => {
    if (CanvasUI.isEditing(e.target)) { e.stopPropagation(); return; }
    if (!e.target.closest("button,input,textarea,select,video,a,summary,img"))
      focusNodes([n]);
  });
  if (n.type === "group") {
    el.style.width = (n.width || 720) + "px";
    el.style.height = (n.height || 520) + "px";
    header.append(make("span", "group-count", `${(n.members || []).filter(id => node(id)).length} 个节点`));
    return el;
  }
  const output = button("", e => {
    if (e.detail === 0) {
      const r = e.currentTarget.getBoundingClientRect(); connectionMenu(n, { x: r.right + 12, y: r.top });
    }
  }, "port");
  output.title = "拖出连线，连接素材或创建下一步";
  output.setAttribute("aria-label", "输出连接点");
  output.addEventListener("pointerdown", (e) => startConnection(e, n));
  el.append(output);
  if (!n.source && ["image", "video"].includes(n.type)) {
    const input = button("", e => {
      if (e.detail === 0) {
        const r = e.currentTarget.getBoundingClientRect(); connectionMenu(n, { x: r.left - 220, y: r.top }, null, true);
      }
    }, "port in");
    input.title = "拖到上游节点，或创建参考节点";
    input.setAttribute("aria-label", "输入连接点");
    input.addEventListener("pointerdown", e => startConnection(e, n, true));
    el.append(input);
  }
  const body = make("div", "node-body");
  const generating = pending.has(n.id) || (current && ["queued", "running"].includes(current.status));
  const generationLabel = pending.has(n.id) ? "正在提交" : statusName(current?.status);
  el.setAttribute("aria-busy", String(!!generating));
  if (!hasResult && n.type !== "text") {
    const placeholder = make("div", "node-placeholder");
    placeholder.append(
      icon(n.type),
      make("strong", "", n.type === "video" ? "视频生成" : "图片生成"),
      make("small", "", n.prompt || ""),
    );
    body.append(placeholder);
    if (n.type === "image") placeholder.append(iconButton("上传参考图片", "upload", () => chooseReplacement(n)));
    if (generating) {
      placeholder.classList.add("generating-placeholder");
      placeholder.replaceChildren(generationLoader(generationLabel));
    }
    if (current && !["queued", "running"].includes(current.status)) {
      const state = make(
        "span",
        "node-state" + (current.status === "failed" ? " error" : ""),
        statusName(current.status),
      );
      body.append(state);
    }
  }
  if (hasResult) {
    const v = version(n);
    const media = make(v.kind === "video" ? "video" : "img", "node-media");
    if (v.kind === "image") media.addEventListener("load", () => {
      el.style.width = Math.min(360, 240 * media.naturalWidth / media.naturalHeight) + "px";
      drawEdges();
      requestAnimationFrame(() => ensureNodeVisible(n));
    });
    media.src =
      v.kind === "video" ? mediaURL(v) : thumb({ ...v, url: mediaURL(v) });
    if (v.kind === "video") {
      media.controls = false;
      media.preload = "metadata";
      nodeMediaObserver.observe(media);
      media.muted = true;
      media.playsInline = true;
      media.addEventListener("pointerdown", (e) => {
        if (pickTarget) return;
        if (!selected.has(n.id) || e.shiftKey) selectNode(n.id, e.shiftKey);
      });
    } else {
      media.alt = n.name;
      media.loading = "lazy";
      media.decoding = "async";
      media.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        previewVersions([v]);
      });
    }
    const stage = make("div", "generation-stage"); stage.append(media);
    if (v.kind === "video") attachVideoControls(stage, media, n, v);
    if (generating) stage.append(generationLoader(generationLabel));
    body.append(stage);
    const versions = make("div", "version-row");
    if (n.source && n.versions.length === 1)
      versions.append(
        make("span", "", v.kind === "video" ? "视频素材" : "图片素材"),
      );
    else
      versions.append(
        selector(
          n.versions.map((item, i) => [
            item.id,
            `版本 ${String(i + 1).padStart(2, "0")} · ${new Date(item.createdAt || Date.now()).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
          ]),
          v.id,
          (value) => {
            checkpoint();
            n.currentVersion = value;
            touch();
            render();
          },
          "version-picker",
        ),
      );
    if (false)
      versions.append(make("span", "adopted-badge", "✓ 已采用"));
    else if (
      current &&
      ["queued", "running", "paused"].includes(current.status)
    )
      versions.append(
        make("span", "adopted-badge", statusName(current.status)),
      );
    else if (!n.source)
      versions.append(
        make(
          "span",
          "",
          `${n.versions.length} 个版本`,
        ),
      );
    body.append(versions);
    const actions = make("div", "result-actions");
    if (v.kind === "image")
      actions.append(
        iconButton("修改图片", "edit", () => derive(n, "image")),
        iconButton("生成视频", "video", () => derive(n, "video")),
        iconButton("重新上传", "upload", () => chooseReplacement(n)),
      );
    else
      actions.append(
        iconButton("提取尾帧", "frame", () => extractFrame(n, "last")),
        iconButton("尾帧续接", "link", () => extractFrame(n, "last", 0, true)),
      );
    actions.append(iconButton("收藏灵感", "check", () => collectInspiration(n)));
    const extra = [
      ["放大预览", () => previewVersions([v])],
      ["比较最近版本", () => previewVersions(n.versions.slice(-4))],
      ["查看生成参数", () => versionDetails(v)],
    ];
    if (v.kind === "video")
      extra.push(
        ["提取首帧", () => extractFrame(n, "first")],
        ["提取当前帧", () => extractFrame(n, "current", media.currentTime)],
        [
          "前移一帧",
          () => (media.currentTime = Math.max(0, media.currentTime - 1 / 30)),
        ],
        [
          "后移一帧",
          () =>
            (media.currentTime = Math.min(
              media.duration,
              media.currentTime + 1 / 30,
            )),
        ],
      );
    extra.push(["收录到角色库", () => collectNode(n, "character")], ["收录到场景库", () => collectNode(n, "scene")]);
    extra.push([
      "下载原文件",
      () =>
        download(mediaURL(v), n.name + (v.kind === "video" ? ".mp4" : ".png")),
    ]);
    actions.append(actionMenu("更多操作", extra, "more-actions"));
    body.append(actions);
    if (v.sourceFrame)
      body.append(
        button(
          `来源：${v.sourceFrame.name} · ${v.sourceFrame.time.toFixed(3)}s`,
          () =>
            node(v.sourceFrame.nodeId)
              ? focusNodes([node(v.sourceFrame.nodeId)])
              : previewVersions([v.sourceFrame.version]),
          "subtle frame-source",
        ),
      );
  }
  if (!n.source) body.append(buildGenerationEditor(n));
  el.append(body);
  const footer = make("footer", "node-footer");
  const shot = selector(
    [
      ["", "关联镜头"],
      ...board().shots.map((s, i) => [
        s.id,
        `${String(i + 1).padStart(2, "0")} · ${s.name}`,
      ]),
    ],
    n.shotId,
    (id) => {
      checkpoint();
      n.shotId = id;
      touch();
      renderShots();
    },
  );
  shot.setAttribute("aria-label", "关联镜头");
  footer.append(shot);
  const drag = make("span", "drag-ref", "引用 ↗");
  drag.title = "拖到其他节点的参考区";
  drag.draggable = true;
  drag.addEventListener("dragstart", (e) =>
    e.dataTransfer.setData("application/studio-node", n.id),
  );
  footer.append(drag);
  el.append(footer);
  return el;
}
function bindReferenceSort(handle, chip, list, n, ref) {
  handle.addEventListener("keydown", e => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const from = n.refs.indexOf(ref), to = from + (e.key === "ArrowLeft" ? -1 : 1);
    if (to < 0 || to >= n.refs.length) return;
    checkpoint(); n.refs.splice(from, 1); n.refs.splice(to, 0, ref); touch(); render();
    document.querySelector(`[data-reference-id="${ref.id}"] .ref-sort-handle`)?.focus();
  });
  handle.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const original = [...n.refs]; let changed = false, lastSwap = 0;
    const startX = e.clientX, startY = e.clientY;
    chip.classList.add("sorting-reference");
    const move = ev => {
      if (Math.hypot(ev.clientX-startX, ev.clientY-startY) < 10 || performance.now()-lastSwap < 220) return;
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".ref-chip");
      if (!target || target === chip || target.parentElement !== list) return;
      const bounds = target.getBoundingClientRect();
      if (ev.clientX < bounds.left + bounds.width*.25 || ev.clientX > bounds.right-bounds.width*.25) return;
      lastSwap = performance.now();
      const cards = [...list.querySelectorAll(".ref-chip")];
      const before = new Map(cards.map(el => [el, el.getBoundingClientRect()]));
      const forward = cards.indexOf(target) > cards.indexOf(chip);
      list.insertBefore(chip, forward ? target.nextSibling : target);
      changed = true;
      [...list.querySelectorAll(".ref-chip")].forEach((el, i) => {
        el.querySelector(".ref-sort-handle").textContent = String(i + 1).padStart(2, "0");
        const old = before.get(el), now = el.getBoundingClientRect();
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
          el.animate([{transform:`translate(${old.left-now.left}px,${old.top-now.top}px)`},{transform:"none"}],{duration:180,easing:"cubic-bezier(.2,.8,.2,1)"});
      });
    };
    const finish = ev => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish);
      chip.classList.remove("sorting-reference");
      if (changed && ev.type === "pointerup") {
        checkpoint(); n.refs = [...list.querySelectorAll(".ref-chip")].map(el => original.find(r => r.id === el.dataset.referenceId)); touch();
      } else if (changed) {
        original.forEach((r, i) => {
          const card = [...list.querySelectorAll(".ref-chip")].find(el => el.dataset.referenceId === r.id);
          card.querySelector(".ref-sort-handle").textContent = String(i + 1).padStart(2, "0");
          list.insertBefore(card, list.querySelector(".add-ref"));
        });
      }
      if (changed) render();
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish);
  });
}
function cost(n) {
  if (
    n.profile === "lingganya-gpt-image-2.5-sunburst-special" &&
    pricing?.sunburst != null
  )
    return `预计 ${pricing.sunburst} 积分 / 张 · 以账单为准`;
  if (n.profile === "lingganya-sd-2.0-mini" && pricing?.mini != null)
    return `预计 ${pricing.mini * Number(n.duration)} 积分 · ${pricing.mini}/秒`;
  return "暂无可靠报价 · 费用以供应商账单为准";
}
function compatibility(n) {
  const m = MODELS[n.profile];
  if (!m) return "模型已移除，请重新选择；引用已保留";
  const waiting = (n.refs || []).filter(ref => ref.awaiting);
  if (waiting.length) return "等待上游：" + waiting.map(ref => ref.name).join("、");
  const refs = n.refs || [],
    images = refs.filter((r) => r.kind === "image"),
    videos = refs.filter((r) => r.kind === "video");
  if (images.length > m.images)
    return `参考图片超过当前工作台上限 ${m.images} 张，请手动调整`;
  if (videos.length > m.videos)
    return `当前模型不支持这 ${videos.length} 段视频参考，请先移除或换模型`;
  if (n.profile === "lingganya-sd-2.0-mini" && videos.length && !images.length)
    return "SD Mini 使用视频参考时需要同时添加图片";
  return "";
}
function binding(source) {
  if (source.type === "text")
    return {
      id: uid(),
      nodeId: source.id,
      name: source.name,
      kind: "text",
      text: source.prompt,
      versionId: source.prompt?.trim() ? uid() : "",
      awaiting: !source.prompt?.trim(),
      role: "文本上下文",
    };
  const v = version(source);
  if (!v) return {
    id: uid(), nodeId: source.id, name: source.name, kind: source.type,
    versionId: "", awaiting: true,
    role: source.type === "video" ? "动作参考" : "图片参考",
  };
  return {
    ...clone(v),
    id: uid(),
    versionId: v.id,
    nodeId: source.id,
    name: source.name,
    role: v.kind === "video" ? "动作参考" : "图片参考",
    url: mediaURL(v),
  };
}
function resolvePendingReferences(nodes) {
  const sources = new Map(nodes.map(n => [n.id, n]));
  let changed = false;
  for (const target of nodes) target.refs = (target.refs || []).map(ref => {
    if (!ref.awaiting) return ref;
    const source = sources.get(ref.nodeId);
    if (!source || (source.type === "text" ? !source.prompt?.trim() : !version(source))) return ref;
    changed = true;
    return { ...binding(source), id: ref.id, role: ref.role, awaiting: false };
  });
  return changed;
}
function addReference(target, source) {
  if (
    !target ||
    target.source ||
    target.type === "text" ||
    target.type === "group"
  )
    throw new Error("请连接到一个图片或视频生成节点");
  if (target.id === source.id) throw new Error("节点不能引用自身");
  const ref = binding(source);
  if (
    target.refs.some(
      (r) => r.nodeId === ref.nodeId && r.versionId === ref.versionId,
    )
  ) {
    toast("已引用这个素材版本");
    return;
  }
  checkpoint();
  target.refs.push(ref);
  selected = new Set([target.id]);
  touch();
  render();
  requestAnimationFrame(() => ensureNodeVisible(target));
}
function endPick() {
  pickTarget = null;
  $("#reference-mode").hidden = true;
}
function showMentions(n, input, browse = false) {
  if(input._rich){input._rich.browse();return;}
  const before = input.value.slice(0, input.selectionStart),
    match = before.match(/@([^@\s]*)$/) || (browse ? ["", ""] : null);
  const menu = $("#mention-menu");
  if (!match) {
    menu.hidden = true;
    return;
  }
  const candidates = board().nodes.filter(
    (x) =>
      x.id !== n.id &&
      x.type !== "group" &&
      x.name.toLowerCase().includes(match[1].toLowerCase()),
  );
  menu.replaceChildren();
  for (const source of candidates) {
    const b = button("", () => {
      const cursor = input.selectionStart;
      const replacement = "@" + source.name + " ";
      n.prompt =
        input.value.slice(0, cursor - match[0].length) +
        replacement +
        input.value.slice(cursor);
      addReference(n, source);
      touch();
      render();
      menu.hidden = true;
      const editor = $("#nodes").querySelector(`[data-id="${n.id}"] textarea`);
      if (editor) {
        editor.focus({ preventScroll: true });
        const next = cursor - match[0].length + replacement.length;
        editor.setSelectionRange(next, next);
      }
    });
    b.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        const candidates = [...menu.querySelectorAll("button")],
          index = candidates.indexOf(b);
        candidates[
          (index + (e.key === "ArrowDown" ? 1 : -1) + candidates.length) %
            candidates.length
        ]?.focus();
      } else if (e.key === "Escape") {
        menu.hidden = true;
        input.focus({ preventScroll: true });
      }
    });
    const v = version(source);
    if (v?.kind === "image") {
      const img = make("img");
      img.src = thumb(v);
      b.append(img);
    }
    const label = make("span", "", source.name);
    label.append(make("small", "", v ? "当前版本" : source.type === "text" ? (source.prompt?.trim() ? "文本快照" : "待填写") : "待生成"));
    b.append(label);
    menu.append(b);
  }
  if (!candidates.length)
    menu.append(
      make("div", "menu-note", "没有匹配的节点"),
    );
  const r = input.getBoundingClientRect();
  menu.style.left = Math.min(r.left, innerWidth - 285) + "px";
  menu.style.top = Math.min(r.bottom + 3, innerHeight - 300) + "px";
  menu.hidden = false;
}
let edgeFrame, selectedEdge = null;
function disconnectEdge(n, ref) {
  checkpoint();
  if (ref.extracted) { const v = version(n); if (v) delete v.sourceFrame; }
  else {
    n.refs = n.refs.filter(r => r !== ref);
    if (!n.refs.some(r => r.name === ref.name)) n.prompt = removeImageMention(n.prompt || '', ref.name);
  }
  selectedEdge = null;
  touch(); render();
}

function removeImageMention(text, name) {
  return text.replace(new RegExp('@' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (/^图片\d+$/.test(name) ? '(?!\\d)' : ''), 'g'), '');
}
function imageMentionCandidates(target) {
  const images = board().nodes.filter(x => version(x)?.kind === 'image');
  let serial = Math.max(0, ...board().nodes.map(x => Number((x.referenceName || '').match(/^图片(\d+)$/)?.[1] || 0)), board().imageReferenceSerial || 0);
  for (const x of images) if (!x.referenceName) x.referenceName = '图片' + (++serial);
  board().imageReferenceSerial = serial;
  return images.filter(x => x.id !== target.id).map(x => ({id:x.id,name:x.referenceName,url:thumb(version(x))}));
}
function drawEdges() {
  if (edgeFrame) return;
  edgeFrame = requestAnimationFrame(() => { edgeFrame = 0; paintEdges(); });
}
function paintEdges() {
  const svg = $("#edges"); svg.querySelectorAll(".edge-hit,.edge-flow").forEach(p => p.remove()); const previous = new Map([...svg.querySelectorAll("[data-edge]")].map(p => [p.dataset.edge, p]));
  for (const n of board().nodes) {
    if (hiddenNode(n)) continue;
    const sourceFrame = version(n)?.sourceFrame;
    const links = [...(n.refs || [])];
    if (sourceFrame && !links.some((r) => r.nodeId === sourceFrame.nodeId))
      links.push({ nodeId: sourceFrame.nodeId, extracted: true });
    for (const ref of links) {
      const source = node(ref.nodeId);
      if (!source || hiddenNode(source)) continue;
      const key = `${n.id}:${ref.id || ref.nodeId}:${ref.extracted || false}`;
      const p = previous.get(key) || document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.dataset.edge = key; previous.delete(key);
      p.setAttribute("d", connectionPath(connectionAnchor(source), connectionAnchor(n, true)));
      p.setAttribute(
        "class",
        "edge" +
          (selectedEdge?.key === key ? " edge-selected" : "") + (ref.extracted ? " extracted" : "") + (ref.awaiting ? " awaiting" : "") +
          (selected.has(n.id) || selected.has(source.id) ? " highlight" : ""),
      );
      if (!p.isConnected) svg.append(p);
      const current = tasksByNode.get(`${boardId}:${n.id}`)?.[0];
      if (pending.has(n.id) || (current && ["queued", "running"].includes(current.status))) {
        const flow = p.cloneNode(); flow.removeAttribute("data-edge"); flow.setAttribute("class", "edge edge-flow"); flow.setAttribute("pathLength", "100"); svg.append(flow);
      }
      const hit = p.cloneNode(); hit.removeAttribute("data-edge"); hit.setAttribute("class", "edge-hit");
      hit.setAttribute("tabindex", "0"); hit.setAttribute("role", "button"); hit.setAttribute("aria-label", `${source.name} → ${n.name}，按 Delete 断开引用`);
      hit.onpointerdown = e => {e.stopPropagation();};
      hit.onclick = e => {e.stopPropagation(); selected.clear(); selectedEdge={key,n,ref}; drawEdges();};
      hit.oncontextmenu = e => {e.preventDefault();e.stopPropagation();selectedEdge={key,n,ref};drawEdges();CanvasUI.menu([{label:"断开引用",danger:true,action:()=>disconnectEdge(n,ref)}],{point:{x:e.clientX,y:e.clientY},label:"连线操作"});};
      hit.onkeydown = e => {if (["Delete","Backspace"].includes(e.key)){e.preventDefault();e.stopPropagation();disconnectEdge(n,ref);}};
      svg.append(hit);
    }
  }
  previous.forEach(p => p.remove());
  drawMini();
}
function drawMini() {
  if (!board() || $("#minimap").hidden) return;
  const mini = $("#minimap");
  mini.replaceChildren();
  const ns = board().nodes.filter((n) => !hiddenNode(n));
  if (!ns.length) return;
  const minX = Math.min(...ns.map((n) => n.x)),
    minY = Math.min(...ns.map((n) => n.y)),
    maxX = Math.max(...ns.map((n) => n.x + NODE_WIDTH)),
    maxY = Math.max(...ns.map((n) => n.y + 350)),
    scale = Math.min(160 / (maxX - minX || 1), 90 / (maxY - minY || 1));
  for (const n of ns) {
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("x", 10 + (n.x - minX) * scale);
    r.setAttribute("y", 10 + (n.y - minY) * scale);
    r.setAttribute("width", Math.max(4, NODE_WIDTH * scale));
    r.setAttribute("height", Math.max(3, 260 * scale));
    r.setAttribute("fill", selected.has(n.id) ? "var(--accent)" : "#77867c");
    r.addEventListener("click", (e) => {
      e.stopPropagation();
      focusNodes([n]);
    });
    mini.append(r);
  }
}
function ensureNodeVisible(n) {
  if (!n || selected.size !== 1 || !selected.has(n.id) || $("#viewport").hidden)
    return;
  const el = $("#nodes").querySelector(`[data-id="${n.id}"]`);
  if (!el) return;
  const viewport = $("#viewport").getBoundingClientRect();
  let r = el.getBoundingClientRect();
  const v = board().view;
  const originalZoom = v.z;
  const top = viewport.top + 90,
    bottom = Math.min(viewport.bottom - 20, $(".creation-dock").getBoundingClientRect().top - 18);
  const left = $("#library-dialog").open ? $("#library-dialog").getBoundingClientRect().right + 24 : 35;
  const headroom = 30;
  const composer = el.querySelector(".generation-editor");
  const composerRect = composer && getComputedStyle(composer).display !== "none" ? composer.getBoundingClientRect() : null;
  const upper = r.top - headroom * v.z;
  const dx =
    r.left < left
      ? left - r.left
      : r.right > viewport.right - 35
        ? viewport.right - 35 - r.right
        : 0;
  const dy =
    upper < top ? top - upper : composerRect && composerRect.bottom > bottom ? Math.max(top-upper, bottom-composerRect.bottom) : 0;
  if (dx || dy) {
    v.x += dx;
    v.y += dy;
    applyView();
  }
  if (dx || dy || v.z !== originalZoom) rememberView();
}
function focusNodes(ns) {
  if (!ns.length) return;
  const r = $("#viewport").getBoundingClientRect();
  const left = Math.min(...ns.map((n) => n.x)),
    top = Math.min(
      ...ns.map(
        (n) => n.y - (selected.has(n.id) && n.versions?.length ? 85 : 40),
      ),
    ),
    right = Math.max(...ns.map((n) => n.x + (n.width || NODE_WIDTH))),
    bottom = Math.max(
      ...ns.map(
        (n) =>
          n.y +
          ($("#nodes").querySelector(`[data-id="${n.id}"]`)?.offsetHeight ||
            400),
      ),
    );
  const reserved = $("#library-dialog").open ? $("#library-dialog").getBoundingClientRect().right + 20 : 0;
  const z = Math.min(
    1.1,
    Math.max(
      0.15,
      Math.min(
        (r.width - reserved - 100) / (right - left),
        (r.height - 250) / (bottom - top),
      ),
    ),
  );
  board().view = {
    z,
    x: reserved + (r.width - reserved - (right - left) * z) / 2 - left * z,
    y: 130 + (r.height - 250 - (bottom - top) * z) / 2 - top * z,
  };
  applyView();
  rememberView();
}
function zoom(factor, x, y) {
  const r = $("#viewport").getBoundingClientRect();
  x ??= r.left + r.width / 2;
  y ??= r.top + r.height / 2;
  const p = worldPoint(x, y),
    v = board().view;
  v.z = Math.max(0.15, Math.min(2, v.z * factor));
  v.x = x - r.left - p.x * v.z;
  v.y = y - r.top - p.y * v.z;
  applyView();
  rememberView();
}
function startMove(e, n) {
  if (
    CanvasUI.isEditing(e.target) ||
    e.button !== 0 ||
    e.target.closest("button,summary,details") ||
    space ||
    pickTarget
  )
    return;
  e.stopPropagation();
  if (!selected.has(n.id) || e.shiftKey) selectNode(n.id, e.shiftKey);
  if (!selected.has(n.id)) return;
  window.dragging = true;
  let moved = false;
  const start = { x: e.clientX, y: e.clientY };
  const ids = new Set(selected);
  for (const id of selected) {
    const g = node(id);
    if (g?.type === "group") g.members?.forEach((id) => ids.add(id));
  }
  const initial = [...ids]
    .map((id) => node(id))
    .filter(Boolean)
    .map((n) => ({ n, x: n.x, y: n.y }));
  const paintMove = (ev) => {
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4)
      return;
    if (!moved) {
      checkpoint();
      moved = true;
    }
    const dx = (ev.clientX - start.x) / board().view.z,
      dy = (ev.clientY - start.y) / board().view.z;
    initial.forEach(({ n, x, y }) => {
      n.x = x + dx;
      n.y = y + dy;
      const el = $("#nodes").querySelector(`[data-id="${n.id}"]`);
      if (el) {
        el.style.left = n.x + "px";
        el.style.top = n.y + "px";
      }
    });
    drawEdges();
  };
  let movementFrame = 0, latestMove;
  const move = (ev) => { latestMove = ev; if (!movementFrame) movementFrame = requestAnimationFrame(() => { movementFrame = 0; paintMove(latestMove); }); };
  const up = () => {
    if (movementFrame) { cancelAnimationFrame(movementFrame); movementFrame = 0; paintMove(latestMove); }
    window.dragging = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (moved) touch();
    else if (selected.size === 1) ensureNodeVisible(n);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
function connectionPath(from, to) {
  const bend = Math.min(260, Math.max(64, Math.abs(to.x - from.x) * .45));
  return `M${from.x},${from.y} C${from.x + bend},${from.y} ${to.x - bend},${to.y} ${to.x},${to.y}`;
}
function connectionAnchor(n, input = false) {
  const el = $("#nodes").querySelector(`[data-id="${n.id}"] .port${input ? ".in" : ":not(.in)"}`);
  if (el) {
    // Port offsets are in board coordinates even before the view's next paint.
    // Reading screen rectangles here mixes old transforms with the new view.
    const parent = el.offsetParent;
    return {
      x: n.x + (parent?.clientLeft || 0) + el.offsetLeft + el.offsetWidth / 2,
      y: n.y + (parent?.clientTop || 0) + el.offsetTop + el.offsetHeight / 2,
    };
  }
  return { x: n.x + (input ? 0 : NODE_WIDTH), y: n.y + 110 };
}
function connectionMenu(source, point, ghost, input = false) {
  const position = worldPoint(point.x, point.y);
  const create = type => {
    if (!input) return derive(source, type, { x: position.x + 18, y: position.y - 110 });
    checkpoint();
    const upstream = createNode(type, { x: position.x - NODE_WIDTH - 18, y: position.y - 110 }, {}, true, true);
    source.refs.push(binding(upstream));
    selected = new Set([upstream.id]); touch(); render();
    requestAnimationFrame(() => ensureNodeVisible(upstream));
    return upstream;
  };
  return CanvasUI.menu([
    { label: "图片生成", glyph: "▧", action: () => create("image") },
    { label: "视频生成", glyph: "▷", action: () => create("video") },
    ...(input ? [{ label: "文本", glyph: "T", action: () => create("text") }] : []),
    ...(!input && version(source)?.kind === "video" ? [null,
      { label: "提取尾帧", action: () => extractFrame(source, "last") },
      { label: "尾帧续接", action: () => extractFrame(source, "last", 0, true) },
    ] : []),
  ], { point, label: input ? "创建参考节点" : "创建下游节点", onClose: () => ghost?.remove() });
}
let cancelConnection = null;
function startConnection(e, source, input = false) {
  if (e.button !== 0) return;
  e.stopPropagation(); e.preventDefault();
  cancelConnection?.(); CanvasUI.close();
  const handle = e.currentTarget, pointerId = e.pointerId;
  handle.setPointerCapture?.(pointerId);
  document.body.classList.add("connecting");
  const ghost = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "edge connection-preview");
  const tip = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  tip.setAttribute("class", "connection-tip"); tip.setAttribute("r", "4");
  ghost.append(path, tip);
  $("#edges").append(ghost);
  let frame = 0, hovered = null, latest = { x: e.clientX, y: e.clientY };
  const paint = () => {
    frame = 0;
    const candidate = document.elementFromPoint(latest.x, latest.y)?.closest(".node");
    const target = candidate && node(candidate.dataset.id);
    const valid = target && target !== source && (input ? target.type !== "group" : !target.source && ["image", "video"].includes(target.type));
    if (hovered !== (valid ? candidate : null)) {
      hovered?.classList.remove("connection-target"); hovered = valid ? candidate : null;
      hovered?.classList.add("connection-target");
    }
    const end = valid ? connectionAnchor(target, !input) : worldPoint(latest.x, latest.y);
    const start = connectionAnchor(source, input);
    path.setAttribute("d", input ? connectionPath(end, start) : connectionPath(start, end));
    tip.setAttribute("cx", end.x); tip.setAttribute("cy", end.y);
  };
  const move = ev => {
    if (ev.pointerId !== pointerId) return;
    latest = { x: ev.clientX, y: ev.clientY };
    if (!frame) frame = requestAnimationFrame(paint);
  };
  const cleanup = (keepGhost = false) => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", cancel);
    if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
    hovered?.classList.remove("connection-target"); document.body.classList.remove("connecting");
    if (!keepGhost) ghost.remove(); cancelConnection = null;
  };
  const cancel = () => cleanup();
  const escape = ev => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); cancel(); } };
  const up = ev => {
    if (ev.pointerId !== pointerId) return;
    if (frame) cancelAnimationFrame(frame);
    latest = { x: ev.clientX, y: ev.clientY }; paint();
    const target = node(document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".node")?.dataset.id);
    cleanup(!target || target === source);
    if (target && target !== source) {
      try { input ? addReference(source, target) : addReference(target, source); } catch (error) { report(error); }
    } else connectionMenu(source, { x: ev.clientX, y: ev.clientY }, ghost, input);
  };
  cancelConnection = cancel;
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", escape, true); window.addEventListener("blur", cancel);
  paint();
}
function removeNodes(ids = [...selected]) {
  if (!ids.length) return;
  checkpoint();
  board().nodes = board().nodes.filter((n) => !ids.includes(n.id));
  selected.clear();
  touch();
  render();
  toast("节点已移除 · 可撤销");
}
function derive(source, type, point = { x: source.x + 440, y: source.y }) {
  const ref = binding(source);
  const n = createNode(type, point, {
    refs: [ref],
    shotId: source.shotId || activeShot,
    prompt: "",
  }, false, true);
  return n;
}
const submissionErrors = new Map();
async function submitNode(n) {
  if (pending.has(n.id)) return;
  const submittingBoard = boardId;
  pending.add(n.id); submissionErrors.delete(n.id); render();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try { await submitNodeRequest(n); }
  catch (error) {
    submissionErrors.set(n.id, {id:"local-"+n.id, node_id:n.id, board_id:submittingBoard, reference_bindings:clone(n.refs || []), ratio:n.ratio, resolution:n.resolution, duration:n.duration, kind:n.type, profile:n.profile, prompt:n.prompt, status:"failed", error:error.message || String(error), created_at:Date.now()/1000});
    renderTaskList(); if (!$("#task-dialog").open) $("#task-dialog").showModal();
  } finally { pending.delete(n.id); render(); }
}
function providerReferencePrompt(prompt, refs) {
  let images = 0, videos = 0;
  const media = refs.filter(r => r.kind !== "text").map(ref => ({
    ref, label: ref.kind === "video" ? `视频${++videos}` : `图片${++images}`,
  }));
  const choices = [...media].sort((a, b) => b.ref.name.length - a.ref.name.length);
  // Scan the original text once: generated labels must never be remapped.
  let result = "";
  for (let i = 0; i < prompt.length;) {
    const match = choices.find(({ref}) => prompt.startsWith("@" + ref.name, i) &&
      (!/^(图片|视频)\d+$/.test(ref.name) || !/\d/.test(prompt[i + ref.name.length + 1] || "")));
    if (match) { result += "@" + match.label; i += match.ref.name.length + 1; }
    else result += prompt[i++];
  }
  for (const ref of refs.filter(r => r.kind === "text")) result += "\n" + ref.name + "：" + ref.text;
  for (const {ref, label} of media) result += `\n${label}：${ref.name}，用途：${ref.role}。`;
  return result;
}
async function submitNodeRequest(n) {
  if (resolvePendingReferences(board().nodes)) touch();
  const bad = compatibility(n);
  if (bad) throw new Error(bad);
  if (!n.prompt.trim()) throw new Error("先描述这一镜头要生成的内容");
  if (/@[^\s，。；、]+/.test(n.prompt) && !n.refs.length)
    throw new Error("提示词里的 @ 还没有绑定素材，请从候选菜单选择");
  pending.add(n.id);
  const originalBoard = boardId;
  const originalNode = n;
  const refs = clone(n.refs);
  const snapshot = {
    prompt: n.prompt,
    profile: n.profile,
    ratio: n.ratio,
    resolution: n.resolution,
    duration: n.duration,
    refs,
  };
  const submissionId = n.pendingSubmission || uid();
  n.pendingSubmission = submissionId;
  n.lastSubmission = submissionId;
  touch();
  while (saving) await new Promise((r) => setTimeout(r, 50));
  await save();
  if (dirty) {
    pending.delete(n.id);
    throw new Error("请先恢复画板保存，再提交任务");
  }
  render();
  try {
    const form = new FormData();
    form.set("kind", n.type);
    form.set("profile", snapshot.profile);
    form.set("ratio", snapshot.ratio);
    form.set("resolution", snapshot.resolution);
    form.set("duration", snapshot.duration);
    form.set("board_id", originalBoard);
    form.set("node_id", n.id);
    form.set("submission_id", submissionId);
    form.set("reference_bindings", JSON.stringify(refs));
    const replayPrompt = n.replay?.displayPrompt === snapshot.prompt && JSON.stringify(n.replay?.refs) === JSON.stringify(snapshot.refs) ? n.replay.prompt : null;
    const prompt = replayPrompt ?? providerReferencePrompt(snapshot.prompt, refs);
    let imageIndex = 0,
      videoIndex = 0;
    for (const ref of refs) {
      if (ref.kind === "text") {
        continue;
      }
      if (ref.kind === "video") videoIndex++; else imageIndex++;
      const url = mediaURL(ref);
      if (!url?.startsWith("/media/"))
        throw new Error("素材缺少本地持久地址，请重新从素材库添加");
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(
          "无法读取参考素材：" + ref.name + "，请检查回收站或云存储",
        );
      const blob = await response.blob();
      const ext = blob.type.includes("jpeg")
        ? "jpg"
        : blob.type.includes("webp")
          ? "webp"
          : ref.kind === "video"
            ? "mp4"
            : "png";
      form.append(
        "references",
        blob,
        `reference-${imageIndex + videoIndex}.${ext}`,
      );
    }
    form.set("prompts", prompt);
    const result = await api("/api/tasks", { method: "POST", body: form });
    tasks = [...result.tasks, ...tasks.filter(t => !result.tasks.some(created => created.id === t.id))];
    rebuildTaskIndex();
    originalNode.pendingSubmission = "";
    originalNode.runs ??= [];
    originalNode.runs.push({
      taskId: result.tasks[0].id,
      snapshot,
      createdAt: Date.now(),
    });
    touch();
    toast("任务已提交，可继续整理画板");
    await poll();
  } finally {
    pending.delete(originalNode.id);
    render();
  }
}
async function resumeTask(task) {
  await api(`/api/tasks/${task.id}/resume`, { method: "POST" });
  await poll();
}
async function poll() {
  try {
    const data = await api("/api/tasks");
    tasks = data.tasks;
    rebuildTaskIndex();
    let mutated = false;
    for (const p of doc.projects)
      for (const b of p.boards)
        for (const n of b.nodes) {
          if (
            n.pendingSubmission &&
            tasks.some((t) => t.submission_id === n.pendingSubmission)
          ) {
            n.pendingSubmission = "";
            mutated = true;
          }
          const completed = (tasksByNode.get(`${b.id}:${n.id}`) || [])
            .filter(t => t.status === "completed")
            .slice().sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
          const newest = completed.at(-1);
          for (const t of completed) {
            if (n.versions?.some((v) => v.taskId === t.id)) continue;
            const url =
              t.kind === "image" ? t.local_image_url : t.local_video_url;
            if (!url) continue;
            const submitted = n.runs?.find(
              (run) => run.taskId === t.id,
            )?.snapshot;
            const v = {
              id: t.id,
              taskId: t.id,
              kind: t.kind,
              url,
              createdAt: t.finished_at * 1000,
              snapshot: submitted
                ? clone(submitted)
                : {
                    prompt: t.prompt,
                    profile: t.profile,
                    ratio: t.ratio,
                    resolution: t.resolution,
                    duration: t.duration,
                    refs: clone(t.reference_bindings || []),
                  },
            };
            n.versions ??= [];
            n.versions.push(v);
            // A late result from an older request must not replace a newer result
            // or a version the user has already selected.
            if (t.id === newest.id) n.currentVersion = v.id;
            mutated = true;
          }
        }
    for (const p of doc.projects) for (const b of p.boards)
      if (resolvePendingReferences(b.nodes)) mutated = true;
    if (mutated) touch();
    $("#task-count").textContent = tasks.filter((t) =>
      ["queued", "running", "paused"].includes(t.status),
    ).length;
    if ($("#task-dialog").open) renderTaskList();
    if (
      !document.activeElement.closest("textarea,input,select,[contenteditable=true],.rich-mentions") &&
      !window.dragging && !cancelConnection && !CanvasUI.isOpen
    ) {
      renderNodes();
      drawEdges();
      renderShots();
      if (mutated && selected.size === 1)
        ensureNodeVisible(node([...selected][0]));
      if ($("#library-dialog").open && mutated) renderAssets();
    }
  } catch (e) {
    $("#task-count").title = e.message;
  }
}
const expandedTasks = new Set(), retryingTasks = new Set();
let taskListSignature = "";
function taskInputNode(t, source) {
  const snapshot = source?.runs?.find(run => run.taskId === t.id)?.snapshot;
  const bindings = clone(snapshot?.refs || t.reference_bindings || []);
  let fileIndex = 0;
  for (const ref of bindings) {
    if (ref.kind === "text") continue;
    const file = (t.reference_files || [])[fileIndex++];
    if (file?.url) { ref.url = file.url; delete ref.assetId; delete ref.taskId; }
  }
  if (!bindings.length) for (const [i, file] of (t.reference_files || []).entries()) bindings.push({
    id: uid(), versionId: t.id + ":input:" + i, name: file.name || "参考图" + (i + 1),
    kind: file.mime?.startsWith("video/") ? "video" : "image", role: "参考", url: file.url,
  });
  const prompt = snapshot?.prompt ?? t.prompt ?? "";
  return {
    id: uid(), type: t.kind, name: (source?.name || "任务输入") + " · 复用",
    x: 0, y: 0, prompt, profile: snapshot?.profile || t.profile,
    ratio: snapshot?.ratio ?? t.ratio ?? "", resolution: snapshot?.resolution ?? t.resolution ?? "",
    duration: String(snapshot?.duration ?? t.duration ?? 5), refs: bindings, versions: [], runs: [],
    sourceTaskId: t.id, replay: { displayPrompt: prompt, prompt: t.prompt, refs: clone(bindings) },
  };
}
async function copyTaskInput(t, source) {
  copyBuffer = [taskInputNode(t, source)];
  try {
    await navigator.clipboard.writeText(CLIPBOARD_MARKER + JSON.stringify(copyBuffer));
    toast("已复制提示词、参数和输入素材引用，可在画板粘贴");
  } catch { toast("输入已复制，可在画板右键粘贴"); }
}
function reuseTaskInput(t, source) {
  const input = taskInputNode(t, source);
  const { x, y, ...settings } = input;
  const n = createNode(t.kind, centerPoint(), settings);
  touch(); render(); focusNodes([n]); $("#task-dialog").close();
  return n;
}
async function retryTaskInput(t, source) {
  if (retryingTasks.has(t.id)) return;
  retryingTasks.add(t.id); renderTaskList();
  try {
    if (!MODELS[t.profile]) throw new Error("原模型已停用，请复制输入到节点后选择模型");
    let n;
    // An uncertain submission retains its idempotency key; retry it instead of charging a new copy.
    for (const p of doc.projects) for (const b of p.boards) {
      const existing = b.nodes.find(item => item.sourceTaskId === t.id && item.pendingSubmission);
      if (existing) { projectId = p.id; if (boardId !== b.id) setBoard(b.id); n = existing; break; }
    }
    if (!n) n = reuseTaskInput(t, source);
    else { selected = new Set([n.id]); render(); focusNodes([n]); $("#task-dialog").close(); }
    await submitNode(n);
  } finally { retryingTasks.delete(t.id); renderTaskList(); }
}
function taskDetails(t, source) {
  const input = taskInputNode(t, source), panel = make("div", "task-detail");
  panel.append(make("small", "detail-label", "本次输入快照"), make("pre", "task-full-prompt", input.prompt));
  const params = make("div", "task-parameter-grid");
  for (const [label, value] of [["模型", MODELS[input.profile]?.name || input.profile], ["画幅", input.ratio], ["分辨率", input.resolution], ...(t.kind === "video" ? [["时长", input.duration + " 秒"]] : []), ["节点", source?.name || t.node_id || "—"], ["任务 ID", t.id]]) {
    const cell = make("div"); cell.append(make("small", "", label), make("span", "", value || "自动")); params.append(cell);
  }
  panel.append(params);
  if (input.refs.length) {
    panel.append(make("small", "detail-label", `输入素材 · ${input.refs.length}`));
    const refs = make("div", "task-input-assets");
    for (const ref of input.refs) {
      const card = make("div", "task-input-card");
      if (ref.kind !== "text" && mediaURL(ref)) {
        const media = make(ref.kind === "video" ? "video" : "img");
        media.src = mediaURL(ref); media.loading = "lazy"; media.alt = ref.name;
        card.append(media);
        if (ref.kind === "video") { media.preload = "metadata"; attachVideoControls(card,media,{id:uid(),name:ref.name||"参考视频",...centerPoint(),versions:[ref]},ref); }
      }
      card.append(make("span", "", ref.name || "参考素材"), make("small", "", ref.role || "参考")); refs.append(card);
    }
    panel.append(refs);
  }
  const outputURL = t.kind === "video" ? t.local_video_url : t.local_image_url;
  if (t.status === "completed" && outputURL) {
    const output = assets.find(a => a.task_id === t.id) || { name: source?.name || "生成结果", kind: t.kind, url: outputURL };
    const results = make("div", "task-result-actions");
    results.append(make("small", "detail-label", "生成结果"), button("预览结果", () => previewVersions([{ ...output, taskId: t.id }])), button("结果加入画板", () => {
      const n = assetNode(output); focusNodes([n]); $("#task-dialog").close();
    }));
    panel.append(results);
  }
  const actions = make("div", "task-detail-actions");
  actions.append(button("作为新节点", () => reuseTaskInput(t, source)), button("复制参数", async () => {
    await navigator.clipboard.writeText(JSON.stringify({ taskId: t.id, boardId: t.board_id, nodeId: t.node_id, input }, null, 2)); toast("参数与素材地址已复制");
  }));
  panel.append(actions);
  return panel;
}
function renderTaskList() {
  const list = $("#task-list");
  const signature = JSON.stringify([tasks, [...submissionErrors.values()], [...expandedTasks], [...retryingTasks], doc.projects.map(p => [p.name, p.boards.map(b => [b.name, b.nodes.map(n => [n.id, n.name])])])]);
  if (signature === taskListSignature) return;
  taskListSignature = signature;
  list.replaceChildren(
    ...[...submissionErrors.values(), ...tasks]
      .slice()
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 100)
      .map((t) => {
        const row = make("div", "task-row"),
          info = make("div", "task-info"),
          heading = make("div", "task-heading");
        let owner, origin, source;
        for (const p of doc.projects) {
          const b = p.boards.find((b) => b.id === t.board_id);
          if (b) {
            owner = p;
            origin = b;
            source = b.nodes.find((n) => n.id === t.node_id);
            break;
          }
        }
        heading.append(
          icon(t.kind),
          make(
            "strong",
            "",
            source?.name || (t.kind === "video" ? "视频任务" : "图片任务"),
          ),
          make("span", "task-status " + t.status, statusName(t.status)),
        );
        info.append(
          heading,
          make("p", "task-prompt", t.prompt),
          make(
            "small",
            "task-meta",
            [
              MODELS[t.profile]?.name || "",
              origin ? owner.name + " / " + origin.name : "生成控制台",
              new Date(t.created_at * 1000).toLocaleString("zh-CN", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
            ]
              .filter(Boolean)
              .join(" · "),
          ),
        );
        if (t.error) info.append(make("p", "task-error", t.error));
        const actions = make("div", "task-actions");
        if (source)
          actions.append(
            button("定位节点", () => {
              projectId = owner.id;
              if (boardId !== origin.id) setBoard(origin.id);
              setWorkspaceView(false);
              selected = new Set([source.id]);
              render();
              focusNodes([source]);
              $("#task-dialog").close();
            }),
          );
        actions.append(button(expandedTasks.has(t.id) ? "收起详情" : "展开详情", () => {
          expandedTasks.has(t.id) ? expandedTasks.delete(t.id) : expandedTasks.add(t.id); renderTaskList();
        }));
        actions.append(button("复制完整输入", () => copyTaskInput(t, source)));
        if (t.status === "paused") actions.append(button("继续查询", () => resumeTask(t)));
        if (t.status === "failed") {
          const retry = button(retryingTasks.has(t.id) ? "正在提交…" : "重新生成", () => retryTaskInput(t, source));
          retry.disabled = retryingTasks.has(t.id) || !MODELS[t.profile];
          retry.title = MODELS[t.profile] ? "使用本次输入创建新的付费任务" : "原模型已停用，请复制输入后选择模型";
          actions.append(retry);
        }
        row.append(info, actions);
        if (expandedTasks.has(t.id)) row.append(taskDetails(t, source));
        return row;
      }),
  );
  if (!tasks.length)
    list.append(
      make(
        "p",
        "task-empty",
        "还没有生成任务",
      ),
    );
}
function rememberAsset(asset) {
  const index = assets.findIndex(a => a.id === asset.id);
  if (index < 0) assets.push(asset); else assets[index] = asset;
  rebuildAssetIndex();
  return asset;
}
async function importAsset(file) {
  const form = new FormData();
  form.append("media", file, file.name || "粘贴图片.png");
  const result = await api("/api/library/assets", { method: "POST", body: form });
  return rememberAsset(result.asset);
}
async function uploadFiles(files, point = centerPoint(), options = {}) {
  const accepted = [...files].filter(file => /^(image|video)\//.test(file.type));
  if (!accepted.length) throw new Error("请选择或粘贴图片、视频素材");
  const origin = board();
  let completed = 0;
  for (const [i, file] of accepted.entries()) {
    toast(`正在导入 ${i + 1} / ${accepted.length}…`);
    let asset = await importAsset(file);
    if (options.category) asset = await updateAssetMetadata(asset, { category: options.category, included: true }, false);
    if (!options.libraryOnly) {
      const position = { x: point.x + i * 400, y: point.y };
      if (board() === origin) assetNode(asset, position);
      else {
        origin.nodes.push({ id: uid(), type: asset.kind, source: true, name: asset.name, ...position, refs: [], prompt: "", versions: [{ id: uid(), assetId: asset.id, kind: asset.kind, url: asset.url, createdAt: Date.now() }] });
        touch();
      }
    }
    completed++;
  }
  if ($("#library-dialog").open) renderAssets();
  if ($("#asset-picker-dialog").open) renderPicker();
  toast(`已导入 ${completed} 个素材${options.category ? "到" + scopeName(options.category) : options.libraryOnly ? "到素材库" : "到画板"}`);
}
function assetNode(asset, point = centerPoint(), defer = false) {
  return createNode(asset.kind, point, {
    source: true, name: asset.name,
    versions: [{ id: uid(), assetId: asset.id, kind: asset.kind, url: asset.url, createdAt: Date.now() }],
  }, defer);
}
let replacingImage = null;
const replacementUploads = new Set();
const nodeMediaObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.preload = "metadata"; nodeMediaObserver.unobserve(entry.target); }
  });
}, { root: $("#viewport"), rootMargin: "250px" });
function chooseReplacement(n) {
  replacingImage = { n, origin: board() };
  $("#replace-image").value = "";
  $("#replace-image").click();
}
async function replaceImage(file, target) {
  if (!file || !file.type.startsWith("image/")) throw new Error("请选择一张图片");
  const { n, origin } = target;
  replacementUploads.add(n.id);
  render();
  try {
    const asset = await importAsset(file);
    if (!origin.nodes.includes(n)) { toast("原节点已移除，新图片已保留在素材库"); return; }
    if (board() === origin) checkpoint();
    const v = { id: uid(), assetId: asset.id, kind: "image", url: asset.url, createdAt: Date.now() };
    n.versions ??= [];
    n.versions.push(v);
    n.currentVersion = v.id;
    touch();
    toast("图片已更新，旧版本和已有引用均已保留");
  } finally { replacementUploads.delete(n.id); render(); }
}
const scopeName = scope => ({ board: "当前画板", character: "角色库", scene: "场景库" })[scope] || "素材库";
let assetScope = "board", assetSort = "recent", pickerScope = "", libraryLoading = null;
async function refreshLibrary() {
  if (!libraryLoading) libraryLoading = api("/api/library").then(data => { assets = data.assets; rebuildAssetIndex(); }).finally(() => libraryLoading = null);
  return libraryLoading;
}
async function openLibrary(scope) {
  if (scope) assetScope = scope;
  if (!$("#library-dialog").open) {
    assetSelection(false).clear(); assetSelectionModes.delete(assetSelectionKey(false));
    $("#library-dialog").show();
  }
  renderAssets();
  await refreshLibrary();
  if ($("#library-dialog").open) renderAssets();
}
function setAssetScope(scope) {
  assetSelection(false).clear(); assetSelectionModes.delete(assetSelectionKey(false));
  assetScope = scope;
  assetSelection(false).clear(); assetSelectionModes.delete(assetSelectionKey(false));
  $("#asset-search").value = "";
  $("#asset-kind").value = "";
  CanvasUI.enhance($("#library-dialog"));
  renderAssets(true);
}
async function updateAssetMetadata(asset, change, notify = true) {
  const { asset: updated } = await api(`/api/library/assets/${asset.id}/metadata`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change),
  });
  rememberAsset(updated);
  if (!assetBatchBusy && $("#library-dialog").open) renderAssets();
  if (!assetBatchBusy && $("#asset-picker-dialog").open) renderPicker();
  if (notify) toast(change.category ? `${change.included ? "已收录到" : "已移出"}${scopeName(change.category)}${change.included ? "，可跨画板复用" : "，源文件保留"}` : "素材名称已更新");
  return updated;
}
async function collectNode(n, category) {
  const v = version(n);
  if (!v) throw new Error("先上传或生成一张图片，再收录到素材库");
  await refreshLibrary();
  const asset = assetById.get(v.assetId) || assets.find(a => (v.taskId && a.task_id === v.taskId) || a.url === v.url);
  if (!asset) throw new Error("未找到源素材，请重新上传后收录");
  await updateAssetMetadata(asset, { category, included: true });
}
function renameAsset(asset) {
  editDialog("重命名素材", [["name", "素材名称", "text", asset.name]], values => {
    updateAssetMetadata(asset, { name: values.name }).catch(report);
  });
}
function libraryEntries() {
  if (assetScope === "board") return board().nodes.filter(n => n.type !== "group").map(n => ({
    id: n.id, name: n.name, kind: n.type, url: mediaURL(version(n)), prompt: n.prompt, node: n,
    created_at: (version(n)?.createdAt || 0) / 1000,
  }));
  return assets.filter(a => a.categories?.includes(assetScope));
}
function filterAssets(entries, query, kind = "") {
  const q = query.trim().toLocaleLowerCase();
  const filtered = entries.filter(a => (!kind || a.kind === kind) && (!q || [a.name, a.prompt, taskById.get(a.task_id)?.prompt].join(" ").toLocaleLowerCase().includes(q)));
  if (assetSort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  else filtered.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  return filtered;
}
// Window the grid, including its media elements. Even thousands of assets mount only visible rows.
class AssetGrid {
  constructor(root, columns) {
    this.root = root; this.columns = columns; this.entries = []; this.key = ""; this.frame = 0;
    root.addEventListener("scroll", () => this.schedule(), { passive: true });
    new ResizeObserver(() => this.schedule()).observe(root);
  }
  schedule() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); }); }
  set(entries, draw, empty, reset = false) {
    this.entries = entries; this.draw = draw;
    const top = reset ? 0 : this.root.scrollTop;
    this.root.replaceChildren(); this.key = "";
    if (!entries.length) { this.root.append(empty); return; }
    this.space = make("div", "asset-grid-space");
    this.window = make("div", "asset-grid-window");
    this.space.append(this.window); this.root.append(this.space);
    this.root.scrollTop = top;
    this.paint();
    this.root.scrollTop = top;
    this.schedule();
  }
  paint() {
    if (!this.entries.length || !this.root.clientHeight || !this.space?.isConnected) return;
    const cols = this.columns(), rowHeight = 204;
    const rows = Math.ceil(this.entries.length / cols);
    this.space.style.height = rows * rowHeight + "px";
    const start = Math.max(0, Math.min(rows - 1, Math.floor(this.root.scrollTop / rowHeight)) - 2);
    const end = Math.min(rows, Math.ceil((this.root.scrollTop + this.root.clientHeight) / rowHeight) + 2);
    const key = `${start}:${end}:${cols}`;
    if (key === this.key) return;
    this.key = key;
    this.window.style.transform = `translateY(${start * rowHeight}px)`;
    this.window.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
    this.window.replaceChildren(...this.entries.slice(start * cols, end * cols).map(this.draw));
  }
}
const libraryGrid = new AssetGrid($("#asset-list"), () => 2);
const pickerGrid = new AssetGrid($("#picker-list"), () => $("#picker-list").clientWidth < 510 ? 2 : 3);
const assetSelections = new Map(), assetSelectionModes = new Set();
const assetSelectionKey = picker => picker ? "picker:" + pickerScope : "library:" + assetScope;
let assetBatchBusy = false;
const recentAssetTrash = [];
function assetSelection(picker) {
  const key = assetSelectionKey(picker);
  if (!assetSelections.has(key)) assetSelections.set(key, new Set());
  return assetSelections.get(key);
}
function renderAssetSelection(picker, entries) {
  const parent = $(picker ? "#asset-picker-dialog" : "#library-dialog");
  let bar = parent.querySelector(".asset-selection-bar");
  if (!bar) { bar = make("div", "asset-selection-bar"); parent.querySelector("footer").before(bar); }
  const selection = assetSelection(picker);
  const all = picker ? assets : libraryEntries();
  for (const id of selection) if (!all.some(a => a.id === id)) selection.delete(id);
  bar.replaceChildren();
  const key = assetSelectionKey(picker), selecting = assetSelectionModes.has(key);
  bar.hidden = !selecting && !entries.length && !recentAssetTrash.length;
  parent.classList.toggle("selecting-assets", selecting);
  const redraw = () => picker ? renderPicker() : renderAssets();
  const count = make("span", "selection-count", selecting ? `已选 ${selection.size}` : "");
  bar.append(count);
  if (!selecting) bar.append(button("多选", () => {
    selection.clear(); assetSelectionModes.add(key); redraw();
  }));
  else {
    const allSelected = entries.length > 0 && entries.every(a => selection.has(a.id));
    const selectAll = button(allSelected ? "取消全选" : "全选", () => {
      entries.forEach(a => allSelected ? selection.delete(a.id) : selection.add(a.id)); redraw();
    });
    selectAll.disabled = !entries.length;
    bar.append(selectAll, button("完成", () => { selection.clear(); assetSelectionModes.delete(key); redraw(); }));
  }
  if (selection.size) {
    const picked = () => all.filter(a => selection.has(a.id));
    const action = (kind) => runAssetBatch(picked(), kind, picker);
    if (picker || assetScope !== "board") bar.append(button(pickerScope && picker ? "批量收录" : "加入画板", () => action(picker && pickerScope ? pickerScope : "add"), "primary"));
    bar.append(button("更多", e => CanvasUI.menu([
      { label: "收录到角色库", action: () => action("character") },
      { label: "收录到场景库", action: () => action("scene") },
      ...(!picker && assetScope !== "board" ? [{ label: "从此库移出", action: () => action("uncollect") }] : []),
      null, { label: !picker && assetScope === "board" ? "移除节点" : "移到回收站", danger: true, action: () => action("trash") },
    ], { anchor: e.currentTarget, label: "批量素材操作" })));
  }
  if (recentAssetTrash.length) bar.append(button("撤销删除", restoreRecentAssets));
  bar.querySelectorAll("button").forEach(b => b.disabled = b.disabled || assetBatchBusy);
}
async function restoreRecentAssets() {
  if (assetBatchBusy) return;
  assetBatchBusy = true;
  try {
    while (recentAssetTrash.length) {
      await api(`/api/trash/${encodeURIComponent(recentAssetTrash[recentAssetTrash.length - 1])}/restore`, { method: "POST" });
      recentAssetTrash.pop();
    }
    await refreshLibrary(); toast("已恢复素材");
  } finally { assetBatchBusy = false; renderAssets(); renderPicker(); }
}
async function runAssetBatch(entries, action, picker) {
  if (assetBatchBusy || !entries.length) return;
  assetBatchBusy = true;
  const selection = assetSelection(picker), scope = assetScope;
  const failures = []; let completed = 0;
  renderAssets(); renderPicker();
  try {
    if (action === "trash" && entries.every(a => a.node)) {
      removeNodes(entries.map(a => a.id)); selection.clear(); return;
    }
    const point = centerPoint(), added = [];
    if (action === "add") checkpoint();
    for (const a of entries) {
      try {
        if (action === "add") {
          added.push(assetNode(a, { x: point.x + (completed % 4) * 410, y: point.y + Math.floor(completed / 4) * 460 }, true));
        } else if (action === "trash") {
          const result = await api(`/api/library/assets/${encodeURIComponent(a.id)}`, { method: "DELETE" });
          if (result.trash_path) recentAssetTrash.push(result.trash_path.split(/[\\/]/).pop());
          assets = assets.filter(item => item.id !== a.id); rebuildAssetIndex();
        } else if (a.node) {
          await collectNode(a.node, action);
        } else {
          await updateAssetMetadata(a, { category: action === "uncollect" ? scope : action, included: action !== "uncollect" }, false);
        }
        completed++; selection.delete(a.id);
      } catch (error) { failures.push(`${a.name}: ${error.message}`); }
    }
    if (added.length) { selected = new Set(added.map(n => n.id)); touch(); render(); focusNodes(added); }
    toast(failures.length ? `已完成 ${completed} 项，${failures.length} 项失败，失败项保留选中` : `已完成 ${completed} 项${action === "trash" ? "，可撤销删除" : ""}`);
    if (failures.length) report(new Error(failures.slice(0, 3).join("；")));
  } finally { assetBatchBusy = false; renderAssets(); renderPicker(); }
}
function assetCard(a, { picker = false } = {}) {
  const card = make("article", "asset-card");
  const selection = assetSelection(picker);
  card.classList.toggle("is-selected", selection.has(a.id));
  card.dataset.assetId = a.id;
  card.draggable = true;
  card.addEventListener("dragstart", e => {
    e.dataTransfer.setData(a.node ? "application/studio-node" : "application/studio-asset", a.id);
    e.dataTransfer.effectAllowed = "copy";
  });
  const activate = async () => {
    if (assetBatchBusy) return;
    if (assetSelectionModes.has(assetSelectionKey(picker))) {
      selection.has(a.id) ? selection.delete(a.id) : selection.add(a.id);
      picker ? renderPicker() : renderAssets(); return;
    }
    if (picker && pickerScope) {
      await updateAssetMetadata(a, { category: pickerScope, included: true });
    } else if (a.node) {
      selected = new Set([a.id]); syncSelection(); drawEdges(); focusNodes([a.node]);
    } else {
      if ($("#asset-picker-dialog").open) $("#asset-picker-dialog").close();
      const n = assetNode(a); focusNodes([n]); toast("已加入画板");
    }
  };
  const main = button("", activate, "asset-card-main");
  const selecting = assetSelectionModes.has(assetSelectionKey(picker));
  card.draggable = !selecting;
  main.setAttribute("aria-label", `${selecting ? "选择" : picker && pickerScope ? "收录" : a.node ? "定位" : "添加"} ${a.name}`);
  if (selecting) main.setAttribute("aria-pressed", String(selection.has(a.id)));
  const preview = make("div", "asset-preview");
  if (a.url) {
    const media = make(a.kind === "video" ? "video" : "img");
    media.src = a.kind === "image" ? thumb(a) : a.url;
    if (a.kind === "video") { media.preload = "metadata"; media.muted = true; media.playsInline = true; }
    else { media.alt = a.name; media.loading = "lazy"; media.decoding = "async"; }
    media.addEventListener("error", () => preview.classList.add("failed"), { once: true });
    preview.append(media);
  } else if (a.kind === "text") preview.append(make("span", "asset-text-preview", a.prompt || "尚未填写文本"));
  else preview.append(icon(a.kind));
  preview.append(make("span", "asset-type", { image: "图片", video: "视频", text: "文本" }[a.kind] || "素材"));
  preview.append(make("span", "asset-hover-label", picker && pickerScope ? (a.categories?.includes(pickerScope) ? "✓ 已收录" : `＋ 收录到${scopeName(pickerScope)}`) : a.node ? "↗ 定位到节点" : "＋ 添加到画板"));
  const caption = make("span", "asset-caption");
  const name = make("span", "asset-title", a.name); name.title = a.name;
  const categories = (a.categories || []).map(scopeName).join(" · ");
  caption.append(name, make("small", "asset-meta", a.node ? (a.node.source ? "导入素材" : a.url ? "已生成 · 可引用" : "创作节点") : categories || (a.source === "generated" ? "生成记录" : "本地导入")));
  main.append(preview, caption); card.append(main);
  const checkbox = make("input", "asset-checkbox"); checkbox.type = "checkbox";
  checkbox.checked = selection.has(a.id); checkbox.disabled = assetBatchBusy;
  checkbox.hidden = !selecting;
  checkbox.setAttribute("aria-label", "选择 " + a.name);
  checkbox.addEventListener("click", e => e.stopPropagation());
  checkbox.addEventListener("change", () => {
    assetSelectionModes.add(assetSelectionKey(picker));
    checkbox.checked ? selection.add(a.id) : selection.delete(a.id);
    picker ? renderPicker() : renderAssets();
  }); card.append(checkbox);
  const more = button("···", e => {
    const entries = a.node ? nodeMenuEntries(a.node) : [
      { label: "添加到画板", glyph: "+", action: () => { $("#asset-picker-dialog").close(); assetNode(a); } },
      { label: "放大预览", glyph: "↗", action: () => previewVersions([{ ...a, assetId: a.id }]) },
      { label: "重命名", action: () => renameAsset(a) }, null,
      ...["character", "scene"].map(category => ({ label: `${a.categories?.includes(category) ? "移出" : "收录到"}${scopeName(category)}`, action: () => updateAssetMetadata(a, { category, included: !a.categories?.includes(category) }) })),
    ];
    if (!a.node) entries.push(null, { label: "移到回收站", danger: true, action: () => runAssetBatch([a], "trash", picker) });
    CanvasUI.menu(entries, { anchor: e.currentTarget, label: "素材操作" });
  }, "asset-card-more");
  more.setAttribute("aria-label", a.name + " 素材操作"); card.append(more);
  return card;
}
function emptyAssets(query, picker = false) {
  const empty = make("div", "library-empty"), art = make("div", "library-empty-art");
  art.append(icon(query ? "search" : assetScope === "character" ? "person" : assetScope === "scene" ? "landscape" : "layers"));
  empty.append(art, make("h4", "", query ? "没有匹配的素材" : "还没有素材"));
  if (query) empty.append(make("p", "", "试试其他关键词"));
  if (!query) empty.append(button(picker ? "上传素材" : assetScope === "board" ? "上传第一张素材" : "＋ 添加" + (assetScope === "character" ? "角色" : "场景"), () => picker ? $("#asset-upload").click() : assetScope === "board" ? $("#upload").click() : openAssetPicker(assetScope), "primary"));
  return empty;
}
function renderAssets(reset = false) {
  $("#library-dialog").dataset.scope = assetScope;
  document.querySelectorAll("[data-asset-scope]").forEach(tab => tab.setAttribute("aria-selected", String(tab.dataset.assetScope === assetScope)));
  $("#asset-add").setAttribute("aria-label", assetScope === "board" ? "添加画板素材" : "添加" + scopeName(assetScope));
  const q = $("#asset-search").value, entries = filterAssets(libraryEntries(), q, $("#asset-kind").value);
  $("#library-count").textContent = `${entries.length} 个${assetScope === "board" ? "节点" : "素材"}`;
  libraryGrid.set(entries, a => assetCard(a), emptyAssets(q), reset);
  renderAssetSelection(false, entries);
}
async function openAssetPicker(scope = "") {
  pickerScope = scope;
  assetSelection(true).clear(); assetSelectionModes.delete(assetSelectionKey(true));
  $("#picker-search").value = "";
  $("#picker-title").textContent = scope ? "添加到" + scopeName(scope) : "全部素材";
  if (!$("#asset-picker-dialog").open) $("#asset-picker-dialog").showModal();
  renderPicker(true);
  await refreshLibrary();
  if ($("#asset-picker-dialog").open) renderPicker();
}
function renderPicker(reset = false) {
  const q = $("#picker-search").value, entries = filterAssets(assets, q);
  $("#picker-note").textContent = `${entries.length} 个素材`;
  pickerGrid.set(entries, a => assetCard(a, { picker: true }), emptyAssets(q, true), reset);
  renderAssetSelection(true, entries);
}

async function extractFrame(n, mode, current = 0, continueVideo = false) {
  const source = clone(version(n));
  if (source?.kind !== "video") throw new Error("请先选择一个视频版本");
  toast("正在读取视频并提取画面…");
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = mediaURL(source);
  const wait = (event) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("视频加载超时，请确认素材可播放"));
      }, 30000);
      const ok = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error("视频无法解码"));
      };
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener(event, ok);
        video.removeEventListener("error", fail);
      };
      video.addEventListener(event, ok, { once: true });
      video.addEventListener("error", fail, { once: true });
    });
  await wait("loadeddata");
  if (!Number.isFinite(video.duration) || video.duration <= 0)
    throw new Error("无法读取视频时长");
  const time =
    mode === "first"
      ? 0
      : mode === "last"
        ? Math.max(0, video.duration - 0.001)
        : Math.min(video.duration - 0.001, Math.max(0, current));
  if (Math.abs(video.currentTime - time) > 0.0001) {
    const done = wait("seeked");
    video.currentTime = time;
    await done;
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  video.removeAttribute("src");
  video.load();
  if (!blob) throw new Error("截帧失败");
  const form = new FormData();
  const name =
    n.name +
    "-" +
    { first: "首帧", last: "尾帧", current: "当前帧" }[mode] +
    ".png";
  form.append("media", blob, name);
  const result = await api("/api/library/assets", {
    method: "POST",
    body: form,
  });
  rememberAsset(result.asset);
  const created = assetNode(result.asset, { x: n.x + 440, y: n.y });
  version(created).sourceFrame = {
    nodeId: n.id,
    name: n.name,
    version: source,
    time,
    mode,
  };
  touch();
  if (continueVideo) {
    const next = derive(created, "video", { x: n.x + 880, y: n.y });
    next.prompt = "";
    next.previousPrompt = source.snapshot?.prompt || n.prompt;
    touch();
    render();
    toast(`${mode === "last" ? "尾帧" : "当前帧"}已作为图片参考，请填写下一段动作；尚未提交生成。`);
  } else {
    render();
    toast(`已提取 ${time.toFixed(3)} 秒处画面，源视频保留。`);
  }
  return created;
}
function previewVersions(versions) {
  $("#preview-content").replaceChildren(
    ...versions.map((v) => {
      const wrap = make("div","preview-item");
      const media = make(v.kind === "video" ? "video" : "img");
      media.src = mediaURL(v);
      wrap.append(media);
      if (v.kind === "video") attachVideoControls(wrap,media,{id:uid(),name:v.name||"视频",type:"video",...centerPoint(),versions:[v]},v);

      return wrap;
    }),
  );
  if (!$("#preview-dialog").open) $("#preview-dialog").showModal();
}
function versionDetails(v) {
  const body = $("#version-content"),
    snapshot = v.snapshot;
  body.replaceChildren();
  const fields = snapshot
    ? [
        ["模型", MODELS[snapshot.profile]?.name || snapshot.profile || "—"],
        [
          "画幅 / 画质",
          [snapshot.ratio, snapshot.resolution].filter(Boolean).join(" · ") ||
            "模型默认",
        ],
        ...(v.kind === "video"
          ? [["时长", (snapshot.duration || "—") + " 秒"]]
          : []),
        [
          "生成时间",
          new Date(v.createdAt || Date.now()).toLocaleString("zh-CN"),
        ],
      ]
    : [["来源", v.sourceFrame ? "视频截帧" : "导入素材"]];
  const meta = make("dl", "version-meta");
  fields.forEach(([label, value]) =>
    meta.append(make("dt", "", label), make("dd", "", value)),
  );
  body.append(meta);
  if (snapshot) {
    body.append(
      make("h3", "", "当次提示词"),
      make("p", "version-prompt", snapshot.prompt || "未填写"),
    );
    if (snapshot.refs?.length) {
      body.append(make("h3", "", "当次参考素材"));
      const list = make("div", "version-references");
      snapshot.refs.forEach((ref) => {
        const item = make("div");
        if (ref.kind === "image") {
          const img = make("img");
          img.src = thumb(ref);
          img.alt = ref.name;
          item.append(img);
        } else item.append(icon(ref.kind));
        item.append(
          make("span", "", ref.name),
          make("small", "", ref.role || "参考素材"),
        );
        list.append(item);
      });
      body.append(list);
    }
  }
  if (v.sourceFrame) {
    body.append(
      make("h3", "", "截帧来源"),
      make(
        "p",
        "version-prompt",
        `${v.sourceFrame.name} · ${v.sourceFrame.time.toFixed(3)} 秒`,
      ),
    );
  }
  $("#download-version").onclick = () => downloadJSON(v, "生成记录.json");
  $("#version-dialog").showModal();
}
function download(url, name) {
  const a = make("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}
function downloadJSON(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function editDialog(title, fields, submit) {
  $("#edit-title").textContent = title;
  $("#edit-fields").replaceChildren(
    ...fields.flatMap(([key, label, type, value, options]) => {
      const l = make("label", "", label);
      l.htmlFor = "edit-" + key;
      const e =
        type === "select"
          ? selector(options || [], value, () => {})
          : make(type === "textarea" ? "textarea" : "input");
      if (e.tagName === "INPUT") {
        e.type = type;
        if (type === "number") {
          e.min = "1";
          e.max = "3600";
          e.step = "1";
        }
      }
      e.id = "edit-" + key;
      e.name = key;
      e.value = value ?? "";
      return [l, e];
    }),
  );
  $("#edit-form").onsubmit = (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target));
    submit(values);
    $("#edit-dialog").close();
  };
  $("#edit-dialog").showModal();
  requestAnimationFrame(() => {
    const first = $("#edit-fields").querySelector("input,textarea,button");
    first?.focus(); first?.select?.();
  });
}
function editNode(n) {
  editDialog(
    "节点设置",
    [
      ["name", "名称", "text", n.name],
      ...(n.previousPrompt
        ? [["previous", "上一段上下文", "textarea", n.previousPrompt]]
        : []),
    ],
    (v) => {
      checkpoint();
      n.name = v.name.trim() || n.name;
      if ("previous" in v) n.previousPrompt = v.previous;
      touch();
      render();
    },
  );
}
function adopt(n, v) {
  checkpoint();
  n.adopted = v.id;
  if (!n.shotId) {
    const s = { id: uid(), name: n.name, scene: "", duration: 5 };
    board().shots.push(s);
    n.shotId = s.id;
  }
  const shot = board().shots.find((s) => s.id === n.shotId);
  shot[v.kind === "image" ? "image" : "video"] = { ...clone(v), nodeId: n.id };
  touch();
  render();
  toast("已设为镜头采用版本；下游已有引用保持原版本");
}
function renderShots(force = false) {
  if (!$("#story-panel").hidden) renderInspirations(false);
  return;
  $("#shots").replaceChildren(
    ...board().shots.map((s, i) => {
      const card = make(
        "div",
        "shot-card" + (activeShot === s.id ? " active" : ""),
      );
      const v = s.image;
      if (v) {
        const img = make("img");
        img.src = thumb(v);
        card.append(img);
      } else
        card.append(make("span", "shot-icon", String(i + 1).padStart(2, "0")));
      const info = make("div");
      info.append(
        make("strong", "", `${String(i + 1).padStart(2, "0")} ${s.name}`),
        make(
          "small",
          "",
          s.video ? "✓ 已选片" : s.image ? "待生视频" : "待生图",
        ),
      );
      const controls = make("div");
      controls.append(
        Object.assign(button("←", () => moveShot(i, -1)), { disabled: i === 0, ariaLabel: "前移镜头", title: "前移镜头" }),
        Object.assign(button("→", () => moveShot(i, 1)), { disabled: i === board().shots.length - 1, ariaLabel: "后移镜头", title: "后移镜头" }),
        button("编辑", () => editShot(s)),
      );
      info.append(controls);
      card.append(info);
      card.addEventListener("click", () => {
        activeShot = s.id;
        selected = new Set(
          board()
            .nodes.filter((n) => n.shotId === s.id)
            .map((n) => n.id),
        );
        render();
        if (selected.size) focusNodes([...selected].map(node));
      });
      return card;
    }),
  );
}
function moveShot(i, offset) {
  const j = i + offset;
  if (j < 0 || j >= board().shots.length) return;
  checkpoint();
  [board().shots[i], board().shots[j]] = [board().shots[j], board().shots[i]];
  touch();
  renderShots();
}
function editShot(s, isNew = false) {
  editDialog(
    "镜头信息",
    [
      ["name", "镜头名称", "text", s.name],
      ["scene", "场景", "text", s.scene],
      ["description", "画面 / 动作 / 景别 / 运镜", "textarea", s.description],
      ["dialogue", "对白", "textarea", s.dialogue],
      ["duration", "目标时长（秒）", "number", s.duration],
    ],
    (v) => {
      checkpoint();
      Object.assign(s, v, { duration: Number(v.duration) });
      if (isNew) {
        board().shots.push(s);
        activeShot = s.id;
      }
      touch();
      render();
    },
  );
}
async function exportShots() {
  const selectedMedia = board().shots.flatMap((s, i) =>
    ["image", "video"]
      .filter((k) => s[k])
      .map((kind) => ({
        name: `${String(i + 1).padStart(3, "0")}-${s.name}`,
        url: mediaURL(s[kind]),
        kind,
        snapshot: s[kind].snapshot || {},
      })),
  );
  if (!selectedMedia.length) throw new Error("先将图片或视频设为镜头采用版本");
  const r = await fetch("/api/boards/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: board().name,
      shots: board().shots,
      media: selectedMedia,
    }),
  });
  if (!r.ok) {
    const d = await r.json();
    throw new Error(d.error || "导出失败");
  }
  const url = URL.createObjectURL(await r.blob());
  download(url, board().name + ".zip");
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function groupSelected() {
  const ns = [...selected].map(node).filter((n) => n && n.type !== "group");
  if (ns.length < 2) throw new Error("请选择至少两个节点再分组");
  const x = Math.min(...ns.map((n) => n.x)) - 25,
    y = Math.min(...ns.map((n) => n.y)) - 65;
  createNode(
    "group",
    { x, y },
    {
      name: "场景分组",
      members: ns.map((n) => n.id),
      width: Math.max(...ns.map((n) => n.x + NODE_WIDTH)) - x + 25,
      height:
        Math.max(
          ...ns.map(
            (n) =>
              n.y +
              ($("#nodes").querySelector(`[data-id="${n.id}"]`)?.offsetHeight ||
                400),
          ),
        ) -
        y +
        25,
    },
  );
}
function duplicate(point) {
  if (!copyBuffer.length) return;
  checkpoint();
  const mapping = Object.fromEntries(copyBuffer.map((n) => [n.id, uid()]));
  const dx = point ? point.x - Math.min(...copyBuffer.map(n => n.x)) : 50;
  const dy = point ? point.y - Math.min(...copyBuffer.map(n => n.y)) : 50;
  const newNodes = clone(copyBuffer).map((n) => ({
    ...n,
    id: mapping[n.id],
    name: n.name + " 副本",
    x: n.x + dx,
    y: n.y + dy,
    runs: [],
    lastSubmission: "",
    pendingSubmission: undefined,
    members: n.members?.map((id) => mapping[id] || id),
    refs: (n.refs || []).map((r) => ({
      ...r,
      nodeId: mapping[r.nodeId] || r.nodeId,
    })),
  }));
  board().nodes.push(...newNodes);
  selected = new Set(newNodes.map((n) => n.id));
  touch();
  render();
}
// Canvas controls. Layout and story order are independent data structures.
$("#viewport").addEventListener(
  "wheel",
  (e) => {
    if (e.target.closest("textarea,select,.dropdown,.floating-menu,.ui-popup")) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey)
      zoom(Math.exp(-e.deltaY * 0.006), e.clientX, e.clientY);
    else {
      board().view.x -= e.deltaX;
      board().view.y -= e.deltaY;
      applyView();
      rememberView();
    }
  },
  { passive: false },
);
$("#viewport").addEventListener("pointerdown", (e) => {
  if(selectedEdge){selectedEdge=null;drawEdges();}
  if (
    e.target.closest(
      ".node,.canvas-top,.navigation,.creation-tools,#minimap,#empty,#reference-mode",
    )
  )
    return;
  if (e.button !== 0 && e.button !== 1) return;
  e.preventDefault();
  $("#mention-menu").hidden = true;
  $("#connect-menu").hidden = true;
  const start = { x: e.clientX, y: e.clientY },
    v = { ...board().view };
  const pan = space || e.button === 1;
  const initial = new Set(e.shiftKey ? selected : []);
  if (!pan) selectNode("", false);
  const rect = $("#viewport").getBoundingClientRect();
  const move = (ev) => {
    window.dragging = true;
    if (pan) {
      board().view.x = v.x + ev.clientX - start.x;
      board().view.y = v.y + ev.clientY - start.y;
      applyView();
    } else {
      const box = $("#selection-box");
      box.hidden = false;
      Object.assign(box.style, {
        left: Math.min(ev.clientX, start.x) - rect.left + "px",
        top: Math.min(ev.clientY, start.y) - rect.top + "px",
        width: Math.abs(ev.clientX - start.x) + "px",
        height: Math.abs(ev.clientY - start.y) + "px",
      });
      const a = worldPoint(start.x, start.y),
        b = worldPoint(ev.clientX, ev.clientY);
      selected = new Set(initial);
      board()
        .nodes.filter(
          (n) =>
            !hiddenNode(n) &&
            (n.x + ($("#nodes").querySelector(`[data-id="${n.id}"]`)?.offsetWidth || NODE_WIDTH)) >= Math.min(a.x, b.x) &&
            n.x <= Math.max(a.x, b.x) &&
            (n.y + ($("#nodes").querySelector(`[data-id="${n.id}"]`)?.offsetHeight || 200)) >= Math.min(a.y, b.y) &&
            n.y <= Math.max(a.y, b.y),
        )
        .forEach((n) => selected.add(n.id));
      syncSelection();
      drawEdges();
    }
  };
  const up = () => {
    window.dragging = false;
    $("#selection-box").hidden = true;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (pan) rememberView();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
});
$("#viewport").addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.some(type => ["Files", "application/studio-asset", "application/studio-node"].includes(type))) e.preventDefault();
});
$("#viewport").addEventListener("drop", (e) => {
  const asset = assetById.get(e.dataTransfer.getData("application/studio-asset"));
  if (asset) { e.preventDefault(); assetNode(asset, worldPoint(e.clientX, e.clientY)); return; }
  const source = node(e.dataTransfer.getData("application/studio-node"));
  if (source) { e.preventDefault(); selected = new Set([source.id]); syncSelection(); focusNodes([source]); return; }
  if (e.dataTransfer.files.length) {
    e.preventDefault();
    uploadFiles(e.dataTransfer.files, worldPoint(e.clientX, e.clientY)).catch(
      report,
    );
  }
});
document.addEventListener("keydown", (e) => {
  if (CanvasUI.isOpen || CanvasUI.isEditing(e.target) || e.target.closest("select,dialog")) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    history(
      e.shiftKey ? redoStack : undoStack,
      e.shiftKey ? undoStack : redoStack,
    );
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    save();
    return;
  }
  if (!$("#story-panel").hidden) return;
  if (e.code === "Space") {
    if (e.target.closest("button,summary")) return;
    e.preventDefault();
    space = true;
    document.body.classList.add("panning");
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
    e.preventDefault();
    selected = new Set(
      board()
        .nodes.filter((n) => !hiddenNode(n))
        .map((n) => n.id),
    );
    render();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
    e.preventDefault();
    copyBuffer = [...selected].map(node).filter(Boolean).map(clone);
    duplicate();
  } else if (["Delete", "Backspace"].includes(e.key)) {
    e.preventDefault();
    if(selectedEdge) disconnectEdge(selectedEdge.n, selectedEdge.ref); else removeNodes();
  } else if (
    !e.metaKey &&
    !e.ctrlKey &&
    ["i", "v", "t"].includes(e.key.toLowerCase())
  )
    createNode({ i: "image", v: "video", t: "text" }[e.key.toLowerCase()]);
  if (e.key === "Escape") {
    endPick();
    $("#mention-menu").hidden = true;
    $("#connect-menu").hidden = true;
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    space = false;
    document.body.classList.remove("panning");
  }
});
window.addEventListener("blur", () => {
  space = false;
  document.body.classList.remove("panning");
});
const CLIPBOARD_MARKER = "morri-canvas-nodes:v1:";
function parseNodeClipboard(text) {
  if (!text?.startsWith(CLIPBOARD_MARKER) || text.length > 8 * 1024 * 1024) return null;
  try {
    const list = JSON.parse(text.slice(CLIPBOARD_MARKER.length));
    if (!Array.isArray(list) || !list.length || list.length > 500 || list.some(n => !n || !["image", "video", "text", "group"].includes(n.type) || typeof n.id !== "string" || typeof n.name !== "string" || !Number.isFinite(n.x) || !Number.isFinite(n.y) || !Array.isArray(n.refs) || !Array.isArray(n.versions))) return null;
    return list;
  } catch { return null; }
}
function copySelected(ids = [...selected]) {
  copyBuffer = ids.map(node).filter(Boolean).map(clone);
  if (!copyBuffer.length) return;
  navigator.clipboard?.writeText(CLIPBOARD_MARKER + JSON.stringify(copyBuffer)).then(() => toast("节点已复制，可在画板粘贴")).catch(() => toast("节点已复制，可通过右键菜单粘贴"));
}
async function pasteClipboard(point) {
  try {
    if (navigator.clipboard?.read) {
      const clipboard = await navigator.clipboard.read();
      const files = [];
      for (const item of clipboard) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (type) files.push(new File([await item.getType(type)], "粘贴图片-" + Date.now() + (type.includes("jpeg") ? ".jpg" : ".png"), { type }));
      }
      if (files.length) return uploadFiles(files, point);
      for (const item of clipboard) if (item.types.includes("text/plain")) {
        const list = parseNodeClipboard(await (await item.getType("text/plain")).text());
        if (list) { copyBuffer = list; return duplicate(point); }
      }
    } else if (navigator.clipboard?.readText) {
      const list = parseNodeClipboard(await navigator.clipboard.readText());
      if (list) { copyBuffer = list; return duplicate(point); }
    }
    toast("剪贴板里没有图片或画板节点。复制图片后，直接 Ctrl / ⌘ + V。");
  } catch {
    if (copyBuffer.length) {
      CanvasUI.menu([{ label: "粘贴上次复制的节点", action: () => duplicate(point) }], { point: lastPointer || { x: innerWidth / 2, y: innerHeight / 2 }, label: "粘贴节点" });
    }
    toast("浏览器未开放剪贴板读取，请直接按 Ctrl / ⌘ + V 粘贴图片。");
  }
}
function copyImage(n) {
  const v = version(n);
  if (!v || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("当前浏览器暂不支持复制图片，请下载原图");
  const png = (async () => {
    const response = await fetch(mediaURL(v));
    if (!response.ok) throw new Error("图片读取失败");
    const blob = await response.blob();
    if (blob.type === "image/png") return blob;
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      return await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("图片转换失败")), "image/png"));
    } finally { bitmap.close(); }
  })();
  return navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(() => toast("图片已复制，Ctrl / ⌘ + V 即可放入画板"));
}
function nodeMenuEntries(n) {
  if (n.type === "group") return [
    { label: "选择组内节点", action: () => { selected = new Set(n.members || []); syncSelection(); drawEdges(); } },
    { label: "重命名分组", action: () => editNode(n) }, null,
    { label: "取消分组", action: () => { removeNodes([n.id]); toast("已取消分组 · 可撤销"); } },
  ];
  const v = version(n), ids = selected.has(n.id) && selected.size > 1 ? [...selected] : [n.id];
  return [
    {label:"收藏灵感", action:()=>collectInspiration(n)},
    ...(n.type === "image" ? [{ label: "重新上传图片", glyph: "↑", action: () => chooseReplacement(n) }] : []),
    ...(v?.kind === "image" ? [
      { label: "修改图片", action: () => derive(n, "image") },
      { label: "生成视频", action: () => derive(n, "video") },
      { label: "复制图片", glyph: "▧", action: () => copyImage(n) },
    ] : v?.kind === "video" ? [
      { label: "提取尾帧", action: () => extractFrame(n, "last") },
      { label: "尾帧续接", action: () => extractFrame(n, "last", 0, true) },
    ] : []),
    ...(v ? [
      { label: "放大预览", glyph: "↗", action: () => previewVersions([v]) }, null,
      { label: "收录到角色库", action: () => collectNode(n, "character") },
      { label: "收录到场景库", action: () => collectNode(n, "scene") },
    ] : []), null,
    { label: "重命名与设置", action: () => editNode(n) },
    { label: ids.length > 1 ? `复制 ${ids.length} 个节点` : "复制节点", shortcut: "⌘ / Ctrl C", action: () => copySelected(ids) },
    { label: "创建副本", shortcut: "⌘ / Ctrl D", action: () => { copyBuffer = ids.map(node).map(clone); duplicate(); } },
    ...(ids.length > 1 ? [{ label: "将所选节点分组", action: groupSelected }] : []),
    { label: ids.length > 1 ? `移除 ${ids.length} 个节点` : "移除节点", shortcut: "⌫", danger: true, action: () => removeNodes(ids) },
  ];
}
function canvasContextMenu(e) {
  if (CanvasUI.isEditing(e.target) || !board()) return;
  e.preventDefault();
  const element = e.target.closest(".node"), n = element ? node(element.dataset.id) : null;
  if (n && !selected.has(n.id)) selectNode(n.id);
  const point = worldPoint(e.clientX, e.clientY);
  CanvasUI.menu(n ? nodeMenuEntries(n) : [
    { label: "创建图片节点", glyph: "▧", shortcut: "I", action: () => createNode("image", point) },
    { label: "创建视频节点", glyph: "▷", shortcut: "V", action: () => createNode("video", point) },
    { label: "创建文本节点", glyph: "T", shortcut: "T", action: () => createNode("text", point) }, null,
    { label: "粘贴图片或节点", shortcut: "⌘ / Ctrl V", action: () => pasteClipboard(point) },
    { label: "上传素材", glyph: "↑", action: () => { uploadPoint = point; $("#upload").click(); } },
    { label: "打开素材库", action: () => openLibrary() }, null,
    { label: "全选节点", shortcut: "⌘ / Ctrl A", disabled: !board().nodes.length, action: () => { selected = new Set(board().nodes.filter(n => !hiddenNode(n)).map(n => n.id)); syncSelection(); drawEdges(); } },
    { label: "适应画板", disabled: !board().nodes.length, action: () => focusNodes(board().nodes.filter(n => !hiddenNode(n))) },
    { label: "撤销", shortcut: "⌘ / Ctrl Z", disabled: !undoStack.length, action: () => history(undoStack, redoStack) },
  ], { point: { x: e.clientX, y: e.clientY }, label: n ? "节点操作" : "画板操作" });
}
let lastPointer = null, uploadPoint = null;
$("#viewport").addEventListener("pointermove", e => { lastPointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
$("#viewport").addEventListener("contextmenu", canvasContextMenu);
document.addEventListener("copy", e => {
  if (CanvasUI.isEditing(e.target) || e.target.closest("dialog") || !$("#story-panel").hidden || !selected.size) return;
  copyBuffer = [...selected].map(node).filter(Boolean).map(clone);
  if (!copyBuffer.length) return;
  e.preventDefault();
  e.clipboardData.setData("text/plain", CLIPBOARD_MARKER + JSON.stringify(copyBuffer));
  toast("节点已复制");
});
document.addEventListener("paste", e => {
  if (CanvasUI.isEditing(e.target) || e.target.closest("dialog") || !board() || !$("#story-panel").hidden) return;
  const clipboard = e.clipboardData;
  if (!clipboard) return;
  let files = [...(clipboard.files || [])];
  if (!files.length) files = [...(clipboard.items || [])].filter(item => item.kind === "file").map(item => item.getAsFile()).filter(Boolean);
  if (files.some(file => /^(image|video)\//.test(file.type))) {
    e.preventDefault();
    uploadFiles(files).catch(report);
    return;
  }
  const list = parseNodeClipboard(clipboard.getData("text/plain"));
  if (list) { e.preventDefault(); copyBuffer = list; duplicate(); }
});
$("#replace-image").onchange = e => {
  const file = e.target.files[0], target = replacingImage;
  replacingImage = null; e.target.value = "";
  if (file && target) replaceImage(file, target).catch(report);
};
$("#asset-add").onclick = () => openAssetPicker(assetScope === "board" ? "" : assetScope).catch(report);
$("#asset-browse").onclick = () => openAssetPicker().catch(report);
$("#picker-upload").onclick = () => $("#asset-upload").click();
$("#asset-upload").onchange = e => {
  const category = pickerScope || (assetScope === "board" ? "" : assetScope);
  uploadFiles(e.target.files, centerPoint(), { libraryOnly: true, category }).catch(report);
  e.target.value = "";
};
$("#picker-search").oninput = () => { clearTimeout(renderPicker.timer); renderPicker.timer = setTimeout(() => renderPicker(true), 120); };
$("#asset-sort").onclick = e => CanvasUI.menu([
  { label: "最近添加", selected: assetSort === "recent", action: () => { assetSort = "recent"; $("#asset-sort").textContent = "最近添加 ↓"; renderAssets(true); } },
  { label: "名称排序", selected: assetSort === "name", action: () => { assetSort = "name"; $("#asset-sort").textContent = "名称 A–Z"; renderAssets(true); } },
], { anchor: e.currentTarget, label: "素材排序" });
document.addEventListener("canvas-ui-error", e => report(e.detail));

document
  .querySelectorAll("[data-create]")
  .forEach((b) => (b.onclick = () => createNode(b.dataset.create)));
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
$("#undo").onclick = () => history(undoStack, redoStack);
$("#redo").onclick = () => history(redoStack, undoStack);
$("#fit").onclick = () =>
  focusNodes(board().nodes.filter((n) => !hiddenNode(n)));
$("#locate").onclick = () =>
  focusNodes([...selected].map(node).filter(Boolean));
$("#zoom-in").onclick = () => zoom(1.2);
$("#zoom-out").onclick = () => zoom(1 / 1.2);
$("#minimap").onclick = () => focusNodes(board().nodes);
$("#cancel-reference").onclick = endPick;
$("#upload-button").onclick = $("#empty-upload").onclick = () =>
  $("#upload").click();
$("#upload").onchange = (e) => {
  uploadFiles(e.target.files, uploadPoint || centerPoint()).catch(report);
  uploadPoint = null;
  e.target.value = "";
};
$("#library-button").onclick = () => {
  if ($("#library-dialog").open) $("#library-dialog").close();
  else openLibrary().catch(report);
};
document.querySelectorAll("[data-asset-scope]").forEach(b => b.onclick = () => setAssetScope(b.dataset.assetScope));
$("#asset-search").oninput = () => { clearTimeout(renderAssets.timer); renderAssets.timer = setTimeout(() => renderAssets(true), 120); };
$("#asset-kind").onchange = () => renderAssets(true);
$("#group-button").onclick = () => {
  try {
    groupSelected();
  } catch (e) {
    report(e);
  }
};
$("#arrange-button").onclick = () => {
  checkpoint();
  const ns = (selected.size ? [...selected].map(node) : board().nodes).filter(
    (n) => n && n.type !== "group" && !hiddenNode(n),
  );
  const p = centerPoint();
  let y = p.y;
  for (let i = 0; i < ns.length; i += 3) {
    const row = ns.slice(i, i + 3);
    const height = Math.max(
      ...row.map(
        (n) =>
          $("#nodes").querySelector(`[data-id="${n.id}"]`)?.offsetHeight || 400,
      ),
    );
    row.forEach((n, j) => {
      n.x = p.x + j * 440;
      n.y = y;
    });
    y += height + 70;
  }
  touch();
  render();
  focusNodes(ns);
};
$("#import-board").onclick = () => $("#board-file").click();
$("#board-file").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) throw new Error("备份超过 8 MiB");
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming.projects) || !incoming.projects.length)
      throw new Error("不是有效的画板备份");
    const added = clone(incoming.projects);
    for (const p of added) {
      p.id = uid();
      p.name = (p.name || "导入项目") + " · 导入";
      p.archived = false;
      for (const b of p.boards || []) b.id = uid();
    }
    const candidate = {
      revision: doc.revision,
      projects: [...doc.projects, ...added],
    };
    while (saving) await new Promise((r) => setTimeout(r, 50));
    candidate.revision = doc.revision;
    const result = await api("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    doc = result;
    dirty = false;
    projectId = added[0].id;
    setBoard(project().boards[0].id);
    $("#save-state").textContent = "✓ 已导入并保存";
    toast("已作为独立项目导入，原项目保留");
  } catch (err) {
    report(err);
  } finally {
    e.target.value = "";
  }
};
$("#new-project").onclick = () =>
  editDialog(
    "新建短剧项目",
    [["name", "项目名称", "text", "我的短剧"]],
    (v) => {
      const p = newProject(v.name || "未命名项目");
      doc.projects.push(p);
      projectId = p.id;
      setBoard(p.boards[0].id);
      touch();
    },
  );
$("#project-select").onchange = (e) => {
  projectId = e.target.value;
  setBoard(project().boards[0].id);
};
$("#project-menu").onclick = () => {
  const original = project();
  const saveFields = () => {
    original.name = $("#edit-name").value.trim() || original.name;
    original.style = $("#edit-style").value;
  };
  editDialog("项目设置", [
    ["name", "项目名称", "text", original.name],
    ["style", "视觉风格", "textarea", original.style],
  ], () => { saveFields(); touch(); render(); });
  const actions = make("section", "project-action-list");
  actions.append(make("small", "", "项目管理"));
  actions.append(button("创建项目副本", () => {
    saveFields();
    const next = clone(original); next.id = uid(); next.name += " 副本";
    next.boards.forEach(b => { b.id = uid(); });
    doc.projects.push(next); projectId = next.id; setBoard(next.boards[0].id);
    touch(); render(); $("#edit-dialog").close(); toast("已创建项目副本");
  }));
  actions.append(button("归档此项目", () => {
    saveFields(); original.archived = true;
    let next = doc.projects.find(p => !p.archived);
    if (!next) { next = newProject("新项目"); doc.projects.push(next); }
    projectId = next.id; setBoard(next.boards[0].id);
    touch(); render(); $("#edit-dialog").close(); toast("已归档，可在项目设置中恢复");
  }, "danger"));
  for (const archived of doc.projects.filter(p => p.archived)) {
    actions.append(button("恢复 · " + archived.name, () => {
      archived.archived = false; touch(); render(); $("#edit-dialog").close(); toast("项目已恢复");
    }));
  }
  $("#edit-fields").append(actions);
};
$("#new-board").onclick = () =>
  editDialog(
    "新建画板",
    [["name", "画板名称", "text", "新画板"]],
    (v) => {
      const b = newBoard(v.name || "新画板");
      project().boards.push(b);
      setBoard(b.id);
      touch();
    },
  );
$("#rename-board").onclick = () =>
  editDialog("重命名画板", [["name", "名称", "text", board().name]], (v) => {
    board().name = v.name || board().name;
    touch();
    render();
  });
$("#new-shot").onclick = () => {
  const s = {
    id: uid(),
    name: "镜头 " + (board().shots.length + 1),
    scene: "",
    duration: 5,
  };
  editShot(s, true);
};
$("#task-toggle").onclick = () => {
  $("#task-dialog").showModal();
  renderTaskList();
};
$("#save-draft").onclick = () =>
  downloadJSON(doc, project().name + "-未保存草稿.json");
$("#reload-board").onclick = async () => {
  try {
    const latest = await api("/api/boards");
    downloadJSON(doc, project().name + "-未保存草稿.json");
    const previousBoard = boardId;
    doc = latest;
    projectId =
      doc.projects.find((p) => p.id === projectId && !p.archived)?.id ||
      doc.projects.find((p) => !p.archived)?.id;
    if (!projectId) throw new Error("没有可用项目，请导入备份恢复");
    dirty = false;
    loadFailed = false;
    localStorage.removeItem("studio-board-draft");
    setBoard(
      project().boards.find((b) => b.id === previousBoard)?.id ||
        project().boards[0].id,
    );
    $("#save-state").textContent = doc.storage === "cloud" ? "云端已保存" : "已保存（本地）";
    $("#save-notice").hidden = true;
    toast("已下载原草稿并载入最新画板，可导入草稿恢复修改。");
  } catch (e) {
    report(e);
  }
};
$("#export-board").onclick = () =>
  downloadJSON(doc, project().name + "-画板备份.json");
$("#export-shots").onclick = () => $("#export-board").click();
$("#node-search").onkeydown = (e) => {
  if (e.key === "Enter") {
    const found = board().nodes.filter((n) =>
      [n.name, n.prompt].join(" ").includes(e.target.value),
    );
    if (found.length) {
      selected = new Set(found.map((n) => n.id));
      render();
      focusNodes(found);
    } else toast("没有找到匹配节点");
  }
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && dirty) { clearTimeout(journalTimer); journal(); }
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    journal();
    e.preventDefault();
    e.returnValue = "";
  }
});
async function boot() {
  try {
    doc = await api("/api/boards");
    const stored = localStorage.getItem("studio-board-draft");
    if (stored) {
      const draft = JSON.parse(stored);
      if (draft.revision === doc.revision) {
        doc = draft;
        dirty = true;
        toast("已恢复上次未完成保存的本地草稿");
      } else {
        localStorage.setItem("studio-board-conflict-" + Date.now(), stored);
        downloadJSON(draft, "未同步画板草稿.json");
        localStorage.removeItem("studio-board-draft");
        toast(
          "服务器已有更新，已另存并下载冲突草稿；可通过导入画板恢复为独立项目",
        );
      }
    }
    if (!doc.projects.some((p) => !p.archived)) {
      doc.projects.push(newProject("我的短剧"));
      dirty = true;
    }
    const last = sessionStorage.getItem("studio-board");
    projectId = (
      doc.projects.find(
        (p) => !p.archived && p.boards.some((b) => b.id === last),
      ) || doc.projects.find((p) => !p.archived)
    ).id;
    boardId =
      project().boards.find((b) => b.id === last && !b.archived)?.id || project().boards.find(b => !b.archived)?.id || project().boards[0].id;
    restoreView();
    render();
    if (dirty) touch();
    else $("#save-state").textContent = doc.storage === "cloud" ? "云端已保存" : "已保存（本地）";
    const [library, price] = await Promise.allSettled([
      api("/api/library"),
      api("/api/provider-pricing"),
    ]);
    if (library.status === "fulfilled") { assets = library.value.assets; rebuildAssetIndex(); }
    if (price.status === "fulfilled") pricing = price.value;
    await poll();
    refreshStorage();
    setInterval(() => { if (!document.hidden) poll(); }, 5000);
    setInterval(() => { if (!document.hidden) refreshStorage(); }, 12000);
  } catch (e) {
    loadFailed = true;
    $("#save-state").textContent = "加载失败，请刷新重试";
    report(e);
  }
}
function setWorkspaceView(story) {
  $("#story-grid").querySelectorAll("video").forEach(v=>v.pause());
  $("#library-dialog").close();
  $("#viewport").hidden = story;
  $("#story-panel").hidden = !story;
  $("#canvas-view").setAttribute("aria-selected", String(!story));
  $("#story-view").setAttribute("aria-selected", String(story));
  if (story) {
    $(".shot-strip").hidden = true;
    renderInspirations();
  }
}
function renderStoryGrid(force = false) {
  if (!board()) return;
  const signature = JSON.stringify([boardId, board().shots]);
  if (!force && $("#story-grid").dataset.signature === signature) return;
  $("#story-grid").dataset.signature = signature;
  $("#story-grid").replaceChildren(
    ...board().shots.map((shot, index) => {
      const card = make("article", "story-tile"),
        frame = make("div", "story-media"),
        chosen = shot.video || shot.image;
      if (chosen) {
        const media = make(chosen.kind === "video" ? "video" : "img");
        media.src =
          chosen.kind === "video"
            ? mediaURL(chosen)
            : thumb({ ...chosen, url: mediaURL(chosen) });
        if (chosen.kind === "video") {
          media.controls = true;
          media.preload = "metadata";
          media.muted = true;
        } else {
          media.alt = shot.name;
          media.loading = "lazy";
          media.addEventListener("click", () => previewVersions([chosen]));
        }
        frame.append(media);
      } else frame.append(icon("image"));
      frame.append(
        make("span", "story-number", String(index + 1).padStart(2, "0")),
      );
      const copy = make("div", "story-copy");
      copy.append(
        make("h3", "", shot.name),
        make(
          "p",
          "",
          shot.description ||
            shot.dialogue ||
            "添加镜头描述",
        ),
      );
      const meta = make("div", "story-meta");
      meta.append(
        make(
          "span",
          "",
          shot.video ? "已选片" : shot.image ? "待生视频" : "待生图",
        ),
        make(
          "span",
          "",
          `· ${shot.duration || 5} 秒${shot.scene ? " · " + shot.scene : ""}`,
        ),
      );
      copy.append(meta);
      const actions = make("div", "story-controls");
      actions.append(
        button("打开镜头", () => {
          activeShot = shot.id;
          setWorkspaceView(false);
          const related = board().nodes.filter((n) => n.shotId === shot.id);
          selected = new Set(related.map((n) => n.id));
          render();
          if (related.length) focusNodes(related);
          else {
            createNode("image", centerPoint(), {
              name: shot.name,
              shotId: shot.id,
              prompt: shot.description || "",
            });
          }
        }),
        button("编辑", () => editShot(shot)),
        Object.assign(button("←", () => moveShot(index, -1)), { disabled: index === 0, ariaLabel: "前移镜头", title: "前移镜头" }),
        Object.assign(button("→", () => moveShot(index, 1)), { disabled: index === board().shots.length - 1, ariaLabel: "后移镜头", title: "后移镜头" }),
        actionMenu(
          "镜头操作",
          [
            [
              "移除镜头",
              () => {
                checkpoint();
                board().shots = board().shots.filter((s) => s.id !== shot.id);
                board().nodes.forEach((n) => {
                  if (n.shotId === shot.id) n.shotId = "";
                });
                if (activeShot === shot.id) activeShot = "";
                touch();
                render();
                toast("镜头已移除，画板素材保留；可撤销。");
              },
            ],
          ],
          "more-actions",
        ),
      );
      copy.append(actions);
      card.append(frame, copy);
      return card;
    }),
  );
  if (!board().shots.length) {
    const empty = make("div", "story-empty");
    empty.append(
      icon("frame"),
      make(
        "p",
        "",
        "还没有镜头",
      ),
    );
    $("#story-grid").append(empty);
  }
}
function applyTheme(light) {
  document.body.classList.toggle("light", light);
  localStorage.setItem("studio-theme", light ? "light" : "dark");
  document.querySelector("#script-panel")?.contentWindow?.postMessage({type:"script-theme"},location.origin);
  $("#theme-toggle").textContent = light ? "切换深色外观" : "切换浅色外观";
}
document
  .querySelectorAll("[data-icon]")
  .forEach((el) => el.append(icon(el.dataset.icon)));
const creationDock = $(".creation-dock");
creationDock.addEventListener("click", (event) => {
  if (matchMedia("(hover: none)").matches && !creationDock.classList.contains("is-expanded")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    creationDock.classList.add("is-expanded");
  }
}, true);
document.addEventListener("pointerdown", (event) => {
  if (!creationDock.contains(event.target)) creationDock.classList.remove("is-expanded");
});
applyTheme(localStorage.getItem("studio-theme") === "light");
$("#canvas-view").onclick = () => setWorkspaceView(false);
$("#story-view").onclick = () => setWorkspaceView(true);
$("#story-new-shot").onclick = newInspirationFolder;
$("#theme-toggle").onclick = () =>
  applyTheme(!document.body.classList.contains("light"));
$("#help-toggle").onclick = () => $("#help-dialog").showModal();
$("#toggle-map").onclick = () => {
  $("#minimap").hidden = !$("#minimap").hidden;
  drawMini();
  $("#toggle-map").setAttribute("aria-pressed", String(!$("#minimap").hidden));
};
$("#toggle-edges").onclick = () => {
  const hidden = document.body.classList.toggle("edges-hidden");
  $("#toggle-edges").setAttribute("aria-pressed", String(!hidden));
};
$("#toggle-shots").onclick = () => {
  $(".shot-strip").hidden = !$(".shot-strip").hidden;
};
$("#close-shots").onclick = () => ($(".shot-strip").hidden = true);
$("#zoom-label").onclick = () => zoom(1 / board().view.z);
document.addEventListener("click", (e) => {
  document.querySelectorAll("details[open]").forEach((d) => {
    if (!d.contains(e.target) || e.target.closest(".menu-item,.board-row"))
      d.open = false;
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    document.querySelectorAll("details[open]").forEach((d) => (d.open = false));
});

CanvasUI.enhance();
boot();

let storageStatus = null;
async function refreshStorage() {
  try {
    storageStatus = await api("/api/storage");
    const s = storageStatus, el = $("#storage-state");
    el.hidden = false;
    el.textContent = !s.ready ? "云端未连接" : s.pending ? `素材同步中 · ${s.stored}` : s.errors ? "云端待重试" : "素材已同步";
    el.dataset.state = !s.ready || s.errors ? "warning" : s.pending ? "syncing" : "saved";
    el.title = `已同步 ${s.stored} 份素材${s.pending ? `，待同步 ${s.pending} 份` : ""}${s.missing ? `；${s.missing} 条历史记录缺少源文件` : ""}`;
  } catch { $("#storage-state").textContent = "正在重连云端"; }
}
$("#storage-state").onclick = () => {
  const s = storageStatus;
  if (!s) return;
  CanvasUI.menu([
    { label: s.ready ? "素材保存在私有云空间" : "云端暂时未连接", description: "画板与素材分类自动保存，本机仅作缓存", disabled: true },
    { label: `已同步 ${s.stored} 份 · 待同步 ${s.pending} 份`, disabled: true },
    ...(s.missing ? [{ label: `${s.missing} 条历史记录缺少源文件`, description: "保留历史记录，未将缺失文件标记为已同步", disabled: true }] : []), null,
    { label: "重试云端同步", disabled: !s.ready, action: async () => { await api("/api/storage/sync", { method: "POST" }); await refreshStorage(); toast("正在同步到云端"); } },
  ], { anchor: $("#storage-state"), label: "云端存储", placement: "bottom-end" });
};

// Browser pinch has a separate visual viewport. Keep tools reachable without
// changing the board camera or the user's browser zoom preference.
function syncCanvasChrome() {
  const v = window.visualViewport;
  const scale = v?.scale || 1, x = v?.offsetLeft || 0, y = v?.offsetTop || 0;
  const width = v?.width || innerWidth, height = v?.height || innerHeight;
  const style = document.documentElement.style;
  style.setProperty('--chrome-scale', String(1 / scale));
  style.setProperty('--chrome-left', `${x + 12 / scale}px`);
  style.setProperty('--chrome-top', `${y + 12 / scale}px`);
  style.setProperty('--chrome-width', `${width * scale - 24}px`);
  style.setProperty('--chrome-tools-top', `${y + 62 / scale}px`);
  style.setProperty('--chrome-bottom', `${y + height - 16 / scale}px`);
  style.setProperty('--chrome-right', `${x + width - 12 / scale}px`);
}
window.visualViewport?.addEventListener('resize', syncCanvasChrome);
window.visualViewport?.addEventListener('scroll', syncCanvasChrome);
window.addEventListener('resize', syncCanvasChrome);
syncCanvasChrome();

// Reusable, immutable creative recipes. Stored with the board document.
let inspirationFolder = "", inspirationQuery = "", inspirationTrash = false, inspirationLimit = 40;
let inspirationObserver, inspirationRenderKey = "", inspirationRenderOwner;
const gallerySizer = new ResizeObserver(entries => {
  for(const {target} of entries) target.style.gridRowEnd = `span ${Math.ceil((target.getBoundingClientRect().height + 18) / 8)}`;
});
function inspirationStore() {
  const owner = doc.projects[0];
  owner.inspirations ||= []; owner.inspirationFolders ||= [];
  return owner;
}
function newInspirationFolder() {
  editDialog("新建文件夹", [["name","文件夹名称","text",""]], value => {
    const name = value.name.trim(); if (!name) return;
    const store = inspirationStore();
    if (!store.inspirationFolders.includes(name)) store.inspirationFolders.push(name);
    inspirationFolder = name; touch(); renderInspirations();
  });
}
function collectInspiration(n) {
  editDialog("收藏灵感", [["name","名称","text",n.name],["folder","文件夹（可填写新名称）","text",inspirationFolder]], values => {
    const nodes = [], visited = new Set();
    function include(item) {
      if (!item || visited.has(item.id)) return;
      visited.add(item.id); nodes.push(clone(item));
      (item.refs || []).forEach(ref => include(node(ref.nodeId)));
    }
    include(n);
    const store = inspirationStore(), folder = values.folder.trim();
    if (folder && !store.inspirationFolders.includes(folder)) store.inspirationFolders.push(folder);
    store.inspirations.unshift({id:uid(),name:values.name.trim() || n.name,folder,root:n.id,nodes,createdAt:Date.now()});
    touch(); toast("已收藏完整节点和引用素材");
  });
}
function reuseInspiration(item) {
  checkpoint();
  const mapping = Object.fromEntries(item.nodes.map(n => [n.id,uid()]));
  const root = item.nodes.find(n => n.id === item.root), point = centerPoint();
  const copies = clone(item.nodes).map(n => ({...n,id:mapping[n.id],x:n.x-root.x+point.x,y:n.y-root.y+point.y,shotId:"",adopted:undefined,pendingSubmission:undefined,lastSubmission:"",runs:[],refs:(n.refs||[]).map(r=>({...r,nodeId:mapping[r.nodeId]||r.nodeId}))}));
  board().nodes.push(...copies); selected = new Set([mapping[item.root]]);
  setWorkspaceView(false); touch(); render(); focusNodes(copies); toast("灵感已放入画板，尚未提交生成");
}
function inspirationMatches(item, query) {
  const root=item.nodes.find(n=>n.id===item.root);
  const haystack=[item.name,root?.prompt,...(root?.versions||[]).map(v=>v.snapshot?.prompt||"")].join(" ").toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).every(term=>haystack.includes(term));
}
function renderInspirations(force = true) {
  const store=inspirationStore(), grid=$("#story-grid");
  const key=JSON.stringify([store.inspirations,store.inspirationFolders,inspirationFolder,inspirationQuery,inspirationTrash,inspirationLimit]);
  if(!force && inspirationRenderOwner===store && inspirationRenderKey===key)return;
  inspirationRenderOwner=store;inspirationRenderKey=key;
  inspirationObserver?.disconnect(); gallerySizer.disconnect();
  grid.querySelectorAll("video").forEach(v=>v.pause());grid.replaceChildren();
  const heading=$("#story-panel .story-heading");
  let toolbar=$("#inspiration-toolbar");
  if(!toolbar){
    toolbar=make("div","inspiration-toolbar");toolbar.id="inspiration-toolbar";
    const search=make("label","gallery-search");search.append(icon("search"));
    const input=make("input");input.type="search";input.placeholder="搜索名称或提示词";input.setAttribute("aria-label","搜索灵感名称或提示词");
    input.oninput=()=>{inspirationQuery=input.value;inspirationLimit=40;renderInspirations();};
    search.append(input);toolbar.append(search);
    const trash=button("回收站",()=>openRecycleBin(),"gallery-trash");trash.id="inspiration-trash";trash.hidden=true;toolbar.append(trash);heading.append(toolbar);
    toolbar.append($("#story-new-shot"));
  }
  $("#inspiration-trash").textContent=inspirationTrash?"返回收藏":`回收站${store.inspirations.some(i=>i.deleted)?" · "+store.inspirations.filter(i=>i.deleted).length:""}`;
  $("#inspiration-trash").setAttribute("aria-pressed",String(inspirationTrash));
  heading.querySelector("h1").textContent=inspirationTrash?"回收站":"灵感收藏";
  let filters=$("#inspiration-folders");
  if(!filters){filters=make("div","inspiration-folders");filters.id="inspiration-folders";grid.before(filters);}
  filters.replaceChildren();
  for(const name of ["",...store.inspirationFolders]){
    const count=store.inspirations.filter(i=>!!i.deleted===inspirationTrash&&(!name||i.folder===name)).length;
    const tab=button(`${name||"全部"}  ${count}`,()=>{inspirationFolder=name;inspirationLimit=40;renderInspirations();});
    tab.setAttribute("aria-pressed",String(name===inspirationFolder));filters.append(tab);
  }
  const items=store.inspirations.filter(i=>!!i.deleted===inspirationTrash&&(!inspirationFolder||i.folder===inspirationFolder)&&inspirationMatches(i,inspirationQuery));
  grid.classList.toggle("is-empty",!items.length);
  if(!items.length){
    const empty=make("div","gallery-empty");empty.append(icon(inspirationTrash?"layers":"image"),make("h2","",inspirationQuery?"没有找到匹配灵感":inspirationTrash?"回收站是空的":"把值得再用的想法留在这里"),make("p","",inspirationQuery?"试试其他名称或提示词关键词":inspirationTrash?"移除的收藏会保留在这里，随时可以恢复。":"从图片或视频节点选择“收藏灵感”，保留提示词、参数和参考素材。"));grid.append(empty);
  }
  for(const item of items.slice(0,inspirationLimit)){
    const n=item.nodes.find(n=>n.id===item.root);if(!n)continue;
    const card=make("article","inspiration-card");card.dataset.inspirationId=item.id;
    const v=n.versions?.find(v=>v.id===n.currentVersion)||n.versions?.at(-1);
    if(v){
      const isVideo=v.kind==="video";
      const preview=isVideo?make("div","gallery-media"):button("",()=>openInspiration(item),"gallery-media");
      if(!isVideo)preview.setAttribute("aria-label",`查看 ${item.name} 的节点详情`);
      const media=make(isVideo?"video":"img");media.src=mediaURL(v);
      if(isVideo){media.muted=true;media.playsInline=true;media.preload="metadata";}
      else{media.loading="lazy";media.alt=item.name;}
      preview.append(media,make("span","gallery-kind",isVideo?"视频":"图片"));
      if(isVideo)attachVideoControls(preview,media,n,v,{onPreview:()=>openInspiration(item,{time:media.currentTime,muted:media.muted}),previewLabel:"打开节点详情"});
      card.append(preview);
    }
    const copy=make("div","gallery-copy"), title=make("h3");
    title.append(button(item.name,()=>openInspiration(item),"gallery-title"));
    copy.append(make("span","gallery-folder",item.folder||"未分类"),title);
    card.addEventListener("click",e=>{if(!e.target.closest("button,input,video,.video-controls"))openInspiration(item);});
    const actions=make("div","gallery-actions");
    if(inspirationTrash)actions.append(button("恢复收藏",()=>{item.deleted=false;touch();renderInspirations();}));
    else{
      actions.append(button("放入画板 ↗",()=>reuseInspiration(item)));
      actions.append(actionMenu("灵感操作",[["分类 / 重命名",()=>editDialog("编辑灵感",[["name","名称","text",item.name],["folder","文件夹","text",item.folder]],v=>{item.name=v.name||item.name;item.folder=v.folder.trim();if(item.folder&&!store.inspirationFolders.includes(item.folder))store.inspirationFolders.push(item.folder);touch();renderInspirations();})],["移入回收站",()=>{item.deleted=true;touch();renderInspirations();toast("已移入收藏回收站");}]],"gallery-more"));
    }
    copy.append(actions);card.append(copy);grid.append(card);gallerySizer.observe(card);
  }
  let more=$("#inspiration-more");if(!more){more=button("加载更多",()=>{inspirationLimit+=40;renderInspirations();},"gallery-load");more.id="inspiration-more";grid.after(more);}
  more.hidden=items.length<=inspirationLimit;
  if(!more.hidden){inspirationObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){inspirationLimit+=40;renderInspirations();}},{root:$("#story-panel"),rootMargin:"200px"});inspirationObserver.observe(more);}
}
// Details read the saved node, never the mutable node on the current board.
function openInspiration(item, playback = {}) {
  const n=item.nodes.find(n=>n.id===item.root);if(!n)return;
  const origin=document.querySelector(`[data-inspiration-id="${CSS.escape(item.id)}"] .gallery-media`);
  const originRect=origin?.getBoundingClientRect();
  $("#story-grid").querySelectorAll("video").forEach(v=>v.pause());
  let dialog=$("#inspiration-detail");
  if(!dialog){
    dialog=make("dialog","inspiration-detail");dialog.id="inspiration-detail";
    dialog.setAttribute("aria-labelledby","inspiration-detail-title");document.body.append(dialog);
    dialog.addEventListener("close",()=>{dialog.querySelectorAll("video").forEach(v=>v.pause());(dialog._origin?.matches("button")?dialog._origin:dialog._origin?.querySelector("button"))?.focus({preventScroll:true});});
    dialog.addEventListener("cancel",event=>{event.preventDefault();closeInspiration();});
    dialog.addEventListener("click",e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeInspiration();}});
  }
  dialog.querySelectorAll("video").forEach(v=>v.pause());dialog.replaceChildren();
  const header=make("header"), heading=make("div"), title=make("h2","",item.name);
  title.id="inspiration-detail-title";
  heading.append(make("span","inspiration-detail-eyebrow",`${item.folder||"未分类"} / 节点详情`),title);
  const close=button("×",closeInspiration);close.setAttribute("aria-label","关闭节点详情");header.append(heading,close);
  const body=make("div","inspiration-detail-body"), result=make("div","inspiration-detail-result"), info=make("div","inspiration-detail-info");
  body.append(result,info);
  const paint=v=>{
    result.querySelectorAll("video").forEach(m=>m.pause());result.replaceChildren();info.replaceChildren();
    if(v){
      const stage=make("div","inspiration-detail-media"),media=make(v.kind==="video"?"video":"img");
      media.src=mediaURL(v);stage.append(media);result.append(stage);
      if(v.kind==="video"){
        media.muted=playback.muted??true;media.playsInline=true;media.preload="metadata";
        media.addEventListener("loadedmetadata",()=>{if(playback.time)media.currentTime=Math.min(playback.time,media.duration||0);},{once:true});
        attachVideoControls(stage,media,n,v,{hideExpand:true,onPreview:()=>{}});
      }else media.alt=item.name;
    }else result.append(make("div","inspiration-detail-empty","暂无生成结果"));
    if(n.versions?.length){
      const versions=selector(n.versions.map((entry,i)=>[entry.id,`版本 ${String(i+1).padStart(2,"0")}`]),v?.id,id=>{playback={};paint(n.versions.find(entry=>entry.id===id));},"inspiration-version");
      versions.setAttribute("aria-label","收藏的结果版本");result.append(versions);
    }
    const input=v?.snapshot||n.runs?.find(run=>v?.taskId&&run.taskId===v.taskId)?.snapshot||n;
    const meta=make("dl","inspiration-detail-meta");
    const fields=[["节点",n.name],["模型",MODELS[input.profile]?.name||input.profile],["比例",input.ratio==="auto"?"智能":input.ratio],["清晰度",input.resolution],...((v?.kind||n.type)==="video"&&input.duration?[["时长",`${input.duration} 秒`]]:[])];
    fields.filter(([,value])=>value).forEach(([label,value])=>meta.append(make("dt","",label),make("dd","",value)));
    info.append(make("h3","","生成设置"),meta);
    const refs=input.refs||[];
    if(refs.length){
      info.append(make("h3","",`参考素材 · ${refs.length}`));const list=make("div","inspiration-detail-refs");
      refs.forEach((ref,index)=>{
        const source=item.nodes.find(node=>node.id===ref.nodeId), chosen=source?.versions?.find(entry=>entry.id===ref.versionId)||version(source);
        const mediaRef=ref.url?ref:chosen, row=make("div","inspiration-detail-ref");
        if(mediaRef&&(ref.kind||mediaRef.kind)==="image"){
          const image=make("img");image.src=mediaURL(mediaRef);image.alt=ref.name||source?.name||"参考图片";image.loading="lazy";row.append(image);
        }else row.append(icon(ref.kind==="video"?"video":"file"));
        row.append(make("span","",`${String(index+1).padStart(2,"0")}  ${ref.name||source?.name||"参考素材"}`));list.append(row);
      });info.append(list);
    }
    if(input.prompt){
      const prompt=make("section","inspiration-detail-prompt"), text=make("p","prompt-excerpt",input.prompt);
      const toggle=button("展开",()=>{const expanded=toggle.getAttribute("aria-expanded")!=="true";toggle.setAttribute("aria-expanded",String(expanded));toggle.textContent=expanded?"收起":"展开";text.classList.toggle("is-expanded",expanded);},"prompt-expand");
      toggle.setAttribute("aria-expanded","false");const heading=make("div","prompt-heading");heading.append(make("h3","","提示词"),toggle);prompt.append(heading,text);info.append(prompt);
    }
  };
  paint(version(n));
  const footer=make("footer");footer.append(make("span","",item.createdAt?`收藏于 ${new Date(item.createdAt).toLocaleDateString("zh-CN")}`:"已收藏节点"),button("放入画板 ↗",()=>{dialog.close();reuseInspiration(item);}));
  dialog.append(header,body,footer);dialog._origin=origin;dialog._originRect=originRect;if(!dialog.open)dialog.showModal();
  animateInspirationMedia(dialog,originRect,false);
}
function animateInspirationMedia(dialog,origin,closing){
  const media=dialog.querySelector('.inspiration-detail-media > img');
  if(!media||!origin?.width||matchMedia('(prefers-reduced-motion: reduce)').matches){
    return Promise.resolve();
  }
  // Morph the image itself; metadata and text fade without stretching.
  const target=media.getBoundingClientRect();
  const from={left:`${origin.left}px`,top:`${origin.top}px`,width:`${origin.width}px`,height:`${origin.height}px`,borderRadius:'14px'};
  const to={left:`${target.left}px`,top:`${target.top}px`,width:`${target.width}px`,height:`${target.height}px`,borderRadius:'12px'};
  const options={duration:closing?260:420,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'};
  const ghost=media.cloneNode();ghost.alt='';ghost.setAttribute('aria-hidden','true');
  Object.assign(ghost.style,{position:'fixed',zIndex:'999',margin:'0',maxWidth:'none',maxHeight:'none',objectFit:'contain',background:'#111',pointerEvents:'none'});
  dialog.append(ghost);media.style.visibility='hidden';
  const animation=ghost.animate(closing?[to,from]:[from,to],options);
  const fades=[dialog.querySelector('header'),dialog.querySelector('footer'),dialog.querySelector('.inspiration-detail-info'),dialog.querySelector('.inspiration-version')].filter(Boolean).map(el=>el.animate(closing?[{opacity:1},{opacity:0}]:[{opacity:0},{opacity:1}],{duration:closing?120:230,delay:closing?0:140,fill:'both'}));
  return animation.finished.catch(()=>{}).finally(()=>{
    media.style.visibility='';ghost.remove();animation.cancel();fades.forEach(a=>a.cancel());
  });
}
function closeInspiration(){
  const dialog=$("#inspiration-detail");if(!dialog?.open||dialog.dataset.closing)return;
  dialog.querySelectorAll("video").forEach(v=>v.pause());
  const origin=dialog._origin?.isConnected?dialog._origin.getBoundingClientRect():null;
  dialog.dataset.closing="true";
  animateInspirationMedia(dialog,origin,true).finally(()=>{dialog.close();delete dialog.dataset.closing;});
}

let scriptFrame;
function openScript(){
  if(!scriptFrame){scriptFrame=make("iframe","script-panel");scriptFrame.id="script-panel";scriptFrame.title="脚本编写器";document.body.append(scriptFrame);}
  const url=`/script.html?board=${encodeURIComponent(boardId)}`;
  if(scriptFrame.getAttribute("src")!==url)scriptFrame.src=url;
  scriptFrame.hidden=false;$("#script-button").setAttribute("aria-expanded","true");
}
$("#script-button").onclick=()=>{if(scriptFrame&&!scriptFrame.hidden){scriptFrame.hidden=true;$("#script-button").setAttribute("aria-expanded","false");}else openScript();};
window.addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==scriptFrame?.contentWindow)return;
  if(event.data?.type==="script-board-images")scriptFrame.contentWindow.postMessage({type:"script-board-images",images:board().nodes.filter(n=>version(n)?.kind==="image").map(n=>({id:n.id,name:n.name,url:mediaURL(version(n))}))},location.origin);
  if(event.data?.type==="script-close"){scriptFrame.hidden=true;$("#script-button").setAttribute("aria-expanded","false");$("#script-button").focus();}

});
function attachVideoControls(stage, media, n, v, options = {}) {
  stage.classList.add("video-surface");
  const bar=make("div","video-controls"), play=button("▶",()=>media.paused?media.play().catch(report):media.pause());
  play.setAttribute("aria-label","播放视频");
  const time=make("span","video-time","0:00"), seek=make("input");seek.type="range";seek.min=0;seek.max=100;seek.step=.1;seek.value=0;seek.setAttribute("aria-label","视频进度");
  seek.oninput=()=>{if(Number.isFinite(media.duration))media.currentTime=media.duration*Number(seek.value)/100;};
  const sound=button("",()=>{media.muted=!media.muted; sound.setAttribute("aria-label",media.muted?"开启声音":"关闭声音"); sound.replaceChildren(icon(media.muted?"muted":"volume"));}); sound.append(icon(media.muted?"muted":"volume")); sound.setAttribute("aria-label",media.muted?"开启声音":"关闭声音");
  const format=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,"0")}`;
  media.addEventListener("loadedmetadata",()=>time.textContent=format(media.currentTime)+" / "+format(media.duration || 0));
  media.addEventListener("timeupdate",()=>{seek.value=media.duration?media.currentTime/media.duration*100:0;time.textContent=format(media.currentTime)+" / "+format(media.duration || 0);});
  media.addEventListener("play",()=>{if(stage.closest("#story-grid"))$("#story-grid").querySelectorAll("video").forEach(other=>{if(other!==media)other.pause();});play.textContent="Ⅱ";play.setAttribute("aria-label","暂停视频");});
  media.addEventListener("pause",()=>{play.textContent="▶";play.setAttribute("aria-label","播放视频");});
  let clickTimer;
  media.addEventListener("click",e=>{if(e.button!==0 || e.detail>1)return;clearTimeout(clickTimer);clickTimer=setTimeout(()=>{if(media.isConnected)media.paused?media.play().catch(report):media.pause();},230);});
  const preview=()=>{clearTimeout(clickTimer);media.pause();if(options.onPreview)options.onPreview();else if(!stage.closest("#preview-dialog"))previewVersions([v]);};
  media.addEventListener("dblclick",e=>{e.preventDefault();e.stopPropagation();preview();});
  bar.addEventListener("pointerdown",e=>e.stopPropagation());bar.addEventListener("click",e=>e.stopPropagation());
  const expand=button("⤢",preview);expand.setAttribute("aria-label",options.previewLabel||"放大预览");
  bar.append(play,seek,time,sound);if(!options.hideExpand && !stage.closest("#preview-dialog") && !stage.classList.contains("preview-item"))bar.append(expand);stage.append(bar);
  stage.addEventListener("contextmenu",e=>{
    e.preventDefault();e.stopPropagation();
    const frames=continuation=>[{label:"当前帧",action:()=>extractFrame(n,"current",media.currentTime,continuation)},{label:"尾帧",action:()=>extractFrame(n,"last",0,continuation)}];
    CanvasUI.menu([{label:"提取",children:frames(false)},{label:"续帧",children:frames(true)},{label:"导出",action:()=>download(mediaURL(v),n.name+".mp4")}],{point:{x:e.clientX,y:e.clientY},label:"视频操作"});
  });
}
$("#delete-board").onclick = () => {
  const old=board(); old.archived=true;
  let next=doc.projects.filter(p=>!p.archived).flatMap(p=>p.boards).find(b=>!b.archived);
  if(!next){next=newBoard("新画板");project().boards.push(next);}
  setBoard(next.id);touch();toast("画板已移入回收站");
};
$("#restore-board").onclick = () => openRecycleBin();
async function openRecycleBin(){
  document.querySelectorAll("details[open]").forEach(d=>d.open=false);
  let dialog=document.getElementById("recycle-dialog");
  if(!dialog){dialog=make("dialog","recycle-dialog");dialog.id="recycle-dialog";document.body.append(dialog);}
  dialog.replaceChildren();
  const header=make("header"),title=make("h2","","回收站");header.append(title,button("关闭",()=>dialog.close()));dialog.append(header);
  const tabs=make("nav"),tools=make("div","recycle-tools"),list=make("div","recycle-list");dialog.append(tabs,tools,list);
  const chosen=new Set();let category="全部",rows=[];
  const load=async()=>{
    const result=await api("/api/trash");
    rows=(result.entries||result.items||[]).map(x=>({...x,category:"素材",key:"asset:"+x.id}));
    doc.projects.forEach(p=>{
      p.boards.filter(b=>b.archived).forEach(b=>rows.push({id:b.id,key:"board:"+b.id,name:b.name,category:"画板",owner:p,item:b}));
      (p.inspirations||[]).filter(i=>i.deleted).forEach(i=>rows.push({id:i.id,key:"inspiration:"+i.id,name:i.name,category:"灵感",owner:p,item:i}));
    });
    draw();
  };
  const act=async(permanent)=>{
    const selectedRows=rows.filter(r=>chosen.has(r.key));if(!selectedRows.length)return;
    if(permanent&&!confirm(`彻底删除选中的 ${selectedRows.length} 项？此操作无法恢复。`))return;
    let failed=0;
    for(const r of selectedRows)try{
      if(r.category==="素材")await api(`/api/trash/${encodeURIComponent(r.id)}/${permanent?"purge":"restore"}`,{method:"POST"});
      else if(r.category==="画板"){if(permanent)r.owner.boards=r.owner.boards.filter(b=>b!==r.item);else r.item.archived=false;}
      else{if(permanent)r.owner.inspirations=r.owner.inspirations.filter(i=>i!==r.item);else r.item.deleted=false;}
      chosen.delete(r.key);
    }catch(e){failed++;}
    touch();render();await load();toast(failed?`${failed} 项操作失败，可重新选择后重试`:permanent?"已彻底删除":"已恢复所选项目");
  };
  const draw=()=>{
    tabs.replaceChildren();for(const name of ["全部","素材","灵感","画板"]){const t=button(name,()=>{category=name;chosen.clear();draw();});t.setAttribute("aria-pressed",String(category===name));tabs.append(t);}
    const visible=rows.filter(r=>category==="全部"||r.category===category);
    tools.replaceChildren(button("全选",()=>{visible.forEach(r=>chosen.add(r.key));draw();}),button("取消选择",()=>{chosen.clear();draw();}),make("span","",`已选 ${chosen.size} 项`));
    for(const [label,permanent] of [["恢复所选",false],["彻底删除",true]]){const b=button(label,()=>act(permanent));b.disabled=!chosen.size;tools.append(b);}
    list.replaceChildren();if(!visible.length)list.append(make("p","recycle-empty","这里还没有已删除的项目"));
    visible.forEach(r=>{const row=make("label","recycle-row"),check=make("input");check.type="checkbox";check.checked=chosen.has(r.key);check.onchange=()=>{check.checked?chosen.add(r.key):chosen.delete(r.key);draw();};row.append(check);
      if(r.category==="画板"){const preview=make("div","recycle-board-preview");r.item.nodes.filter(n=>version(n)?.kind==="image").slice(0,3).forEach(n=>{const img=make("img");img.src=thumb(version(n));preview.append(img);});if(!preview.children.length)preview.append(make("span","",`${r.item.nodes.length} 个节点`));row.append(preview);}
      else {const root=r.item?.nodes?.find(n=>n.id===r.item.root),v=root&&version(root),url=r.url||(v&&thumb(v));if(url){const media=make(r.category==="素材"&&r.kind==="video"?"video":"img","recycle-preview");media.src=url;if(media.tagName==="VIDEO"){media.muted=true;media.preload="metadata";}row.append(media);}}
      row.append(make("span","recycle-kind",r.category),make("span","",r.name));list.append(row);});
  };
  dialog.showModal();await load().catch(report);
}

$("#preview-dialog").addEventListener("close",()=>$("#preview-content").querySelectorAll("video").forEach(v=>v.pause()));
