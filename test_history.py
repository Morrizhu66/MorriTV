import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
SERVER_PATH = APP_DIR / "server.py"


def load_server_module():
    spec = importlib.util.spec_from_file_location("model_studio_server_test", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def task_snapshot(task_id: str, status: str, **changes):
    task = {
        "id": task_id,
        "kind": "video",
        "profile": "seedance-reference-video-ark-direct",
        "prompt": "A complete multi-line prompt\nthat must survive restart.",
        "status": status,
        "created_at": 100.0,
        "started_at": 101.0 if status != "queued" else None,
        "finished_at": 102.0 if status in {"completed", "failed"} else None,
        "reference_files": [{"name": "look.png", "path": "/tmp/look.png", "mime": "image/png"}],
        "ratio": "9:16",
        "duration": "15",
        "resolution": "720p",
        "image_url": "",
        "local_image_url": "",
        "local_video_url": "/media/results/example.mp4",
        "folder_id": "collection-a",
        "error": "",
        "queue_position": None,
    }
    task.update(changes)
    return task


class TaskHistoryRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.server = load_server_module()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.history_path = Path(self.temp_dir.name) / "task-history.jsonl"
        self.server.HISTORY_FILE = self.history_path
        self.server.TASKS.clear()

    def tearDown(self):
        self.server.TASKS.clear()
        self.temp_dir.cleanup()

    def write_events(self, *events):
        self.history_path.write_text(
            "\n".join(json.dumps(event, ensure_ascii=False) for event in events) + "\n",
            encoding="utf-8",
        )

    def test_restores_latest_completed_snapshot_with_prompt_and_local_result(self):
        self.write_events(
            {"event": "queued", "task": task_snapshot("task-1", "queued")},
            {"event": "completed", "task": task_snapshot("task-1", "completed", finished_at=105.0)},
        )

        self.server.load_task_history()

        restored = self.server.TASKS["task-1"]
        self.assertEqual(restored["status"], "completed")
        self.assertEqual(restored["prompt"], "A complete multi-line prompt\nthat must survive restart.")
        self.assertEqual(restored["local_image_url"], "")
        self.assertEqual(restored["local_video_url"], "/media/results/example.mp4")
        self.assertEqual(restored["finished_at"], 105.0)
        self.assertEqual(restored["folder_id"], "collection-a")

    def test_marks_interrupted_task_as_failed_without_requeuing_it(self):
        self.write_events({"event": "started", "task": task_snapshot("task-2", "running")})

        self.server.load_task_history()

        restored = self.server.TASKS["task-2"]
        self.assertEqual(restored["status"], "failed")
        self.assertIn("服务重启", restored["error"])
        self.assertIsNone(restored["queue_position"])

    def test_records_a_full_task_snapshot_for_future_recovery(self):
        self.server.record_task_event("completed", task_snapshot("task-3", "completed"))

        event = json.loads(self.history_path.read_text(encoding="utf-8"))
        self.assertEqual(event["event"], "completed")
        self.assertEqual(event["task"]["prompt"], "A complete multi-line prompt\nthat must survive restart.")
        self.assertIn("local_image_url", event["task"])
        self.assertEqual(event["task"]["local_video_url"], "/media/results/example.mp4")
        self.assertEqual(event["task"]["folder_id"], "collection-a")

    def test_public_task_exposes_a_retryable_reference_url_without_disk_path(self):
        task = task_snapshot("task-4", "completed")
        task["reference_files"] = [{
            "name": "look.png",
            "path": str(self.server.UPLOADS_DIR / "batch-1" / "01-look.png"),
            "mime": "image/png",
        }]

        reference = self.server.public_task(task)["reference_files"][0]

        self.assertEqual(reference["url"], "/media/uploads/batch-1/01-look.png")
        self.assertNotIn("path", reference)

    def test_legacy_history_defaults_to_version_one_and_new_snapshots_use_two(self):
        legacy = self.server.restore_history_task(task_snapshot("legacy", "failed"))
        current = task_snapshot("current", "failed", history_version=2)

        self.assertEqual(legacy["history_version"], 1)
        self.assertEqual(self.server.history_task_snapshot(current)["history_version"], 2)


if __name__ == "__main__":
    unittest.main()
