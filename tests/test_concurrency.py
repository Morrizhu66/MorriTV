import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class Fields(dict):
    def getfirst(self, key, default=""):
        return self.get(key, default)


class SeparateMediaConcurrencyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_history = server.HISTORY_FILE
        self.original_uploads = server.UPLOADS_DIR
        server.HISTORY_FILE = Path(self.temp_dir.name) / "history.jsonl"
        server.UPLOADS_DIR = Path(self.temp_dir.name) / "uploads"
        server.TASKS.clear()

    def tearDown(self):
        server.TASKS.clear()
        server.HISTORY_FILE = self.original_history
        server.UPLOADS_DIR = self.original_uploads
        self.temp_dir.cleanup()

    def test_image_and_video_have_independent_worker_limits(self):
        self.assertEqual(server.IMAGE_MAX_WORKERS, 8)
        self.assertEqual(server.VIDEO_MAX_WORKERS, 4)
        self.assertEqual(server.IMAGE_EXECUTOR._max_workers, 8)
        self.assertEqual(server.VIDEO_EXECUTOR._max_workers, 4)
        self.assertIsNot(server.IMAGE_EXECUTOR, server.VIDEO_EXECUTOR)
        self.assertEqual(server.health_flags()["workers"], {"image": 8, "video": 4})

    def test_tasks_submit_to_their_own_executor_and_queue(self):
        with patch.object(server.IMAGE_EXECUTOR, "submit") as image_submit:
            with patch.object(server.VIDEO_EXECUTOR, "submit") as video_submit:
                image = server.create_tasks(Fields({
                    "kind": "image", "profile": "seedream50-pro-ark-direct", "prompts": "image one",
                }))[0]
                video = server.create_tasks(Fields({
                    "kind": "video", "profile": "seedance-reference-video-ark-direct", "prompts": "video one",
                    "ratio": "16:9", "duration": "5", "resolution": "720p",
                }))[0]
                second_image = server.create_tasks(Fields({
                    "kind": "image", "profile": "seedream50-pro-ark-direct", "prompts": "image two",
                }))[0]

        self.assertEqual(image_submit.call_count, 2)
        self.assertEqual(video_submit.call_count, 1)
        self.assertEqual(image["queue_position"], 1)
        self.assertEqual(video["queue_position"], 1)
        self.assertEqual(second_image["queue_position"], 2)

    def test_frontend_displays_the_selected_media_worker_limit(self):
        js = (Path(__file__).resolve().parents[1] / "app.js").read_text(encoding="utf-8")
        self.assertIn("data.workers[state.kind]", js)


if __name__ == "__main__":
    unittest.main()
