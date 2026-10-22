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
  document.querySelectorAll(".node").forEach((el) => {
    el.classList.toggle("selected", selected.has(el.dataset.id));
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
    ratios: ["1:1"],
    resolutions: ["1K"],
    images: 8,
    videos: 0,
    hint: "1024×1024 基础规格；多图上限仍以供应商为准",
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
  hiddenNodes = new Set((b?.nodes || []).filter(n => n.type === "group" && n.collapsed).flatMap(n => n.members || []));
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
function touch() {
  if (loadFailed) return;
  dirty = true;
  changed++;
  $("#save-state").textContent = "保存中…";
  clearTimeout(journalTimer);
  journalTimer = setTimeout(journal, 180);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 550);
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
  boardId = id;
  selected.clear();
  activeShot = "";
  undoStack = [];
  redoStack = [];
  sessionStorage.setItem("studio-board", id);
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
    ...p.boards.map((b) => {
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
  renderNavigation();
  updateHistoryControls();
  renderNodes();
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
function createNode(type, position = centerPoint(), overrides = {}) {
  position = { ...position };
  while (
    type !== "group" &&
    board().nodes.some(
      (n) =>
        n.type !== "group" &&
        Math.abs(n.x - position.x) < 330 &&
        Math.abs(n.y - position.y) < 400,
    )
  )
    position.x += 430;
  checkpoint();
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
    shotId: activeShot,
    ...overrides,
  };
  board().nodes.push(n);
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
    if (!e.target.closest("button,input,textarea,select,video,a,summary,img"))
      focusNodes([n]);
  });
  if (n.type === "group") {
    el.style.width = (n.width || 720) + "px";
    el.style.height = (n.collapsed ? 60 : n.height || 520) + "px";
    header.append(
      button(n.collapsed ? "展开" : "折叠", () => {
        checkpoint();
        n.collapsed = !n.collapsed;
        touch();
        render();
      }),
    );
    return el;
  }
  const output = button("", () => {}, "port");
  output.title = "拖出连线，连接素材或创建下一步";
  output.setAttribute("aria-label", "输出连接点");
  output.addEventListener("pointerdown", (e) => startConnection(e, n));
  el.append(output, make("span", "port in"));
  const body = make("div", "node-body");
  if (!hasResult && n.type !== "text") {
    const placeholder = make("div", "node-placeholder");
    placeholder.append(
      icon(n.type),
      make("strong", "", n.type === "video" ? "视频生成" : "图片生成"),
      make("small", "", n.prompt || "选中节点，开始描述你的画面"),
    );
    body.append(placeholder);
    if (n.type === "image") body.append(button("上传图片", () => chooseReplacement(n), "empty-node-upload"));
    if (current) {
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
    media.src =
      v.kind === "video" ? mediaURL(v) : thumb({ ...v, url: mediaURL(v) });
    if (v.kind === "video") {
      media.controls = true;
      media.preload = "none";
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
    body.append(media);
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
    if (n.adopted === v.id)
      versions.append(make("span", "adopted-badge", "✓ 已采用"));
    else if (
      current &&
      ["queued", "running", "paused"].includes(current.status)
    )
      versions.append(
        make("span", "adopted-badge", statusName(current.status)),
      );
    else
      versions.append(
        make(
          "span",
          "",
          n.source ? "可复用素材" : `${n.versions.length} 个版本`,
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
    actions.append(iconButton("采用", "check", () => adopt(n, v)));
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
  if (!n.source) {
    const editor = make("div", "generation-editor");
    const heading = make("div", "editor-heading");
    heading.append(
      make(
        "span",
        "",
        n.type === "text"
          ? "文字与剧本"
          : n.type === "video"
            ? "下一段，如何发生？"
            : "描述你想要的画面",
      ),
      make("span", "", n.type === "text" ? "自由记录" : ""),
    );
    editor.append(heading);
    const prompt = make("textarea");
    prompt.value = n.prompt;
    prompt.placeholder =
      n.type === "text"
        ? "记录剧本、角色设定或镜头想法…"
        : "输入提示词，用 @ 引用角色、场景或上一镜头…";
    prompt.setAttribute("aria-label", n.name + " 提示词");
    prompt.addEventListener("focus", () => checkpoint());
    prompt.addEventListener("input", () => {
      n.prompt = prompt.value;
      touch();
      if (n.type !== "text") showMentions(n, prompt);
    });
    prompt.addEventListener("keydown", (e) => {
      if (e.key === "Escape") $("#mention-menu").hidden = true;
      if (e.key === "ArrowDown" && !$("#mention-menu").hidden) {
        e.preventDefault();
        $("#mention-menu button")?.focus();
      }
    });
    if (n.type !== "text") {
      const mention = button(
        "@ 引用素材",
        () => showMentions(n, prompt, true),
        "mention-trigger",
      );
      heading.lastChild.replaceWith(mention);
    }
    editor.append(prompt);
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
        if (ref.kind === "image") {
          const img = make("img");
          img.src = thumb(ref);
          img.alt = "";
          chip.append(img);
        }
        const locate = button("@" + ref.name, () => {
          if (node(ref.nodeId)) focusNodes([node(ref.nodeId)]);
          else previewVersions([ref]);
        });
        locate.title = ref.name + " · 固定引用此版本";
        chip.append(locate);
        const roles =
          ref.kind === "text"
            ? ["文本上下文"]
            : ref.kind === "video"
              ? ["动作参考", "运镜参考"]
              : ["图片参考", "角色参考", "场景参考", "风格参考", "构图参考"];
        const role = selector(
          roles.map((x) => [x, x]),
          ref.role,
          (val) => {
            checkpoint();
            ref.role = val;
            touch();
          },
        );
        role.setAttribute("aria-label", ref.name + " 引用用途");
        const remove = button("×", () => {
          checkpoint();
          n.refs = n.refs.filter((r) => r !== ref);
          touch();
          render();
        });
        remove.setAttribute("aria-label", "移除引用 " + ref.name);
        chip.append(role, remove);
        refs.append(chip);
      }
      refs.append(
        button(
          "＋ 参考素材",
          () => {
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
            values.map((value) => [
              value,
              key === "duration" ? value + " 秒" : value,
            ]),
            n[key],
            (value) => {
              checkpoint();
              n[key] = value;
              touch();
              render();
            },
          );
          option.setAttribute("aria-label", label);
          params.append(option);
        }
      editor.append(params);
      const incompat = compatibility(n);
      if (incompat) editor.append(make("div", "status error", incompat));
      else {
        const hint = make("div", "hint", m?.hint || "请选择模型");
        editor.append(hint);
      }
      const busy =
        pending.has(n.id) ||
        (current && ["queued", "running", "paused"].includes(current.status));
      const gen = make("div", "generate");
      gen.append(
        make("small", "cost", cost(n)),
        button(
          current?.status === "paused"
            ? "继续查询"
            : busy
              ? "制作中…"
              : "生成 ↗",
          () =>
            current?.status === "paused" ? resumeTask(current) : submitNode(n),
          "primary",
        ),
      );
      if ((busy && current?.status !== "paused") || incompat)
        gen.lastChild.disabled = true;
      editor.append(gen);
      if (current && current.status !== "completed")
        editor.append(
          make(
            "div",
            "status" + (current.status === "failed" ? " error" : ""),
            statusName(current.status) +
              (current.error ? " · " + current.error : ""),
          ),
        );
    }
    body.append(editor);
  }
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
  const drag = make("span", "drag-ref", "拖出作为参考 ↗");
  drag.draggable = true;
  drag.addEventListener("dragstart", (e) =>
    e.dataTransfer.setData("application/studio-node", n.id),
  );
  footer.append(drag);
  el.append(footer);
  return el;
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
      versionId: uid(),
      role: "文本上下文",
    };
  const v = version(source);
  if (!v) throw new Error("这个节点还没有可引用的生成结果");
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
  touch();
  render();
}
function endPick() {
  pickTarget = null;
  $("#reference-mode").hidden = true;
}
function showMentions(n, input, browse = false) {
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
      (version(x) || x.type === "text") &&
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
    label.append(make("small", "", v ? "固定引用当前版本" : "插入文本快照"));
    b.append(label);
    menu.append(b);
  }
  if (!candidates.length)
    menu.append(
      make("div", "menu-note", "没有匹配素材。先上传素材或生成一张图。"),
    );
  const r = input.getBoundingClientRect();
  menu.style.left = Math.min(r.left, innerWidth - 285) + "px";
  menu.style.top = Math.min(r.bottom + 3, innerHeight - 300) + "px";
  menu.hidden = false;
}
let edgeFrame;
function drawEdges() {
  if (edgeFrame) return;
  edgeFrame = requestAnimationFrame(() => { edgeFrame = 0; paintEdges(); });
}
function paintEdges() {
  const svg = $("#edges"), previous = new Map([...svg.querySelectorAll("[data-edge]")].map(p => [p.dataset.edge, p]));
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
      const x = source.x + NODE_WIDTH,
        y = source.y + 110,
        tx = n.x,
        ty = n.y + 110;
      const dx = Math.max(80, Math.abs(tx - x) / 2);
      p.setAttribute(
        "d",
        `M${x},${y} C${x + dx},${y} ${tx - dx},${ty} ${tx},${ty}`,
      );
      p.setAttribute(
        "class",
        "edge" +
          (ref.extracted ? " extracted" : "") +
          (selected.has(n.id) || selected.has(source.id) ? " highlight" : ""),
      );
      if (!p.isConnected) svg.append(p);
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
  const r = el.getBoundingClientRect(),
    v = board().view;
  const top = viewport.top + 155,
    bottom = viewport.bottom - 115;
  const left = $("#library-dialog").open ? $("#library-dialog").getBoundingClientRect().right + 24 : 35;
  const upper = r.top - (n.versions?.length ? 80 : 35) * v.z;
  if (r.height + 80 * v.z > bottom - top) {
    focusNodes([n]);
    return;
  }
  const dx =
    r.left < left
      ? left - r.left
      : r.right > viewport.right - 35
        ? viewport.right - 35 - r.right
        : 0;
  const dy =
    upper < top ? top - upper : r.bottom > bottom ? bottom - r.bottom : 0;
  if (dx || dy) {
    v.x += dx;
    v.y += dy;
    applyView();
    touch();
  }
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
  touch();
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
  touch();
}
function startMove(e, n) {
  if (
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
function startConnection(e, source) {
  e.stopPropagation();
  e.preventDefault();
  const ghost = document.createElementNS("http://www.w3.org/2000/svg", "path");
  ghost.setAttribute("class", "edge highlight");
  $("#edges").append(ghost);
  const move = (ev) => {
    const p = worldPoint(ev.clientX, ev.clientY);
    ghost.setAttribute(
      "d",
      `M${source.x + NODE_WIDTH},${source.y + 110} L${p.x},${p.y}`,
    );
  };
  const up = (ev) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    ghost.remove();
    const target = node(
      document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".node")
        ?.dataset.id,
    );
    if (target && target !== source) {
      try {
        addReference(target, source);
      } catch (err) {
        report(err);
      }
      return;
    }
    const menu = $("#connect-menu");
    menu.replaceChildren(
      button("→ 创建图片生成节点", () => {
        derive(source, "image", worldPoint(ev.clientX, ev.clientY));
        menu.hidden = true;
      }),
      button("→ 创建视频生成节点", () => {
        derive(source, "video", worldPoint(ev.clientX, ev.clientY));
        menu.hidden = true;
      }),
    );
    if (version(source)?.kind === "video")
      menu.append(
        button("→ 提取尾帧", () => {
          menu.hidden = true;
          return extractFrame(source, "last");
        }),
        button("→ 尾帧续接", () => {
          menu.hidden = true;
          return extractFrame(source, "last", 0, true);
        }),
      );
    menu.style.left = Math.min(ev.clientX, innerWidth - 280) + "px";
    menu.style.top = Math.min(ev.clientY, innerHeight - 210) + "px";
    menu.hidden = false;
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
function removeNodes(ids = [...selected]) {
  if (!ids.length) return;
  checkpoint();
  board().nodes = board().nodes.filter((n) => !ids.includes(n.id));
  selected.clear();
  touch();
  render();
  toast("已移除画板节点，源素材与下游版本引用仍保留；可撤销");
}
function derive(source, type, point = { x: source.x + 440, y: source.y }) {
  const ref = binding(source);
  const n = createNode(type, point, {
    refs: [ref],
    shotId: source.shotId || activeShot,
    prompt: type === "image" ? "保留参考图主体，" : "",
  });
  selected = new Set([n.id]);
  render();
  focusNodes([n]);
  return n;
}
async function submitNode(n) {
  if (pending.has(n.id)) return;
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
    let prompt = snapshot.prompt;
    let imageIndex = 0,
      videoIndex = 0;
    for (const ref of refs) {
      if (ref.kind === "text") {
        prompt += "\n" + ref.name + "：" + ref.text;
        continue;
      }
      const kindLabel =
        ref.kind === "video" ? `视频${++videoIndex}` : `图片${++imageIndex}`;
      prompt = prompt.split("@" + ref.name).join("@" + kindLabel);
      prompt += `\n${kindLabel}：${ref.name}，用途：${ref.role}。`;
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
          for (const t of (tasksByNode.get(`${b.id}:${n.id}`) || []).filter(t => t.status === "completed")) {
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
            n.currentVersion = v.id;
            mutated = true;
          }
        }
    if (mutated) touch();
    $("#task-count").textContent = tasks.filter((t) =>
      ["queued", "running", "paused"].includes(t.status),
    ).length;
    if ($("#task-dialog").open) renderTaskList();
    if (
      !document.activeElement.closest("textarea,input,select") &&
      !window.dragging && !CanvasUI.isOpen
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
function renderTaskList() {
  const list = $("#task-list");
  list.replaceChildren(
    ...tasks
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
        if (t.status === "paused")
          actions.append(button("继续查询", () => resumeTask(t)));
        row.append(info, actions);
        return row;
      }),
  );
  if (!tasks.length)
    list.append(
      make(
        "p",
        "task-empty",
        "还没有生成任务。创建一个节点，从第一个画面开始。",
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
function assetNode(asset, point = centerPoint()) {
  return createNode(asset.kind, point, {
    source: true, name: asset.name,
    versions: [{ id: uid(), assetId: asset.id, kind: asset.kind, url: asset.url, createdAt: Date.now() }],
  });
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
  if (!$("#library-dialog").open) $("#library-dialog").show();
  renderAssets();
  await refreshLibrary();
  if ($("#library-dialog").open) renderAssets();
}
function setAssetScope(scope) {
  assetScope = scope;
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
  if ($("#library-dialog").open) renderAssets();
  if ($("#asset-picker-dialog").open) renderPicker();
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
function assetCard(a, { picker = false } = {}) {
  const card = make("article", "asset-card");
  card.dataset.assetId = a.id;
  card.draggable = true;
  card.addEventListener("dragstart", e => {
    e.dataTransfer.setData(a.node ? "application/studio-node" : "application/studio-asset", a.id);
    e.dataTransfer.effectAllowed = "copy";
  });
  const activate = async () => {
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
  main.setAttribute("aria-label", `${picker && pickerScope ? "收录" : a.node ? "定位" : "添加"} ${a.name}`);
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
  const more = button("···", e => {
    const entries = a.node ? nodeMenuEntries(a.node) : [
      { label: "添加到画板", glyph: "+", action: () => { $("#asset-picker-dialog").close(); assetNode(a); } },
      { label: "放大预览", glyph: "↗", action: () => previewVersions([{ ...a, assetId: a.id }]) },
      { label: "重命名", action: () => renameAsset(a) }, null,
      ...["character", "scene"].map(category => ({ label: `${a.categories?.includes(category) ? "移出" : "收录到"}${scopeName(category)}`, action: () => updateAssetMetadata(a, { category, included: !a.categories?.includes(category) }) })),
    ];
    CanvasUI.menu(entries, { anchor: e.currentTarget, label: "素材操作" });
  }, "asset-card-more");
  more.setAttribute("aria-label", a.name + " 素材操作"); card.append(more);
  return card;
}
function emptyAssets(query, picker = false) {
  const empty = make("div", "library-empty"), art = make("div", "library-empty-art");
  art.append(icon(query ? "search" : assetScope === "character" ? "person" : assetScope === "scene" ? "landscape" : "layers"));
  empty.append(art, make("h4", "", query ? "没有找到匹配素材" : picker ? "还没有素材" : assetScope === "board" ? "你的画板，等一个开始" : `建立你的${assetScope === "character" ? "角色" : "场景"}收藏`));
  empty.append(make("p", "", query ? "换个关键词，或试试其他素材类型。" : assetScope === "board" ? "拖入一张图片，或直接 Ctrl / ⌘ + V。\n画板中的素材会自动出现在这里。" : "把常用参考收录在这里，\n每个镜头都能继续使用。"));
  if (!query) empty.append(button(picker ? "上传素材" : assetScope === "board" ? "上传第一张素材" : "＋ 添加" + (assetScope === "character" ? "角色" : "场景"), () => picker ? $("#asset-upload").click() : assetScope === "board" ? $("#upload").click() : openAssetPicker(assetScope), "primary"));
  return empty;
}
function renderAssets(reset = false) {
  const meta = {
    board: ["画板中的灵感", "图片、视频与文字，随时定位和引用。"],
    character: ["收藏角色设定，随时引用", "收藏角色设定，复用到每一个镜头。"],
    scene: ["故事发生的地方", "收录环境与空间，建立统一的视觉世界。"],
  }[assetScope];
  $("#library-dialog").dataset.scope = assetScope;
  $("#asset-heading").textContent = meta[0]; $("#asset-description").textContent = meta[1];
  document.querySelectorAll("[data-asset-scope]").forEach(tab => tab.setAttribute("aria-selected", String(tab.dataset.assetScope === assetScope)));
  $("#asset-add").setAttribute("aria-label", assetScope === "board" ? "添加画板素材" : "添加" + scopeName(assetScope));
  const q = $("#asset-search").value, entries = filterAssets(libraryEntries(), q, $("#asset-kind").value);
  $("#library-count").textContent = `${entries.length} 个${assetScope === "board" ? "节点" : "素材"}`;
  $("#library-note").textContent = assetScope === "board" ? "点击定位 · 拖入节点作为参考" : "跨画板复用 · 拖入画板或参考区";
  libraryGrid.set(entries, a => assetCard(a), emptyAssets(q), reset);
}
async function openAssetPicker(scope = "") {
  pickerScope = scope;
  $("#picker-search").value = "";
  $("#picker-title").textContent = scope ? "添加到" + scopeName(scope) : "全部素材";
  if (!$("#asset-picker-dialog").open) $("#asset-picker-dialog").showModal();
  renderPicker(true);
  await refreshLibrary();
  if ($("#asset-picker-dialog").open) renderPicker();
}
function renderPicker(reset = false) {
  const q = $("#picker-search").value, entries = filterAssets(assets, q);
  $("#picker-note").textContent = `${entries.length} 个素材${pickerScope ? " · 已收录的素材会保留" : " · 原文件与历史版本保留"}`;
  pickerGrid.set(entries, a => assetCard(a, { picker: true }), emptyAssets(q, true), reset);
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
    toast("尾帧已作为图片参考，请填写下一段动作；尚未提交生成。");
  } else {
    render();
    toast(`已提取 ${time.toFixed(3)} 秒处画面，源视频保留。`);
  }
  return created;
}
function previewVersions(versions) {
  $("#preview-content").replaceChildren(
    ...versions.map((v) => {
      const wrap = make("div");
      const media = make(v.kind === "video" ? "video" : "img");
      media.src = mediaURL(v);
      if (v.kind === "video") media.controls = true;
      wrap.append(media, make("small", "", v.snapshot?.prompt || v.name || ""));
      return wrap;
    }),
  );
  $("#preview-dialog").showModal();
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
}
function editNode(n) {
  editDialog(
    "节点设置",
    [
      ["name", "名称（用于 @ 搜索）", "text", n.name],
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
  if (!$("#story-panel").hidden) renderStoryGrid(force);
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
        button("←", () => moveShot(i, -1)),
        button("→", () => moveShot(i, 1)),
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
      touch();
    }
  },
  { passive: false },
);
$("#viewport").addEventListener("pointerdown", (e) => {
  if (
    e.target.closest(
      ".node,.canvas-top,.navigation,.creation-dock,#minimap,#empty,#reference-mode",
    )
  )
    return;
  if (e.button !== 0 && e.button !== 1) return;
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
            n.x + NODE_WIDTH >= Math.min(a.x, b.x) &&
            n.x <= Math.max(a.x, b.x) &&
            n.y + 200 >= Math.min(a.y, b.y) &&
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
    if (pan) touch();
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
    removeNodes();
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
  const v = version(n), ids = selected.has(n.id) && selected.size > 1 ? [...selected] : [n.id];
  return [
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
$("#project-menu").onclick = () =>
  editDialog(
    "项目设置",
    [
      ["name", "项目名称", "text", project().name],
      ["style", "统一视觉风格（备注）", "textarea", project().style],
      [
        "action",
        "项目操作",
        "select",
        "",
        [
          ["", "保存当前项目"],
          ["复制", "复制为新项目"],
          ["归档", "归档当前项目"],
          ["恢复归档", "恢复已归档项目"],
        ],
      ],
    ],
    (v) => {
      const p = project();
      p.name = v.name || p.name;
      p.style = v.style;
      if (v.action === "复制") {
        const next = clone(p);
        next.id = uid();
        next.name += " 副本";
        next.boards.forEach((b) => {
          b.id = uid();
        });
        doc.projects.push(next);
        projectId = next.id;
        setBoard(next.boards[0].id);
      }
      if (v.action === "归档") {
        p.archived = true;
        let next = doc.projects.find((x) => !x.archived);
        if (!next) {
          next = newProject("新项目");
          doc.projects.push(next);
        }
        projectId = next.id;
        setBoard(next.boards[0].id);
      }
      if (v.action === "恢复归档")
        doc.projects.forEach((p) => (p.archived = false));
      touch();
      render();
    },
  );
$("#new-board").onclick = () =>
  editDialog(
    "新建画板",
    [["name", "集 / 场景名称", "text", "第 1 集 · 新场景"]],
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
$("#export-shots").onclick = () => exportShots().catch(report);
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
      project().boards.find((b) => b.id === last)?.id || project().boards[0].id;
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
  $("#library-dialog").close();
  $("#viewport").hidden = story;
  $("#story-panel").hidden = !story;
  $("#canvas-view").setAttribute("aria-selected", String(!story));
  $("#story-view").setAttribute("aria-selected", String(story));
  if (story) {
    $(".shot-strip").hidden = true;
    renderStoryGrid(true);
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
            "还没有镜头描述，添加画面、动作或对白。",
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
        button("←", () => moveShot(index, -1)),
        button("→", () => moveShot(index, 1)),
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
        "这里还没有镜头。\n新建一个镜头，或在画板中将结果设为“采用”。",
      ),
    );
    $("#story-grid").append(empty);
  }
}
function applyTheme(light) {
  document.body.classList.toggle("light", light);
  localStorage.setItem("studio-theme", light ? "light" : "dark");
  $("#theme-toggle").textContent = light ? "切换深色外观" : "切换浅色外观";
}
document
  .querySelectorAll("[data-icon]")
  .forEach((el) => el.append(icon(el.dataset.icon)));
applyTheme(localStorage.getItem("studio-theme") === "light");
$("#canvas-view").onclick = () => setWorkspaceView(false);
$("#story-view").onclick = () => setWorkspaceView(true);
$("#story-new-shot").onclick = () => $("#new-shot").onclick();
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
