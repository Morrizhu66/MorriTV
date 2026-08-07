const state = { kind: 'image', files: [], timer: null };
const form = document.querySelector('#generation-form');
const prompts = document.querySelector('#prompts');
const profile = document.querySelector('#profile');
const gallery = document.querySelector('#gallery');
const fileInput = document.querySelector('#references');

function setKind(kind) {
  state.kind = kind;
  document.querySelectorAll('.mode').forEach(button => button.classList.toggle('active', button.dataset.kind === kind));
  const isVideo = kind === 'video';
  document.querySelector('#kind-label').textContent = isVideo ? '/ MOTION' : '/ IMAGE';
  document.querySelector('#title').innerHTML = isVideo ? '把静止瞬间<br /><i>做成镜头。</i>' : '把一个想法<br /><i>做成图像。</i>';
  document.querySelector('#intro').textContent = isVideo ? '使用 Seedance 生成带音频的视频。支持图片、视频、音频参考素材。' : '使用 Seedream 直接生成。每次提交只生成一个任务。';
  document.querySelector('#prompt-hint').textContent = '整段提示词会作为一次生成提交 · 支持自由换行';
  document.querySelector('#video-options').classList.toggle('hidden', !isVideo);
  document.querySelector('#video-options').classList.toggle('video-options', isVideo);
  document.querySelector('#reference-hint').textContent = isVideo ? '可选，支持图 / 视频 / 音频' : '可选，支持多张图片';
  fileInput.accept = isVideo ? 'image/*,video/*,audio/*' : 'image/*';
  profile.innerHTML = isVideo
    ? '<option value="seedance-reference-video-ark-direct">Seedance · Reference Video · 1080p</option>'
    : '<option value="seedream50-pro-ark-direct">Seedream 5.0 Pro · 2K</option><option value="seedream43-ark-direct">Seedream 4.3 · 2K</option>';
  state.files = [];
  fileInput.value = '';
  renderReferences();
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
  const allowed = state.kind === 'video' ? /^(image|video|audio)\// : /^image\//;
  const added = [...incoming].filter(file => allowed.test(file.type));
  const signature = file => `${file.name}-${file.size}-${file.lastModified}`;
  const known = new Set(state.files.map(signature));
  state.files = [...state.files, ...added.filter(file => !known.has(signature(file)))].slice(0, 8);
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
  if (task.status === 'completed' && task.kind === 'image' && task.image_url) {
    const openPreview = document.createElement('button');
    openPreview.type = 'button'; openPreview.className = 'image-preview-trigger'; openPreview.title = '点击放大预览';
    const image = document.createElement('img'); image.src = task.image_url; image.alt = task.prompt; image.loading = 'lazy';
    openPreview.append(image); openPreview.addEventListener('click', () => showImagePreview(task.image_url, task.prompt));
    frame.replaceChildren(openPreview);
  } else if (task.status === 'completed' && task.kind === 'video' && (task.local_video_url || task.video_url)) {
    const video = document.createElement('video'); video.src = task.local_video_url || task.video_url; video.controls = true; video.preload = 'metadata'; frame.replaceChildren(video);
  } else if (task.status === 'failed') {
    frame.querySelector('.placeholder').textContent = '!';
  }
  fragment.querySelector('.task-kind').textContent = task.kind === 'video' ? 'SEEDANCE' : 'SEEDREAM';
  fragment.querySelector('.task-status').textContent = describeStatus(task);
  fragment.querySelector('.task-prompt').textContent = task.prompt;
  const promptDetails = fragment.querySelector('.task-prompt-details');
  if (task.kind === 'video') {
    promptDetails.hidden = false;
    promptDetails.querySelector('.task-prompt-full').textContent = task.prompt;
  }
  const actions = fragment.querySelector('.card-actions');
  if (task.status === 'completed' && task.kind === 'image' && task.image_url) actions.append(link('打开原图 ↗', task.image_url));
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
  return [task.status, task.prompt, task.image_url, task.video_url, task.local_video_url, task.error].join('|');
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
    const ready = state.kind === 'video' ? data.video_ready : data.image_ready;
    chip.className = `system-status ${ready ? 'ready' : 'error'}`;
    text.textContent = ready
      ? `${state.kind === 'video' ? 'Seedance 视频' : 'Seedream 图片'}凭证已就绪 · ${data.workers} 个并发制作位`
      : state.kind === 'video' ? '未找到 SEEDANCE_ARK_API_KEY 配置' : '未找到 ARK_API_KEY 配置';
  } catch { chip.className = 'system-status error'; text.textContent = '本地服务不可用'; }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); const prompt = prompts.value.trim(); const error = document.querySelector('#form-error');
  if (window.location.protocol === 'file:') { error.textContent = '当前是文件预览页，无法调用模型。请双击 Start Model Studio.command。'; return; }
  if (!prompt) { error.textContent = '先写下一条你想制作的提示词。'; return; }
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
updateBatchCount(); updateHealth(); loadTasks(); state.timer = setInterval(() => { updateHealth(); loadTasks(); }, 3500);
