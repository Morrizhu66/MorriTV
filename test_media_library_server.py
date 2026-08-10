import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server
from media_library import MediaLibrary


class MediaLibraryServerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.previous_results = server.RESULTS_DIR
        self.previous_uploads = server.UPLOADS_DIR
        self.previous_collections = server.COLLECTIONS_DIR
        self.previous_trash = server.TRASH_DIR
        self.previous_history = server.HISTORY_FILE
        self.previous_library = getattr(server, "MEDIA_LIBRARY", None)
        server.RESULTS_DIR = self.root / "results"
        server.UPLOADS_DIR = self.root / "uploads"
        server.COLLECTIONS_DIR = self.root / "collections"
        server.TRASH_DIR = self.root / "trash"
        server.HISTORY_FILE = self.root / "task-history.jsonl"
        server.RESULTS_DIR.mkdir()
        server.UPLOADS_DIR.mkdir()
        server.COLLECTIONS_DIR.mkdir()
        server.TRASH_DIR.mkdir()
        server.TASKS.clear()
        server.MEDIA_LIBRARY = MediaLibrary(self.root / "media-library.json", server.RESULTS_DIR, server.COLLECTIONS_DIR)
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.StudioHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.httpd.server_port}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        server.RESULTS_DIR = self.previous_results
        server.UPLOADS_DIR = self.previous_uploads
        server.COLLECTIONS_DIR = self.previous_collections
        server.TRASH_DIR = self.previous_trash
        server.HISTORY_FILE = self.previous_history
        server.TASKS.clear()
        if self.previous_library is None:
            delattr(server, "MEDIA_LIBRARY")
        else:
            server.MEDIA_LIBRARY = self.previous_library
        self.temp_dir.cleanup()

    def request_json(self, path, method="GET", payload=None, content_type="application/json"):
        body = None
        headers = {}
        if payload is not None:
            body = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = content_type
        request = Request(self.base_url + path, data=body, headers=headers, method=method)
        try:
            response = urlopen(request, timeout=4)
        except HTTPError as exc:
            response = exc
        return response.status, json.loads(response.read().decode("utf-8"))

    def test_library_snapshot_exposes_persistent_folders_and_assets(self):
        health_status, health = self.request_json("/api/health")
        library_status, library = self.request_json("/api/library")

        self.assertEqual((health_status, library_status), (200, 200))
        self.assertTrue(health["ok"])
        self.assertEqual(library["folders"], [])
        self.assertEqual(library["assets"], [])

    def test_folder_import_and_move_routes_persist_real_media(self):
        status, created = self.request_json("/api/library/folders", "POST", {"name": "待剪辑"})
        self.assertEqual(status, 201)
        folder_id = created["folder"]["id"]

        boundary = "----model-studio-test"
        body = (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"folder_id\"\r\n\r\n{folder_id}\r\n"
            f"--{boundary}\r\n"
            "Content-Disposition: form-data; name=\"media\"; filename=\"frame.png\"\r\n"
            "Content-Type: image/png\r\n\r\n"
        ).encode("utf-8") + b"\x89PNG\r\n\x1a\nasset" + f"\r\n--{boundary}--\r\n".encode("utf-8")
        status, imported = self.request_json(
            "/api/library/assets", "POST", body, f"multipart/form-data; boundary={boundary}"
        )

        self.assertEqual(status, 201)
        asset = imported["asset"]
        self.assertEqual(asset["folder_id"], folder_id)
        collection_file = server.COLLECTIONS_DIR / folder_id / "results" / asset["file_name"]
        self.assertTrue(collection_file.is_file())

        status, moved = self.request_json(
            f"/api/library/assets/{asset['id']}/move", "POST", {"folder_id": ""}
        )
        self.assertEqual(status, 200)
        self.assertEqual(moved["asset"]["folder_id"], "")
        self.assertFalse(collection_file.exists())
        self.assertTrue((server.RESULTS_DIR / moved["asset"]["file_name"]).is_file())

    def test_completed_task_registration_returns_an_idempotent_library_asset(self):
        (server.RESULTS_DIR / "image123.jpeg").write_bytes(b"image")
        task = {
            "id": "image123", "kind": "image", "prompt": "人物定妆照",
            "local_image_url": "/media/results/image123.jpeg", "local_video_url": "",
        }

        first = server.register_completed_task(task)
        second = server.register_completed_task(task)

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(len(server.MEDIA_LIBRARY.snapshot()["assets"]), 1)

    def test_bad_library_input_returns_readable_json_error(self):
        status, payload = self.request_json("/api/library/folders", "POST", {"name": "  "})

        self.assertEqual(status, 400)
        self.assertFalse(payload["ok"])
        self.assertIn("不能为空", payload["error"])

    def test_delete_collection_route_preserves_assets_in_default_results(self):
        _, created = self.request_json("/api/library/folders", "POST", {"name": "临时收藏夹"})
        folder_id = created["folder"]["id"]
        asset = server.MEDIA_LIBRARY.import_stream("clip.mp4", "video/mp4", __import__("io").BytesIO(b"video"), folder_id)

        status, payload = self.request_json(f"/api/library/folders/{folder_id}", "DELETE")

        self.assertEqual(status, 200)
        self.assertEqual(payload["deleted_folder"]["id"], folder_id)
        restored = server.MEDIA_LIBRARY.snapshot()["assets"][0]
        self.assertEqual(restored["folder_id"], "")
        self.assertTrue((server.RESULTS_DIR / asset["file_name"]).is_file())

    def test_usage_and_imported_asset_delete_routes(self):
        queued = {
            "id": "usage-1", "kind": "video", "profile": "seedance-reference-video-ark-direct",
            "prompt": "x", "status": "completed", "created_at": __import__("time").time(),
            "reference_files": [], "folder_id": "",
        }
        server.HISTORY_FILE.write_text(json.dumps({"event": "queued", "task_id": "usage-1", "task": queued}) + "\n", encoding="utf-8")
        usage_status, usage = self.request_json("/api/usage")
        asset = server.MEDIA_LIBRARY.import_stream("unused.png", "image/png", __import__("io").BytesIO(b"image"))

        delete_status, deleted = self.request_json(f"/api/library/assets/{asset['id']}", "DELETE")

        self.assertEqual(usage_status, 200)
        self.assertEqual(usage["counts"]["seedance-reference-video-ark-direct"], 1)
        self.assertEqual(delete_status, 200)
        self.assertEqual(deleted["deleted_asset"]["id"], asset["id"])
        self.assertTrue(any(path.is_file() for path in server.TRASH_DIR.rglob("unused.png")))


if __name__ == "__main__":
    unittest.main()
