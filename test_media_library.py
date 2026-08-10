import io
import json
import tempfile
import unittest
from pathlib import Path

from media_library import MediaLibrary


class MediaLibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.results = self.root / "results"
        self.collections = self.root / "collections"
        self.manifest = self.root / "media-library.json"
        self.library = MediaLibrary(self.manifest, self.results, self.collections)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_folder_and_imported_image_survive_reload(self):
        folder = self.library.create_folder("动作参考")
        asset = self.library.import_stream(
            "pose.png", "image/png", io.BytesIO(b"\x89PNG\r\n\x1a\nasset"), folder["id"]
        )

        restored = MediaLibrary(self.manifest, self.results).snapshot()

        self.assertEqual(restored["folders"], [folder])
        self.assertEqual(restored["assets"][0]["id"], asset["id"])
        self.assertEqual(restored["assets"][0]["folder_id"], folder["id"])
        stored = self.collections / folder["id"] / "results" / asset["file_name"]
        self.assertEqual(stored.read_bytes(), b"\x89PNG\r\n\x1a\nasset")
        self.assertEqual(asset["url"], f"/media/collections/{folder['id']}/results/{asset['file_name']}")
        self.assertTrue((self.collections / folder["id"] / "uploads").is_dir())

    def test_import_accepts_image_and_video_but_rejects_other_media(self):
        image = self.library.import_stream("look.webp", "image/webp", io.BytesIO(b"image"))
        video = self.library.import_stream("shot.mp4", "video/mp4", io.BytesIO(b"video"))

        self.assertEqual((image["kind"], video["kind"]), ("image", "video"))
        with self.assertRaisesRegex(ValueError, "图片或视频"):
            self.library.import_stream("notes.txt", "text/plain", io.BytesIO(b"text"))

    def test_move_asset_validates_folder_and_persists_assignment(self):
        first = self.library.create_folder("待处理")
        second = self.library.create_folder("已选")
        asset = self.library.import_stream("clip.mp4", "video/mp4", io.BytesIO(b"video"), first["id"])

        moved = self.library.move_asset(asset["id"], second["id"])

        self.assertEqual(moved["folder_id"], second["id"])
        self.assertTrue((self.collections / second["id"] / "results" / moved["file_name"]).is_file())
        self.assertFalse((self.collections / first["id"] / "results" / moved["file_name"]).exists())
        self.assertEqual(MediaLibrary(self.manifest, self.results, self.collections).snapshot()["assets"][0]["folder_id"], second["id"])
        with self.assertRaisesRegex(ValueError, "文件夹不存在"):
            self.library.move_asset(asset["id"], "missing")

    def test_generated_image_and_video_are_registered_once(self):
        (self.results / "image-task.jpeg").parent.mkdir(parents=True, exist_ok=True)
        (self.results / "image-task.jpeg").write_bytes(b"image")
        (self.results / "video-task.mp4").write_bytes(b"video")
        image_task = {
            "id": "image-task", "kind": "image", "prompt": "角色设定图",
            "local_image_url": "/media/results/image-task.jpeg", "local_video_url": "",
        }
        video_task = {
            "id": "video-task", "kind": "video", "prompt": "打斗镜头",
            "local_image_url": "", "local_video_url": "/media/results/video-task.mp4",
        }

        image = self.library.register_generated(image_task)
        video = self.library.register_generated(video_task)
        duplicate = self.library.register_generated(image_task)

        self.assertEqual(image["kind"], "image")
        self.assertEqual(video["kind"], "video")
        self.assertEqual(duplicate["id"], image["id"])
        self.assertEqual(len(self.library.snapshot()["assets"]), 2)

    def test_generated_result_registers_inside_its_collection_workspace(self):
        folder = self.library.create_folder("角色镜头")
        target = self.collections / folder["id"] / "results" / "shot.mp4"
        target.write_bytes(b"video")
        task = {
            "id": "shot-task", "kind": "video", "prompt": "角色转身",
            "folder_id": folder["id"], "local_image_url": "",
            "local_video_url": f"/media/collections/{folder['id']}/results/shot.mp4",
        }

        asset = self.library.register_generated(task)

        self.assertEqual(asset["folder_id"], folder["id"])
        self.assertEqual(asset["url"], task["local_video_url"])

    def test_delete_folder_moves_assets_back_to_default_results(self):
        folder = self.library.create_folder("临时挑选")
        asset = self.library.import_stream("frame.png", "image/png", io.BytesIO(b"image"), folder["id"])

        deleted = self.library.delete_folder(folder["id"])

        restored = self.library.snapshot()["assets"][0]
        self.assertEqual(deleted["folder"]["id"], folder["id"])
        self.assertEqual(restored["folder_id"], "")
        self.assertEqual(restored["url"], f"/media/results/{asset['file_name']}")
        self.assertEqual((self.results / asset["file_name"]).read_bytes(), b"image")
        self.assertFalse((self.collections / folder["id"]).exists())

    def test_imported_asset_moves_to_recoverable_trash(self):
        asset = self.library.import_stream("unused.png", "image/png", io.BytesIO(b"image"))
        trash_root = self.root / "trash" / "asset-delete"

        deleted = self.library.trash_asset(asset["id"], trash_root)

        self.assertEqual(deleted["asset"]["id"], asset["id"])
        self.assertEqual(self.library.snapshot()["assets"], [])
        self.assertFalse((self.results / asset["file_name"]).exists())
        self.assertEqual((trash_root / "results" / "unused.png").read_bytes(), b"image")

    def test_manifest_write_is_valid_json_and_does_not_leave_temporary_file(self):
        self.library.create_folder("成片")

        payload = json.loads(self.manifest.read_text(encoding="utf-8"))

        self.assertEqual(payload["version"], 1)
        self.assertFalse(self.manifest.with_suffix(".json.tmp").exists())



if __name__ == "__main__":
    unittest.main()
