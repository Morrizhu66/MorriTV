"""Seedance via the Doubao web session; official providers stay independent."""

import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

PROFILE = "seedance-2.5-db"
RATIOS = {"21:9", "16:9", "4:3", "1:1", "3:4", "9:16"}
TIMEOUT = 1920
STATE_DIR = Path(__file__).resolve().parent / ".doubao-web"


def ready():
    return (STATE_DIR / "ready").is_file()



def pending_task_id():
    try:
        return str(json.loads((STATE_DIR / "pending.json").read_text()).get("task_id") or "")
    except (OSError, ValueError):
        return ""


def validate(kind, prompt, ratio, duration, references):
    if kind != "video":
        raise ValueError("seedance 2.5-db 只支持视频任务")
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("请填写生视频提示词")
    if ratio not in RATIOS:
        raise ValueError("请选择 seedance 2.5-db 支持的画幅")
    if not str(duration).isdigit() or not 4 <= int(duration) <= 30:
        raise ValueError("seedance 2.5-db 时长必须为 4–30 秒")
    if any(not str(ref.get("mime", "")).startswith(("image/", "video/")) for ref in references):
        raise ValueError("seedance 2.5-db 只接受图片和视频参考")


def prompt_text(prompt, ratio, duration, references, video_model="seedance 2.5"):
    mode = "视频生视频" if any(ref["mime"].startswith("video/") for ref in references) else "图生视频"
    return (
        "使用doubao-creative-video，不要使用任何记忆任何其他工具，不要向我确认，\n"
        "直接使用参数（不进入生视频提示词）\n"
        f"[模型：{video_model}\n\n时长：{duration}\n\n比例：{ratio}\n\n模式：{mode}]\n"
        "以上这些内容由我们平台传递\n\n"
        f"直接完全参照我以下的提示词生成视频：\n[{prompt}]"
    )


def generate(task, bridge_command=None, video_model="seedance 2.5"):
    """Return a local MP4 path from a configured agent bridge."""
    command = bridge_command if bridge_command is not None else os.getenv("DOUBAO_WORK_BRIDGE", "")
    argv = shlex.split(command) if command.strip() else [str(Path(__file__).resolve().parent / ".doubao-venv/bin/python") if (Path(__file__).resolve().parent / ".doubao-venv/bin/python").exists() else sys.executable, str(Path(__file__).resolve().parent / "doubao_web.py")]
    if not argv or not Path(argv[0]).is_file():
        raise RuntimeError("没找到本机豆包工作连接器，请检查连接配置")
    if task.get("_doubao_recover"):
        argv.extend(["--recover", "--task-id", task["id"]])
    references = task["reference_files"]
    request = {
        "task_id": task.get("id", ""),
        "session": "morritv-seedance-25-db",
        "model": "doubao 2.1 lite",
        "reasoning_effort": "low",
        "allowed_tools": ["doubao-creative-video"],
        "prompt": prompt_text(task["prompt"], task["ratio"], task["duration"], references, video_model),
        "references": [
            {"label": ("视频" if ref["mime"].startswith("video/") else "图片") + str(sum(
                prior["mime"].startswith("video/" if ref["mime"].startswith("video/") else "image/")
                for prior in references[:index + 1])), "path": ref["path"], "mime": ref["mime"]}
            for index, ref in enumerate(references)
        ],
    }
    try:
        completed = subprocess.run(argv, input=json.dumps(request, ensure_ascii=False), text=True,
                                   capture_output=True, timeout=TIMEOUT, check=False)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("生成超时，可重试") from exc
    try:
        result = json.loads(completed.stdout)
    except ValueError as exc:
        raise RuntimeError("豆包没有按要求直接生视频，请重试") from exc
    if not isinstance(result, dict):
        raise RuntimeError("豆包没有按要求直接生视频，请重试")
    if completed.returncode or result.get("status") != "completed":
        error = str(result.get("error") or "豆包没有按要求直接生视频，请重试")
        raise RuntimeError(error[:300])
    if result.get("tool") != "doubao-creative-video":
        raise RuntimeError("豆包没有按要求直接生视频，请重试")
    path = Path(str(result.get("video_file") or ""))
    if not path.is_file() or path.suffix.lower() != ".mp4":
        raise RuntimeError("豆包没有返回可播放的视频，请重试")
    with path.open("rb") as video:
        header = video.read(12)
        if len(header) < 12 or header[4:8] != b"ftyp":
            raise RuntimeError("豆包没有返回有效 MP4 视频，请重试")
    return path
