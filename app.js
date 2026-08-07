const state = { kind: 'image', files: [], timer: null };
const form = document.querySelector('#generation-form');
const prompts = document.querySelector('#prompts');
const profile = document.querySelector('#profile');
const gallery = document.querySelector('#gallery');
const fileInput = document.querySelector('#references');
const referenceUrls = document.querySelector('#reference-urls');

const MODEL_CATALOG = {
  'seedream50-pro-ark-direct': { label: 'Seedream 5.0 Pro · 2K', provider: 'ark', kind: 'image', accept: 'image/*', maxImages: 8, ratios: [], resolutions: [], intro: '使用 Seedream 5.0 Pro 生成图片。' },
  'seedream43-ark-direct': { label: 'Seedream 4.3 · 2K', provider: 'ark', kind: 'image', accept: 'image/*', maxImages: 8, ratios: [], resolutions: [], intro: '使用 Seedream 4.3 生成图片。' },
  'hfsy-gpt-image-2': { label: 'GPT Image 2 · 1K', group: 'HFSY API', provider: 'hfsy', kind: 'image', accept: 'image/*', maxImages: 6, ratios: ['1:1','5:4','9:16','16:9','4:3','3:2','4:5','3:4','2:3','21:9'], resolutions: ['1K'], intro: 'HFSY · GPT Image 2，支持最多 6 张参考图。' },
  'hfsy-gpt-image-2pro': { label: 'GPT Image 2 Pro · 2K / 4K', group: 'HFSY API', provider: 'hfsy', kind: 'image', accept: 'image/*', maxImages: 4, ratios: ['1:1','5:4','9:16','16:9','4:3','3:2','4:5','3:4','2:3','21:9'], resolutions: ['2K','4K'], intro: 'HFSY · GPT Image 2 Pro，支持原生 2K / 4K。' },
  'hfsy-nano-banana-2': { label: 'Nano Banana 2 · 1K / 2K / 4K', group: 'HFSY API', provider: 'hfsy', kind: 'image', accept: 'image/*', maxImages: 7, ratios: ['1:1','16:9','9:16','4:3','3:4','3:2','2:3','5:4','4:5','21:9','9:21','2:1','1:2'], resolutions: ['1K','2K','4K'], intro: 'HFSY · Nano Banana 2，支持多图参考。' },
  'hfsy-nano-banana-pro': { label: 'Nano Banana 2 Pro · 1K / 2K / 4K', group: 'HFSY API', provider: 'hfsy', kind: 'image', accept: 'image/*', maxImages: 7, ratios: ['1:1','16:9','9:16','4:3','3:4','3:2','2:3','5:4','4:5','21:9','9:21','2:1','1:2'], resolutions: ['1K','2K','4K'], intro: 'HFSY · Nano Banana Pro，面向高质量商业图片。' },
  'seedance-reference-video-ark-direct': { label: 'Seedance · Reference Video · 720p', provider: 'ark', kind: 'video', accept: 'image/*,video/*,audio/*', maxImages: 8, maxVideos: 8, maxAudios: 8, ratios: ['9:16','16:9','1:1'], resolutions: ['720p'], duration: [15,10,5], intro: '使用 Seedance 生成带音频的视频，支持图片、视频、音频参考。' },
  'hfsy-minimax-h3': { label: 'Minimax H3 · 视频', group: 'HFSY API', provider: 'hfsy', kind: 'video', accept: 'image/*,audio/*', maxImages: 5, maxVideos: 0, maxAudios: 1, promptLimit: 2000, ratios: ['9:16','16:9'], resolutions: ['large','small'], duration: [5,6,7,8,9,10,11,12,13,14,15], intro: 'HFSY · Minimax H3，支持图片＋单条音频参考，不支持视频参考。' }
};

