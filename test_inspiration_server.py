import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen

import server
from inspiration_library import InspirationLibrary


class InspirationServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.previous = {name: getattr(server, name) for name in (
            "RESULTS_DIR", "UPLOADS_DIR", "COLLECTIONS_DIR", "TRASH_DIR", "INSPIRATIONS_DIR", "INSPIRATION_FILE", "INSPIRATION_LIBRARY"
        )}
        server.RESULTS_DIR = self.root / "results"; server.RESULTS_DIR.mkdir()
        server.UPLOADS_DIR = self.root / "uploads"; server.UPLOADS_DIR.mkdir()
        server.COLLECTIONS_DIR = self.root / "collections"; server.COLLECTIONS_DIR.mkdir()
        server.TRASH_DIR = self.root / "trash"; server.TRASH_DIR.mkdir()
        server.INSPIRATIONS_DIR = self.root / "inspirations"; server.INSPIRATIONS_DIR.mkdir()
        server.INSPIRATION_FILE = self.root / "inspiration-library.json"
        server.INSPIRATION_LIBRARY = InspirationLibrary(server.INSPIRATION_FILE, server.INSPIRATIONS_DIR, server.RESULTS_DIR, server.UPLOADS_DIR, server.COLLECTIONS_DIR)
        server.TASKS.clear()
        video = server.RESULTS_DIR / "video-task.mp4"; video.write_bytes(b"video")
        server.TASKS["video-task"] = {
            "id": "video-task", "kind": "video", "status": "completed", "profile": "seedance-reference-video-ark-direct",
            "prompt": "prompt", "ratio": "16:9", "duration": "5", "resolution": "720p", "local_video_url": "/media/results/video-task.mp4",
            "folder_id": "", "reference_files": [], "provider": "ark", "created_at": 1, "started_at": 1, "finished_at": 2,
            "image_url": "", "local_image_url": "", "video_url": "", "error": "", "queue_position": None, "history_version": 3,
        }
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.StudioHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True); self.thread.start()
        self.base = f"http://127.0.0.1:{self.httpd.server_port}"

    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close(); self.thread.join(timeout=2)
        for name, value in self.previous.items(): setattr(server, name, value)
        server.TASKS.clear(); self.temp.cleanup()

    def request(self, path, method="GET", payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        response = urlopen(Request(self.base + path, data=data, headers=headers, method=method), timeout=4)
        return response.status, json.loads(response.read())

    def test_create_list_serve_and_delete_inspiration(self):
        create_status, created = self.request("/api/inspirations", "POST", {"task_id": "video-task"})
        list_status, listed = self.request("/api/inspirations")
        media = urlopen(self.base + created["item"]["video_url"], timeout=4).read()
        delete_status, _ = self.request(f"/api/inspirations/{created['item']['id']}", "DELETE")

        self.assertEqual((create_status, list_status, delete_status), (201, 200, 200))
        self.assertEqual(listed["items"][0]["task_id"], "video-task")
        self.assertEqual(media, b"video")
        self.assertEqual(server.INSPIRATION_LIBRARY.snapshot()["items"], [])


if __name__ == "__main__": unittest.main()
