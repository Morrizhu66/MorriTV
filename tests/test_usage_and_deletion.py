import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

import server
from media_library import MediaLibrary


def task(task_id, profile, created_at, status="completed"):
    return {
        "id": task_id,
        "kind": "video" if profile == "seedance-reference-video-ark-direct" else "image",
        "provider": "ark",
        "profile": profile,
        "prompt": "usage test",
        "status": status,
        "created_at": created_at,
        "started_at": created_at,
        "finished_at": created_at if status in {"completed", "failed"} else None,
        "reference_files": [],
        "ratio": "16:9",
        "duration": "5",
        "resolution": "720p",
        "image_url": "",
        "local_image_url": "",
        "video_url": "",
        "local_video_url": "",
        "error": "",
        "queue_position": None,
        "folder_id": "",
        "history_version": 3,
    }


class UsageAndDeletionTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.previous = {
            "history": server.HISTORY_FILE,
            "results": server.RESULTS_DIR,
            "uploads": server.UPLOADS_DIR,
            "collections": server.COLLECTIONS_DIR,
            "trash": server.TRASH_DIR,
            "library": server.MEDIA_LIBRARY,
        }
        server.HISTORY_FILE = self.root / "task-history.jsonl"
        server.RESULTS_DIR = self.root / "results"
        server.UPLOADS_DIR = self.root / "uploads"
        server.COLLECTIONS_DIR = self.root / "collections"
        server.TRASH_DIR = self.root / "trash"
        for directory in (server.RESULTS_DIR, server.UPLOADS_DIR, server.COLLECTIONS_DIR, server.TRASH_DIR):
            directory.mkdir()
        server.MEDIA_LIBRARY = MediaLibrary(self.root / "media-library.json", server.RESULTS_DIR, server.COLLECTIONS_DIR)
        server.TASKS.clear()

    def tearDown(self):
        server.TASKS.clear()
        server.HISTORY_FILE = self.previous["history"]
        server.RESULTS_DIR = self.previous["results"]
        server.UPLOADS_DIR = self.previous["uploads"]
        server.COLLECTIONS_DIR = self.previous["collections"]
        server.TRASH_DIR = self.previous["trash"]
        server.MEDIA_LIBRARY = self.previous["library"]
        self.temp_dir.cleanup()

    def append_event(self, event, item):
        with self.server_history().open("a", encoding="utf-8") as history:
            history.write(json.dumps({"event": event, "task_id": item["id"], "task": item}, ensure_ascii=False) + "\n")

    def server_history(self):
        return server.HISTORY_FILE

    def test_daily_usage_counts_unique_queued_tasks_in_local_day_with_non_blocking_targets(self):
        reference = datetime(2026, 8, 10, 12, 0, 0).timestamp()
        seedance = task("video-today", "seedance-reference-video-ark-direct", reference)
        seedream = task("image-today", "seedream50-pro-ark-direct", reference - 60)
        old = task("image-yesterday", "seedream50-pro-ark-direct", reference - 86400)
        for item in (seedance, seedream, old):
            self.append_event("queued", item)
        self.append_event("completed", seedream)

        usage = server.daily_usage(reference)

        self.assertEqual(usage["counts"]["seedance-reference-video-ark-direct"], 1)
        self.assertEqual(usage["counts"]["seedream50-pro-ark-direct"], 1)
        self.assertEqual(usage["targets"]["seedance-reference-video-ark-direct"], 20)
        self.assertEqual(usage["targets"]["seedream50-pro-ark-direct"], 30)
        self.assertEqual(usage["total"], 2)
        self.assertFalse(usage["enforced"])

    def test_deleted_task_stays_in_usage_but_does_not_restore(self):
        reference = datetime(2026, 8, 10, 13, 0, 0).timestamp()
        item = task("deleted-task", "seedream50-pro-ark-direct", reference)
        self.append_event("queued", item)
        self.append_event("deleted", item)

        usage = server.daily_usage(reference)
        server.load_task_history()

        self.assertEqual(usage["counts"]["seedream50-pro-ark-direct"], 1)
        self.assertNotIn("deleted-task", server.TASKS)

    def test_completed_task_moves_result_and_references_to_recoverable_trash(self):
        result = server.RESULTS_DIR / "delete-me.jpeg"
        result.write_bytes(b"image")
        reference = server.UPLOADS_DIR / "batch" / "01-look.png"
        reference.parent.mkdir()
        reference.write_bytes(b"reference")
        item = task("delete-me", "seedream50-pro-ark-direct", datetime.now().timestamp())
        item["local_image_url"] = "/media/results/delete-me.jpeg"
        item["reference_files"] = [{"name": "look.png", "path": str(reference), "mime": "image/png"}]
        server.TASKS[item["id"]] = item
        server.MEDIA_LIBRARY.register_generated(item)
        server.record_task_event("queued", item)
        server.record_task_event("completed", item)

        deleted = server.delete_task(item["id"])

        self.assertNotIn(item["id"], server.TASKS)
        self.assertFalse(result.exists())
        self.assertFalse(reference.exists())
        self.assertEqual(server.MEDIA_LIBRARY.snapshot()["assets"], [])
        trash_root = Path(deleted["trash_path"])
        self.assertEqual((trash_root / "results" / "delete-me.jpeg").read_bytes(), b"image")
        self.assertEqual((trash_root / "references" / "look.png").read_bytes(), b"reference")
        last = json.loads(server.HISTORY_FILE.read_text(encoding="utf-8").splitlines()[-1])
        self.assertEqual(last["event"], "deleted")
        server.load_task_history()
        self.assertNotIn(item["id"], server.TASKS)

    def test_running_task_cannot_be_deleted(self):
        item = task("running-task", "seedance-reference-video-ark-direct", datetime.now().timestamp(), "running")
        server.TASKS[item["id"]] = item

        with self.assertRaisesRegex(ValueError, "制作中"):
            server.delete_task(item["id"])

        self.assertIn(item["id"], server.TASKS)


if __name__ == "__main__":
    unittest.main()
