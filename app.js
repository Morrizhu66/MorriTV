const state = {
  kind: 'image', files: [], timer: null, workspaceId: 'tasks', tasks: [],
  library: { folders: [], assets: [] }, inspirations: []
};
const form = document.querySelector('#generation-form');
const prompts = document.querySelector('#prompts');
const profile = document.querySelector('#profile');
const gallery = document.querySelector('#gallery');
const fileInput = document.querySelector('#references');
const productionTabs = document.querySelector('#production-tabs');
const assetGrid = document.querySelector('#asset-grid');
const taskVideoPreviewObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const video = entry.target;
    video.src = video.dataset.src;
    video.removeAttribute('data-src');
    taskVideoPreviewObserver.unobserve(video);
  });
}, { rootMargin: '320px 0px' }) : null;
const localVideoPreviewObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const video = entry.target;
    video.src = video.dataset.src;
    video.removeAttribute('data-src');
    localVideoPreviewObserver.unobserve(video);
  });
}, { rootMargin: '320px 0px' }) : null;

const MODEL_CATALOG = {
  'seedream50-pro-ark-direct': { label: 'Seedream 5.0 Pro · 2K', provider: 'ark', kind: 'image', accept: 'image/*', maxImages: 8, ratios: [], resolutions: [], intro: '使用 Seedream 5.0 Pro 生成图片。' },
  'seedream43-ark-direct': { label: 'Seedream 4.3 · 2K', provider: 'ark', kind: 'image', accept: 'image/*', maxImages: 8, ratios: [], resolutions: [], intro: '使用 Seedream 4.3 生成图片。' },
  'hfsy-gpt-image-2': { label: 'GPT Image 2 · 1K', group: 'HFSY API', provider: 'hfsy', kind: 'image', accept: 'image/*', maxImages: 6, ratios: ['1:1','5:4','9:16','16:9','4:3','3:2','4:5','3:4','2:3','21:9'], resolutions: ['1K'], intro: 'HFSY · GPT Image 2，支持最多 6 张参考图。' },
  'hfsy-gpt-image-2pro': { label: 'GPT Image 2 Pro · 2K / 4K', group: 'HFSY API', provider: 'hfsy', kind: 'image', accept: 'image/*', maxImages: 4, ratios: ['1:1','5:4','9:16','16:9','4:3','3:2','4:5','3:4','2:3','21:9'], resolutions: ['2K','4K'], intro: 'HFSY · GPT Image 2 Pro，支持原生 2K / 4K。' },
  'hfsy-nano-banana-2': { label: 'Nano Banana 2 · 1K / 2K / 4K', group: 'HFSY API', provider: 'hfsy', kind: 'image', accept: 'image/*', maxImages: 7, ratios: ['1:1','16:9','9:16','4:3','3:4','3:2','2:3','5:4','4:5','21:9','9:21','2:1','1:2'], resolutions: ['1K','2K','4K'], intro: 'HFSY · Nano Banana 2，支持多图参考。' },
  'hfsy-nano-banana-pro': { label: 'Nano Banana 2 Pro · 1K / 2K / 4K', group: 'HFSY API', provider: 'hfsy', kind: 'image', accept: 'image/*', maxImages: 7, ratios: ['1:1','16:9','9:16','4:3','3:4','3:2','2:3','5:4','4:5','21:9','9:21','2:1','1:2'], resolutions: ['1K','2K','4K'], intro: 'HFSY · Nano Banana Pro，面向高质量商业图片。' },
  'hfsy-sd-2-0': { label: 'SD 2.0 · 720P', group: 'HFSY API', provider: 'hfsy', kind: 'video', accept: 'image/*,video/*,audio/*', maxImages: 9, maxVideos: 3, maxAudios: 3, promptLimit: 5000, ratios: ['16:9','9:16','21:9','4:3','1:1','3:4'], resolutions: ['720p'], duration: [15,14,13,12,11,10,9,8,7,6,5,4], intro: 'HFSY · SD 2.0（sd-2.0），720P，支持图片、视频与音频混合参考。' },
  'hfsy-sd-2-5-720': { label: 'SD 2.5 · 720P', group: 'HFSY API', provider: 'hfsy', kind: 'video', accept: 'image/*,video/*,audio/*', maxImages: 30, maxVideos: 10, maxAudios: 10, promptLimit: 5000, ratios: ['16:9','9:16','4:3','1:1','3:4'], resolutions: ['720p'], duration: [30,29,28,27,26,25,24,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4], intro: 'HFSY · SD 2.5 720P（sd-2.5-720），支持图片、视频与音频混合参考。' },
  'seedance-reference-video-ark-direct': { label: 'Seedance · Reference Video · 720p', provider: 'ark', kind: 'video', accept: 'image/*,video/*,audio/*', maxImages: 8, maxVideos: 8, maxAudios: 8, ratios: ['9:16','16:9','1:1'], resolutions: ['720p'], duration: [15,10,5], intro: '使用 Seedance 生成带音频的视频，支持图片、视频、音频参考。' }
};

function selectedModel() { return MODEL_CATALOG[profile.value]; }

function loadTaskVideoPreview(video, source) {
  if (!taskVideoPreviewObserver) { video.src = source; return; }
  video.dataset.src = source;
  taskVideoPreviewObserver.observe(video);
}

function loadLocalVideoPreview(video, source) {
  if (!localVideoPreviewObserver) { video.src = source; return; }
  video.dataset.src = source;
  localVideoPreviewObserver.observe(video);
}

