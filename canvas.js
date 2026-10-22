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
    hint: "沿用现有 Seedream 5.0 Pro 接入",
  },
  "seedream43-ark-direct": {
    name: "Seedream 4.3 · 2K",
    kind: "image",
    ratios: [],
    resolutions: [],
    images: 8,
    videos: 0,
    hint: "沿用现有 Seedream 4.3 接入",
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
const project = () => doc.projects.find((p) => p.id === projectId);
const board = () => project()?.boards.find((b) => b.id === boardId);
const node = (id) => board()?.nodes.find((n) => n.id === id);
const version = (n) =>
  n?.versions?.find((v) => v.id === n.currentVersion) || n?.versions?.at(-1);
const thumb = (v) =>
  v?.kind === "image" && v.url?.startsWith("/media/")
    ? v.url + "?thumbnail=1"
    : v?.url;
const mediaURL = (v) =>
  assets.find((a) => a.id === v?.assetId)?.url ||
  tasks.find((t) => t.id === v?.taskId)?.[
    v.kind === "video" ? "local_video_url" : "local_image_url"
  ] ||
  v?.url;
const nodeSignature = (n) =>
  JSON.stringify([
    n,
    tasks
      .filter((t) => t.node_id === n.id && t.board_id === boardId)
      .map((t) => [t.id, t.status, t.error]),
    pending.has(n.id),
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
function touch() {
  if (loadFailed) return;
  dirty = true;
  changed++;
  $("#save-state").textContent = "未保存 · 正在同步";
  journal();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 550);
}
async function save() {
  if (saving || !dirty || loadFailed) return;
  saving = true;
  const serial = changed;
  try {
    const result = await api("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    doc.revision = result.revision;
    if (changed === serial) {
      dirty = false;
      localStorage.removeItem("studio-board-draft");
      $("#save-state").textContent = "✓ 已保存到本机";
    } else journal();
  } catch (e) {
    $("#save-state").textContent = "保存失败 · 请导出备份";
    toast(e.message);
    if (e.message.includes("另一个窗口")) loadFailed = true;
  } finally {
    saving = false;
    if (dirty && !loadFailed && changed !== serial)
      saveTimer = setTimeout(save, 600);
  }
}
function checkpoint() {
  undoStack.push(
    clone({ nodes: board().nodes, shots: board().shots, view: board().view }),
  );
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
}
function history(from, to) {
  if (!from.length) return;
  to.push(
    clone({ nodes: board().nodes, shots: board().shots, view: board().view }),
  );
  Object.assign(board(), from.pop());
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
}
function hiddenNode(n) {
  return board().nodes.some(
    (g) => g.type === "group" && g.collapsed && g.members?.includes(n.id),
  );
}
function render() {
  if (!board()) return;
  renderNavigation();
  $("#nodes").replaceChildren(
    ...board()
      .nodes.filter((n) => !hiddenNode(n))
      .map(renderNode),
  );
  $("#empty").hidden = board().nodes.length > 0;
  applyView();
  drawEdges();
  renderShots();
}
function applyView() {
  const v = board().view;
  $("#world").style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
  $("#zoom-label").textContent = Math.round(v.z * 100) + "%";
  $("#viewport").style.backgroundSize = `${22 * v.z}px ${22 * v.z}px`;
  $("#viewport").style.backgroundPosition = `${v.x}px ${v.y}px`;
  drawMini();
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
    position.x += 370;
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
  return n;
}
function selectNode(id, add = false) {
  if (!add) selected.clear();
  selected.has(id) && add ? selected.delete(id) : selected.add(id);
  document
    .querySelectorAll(".node")
    .forEach((e) => e.classList.toggle("selected", selected.has(e.dataset.id)));
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
  const el = make(
    "article",
    "node" +
      (selected.has(n.id) ? " selected" : "") +
      (n.type === "group" ? " group-node" : "") +
      (n.type === "text" ? " text-node" : "") +
      (n.source ? " source" : ""),
  );
  el.dataset.id = n.id;
  el.dataset.signature = nodeSignature(n);
  el.style.left = n.x + "px";
  el.style.top = n.y + "px";
  if (n.type === "group") {
    el.style.width = (n.width || 720) + "px";
    el.style.height = (n.collapsed ? 60 : n.height || 520) + "px";
  }
  const header = make("header", "node-header");
  header.append(
    make(
      "span",
      "node-type",
      { image: "▧", video: "▷", text: "T", group: "▱" }[n.type],
    ),
  );
  const title = make("span", "node-name", n.name);
  title.title = n.name;
  header.append(
    title,
    button("···", () => editNode(n)),
    button("×", () => removeNodes([n.id])),
  );
  el.append(header);
  header.addEventListener("pointerdown", (e) => startMove(e, n));
  el.addEventListener("pointerdown", (e) => {
    if (pickTarget && n.id !== pickTarget) {
      e.preventDefault();
      e.stopPropagation();
      addReference(node(pickTarget), n);
      endPick();
      return;
    }
    if (
      !e.target.closest("button,input,textarea,select,video,a") &&
      !selected.has(n.id)
    )
      selectNode(n.id, e.shiftKey);
  });
  if (n.type === "group") {
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
  if (!n.source) {
    const prompt = make("textarea", "");
    prompt.value = n.prompt;
    prompt.placeholder =
      n.type === "text"
        ? "写下剧本、角色设定或场景描述…"
        : "描述这个镜头… 输入 @ 引用画板素材";
    prompt.setAttribute("aria-label", n.name + " 提示词");
    prompt.addEventListener("focus", () => checkpoint());
    prompt.addEventListener("input", () => {
      n.prompt = prompt.value;
      touch();
      if (n.type !== "text") showMentions(n, prompt);
    });
    prompt.addEventListener("keydown", (e) => {
      if (e.key === "Escape") $("#mention-menu").hidden = true;
    });
    body.append(prompt);
    if (n.type !== "text") {
      const refs = make("div", "reference-list");
      refs.addEventListener("dragover", (e) => e.preventDefault());
      refs.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData("application/studio-node");
        if (node(id)) addReference(n, node(id));
      });
      for (const ref of n.refs || []) {
        const chip = make("div", "ref-chip");
        if (ref.kind === "image") {
          const img = make("img");
          img.src = thumb(ref);
          chip.append(img);
        }
        chip.append(
          button("@" + ref.name, () => {
            if (node(ref.nodeId)) focusNodes([node(ref.nodeId)]);
            else previewVersions([ref]);
          }),
        );
        const roles =
          ref.kind === "text"
            ? ["文本上下文"]
            : ref.kind === "video"
              ? ["动作参考", "运镜参考"]
              : ["图片参考", "角色参考", "场景参考", "风格参考", "构图参考"];
        chip.append(
          selector(
            roles.map((x) => [x, x]),
            ref.role,
            (val) => {
              checkpoint();
              ref.role = val;
              touch();
            },
          ),
          button("×", () => {
            checkpoint();
            n.refs = n.refs.filter((r) => r !== ref);
            touch();
            render();
          }),
        );
        refs.append(chip);
      }
      refs.append(
        button(
          "＋ 添加参考",
          () => {
            pickTarget = n.id;
            $("#reference-mode").hidden = false;
          },
          "add-ref",
        ),
      );
      body.append(refs);
      const params = make("div", "params");
      params.append(
        selector(
          Object.entries(MODELS)
            .filter(([, m]) => m.kind === n.type)
            .map(([k, m]) => [k, m.name]),
          n.profile,
          (val) => {
            checkpoint();
            n.profile = val;
            const m = MODELS[val];
            n.ratio = m.ratios[0] || "";
            n.resolution = m.resolutions[0] || "";
            n.duration = String(m.durations?.[0] || 5);
            touch();
            render();
          },
          "model",
        ),
      );
      const m = MODELS[n.profile];
      for (const [key, values] of [
        ["ratio", m?.ratios],
        ["resolution", m?.resolutions],
        ["duration", m?.durations],
      ])
        if (values?.length)
          params.append(
            selector(
              values.map((v) => [v, key === "duration" ? v + " 秒" : v]),
              n[key],
              (val) => {
                checkpoint();
                n[key] = val;
                touch();
                render();
              },
            ),
          );
      body.append(params);
      const incompat = compatibility(n);
      if (incompat) body.append(make("div", "status error", incompat));
      else body.append(make("div", "hint", m?.hint || "请选择可用模型"));
      const current = tasks
        .filter((t) => t.node_id === n.id && t.board_id === boardId)
        .sort((a, b) => b.created_at - a.created_at)[0];
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
      if (busy && current?.status !== "paused") gen.lastChild.disabled = true;
      if (incompat) gen.lastChild.disabled = true;
      body.append(gen);
      if (current)
        body.append(
          make(
            "div",
            "status" + (current.status === "failed" ? " error" : ""),
            statusName(current.status) +
              (current.error ? " · " + current.error : ""),
          ),
        );
    }
  }
  if (n.versions?.length) {
    body.append(
      selector(
        n.versions.map((v, i) => [
          v.id,
          `${n.source ? "素材" : "版本 " + (i + 1)} · ${new Date(v.createdAt || Date.now()).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}${v.id === n.adopted ? " · 已采用" : ""}`,
        ]),
        version(n).id,
        (val) => {
          checkpoint();
          n.currentVersion = val;
          touch();
          render();
        },
        "version-picker",
      ),
    );
    const v = version(n);
    const media = make(v.kind === "video" ? "video" : "img", "node-media");
    media.src =
      v.kind === "video" ? mediaURL(v) : thumb({ ...v, url: mediaURL(v) });
    if (v.kind === "video") {
      media.controls = true;
      media.preload = "metadata";
      media.muted = true;
      media.playsInline = true;
    } else {
      media.alt = n.name;
      media.loading = "lazy";
      media.addEventListener("click", () => previewVersions([v]));
    }
    body.append(media);
    const actions = make("div", "result-actions");
    actions.append(
      button("预览", () => previewVersions([v])),
      button("采用", () => adopt(n, v)),
      button("对比", () => previewVersions(n.versions.slice(-4))),
      button("参数", () => versionDetails(v)),
    );
    if (v.kind === "image")
      actions.append(
        button("修改图片", () => derive(n, "image")),
        button("生成视频", () => derive(n, "video")),
      );
    if (v.kind === "video")
      actions.append(
        button("提取首帧", () => extractFrame(n, "first")),
        button("当前帧", () => extractFrame(n, "current", media.currentTime)),
        button("提取尾帧", () => extractFrame(n, "last")),
        button("尾帧续接", () => extractFrame(n, "last", 0, true)),
        button(
          "−1 帧",
          () => (media.currentTime = Math.max(0, media.currentTime - 1 / 30)),
        ),
        button(
          "+1 帧",
          () =>
            (media.currentTime = Math.min(
              media.duration,
              media.currentTime + 1 / 30,
            )),
        ),
      );
    actions.append(
      button("下载", () =>
        download(mediaURL(v), n.name + (v.kind === "video" ? ".mp4" : ".png")),
      ),
    );
    body.append(actions);
    if (v.sourceFrame)
      body.append(
        button(
          `截自 ${v.sourceFrame.name} · ${v.sourceFrame.time.toFixed(3)}s`,
          () =>
            node(v.sourceFrame.nodeId)
              ? focusNodes([node(v.sourceFrame.nodeId)])
              : previewVersions([v.sourceFrame.version]),
          "subtle",
        ),
      );
  }
  el.append(body);
  const footer = make("footer", "node-footer");
  footer.append(
    selector(
      [
        ["", "未关联镜头"],
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
    ),
  );
  const drag = make("span", "drag-ref", "拖到参考区 ↗");
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
function showMentions(n, input) {
  const before = input.value.slice(0, input.selectionStart),
    match = before.match(/@([^@\s]*)$/);
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
      menu.hidden = true;
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
function drawEdges() {
  const svg = $("#edges");
  svg.replaceChildren();
  for (const n of board().nodes) {
    if (hiddenNode(n)) continue;
    for (const ref of n.refs || []) {
      const source = node(ref.nodeId);
      if (!source || hiddenNode(source)) continue;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const x = source.x + 320,
        y = source.y + 30,
        tx = n.x,
        ty = n.y + 30;
      const dx = Math.max(80, Math.abs(tx - x) / 2);
      p.setAttribute(
        "d",
        `M${x},${y} C${x + dx},${y} ${tx - dx},${ty} ${tx},${ty}`,
      );
      p.setAttribute(
        "class",
        "edge" +
          (selected.has(n.id) || selected.has(source.id) ? " highlight" : ""),
      );
      svg.append(p);
    }
  }
  drawMini();
}
function drawMini() {
  if (!board()) return;
  const mini = $("#minimap");
  mini.replaceChildren();
  const ns = board().nodes.filter((n) => !hiddenNode(n));
  if (!ns.length) return;
  const minX = Math.min(...ns.map((n) => n.x)),
    minY = Math.min(...ns.map((n) => n.y)),
    maxX = Math.max(...ns.map((n) => n.x + 320)),
    maxY = Math.max(...ns.map((n) => n.y + 350)),
    scale = Math.min(160 / (maxX - minX || 1), 90 / (maxY - minY || 1));
  for (const n of ns) {
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("x", 10 + (n.x - minX) * scale);
    r.setAttribute("y", 10 + (n.y - minY) * scale);
    r.setAttribute("width", Math.max(4, 320 * scale));
    r.setAttribute("height", Math.max(3, 260 * scale));
    r.setAttribute("fill", selected.has(n.id) ? "#df643f" : "#b7c4a8");
    r.addEventListener("click", (e) => {
      e.stopPropagation();
      focusNodes([n]);
    });
    mini.append(r);
  }
}
function focusNodes(ns) {
  if (!ns.length) return;
  const r = $("#viewport").getBoundingClientRect();
  const left = Math.min(...ns.map((n) => n.x)),
    top = Math.min(...ns.map((n) => n.y)),
    right = Math.max(...ns.map((n) => n.x + (n.width || 320))),
    bottom = Math.max(
      ...ns.map(
        (n) =>
          n.y +
          ($("#nodes").querySelector(`[data-id="${n.id}"]`)?.offsetHeight ||
            400),
      ),
    );
  const z = Math.min(
    1.1,
    Math.max(
      0.15,
      Math.min(
        (r.width - 100) / (right - left),
        (r.height - 150) / (bottom - top),
      ),
    ),
  );
  board().view = {
    z,
    x: (r.width - (right - left) * z) / 2 - left * z,
    y: (r.height - (bottom - top) * z) / 2 - top * z + 20,
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
  if (e.button !== 0 || e.target.closest("button") || space) return;
  e.stopPropagation();
  window.dragging = true;
  if (!selected.has(n.id)) selectNode(n.id, e.shiftKey);
  checkpoint();
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
  const move = (ev) => {
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
  const up = () => {
    window.dragging = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    touch();
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
      `M${source.x + 320},${source.y + 30} L${p.x},${p.y}`,
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
function derive(source, type, point = { x: source.x + 390, y: source.y }) {
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
          for (const t of tasks.filter(
            (t) =>
              t.board_id === b.id &&
              t.node_id === n.id &&
              t.status === "completed",
          )) {
            if (n.versions?.some((v) => v.taskId === t.id)) continue;
            const url =
              t.kind === "image" ? t.local_image_url : t.local_video_url;
            if (!url) continue;
            const v = {
              id: t.id,
              taskId: t.id,
              kind: t.kind,
              url,
              createdAt: t.finished_at * 1000,
              snapshot: {
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
    renderTaskList();
    if (
      !document.activeElement.closest("textarea,input,select") &&
      !window.dragging
    ) {
      const chosen = new Set(selected);
      $("#nodes").replaceChildren(
        ...board()
          .nodes.filter((n) => !hiddenNode(n))
          .map((n) => {
            const old = $("#nodes").querySelector(`[data-id="${n.id}"]`);
            if (old?.dataset.signature === nodeSignature(n)) return old;
            return renderNode(n);
          }),
      );
      selected = chosen;
      drawEdges();
      renderShots();
    }
  } catch (e) {
    $("#task-count").title = e.message;
  }
}
function renderTaskList() {
  $("#task-list").replaceChildren(
    ...tasks
      .filter((t) => t.board_id === boardId)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 100)
      .map((t) => {
        const row = make("div", "task-row");
        const info = make("div");
        info.append(
          make(
            "p",
            "",
            `${statusName(t.status)} · ${node(t.node_id)?.name || "已移除节点"}`,
          ),
          make("small", "", t.prompt),
          make("small", "", t.error || "收费 / 退款状态请以供应商消费记录为准"),
        );
        row.append(
          info,
          button("定位", () => {
            if (node(t.node_id)) {
              focusNodes([node(t.node_id)]);
              $("#task-dialog").close();
            } else toast("源节点已移除，结果仍保留在旧版控制台历史中");
          }),
        );
        if (t.status === "paused")
          row.append(button("继续查询", () => resumeTask(t)));
        return row;
      }),
  );
}
async function uploadFiles(files, point = centerPoint()) {
  for (const [i, file] of [...files].entries()) {
    if (!file.type.match(/^(image|video)\//)) {
      toast("仅支持图片与视频素材");
      continue;
    }
    const form = new FormData();
    form.append("media", file, file.name);
    const result = await api("/api/library/assets", {
      method: "POST",
      body: form,
    });
    assets.push(result.asset);
    assetNode(result.asset, { x: point.x + i * 350, y: point.y });
  }
  toast("素材已保存到素材库并加入画板");
}
function assetNode(asset, point = centerPoint()) {
  return createNode(asset.kind, point, {
    source: true,
    name: asset.name,
    versions: [
      {
        id: uid(),
        assetId: asset.id,
        kind: asset.kind,
        url: asset.url,
        createdAt: Date.now(),
      },
    ],
  });
}
async function openLibrary() {
  const data = await api("/api/library");
  assets = data.assets;
  $("#library-dialog").showModal();
  renderAssets();
}
function renderAssets() {
  const q = $("#asset-search").value.toLowerCase(),
    kind = $("#asset-kind").value;
  const filtered = assets.filter(
    (a) =>
      (!kind || a.kind === kind) &&
      [a.name, tasks.find((t) => t.id === a.task_id)?.prompt]
        .join(" ")
        .toLowerCase()
        .includes(q),
  );
  $("#asset-list").replaceChildren(
    ...filtered.slice(0, 100).map((a) => {
      const b = button("", () => {
        assetNode(a);
        $("#library-dialog").close();
      });
      b.className = "asset-item";
      const media = make(a.kind === "image" ? "img" : "video");
      media.src = a.kind === "image" ? a.url + "?thumbnail=1" : a.url;
      media.loading = "lazy";
      if (a.kind === "video") {
        media.preload = "none";
        media.muted = true;
      }
      b.append(media, make("span", "", a.name));
      return b;
    }),
  );
  $("#library-note").textContent =
    `共 ${filtered.length} 个素材${filtered.length > 100 ? "，显示前 100 个，可搜索筛选" : ""}。点击加入画板，素材文件不会重复上传。`;
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
  assets.push(result.asset);
  const created = assetNode(result.asset, { x: n.x + 390, y: n.y });
  version(created).sourceFrame = {
    nodeId: n.id,
    name: n.name,
    version: source,
    time,
    mode,
  };
  touch();
  if (continueVideo) {
    const next = derive(created, "video", { x: n.x + 780, y: n.y });
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
  const snapshot = v.snapshot;
  editDialog(
    "版本参数 · 只读查看",
    [
      [
        "detail",
        "生成快照",
        "textarea",
        JSON.stringify(
          snapshot || v.sourceFrame || { source: "导入素材" },
          null,
          2,
        ),
      ],
    ],
    () => {},
  );
  $("#edit-fields textarea").readOnly = true;
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
    ...fields.flatMap(([key, label, type, value]) => {
      const l = make("label", "", label);
      l.htmlFor = "edit-" + key;
      const e = make(type === "textarea" ? "textarea" : "input");
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
      [
        "previous",
        "上一段提示词（仅上下文，不会自动提交）",
        "textarea",
        n.previousPrompt || "",
      ],
    ],
    (v) => {
      checkpoint();
      n.name = v.name.trim() || n.name;
      n.previousPrompt = v.previous;
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
function renderShots() {
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
function editShot(s) {
  editDialog(
    "镜头信息",
    [
      ["name", "镜头名称", "text", s.name],
      ["scene", "场景", "text", s.scene],
      ["description", "画面 / 动作 / 景别 / 运镜", "textarea", s.description],
      ["dialogue", "对白", "textarea", s.dialogue],
      ["duration", "目标时长（秒）", "text", s.duration],
    ],
    (v) => {
      checkpoint();
      Object.assign(s, v);
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
      width: Math.max(...ns.map((n) => n.x + 320)) - x + 25,
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
function duplicate() {
  if (!copyBuffer.length) return;
  checkpoint();
  const mapping = Object.fromEntries(copyBuffer.map((n) => [n.id, uid()]));
  const newNodes = clone(copyBuffer).map((n) => ({
    ...n,
    id: mapping[n.id],
    name: n.name + " 副本",
    x: n.x + 50,
    y: n.y + 50,
    runs: [],
    lastSubmission: "",
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
    if (e.target.closest("textarea,select")) return;
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
      ".node,.canvas-top,.navigation,#minimap,#empty,#reference-mode",
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
            n.x + 320 >= Math.min(a.x, b.x) &&
            n.x <= Math.max(a.x, b.x) &&
            n.y + 200 >= Math.min(a.y, b.y) &&
            n.y <= Math.max(a.y, b.y),
        )
        .forEach((n) => selected.add(n.id));
      document
        .querySelectorAll(".node")
        .forEach((n) =>
          n.classList.toggle("selected", selected.has(n.dataset.id)),
        );
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
  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
});
$("#viewport").addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length) {
    e.preventDefault();
    uploadFiles(e.dataTransfer.files, worldPoint(e.clientX, e.clientY)).catch(
      report,
    );
  }
});
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input,textarea,select,dialog")) return;
  if (e.code === "Space") {
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
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    save();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    history(
      e.shiftKey ? redoStack : undoStack,
      e.shiftKey ? undoStack : redoStack,
    );
  } else if ((e.metaKey || e.ctrlKey) && e.key === "c") {
    copyBuffer = [...selected].map(node).filter(Boolean).map(clone);
    toast("节点已复制");
  } else if ((e.metaKey || e.ctrlKey) && e.key === "v") {
    e.preventDefault();
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
document.addEventListener("paste", (e) => {
  if (e.target.closest("input,textarea")) return;
  const files = [...e.clipboardData.files];
  if (files.length) {
    e.preventDefault();
    uploadFiles(files).catch(report);
  }
});
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
  uploadFiles(e.target.files).catch(report);
  e.target.value = "";
};
$("#library-button").onclick = () => openLibrary().catch(report);
$("#asset-search").oninput = renderAssets;
$("#asset-kind").onchange = renderAssets;
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
      n.x = p.x + j * 390;
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
      ["action", "操作：留空 / 复制 / 归档 / 恢复归档", "text", ""],
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
  checkpoint();
  const s = {
    id: uid(),
    name: "镜头 " + (board().shots.length + 1),
    scene: "",
    duration: 5,
  };
  board().shots.push(s);
  activeShot = s.id;
  touch();
  renderShots();
  editShot(s);
};
$("#task-toggle").onclick = () => {
  $("#task-dialog").showModal();
  renderTaskList();
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
    else $("#save-state").textContent = "✓ 已保存到本机";
    const [library, health, price] = await Promise.allSettled([
      api("/api/library"),
      api("/api/health"),
      api("/api/provider-pricing"),
    ]);
    if (library.status === "fulfilled") assets = library.value.assets;
    if (health.status === "fulfilled")
      $("#provider-state").textContent = health.value.lingganya_ready
        ? "● 灵感鸭密钥已配置"
        : "○ 灵感鸭密钥未配置";
    if (price.status === "fulfilled") pricing = price.value;
    await poll();
    setInterval(poll, 5000);
  } catch (e) {
    loadFailed = true;
    $("#save-state").textContent = "加载失败，请刷新重试";
    report(e);
  }
}
boot();
