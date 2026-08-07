"""HFSY provider contracts for image and video generation."""

from __future__ import annotations

import json
import mimetypes
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


BASE_URL = "https://www.hfsyapi.cn"

MODEL_SPECS: dict[str, dict[str, Any]] = {
    "hfsy-gpt-image-2": {
        "model": "gpt-image-2", "kind": "image", "family": "gpt", "max_images": 6,
        "resolutions": ("1K",),
    },
    "hfsy-gpt-image-2pro": {
        "model": "gpt-image-2pro", "kind": "image", "family": "gpt", "max_images": 4,
        "resolutions": ("2K", "4K"),
    },
    "hfsy-nano-banana-2": {
        "model": "nano-banana-2", "kind": "image", "family": "nano", "max_images": 7,
        "resolutions": ("1K", "2K", "4K"),
    },
    "hfsy-nano-banana-pro": {
        "model": "nano-banana-pro", "kind": "image", "family": "nano", "max_images": 7,
        "resolutions": ("1K", "2K", "4K"),
    },
    "hfsy-minimax-h3": {
        "model": "minimax-h3", "kind": "video", "family": "minimax", "max_images": 5,
        "max_audios": 1, "resolutions": ("large", "small"),
    },
}

GPT_SIZES = {
    "1:1": {"1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880"},
    "5:4": {"1K": "1040x832", "2K": "2080x1664", "4K": "3200x2560"},
    "9:16": {"1K": "720x1280", "2K": "1152x2048", "4K": "2160x3840"},
    "16:9": {"1K": "1280x720", "2K": "2048x1152", "4K": "3840x2160"},
    "4:3": {"1K": "1024x768", "2K": "2048x1536", "4K": "3264x2448"},
    "3:2": {"1K": "1008x672", "2K": "2016x1344", "4K": "3504x2336"},
    "4:5": {"1K": "832x1040", "2K": "1664x2080", "4K": "2560x3200"},
    "3:4": {"1K": "768x1024", "2K": "1536x2048", "4K": "2448x3264"},
    "2:3": {"1K": "672x1008", "2K": "1344x2016", "4K": "2336x3504"},
    "21:9": {"1K": "1344x576", "2K": "2016x864", "4K": "3696x1584"},
}


def is_hfsy_profile(profile: str) -> bool:
    return profile in MODEL_SPECS


def build_generation_request(
    profile: str,
    prompt: str,
    ratio: str,
    resolution: str,
    references: list[tuple[str, str]],
    duration: str = "10",
) -> tuple[str, dict[str, Any]]:
    if profile not in MODEL_SPECS:
        raise ValueError("不支持的 HFSY 模型")
    spec = MODEL_SPECS[profile]
    model = spec["model"]
    images = [url for url, mime in references if mime.startswith("image/")]
    audios = [url for url, mime in references if mime.startswith("audio/")]
    videos = [url for url, mime in references if mime.startswith("video/")]

    if len(images) > spec["max_images"]:
        raise ValueError(f"{model} 最多支持 {spec['max_images']} 张参考图")
    if resolution not in spec["resolutions"]:
        if model == "gpt-image-2":
            raise ValueError("GPT Image 2 仅支持 1K")
        raise ValueError(f"{model} 不支持清晰度 {resolution}")

    if spec["family"] == "gpt":
        try:
            size = GPT_SIZES[ratio][resolution]
        except KeyError as exc:
            raise ValueError(f"{model} 不支持画幅 {ratio}") from exc
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "size": size,
            "reference_images": images,
            "n": 1,
            "response_format": "b64_json",
        }
        return "/v1/images/generations", payload

    if spec["family"] == "nano":
        parts: list[dict[str, Any]] = [{"text": prompt}]
        parts.extend({"fileData": {"mimeType": mime, "fileUri": url}} for url, mime in references if mime.startswith("image/"))
        return f"/v1beta/models/{model}:generateContent", {
            "contents": [{"parts": parts}],
            "generationConfig": {"imageConfig": {"imageSize": resolution, "aspectRatio": ratio}},
        }

    if videos:
        raise ValueError("Minimax H3 不支持视频参考")
    if len(audios) > spec["max_audios"]:
        raise ValueError("Minimax H3 最多支持 1 条音频")
    seconds = int(duration)
    if not 5 <= seconds <= 15:
        raise ValueError("Minimax H3 时长必须为 5–15 秒")
    if len(prompt) > 2000:
        raise ValueError("Minimax H3 提示词不能超过 2000 字")
    if ratio not in {"9:16", "16:9"}:
        raise ValueError("Minimax H3 仅支持 9:16 或 16:9")
    return "/v1/video/create", {
        "model": model,
        "orientation": "portrait" if ratio == "9:16" else "landscape",
        "prompt": prompt,
        "images": images,
        "audios": audios,
        "duration": seconds,
        "size": resolution,
        "watermark": False,
    }