function renderUsage(usage) {
  document.querySelector('#usage-total').textContent = usage.total || 0;
  const rows = Object.entries(MODEL_CATALOG).map(([modelId, model]) => {
    const count = usage.counts?.[modelId] || 0; const target = usage.targets?.[modelId];
    const row = document.createElement('div'); row.className = 'usage-row';
    if (target && count >= target) row.classList.add('over'); else if (target && count >= target * .8) row.classList.add('warning');
    const copy = document.createElement('div'); const label = document.createElement('span'); label.textContent = model.label;
    const amount = document.createElement('strong'); amount.textContent = target ? `${count} / ${target}` : `${count} · 未设目标`; copy.append(label, amount);
    const track = document.createElement('i'); const fill = document.createElement('b'); fill.style.width = target ? `${Math.min(100, count / target * 100)}%` : '0%'; track.append(fill);
    row.append(copy, track); return row;
  });
  document.querySelector('#usage-list').replaceChildren(...rows);
}

async function loadUsage() {
  try { const response = await fetch('/api/usage'); const usage = await response.json(); if (!response.ok) throw new Error(); renderUsage(usage); }
  catch { document.querySelector('#usage-total').textContent = '—'; }
}

function renderModelOptions(kind) {
  profile.replaceChildren();
  const groups = new Map();
  Object.entries(MODEL_CATALOG).filter(([, model]) => model.kind === kind).forEach(([value, model]) => {
    const groupName = model.group || (model.provider === 'ark' ? 'ARK / 方舟' : model.provider);
    if (!groups.has(groupName)) { const group = document.createElement('optgroup'); group.label = groupName; groups.set(groupName, group); profile.append(group); }
    const option = document.createElement('option'); option.value = value; option.textContent = model.label; groups.get(groupName).append(option);
  });
}

function setOptions(selector, values, formatter = value => value) {
  const select = document.querySelector(selector);
  select.replaceChildren(...values.map(value => { const option = document.createElement('option'); option.value = value; option.textContent = formatter(value); return option; }));
}

function applySelectedModel() {
  const model = selectedModel();
  if (!model) return;
  document.querySelector('#intro').textContent = model.intro;
  const showOptions = model.ratios.length > 0;
  document.querySelector('#generation-options').classList.toggle('hidden', !showOptions);
  document.querySelector('#duration-field').classList.toggle('hidden', !model.duration);
  setOptions('#ratio', model.ratios);
  setOptions('#resolution', model.resolutions, value => value === 'large' ? '高画质' : value === 'small' ? '标准画质' : value);
  setOptions('#duration', model.duration || [], value => `${value} 秒`);
  fileInput.accept = model.accept;
  document.querySelector('#dropzone').classList.remove('hidden');
  document.querySelector('#reference-preview').classList.remove('hidden');
  document.querySelector('#reference-hint').textContent = model.kind === 'video'
    ? (model.provider === 'hfsy' ? `可选，图片最多 ${model.maxImages} 张＋视频最多 ${model.maxVideos} 条＋音频最多 ${model.maxAudios} 条` : '可选，支持图 / 视频 / 音频')
    : `可选，参考图最多 ${model.maxImages} 张`;
  state.files = state.files.filter(file => model.accept.split(',').some(pattern => file.type.startsWith(pattern.replace('/*', '/'))));
  renderReferences();
  updateHealth();
}

function setKind(kind) {
  state.kind = kind;
  document.querySelectorAll('.mode').forEach(button => button.classList.toggle('active', button.dataset.kind === kind));
  const isVideo = kind === 'video';
  document.querySelector('#kind-label').textContent = isVideo ? '/ MOTION' : '/ IMAGE';
  document.querySelector('#title').innerHTML = isVideo ? '把静止瞬间<br /><i>做成镜头。</i>' : '把一个想法<br /><i>做成图像。</i>';
  document.querySelector('#prompt-hint').textContent = '整段提示词会作为一次生成提交 · 支持自由换行';
  renderModelOptions(kind);
  state.files = [];
  fileInput.value = '';
  applySelectedModel();
}

function updateBatchCount() {
  document.querySelector('#batch-count').textContent = '当前任务 / 01';
  document.querySelector('#submit-count').textContent = '01';
}
function renderReferences() {
  const wrapper = document.querySelector('#reference-preview');
  wrapper.replaceChildren();
  state.files.forEach((file, index) => {
    const tile = document.createElement('div'); tile.className = 'thumb';
    tile.draggable = true; tile.dataset.index = index;
    const order = document.createElement('span'); order.className = 'reference-order'; order.textContent = String(index + 1).padStart(2, '0'); tile.append(order);
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) { const image = document.createElement('img'); image.src = url; image.alt = file.name; tile.append(image); }
    else if (file.type.startsWith('video/')) { const video = document.createElement('video'); video.src = url; video.muted = true; tile.append(video); }
    else { const label = document.createElement('b'); label.textContent = 'AUDIO'; tile.append(label); }
    const badge = document.createElement('b'); badge.textContent = file.type.split('/')[0].toUpperCase(); tile.append(badge);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'remove-reference'; remove.title = `移除 ${file.name}`; remove.setAttribute('aria-label', `移除 ${file.name}`); remove.textContent = '×';
    remove.addEventListener('click', () => { state.files.splice(index, 1); renderReferences(); });
    tile.append(remove);
    tile.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', String(index)); tile.classList.add('dragging'); });
    tile.addEventListener('dragend', () => tile.classList.remove('dragging'));
    tile.addEventListener('dragover', event => event.preventDefault());
    tile.addEventListener('drop', event => { event.preventDefault(); moveReference(Number(event.dataTransfer.getData('text/plain')), index); });
    wrapper.append(tile);
  });
}
function moveReference(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= state.files.length || toIndex >= state.files.length) return;
  const [file] = state.files.splice(fromIndex, 1); state.files.splice(toIndex, 0, file); renderReferences();
}
function updateFiles(incoming) {
  const model = selectedModel();
  const accepted = model.accept.split(',').map(value => value.replace('/*', '/'));
  const added = [...incoming].filter(file => accepted.some(prefix => file.type.startsWith(prefix)));
  const signature = file => `${file.name}-${file.size}-${file.lastModified}`;
  const known = new Set(state.files.map(signature));
  state.files = [...state.files, ...added.filter(file => !known.has(signature(file)))];
  fileInput.value = ''; // 允许移除后再次选择同一个文件
  renderReferences();
}

