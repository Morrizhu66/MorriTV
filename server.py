#!/usr/bin/env python3
"""Local Seedream / Seedance studio with key-free source code."""

from __future__ import annotations

import cgi
import json
import mimetypes
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse
from urllib.request import urlopen, Request

from cloud_images import CloudImages
from cloud_workspace import CloudWorkspace
import lingganya_client
import doubao_work
import script_studio
from board_export import build_export
from board_store import BoardStore, BoardConflict
from inspiration_library import InspirationLibrary
from media_library import MediaLibrary
import tos_uploader

APP_DIR = Path(__file__).resolve().parent
SKILL_CALLER = APP_DIR / "tools" / "call_business_model.py"
PRIVATE_ENV = APP_DIR / ".env"
UPLOADS_DIR = APP_DIR / "uploads"
RESULTS_DIR = APP_DIR / "results"
COLLECTIONS_DIR = APP_DIR / "collections"
HISTORY_FILE = APP_DIR / "task-history.jsonl"
LIBRARY_FILE = APP_DIR / "media-library.json"
TRASH_DIR = APP_DIR / "trash"
INSPIRATIONS_DIR = APP_DIR / "inspirations"
INSPIRATION_FILE = APP_DIR / "inspiration-library.json"
HOST = "127.0.0.1"
PORT = int(os.getenv("MODEL_STUDIO_PORT", "4178"))
IMAGE_MAX_WORKERS = 8
VIDEO_MAX_WORKERS = 4

for folder in (UPLOADS_DIR, RESULTS_DIR, COLLECTIONS_DIR, TRASH_DIR, INSPIRATIONS_DIR):
    folder.mkdir(parents=True, exist_ok=True)

BOARDS = BoardStore(APP_DIR / "boards.json")

CLOUD_IMAGES = CloudImages(APP_DIR / "cloud-images.json")
CLOUD_WORKSPACE = None
CLOUD_ERRORS: dict[str, str] = {}
CLOUD_SYNC = {"running": False, "synced": 0, "failed": 0}
MEDIA_LIBRARY = MediaLibrary(LIBRARY_FILE, RESULTS_DIR, COLLECTIONS_DIR,
                             restore_cache=lambda path: CLOUD_WORKSPACE.restore_cache(path) if CLOUD_WORKSPACE else None)
INSPIRATION_LIBRARY = InspirationLibrary(INSPIRATION_FILE, INSPIRATIONS_DIR, RESULTS_DIR, UPLOADS_DIR, COLLECTIONS_DIR)
TASKS: dict[str, dict[str, Any]] = {}
LOCK = threading.RLock()
IMAGE_EXECUTOR = ThreadPoolExecutor(max_workers=IMAGE_MAX_WORKERS, thread_name_prefix="model-studio-image")
VIDEO_EXECUTOR = ThreadPoolExecutor(max_workers=VIDEO_MAX_WORKERS, thread_name_prefix="model-studio-video")
DOUBAO_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="model-studio-doubao")
EXECUTORS = {"image": IMAGE_EXECUTOR, "video": VIDEO_EXECUTOR}
SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
ARK_HOST = "ark-cn-beijing.bytedance.net"
PROXY_ENV_KEYS = (
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
    "http_proxy", "https_proxy", "all_proxy",
)


def configured_env_keys() -> list[str]:
    """Expose only variable names for a health indicator; never their values."""
    if not PRIVATE_ENV.exists():
        return []
    keys: list[str] = []
    for raw in PRIVATE_ENV.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" in line:
            keys.append(line.split("=", 1)[0].strip())
    return keys


def private_env_value(name: str) -> str:
    """Read one private config value without ever logging or returning it to the client."""
    if name in os.environ:
        return os.environ[name]
    if not PRIVATE_ENV.exists():
        return ""
    for raw in PRIVATE_ENV.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("export "):
            line = line[7:].strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == name:
            return value.strip().strip('"').strip("'")
    return ""


def health_flags() -> dict[str, Any]:
    keys = set(configured_env_keys()) | set(os.environ)
    tos_status = tos_uploader.config_status(private_env_value)
    return {
        "ok": True,
        "image_ready": "ARK_API_KEY" in keys,
        "video_ready": "SEEDANCE_ARK_API_KEY" in keys,
        "lingganya_ready": bool(private_env_value("LINGGANYA_API_KEY")),
        "doubao_ready": bool(private_env_value("DOUBAO_WORK_BRIDGE")) or doubao_work.ready(),
        "tos_ready": tos_status["ready"],
        "workers": {"image": IMAGE_MAX_WORKERS, "video": VIDEO_MAX_WORKERS},
    }


def model_child_env(kind: str) -> dict[str, str]:
    """Build a direct Ark environment so local/system proxies cannot stall model calls."""
    child_env = os.environ.copy()
    for key in PROXY_ENV_KEYS:
        child_env.pop(key, None)

    bypass_hosts: list[str] = []
    for key in ("NO_PROXY", "no_proxy"):
        bypass_hosts.extend(part.strip() for part in child_env.get(key, "").split(",") if part.strip())
    if ARK_HOST not in bypass_hosts:
        bypass_hosts.append(ARK_HOST)
    bypass = ",".join(dict.fromkeys(bypass_hosts))
    child_env["NO_PROXY"] = bypass
    child_env["no_proxy"] = bypass

    key_name = "SEEDANCE_ARK_API_KEY" if kind == "video" else "ARK_API_KEY"
    api_key = private_env_value(key_name)
    if not api_key:
        raise RuntimeError(f"未配置 {key_name}。请复制 .env.example 为 .env 并填写申请到的 API Key。")
    child_env["ARK_API_KEY"] = api_key
    return child_env


def now() -> float:
    return round(time.time(), 3)


HISTORY_VERSION = 3
DAILY_TARGETS = {
    "seedance-reference-video-ark-direct": 20,
    "seedream50-pro-ark-direct": 30,
}


PERSISTED_TASK_FIELDS = (
    "id", "kind", "provider", "profile", "prompt", "status", "created_at", "started_at",
    "finished_at", "reference_files", "ratio", "duration", "resolution", "image_url",
    "local_image_url", "local_video_url", "error", "queue_position", "folder_id", "history_version",
    "board_id", "node_id", "reference_bindings", "provider_task_id", "provider_result_url", "submission_id",
)


def history_task_snapshot(task: dict[str, Any]) -> dict[str, Any]:
    """Create a key-free task snapshot that can be replayed after a restart."""
    snapshot = {key: task.get(key) for key in PERSISTED_TASK_FIELDS}
    snapshot["reference_files"] = [
        {
            "name": str(reference.get("name") or "reference"),
            "path": str(reference.get("path") or ""),
            "mime": str(reference.get("mime") or "application/octet-stream"),
            "url": str(reference.get("url") or ""),
        }
        for reference in task.get("reference_files") or []
        if isinstance(reference, dict)
    ]
    return snapshot


