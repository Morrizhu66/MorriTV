#!/usr/bin/env python3
"""Call internal business-side model profiles without persisting secrets."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import pathlib
import shlex
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Iterable, List, Mapping, Optional


TOOLS_DIR = pathlib.Path(__file__).resolve().parent
PROJECT_DIR = TOOLS_DIR.parent
DEFAULT_PROFILES = TOOLS_DIR / "model_profiles.json"
PRIVATE_ENV_FILE = PROJECT_DIR / ".env"


class UserError(Exception):
    pass


def load_private_env_file(path: pathlib.Path = PRIVATE_ENV_FILE) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_profiles() -> Dict[str, Dict[str, Any]]:
    profiles = read_json_file(DEFAULT_PROFILES)
    override = os.environ.get("BUSINESS_MODEL_PROFILES")
    if override:
        profiles.update(read_json_file(pathlib.Path(override).expanduser()))
    return profiles


def read_json_file(path: pathlib.Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError as exc:
        raise UserError(f"profile file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise UserError(f"profile file is not valid JSON: {path}: {exc}") from exc


def parse_json_arg(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise UserError(f"invalid JSON argument: {exc}") from exc


def read_image_base64(path: pathlib.Path) -> str:
    try:
        data = path.read_bytes()
    except FileNotFoundError as exc:
        raise UserError(f"image file not found: {path}") from exc
    return base64.b64encode(data).decode("ascii")


def read_image_data_url(path: pathlib.Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    if mime not in {"image/jpeg", "image/png"}:
        suffix = path.suffix.lower()
        if suffix in {".jpg", ".jpeg"}:
            mime = "image/jpeg"
        elif suffix == ".png":
            mime = "image/png"
        else:
            raise UserError(f"unsupported image type for Ark reference image: {path}")
    return f"data:{mime};base64,{read_image_base64(path)}"


def read_media_data_url(path: pathlib.Path, expected_prefix: str) -> str:
    try:
        data = path.read_bytes()
    except FileNotFoundError as exc:
        raise UserError(f"media file not found: {path}") from exc
    mime, _ = mimetypes.guess_type(str(path))
    if not mime or not mime.startswith(f"{expected_prefix}/"):
        raise UserError(f"unsupported {expected_prefix} type: {path}")
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def print_json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True))


def resolve_profile(name: str) -> Dict[str, Any]:
    profiles = load_profiles()
    if name not in profiles:
        available = ", ".join(sorted(profiles))
        raise UserError(f"unknown profile {name!r}; available profiles: {available}")
    profile = dict(profiles[name])
    profile["profile"] = name
    return profile


def list_profiles() -> None:
    profiles = load_profiles()
    rows = {}
    for name, profile in sorted(profiles.items()):
        rows[name] = {
            "backend": profile.get("backend"),
            "message_tag": profile.get("message_tag"),
            "req_key": profile.get("req_key"),
            "model": profile.get("model"),
        }
    print_json(rows)


def run_profile(args: argparse.Namespace) -> None:
    profile = resolve_profile(args.profile)
    backend = profile.get("backend")
    if backend == "ark_openai_image":
        result = call_ark_image(profile, args)
    elif backend == "ark_content_generation":
        result = call_ark_content_generation(profile, args)
    elif backend == "faas_message_tag":
        result = call_faas_message_tag(profile, args)
    else:
        raise UserError(f"unsupported backend for profile {args.profile!r}: {backend!r}")
    print_json(result)


def call_ark_content_generation(profile: Mapping[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    endpoint = str(profile["endpoint"])
    api_key_env = str(profile.get("api_key_env") or "ARK_API_KEY")
    payload = build_ark_content_payload(profile, args)

    if args.dry_run:
        sanitized = sanitize_payload_for_output(payload)
        return {
            "backend": "ark_content_generation",
            "profile": profile.get("profile"),
            "endpoint": endpoint,
            "api_key_env": api_key_env,
            "request": sanitized,
            "curl_preview": build_authorized_curl(endpoint, api_key_env, sanitized),
        }

    api_key = os.environ.get(api_key_env)
    if not api_key:
        raise UserError(f"environment variable {api_key_env} is required")

    submitted = request_json(
        endpoint,
        method="POST",
        payload=payload,
        api_key=api_key,
        timeout=args.http_timeout or 300,
    )
    task_id = first_mapping_value(submitted, ("id", "task_id"))
    if not task_id:
        raise UserError(f"Ark task submission returned no task id: {submitted}")

    timeout_seconds = int(profile.get("timeout_seconds") or 1800)
    poll_interval = float(profile.get("poll_interval_seconds") or 10)
    deadline = time.monotonic() + timeout_seconds
    task_url = endpoint.rstrip("/") + "/" + str(task_id)
    final_response: Mapping[str, Any] = submitted
    while time.monotonic() < deadline:
        current = request_json(
            task_url,
            method="GET",
            api_key=api_key,
            timeout=args.http_timeout or 300,
        )
        final_response = current
        status = str(first_mapping_value(current, ("status", "state")) or "").lower()
        if status in {"succeeded", "success", "completed", "done"}:
            break
        if status in {"failed", "error", "cancelled", "canceled", "expired"}:
            raise UserError(f"Ark content task {task_id} ended with status {status}: {current}")
        time.sleep(poll_interval)
    else:
        raise UserError(f"Ark content task {task_id} timed out after {timeout_seconds} seconds")

    video_url = find_first_url(final_response, preferred_keys=("video_url", "url"))
    output_file = ""
    if args.output_file:
        if not video_url:
            raise UserError(f"Ark content task {task_id} succeeded but returned no video URL")
        output_path = pathlib.Path(args.output_file).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            urllib.request.urlretrieve(video_url, output_path)
        except urllib.error.URLError as exc:
            raise UserError(f"video download failed: {exc}") from exc
        output_file = str(output_path)

    return {
        "backend": "ark_content_generation",
        "profile": profile.get("profile"),
        "model": payload["model"],
        "task_id": task_id,
        "status": first_mapping_value(final_response, ("status", "state")),
        "video_url": video_url,
        "output_file": output_file,
        "response": sanitize_payload_for_output(final_response),
    }


def build_ark_content_payload(profile: Mapping[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    prompt = first_non_empty(args.prompt, profile.get("prompt"))
    if not prompt:
        raise UserError("--prompt is required for Ark content generation")

    content: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]
    for raw_path in args.image_file or []:
        path = pathlib.Path(raw_path).expanduser()
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": read_image_data_url(path)},
                "role": "reference_image",
            }
        )
    for raw_path in args.video_file or []:
        path = pathlib.Path(raw_path).expanduser()
        content.append(
            {
                "type": "video_url",
                "video_url": {"url": read_media_data_url(path, "video")},
                "role": "reference_video",
            }
        )
    for raw_path in args.audio_file or []:
        path = pathlib.Path(raw_path).expanduser()
        content.append(
            {
                "type": "audio_url",
                "audio_url": {"url": read_media_data_url(path, "audio")},
                "role": "reference_audio",
            }
        )

    payload: Dict[str, Any] = {
        "model": args.model or profile.get("model"),
        "content": content,
        "generate_audio": profile.get("generate_audio", True) if args.generate_audio is None else args.generate_audio,
        "ratio": args.ratio or profile.get("ratio") or "16:9",
        "duration": args.duration or profile.get("duration") or 5,
        "watermark": profile.get("watermark", False) if args.watermark is None else args.watermark,
    }
    resolution = args.resolution or profile.get("resolution")
    if resolution:
        payload["resolution"] = resolution
    payload.update(parse_json_arg(args.extra_body_json))
    return payload


def request_json(
    endpoint: str,
    *,
    method: str,
    api_key: str,
    payload: Optional[Mapping[str, Any]] = None,
    timeout: int = 300,
) -> Mapping[str, Any]:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise UserError(f"Ark HTTP {exc.code}: {raw}") from exc
    except urllib.error.URLError as exc:
        raise UserError(f"Ark request failed: {exc}") from exc
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise UserError(f"Ark returned non-JSON response: {raw[:500]}") from exc
    if not isinstance(parsed, Mapping):
        raise UserError(f"Ark returned unexpected JSON: {parsed}")
    return parsed


def first_mapping_value(data: Any, keys: Iterable[str]) -> Any:
    wanted = set(keys)
    if isinstance(data, Mapping):
        for key, value in data.items():
            if key in wanted and value not in (None, ""):
                return value
        for value in data.values():
            found = first_mapping_value(value, wanted)
            if found not in (None, ""):
                return found
    elif isinstance(data, list):
        for value in data:
            found = first_mapping_value(value, wanted)
            if found not in (None, ""):
                return found
    return None


def find_first_url(data: Any, preferred_keys: Iterable[str]) -> str:
    value = first_mapping_value(data, preferred_keys)
    if isinstance(value, str) and value.startswith(("http://", "https://")):
        return value
    return ""


def call_ark_image(profile: Mapping[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    prompt = first_non_empty(args.prompt, profile.get("prompt"))
    if not prompt:
        raise UserError("--prompt is required for Ark image generation")

    api_key_env = str(profile.get("api_key_env") or "ARK_API_KEY")
    request_kwargs: Dict[str, Any] = {
        "model": args.model or profile.get("model"),
        "prompt": prompt,
        "size": args.size or profile.get("size") or "2K",
        "response_format": profile.get("response_format") or "url",
    }
    extra_body = dict(profile.get("extra_body") or {})
    extra_body.update(parse_json_arg(args.extra_body_json))
    if args.image_file:
        extra_body["image"] = [read_image_data_url(pathlib.Path(p).expanduser()) for p in args.image_file]
    if extra_body:
        request_kwargs["extra_body"] = extra_body

    if args.dry_run:
        dry_request = sanitize_payload_for_output(request_kwargs)
        return {
            "backend": "ark_openai_image",
            "profile": profile.get("profile"),
            "base_url": profile["base_url"],
            "api_key_env": api_key_env,
            "request": dry_request,
        }

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise UserError('missing dependency: run `python3 -m pip install --upgrade "openai>=1.0"`') from exc

    api_key = os.environ.get(api_key_env)
    if not api_key:
        raise UserError(f"environment variable {api_key_env} is required")

    client = OpenAI(base_url=str(profile["base_url"]), api_key=api_key)
    response = client.images.generate(**request_kwargs)
    data = [item.model_dump(exclude_none=True) for item in response.data]
    return {
        "backend": "ark_openai_image",
        "profile": profile.get("profile"),
        "model": request_kwargs["model"],
        "size": request_kwargs["size"],
        "data": data,
        "image_url": data[0].get("url") if data else "",
    }


def call_faas_message_tag(profile: Mapping[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    endpoint_env = str(profile.get("endpoint_env") or "")
    endpoint = args.endpoint or os.environ.get(endpoint_env) or profile.get("endpoint")
    payload = build_faas_payload(profile, args)

    if args.dry_run:
        dry_endpoint = endpoint or (f"${endpoint_env}" if endpoint_env else "<faas-endpoint>")
        sanitized_payload = sanitize_payload_for_output(payload)
        return {
            "backend": "faas_message_tag",
            "profile": profile.get("profile"),
            "endpoint": dry_endpoint,
            "request": sanitized_payload,
            "curl_preview": build_curl(dry_endpoint, sanitized_payload),
        }

    if not endpoint:
        raise UserError("--endpoint or endpoint env is required for FaaS calls")

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        str(endpoint),
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    timeout = args.http_timeout or max(int(payload.get("timeout_seconds") or 60) + 30, 60)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            status = resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise UserError(f"FaaS HTTP {exc.code}: {raw}") from exc
    except urllib.error.URLError as exc:
        raise UserError(f"FaaS request failed: {exc}") from exc

    parsed: Any
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = raw
    return {
        "backend": "faas_message_tag",
        "profile": profile.get("profile"),
        "endpoint": endpoint,
        "http_status": status,
        "request": sanitize_payload_for_output(payload),
        "response": parsed,
    }


def build_faas_payload(profile: Mapping[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    payload.update(parse_json_arg(args.payload_json))
    payload.setdefault("message_tag", profile.get("message_tag"))

    prompt = first_non_empty(args.prompt, profile.get("prompt"))
    if prompt:
        payload.setdefault("prompt", prompt)

    size = args.size or profile.get("size")
    if size:
        payload.setdefault("size", size)

    for key in ("timeout_seconds", "poll_interval_seconds"):
        if profile.get(key) is not None:
            payload.setdefault(key, profile[key])

    if args.image_file:
        image_files = [pathlib.Path(p).expanduser() for p in args.image_file]
        encoded = [
            {
                "file_name": p.name,
                "image_base64": read_image_base64(p),
            }
            for p in image_files
        ]
        if len(encoded) == 1 and "files" not in payload and "image_base64" not in payload:
            payload["file_name"] = encoded[0]["file_name"]
            payload["image_base64"] = encoded[0]["image_base64"]
        else:
            payload.setdefault("files", encoded)

    if args.extra_payload_json:
        payload.update(parse_json_arg(args.extra_payload_json))

    if not payload.get("message_tag"):
        raise UserError("message_tag is required")
    return payload


def sanitize_payload_for_output(payload: Mapping[str, Any]) -> Dict[str, Any]:
    result = sanitize_data_urls(dict(payload))
    if "image_base64" in result:
        result["image_base64"] = f"<base64:{len(str(payload['image_base64']))} chars>"
    files = result.get("files")
    if isinstance(files, list):
        sanitized_files = []
        for item in files:
            if not isinstance(item, dict):
                sanitized_files.append(item)
                continue
            next_item = dict(item)
            if "image_base64" in next_item:
                next_item["image_base64"] = f"<base64:{len(str(item['image_base64']))} chars>"
            sanitized_files.append(next_item)
        result["files"] = sanitized_files
    extra_body = result.get("extra_body")
    if isinstance(extra_body, dict) and isinstance(extra_body.get("image"), list):
        next_extra = dict(extra_body)
        next_extra["image"] = [
            f"<data-url:{len(item)} chars>" if isinstance(item, str) and item.startswith("data:image/") else item
            for item in extra_body["image"]
        ]
        result["extra_body"] = next_extra
    return result


def sanitize_data_urls(value: Any) -> Any:
    if isinstance(value, str) and value.startswith("data:") and ";base64," in value:
        media_type = value[5:].split(";", 1)[0]
        return f"<data-url:{media_type}:{len(value)} chars>"
    if isinstance(value, list):
        return [sanitize_data_urls(item) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_data_urls(item) for key, item in value.items()}
    return value


def build_curl(endpoint: str, payload: Mapping[str, Any]) -> str:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return " ".join(
        [
            "curl",
            "-sS",
            "--max-time",
            "240",
            "-X",
            "POST",
            shlex.quote(endpoint),
            "-H",
            shlex.quote("Content-Type: application/json"),
            "--data",
            shlex.quote(body),
        ]
    )


def build_authorized_curl(endpoint: str, api_key_env: str, payload: Mapping[str, Any]) -> str:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return " ".join(
        [
            "curl",
            "-sS",
            "-X",
            "POST",
            shlex.quote(endpoint),
            "-H",
            shlex.quote("Content-Type: application/json"),
            "-H",
            shlex.quote(f"Authorization: Bearer ${api_key_env}"),
            "--data",
            shlex.quote(body),
        ]
    )


def first_non_empty(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Call internal business-side model profiles.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list-profiles", help="List configured model profiles.")

    run = subparsers.add_parser("run", help="Run a configured profile.")
    run.add_argument("--profile", required=True, help="Profile name from model_profiles.json.")
    add_common_run_args(run)

    ark = subparsers.add_parser("ark-image", help="Direct Ark OpenAI-compatible image generation.")
    ark.add_argument("--profile", default="seedream43-ark-direct")
    add_common_run_args(ark)

    faas = subparsers.add_parser("faas", help="Post to a FaaS message_tag endpoint.")
    faas.add_argument("--profile", default="seedream43-faas")
    add_common_run_args(faas)

    return parser


def add_common_run_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--prompt")
    parser.add_argument("--model")
    parser.add_argument("--size")
    parser.add_argument("--image-file", action="append", help="Image file to base64 encode for FaaS.")
    parser.add_argument("--video-file", action="append", help="Reference video file for Ark content generation.")
    parser.add_argument("--audio-file", action="append", help="Reference audio file for Ark content generation.")
    parser.add_argument("--ratio", help="Output aspect ratio for Ark content generation, such as 9:16.")
    parser.add_argument("--duration", type=int, help="Output duration in seconds for Ark content generation.")
    parser.add_argument("--resolution", help="Output resolution for Ark content generation, such as 1080p.")
    parser.add_argument("--generate-audio", dest="generate_audio", action="store_true", default=None)
    parser.add_argument("--no-generate-audio", dest="generate_audio", action="store_false")
    parser.add_argument("--watermark", dest="watermark", action="store_true", default=None)
    parser.add_argument("--no-watermark", dest="watermark", action="store_false")
    parser.add_argument("--output-file", help="Download a completed Ark video to this path.")
    parser.add_argument("--endpoint", help="FaaS endpoint URL.")
    parser.add_argument("--http-timeout", type=int, help="HTTP timeout seconds for FaaS.")
    parser.add_argument("--payload-json", help="Base JSON payload for FaaS.")
    parser.add_argument("--extra-payload-json", help="Extra JSON fields merged into FaaS payload.")
    parser.add_argument("--extra-body-json", help="Extra JSON merged into Ark extra_body.")
    parser.add_argument("--dry-run", action="store_true", help="Print the request/curl without calling the model.")


def main(argv: Optional[Iterable[str]] = None) -> int:
    load_private_env_file()
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        if args.command == "list-profiles":
            list_profiles()
        elif args.command in {"run", "ark-image", "faas"}:
            run_profile(args)
        else:
            raise UserError(f"unsupported command: {args.command}")
    except UserError as exc:
        print_json({"ok": False, "error": str(exc)})
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
