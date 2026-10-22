"""Lingganya Image 2.5 contract. POST once; resume only an existing task ID."""
from __future__ import annotations

import base64
import json
import re
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, HTTPRedirectHandler, build_opener

BASE_URL = "https://www.lingganyaapi.com"
PROFILE = "lingganya-gpt-image-2.5-sunburst-special"
MODEL = "gpt-image-2.5-sunburst-special"
VIDEO_PROFILE = "lingganya-sd-2.0-mini"
# Only the model-specific documented baseline is enabled, not another model's size table.
SIZES = {"1:1": {"1K": "1024x1024"}}
MAX_REFERENCES = 8  # Local workbench limit; not a provider capacity claim.
MAX_IMAGE_BYTES = 20 * 1024 * 1024


class PendingTask(RuntimeError):
    """The upstream task may still be running; never submit it again automatically."""


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlparse(newurl).scheme != "https":
            raise RuntimeError("供应商返回了非 HTTPS 下载地址")
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected and urlparse(newurl).netloc != urlparse(BASE_URL).netloc:
            redirected.remove_header("Authorization")
        return redirected


def request(path, key, body=None, content_type="application/json", timeout=600):
    url = path if path.startswith("https://") else BASE_URL + path
    headers = {}
    if urlparse(url).netloc == urlparse(BASE_URL).netloc:
        headers["Authorization"] = "Bearer " + key
    if body is not None:
        headers["Content-Type"] = content_type
    req = Request(url, data=body, headers=headers)
    try:
        with build_opener(SafeRedirect()).open(req, timeout=timeout) as response:
            return response.read(), response.headers.get_content_type()
    except HTTPError as exc:
        try:
            payload = json.loads(exc.read())
            error = payload.get("error", payload)
            message = error.get("message", "请求失败") if isinstance(error, dict) else str(error)
        except Exception:
            message = "请求失败"
        raise RuntimeError(f"灵感鸭 HTTP {exc.code}：{str(message).replace(key, '[redacted]')[:400]}") from None
    except (URLError, TimeoutError, OSError):
        raise RuntimeError("灵感鸭连接中断或超时；请先核对供应商任务与消费记录，未自动重复提交。") from None


def validate(profile, prompt, ratio, resolution, references):
    if profile == VIDEO_PROFILE:
        if not prompt.strip() or ratio not in {"16:9", "9:16"} or resolution != "720p":
            raise ValueError("SD 2.0 Mini 需要提示词，支持 16:9 / 9:16，固定 720p")
        counts = {kind: sum(ref.get("mime", "").startswith(kind + "/") for ref in references) for kind in ("image", "video", "audio")}
        if counts["image"] > 6 or counts["video"] > 3 or counts["audio"] > 3 or sum(counts.values()) != len(references):
            raise ValueError("SD 2.0 Mini 最多支持 6 张图片、3 段视频、3 段音频")
        if (counts["video"] or counts["audio"]) and not counts["image"]:
            raise ValueError("SD 2.0 Mini 使用音视频参考时需要同时提供图片")
        return
    if profile != PROFILE or not prompt.strip():
        raise ValueError("请选择可用模型并填写提示词")
    if ratio not in SIZES or resolution not in SIZES[ratio]:
        raise ValueError("Sunburst Special 当前接入仅开放官方基础规格：1:1 / 1024×1024")
    if len(references) > MAX_REFERENCES:
        raise ValueError(f"本工作台每次最多提交 {MAX_REFERENCES} 张参考图；供应商可能另有限制")
    if any(ref.get("mime") not in {"image/png", "image/jpeg", "image/webp"} for ref in references):
        raise ValueError("Sunburst 参考图仅支持 PNG、JPEG、WebP；不支持视频、音频、首尾帧控制")


def multipart(fields, references):
    boundary = "studio-" + uuid.uuid4().hex
    chunks = []
    for key, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    for index, ref in enumerate(references):
        source = Path(ref["path"])
        if source.stat().st_size > MAX_IMAGE_BYTES:
            raise ValueError("参考图片超过本工作台 20 MiB 上传上限")
        field = "image" if len(references) == 1 else "image[]"
        suffix = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}[ref["mime"]]
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="reference-{index + 1}{suffix}"\r\nContent-Type: {ref["mime"]}\r\n\r\n'.encode())
        chunks.extend((source.read_bytes(), b"\r\n"))
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), "multipart/form-data; boundary=" + boundary