def restore_history_task(snapshot: dict[str, Any]) -> dict[str, Any] | None:
    """Validate a persisted snapshot before exposing it in the local gallery."""
    task_id = snapshot.get("id")
    prompt = snapshot.get("prompt")
    kind = snapshot.get("kind")
    if not isinstance(task_id, str) or not task_id or not isinstance(prompt, str) or kind not in {"image", "video"}:
        return None
    task = {
        "id": task_id,
        "kind": kind,
        "provider": str(snapshot.get("provider") or ("hfsy" if str(snapshot.get("profile") or "").startswith("hfsy-") else "ark")),
        "profile": str(snapshot.get("profile") or ""),
        "prompt": prompt,
        "status": str(snapshot.get("status") or "failed"),
        "created_at": snapshot.get("created_at") or now(),
        "started_at": snapshot.get("started_at"),
        "finished_at": snapshot.get("finished_at"),
        "reference_files": snapshot.get("reference_files") or [],
        "ratio": str(snapshot.get("ratio") or "9:16"),
        "duration": str(snapshot.get("duration") or "15"),
        "resolution": str(snapshot.get("resolution") or "720p"),
        "image_url": str(snapshot.get("image_url") or ""),
        "local_image_url": str(snapshot.get("local_image_url") or ""),
        "video_url": "",
        "local_video_url": str(snapshot.get("local_video_url") or ""),
        "error": str(snapshot.get("error") or ""),
        "queue_position": snapshot.get("queue_position"),
        "folder_id": str(snapshot.get("folder_id") or ""),
        "history_version": int(snapshot.get("history_version") or 1),
    }
    for field in ("board_id", "node_id", "provider_task_id", "provider_result_url", "submission_id"):
        task[field] = str(snapshot.get(field) or "")
    task["reference_bindings"] = snapshot.get("reference_bindings") or []
    return task


def load_task_history() -> None:
    """Restore the latest saved state of every task without re-running work."""
    if not HISTORY_FILE.exists():
        return
    latest_snapshots: dict[str, dict[str, Any]] = {}
    for raw in HISTORY_FILE.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(raw)
        except json.JSONDecodeError:
            continue
        snapshot = entry.get("task")
        if not isinstance(snapshot, dict):
            continue
        if entry.get("event") == "deleted":
            deleted_id = str(entry.get("task_id") or snapshot.get("id") or "")
            latest_snapshots.pop(deleted_id, None)
            continue
        task = restore_history_task(snapshot)
        if task:
            latest_snapshots[task["id"]] = task

    interrupted: list[dict[str, Any]] = []
    with LOCK:
        TASKS.clear()
        for task in latest_snapshots.values():
            if task["status"] in {"queued", "running"}:
                resumable = task.get("provider_task_id") or task.get("provider_result_url")
                task["status"] = "paused" if resumable else "failed"
                task["error"] = "服务重启，原任务可继续查询。" if resumable else "服务重启时任务尚未完成，请先核对供应商记录；未自动重新生成。"
                task["finished_at"] = now()
                task["queue_position"] = None
                interrupted.append(task)
            if task.get("provider") == "doubao_work" and doubao_work.pending_task_id() == task["id"]:
                task["status"] = "paused"
                task["error"] = "豆包连接中断，可继续查询原任务，不会重新生成。"
            TASKS[task["id"]] = task
        for task in interrupted:
            record_task_event("interrupted", task)
    for task in latest_snapshots.values():
        if task.get("status") == "completed":
            register_completed_task(task)


def record_task_event(event: str, task: dict[str, Any]) -> None:
    """Persist the latest recoverable task state without storing API keys."""
    entry = {
        "at": now(),
        "event": event,
        "task_id": task["id"],
        "kind": task["kind"],
        "profile": task["profile"],
        "status": task["status"],
        "reference_count": len(task.get("reference_files") or []),
        "error": task.get("error") or "",
        "task": history_task_snapshot(task),
    }
    with HISTORY_FILE.open("a", encoding="utf-8") as history:
        history.write(json.dumps(entry, ensure_ascii=False) + "\n")


def daily_usage(reference_time: float | None = None) -> dict[str, Any]:
    """Count today's unique queued submissions. Targets are reminders, never limits."""
    reference = time.time() if reference_time is None else reference_time
    local_date = datetime.fromtimestamp(reference).date()
    counts: dict[str, int] = {}
    seen: set[str] = set()
    if HISTORY_FILE.exists():
        for raw in HISTORY_FILE.read_text(encoding="utf-8").splitlines():
            try:
                entry = json.loads(raw)
                snapshot = entry.get("task") or {}
                task_id = str(entry.get("task_id") or snapshot.get("id") or "")
                created_at = float(snapshot.get("created_at"))
            except (json.JSONDecodeError, TypeError, ValueError):
                continue
            if entry.get("event") != "queued" or not task_id or task_id in seen:
                continue
            seen.add(task_id)
            if datetime.fromtimestamp(created_at).date() != local_date:
                continue
            profile = str(snapshot.get("profile") or entry.get("profile") or "unknown")
            counts[profile] = counts.get(profile, 0) + 1
    return {
        "date": local_date.isoformat(), "counts": counts,
        "targets": dict(DAILY_TARGETS), "total": sum(counts.values()), "enforced": False,
    }


def _new_trash_root(kind: str, item_id: str) -> Path:
    base = TRASH_DIR / f"{time.strftime('%Y%m%d-%H%M%S')}-{kind}-{SAFE_NAME.sub('-', item_id)}"
    target = base if not base.exists() else base.with_name(f"{base.name}-{uuid.uuid4().hex[:6]}")
    target.mkdir(parents=True)
    return target


def _trash_references(task: dict[str, Any], trash_root: Path) -> list[str]:
    moved: list[str] = []
    restore_paths = []
    for reference in task.get("reference_files") or []:
        path = Path(str(reference.get("path") or ""))
        if not path.is_file():
            continue
        resolved = path.resolve()
        if not any(resolved.is_relative_to(root.resolve()) for root in (UPLOADS_DIR, COLLECTIONS_DIR)):
            continue
        destination = trash_root / "references"
        destination.mkdir(parents=True, exist_ok=True)
        target = MediaLibrary._available_target(destination, str(reference.get("name") or path.name))
        path.replace(target)
        restore_paths.append({"original": str(path), "file": target.name})
        moved.append(str(target))
    (trash_root / "reference-paths.json").write_text(json.dumps(restore_paths), encoding="utf-8")
    return moved