function selectedModel() { return MODEL_CATALOG[profile.value]; }

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
  const isHfsy = model.provider === 'hfsy';
  document.querySelector('#dropzone').classList.remove('hidden');
  document.querySelector('#reference-preview').classList.remove('hidden');
  document.querySelector('#reference-urls-field').classList.toggle('hidden', !isHfsy);
  document.querySelector('#reference-hint').textContent = model.kind === 'video'
    ? (model.provider === 'hfsy' ? '可选，图片最多 5 张＋音频最多 1 条' : '可选，支持图 / 视频 / 音频')
    : `可选，参考图最多 ${model.maxImages} 张`;
  state.files = state.files.filter(file => model.accept.split(',').some(pattern => file.type.startsWith(pattern.replace('/*', '/'))));
  trimFilesToModel(model);
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
  referenceUrls.value = '';
  fileInput.value = '';
  applySelectedModel();
}

function trimFilesToModel(model) {
  const counts = { image: 0, video: 0, audio: 0 };
  state.files = state.files.filter(file => {
    const type = file.type.split('/')[0];
    const limit = model[`max${type[0].toUpperCase()}${type.slice(1)}s`] ?? 0;
    counts[type] += 1;
    return counts[type] <= limit;
  });
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
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) { const image = document.createElement('img'); image.src = url; image.alt = file.name; tile.append(image); }
    else if (file.type.startsWith('video/')) { const video = document.createElement('video'); video.src = url; video.muted = true; tile.append(video); }
    else { const label = document.createElement('b'); label.textContent = 'AUDIO'; tile.append(label); }
    const badge = document.createElement('b'); badge.textContent = file.type.split('/')[0].toUpperCase(); tile.append(badge);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'remove-reference'; remove.title = `移除 ${file.name}`; remove.setAttribute('aria-label', `移除 ${file.name}`); remove.textContent = '×';
    remove.addEventListener('click', () => { state.files.splice(index, 1); renderReferences(); });
    tile.append(remove);
    wrapper.append(tile);
  });
}
function updateFiles(incoming) {
  const model = selectedModel();
  const accepted = model.accept.split(',').map(value => value.replace('/*', '/'));
  const added = [...incoming].filter(file => accepted.some(prefix => file.type.startsWith(prefix)));
  const signature = file => `${file.name}-${file.size}-${file.lastModified}`;
  const known = new Set(state.files.map(signature));
  state.files = [...state.files, ...added.filter(file => !known.has(signature(file)))];
  trimFilesToModel(model);
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

  if (task.provider === 'hfsy') referenceUrls.value = (task.reference_files || []).map(reference => reference.url).filter(Boolean).join('\n');
  const references = task.provider === 'hfsy' ? [] : (task.reference_files || []).filter(reference => reference.url);
  const restored = await Promise.allSettled(references.map(async reference => {
    const response = await fetch(reference.url);
    if (!response.ok) throw new Error(reference.name || '参考素材');
    const blob = await response.blob();
    return new File([blob], reference.name || 'reference', { type: blob.type || reference.mime || 'application/octet-stream' });
  }));
  state.files = restored
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value)
    .slice(0, 8);
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
function taskCard(task) {
  const fragment = document.querySelector('#task-template').content.cloneNode(true);
  const card = fragment.querySelector('.task-card'); card.classList.add(task.status);
  const frame = fragment.querySelector('.media-frame');
  if (task.status === 'completed' && task.kind === 'image' && (task.local_image_url || task.image_url)) {
    const imageUrl = task.local_image_url || task.image_url;
    const openPreview = document.createElement('button');
    openPreview.type = 'button'; openPreview.className = 'image-preview-trigger'; openPreview.title = '点击放大预览';
    const image = document.createElement('img'); image.src = imageUrl; image.alt = task.prompt; image.loading = 'lazy';
    openPreview.append(image); openPreview.addEventListener('click', () => showImagePreview(imageUrl, task.prompt));
    frame.replaceChildren(openPreview);
  } else if (task.status === 'completed' && task.kind === 'video' && (task.local_video_url || task.video_url)) {
    const video = document.createElement('video'); video.src = task.local_video_url || task.video_url; video.controls = true; video.preload = 'metadata'; frame.replaceChildren(video);
  } else if (task.status === 'failed') {
    frame.querySelector('.placeholder').textContent = '!';
  }
  const taskModel = MODEL_CATALOG[task.profile];
  fragment.querySelector('.task-kind').textContent = taskModel ? taskModel.label : (task.kind === 'video' ? 'VIDEO' : 'IMAGE');
  fragment.querySelector('.task-status').textContent = describeStatus(task);
  fragment.querySelector('.task-prompt').textContent = task.prompt;
  const promptDetails = fragment.querySelector('.task-prompt-details');
  if (task.kind === 'video') {
    promptDetails.hidden = false;
    promptDetails.querySelector('.task-prompt-full').textContent = task.prompt;
  }
  const actions = fragment.querySelector('.card-actions');
  if (task.status === 'completed' && task.kind === 'image' && (task.local_image_url || task.image_url)) actions.append(link('下载图片 ↓', task.local_image_url || task.image_url));
  if (task.status === 'completed' && task.kind === 'video' && (task.local_video_url || task.video_url)) actions.append(link('下载视频 ↓', task.local_video_url || task.video_url));
  const retry = document.createElement('button');
  retry.type = 'button'; retry.textContent = '带回输入重试 ↶'; retry.title = '带回模型、提示词和参考素材，不会直接提交生成';
  retry.addEventListener('click', () => restoreTaskInput(task));
  actions.append(retry);
  if (task.status === 'failed' && task.error) { const error = document.createElement('div'); error.className = 'error-detail'; error.textContent = task.error; actions.append(error); }
  return fragment.querySelector('.task-card');
}
function link(label, href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noreferrer'; a.textContent = label; return a; }
function taskSignature(task) {
  return [task.status, task.prompt, task.image_url, task.local_image_url, task.video_url, task.local_video_url, task.error].join('|');
}
async function loadTasks() {
  try {
    const response = await fetch('/api/tasks'); const { tasks } = await response.json();
    if (!tasks.length) {
      if (!gallery.querySelector('.empty')) gallery.innerHTML = '<div class="empty"><span>◌</span><p>还没有任务</p><small>从左侧输入提示词，第一张成片会出现在这里。</small></div>';
      return;
    }
    gallery.querySelector('.empty')?.remove();
    const current = new Map([...gallery.querySelectorAll('[data-task-id]')].map(card => [card.dataset.taskId, card]));
    tasks.forEach(task => {
      const signature = taskSignature(task);
      let card = current.get(task.id);
      if (!card || card.dataset.signature !== signature) {
        const nextCard = taskCard(task);
        nextCard.dataset.taskId = task.id;
        nextCard.dataset.signature = signature;
        card ? card.replaceWith(nextCard) : gallery.append(nextCard);
        card = nextCard;
      }
      // Moving the existing card preserves loaded media through polling.
      gallery.append(card);
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
    chip.className = `system-status ${ready ? 'ready' : 'error'}`;
    text.textContent = ready
      ? `${model.provider === 'hfsy' ? 'HFSY' : 'ARK'} 凭证已就绪 · ${data.workers} 个并发制作位`
      : model.provider === 'hfsy' ? '未找到 HFSY_API_KEY 配置' : (state.kind === 'video' ? '未找到 SEEDANCE_ARK_API_KEY 配置' : '未找到 ARK_API_KEY 配置');
    if (model.provider === 'hfsy' && !data.tos_ready) document.querySelector('#reference-hint').textContent = '未配置 TOS，可改填公网 URL';
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
  const payload = new FormData(form); payload.set('kind', state.kind); payload.set('prompts', prompt); payload.delete('references'); state.files.forEach(file => payload.append('references', file));
  try {
    const response = await fetch('/api/tasks', { method: 'POST', body: payload }); const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || '提交失败');
    prompts.value = ''; updateBatchCount(); await loadTasks();
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
document.querySelector('#refresh-button').addEventListener('click', loadTasks);
const previewDialog = document.querySelector('#image-preview-dialog');
function showImagePreview(url, prompt) {
  previewDialog.querySelector('img').src = url;
  previewDialog.querySelector('img').alt = prompt;
  previewDialog.querySelector('.preview-caption').textContent = prompt;
  previewDialog.showModal();
}
previewDialog.querySelector('[data-close-preview]').addEventListener('click', () => previewDialog.close());
previewDialog.addEventListener('click', event => { if (event.target === previewDialog) previewDialog.close(); });
setKind('image'); updateBatchCount(); loadTasks(); state.timer = setInterval(() => { updateHealth(); loadTasks(); }, 3500);