function setSelectValue(selector, value) {
  const select = document.querySelector(selector);
  if (value && [...select.options].some(option => option.value === String(value))) select.value = String(value);
}

async function restoreTaskInput(task) {
  const error = document.querySelector('#form-error');
  error.textContent = '';
  setKind(task.kind);
  setSelectValue('#profile', task.profile);
  applySelectedModel();
  setSelectValue('#ratio', task.ratio);
  setSelectValue('#duration', task.duration);
  setSelectValue('#resolution', task.resolution);
  prompts.value = task.prompt;
  updateBatchCount();

  const references = (task.reference_files || []).filter(reference => reference.url);
  const restored = await Promise.allSettled(references.map(async reference => {
    const response = await fetch(reference.url);
    if (!response.ok) throw new Error(reference.name || '参考素材');
    const blob = await response.blob();
    return new File([blob], reference.name || 'reference', { type: blob.type || reference.mime || 'application/octet-stream' });
  }));
  state.files = restored
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);
  renderReferences();

  const missing = (task.reference_files || []).length - state.files.length;
  error.textContent = missing
    ? `提示词已带回；${state.files.length} 个参考素材已恢复，${missing} 个素材找不到了。`
    : `已带回提示词与 ${state.files.length} 个参考素材，请确认后再提交。`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function describeStatus(task) {
  return { queued: '等待中', running: '制作中', completed: '已完成', failed: '失败' }[task.status] || task.status;
}
function updateQueueOverview(tasks) {
  const counts = tasks.reduce((result, task) => {
    result[task.status] = (result[task.status] || 0) + 1;
    return result;
  }, {});
  document.querySelector('#count-total').textContent = tasks.length;
  document.querySelector('#count-active').textContent = (counts.queued || 0) + (counts.running || 0);
  document.querySelector('#count-completed').textContent = counts.completed || 0;
  document.querySelector('#count-failed').textContent = counts.failed || 0;
}

function setLibraryError(message = '') {
  document.querySelector('#library-error').textContent = message;
}

async function libraryRequest(path, options = {}) {
  const response = await fetch(path, options);
  let data = {};
  try { data = await response.json(); } catch { /* A readable fallback is shown below. */ }
  if (!response.ok || data.ok === false) throw new Error(data.error || '收藏夹操作失败');
  return data;
}

async function urlToFile(item) {
  const response = await fetch(item.url);
  if (!response.ok) throw new Error(`素材读取失败：${item.name || '未命名素材'}`);
  const blob = await response.blob();
  return new File([blob], item.name || 'reference', { type: blob.type || item.mime || 'application/octet-stream' });
}

async function loadInspirations() {
  try {
    const response = await fetch('/api/inspirations'); const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || '灵感库加载失败');
    state.inspirations = data.items || []; renderInspirations(); renderWorkspaceTabs();
  } catch (error) { document.querySelector('#inspiration-error').textContent = error.message || '灵感库加载失败'; }
}