def _first_nano_url(payload: dict[str, Any]) -> str:
    for candidate in payload.get("candidates") or []:
        for part in ((candidate.get("content") or {}).get("parts") or []):
            url = (part.get("fileData") or {}).get("fileUri")
            if url:
                return str(url)
    return ""


def parse_generation_response(payload: dict[str, Any]) -> dict[str, str]:
    data = payload.get("data") or []
    data_url = str(data[0].get("url") or "") if data and isinstance(data[0], dict) else ""
    result_url = str(
        payload.get("result_url") or payload.get("video_url") or payload.get("url") or data_url or _first_nano_url(payload)
    )
    task_id = str(payload.get("task_id") or payload.get("id") or "")
    status = str(payload.get("status") or ("SUCCESS" if result_url else "IN_PROGRESS" if task_id else "FAILURE")).upper()
    error = str(payload.get("fail_reason") or (payload.get("error") or {}).get("message") or payload.get("message") or "")
    return {"status": status, "task_id": task_id, "result_url": result_url, "error": error}


def request_json(
    endpoint: str,
    payload: dict[str, Any] | None,
    api_key: str,
    *,
    method: str = "POST",
    opener=urlopen,
) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = Request(
        f"{BASE_URL}{endpoint}", data=data, method=method,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with opener(request, timeout=180) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
            message = detail.get("message") or (detail.get("error") or {}).get("message") or raw
        except json.JSONDecodeError:
            message = raw
        raise RuntimeError(f"HFSY HTTP {exc.code}: {str(message)[:500]}") from exc
    except URLError as exc:
        raise RuntimeError(f"HFSY 网络请求失败：{exc.reason}") from exc
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"HFSY 未返回有效 JSON：{raw[:300]}") from exc
    if not isinstance(result, dict):
        raise RuntimeError("HFSY 返回结构不是 JSON 对象")
    return result


def _query_endpoint(profile: str, task_id: str) -> str:
    if MODEL_SPECS[profile]["kind"] == "video":
        return f"/v1/video/query?id={quote(task_id)}"
    return f"/v1/images/generations/{quote(task_id)}"


def generate(
    profile: str,
    prompt: str,
    ratio: str,
    resolution: str,
    references: list[dict[str, str]],
    duration: str,
    api_key: str,
    *,
    sleep=time.sleep,
) -> dict[str, str]:
    uploaded: list[tuple[str, str]] = []
    for reference in references:
        remote_url = str(reference.get("url") or "")
        path_value = str(reference.get("path") or "")
        mime = str(reference.get("mime") or mimetypes.guess_type(path_value or remote_url)[0] or "application/octet-stream")
        if remote_url:
            uploaded.append((remote_url, mime))
        else:
            raise ValueError("HFSY 参考素材必须是公网 URL，不支持直接上传本地文件")

    endpoint, payload = build_generation_request(profile, prompt, ratio, resolution, uploaded, duration)
    parsed = parse_generation_response(request_json(endpoint, payload, api_key))
    for _ in range(640):
        if parsed["status"] == "SUCCESS":
            if not parsed["result_url"]:
                raise RuntimeError("HFSY 任务成功但未返回结果 URL")
            return {"result_url": parsed["result_url"], "task_id": parsed["task_id"]}
        if parsed["status"] == "FAILURE":
            raise RuntimeError(parsed["error"] or "HFSY 生成失败")
        if not parsed["task_id"]:
            raise RuntimeError(parsed["error"] or "HFSY 未返回可轮询的任务 ID")
        sleep(3)
        parsed = parse_generation_response(
            request_json(_query_endpoint(profile, parsed["task_id"]), None, api_key, method="GET")
        )
    raise RuntimeError("HFSY 任务轮询超时")
