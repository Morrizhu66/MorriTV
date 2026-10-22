"""Private-cloud workspace documents and immutable media, with local caches."""
from __future__ import annotations
import hashlib
import json
import mimetypes
import re
import threading
import time
import tempfile
import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import urlopen
import tos_uploader


class CloudWorkspace:
    DOCUMENTS = ('media-library.json', 'cloud-images.json', 'inspiration-library.json', 'task-history.jsonl')

    def __init__(self, root, images, read_value):
        self.root = Path(root)
        self.images = images
        self.read_value = read_value
        workspace = read_value('TOS_WORKSPACE_ID') or 'default'
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', workspace):
            raise ValueError('TOS_WORKSPACE_ID 格式无效')
        self.prefix = f'studio-workspaces/{workspace}/'
        self.path = self.root / 'cloud-workspace.json'
        self.lock = threading.RLock()
        self.document_lock = threading.RLock()
        self.wake = threading.Event()
        self.stop = threading.Event()
        self.data = json.loads(self.path.read_text()) if self.path.exists() else {'media': {}, 'documents': {}}
        self.data.setdefault('documents', {})
        self.data.setdefault('media', {})
        self.by_path = {}
        self.errors = {}
        self.attempts = {}
        self.missing = set()
        self.asset_ids = set()
        self.running = False
        self.active_uploads = 0
        self.library = None
        self.reference_cache = {}
        for record in self.data['media'].values():
            for url in record.get('urls', []):
                self.by_path[unquote(urlparse(url).path)] = record

    @property
    def ready(self):
        return tos_uploader.config_status(self.read_value)['ready']

    @staticmethod
    def encode(value):
        return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()

    def _write(self):
        temporary = self.path.with_suffix('.tmp')
        temporary.write_bytes(self.encode(self.data))
        temporary.replace(self.path)

    def _put(self, name, content):
        digest = hashlib.sha256(content).hexdigest()
        with self.document_lock:
            with self.lock:
                if self.data['documents'].get(name, {}).get('sha256') == digest:
                    return
            tos_uploader.put_document(self.prefix + name, content, self.read_value)
            with self.lock:
                self.data['documents'][name] = {'sha256': digest, 'saved_at': time.time()}
                self.errors.pop(name, None)
                self._write()

    def save_board(self, document):
        try:
            self._put('boards.json', self.encode(document))
        except Exception as exc:
            with self.lock:
                self.errors['boards.json'] = type(exc).__name__
            raise RuntimeError('云端暂时无法保存画板，修改已留在草稿中，将自动重试') from exc

    def restore_documents(self):
        """Recover missing caches; a newer cloud board wins after a crash."""
        if not self.ready:
            return
        for name in ('cloud-index.json', 'boards.json', *self.DOCUMENTS):
            target = self.root / name
            if name not in ('cloud-index.json', 'boards.json') and target.exists():
                continue
            raw = tos_uploader.get_document(self.prefix + name, self.read_value)
            if raw is None:
                continue
            if name == 'cloud-index.json':
                remote = json.loads(raw)
                with self.lock:
                    for asset_id, record in remote.get('media', {}).items():
                        self.data['media'].setdefault(asset_id, record)
                    for record in self.data['media'].values():
                        for url in record.get('urls', []):
                            self.by_path[unquote(urlparse(url).path)] = record
                    self._write()
                continue
            if name == 'boards.json' and target.exists():
                local = json.loads(target.read_bytes())
                if local.get('revision', 0) >= json.loads(raw).get('revision', 0):
                    continue
            if name.endswith('.json'):
                json.loads(raw)
            temporary = target.with_suffix('.restore-part')
            temporary.write_bytes(raw)
            temporary.replace(target)

    def info(self, path):
        try:
            url = '/media/' + Path(path).resolve().relative_to(self.root.resolve()).as_posix()
        except ValueError:
            return None
        with self.lock:
            record = self.by_path.get(url)
        return record or self.images.info(path)

    def url(self, info, read_value, **kwargs):
        return tos_uploader.original_url(info, read_value, **kwargs)

    def restore_cache(self, path):
        """Restore disposable media before a local move or recoverable deletion."""
        path = Path(path).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError('素材路径无效')
        if path.is_file():
            return
        record = self.info(path)
        if not record:
            return
        info = record.get('preview', record)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, suffix='.restore-part', delete=False) as output:
                temporary = Path(output.name)
                with urlopen(self.url(info, self.read_value), timeout=120) as response:
                    shutil.copyfileobj(response, output)
            if temporary.stat().st_size != info['original_bytes']:
                raise ValueError('云端素材下载不完整，请重试')
            temporary.replace(path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def persist_asset(self, asset):
        asset_id = asset['id']
        url = unquote(urlparse(asset.get('url', '')).path)
        if not url.startswith('/media/'):
            raise ValueError('只同步工作区内的素材')
        with self.lock:
            existing = self.data['media'].get(asset_id)
            if existing:
                if url not in existing['urls']:
                    existing['urls'].append(url)
                    self.by_path[url] = existing
                    self._write()
                self.missing.discard(asset_id)
                return
        source = (self.root / url.removeprefix('/media/')).resolve()
        if not source.is_relative_to(self.root.resolve()):
            raise ValueError('素材路径无效')
        if not source.is_file():
            with self.lock:
                self.missing.add(asset_id)
            return
        with self.lock:
            self.active_uploads += 1
        try:
            if asset.get('kind') == 'image' and not asset.get('keep_original'):
                original = dict(self.images.persist(source, self.read_value))
                # Cloud previews let a fresh machine browse without downloading originals.
                preview = tos_uploader.upload_original(source, 'image/webp', self.read_value)
                original['preview'] = {**preview, 'mime': 'image/webp', 'original_bytes': source.stat().st_size}
            else:
                mime = mimetypes.guess_type(source.name)[0] or 'video/mp4'
                original = {**tos_uploader.upload_original(source, mime, self.read_value),
                            'mime': mime, 'original_bytes': source.stat().st_size}
            record = {**original, 'urls': [url], 'kind': asset['kind'], 'cache_original': bool(asset.get('keep_original') or asset['kind'] != 'image')}
            with self.lock:
                self.data['media'][asset_id] = record
                self.by_path[url] = record
                self.errors.pop(asset_id, None)
                self.missing.discard(asset_id)
                self._write()
        finally:
            with self.lock:
                self.active_uploads -= 1

    def sync_documents(self):
        for name in self.DOCUMENTS:
            path = self.root / name
            if path.is_file():
                self._put(name, path.read_bytes())
        with self.lock:
            index = self.encode({'version': 1, 'media': self.data['media']})
        self._put('cloud-index.json', index)

    def _document_worker(self):
        while not self.stop.is_set():
            try:
                self.sync_documents()
                with self.lock:
                    self.errors.pop('documents', None)
            except Exception as exc:
                with self.lock:
                    self.errors['documents'] = type(exc).__name__
            self.stop.wait(3)

    def _sync_one(self, asset):
        with self.lock:
            self.attempts[asset['id']] = time.monotonic()
        try:
            self.persist_asset(asset)
        except Exception as exc:
            with self.lock:
                self.errors[asset['id']] = type(exc).__name__

    def _media_worker(self):
        with ThreadPoolExecutor(max_workers=3, thread_name_prefix='cloud-media') as pool:
            while not self.stop.is_set():
                self.wake.clear()
                assets = self.library.snapshot()['assets']
                with self.lock:
                    self.asset_ids = {a['id'] for a in assets}
                pending = []
                for asset in sorted(assets, key=lambda a: a.get('created_at', 0), reverse=True):
                    if asset['id'] in self.data['media']:
                        self.persist_asset(asset)  # Follow collection moves without reuploading.
                    elif time.monotonic() - self.attempts.get(asset['id'], -60) >= 60:
                        pending.append(asset)
                if pending:
                    list(pool.map(self._sync_one, pending[:12]))
                else:
                    self.wake.wait(30)

    def start(self, library):
        self.library = library
        self.asset_ids = {a['id'] for a in library.snapshot()['assets']}
        self.running = True
        threading.Thread(target=self._document_worker, daemon=True, name='cloud-documents').start()
        threading.Thread(target=self._media_worker, daemon=True, name='cloud-media-sync').start()
        threading.Thread(target=self._reference_worker, daemon=True, name='cloud-reference-sync').start()

    def _reference_worker(self):
        # Reference copies are immutable task inputs: keep local originals intact.
        # Hashing deduplicates the many repeated references across generations.
        allowed = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.mp4', '.mov', '.webm', '.m4v', '.mp3', '.wav', '.m4a', '.aac'}
        while not self.stop.is_set():
            roots = [self.root / 'uploads', *self.root.glob('collections/*/uploads')]
            for root in roots:
                for path in root.rglob('*'):
                    if self.stop.is_set():
                        return
                    if not path.is_file() or path.suffix.lower() not in allowed:
                        continue
                    try:
                        stat = path.stat()
                        stamp = (stat.st_size, stat.st_mtime_ns)
                        cached = self.reference_cache.get(str(path))
                        if cached and cached[0] == stamp:
                            continue
                        digest = hashlib.sha256()
                        with path.open('rb') as stream:
                            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                                digest.update(chunk)
                        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
                        self.persist_asset({'id': 'reference-' + digest.hexdigest(), 'kind': mime.split('/')[0],
                                            'url': '/media/' + path.relative_to(self.root).as_posix(), 'keep_original': True})
                        self.reference_cache[str(path)] = (stamp, digest.hexdigest())
                        with self.lock:
                            self.errors.pop('references', None)
                    except Exception as exc:
                        with self.lock:
                            self.errors['references'] = type(exc).__name__
                        break
            self.stop.wait(60)

    def status(self):
        with self.lock:
            stored = len(self.asset_ids & self.data['media'].keys())
            missing = len(self.asset_ids & self.missing)
            documents = self.data['documents']
            return {'ready': self.ready, 'stored': stored, 'pending': max(0, len(self.asset_ids) - stored - missing),
                    'missing': missing, 'errors': len(self.errors),
                    'sync': {'running': self.active_uploads > 0, 'synced': stored, 'failed': len(self.errors)},
                    'board_saved_at': documents.get('boards.json', {}).get('saved_at'),
                    'library_saved_at': documents.get('media-library.json', {}).get('saved_at')}
