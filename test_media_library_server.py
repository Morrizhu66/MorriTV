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

    def test_multipart_generation_with_reference_images_in_default_and_collection(self):
        from unittest.mock import patch
        folder = server.MEDIA_LIBRARY.create_folder("参考图测试")
        for folder_id in ("", folder["id"]):
            with self.subTest(folder_id=folder_id):
                boundary = "studio-reference-regression"
                body = bytearray()
                for name, value in {"kind": "image", "profile": "seedream50-pro-ark-direct", "prompts": "short hair", "folder_id": folder_id}.items():
                    body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
                for filename, mime, content in (("ref.png", "image/png", b"png-reference"), ("ref.jpg", "image/jpeg", b"jpeg-reference")):
                    body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="references"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode())
                    body.extend(content + b"\r\n")
                body.extend(f'--{boundary}--\r\n'.encode())
                with patch.object(server.IMAGE_EXECUTOR, "submit") as submit:
                    status, payload = self.request_json("/api/tasks", method="POST", payload=bytes(body), content_type=f"multipart/form-data; boundary={boundary}")
                self.assertEqual(status, 202, payload)
                submit.assert_called_once()
                task = payload["tasks"][0]
                self.assertEqual(task["folder_id"], folder_id)
                self.assertEqual([ref["mime"] for ref in task["reference_files"]], ["image/png", "image/jpeg"])
                for reference, expected in zip(task["reference_files"], (b"png-reference", b"jpeg-reference")):
                    with urlopen(self.base_url + reference["url"]) as response:
                        self.assertEqual(response.read(), expected)

    def test_cloud_original_and_thumbnail_remain_usable_through_trash_restore(self):
        import io
        from PIL import Image
        from unittest.mock import patch
        from cloud_images import CloudImages
        source = self.root / 'cloud-original.png'
        Image.new('RGB', (1200, 800), '#598277').save(source)
        original = source.read_bytes()
        asset = server.MEDIA_LIBRARY.import_stream('original.png', 'image/png', io.BytesIO(original))
        path = server.RESULTS_DIR / asset['file_name']
        store = CloudImages(self.root / 'cloud.json')
        with patch.object(server, 'CLOUD_IMAGES', store), patch.object(server, 'private_env_value', return_value='configured'), patch('tos_uploader.upload_original', return_value={'tos_key': 'studio-originals/test', 'bucket': 'private'}), patch.object(store, 'url', return_value=source.as_uri()):
            store.persist(path, server.private_env_value)
            with urlopen(self.base_url + asset['url']) as response:
                self.assertEqual(response.read(), original)
            with urlopen(self.base_url + asset['url'] + '?thumbnail=1') as response:
                self.assertEqual(response.headers.get_content_type(), 'image/webp')
                with Image.open(io.BytesIO(response.read())) as preview:
                    self.assertLessEqual(max(preview.size), 480)
            status, _ = self.request_json('/api/library/assets/' + asset['id'], method='DELETE')
            self.assertEqual(status, 200)
            _, trash = self.request_json('/api/trash')
            entry = trash['items'][0]
            with urlopen(self.base_url + entry['url']) as response:
                self.assertEqual(response.read(), original)
            status, _ = self.request_json('/api/trash/' + entry['id'] + '/restore', method='POST')
            self.assertEqual(status, 200)
            restored = server.MEDIA_LIBRARY.snapshot()['assets'][0]
            with urlopen(self.base_url + restored['url']) as response:
                self.assertEqual(response.read(), original)

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

    def test_asset_collection_metadata_endpoint_preserves_media_and_validates_input(self):
        asset = server.MEDIA_LIBRARY.import_stream("hero.png", "image/png", __import__("io").BytesIO(b"original"))
        path = "/api/library/assets/" + asset["id"] + "/metadata"
        status, data = self.request_json(path, "POST", {"category": "character", "included": True})
        self.assertEqual(status, 200)
        self.assertEqual(data["asset"]["categories"], ["character"])
        self.assertEqual(data["asset"]["url"], asset["url"])
        status, _ = self.request_json(path, "POST", {"url": "/private-file"})
        self.assertEqual(status, 400)
        status, data = self.request_json(path, "POST", {"category": "character", "included": False})
        self.assertEqual(status, 200)
        self.assertEqual(data["asset"]["categories"], [])
        with urlopen(self.base_url + asset["url"]) as response:
            self.assertEqual(response.read(), b"original")

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

    def test_media_range_request_returns_only_the_requested_bytes(self):
        media = server.RESULTS_DIR / "seekable.mp4"
        media.write_bytes(b"0123456789")

        response = urlopen(Request(
            self.base_url + "/media/results/seekable.mp4",
            headers={"Range": "bytes=3-6"},
        ), timeout=4)

        self.assertEqual(response.status, 206)
        self.assertEqual(response.headers["Accept-Ranges"], "bytes")
        self.assertEqual(response.headers["Content-Range"], "bytes 3-6/10")
        self.assertEqual(response.headers["Content-Length"], "4")
        self.assertEqual(response.read(), b"3456")

    def test_media_unsatisfied_range_returns_416_with_total_size(self):
        media = server.RESULTS_DIR / "seekable.mp4"
        media.write_bytes(b"0123456789")

        with self.assertRaises(HTTPError) as raised:
            urlopen(Request(
                self.base_url + "/media/results/seekable.mp4",
                headers={"Range": "bytes=20-30"},
            ), timeout=4)

        self.assertEqual(raised.exception.code, 416)
        self.assertEqual(raised.exception.headers["Content-Range"], "bytes */10")


    def test_cloud_video_range_survives_missing_local_cache(self):
        import io
        from unittest.mock import patch
        class Partial(io.BytesIO):
            status = 206
        record = {"tos_key": "video", "bucket": "private", "kind": "video", "mime": "video/mp4", "original_bytes": 10, "cache_original": True}
        with patch.object(server, "cloud_media_info", return_value=record), patch.object(server.CLOUD_IMAGES, "url", return_value="https://storage.invalid/video"), patch.object(server, "urlopen", return_value=Partial(b"2345")) as upstream:
            with urlopen(Request(self.base_url + "/media/results/absent.mp4", headers={"Range": "bytes=2-5"})) as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.headers["Content-Range"], "bytes 2-5/10")
                self.assertEqual(response.headers.get_content_type(), "video/mp4")
                self.assertEqual(response.read(), b"2345")
            self.assertEqual(upstream.call_args.args[0].get_header("Range"), "bytes=2-5")

    def test_invalid_cloud_range_does_not_fetch_upstream(self):
        from unittest.mock import patch
        record = {"tos_key": "video", "bucket": "private", "kind": "video", "mime": "video/mp4", "original_bytes": 10, "cache_original": True}
        with patch.object(server, "cloud_media_info", return_value=record), patch.object(server, "urlopen") as upstream:
            with self.assertRaises(HTTPError) as caught:
                urlopen(Request(self.base_url + "/media/results/absent.mp4", headers={"Range": "bytes=20-30"}))
            self.assertEqual(caught.exception.code, 416)
            self.assertEqual(caught.exception.headers["Content-Range"], "bytes */10")
            upstream.assert_not_called()


if __name__ == "__main__":
    unittest.main()
