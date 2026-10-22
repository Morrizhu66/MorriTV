from __future__ import annotations

import json
import mimetypes
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any, BinaryIO, Optional
from urllib.parse import unquote, urlparse


LIBRARY_VERSION = 1
ALLOWED_KINDS = {"image", "video"}


class MediaLibrary:
    """Persist media assets and map every collection to a real workspace."""

    def __init__(self, manifest_path: Path, results_dir: Path, collections_dir: Optional[Path] = None, *, restore_cache=None):
        self.manifest_path = Path(manifest_path)
        self.results_dir = Path(results_dir)
        self.collections_dir = Path(collections_dir or self.results_dir.parent / "collections")
        self._lock = threading.RLock()
        self._data = self._load()
        self.restore_cache = restore_cache

    def _load(self) -> dict[str, Any]:
        if not self.manifest_path.exists():
            return {"version": LIBRARY_VERSION, "folders": [], "assets": []}
        try:
            data = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            raise RuntimeError("素材库清单损坏，无法读取") from exc
        if not isinstance(data, dict) or not isinstance(data.get("folders"), list) or not isinstance(data.get("assets"), list):
            raise RuntimeError("素材库清单格式无效")
        data["version"] = LIBRARY_VERSION
        return data

    def _write(self) -> None:
        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.manifest_path.with_suffix(self.manifest_path.suffix + ".tmp")
        temporary.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.manifest_path)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return json.loads(json.dumps(self._data, ensure_ascii=False))

    def folder_exists(self, folder_id: str) -> bool:
        return not folder_id or any(folder.get("id") == folder_id for folder in self._data["folders"])

    def _require_folder(self, folder_id: str) -> None:
        if not self.folder_exists(folder_id):
            raise ValueError("文件夹不存在")

    def workspace_root(self, folder_id: str) -> Path:
        self._require_folder(folder_id)
        return self.results_dir.parent if not folder_id else self.collections_dir / folder_id

    def workspace_result_dir(self, folder_id: str = "") -> Path:
        return self.results_dir if not folder_id else self.workspace_root(folder_id) / "results"

    def workspace_upload_dir(self, folder_id: str = "") -> Path:
        default_uploads = self.results_dir.parent / "uploads"
        return default_uploads if not folder_id else self.workspace_root(folder_id) / "uploads"

    @staticmethod
    def media_url(folder_id: str, area: str, file_name: str) -> str:
        if folder_id:
            return f"/media/collections/{folder_id}/{area}/{file_name}"
        return f"/media/{area}/{file_name}"

    def create_folder(self, name: str) -> dict[str, Any]:
        cleaned = " ".join(str(name).split()).strip()
        if not cleaned:
            raise ValueError("收藏夹名称不能为空")
        if len(cleaned) > 60:
            raise ValueError("收藏夹名称不能超过 60 个字")
        with self._lock:
            if any(str(folder.get("name", "")).casefold() == cleaned.casefold() for folder in self._data["folders"]):
                raise ValueError("已存在同名收藏夹")
            folder = {"id": uuid.uuid4().hex[:12], "name": cleaned, "created_at": round(time.time(), 3)}
            (self.collections_dir / folder["id"] / "results").mkdir(parents=True, exist_ok=False)
            (self.collections_dir / folder["id"] / "uploads").mkdir()
            self._data["folders"].append(folder)
            self._write()
            return dict(folder)

    @staticmethod
    def _kind_for_mime(mime: str) -> str:
        kind = str(mime).split("/", 1)[0].lower()
        if kind not in ALLOWED_KINDS:
            raise ValueError("素材只支持图片或视频")
        return kind

    @staticmethod
    def _safe_suffix(name: str, mime: str, kind: str) -> str:
        suffix = Path(name).suffix.lower()
        allowed = {
            "image": {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"},
            "video": {".mp4", ".mov", ".m4v", ".webm"},
        }[kind]
        if suffix not in allowed:
            suffix = mimetypes.guess_extension(mime) or (".jpg" if kind == "image" else ".mp4")
        return suffix

    @staticmethod
    def _available_target(directory: Path, file_name: str) -> Path:
        target = directory / file_name
        if not target.exists():
            return target
        stem, suffix = Path(file_name).stem, Path(file_name).suffix
        return directory / f"{stem}-{uuid.uuid4().hex[:6]}{suffix}"

    def import_stream(self, name: str, mime: str, stream: BinaryIO, folder_id: str = "") -> dict[str, Any]:
        kind = self._kind_for_mime(mime)
        with self._lock:
            self._require_folder(folder_id)
            asset_id = uuid.uuid4().hex[:12]
            suffix = self._safe_suffix(name, mime, kind)
            file_name = f"asset-{asset_id}{suffix}"
            directory = self.workspace_result_dir(folder_id)
            directory.mkdir(parents=True, exist_ok=True)
            target = directory / file_name
            temporary = target.with_suffix(target.suffix + ".part")
            try:
                with temporary.open("wb") as output:
                    shutil.copyfileobj(stream, output)
                if temporary.stat().st_size == 0:
                    raise ValueError("素材文件不能为空")
                temporary.replace(target)
            except Exception:
                temporary.unlink(missing_ok=True)
                target.unlink(missing_ok=True)
                raise
            asset = {
                "id": asset_id,
                "kind": kind,
                "name": Path(name).name or file_name,
                "url": self.media_url(folder_id, "results", file_name),
                "file_name": file_name,
                "folder_id": folder_id,
                "source": "upload",
                "task_id": "",
                "parent_asset_id": "",
                "created_at": round(time.time(), 3),
            }
            self._data["assets"].append(asset)
            self._write()
            return dict(asset)

    def move_asset(self, asset_id: str, folder_id: str) -> dict[str, Any]:
        with self._lock:
            self._require_folder(folder_id)
            asset = next((item for item in self._data["assets"] if item.get("id") == asset_id), None)
            if not asset:
                raise ValueError("素材不存在")
            previous_folder = str(asset.get("folder_id") or "")
            if previous_folder == folder_id:
                return dict(asset)
            source = self.workspace_result_dir(previous_folder) / str(asset.get("file_name") or "")
            if not source.is_file() and self.restore_cache:
                self.restore_cache(source)
            if not source.is_file():
                raise ValueError("素材文件不存在，无法移动")
            destination_dir = self.workspace_result_dir(folder_id)
            destination_dir.mkdir(parents=True, exist_ok=True)
            target = self._available_target(destination_dir, source.name)
            source.replace(target)
            asset["folder_id"] = folder_id
            asset["file_name"] = target.name
            asset["url"] = self.media_url(folder_id, "results", target.name)
            self._write()
            return dict(asset)

    def asset_for_task(self, task_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            asset = next((item for item in self._data["assets"] if item.get("task_id") == task_id), None)
            return dict(asset) if asset else None

    def update_metadata(self, asset_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        """Organize an asset without changing its identity, path or existing references."""
        if not isinstance(changes, dict) or not changes or set(changes) - {"name", "category", "included"}:
            raise ValueError("仅支持修改素材名称与角色 / 场景分类")
        updates = {}
        if "name" in changes:
            if not isinstance(changes["name"], str):
                raise ValueError("素材名称无效")
            name = " ".join(changes["name"].split()).strip()
            if not name or len(name) > 120:
                raise ValueError("素材名称须为 1–120 个字")
            updates["name"] = name
        category = changes.get("category")
        if category is not None or "included" in changes:
            if category not in {"character", "scene"} or not isinstance(changes.get("included"), bool):
                raise ValueError("请选择角色库或场景库")
        with self._lock:
            asset = next((item for item in self._data["assets"] if item.get("id") == asset_id), None)
            if not asset:
                raise ValueError("素材不存在")
            if category:
                categories = set(asset.get("categories") or [])
                if changes["included"]:
                    categories.add(category)
                else:
                    categories.discard(category)
                updates["categories"] = sorted(categories)
            previous = dict(asset)
            asset.update(updates, updated_at=round(time.time(), 3))
            try:
                self._write()
            except Exception:
                asset.clear()
                asset.update(previous)
                raise
            return json.loads(json.dumps(asset))

    def trash_asset(self, asset_id: str, trash_root: Path) -> dict[str, Any]:
        """Move one asset into a recoverable trash folder and remove its manifest entry."""
        with self._lock:
            asset = next((item for item in self._data["assets"] if item.get("id") == asset_id), None)
            if not asset:
                raise ValueError("素材不存在")
            source = self.workspace_result_dir(str(asset.get("folder_id") or "")) / str(asset.get("file_name") or "")
            if not source.is_file() and self.restore_cache:
                self.restore_cache(source)
            if not source.is_file():
                raise ValueError("素材文件不存在，已停止删除以避免数据丢失")
            destination = Path(trash_root) / "results"
            destination.mkdir(parents=True, exist_ok=True)
            preferred_name = Path(str(asset.get("name") or source.name)).name if asset.get("source") == "upload" else source.name
            target = self._available_target(destination, preferred_name)
            source.replace(target)
            self._data["assets"] = [item for item in self._data["assets"] if item.get("id") != asset_id]
            self._write()
            return {"asset": dict(asset), "trash_file": str(target)}

    def delete_folder(self, folder_id: str) -> dict[str, Any]:
        with self._lock:
            folder = next((item for item in self._data["folders"] if item.get("id") == folder_id), None)
            if not folder:
                raise ValueError("收藏夹不存在")
            affected = [asset for asset in self._data["assets"] if asset.get("folder_id") == folder_id]
            sources = [(asset, self.workspace_result_dir(folder_id) / str(asset.get("file_name") or "")) for asset in affected]
            if any(not source.is_file() for _, source in sources):
                raise ValueError("收藏夹中存在缺失素材，已停止删除以避免数据丢失")
            self.results_dir.mkdir(parents=True, exist_ok=True)
            moves: list[dict[str, str]] = []
            for asset, source in sources:
                old_url = str(asset.get("url") or "")
                target = self._available_target(self.results_dir, source.name)
                source.replace(target)
                asset["folder_id"] = ""
                asset["file_name"] = target.name
                asset["url"] = self.media_url("", "results", target.name)
                moves.append({"task_id": str(asset.get("task_id") or ""), "old_url": old_url, "new_url": asset["url"]})
            self._data["folders"] = [item for item in self._data["folders"] if item.get("id") != folder_id]
            self._write()
            workspace = self.collections_dir / folder_id
            for directory in (workspace / "results", workspace / "uploads", workspace):
                try:
                    directory.rmdir()
                except OSError:
                    pass
            return {"folder": dict(folder), "assets": [dict(asset) for asset in affected], "moves": moves}

    def register_generated(self, task: dict[str, Any]) -> Optional[dict[str, Any]]:
        task_id = str(task.get("id") or "")
        kind = str(task.get("kind") or "")
        folder_id = str(task.get("folder_id") or "")
        if not task_id or kind not in ALLOWED_KINDS:
            return None
        self._require_folder(folder_id)
        local_url = str(task.get("local_image_url") if kind == "image" else task.get("local_video_url") or "")
        parsed_path = unquote(urlparse(local_url).path)
        prefix = self.media_url(folder_id, "results", "")
        if not parsed_path.startswith(prefix):
            return None
        file_name = Path(parsed_path).name
        if not file_name or file_name != parsed_path.removeprefix(prefix):
            return None
        target = self.workspace_result_dir(folder_id) / file_name
        if not target.is_file():
            return None
        with self._lock:
            existing = next((asset for asset in self._data["assets"] if asset.get("task_id") == task_id), None)
            if existing:
                return dict(existing)
            prompt = " ".join(str(task.get("prompt") or "").split())
            asset = {
                "id": uuid.uuid4().hex[:12],
                "kind": kind,
                "name": prompt[:80] or file_name,
                "url": self.media_url(folder_id, "results", file_name),
                "file_name": file_name,
                "folder_id": folder_id,
                "source": "generated",
                "task_id": task_id,
                "parent_asset_id": "",
                "created_at": round(time.time(), 3),
            }
            self._data["assets"].append(asset)
            self._write()
            return dict(asset)

    def restore_asset(self, asset: dict[str, Any], source: Path) -> dict[str, Any]:
        """Restore a trashed file, falling back to the default workspace."""
        with self._lock:
            if any(item.get("id") == asset["id"] for item in self._data["assets"]):
                raise ValueError("素材已存在")
            restored = dict(asset)
            folder_id = str(asset.get("folder_id") or "")
            if not self.folder_exists(folder_id):
                folder_id = ""
            directory = self.workspace_result_dir(folder_id)
            directory.mkdir(parents=True, exist_ok=True)
            target = self._available_target(directory, Path(asset["file_name"]).name)
            source.replace(target)
            restored.update(folder_id=folder_id, file_name=target.name, url=self.media_url(folder_id, "results", target.name))
            self._data["assets"].append(restored)
            try:
                self._write()
            except Exception:
                self._data["assets"].remove(restored)
                target.replace(source)
                raise
            return dict(restored)
