"""Atomic, revision-checked local project/board documents."""
import json
import math
import threading
from pathlib import Path


class BoardConflict(ValueError):
    pass


class BoardStore:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.RLock()

    def load(self):
        with self.lock:
            if not self.path.exists():
                return {"revision": 0, "projects": []}
            return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, document):
        projects = document.get("projects")
        if not isinstance(projects, list) or len(projects) > 100:
            raise ValueError("项目格式或数量无效")
        ids = set()
        project_ids = set()
        for project in projects:
            if not isinstance(project, dict) or not isinstance(project.get("name"), str):
                raise ValueError("项目名称无效")
            project_id = project.get("id")
            if not isinstance(project_id, str) or not project_id or project_id in project_ids:
                raise ValueError("项目 ID 为空或重复")
            project_ids.add(project_id)
            boards = project.get("boards")
            if not isinstance(boards, list) or not boards:
                raise ValueError("项目至少需要一个画板")
            for board in boards:
                if not isinstance(board, dict) or not isinstance(board.get("id"), str) or not board["id"] or board["id"] in ids:
                    raise ValueError("画板 ID 为空或重复")
                ids.add(board["id"])
                board.setdefault("name", "未命名画板")
                board.setdefault("view", {"x": 80, "y": 110, "z": 1})
                board.setdefault("shots", [])
                if not isinstance(board.get("shots", []), list) or any(not isinstance(shot, dict) or not isinstance(shot.get("id"), str) for shot in board.get("shots", [])):
                    raise ValueError("镜头列表无效")
                view = board.get("view", {"x": 80, "y": 110, "z": 1})
                if not isinstance(view, dict) or any(not isinstance(view.get(key), (int, float)) or not math.isfinite(view[key]) for key in ("x", "y", "z")) or not .15 <= view["z"] <= 2:
                    raise ValueError("画板视图无效")
                nodes = board.get("nodes")
                if not isinstance(nodes, list) or len(nodes) > 2000:
                    raise ValueError("每个画板最多保存 2000 个节点")
                node_ids = set()
                for node in nodes:
                    if not isinstance(node, dict) or not isinstance(node.get("id"), str) or not node["id"] or node["id"] in node_ids:
                        raise ValueError("节点 ID 为空或重复")
                    node_ids.add(node["id"])
                    node.setdefault("name", "未命名节点")
                    node.setdefault("prompt", "")
                    if not isinstance(node["name"], str) or not isinstance(node["prompt"], str):
                        raise ValueError("节点名称或提示词无效")
                    node.setdefault("refs", [])
                    node.setdefault("versions", [])
                    for key in ("refs", "versions", "runs"):
                        if not isinstance(node.get(key, []), list) or any(not isinstance(item, dict) for item in node.get(key, [])):
                            raise ValueError("节点引用或版本格式无效")
                    if node.get("type") not in {"image", "video", "text", "group"}:
                        raise ValueError("节点类型无效")
                    for key in ("x", "y"):
                        value = node.get(key)
                        if not isinstance(value, (float, int)) or not math.isfinite(value) or abs(value) > 1000000:
                            raise ValueError("节点坐标无效")
        serialized = json.dumps({"revision": 0, "projects": projects}, ensure_ascii=False, allow_nan=False)
        if len(serialized.encode()) > 8 * 1024 * 1024:
            raise ValueError("画板数据超过 8 MiB，请拆分项目")
        with self.lock:
            current = self.load()
            if document.get("revision") != current["revision"]:
                raise BoardConflict("画板已被另一个窗口修改。请先导出当前画板备份，再刷新读取最新版本。")
            saved = {"revision": current["revision"] + 1, "projects": projects}
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(saved, ensure_ascii=False), encoding="utf-8")
            temporary.replace(self.path)
            return saved