def delete_task(task_id: str) -> dict[str, Any]:
    with LOCK:
        task = TASKS.get(task_id)
        if not task:
            raise ValueError("任务不存在")
        if task.get("status") in {"queued", "running"}:
            raise ValueError("任务仍在制作中，完成后再删除")
        snapshot = dict(task)
    trash_root = _new_trash_root("task", task_id)
    asset = MEDIA_LIBRARY.asset_for_task(task_id)
    trashed_asset = MEDIA_LIBRARY.trash_asset(asset["id"], trash_root) if asset else None
    references = _trash_references(snapshot, trash_root)
    metadata = {"deleted_at": now(), "task": history_task_snapshot(snapshot), "asset": trashed_asset, "references": references}
    (trash_root / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    with LOCK:
        record_task_event("deleted", snapshot)
        TASKS.pop(task_id, None)
    return {"task": public_task(snapshot), "trash_path": str(trash_root)}


def delete_library_asset(asset_id: str) -> dict[str, Any]:
    asset = next((item for item in MEDIA_LIBRARY.snapshot()["assets"] if item.get("id") == asset_id), None)
    if not asset:
        raise ValueError("素材不存在")
    if asset.get("task_id"):
        deleted = delete_task(str(asset["task_id"]))
        return {"asset": asset, **deleted}
    trash_root = _new_trash_root("asset", asset_id)
    deleted = MEDIA_LIBRARY.trash_asset(asset_id, trash_root)
    (trash_root / "metadata.json").write_text(json.dumps({"deleted_at": now(), **deleted}, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"asset": deleted["asset"], "trash_path": str(trash_root)}


def persist_cloud_image(path: Path) -> bool:
    try:
        CLOUD_IMAGES.persist(path, private_env_value)
        CLOUD_ERRORS.pop(str(path), None)
        return True
    except Exception as exc:
        CLOUD_ERRORS[str(path)] = str(exc)[:200]
        return False


def cloud_status() -> dict[str, Any]:
    if CLOUD_WORKSPACE:
        return CLOUD_WORKSPACE.status()
    assets = [item for item in MEDIA_LIBRARY.snapshot()["assets"] if item.get("kind") == "image"]
    stored = 0
    for asset in assets:
        path = MEDIA_LIBRARY.workspace_result_dir(str(asset.get("folder_id") or "")) / asset["file_name"]
        if CLOUD_IMAGES.info(path):
            stored += 1
    return {"ready": tos_uploader.config_status(private_env_value)["ready"], "stored": stored,
            "pending": len(assets) - stored, "errors": len(CLOUD_ERRORS), "sync": dict(CLOUD_SYNC)}


def sync_cloud_images() -> None:
    if CLOUD_WORKSPACE:
        CLOUD_WORKSPACE.wake.set()
        return
    try:
        assets = [item for item in MEDIA_LIBRARY.snapshot()["assets"] if item.get("kind") == "image"]
        for asset in assets:
            with LOCK:
                current = next((item for item in MEDIA_LIBRARY.snapshot()["assets"] if item["id"] == asset["id"]), None)
                if not current:
                    continue
                source = MEDIA_LIBRARY.workspace_result_dir(str(current.get("folder_id") or "")) / current["file_name"]
                if CLOUD_IMAGES.info(source):
                    continue
            if persist_cloud_image(source):
                CLOUD_SYNC["synced"] += 1
            else:
                CLOUD_SYNC["failed"] += 1
    finally:
        CLOUD_SYNC["running"] = False


def cloud_media_info(path):
    return (CLOUD_WORKSPACE.info(path) if CLOUD_WORKSPACE else None) or CLOUD_IMAGES.info(path)


def trash_entry(entry_id: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", entry_id):
        raise ValueError("回收站条目无效")
    root = TRASH_DIR / entry_id
    if not root.is_dir() or root.is_symlink():
        raise ValueError("回收站条目不存在")
    return root


def list_trash() -> list[dict[str, Any]]:
    entries = []
    for root in TRASH_DIR.iterdir():
        if not root.is_dir() or root.is_symlink():
            continue
        try:
            metadata = json.loads((root / "metadata.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            metadata = {}
        wrapper = metadata.get("asset") or {}
        asset = wrapper.get("asset", wrapper)
        task = metadata.get("task") or {}
        item = metadata.get("item") or {}
        media = next((file for area in ("results", "bundle/video") for file in (root / area).glob("*") if file.is_file()), None)
        entries.append({"id": root.name, "name": asset.get("name") or task.get("prompt") or item.get("prompt") or root.name,
                        "kind": asset.get("kind") or task.get("kind") or "video",
                        "deleted_at": metadata.get("deleted_at") or root.stat().st_mtime,
                        "url": f"/media/trash/{root.name}/{media.relative_to(root).as_posix()}" if media else "",
                        "can_restore": bool(metadata)})
    return sorted(entries, key=lambda item: item["deleted_at"], reverse=True)


def restore_trash(entry_id: str) -> None:
    with LOCK:
        root = trash_entry(entry_id)
        metadata = json.loads((root / "metadata.json").read_text(encoding="utf-8"))
        if metadata.get("item"):
            INSPIRATION_LIBRARY.restore(metadata["item"], root / "bundle")
        else:
            wrapper = metadata.get("asset") or {}
            asset = wrapper.get("asset", wrapper)
            task = restore_history_task(metadata["task"]) if metadata.get("task") else None
            if task and task["id"] in TASKS:
                raise ValueError("任务已存在")
            restored = None
            if asset:
                source = root / "results" / Path(wrapper.get("trash_file") or metadata.get("trash_file") or asset["file_name"]).name
                if not source.is_file():
                    raise ValueError("回收站文件缺失")
                restored = MEDIA_LIBRARY.restore_asset(asset, source)
            if task:
                mapping_file = root / "reference-paths.json"
                mappings = json.loads(mapping_file.read_text()) if mapping_file.exists() else [
                    {"original": reference.get("path", ""), "file": Path(file).name}
                    for reference, file in zip(task["reference_files"], metadata.get("references") or [])]
                for mapping in mappings:
                    source = root / "references" / Path(mapping["file"]).name
                    original = Path(mapping["original"]).resolve()
                    if source.is_file() and any(original.is_relative_to(base.resolve()) for base in (UPLOADS_DIR, COLLECTIONS_DIR)):
                        original.parent.mkdir(parents=True, exist_ok=True)
                        target = MediaLibrary._available_target(original.parent, original.name)
                        source.replace(target)
                        for reference in task["reference_files"]:
                            if Path(reference.get("path") or "").resolve() == original:
                                reference["path"] = str(target)
                if restored:
                    task["folder_id"] = restored["folder_id"]
                    task["local_image_url" if task["kind"] == "image" else "local_video_url"] = restored["url"]
                elif not MEDIA_LIBRARY.folder_exists(task.get("folder_id", "")):
                    task["folder_id"] = ""
                record_task_event("restored", task)
                TASKS[task["id"]] = task
        shutil.rmtree(root)


def register_completed_task(task: dict[str, Any]) -> dict[str, Any] | None:
    """Add a locally completed generation to the reusable library without duplicating it."""
    try:
        return MEDIA_LIBRARY.register_generated(task)
    except Exception as exc:
        print(f"[{time.strftime('%H:%M:%S')}] library registration failed for {task.get('id', 'unknown')}: {exc}")
        return None


def move_library_asset(asset_id: str, folder_id: str) -> dict[str, Any]:
    """Move the real file and keep its task's local result URL usable."""
    asset = MEDIA_LIBRARY.move_asset(asset_id, folder_id)
    task_id = str(asset.get("task_id") or "")
    if task_id:
        with LOCK:
            task = TASKS.get(task_id)
            if task:
                task["folder_id"] = folder_id
                field = "local_video_url" if asset.get("kind") == "video" else "local_image_url"
                task[field] = str(asset.get("url") or "")
                record_task_event("moved", task)
    return asset


def migrate_collection_uploads(folder_id: str) -> dict[str, str]:
    """Move saved references from a deleted collection back to default uploads."""
    source_root = COLLECTIONS_DIR / folder_id / "uploads"
    if not source_root.exists():
        return {}
    path_map: dict[str, str] = {}
    for source in sorted((path for path in source_root.rglob("*") if path.is_file())):
        relative = source.relative_to(source_root)
        target = UPLOADS_DIR / relative
        if target.exists():
            target = target.with_name(f"{target.stem}-{folder_id[:6]}{target.suffix}")
        target.parent.mkdir(parents=True, exist_ok=True)
        old_path = str(source)
        source.replace(target)
        path_map[old_path] = str(target)
    for directory in sorted((path for path in source_root.rglob("*") if path.is_dir()), key=lambda path: len(path.parts), reverse=True):
        try:
            directory.rmdir()
        except OSError:
            pass
    try:
        source_root.rmdir()
    except OSError:
        pass
    return path_map


def delete_collection_folder(folder_id: str) -> dict[str, Any]:
    """Delete one workspace without deleting its results or saved references."""
    with LOCK:
        active = [task for task in TASKS.values() if task.get("folder_id") == folder_id and task.get("status") in {"queued", "running"}]
        if active:
            raise ValueError("收藏夹中仍有任务正在制作，请完成后再删除")
    deleted = MEDIA_LIBRARY.delete_folder(folder_id)
    reference_moves = migrate_collection_uploads(folder_id)
    result_moves = {move.get("old_url", ""): move.get("new_url", "") for move in deleted.get("moves", [])}
    with LOCK:
        for task in TASKS.values():
            if task.get("folder_id") != folder_id:
                continue
            task["folder_id"] = ""
            for reference in task.get("reference_files") or []:
                old_path = str(reference.get("path") or "")
                if old_path in reference_moves:
                    reference["path"] = reference_moves[old_path]
            if task.get("local_image_url") in result_moves:
                task["local_image_url"] = result_moves[task["local_image_url"]]
            if task.get("local_video_url") in result_moves:
                task["local_video_url"] = result_moves[task["local_video_url"]]
            record_task_event("folder_deleted", task)
    workspace = COLLECTIONS_DIR / folder_id
    try:
        workspace.rmdir()
    except OSError:
        pass
    return deleted


def public_reference(reference: dict[str, Any]) -> dict[str, str]:
    """Expose a local media URL for retry, never the absolute upload path."""
    public = {
        "name": str(reference.get("name") or "reference"),
        "mime": str(reference.get("mime") or "application/octet-stream"),
        "url": str(reference.get("url") or ""),
    }
    try:
        relative = Path(str(reference.get("path") or "")).resolve().relative_to(UPLOADS_DIR.resolve())
        public["url"] = f"/media/uploads/{quote(relative.as_posix(), safe='/')}"
    except (ValueError, OSError):
        try:
            relative = Path(str(reference.get("path") or "")).resolve().relative_to(COLLECTIONS_DIR.resolve())
            parts = relative.parts
            if len(parts) >= 4 and parts[1] == "uploads":
                public["url"] = f"/media/collections/{quote(parts[0], safe='')}/uploads/{quote(Path(*parts[2:]).as_posix(), safe='/')}"
        except (ValueError, OSError):
            pass
    return public


def public_task(task: dict[str, Any]) -> dict[str, Any]:
    """Return safe task data only; prompts and model metadata are intentionally kept."""
    public = {
        key: task.get(key)
        for key in (
            "id", "kind", "provider", "profile", "prompt", "status", "created_at", "started_at",
            "finished_at", "reference_files", "ratio", "duration", "resolution", "image_url",
            "local_image_url", "video_url", "local_video_url", "error", "queue_position",
            "folder_id", "history_version", "board_id", "node_id", "reference_bindings", "provider_task_id", "submission_id",
        )
    }
    public["reference_files"] = [
        public_reference(reference)
        for reference in task.get("reference_files") or []
        if isinstance(reference, dict)
    ]
    return public


def workspace_result_dir(folder_id: str = "") -> Path:
    return RESULTS_DIR if not folder_id else COLLECTIONS_DIR / folder_id / "results"


def workspace_upload_dir(folder_id: str = "") -> Path:
    return UPLOADS_DIR if not folder_id else COLLECTIONS_DIR / folder_id / "uploads"


def workspace_media_url(folder_id: str, area: str, file_name: str) -> str:
    return MEDIA_LIBRARY.media_url(folder_id, area, file_name)


def copy_references(task_id: str, fields: cgi.FieldStorage, folder_id: str = "") -> list[dict[str, str]]:
    destination = workspace_upload_dir(folder_id) / task_id
    destination.mkdir(parents=True, exist_ok=True)
    copied: list[dict[str, str]] = []
    # FieldStorage.getlist() returns file values as bytes. Keep the original
    # FieldStorage objects so filename and stream survive multipart parsing.
    raw_items = fields["references"] if "references" in fields else []
    items = raw_items if isinstance(raw_items, list) else [raw_items]
    for item in items:
        if not getattr(item, "filename", None) or not getattr(item, "file", None):
            continue
        original = Path(item.filename).name
        filename = SAFE_NAME.sub("-", original)[:120] or "reference"
        target = destination / f"{len(copied) + 1:02d}-{filename}"
        with target.open("wb") as output:
            shutil.copyfileobj(item.file, output)
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        copied.append({"name": original, "path": str(target), "mime": mime})
    return copied


def parse_reference_urls(raw: str) -> list[dict[str, str]]:
    references: list[dict[str, str]] = []
    for value in (line.strip() for line in raw.splitlines()):
        if not value:
            continue
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError(f"参考素材 URL 无效：{value[:100]}")
        name = Path(parsed.path).name or f"reference-{len(references) + 1}"
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
        references.append({"name": name, "path": "", "url": value, "mime": mime})
    return references


def validate_task_input(
    kind: str,
    profile: str,
    prompt: str,
    ratio: str,
    duration: str,
    resolution: str,
    references: list[dict[str, str]],
) -> str:
    """Validate provider-specific input before a paid request is queued."""
    if kind not in {"image", "video"}:
        raise ValueError("不支持的任务类型")
    if not prompt:
        raise ValueError("至少输入一条提示词")
    if profile in lingganya_client.PROFILES:
        if kind != ("video" if profile in lingganya_client.VIDEO_PROFILES else "image"):
            raise ValueError("模型与任务类型不匹配")
        if profile == lingganya_client.VIDEO_PROFILE and (not str(duration).isdigit() or not 5 <= int(duration) <= 15):
            raise ValueError("SD 2.0 Mini 时长必须为 5–15 秒")
        if profile == lingganya_client.PX_PROFILE and (not str(duration).isdigit() or not 5 <= int(duration) <= 30):
            raise ValueError("SD 2.5 PX VIP 时长必须为 5–30 秒")
        lingganya_client.validate(profile, prompt, ratio, resolution, references)
        return "lingganya"
    if profile.startswith("hfsy-"):
        raise ValueError("HFSY 已移除，请选择灵感鸭或 Seedream 模型；历史素材仍可查看。")
    if profile in doubao_work.PROFILES:
        doubao_work.validate(kind, prompt, ratio, duration, references)
        return "doubao_work"
    if kind == "video" and profile != "seedance-reference-video-ark-direct":
        raise ValueError("视频任务请使用 Seedance Reference Video")
    if kind == "image" and profile not in {"seedream43-ark-direct", "seedream50-pro-ark-direct"}:
        raise ValueError("图片任务请选择可用的 Seedream 模型")
    if kind == "video" and resolution != "720p":
        raise ValueError("当前 Seedance Fast 仅支持 720p；已阻止提交无效的 1080p 请求。")
    return "ark"


def create_tasks(fields: cgi.FieldStorage) -> list[dict[str, Any]]:
    kind = fields.getfirst("kind", "image")
    profile = fields.getfirst("profile", "")
    if profile in doubao_work.PROFILES and not doubao_work.status()["ready"]:
        raise ValueError(doubao_work.LOGIN_REQUIRED)
    submitted_prompt = fields.getfirst("prompts", "")
    raw_prompts = submitted_prompt if profile in doubao_work.PROFILES else submitted_prompt.strip()
    prompts = [raw_prompts] if raw_prompts.strip() else []
    folder_id = str(fields.getfirst("folder_id", "") or "")
    if not MEDIA_LIBRARY.folder_exists(folder_id):
        raise ValueError("收藏夹不存在，请刷新页面后重试")
    submission_id = str(fields.getfirst("submission_id", "") or "")
    if submission_id:
        with LOCK:
            existing = next((task for task in TASKS.values() if task.get("submission_id") == submission_id), None)
            if existing:
                return [existing]
    try:
        bindings = json.loads(fields.getfirst("reference_bindings", "[]"))
    except (TypeError, ValueError):
        raise ValueError("素材引用快照无效")
    if not isinstance(bindings, list) or len(bindings) > 32:
        raise ValueError("素材引用快照无效")
    shared_id = uuid.uuid4().hex[:10]
    references = copy_references(shared_id, fields, folder_id)
    ratio = fields.getfirst("ratio", "9:16")
    duration = fields.getfirst("duration", "15")
    resolution = fields.getfirst("resolution", "720p")
    provider = validate_task_input(kind, profile, raw_prompts, ratio, duration, resolution, references)
    print(f"[{time.strftime('%H:%M:%S')}] queued {provider}/{kind}: {len(prompts)} task(s), {len(references)} reference file(s)")
    created: list[dict[str, Any]] = []
    with LOCK:
        for prompt in prompts:
            doubao_busy = provider == "doubao_work" and (bool(doubao_work.pending_task_id()) or any(
                item.get("provider") == "doubao_work" and item["status"] in {"queued", "running"}
                for item in TASKS.values()
            ))
            task_id = uuid.uuid4().hex[:12]
            task = {
                "id": task_id,
                "kind": kind,
                "provider": provider,
                "profile": profile,
                "prompt": prompt,
                "status": "failed" if doubao_busy else "queued",
                "created_at": now(),
                "started_at": None,
                "finished_at": now() if doubao_busy else None,
                "reference_files": references,
                "ratio": ratio,
                "duration": duration,
                "resolution": resolution,
                "image_url": "",
                "local_image_url": "",
                "video_url": "",
                "local_video_url": "",
                "error": "当前已有生视频任务进行中，请等结束后再试" if doubao_busy else "",
                "queue_position": None if doubao_busy else len([
                    queued for queued in TASKS.values()
                    if queued["status"] == "queued" and queued["kind"] == kind
                ]) + 1,
                "folder_id": folder_id,
                "history_version": HISTORY_VERSION,
                "board_id": str(fields.getfirst("board_id", "") or ""),
                "node_id": str(fields.getfirst("node_id", "") or ""),
                "reference_bindings": bindings,
                "submission_id": submission_id,
                "provider_task_id": "",
                "provider_result_url": "",
            }
            TASKS[task_id] = task
            created.append(task)
            record_task_event("failed" if doubao_busy else "queued", task)
            if not doubao_busy:
                (DOUBAO_EXECUTOR if provider == "doubao_work" else EXECUTORS[kind]).submit(run_task, task_id)
    return created


def parse_model_result(raw: str) -> dict[str, Any]:
    """The shared CLI prints JSON; preserve only its useful result fields."""
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"模型调用器未返回有效 JSON：{raw[-500:]}") from exc
    if payload.get("ok") is False:
        raise RuntimeError(payload.get("error") or "模型调用失败")
    return payload


def download_image_result(image_url: str, task_id: str, folder_id: str = "") -> str:
    """Download one generated image and return its local media URL."""
    with urlopen(image_url, timeout=120) as response:
        content_type = response.headers.get_content_type()
        suffix = Path(urlparse(image_url).path).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
            suffix = mimetypes.guess_extension(content_type) or ".jpg"
        directory = workspace_result_dir(folder_id)
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / f"{task_id}{suffix}"
        temporary = target.with_suffix(target.suffix + ".part")
        with temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(target)
    persist_cloud_image(target)
    return workspace_media_url(folder_id, "results", target.name)


def download_video_result(video_url: str, task_id: str, folder_id: str = "") -> str:
    """Download one generated video and return its local seekable media URL."""
    with urlopen(video_url, timeout=600) as response:
        content_type = response.headers.get_content_type()
        suffix = Path(urlparse(video_url).path).suffix.lower()
        if suffix not in {".mp4", ".mov", ".webm"}:
            suffix = mimetypes.guess_extension(content_type) or ".mp4"
        directory = workspace_result_dir(folder_id)
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / f"{task_id}{suffix}"
        temporary = target.with_suffix(target.suffix + ".part")
        with temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(target)
    return workspace_media_url(folder_id, "results", target.name)


def save_provider_image(content: bytes, task_id: str, folder_id: str = "") -> str:
    from PIL import Image
    import io
    with Image.open(io.BytesIO(content)) as image:
        image.verify()
        suffix = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}.get(image.format)
    if not suffix:
        raise ValueError("供应商返回了不支持的图片格式")
    directory = workspace_result_dir(folder_id)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / (task_id + suffix)
    temporary = target.with_suffix(suffix + ".part")
    temporary.write_bytes(content)
    temporary.replace(target)
    persist_cloud_image(target)
    return workspace_media_url(folder_id, "results", target.name)


def run_task(task_id: str) -> None:
    with LOCK:
        task = TASKS.get(task_id)
        if not task:
            return
        task["status"] = "running"
        task["started_at"] = now()
        task["queue_position"] = None
        record_task_event("started", task)

    references = task["reference_files"]
    try:
        print(f"[{time.strftime('%H:%M:%S')}] starting {task.get('provider', 'ark')}/{task['kind']} task {task_id}: {len(references)} reference file(s)")
        if task.get("provider") == "lingganya":
            api_key = private_env_value("LINGGANYA_API_KEY")
            if not api_key:
                raise RuntimeError("未配置 LINGGANYA_API_KEY")
            def remember_upstream(value):
                with LOCK:
                    task["provider_task_id"] = value
                    record_task_event("upstream_created", task)
            def remember_result_url(value):
                with LOCK:
                    task["provider_result_url"] = value
                    record_task_event("result_url_received", task)
            image_content = lingganya_client.generate(task, api_key, remember_upstream, on_result_url=remember_result_url)
            result = {}
            image_url = video_url = ""
        elif task.get("provider") == "doubao_work":
            source = doubao_work.generate(task, private_env_value("DOUBAO_WORK_BRIDGE"))
            directory = workspace_result_dir(str(task.get("folder_id") or ""))
            directory.mkdir(parents=True, exist_ok=True)
            target = directory / f"{task_id}.mp4"
            temporary = target.with_suffix(".mp4.part")
            shutil.copyfile(source, temporary)
            temporary.replace(target)
            result = {"output_file": str(target)}
            image_url = video_url = ""
        elif task.get("provider") == "hfsy":
            raise RuntimeError("HFSY 接入已移除，历史任务不会重新提交")
        else:
            command = [sys.executable, str(SKILL_CALLER), "run", "--profile", task["profile"], "--prompt", task["prompt"]]
            if task["kind"] == "image":
                command.extend(arg for ref in references if ref["mime"].startswith("image/") for arg in ("--image-file", ref["path"]))
            else:
                for ref in references:
                    if ref["mime"].startswith("image/"):
                        command.extend(("--image-file", ref["path"]))
                    elif ref["mime"].startswith("video/"):
                        command.extend(("--video-file", ref["path"]))
                    elif ref["mime"].startswith("audio/"):
                        command.extend(("--audio-file", ref["path"]))
                output_path = workspace_result_dir(str(task.get("folder_id") or "")) / f"{task_id}.mp4"
                output_path.parent.mkdir(parents=True, exist_ok=True)
                command.extend(("--ratio", task["ratio"], "--duration", task["duration"], "--resolution", task["resolution"], "--output-file", str(output_path)))
            completed = subprocess.run(
                command, cwd=APP_DIR, capture_output=True, text=True, timeout=1950, check=False, env=model_child_env(task["kind"])
            )
            result = parse_model_result(completed.stdout)
            if completed.returncode != 0:
                raise RuntimeError(result.get("error") or "模型调用失败")
            image_url = str(result.get("image_url") or "")
            video_url = str(result.get("video_url") or "")
        local_image_url = ""
        local_video_url = ""
        if task.get("provider") == "lingganya":
            if task["kind"] == "image":
                local_image_url = save_provider_image(image_content, task_id, str(task.get("folder_id") or ""))
            else:
                if len(image_content) < 12 or image_content[4:8] != b"ftyp":
                    raise ValueError("供应商未返回有效 MP4 文件")
                directory = workspace_result_dir(str(task.get("folder_id") or ""))
                directory.mkdir(parents=True, exist_ok=True)
                target = directory / (task_id + ".mp4")
                temporary = target.with_suffix(".part")
                temporary.write_bytes(image_content)
                temporary.replace(target)
                local_video_url = workspace_media_url(str(task.get("folder_id") or ""), "results", target.name)
        elif task["kind"] == "image":
            if not image_url:
                raise RuntimeError("模型未返回图片地址")
            local_image_url = download_image_result(image_url, task_id, str(task.get("folder_id") or ""))
        with LOCK:
            task["status"] = "completed"
            task["image_url"] = image_url
            task["local_image_url"] = local_image_url
            task["video_url"] = video_url
            task["local_video_url"] = local_video_url
            output_file = result.get("output_file")
            if output_file and Path(output_file).exists():
                task["local_video_url"] = workspace_media_url(str(task.get("folder_id") or ""), "results", Path(output_file).name)
            task["finished_at"] = now()
            register_completed_task(task)
            record_task_event("completed", task)
    except lingganya_client.PendingTask as exc:
        with LOCK:
            task["status"] = "paused"
            task["error"] = str(exc)
            record_task_event("paused", task)
    except subprocess.TimeoutExpired:
        with LOCK:
            task["status"] = "failed"
            task["error"] = "任务超过 32 分钟仍未结束，请在 Ark 后台确认状态。"
            task["finished_at"] = now()
            record_task_event("failed", task)
            print(f"[{time.strftime('%H:%M:%S')}] task {task_id} failed: {task['error']}")
    except Exception as exc:
        with LOCK:
            task["status"] = "failed"
            if task.get("provider") == "doubao_work" and doubao_work.pending_task_id() == task["id"]:
                task["status"] = "paused"
            task["error"] = str(exc)[:900]
            task["finished_at"] = now()
            record_task_event("failed", task)
            print(f"[{time.strftime('%H:%M:%S')}] task {task_id} failed: {task['error']}")


def parse_byte_range(header: str, size: int) -> tuple[int, int] | None:
    if not header:
        return None
    if not header.startswith("bytes=") or "," in header:
        raise ValueError("unsupported range")
    bounds = header.removeprefix("bytes=").strip()
    if "-" not in bounds:
        raise ValueError("invalid range")
    raw_start, raw_end = bounds.split("-", 1)
    if size <= 0:
        raise ValueError("empty file")
    if not raw_start:
        suffix = int(raw_end)
        if suffix <= 0:
            raise ValueError("invalid suffix")
        start = max(0, size - suffix)
        end = size - 1
    else:
        start = int(raw_start)
        end = int(raw_end) if raw_end else size - 1
        if start < 0 or start >= size or end < start:
            raise ValueError("unsatisfied range")
        end = min(end, size - 1)
    return start, end


class StudioHandler(SimpleHTTPRequestHandler):
    server_version = "ModelStudio/1.0"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{time.strftime('%H:%M:%S')}] {self.address_string()} {fmt % args}")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/doubao/status":
            return self.respond_json(doubao_work.status())
        if path == "/api/script/status":
            return self.respond_json(script_studio.connection(private_env_value))
        if path == "/api/script/skills":
            with script_studio.LOCK: return self.respond_json({"skills": script_studio.skills(), "active_install": next((dict(j) for j in script_studio.JOBS.values() if j.get("mode")=="install" and not j.get("settled",True)),None)})
        if path.startswith("/api/script/conversations/"):
            try: return self.respond_json({"conversations":script_studio.conversations(path.rsplit("/",1)[-1])})
            except ValueError as exc: return self.respond_json({"error":str(exc)}, HTTPStatus.BAD_REQUEST)
        if path.startswith("/api/script/history/"):
            try: return self.respond_json(script_studio.history(path.rsplit("/",1)[-1]))
            except ValueError as exc: return self.respond_json({"error":str(exc)}, HTTPStatus.BAD_REQUEST)
        if path.startswith("/api/script/events/"):
            ident=path.rsplit("/",1)[-1]
            with script_studio.LOCK:
                if ident not in script_studio.JOBS:return self.respond_json({"error":"任务不存在"},HTTPStatus.NOT_FOUND)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type","text/event-stream; charset=utf-8")
            self.send_header("X-Accel-Buffering","no")
            self.end_headers()
            try:
                for event in script_studio.event_stream(ident):
                    self.wfile.write(event);self.wfile.flush()
            except (BrokenPipeError,ConnectionResetError):pass
            self.close_connection=True
            return
        if path.startswith("/api/script/jobs/"):
            with script_studio.LOCK:
                job=script_studio.JOBS.get(path.rsplit("/",1)[-1])
                return self.respond_json(dict(job) if job else {"error":"任务不存在"}, HTTPStatus.OK if job else HTTPStatus.NOT_FOUND)
        if path == "/api/health":
            return self.respond_json(health_flags())
        if path == "/api/tasks":
            with LOCK:
                tasks = sorted(TASKS.values(), key=lambda item: item["created_at"], reverse=True)
                return self.respond_json({"tasks": [public_task(task) for task in tasks]})
        if path == "/api/provider-pricing":
            try:
                raw, _ = lingganya_client.request("/api/subsite/pricing", private_env_value("LINGGANYA_API_KEY"), timeout=15)
                price_data = json.loads(raw).get("data", {})
                prices = price_data.get("model_price", {})
                modes = price_data.get("billing_mode", {})
                return self.respond_json({"mini": prices.get("sd-2.0-mini") if modes.get("sd-2.0-mini") == "per_second" else None,
                                          "sunburst": prices.get(lingganya_client.MODEL) if modes.get(lingganya_client.MODEL) == "per_request" else None,
                                          "source": "供应商当前公开目录估算，结算以账户账单为准"})
            except Exception:
                return self.respond_json({"mini": None, "sunburst": None})
        if path == "/api/boards":
            return self.respond_json({**BOARDS.load(), "storage": "cloud" if BOARDS.remote_writer else "local"})
        if path == "/api/usage":
            return self.respond_json(daily_usage())
        if path == "/api/storage":
            return self.respond_json({"ok": True, **cloud_status()})
        if path == "/api/trash":
            return self.respond_json({"ok": True, "items": list_trash()})
        if path == "/api/library":
            snapshot = MEDIA_LIBRARY.snapshot()
            return self.respond_json({
                "ok": True,
                "folders": snapshot["folders"],
                "assets": sorted(snapshot["assets"], key=lambda item: item.get("created_at", 0), reverse=True),
            })
        if path == "/api/inspirations":
            snapshot = INSPIRATION_LIBRARY.snapshot()
            return self.respond_json({"ok": True, "items": sorted(snapshot["items"], key=lambda item: item.get("created_at", 0), reverse=True)})
        if path.startswith("/media/"):
            return self.serve_media(path)
        if path in {"/", "/index.html"}:
            self.path = "/index.html"
        if path in {"/cloud-images.json", "/cloud-images.tmp"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if path not in {"/", "/index.html", "/app.js", "/style.css", "/canvas.html", "/canvas.js", "/rich-prompt.js", "/canvas-orb.js", "/canvas.css", "/canvas-ui.js", "/canvas-ui.css", "/script.html", "/script-app.js", "/script-app.css", "/vendor/floating-ui/core.min.js", "/vendor/floating-ui/dom.min.js", "/vendor/motion/motion.js", "/assets/brand/morritv-logo.png", "/assets/brand/morritv-icon.png"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        return super().do_GET()

    def serve_media(self, request_path: str) -> None:
        relative = unquote(request_path.removeprefix("/media/"))
        if relative.startswith("results/"):
            target = RESULTS_DIR / Path(relative).name
        elif relative.startswith("uploads/"):
            try:
                target = (UPLOADS_DIR / relative.removeprefix("uploads/")).resolve()
                target.relative_to(UPLOADS_DIR.resolve())
            except ValueError:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
        elif relative.startswith("collections/"):
            parts = Path(relative).parts
            if len(parts) < 4 or not re.fullmatch(r"[A-Za-z0-9_-]+", parts[1]) or parts[2] not in {"results", "uploads"}:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            base = (COLLECTIONS_DIR / parts[1] / parts[2]).resolve()
            try:
                target = (base / Path(*parts[3:])).resolve()
                target.relative_to(base)
            except ValueError:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
        elif relative.startswith("trash/"):
            try:
                target = (TRASH_DIR / relative.removeprefix("trash/")).resolve()
                target.relative_to(TRASH_DIR.resolve())
                if "metadata.json" == target.name or target.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".webm", ".m4v"}:
                    raise ValueError("不是媒体文件")
            except ValueError:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
        elif relative.startswith("inspirations/"):
            try:
                target = (INSPIRATIONS_DIR / relative.removeprefix("inspirations/")).resolve()
                target.relative_to(INSPIRATIONS_DIR.resolve())
            except ValueError:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
        else:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        cloud_info = None if relative.startswith("trash/") else cloud_media_info(target)
        thumbnail = "thumbnail=1" in urlparse(self.path).query
        local_exists = target.is_file()
        if not local_exists and not cloud_info:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        # Local video originals and image previews are disposable read caches.
        from_cloud = cloud_info and (not local_exists or (not thumbnail and not cloud_info.get("cache_original")))
        if from_cloud:
            info = cloud_info.get("preview", cloud_info) if thumbnail else cloud_info
            size = info["original_bytes"]
            try:
                byte_range = parse_byte_range(self.headers.get("Range", ""), size)
            except (ValueError, TypeError):
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            headers = {"Range": f"bytes={byte_range[0]}-{byte_range[1]}"} if byte_range else {}
            try:
                request = Request(CLOUD_IMAGES.url(info, private_env_value), headers=headers)
                with urlopen(request, timeout=120) as original:
                    if byte_range and original.status != 206:
                        raise ValueError("Cloud storage did not honor Range")
                    self.send_response(HTTPStatus.PARTIAL_CONTENT if byte_range else HTTPStatus.OK)
                    self.send_header("Content-Type", info["mime"])
                    if thumbnail:self.send_header("Cache-Control", "private, max-age=300")
                    self.send_header("Content-Length", str(byte_range[1] - byte_range[0] + 1 if byte_range else size))
                    self.send_header("Accept-Ranges", "bytes")
                    if byte_range:
                        self.send_header("Content-Range", f"bytes {byte_range[0]}-{byte_range[1]}/{size}")
                    self.end_headers()
                    shutil.copyfileobj(original, self.wfile)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                self.send_error(HTTPStatus.BAD_GATEWAY, "Cloud media unavailable")
            return
        size = target.stat().st_size
        try:
            byte_range = parse_byte_range(self.headers.get("Range", ""), size)
        except (TypeError, ValueError):
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        start, end = byte_range or (0, max(0, size - 1))
        content_length = end - start + 1 if size else 0
        self.send_response(HTTPStatus.PARTIAL_CONTENT if byte_range else HTTPStatus.OK)
        self.send_header("Content-Type", (cloud_info.get("thumbnail_mime", "image/webp") if cloud_info and not cloud_info.get("cache_original") else mimetypes.guess_type(target.name)[0] or "application/octet-stream"))
        self.send_header("Accept-Ranges", "bytes")
        if byte_range:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        if thumbnail:self.send_header("Cache-Control", "private, max-age=300")
        self.send_header("Content-Length", str(content_length))
        self.end_headers()
        with target.open("rb") as file:
            file.seek(start)
            remaining = content_length
            try:
                while remaining:
                    chunk = file.read(min(64 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            if path == "/api/doubao/login":
                origin = urlparse(self.headers.get("Origin", ""))
                if origin.netloc != self.headers.get("Host") or self.headers.get("X-MorriTV-Action") != "doubao-login":
                    return self.respond_json({"error": "请从本机画板工具打开豆包登录"}, HTTPStatus.FORBIDDEN)
                with LOCK:
                    if any(t.get("provider") == "doubao_work" and t["status"] in {"queued", "running"} for t in TASKS.values()):
                        raise ValueError("当前已有生视频任务进行中，请等结束后再登录")
                    return self.respond_json(doubao_work.start_login())
            if path == "/api/script/settings":
                return self.respond_json(script_studio.save_connection(self.read_json(),private_env_value))
            if path == "/api/script/attachments":
                return self.respond_json({"attachment":script_studio.upload_attachment(self.read_json(max_bytes=28*1024*1024))})
            if path == "/api/script/skills":
                return self.respond_json(script_studio.start_install(self.read_json(max_bytes=2*1024*1024),private_env_value))
            if path == "/api/script/conversation":
                return self.respond_json(script_studio.select_conversation(self.read_json()))
            if path == "/api/script/chat":
                return self.respond_json(script_studio.start(self.read_json(),private_env_value))
            if path == "/api/script/cancel":
                return self.respond_json(script_studio.cancel(str(self.read_json().get("id",""))))
            if path == "/api/boards/export":
                content = build_export(self.read_json(max_bytes=8 * 1024 * 1024),
                                       {"results": RESULTS_DIR, "collections": COLLECTIONS_DIR, "uploads": UPLOADS_DIR, "inspirations": INSPIRATIONS_DIR}, CLOUD_WORKSPACE or CLOUD_IMAGES, private_env_value)
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", 'attachment; filename="storyboard.zip"')
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            if path == "/api/boards":
                return self.respond_json({**BOARDS.save(self.read_json(max_bytes=8 * 1024 * 1024)), "storage": "cloud" if BOARDS.remote_writer else "local"})
            resume = re.fullmatch(r"/api/tasks/([A-Za-z0-9_-]+)/resume", path)
            if resume:
                with LOCK:
                    task = TASKS.get(resume.group(1))
                    is_doubao = bool(task and task.get("provider") == "doubao_work" and doubao_work.pending_task_id() == task["id"])
                    if not task or not (is_doubao or (task.get("provider") == "lingganya" and (task.get("provider_task_id") or task.get("provider_result_url")))):
                        raise ValueError("没有可继续查询的供应商任务")
                    if task["status"] not in {"paused", "failed"}:
                        raise ValueError("该任务正在执行或已完成")
                    task["status"] = "queued"
                    task["error"] = ""
                    if is_doubao:
                        task["_doubao_recover"] = True
                    record_task_event("resumed", task)
                    (DOUBAO_EXECUTOR if is_doubao else EXECUTORS[task["kind"]]).submit(run_task, task["id"])
                return self.respond_json({"ok": True})
            if path == "/api/storage/sync":
                if not tos_uploader.config_status(private_env_value)["ready"]:
                    raise ValueError("TOS 未配置，原图保留在本地")
                with LOCK:
                    if not CLOUD_SYNC["running"]:
                        CLOUD_SYNC.update(running=True, synced=0, failed=0)
                        threading.Thread(target=sync_cloud_images, name="cloud-image-sync", daemon=True).start()
                return self.respond_json({"ok": True, **cloud_status()}, HTTPStatus.ACCEPTED)
            purge_match = re.fullmatch(r"/api/trash/([A-Za-z0-9_-]+)/purge", path)
            if purge_match:
                with LOCK:
                    shutil.rmtree(trash_entry(purge_match.group(1)))
                return self.respond_json({"ok": True})
            restore_match = re.fullmatch(r"/api/trash/([A-Za-z0-9_-]+)/restore", path)
            if restore_match:
                restore_trash(restore_match.group(1))
                return self.respond_json({"ok": True})
            if path == "/api/tasks":
                fields = self.read_multipart()
                with LOCK:
                    tasks = create_tasks(fields)
                return self.respond_json({"ok": True, "tasks": [public_task(task) for task in tasks]}, HTTPStatus.ACCEPTED)
            if path == "/api/library/folders":
                folder = MEDIA_LIBRARY.create_folder(str(self.read_json().get("name") or ""))
                return self.respond_json({"ok": True, "folder": folder}, HTTPStatus.CREATED)
            if path == "/api/inspirations":
                task_id = str(self.read_json().get("task_id") or "")
                with LOCK:
                    task = TASKS.get(task_id)
                    if not task:
                        raise ValueError("任务不存在")
                    task_snapshot = dict(task)
                item = INSPIRATION_LIBRARY.create_from_task(task_snapshot)
                return self.respond_json({"ok": True, "item": item}, HTTPStatus.CREATED)
            if path == "/api/library/assets":
                fields = self.read_multipart()
                raw_media = fields["media"] if "media" in fields else None
                media = raw_media[0] if isinstance(raw_media, list) and raw_media else raw_media
                if media is None or not getattr(media, "filename", None) or not getattr(media, "file", None):
                    raise ValueError("请选择要导入的图片或视频")
                mime = str(getattr(media, "type", "") or mimetypes.guess_type(media.filename)[0] or "application/octet-stream")
                asset = MEDIA_LIBRARY.import_stream(
                    Path(media.filename).name,
                    mime,
                    media.file,
                    str(fields.getfirst("folder_id", "") or ""),
                )
                if asset["kind"] == "image":
                    persist_cloud_image(MEDIA_LIBRARY.workspace_result_dir(asset["folder_id"]) / asset["file_name"])
                return self.respond_json({"ok": True, "asset": asset}, HTTPStatus.CREATED)
            metadata_match = re.fullmatch(r"/api/library/assets/([A-Za-z0-9_-]+)/metadata", path)
            if metadata_match:
                asset = MEDIA_LIBRARY.update_metadata(metadata_match.group(1), self.read_json())
                return self.respond_json({"ok": True, "asset": asset})
            move_match = re.fullmatch(r"/api/library/assets/([A-Za-z0-9_-]+)/move", path)
            if move_match:
                asset = move_library_asset(move_match.group(1), str(self.read_json().get("folder_id") or ""))
                return self.respond_json({"ok": True, "asset": asset})
            return self.respond_json({"ok": False, "error": "接口不存在"}, HTTPStatus.NOT_FOUND)
        except BoardConflict as exc:
            return self.respond_json({"ok": False, "error": str(exc)}, HTTPStatus.CONFLICT)
        except ValueError as exc:
            return self.respond_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            return self.respond_json({"ok": False, "error": str(exc)[:500] or "请求处理失败"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        try:
            task_match = re.fullmatch(r"/api/tasks/([A-Za-z0-9_-]+)", path)
            if task_match:
                deleted = delete_task(task_match.group(1))
                return self.respond_json({"ok": True, "deleted_task": deleted["task"], "trash_path": deleted["trash_path"]})
            asset_match = re.fullmatch(r"/api/library/assets/([A-Za-z0-9_-]+)", path)
            if asset_match:
                deleted = delete_library_asset(asset_match.group(1))
                return self.respond_json({"ok": True, "deleted_asset": deleted["asset"], "trash_path": deleted["trash_path"]})
            inspiration_match = re.fullmatch(r"/api/inspirations/([A-Za-z0-9_-]+)", path)
            if inspiration_match:
                trash_root = _new_trash_root("inspiration", inspiration_match.group(1))
                deleted = INSPIRATION_LIBRARY.delete(inspiration_match.group(1), trash_root)
                (trash_root / "metadata.json").write_text(json.dumps({"deleted_at": now(), "item": deleted["item"]}, ensure_ascii=False), encoding="utf-8")
                return self.respond_json({"ok": True, "deleted_item": deleted["item"], "trash_path": str(trash_root)})
            folder_match = re.fullmatch(r"/api/library/folders/([A-Za-z0-9_-]+)", path)
            if folder_match:
                deleted = delete_collection_folder(folder_match.group(1))
                return self.respond_json({"ok": True, "deleted_folder": deleted["folder"]})
            return self.respond_json({"ok": False, "error": "接口不存在"}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            return self.respond_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            return self.respond_json({"ok": False, "error": str(exc)[:500] or "请求处理失败"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def read_json(self, max_bytes: int = 65_536) -> dict[str, Any]:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("application/json"):
            raise ValueError("请求格式必须为 application/json")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("请求长度无效") from exc
        if length <= 0 or length > max_bytes:
            raise ValueError("请求内容不能为空或过大")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("请求 JSON 无效") from exc
        if not isinstance(payload, dict):
            raise ValueError("请求 JSON 必须是对象")
        return payload

    def read_multipart(self) -> cgi.FieldStorage:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            raise ValueError("请求格式必须为 multipart/form-data")
        return cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={
            "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": content_type,
            "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
        })

    def respond_json(self, data: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    os.chdir(APP_DIR)
    CLOUD_WORKSPACE = CloudWorkspace(APP_DIR, CLOUD_IMAGES, private_env_value)
    if CLOUD_WORKSPACE.ready:
        CLOUD_WORKSPACE.restore_documents()
        MEDIA_LIBRARY = MediaLibrary(LIBRARY_FILE, RESULTS_DIR, COLLECTIONS_DIR,
                                     restore_cache=CLOUD_WORKSPACE.restore_cache)
        INSPIRATION_LIBRARY = InspirationLibrary(INSPIRATION_FILE, INSPIRATIONS_DIR, RESULTS_DIR, UPLOADS_DIR, COLLECTIONS_DIR)
    load_task_history()
    # Board writes never acknowledge a local-only save in the running application.
    BOARDS.remote_writer = CLOUD_WORKSPACE.save_board
    if CLOUD_WORKSPACE.ready:
        CLOUD_WORKSPACE.save_board(BOARDS.load())
        CLOUD_WORKSPACE.start(MEDIA_LIBRARY)
    print(f"Model Studio running at http://{HOST}:{PORT}")
    print("API keys are read from the gitignored .env file or process environment")
    ThreadingHTTPServer((HOST, PORT), StudioHandler).serve_forever()
