import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class Fields(dict):
    def getfirst(self, key, default=""):
        return self.get(key, default)


class HfsyServerIntegrationTests(unittest.TestCase):
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

    def test_accepts_hfsy_image_and_video_profiles_as_independent_provider_tasks(self):
        with patch.object(server.EXECUTOR, "submit") as submit:
            image = server.create_tasks(Fields({
                "kind": "image", "profile": "hfsy-gpt-image-2", "prompts": "poster",
                "ratio": "1:1", "resolution": "1K",
            }))[0]
            video = server.create_tasks(Fields({
                "kind": "video", "profile": "hfsy-minimax-h3", "prompts": "trailer",
                "ratio": "9:16", "resolution": "large", "duration": "10",
            }))[0]

        self.assertEqual(image["provider"], "hfsy")
        self.assertEqual(video["provider"], "hfsy")
        self.assertEqual(submit.call_count, 2)

    def test_rejects_kind_mismatch_and_minimax_video_reference_before_queueing(self):
        with self.assertRaisesRegex(ValueError, "图片模型"):
            server.validate_task_input("video", "hfsy-gpt-image-2", "x", "1:1", "10", "1K", [])

        references = [{"path": "", "url": "https://cdn.example/ref.mp4", "mime": "video/mp4", "name": "ref.mp4"}]
        with self.assertRaisesRegex(ValueError, "不支持视频参考"):
            server.validate_task_input("video", "hfsy-minimax-h3", "x", "9:16", "10", "large", references)

    def test_hfsy_task_uses_only_hfsy_key_and_does_not_start_ark_subprocess(self):
        task = {
            "id": "hfsy-task", "kind": "image", "provider": "hfsy", "profile": "hfsy-gpt-image-2",
            "prompt": "poster", "status": "queued", "created_at": 1.0, "started_at": None,
            "finished_at": None, "reference_files": [], "ratio": "1:1", "duration": "10",
            "resolution": "1K", "image_url": "", "local_image_url": "", "video_url": "",
            "local_video_url": "", "error": "", "queue_position": 1,
        }
        server.TASKS[task["id"]] = task
        with patch.object(server, "private_env_value", side_effect=lambda key: "hfsy-secret" if key == "HFSY_API_KEY" else ""):
            with patch.object(server, "run_hfsy_generation", return_value={"result_url": "https://cdn.example/result.png"}) as generate:
                with patch.object(server, "download_image_result", return_value="/media/results/hfsy-task.png"):
                    with patch.object(server.subprocess, "run") as ark_run:
                        server.run_task(task["id"])

        generate.assert_called_once_with(task, "hfsy-secret")
        ark_run.assert_not_called()
        self.assertEqual(task["status"], "completed")
        self.assertEqual(task["local_image_url"], "/media/results/hfsy-task.png")

    def test_health_flags_report_hfsy_readiness_without_returning_secret(self):
        with patch.dict(os.environ, {"HFSY_API_KEY": "do-not-leak"}, clear=True):
            health = server.health_flags()

        self.assertTrue(health["hfsy_ready"])
        self.assertNotIn("do-not-leak", repr(health))

    def test_hfsy_accepts_public_reference_urls_and_rejects_local_files(self):
        with patch.object(server.EXECUTOR, "submit"):
            task = server.create_tasks(Fields({
                "kind": "image", "profile": "hfsy-gpt-image-2", "prompts": "edit",
                "ratio": "1:1", "resolution": "1K",
                "reference_urls": "https://cdn.example/look.png",
            }))[0]
        self.assertEqual(task["reference_files"][0]["url"], "https://cdn.example/look.png")
        self.assertEqual(task["reference_files"][0]["mime"], "image/png")

        with self.assertRaisesRegex(ValueError, "HFSY 参考素材请填写公网 URL"):
            server.validate_task_input(
                "image", "hfsy-gpt-image-2", "edit", "1:1", "10", "1K",
                [{"path": "/tmp/local.png", "mime": "image/png", "name": "local.png"}],
            )


if __name__ == "__main__":
    unittest.main()
