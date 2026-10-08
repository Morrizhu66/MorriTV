"""Private TOS originals with small, movable local WebP previews."""
from __future__ import annotations

import io
import json
import threading
import uuid
from pathlib import Path
from typing import Callable

import tos_uploader


class CloudImages:
    def __init__(self, manifest: Path):
        self.manifest = Path(manifest)
        self._lock = threading.RLock()
        self._cache_stamp = None
        self._records = {}

    def _load(self):
        if not self.manifest.exists():
            return {}
        stat = self.manifest.stat()
        stamp = (stat.st_mtime_ns, stat.st_size)
        if stamp != self._cache_stamp:
            self._records = json.loads(self.manifest.read_text(encoding='utf-8'))
            self._cache_stamp = stamp
        return self._records

    def info(self, path: Path):
        if not path.is_file() or path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic'}:
            return None
        try:
            from PIL import Image
            with Image.open(path) as image:
                cloud_id = image.info.get('studio_cloud_id')
                description = str(image.getexif().get(270) or '') if image.format == 'WEBP' else ''
                if description.startswith('studio_cloud_id:'):
                    cloud_id = description.split(':', 1)[1]
            if not cloud_id:
                return None
            with self._lock:
                return self._load().get(cloud_id)
        except (OSError, ValueError):
            return None

    def persist(self, path: Path, read_value: Callable[[str], str], *, tos_module=None):
        """Only replace the original after its durable cloud record is saved."""
        with self._lock:
            existing = self.info(path)
            if existing:
                return existing
            if not tos_uploader.config_status(read_value)['ready']:
                raise RuntimeError('TOS 未配置，原图仍保存在本地')
            from PIL import Image, ImageOps
            # Decode before any upload; invalid/unsupported files remain intact.
            with Image.open(path) as opened:
                original_mime = Image.MIME.get(opened.format, 'application/octet-stream')
                image = ImageOps.exif_transpose(opened)
                image.thumbnail((480, 480), Image.Resampling.LANCZOS)
                image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
                cloud_id = uuid.uuid4().hex
                metadata = Image.Exif()
                metadata[270] = 'studio_cloud_id:' + cloud_id
                preview = io.BytesIO()
                image.save(preview, format='WEBP', quality=72, method=4, exif=metadata)
            uploaded = tos_uploader.upload_original(path, original_mime, read_value, tos_module=tos_module)
            record = {**uploaded, 'original_bytes': path.stat().st_size, 'thumbnail_bytes': len(preview.getvalue()), 'mime': original_mime, 'thumbnail_mime': 'image/webp'}
            records = dict(self._load())
            records[cloud_id] = record
            self.manifest.parent.mkdir(parents=True, exist_ok=True)
            temporary_manifest = self.manifest.with_suffix('.tmp')
            temporary_manifest.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
            temporary_manifest.replace(self.manifest)
            temporary = path.with_name(path.name + '.cloud-part')
            try:
                temporary.write_bytes(preview.getvalue())
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)
            return record

    def url(self, info, read_value, *, tos_module=None):
        return tos_uploader.original_url(info, read_value, tos_module=tos_module)