async function saveInspiration(task) {
  const response = await fetch('/api/inspirations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: task.id }) });
  const data = await response.json(); if (!response.ok || data.ok === false) throw new Error(data.error || '保存灵感失败');
  await loadInspirations(); setWorkspace('inspirations');
}

async function restoreInspiration(item) {
  setKind('video'); setSelectValue('#profile', item.profile); applySelectedModel();
  setSelectValue('#ratio', item.ratio); setSelectValue('#duration', item.duration); setSelectValue('#resolution', item.resolution);
  prompts.value = item.prompt; updateBatchCount();
  const restored = await Promise.allSettled((item.references || []).map(urlToFile));
  state.files = restored.filter(result => result.status === 'fulfilled').map(result => result.value); renderReferences();
  const missing = (item.references || []).length - state.files.length;
  document.querySelector('#form-error').textContent = missing ? `已复刻 Prompt；${missing} 个参考素材读取失败。` : `已复刻 Prompt 与 ${state.files.length} 个有序参考素材，请确认后再提交。`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteInspiration(item) {
  if (!window.confirm('删除这条视频灵感？原任务和原素材不会受影响。')) return;
  await libraryRequest(`/api/inspirations/${item.id}`, { method: 'DELETE' }); await loadInspirations();
}

function renderInspirations() {
  const grid = document.querySelector('#inspiration-grid'); grid.replaceChildren();
  if (!state.inspirations.length) {
    const empty = document.createElement('div'); empty.className = 'library-empty'; empty.innerHTML = '<span>✦</span><p>还没有视频灵感</p><small>在已完成的视频任务中点击“存入灵感库”。</small>'; grid.append(empty); return;
  }
  state.inspirations.forEach(item => {
    const card = document.createElement('article'); card.className = 'inspiration-card';
    const video = document.createElement('video'); video.controls = true; video.preload = 'metadata'; loadLocalVideoPreview(video, item.video_url);
    const body = document.createElement('div'); body.className = 'inspiration-body';
    const prompt = document.createElement('p'); prompt.textContent = item.prompt;
    const meta = document.createElement('small'); meta.textContent = `${item.ratio} · ${item.duration}s · ${item.references.length} 张参考图`;
    const refs = document.createElement('div'); refs.className = 'inspiration-references';
    item.references.forEach((reference, index) => { const image = document.createElement('img'); image.src = reference.url; image.alt = `${index + 1}. ${reference.name}`; image.loading = 'lazy'; refs.append(image); });
    const actions = document.createElement('div'); actions.className = 'asset-actions';
    const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'inspiration-restore'; restore.textContent = '一键复刻'; restore.addEventListener('click', () => restoreInspiration(item));
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'copy-prompt'; copy.textContent = '复制 Prompt';
    copy.addEventListener('click', () => copyPrompt(item.prompt, copy).catch(error => { document.querySelector('#inspiration-error').textContent = error.message || '复制失败'; }));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-action'; remove.textContent = '删除灵感'; remove.addEventListener('click', () => deleteInspiration(item).catch(error => { document.querySelector('#inspiration-error').textContent = error.message; }));
    actions.append(restore, copy, remove); body.append(prompt, meta, refs, actions); card.append(video, body); grid.append(card);
  });
}

function activeFolderId() {
  return ['tasks', 'inspirations'].includes(state.workspaceId) ? '' : state.workspaceId;
}

function activeFolder() {
  return state.library.folders.find(folder => folder.id === activeFolderId());
}

function setWorkspace(workspaceId) {
  const valid = ['tasks', 'inspirations'].includes(workspaceId) || state.library.folders.some(folder => folder.id === workspaceId);
  state.workspaceId = valid ? workspaceId : 'tasks';
  const folder = activeFolder();
  const showingInspirations = state.workspaceId === 'inspirations';
  document.querySelector('#task-view').classList.toggle('hidden', Boolean(folder) || showingInspirations);
  document.querySelector('#inspiration-view').classList.toggle('hidden', !showingInspirations);
  document.querySelector('#library-view').classList.toggle('hidden', !folder);
  document.querySelector('#workspace-target strong').textContent = showingInspirations ? '视频灵感' : (folder?.name || '成片区');
  document.querySelector('#active-folder-name').textContent = folder?.name || '收藏夹';
  renderWorkspaceTabs();
  renderLibraryAssets();
  if (showingInspirations) loadInspirations(); else loadTasks();
}

function renderWorkspaceTabs() {
  const entries = [{ id: 'tasks', name: '成片区' }, { id: 'inspirations', name: '视频灵感' }, ...state.library.folders];
  const buttons = entries.map(entry => {
    const button = document.createElement('button');
    button.type = 'button'; button.role = 'tab'; button.className = 'production-tab';
    button.dataset.workspaceId = entry.id;
    button.classList.toggle('active', state.workspaceId === entry.id);
    button.setAttribute('aria-selected', String(state.workspaceId === entry.id));
    const label = document.createElement('span'); label.textContent = entry.name; button.append(label);
    if (entry.id === 'inspirations') {
      const count = document.createElement('strong'); count.textContent = state.inspirations.length; button.id = 'inspiration-tab'; button.append(count);
    } else if (entry.id !== 'tasks') {
      const count = document.createElement('strong');
      count.textContent = state.library.assets.filter(asset => asset.folder_id === entry.id).length;
      button.append(count);
    }
    return button;
  });
  const add = document.createElement('button');
  add.type = 'button'; add.id = 'create-folder-button'; add.className = 'production-tab workspace-add'; add.textContent = '＋'; add.title = '新建收藏夹';
  productionTabs.replaceChildren(...buttons, add);
}

function visibleLibraryAssets() {
  const folderId = activeFolderId();
  return folderId ? state.library.assets.filter(asset => asset.folder_id === folderId) : [];
}

function folderName(folderId) {
  if (!folderId) return '成片区';
  return state.library.folders.find(folder => folder.id === folderId)?.name || '未知收藏夹';
}

function promptForAsset(asset) {
  if (!asset.task_id) return '';
  return String(state.tasks.find(task => task.id === asset.task_id)?.prompt || '');
}

async function copyPrompt(text, button) {
  if (!text) return;
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  else {
    const field = document.createElement('textarea');
    field.value = text; field.setAttribute('readonly', ''); field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.append(field); field.select(); document.execCommand('copy'); field.remove();
  }
  const label = button.textContent;
  button.textContent = '已复制 ✓';
  window.setTimeout(() => { button.textContent = label; }, 1200);
}

function assetSignature(asset) {
  return [asset.kind, asset.name, asset.url, asset.folder_id, asset.source, promptForAsset(asset)].join('|');
}

function openMoveDialog(asset) {
  const dialog = document.querySelector('#move-asset-dialog');
  const select = dialog.querySelector('#move-folder-select');
  dialog.dataset.assetId = asset.id;
  dialog.querySelector('.move-asset-name').textContent = asset.name;
  select.replaceChildren();
  const unfiled = document.createElement('option'); unfiled.value = ''; unfiled.textContent = '成片区'; select.append(unfiled);
  state.library.folders.forEach(folder => {
    const option = document.createElement('option'); option.value = folder.id; option.textContent = folder.name; select.append(option);
  });
  select.value = asset.folder_id || '';
  dialog.querySelector('.dialog-error').textContent = '';
  dialog.showModal();
}

function renderLibraryAssets() {
  const assets = visibleLibraryAssets();
  const current = new Map([...assetGrid.querySelectorAll('[data-asset-id]')].map(card => [card.dataset.assetId, card]));
  assetGrid.querySelector('.library-empty')?.remove();
  if (!assets.length) {
    current.forEach(card => card.remove());
    if (!assetGrid.querySelector('.library-empty')) {
      const empty = document.createElement('div'); empty.className = 'library-empty';
      empty.innerHTML = '<span>◇</span><p>这个收藏夹还是空的</p><small>导入图片或视频，或从任务卡把成片放进来。</small>';
      assetGrid.append(empty);
    }
    return;
  }
  assets.forEach((asset, index) => {
    const signature = assetSignature(asset);
    let card = current.get(asset.id);
    if (card?.dataset.signature === signature) {
      const slot = assetGrid.children[index];
      if (slot !== card) assetGrid.insertBefore(card, slot || null);
      current.delete(asset.id);
      return;
    }
    const nextCard = document.createElement('article'); nextCard.className = 'asset-card'; nextCard.dataset.assetId = asset.id; nextCard.dataset.signature = signature;
    card ? card.replaceWith(nextCard) : assetGrid.append(nextCard);
    card = nextCard;
    const frame = document.createElement('div'); frame.className = 'asset-media';
    const media = document.createElement(asset.kind === 'video' ? 'video' : 'img');
    if (asset.kind === 'video') { media.controls = true; media.preload = 'metadata'; loadLocalVideoPreview(media, asset.url); frame.append(media); }
    else {
      media.src = asset.url; media.alt = asset.name; media.loading = 'lazy';
      const preview = document.createElement('button'); preview.type = 'button'; preview.title = '查看大图';
      preview.append(media); preview.addEventListener('click', () => showImagePreview(asset.url, asset.name)); frame.append(preview);
    }
    const kind = document.createElement('span'); kind.className = 'asset-kind'; kind.textContent = asset.kind === 'video' ? 'VIDEO' : 'IMAGE'; frame.append(kind);
    const body = document.createElement('div'); body.className = 'asset-body';
    const title = document.createElement('p'); title.textContent = asset.name; title.title = asset.name;
    const meta = document.createElement('small'); meta.textContent = `${asset.source === 'generated' ? '生成成片' : '本地导入'} · ${folderName(asset.folder_id)}`;
    const prompt = promptForAsset(asset);
    let promptDetails = null;
    if (prompt) {
      promptDetails = document.createElement('details'); promptDetails.className = 'asset-prompt-details';
      const summary = document.createElement('summary'); summary.textContent = '完整提示词';
      const fullPrompt = document.createElement('p'); fullPrompt.className = 'asset-prompt-full'; fullPrompt.textContent = prompt;
      promptDetails.append(summary, fullPrompt);
    }
    const actions = document.createElement('div'); actions.className = 'asset-actions';
    const organize = document.createElement('button'); organize.type = 'button'; organize.textContent = asset.folder_id ? '更换收藏夹' : '放入收藏夹';
    organize.addEventListener('click', () => openMoveDialog(asset));
    if (asset.kind === 'image') {
      const use = document.createElement('button'); use.type = 'button'; use.className = 'use-as-reference'; use.textContent = '填入输入框';
      use.addEventListener('click', () => appendAssetToComposer(asset).catch(error => setLibraryError(error.message)));
      actions.append(use);
    }
    if (prompt) {
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'copy-prompt'; copy.textContent = '复制 Prompt';
      copy.addEventListener('click', () => copyPrompt(prompt, copy).catch(error => setLibraryError(error.message || '复制失败')));
      actions.append(copy);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-action'; remove.textContent = '移入回收站';
    remove.addEventListener('click', () => deleteLibraryAsset(asset).catch(error => setLibraryError(error.message)));
    actions.prepend(link('下载 ↘', asset.url), organize); actions.append(remove);
    body.append(title, meta); if (promptDetails) body.append(promptDetails); body.append(actions); card.append(frame, body);
    const slot = assetGrid.children[index];
    if (slot !== card) assetGrid.insertBefore(card, slot || null);
    current.delete(asset.id);
  });
  current.forEach(card => card.remove());
}

async function appendAssetToComposer(asset) {
  if (asset.kind !== 'image') return;
  const file = await urlToFile({ url: asset.url, name: asset.name || asset.file_name, mime: 'image/*' });
  state.files.push(file); renderReferences();
  document.querySelector('.composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelector('#form-error').textContent = `已把“${asset.name}”追加为第 ${state.files.length} 个参考素材。`;
}

async function appendTaskImageToComposer(task) {
  const url = task.local_image_url || task.image_url;
  const file = await urlToFile({ url, name: `${task.id}.png`, mime: 'image/*' });
  state.files.push(file); renderReferences();
  document.querySelector('.composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelector('#form-error').textContent = `已把这张成片追加为第 ${state.files.length} 个参考素材。`;
}

async function loadLibrary() {
  try {
    const data = await libraryRequest('/api/library');
    state.library = { folders: data.folders || [], assets: data.assets || [] };
    if (!['tasks', 'inspirations'].includes(state.workspaceId) && !state.library.folders.some(folder => folder.id === state.workspaceId)) state.workspaceId = 'tasks';
    renderWorkspaceTabs();
    renderLibraryAssets();
    const folder = activeFolder();
    const showingInspirations = state.workspaceId === 'inspirations';
    document.querySelector('#task-view').classList.toggle('hidden', Boolean(folder) || showingInspirations);
    document.querySelector('#inspiration-view').classList.toggle('hidden', !showingInspirations);
    document.querySelector('#library-view').classList.toggle('hidden', !folder);
    document.querySelector('#workspace-target strong').textContent = showingInspirations ? '视频灵感' : (folder?.name || '成片区');
    document.querySelector('#active-folder-name').textContent = folder?.name || '收藏夹';
    setLibraryError('');
  } catch (error) { setLibraryError(error.message || '素材收藏夹加载失败'); }
}

async function createFolder(name) {
  const data = await libraryRequest('/api/library/folders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
  });
  await loadLibrary();
  setWorkspace(data.folder.id);
  return data.folder;
}

async function deleteActiveFolder() {
  const folder = activeFolder();
  if (!folder) return;
  if (!window.confirm(`删除收藏夹“${folder.name}”？里面的素材会保留并迁回成片区。`)) return;
  await libraryRequest(`/api/library/folders/${folder.id}`, { method: 'DELETE' });
  state.workspaceId = 'tasks';
  await Promise.all([loadLibrary(), loadTasks()]);
}

async function importLibraryFiles(files) {
  const accepted = [...files].filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
  const folderId = activeFolderId();
  if (!folderId) throw new Error('请先进入一个收藏夹再导入素材');
  for (const file of accepted) {
    const formData = new FormData(); formData.append('folder_id', folderId); formData.append('media', file);
    await libraryRequest('/api/library/assets', { method: 'POST', body: formData });
  }
  await loadLibrary();
}

async function moveLibraryAsset(assetId, folderId) {
  await libraryRequest(`/api/library/assets/${assetId}/move`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: folderId })
  });
  await loadLibrary();
  await loadTasks();
}

async function deleteTask(task) {
  if (!window.confirm('把这条任务、成片和保存的参考素材移入回收站？')) return;
  await libraryRequest(`/api/tasks/${task.id}`, { method: 'DELETE' });
  await Promise.all([loadTasks(), loadLibrary()]);
}

async function deleteLibraryAsset(asset) {
  const message = asset.task_id ? '这条生成任务和成片会一起移入回收站，继续吗？' : '把这个素材移入回收站？';
  if (!window.confirm(message)) return;
  await libraryRequest(`/api/library/assets/${asset.id}`, { method: 'DELETE' });
  await Promise.all([loadLibrary(), loadTasks()]);
}

function taskCard(task) {
  const fragment = document.querySelector('#task-template').content.cloneNode(true);
  const card = fragment.querySelector('.task-card'); card.classList.add(task.status);
  card.setAttribute('aria-label', `${describeStatus(task)}：${task.prompt}`);
  const frame = fragment.querySelector('.media-frame');
  if (task.status === 'completed' && task.kind === 'image' && (task.local_image_url || task.image_url)) {
    const imageUrl = task.local_image_url || task.image_url;
    const openPreview = document.createElement('button');
    openPreview.type = 'button'; openPreview.className = 'image-preview-trigger'; openPreview.title = '点击放大预览';
    const image = document.createElement('img'); image.src = imageUrl; image.alt = task.prompt; image.loading = 'lazy';
    openPreview.append(image); openPreview.addEventListener('click', () => showImagePreview(imageUrl, task.prompt));
    frame.querySelector('.placeholder').replaceWith(openPreview);
  } else if (task.status === 'completed' && task.kind === 'video' && (task.local_video_url || task.video_url)) {
    const video = document.createElement('video'); video.controls = true; video.preload = 'metadata'; frame.querySelector('.placeholder').replaceWith(video);
    loadTaskVideoPreview(video, task.local_video_url || task.video_url);
  } else if (task.status === 'failed') {
    frame.querySelector('.placeholder-mark').textContent = '!';
  }
  frame.querySelector('.placeholder-label')?.replaceChildren(document.createTextNode({
    queued: '等待制作位', running: '正在制作', completed: '成片已就绪', failed: '制作未完成'
  }[task.status] || '任务处理中'));
  const taskModel = MODEL_CATALOG[task.profile];
  const modelLabel = taskModel ? taskModel.label : (task.kind === 'video' ? 'VIDEO' : 'IMAGE');
  fragment.querySelector('.task-kind').textContent = modelLabel;
  fragment.querySelector('.task-kind').title = modelLabel;
  fragment.querySelector('.task-status').textContent = describeStatus(task);
  fragment.querySelector('.task-prompt').textContent = task.prompt;
  const promptDetails = fragment.querySelector('.task-prompt-details');
  promptDetails.querySelector('.task-prompt-full').textContent = task.prompt;
  const actions = fragment.querySelector('.card-actions');
  if (task.status === 'completed' && task.kind === 'image' && (task.local_image_url || task.image_url)) actions.append(link('下载成片 ↘', task.local_image_url || task.image_url));
  if (task.status === 'completed' && task.kind === 'video' && (task.local_video_url || task.video_url)) actions.append(link('下载成片 ↘', task.local_video_url || task.video_url));
  if (task.status === 'completed' && (task.local_image_url || task.local_video_url)) {
    const organize = document.createElement('button'); organize.type = 'button'; organize.className = 'organize-action'; organize.textContent = '放入收藏夹 +';
    organize.addEventListener('click', async () => {
      await loadLibrary();
      const asset = state.library.assets.find(item => item.task_id === task.id);
      if (!asset) { setLibraryError('这条成片尚未登记为本地素材，请刷新后重试。'); return; }
      if (asset.folder_id) setWorkspace(asset.folder_id);
      openMoveDialog(asset);
    });
    actions.append(organize);
  }
  if (task.status === 'completed' && task.kind === 'image' && (task.local_image_url || task.image_url)) {
    const use = document.createElement('button'); use.type = 'button'; use.className = 'use-as-reference'; use.textContent = '填入输入框';
    use.addEventListener('click', () => appendTaskImageToComposer(task).catch(error => window.alert(error.message || '素材读取失败'))); actions.append(use);
  }
  if (task.status === 'completed' && task.kind === 'video' && task.local_video_url) {
    const inspire = document.createElement('button'); inspire.type = 'button'; inspire.className = 'inspiration-save'; inspire.textContent = '存入灵感库';
    inspire.addEventListener('click', () => saveInspiration(task).catch(error => window.alert(error.message || '保存灵感失败'))); actions.append(inspire);
  }
  const retry = document.createElement('button');
  retry.type = 'button'; retry.className = 'retry-action'; retry.textContent = '再次制作 ↶'; retry.title = '带回模型、提示词和参考素材，不会直接提交生成';
  retry.addEventListener('click', () => restoreTaskInput(task));
  actions.append(retry);
  if (!['queued', 'running'].includes(task.status)) {
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-action'; remove.textContent = '移入回收站';
    remove.addEventListener('click', () => deleteTask(task).catch(error => window.alert(error.message || '删除失败')));
    actions.append(remove);
  }
  if (task.status === 'failed' && task.error) {
    const errorDetails = fragment.querySelector('.task-error-details');
    errorDetails.hidden = false;
    errorDetails.querySelector('.error-detail').textContent = task.error;
  }
  return fragment.querySelector('.task-card');
}
function link(label, href) { const a = document.createElement('a'); a.className = 'download-action'; a.href = href; a.target = '_blank'; a.rel = 'noreferrer'; a.textContent = label; return a; }
function taskSignature(task) {
  const libraryAsset = state.library.assets.find(asset => asset.task_id === task.id);
  return [task.status, task.prompt, task.image_url, task.local_image_url, task.video_url, task.local_video_url, task.error, libraryAsset?.folder_id || ''].join('|');
}
async function loadTasks() {
  try {
    const response = await fetch('/api/tasks'); const payload = await response.json();
    const tasks = payload.tasks.filter(task => task.status !== 'failed' || task.history_version >= 2);
    state.tasks = tasks;
    if (activeFolderId()) renderLibraryAssets();
    const workspaceTasks = state.workspaceId === 'tasks' ? tasks : tasks.filter(task => task.folder_id === activeFolderId());
    updateQueueOverview(workspaceTasks);
    const activeCount = workspaceTasks.filter(task => ['queued', 'running'].includes(task.status)).length;
    document.querySelector('#folder-task-status').textContent = activeCount
      ? `${activeCount} 个任务正在制作，完成后会自动出现在本页`
      : '当前页面生成的内容会自动进入这里';
    if (!workspaceTasks.length) {
      if (!gallery.querySelector('.empty')) gallery.innerHTML = '<div class="empty"><span>◌</span><p>还没有任务</p><small>从左侧输入提示词，第一张成片会出现在这里。</small></div>';
      return;
    }
    gallery.querySelector('.empty')?.remove();
    const current = new Map([...gallery.querySelectorAll('[data-task-id]')].map(card => [card.dataset.taskId, card]));
    workspaceTasks.forEach((task, index) => {
      const signature = taskSignature(task);
      let card = current.get(task.id);
      if (!card || card.dataset.signature !== signature) {
        const nextCard = taskCard(task);
        nextCard.dataset.taskId = task.id;
        nextCard.dataset.signature = signature;
        card ? card.replaceWith(nextCard) : gallery.append(nextCard);
        card = nextCard;
      }
      // Keep stable cards mounted so polling does not repaint loaded media.
      const slot = gallery.children[index];
      if (slot !== card) gallery.insertBefore(card, slot || null);
      current.delete(task.id);
    });
    current.forEach(card => card.remove());
  } catch { /* The health indicator makes offline state clear. */ }
}
async function updateHealth() {
  const text = document.querySelector('#health-text'); const chip = text.parentElement;
  if (window.location.protocol === 'file:') {
    chip.className = 'system-status error';
    text.textContent = '请双击 Start Model Studio.command 启动服务';
    return;
  }
  try {
    const data = await (await fetch('/api/health')).json();
    const model = selectedModel();
    const ready = model.provider === 'hfsy' ? data.hfsy_ready : (state.kind === 'video' ? data.video_ready : data.image_ready);
    const workerCount = data.workers[state.kind];
    chip.className = `system-status ${ready ? 'ready' : 'error'}`;
    text.textContent = ready
      ? `${model.provider === 'hfsy' ? 'HFSY' : 'ARK'} 凭证已就绪 · ${workerCount} 个并发制作位`
      : model.provider === 'hfsy' ? '未找到 HFSY_API_KEY 配置' : (state.kind === 'video' ? '未找到 SEEDANCE_ARK_API_KEY 配置' : '未找到 ARK_API_KEY 配置');
    if (model.provider === 'hfsy' && !data.tos_ready) document.querySelector('#reference-hint').textContent = '未配置 TOS，无法上传本地素材';
  } catch { chip.className = 'system-status error'; text.textContent = '本地服务不可用'; }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); const prompt = prompts.value.trim(); const error = document.querySelector('#form-error');
  if (window.location.protocol === 'file:') { error.textContent = '当前是文件预览页，无法调用模型。请双击 Start Model Studio.command。'; return; }
  if (!prompt) { error.textContent = '先写下一条你想制作的提示词。'; return; }
  const model = selectedModel();
  if (model.promptLimit && prompt.length > model.promptLimit) { error.textContent = `当前模型提示词不能超过 ${model.promptLimit} 字。`; return; }
  error.textContent = '';
  const submit = document.querySelector('#submit-button'); submit.disabled = true;
  const payload = new FormData(form); payload.set('kind', state.kind); payload.set('prompts', prompt); payload.set('folder_id', activeFolderId()); payload.delete('references'); state.files.forEach(file => payload.append('references', file));
  try {
    const response = await fetch('/api/tasks', { method: 'POST', body: payload }); const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || '提交失败');
    prompts.value = ''; updateBatchCount(); await Promise.all([loadTasks(), loadUsage()]);
    if (activeFolderId()) setLibraryError('任务已提交到当前收藏夹，完成后会自动出现在这里。');
  } catch (err) { error.textContent = err.message || '提交失败，请稍后重试。'; }
  finally { submit.disabled = false; }
});
document.querySelectorAll('.mode').forEach(button => button.addEventListener('click', () => { setKind(button.dataset.kind); updateHealth(); }));
profile.addEventListener('change', applySelectedModel);
prompts.addEventListener('input', updateBatchCount);
fileInput.addEventListener('change', event => updateFiles(event.target.files));
document.addEventListener('paste', event => {
  const images = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
  if (!images.length) return;
  event.preventDefault();
  updateFiles(images);
});
const dropzone = document.querySelector('#dropzone');
['dragenter','dragover'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave','drop'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', event => updateFiles(event.dataTransfer.files));
document.querySelector('#refresh-button').addEventListener('click', () => Promise.all([loadTasks(), loadLibrary(), loadInspirations()]));
const usageToggle = document.querySelector('#usage-toggle');
const usagePanel = document.querySelector('#usage-panel');
usageToggle.addEventListener('click', () => {
  const open = !usagePanel.classList.toggle('hidden');
  usageToggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', event => {
  if (!event.target.closest('.usage-wrap')) { usagePanel.classList.add('hidden'); usageToggle.setAttribute('aria-expanded', 'false'); }
});
productionTabs.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'create-folder-button') {
    const dialog = document.querySelector('#folder-dialog'); dialog.querySelector('#folder-name').value = ''; dialog.querySelector('.dialog-error').textContent = ''; dialog.showModal();
    return;
  }
  if (button.dataset.workspaceId) setWorkspace(button.dataset.workspaceId);
});
document.querySelector('#folder-form').addEventListener('submit', async event => {
  event.preventDefault(); const dialog = document.querySelector('#folder-dialog'); const error = dialog.querySelector('.dialog-error');
  try { await createFolder(dialog.querySelector('#folder-name').value); dialog.close(); }
  catch (cause) { error.textContent = cause.message || '收藏夹创建失败'; }
});
document.querySelector('#library-import').addEventListener('change', async event => {
  setLibraryError('');
  try { await importLibraryFiles(event.target.files); }
  catch (cause) { setLibraryError(cause.message || '素材导入失败'); }
  finally { event.target.value = ''; }
});
document.querySelector('#delete-folder-button').addEventListener('click', async () => {
  setLibraryError('');
  try { await deleteActiveFolder(); }
  catch (cause) { setLibraryError(cause.message || '收藏夹删除失败'); }
});
document.querySelector('#move-asset-form').addEventListener('submit', async event => {
  event.preventDefault(); const dialog = document.querySelector('#move-asset-dialog'); const error = dialog.querySelector('.dialog-error');
  try { await moveLibraryAsset(dialog.dataset.assetId, dialog.querySelector('#move-folder-select').value); dialog.close(); }
  catch (cause) { error.textContent = cause.message || '素材移动失败'; }
});
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
const previewDialog = document.querySelector('#image-preview-dialog');
function showImagePreview(url, prompt) {
  previewDialog.querySelector('img').src = url;
  previewDialog.querySelector('img').alt = prompt;
  previewDialog.querySelector('.preview-caption').textContent = prompt;
  previewDialog.showModal();
}
previewDialog.querySelector('[data-close-preview]').addEventListener('click', () => previewDialog.close());
previewDialog.addEventListener('click', event => { if (event.target === previewDialog) previewDialog.close(); });
setKind('image'); updateBatchCount(); loadUsage(); loadInspirations(); loadLibrary().then(loadTasks); setInterval(loadUsage, 30000); state.timer = setInterval(() => {
  updateHealth(); loadTasks(); if (activeFolderId()) loadLibrary();
}, 3500);
