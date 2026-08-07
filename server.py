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
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse

APP_DIR = Path(__file__).resolve().parent
SKILL_CALLER = APP_DIR / "tools" / "call_business_model.py"
PRIVATE_ENV = APP_DIR / ".env"
UPLOADS_DIR = APP_DIR / "uploads"
RESULTS_DIR = APP_DIR / "results"
HISTORY_FILE = APP_DIR / "task-history.jsonl"
HOST = "127.0.0.1"
PORT = int(os.getenv("MODEL_STUDIO_PORT", "4178"))
MAX_WORKERS = 2

for folder in (UPLOADS_DIR, RESULTS_DIR):
    folder.mkdir(parents=True, exist_ok=True)

TASKS: dict[str, dict[str, Any]] = {}
LOCK = threading.RLock()
EXECUTOR = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="model-studio")
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


PERSISTED_TASK_FIELDS = (
    "id", "kind", "profile", "prompt", "status", "created_at", "started_at",
    "finished_at", "reference_files", "ratio", "duration", "resolution", "image_url",
    "local_video_url", "error", "queue_position",
)


def history_task_snapshot(task: dict[str, Any]) -> dict[str, Any]:
    """Create a key-free task snapshot that can be replayed after a restart."""
    snapshot = {key: task.get(key) for key in PERSISTED_TASK_FIELDS}
    snapshot["reference_files"] = [
        {
            "name": str(reference.get("name") or "reference"),
            "path": str(reference.get("path") or ""),
            "mime": str(reference.get("mime") or "application/octet-stream"),
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
        "video_url": "",
        "local_video_url": str(snapshot.get("local_video_url") or ""),
        "error": str(snapshot.get("error") or ""),
        "queue_position": snapshot.get("queue_position"),
    }
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
        task = restore_history_task(snapshot)
        if task:
            latest_snapshots[task["id"]] = task

    interrupted: list[dict[str, Any]] = []
    with LOCK:
        TASKS.clear()
        for task in latest_snapshots.values():
            if task["status"] in {"queued", "running"}:
                task["status"] = "failed"
                task["error"] = "服务重启时任务尚未完成，未自动重跑，请重新提交。"
                task["finished_at"] = now()
                task["queue_position"] = None
                interrupted.append(task)
            TASKS[task["id"]] = task
        for task in interrupted:
            record_task_event("interrupted", task)


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


def public_reference(reference: dict[str, Any]) -> dict[str, str]:
    """Expose a local media URL for retry, never the absolute upload path."""
    public = {
        "name": str(reference.get("name") or "reference"),
        "mime": str(reference.get("mime") or "application/octet-stream"),
        "url": "",
    }
    try:
        relative = Path(str(reference.get("path") or "")).resolve().relative_to(UPLOADS_DIR.resolve())
        public["url"] = f"/media/uploads/{quote(relative.as_posix(), safe='/')}"
    except (ValueError, OSError):
        pass
    return public


def public_task(task: dict[str, Any]) -> dict[str, Any]:
    """Return safe task data only; prompts and model metadata are intentionally kept."""
    public = {
        key: task.get(key)
        for key in (
            "id", "kind", "profile", "prompt", "status", "created_at", "started_at",
            "finished_at", "reference_files", "ratio", "duration", "resolution", "image_url",
            "video_url", "local_video_url", "error", "queue_position",
        )
    }
    public["reference_files"] = [
        public_reference(reference)
        for reference in task.get("reference_files") or []
        if isinstance(reference, dict)
    ]
    return public


def copy_references(task_id: str, fields: cgi.FieldStorage) -> list[dict[str, str]]:
    destination = UPLOADS_DIR / task_id
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


def create_tasks(fields: cgi.FieldStorage) -> list[dict[str, Any]]:
    kind = fields.getfirst("kind", "image")
    profile = fields.getfirst("profile", "")
    raw_prompts = fields.getfirst("prompts", "").strip()
    prompts = [raw_prompts] if raw_prompts else []
    if kind not in {"image", "video"}:
        raise ValueError("不支持的任务类型")
    if not prompts:
        raise ValueError("至少输入一条提示词")
    expected_profile = "seedance-reference-video-ark-direct" if kind == "video" else None
    if expected_profile and profile != expected_profile:
        raise ValueError("视频任务请使用 Seedance Reference Video")
    if kind == "image" and profile not in {"seedream43-ark-direct", "seedream50-pro-ark-direct"}:
        raise ValueError("图片任务请选择可用的 Seedream 模型")
    shared_id = uuid.uuid4().hex[:10]
    references = copy_references(shared_id, fields)
    print(f"[{time.strftime('%H:%M:%S')}] queued {kind} batch: {len(prompts)} task(s), {len(references)} reference file(s)")
    ratio = fields.getfirst("ratio", "9:16")
    duration = fields.getfirst("duration", "15")
    resolution = fields.getfirst("resolution", "720p")
    if kind == "video" and resolution != "720p":
        raise ValueError("当前 Seedance Fast 仅支持 720p；已阻止提交无效的 1080p 请求。")
    created: list[dict[str, Any]] = []
    with LOCK:
        for prompt in prompts:
            task_id = uuid.uuid4().hex[:12]
            task = {
                "id": task_id,
                "kind": kind,
                "profile": profile,
                "prompt": prompt,
                "status": "queued",
                "created_at": now(),
                "started_at": None,
                "finished_at": None,
                "reference_files": references,
                "ratio": ratio,
                "duration": duration,
                "resolution": resolution,
                "image_url": "",
                "video_url": "",
                "local_video_url": "",
                "error": "",
                "queue_position": len([t for t in TASKS.values() if t["status"] == "queued"]) + 1,
            }
            TASKS[task_id] = task
            created.append(task)
            record_task_event("queued", task)
            EXECUTOR.submit(run_task, task_id)
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


def run_task(task_id: str) -> None:
    with LOCK:
        task = TASKS.get(task_id)
        if not task:
            return
        task["status"] = "running"
        task["started_at"] = now()
        task["queue_position"] = None
        record_task_event("started", task)

    command = [sys.executable, str(SKILL_CALLER), "run", "--profile", task["profile"], "--prompt", task["prompt"]]
    references = task["reference_files"]
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
        output_path = RESULTS_DIR / f"{task_id}.mp4"
        command.extend(("--ratio", task["ratio"], "--duration", task["duration"], "--resolution", task["resolution"], "--output-file", str(output_path)))

    try:
        print(f"[{time.strftime('%H:%M:%S')}] starting {task['kind']} task {task_id}: {len(references)} reference file(s)")
        child_env = model_child_env(task["kind"])
        completed = subprocess.run(
            command, cwd=APP_DIR, capture_output=True, text=True, timeout=1950, check=False, env=child_env
        )
        result = parse_model_result(completed.stdout)
        if completed.returncode != 0:
            raise RuntimeError(result.get("error") or "模型调用失败")
        with LOCK:
            task["status"] = "completed"
            task["image_url"] = str(result.get("image_url") or "")
            task["video_url"] = str(result.get("video_url") or "")
            output_file = result.get("output_file")
            if output_file and Path(output_file).exists():
                task["local_video_url"] = f"/media/results/{Path(output_file).name}"
            task["finished_at"] = now()
            record_task_event("completed", task)
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
            task["error"] = str(exc)[:900]
            task["finished_at"] = now()
            record_task_event("failed", task)
            print(f"[{time.strftime('%H:%M:%S')}] task {task_id} failed: {task['error']}")


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
        if path == "/api/health":
            keys = set(configured_env_keys()) | set(os.environ)
            return self.respond_json({
                "ok": True,
                "image_ready": "ARK_API_KEY" in keys,
                "video_ready": "SEEDANCE_ARK_API_KEY" in keys,
                "workers": MAX_WORKERS,
            })
        if path == "/api/tasks":
            with LOCK:
                tasks = sorted(TASKS.values(), key=lambda item: item["created_at"], reverse=True)
                return self.respond_json({"tasks": [public_task(task) for task in tasks]})
        if path.startswith("/media/"):
            return self.serve_media(path)
        if path in {"/", "/index.html"}:
            self.path = "/index.html"
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
        else:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(target.stat().st_size))
        self.end_headers()
        with target.open("rb") as file:
            shutil.copyfileobj(file, self.wfile)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/tasks":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            return self.respond_json({"ok": False, "error": "请求格式必须为 multipart/form-data"}, HTTPStatus.BAD_REQUEST)
        try:
            fields = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={
                "REQUEST_METHOD": "POST", "CONTENT_TYPE": content_type,
            })
            tasks = create_tasks(fields)
            self.respond_json({"ok": True, "tasks": [public_task(task) for task in tasks]}, HTTPStatus.ACCEPTED)
        except ValueError as exc:
            self.respond_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self.respond_json({"ok": False, "error": f"创建任务失败：{str(exc)[:500]}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def respond_json(self, data: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    os.chdir(APP_DIR)
    load_task_history()
    print(f"Model Studio running at http://{HOST}:{PORT}")
    print("API keys are read from the gitignored .env file or process environment")
    ThreadingHTTPServer((HOST, PORT), StudioHandler).serve_forever()