def decode_result(payload, key):
    data = payload.get("data")
    if not isinstance(data, list) or not data:
        return None
    item = data[0]
    if item.get("b64_json"):
        try:
            return base64.b64decode(item["b64_json"], validate=True)
        except (ValueError, TypeError):
            raise RuntimeError("供应商返回的图片 Base64 无效") from None
    url = item.get("url")
    if url:
        if not str(url).startswith("https://"):
            raise RuntimeError("供应商返回的图片地址无效")
        return request(url, key)[0]
    return None


def generate(task, key, on_task_id=lambda value: None, sleep=time.sleep):
    video = task["profile"] == VIDEO_PROFILE
    area = "videos" if video else "images"
    upstream_id = task.get("provider_task_id")
    if upstream_id:
        payload = {"task_id": upstream_id}
    else:
        validate(task["profile"], task["prompt"], task["ratio"], task["resolution"], task["reference_files"])
        fields = {"model": MODEL, "prompt": task["prompt"], "size": "1024x1024" if video else SIZES[task["ratio"]][task["resolution"]], "n": 1, "response_format": "b64_json"}
        if video:
            seconds = int(task["duration"])
            if not 5 <= seconds <= 15:
                raise ValueError("SD 2.0 Mini 时长必须为 5–15 秒")
            fields = {"model": "sd-2.0-mini", "prompt": task["prompt"], "seconds": seconds, "size": task["ratio"], "resolution": "720p"}
            media = {"image": [], "video": [], "audio": []}
            for ref in task["reference_files"]:
                source = Path(ref["path"])
                if source.stat().st_size > MAX_IMAGE_BYTES:
                    raise ValueError("参考素材超过供应商 20 MiB 上传上限")
                boundary = "studio-" + uuid.uuid4().hex
                body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="reference{source.suffix}"\r\nContent-Type: {ref["mime"]}\r\n\r\n'.encode() + source.read_bytes() + f'\r\n--{boundary}--\r\n'.encode())
                uploaded, _ = request("/v1/files", key, body, "multipart/form-data; boundary=" + boundary)
                upload = json.loads(uploaded)
                file_id = upload.get("file_id") or upload.get("id")
                if not file_id:
                    raise RuntimeError("供应商参考素材上传未返回 file_id")
                media[ref["mime"].split("/")[0]].append(file_id)
            if media["image"]:
                fields["images"] = media["image"]
            extra = {}
            if media["video"]:
                extra["reference_videos"] = media["video"]
            if media["audio"]:
                extra["reference_audios"] = media["audio"]
            if extra:
                fields["extra"] = extra
            raw, _ = request("/v1/videos", key, json.dumps(fields).encode())
        elif task["reference_files"]:
            body, mime = multipart(fields, task["reference_files"])
            raw, _ = request("/v1/images/edits", key, body, mime)
        else:
            raw, _ = request("/v1/images/generations", key, json.dumps(fields).encode())
        payload = json.loads(raw)
    upstream_id = payload.get("task_id") or (payload.get("id") if payload.get("status") else None)
    if upstream_id:
        if not re.fullmatch(r"[A-Za-z0-9_-]+", upstream_id):
            raise RuntimeError("供应商返回的任务 ID 无效")
        on_task_id(upstream_id)
    for attempt in range(361):
        if payload.get("error") or str(payload.get("status", "")).lower() in {"failed", "failure", "cancelled", "canceled", "error"}:
            error = payload.get("error") or {"message": "生成失败"}
            message = error.get("message", "生成失败") if isinstance(error, dict) else str(error)
            raise RuntimeError(str(message).replace(key, "[redacted]")[:500])
        result = decode_result(payload, key)
        if result:
            return result
        if not upstream_id:
            raise RuntimeError("供应商未返回图片或任务 ID；请核对消费记录，未重复提交。")
        if str(payload.get("status", "")).lower() in {"completed", "complete", "success", "succeeded", "done", "finished"}:
            return request(f"/v1/{area}/{quote(upstream_id)}/content", key)[0]
        if attempt == 360:
            raise PendingTask("等待超过 30 分钟，已保留原任务 ID，可继续查询而不重新生成。")
        sleep(30 if video and attempt == 0 else 5)
        try:
            raw, _ = request(f"/v1/{area}/{quote(upstream_id)}", key, timeout=60)
            payload = json.loads(raw)
        except (RuntimeError, ValueError):
            raise PendingTask("原任务查询暂不可用，已保留任务 ID；使用“继续查询”恢复，不要重复生成。") from None
