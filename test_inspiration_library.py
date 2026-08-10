import tempfile
import unittest
from pathlib import Path

from inspiration_library import InspirationLibrary


class InspirationLibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.results = self.root / "results"; self.results.mkdir()
        self.uploads = self.root / "uploads"; self.uploads.mkdir()
        self.collections = self.root / "collections"; self.collections.mkdir()
        self.storage = self.root / "inspirations"
        self.manifest = self.root / "inspiration-library.json"
        self.library = InspirationLibrary(self.manifest, self.storage, self.results, self.uploads, self.collections)

    def tearDown(self):
        self.temp.cleanup()

    def test_video_prompt_and_ordered_references_persist_as_independent_copies(self):
        video = self.results / "task-video.mp4"; video.write_bytes(b"video")
        first = self.uploads / "first.png"; first.write_bytes(b"first")
        second = self.uploads / "second.png"; second.write_bytes(b"second")
        task = {
            "id": "task-video", "kind": "video", "status": "completed", "profile": "seedance-reference-video-ark-direct",
            "prompt": "镜头从人物左侧推进", "ratio": "16:9", "duration": "5", "resolution": "720p",
            "local_video_url": "/media/results/task-video.mp4", "folder_id": "",
            "reference_files": [
                {"name": "first.png", "path": str(first), "mime": "image/png"},
                {"name": "second.png", "path": str(second), "mime": "image/png"},
            ],
        }

        created = self.library.create_from_task(task)
        duplicate = self.library.create_from_task(task)
        reloaded = InspirationLibrary(self.manifest, self.storage, self.results, self.uploads, self.collections).snapshot()["items"][0]

        self.assertEqual(created["id"], duplicate["id"])
        self.assertEqual(reloaded["prompt"], task["prompt"])
        self.assertEqual([ref["name"] for ref in reloaded["references"]], ["first.png", "second.png"])
        self.assertEqual((self.storage / created["id"] / "video" / "task-video.mp4").read_bytes(), b"video")
        self.assertEqual((self.storage / created["id"] / "references" / "01-first.png").read_bytes(), b"first")
        self.assertEqual((self.storage / created["id"] / "references" / "02-second.png").read_bytes(), b"second")

    def test_delete_moves_inspiration_bundle_to_trash_without_touching_originals(self):
        video = self.results / "keep.mp4"; video.write_bytes(b"video")
        item = self.library.create_from_task({
            "id": "keep", "kind": "video", "status": "completed", "profile": "seedance-reference-video-ark-direct",
            "prompt": "keep", "ratio": "16:9", "duration": "5", "resolution": "720p",
            "local_video_url": "/media/results/keep.mp4", "folder_id": "", "reference_files": [],
        })
        trash = self.root / "trash" / "deleted-inspiration"

        deleted = self.library.delete(item["id"], trash)

        self.assertEqual(deleted["item"]["id"], item["id"])
        self.assertEqual(self.library.snapshot()["items"], [])
        self.assertTrue(video.is_file())
        self.assertEqual((trash / "bundle" / "video" / "keep.mp4").read_bytes(), b"video")


if __name__ == "__main__":
    unittest.main()
