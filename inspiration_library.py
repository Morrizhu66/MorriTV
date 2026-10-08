from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


class InspirationLibrary:
    def __init__(self, manifest: Path, storage: Path, results: Path, uploads: Path, collections: Path):
        self.manifest = Path(manifest)
        self.storage = Path(storage)
        self.results = Path(results)
        self.uploads = Path(uploads)
        self.collections = Path(collections)
        self._lock = threading.RLock()
        self._data = self._load()

    def _load(self) -> dict[str, Any]:
        if not self.manifest.exists():
            return {"version": 1, "items": []}
        try:
            data = json.loads(self.manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError("视频灵感库清单损坏，无法读取") from exc
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            raise RuntimeError("视频灵感库清单格式无效")
        return data

    def _write(self) -> None:
        self.manifest.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.manifest.with_suffix(self.manifest.suffix + ".tmp")
        temporary.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.manifest)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return json.loads(json.dumps(self._data, ensure_ascii=False))

    def _video_source(self, task: dict[str, Any]) -> Path:
        path = unquote(urlparse(str(task.get("local_video_url") or "")).path)
        folder_id = str(task.get("folder_id") or "")
        prefix = f"/media/collections/{folder_id}/results/" if folder_id else "/media/results/"
        if not path.startswith(prefix) or Path(path).name != path.removeprefix(prefix):
            raise ValueError("视频没有可保存的本地成片")
        root = self.collections / folder_id / "results" if folder_id else self.results
        source = root / Path(path).name
        if not source.is_file():
            raise ValueError("视频成片文件不存在")
        return source

    def _reference_source(self, reference: dict[str, Any]) -> Path:
        source = Path(str(reference.get("path") or ""))
        if not source.is_file():
            raise ValueError(f"参考素材不存在：{reference.get('name') or '未命名素材'}")
        resolved = source.resolve()
        if not any(resolved.is_relative_to(root.resolve()) for root in (self.uploads, self.collections)):
            raise ValueError("参考素材不在本地工作区")
        return source

    def create_from_task(self, task: dict[str, Any]) -> dict[str, Any]:
        if task.get("kind") != "video" or task.get("status") != "completed":
            raise ValueError("只有已完成的视频任务可以存入灵感库")
        task_id = str(task.get("id") or "")
        with self._lock:
            existing = next((item for item in self._data["items"] if item.get("task_id") == task_id), None)
            if existing:
                return dict(existing)
            video_source = self._video_source(task)
            reference_sources = [(reference, self._reference_source(reference)) for reference in task.get("reference_files") or []]
            item_id = uuid.uuid4().hex[:12]
            bundle = self.storage / item_id
            try:
                video_dir = bundle / "video"; video_dir.mkdir(parents=True)
                shutil.copy2(video_source, video_dir / video_source.name)
                copied_references = []
                reference_dir = bundle / "references"
                for index, (reference, source) in enumerate(reference_sources, 1):
                    reference_dir.mkdir(parents=True, exist_ok=True)
                    target_name = f"{index:02d}-{Path(str(reference.get('name') or source.name)).name}"
                    shutil.copy2(source, reference_dir / target_name)
                    copied_references.append({
                        "name": str(reference.get("name") or source.name),
                        "mime": str(reference.get("mime") or "application/octet-stream"),
                        "url": f"/media/inspirations/{item_id}/references/{target_name}",
                    })
                item = {
                    "id": item_id, "task_id": task_id, "prompt": str(task.get("prompt") or ""),
                    "profile": str(task.get("profile") or ""), "ratio": str(task.get("ratio") or "16:9"),
                    "duration": str(task.get("duration") or "5"), "resolution": str(task.get("resolution") or "720p"),
                    "video_url": f"/media/inspirations/{item_id}/video/{video_source.name}",
                    "references": copied_references, "created_at": round(time.time(), 3),
                }
                self._data["items"].append(item)
                self._write()
                return dict(item)
            except Exception:
                shutil.rmtree(bundle, ignore_errors=True)
                raise

    def delete(self, item_id: str, trash_root: Path) -> dict[str, Any]:
        with self._lock:
            item = next((entry for entry in self._data["items"] if entry.get("id") == item_id), None)
            if not item:
                raise ValueError("视频灵感不存在")
            bundle = self.storage / item_id
            if not bundle.is_dir():
                raise ValueError("视频灵感文件缺失，已停止删除")
            target = Path(trash_root) / "bundle"
            target.parent.mkdir(parents=True, exist_ok=True)
            bundle.replace(target)
            self._data["items"] = [entry for entry in self._data["items"] if entry.get("id") != item_id]
            self._write()
            return {"item": dict(item), "trash_path": str(target)}

    def restore(self, item: dict[str, Any], bundle: Path) -> None:
        with self._lock:
            target = self.storage / item["id"]
            if target.exists() or any(entry["id"] == item["id"] for entry in self._data["items"]):
                raise ValueError("视频灵感已存在")
            bundle.replace(target)
            self._data["items"].append(dict(item))
            try:
                self._write()
            except Exception:
                self._data["items"].pop()
                target.replace(bundle)
                raise
