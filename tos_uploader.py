"""Temporary private TOS hosting for HFSY reference media."""

from __future__ import annotations

import datetime as dt
import io
import re
import uuid
from pathlib import Path
from typing import Any, Callable


REQUIRED_KEYS = (
    "TOS_ACCESS_KEY",
    "TOS_SECRET_KEY",
    "TOS_ENDPOINT",
    "TOS_REGION",
    "TOS_BUCKET",
)
SAFE_SUFFIX = re.compile(r"^\.[A-Za-z0-9]{1,10}$")
IMAGE_COMPRESSION_TRIGGER = 1_000_000
IMAGE_UPLOAD_LIMIT = 1_800_000
IMAGE_MAX_EDGE = 2048


def config_status(read_value: Callable[[str], str]) -> dict[str, Any]:
    missing = [name for name in REQUIRED_KEYS if not read_value(name)]
    return {"ready": not missing, "missing": missing}


def _config(read_value: Callable[[str], str]) -> dict[str, Any]:
    status = config_status(read_value)
    if not status["ready"]:
        raise RuntimeError(f"TOS 未完成配置：{', '.join(status['missing'])}")
    try:
        ttl = int(read_value("TOS_SIGNED_URL_TTL") or "3600")
    except ValueError as exc:
        raise RuntimeError("TOS_SIGNED_URL_TTL 必须是秒数") from exc
    return {
        "ak": read_value("TOS_ACCESS_KEY"),
        "sk": read_value("TOS_SECRET_KEY"),
        "endpoint": read_value("TOS_ENDPOINT"),
        "region": read_value("TOS_REGION"),
        "bucket": read_value("TOS_BUCKET"),
        "ttl": min(max(ttl, 300), 86400),
    }


def _tos_module(tos_module=None):
    if tos_module is not None:
        return tos_module
    try:
        import tos
    except ImportError as exc:
        raise RuntimeError("未安装 TOS Python SDK，请运行 python3 -m pip install -r requirements.txt") from exc
    return tos


def _client(config: dict[str, Any], tos_module):
    return tos_module.TosClientV2(config["ak"], config["sk"], config["endpoint"], config["region"])


def _prepared_content(source: Path, mime: str) -> tuple[bytes, str, str]:
    content = source.read_bytes()
    if not mime.startswith("image/") or len(content) < IMAGE_COMPRESSION_TRIGGER:
        return content, mime, source.suffix.lower()
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise RuntimeError("未安装 Pillow，无法压缩 HFSY 参考图") from exc

    with Image.open(io.BytesIO(content)) as opened:
        image = ImageOps.exif_transpose(opened)
        image.thumbnail((IMAGE_MAX_EDGE, IMAGE_MAX_EDGE), Image.Resampling.LANCZOS)
        if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
            rgba = image.convert("RGBA")
            background = Image.new("RGB", rgba.size, "white")
            background.paste(rgba, mask=rgba.getchannel("A"))
            image = background
        else:
            image = image.convert("RGB")

        prepared = b""
        for quality in (88, 82, 76, 70, 64):
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=quality, optimize=True)
            prepared = output.getvalue()
            if len(prepared) <= IMAGE_UPLOAD_LIMIT:
                break
        return prepared, "image/jpeg", ".jpg"


def upload_reference(
    reference: dict[str, str],
    read_value: Callable[[str], str],
    *,
    tos_module=None,
) -> dict[str, str]:
    config = _config(read_value)
    tos_module = _tos_module(tos_module)
    source = Path(reference.get("path") or "")
    if not source.is_file():
        raise RuntimeError(f"参考素材不存在：{reference.get('name') or source.name}")
    content, upload_mime, suffix = _prepared_content(
        source, str(reference.get("mime") or "application/octet-stream")
    )
    if not SAFE_SUFFIX.fullmatch(suffix):
        suffix = ""
    date_path = dt.datetime.now(dt.timezone.utc).strftime("%Y/%m/%d")
    object_key = f"hfsy-temp/{date_path}/{uuid.uuid4().hex}{suffix}"
    client = _client(config, tos_module)
    client.put_object(
        config["bucket"], object_key,
        content=content,
        content_type=upload_mime,
    )
    output = client.pre_signed_url(
        tos_module.HttpMethodType.Http_Method_Get,
        config["bucket"], object_key,
        expires=config["ttl"],
    )
    signed_url = str(getattr(output, "signed_url", "") or "")
    if not signed_url:
        raise RuntimeError("TOS 未返回预签名 URL")
    return {
        "name": str(reference.get("name") or source.name),
        "mime": upload_mime,
        "url": signed_url,
        "tos_key": object_key,
    }


def delete_hosted_references(
    references: list[dict[str, str]],
    read_value: Callable[[str], str],
    *,
    tos_module=None,
) -> None:
    keys = [str(reference.get("tos_key") or "") for reference in references if reference.get("tos_key")]
    if not keys:
        return
    config = _config(read_value)
    client = _client(config, _tos_module(tos_module))
    for key in keys:
        client.delete_object(config["bucket"], key)
