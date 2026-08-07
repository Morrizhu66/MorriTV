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

    def test_accepts_hfsy_image_profile_as_independent_provider_task(self):
        with patch.object(server.EXECUTOR, "submit") as submit:
            image = server.create_tasks(Fields({
                "kind": "image", "profile": "hfsy-gpt-image-2", "prompts": "poster",
                "ratio": "1:1", "resolution": "1K",
            }))[0]

        self.assertEqual(image["provider"], "hfsy")
        self.assertEqual(submit.call_count, 1)

    def test_rejects_hfsy_image_model_for_video_task(self):
        with self.assertRaisesRegex(ValueError, "图片模型"):
            server.validate_task_input("video", "hfsy-gpt-image-2", "x", "1:1", "10", "1K", [])

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
        with patch.object(server, "private_env_value", side_effect=lambda key: "do-not-leak" if key == "HFSY_API_KEY" else ""):
            health = server.health_flags()

        self.assertTrue(health["hfsy_ready"])
        self.assertFalse(health["tos_ready"])
        self.assertNotIn("do-not-leak", repr(health))

    def test_hfsy_accepts_public_urls_and_local_files_when_tos_is_ready(self):
        with patch.object(server.EXECUTOR, "submit"):
            task = server.create_tasks(Fields({
                "kind": "image", "profile": "hfsy-gpt-image-2", "prompts": "edit",
                "ratio": "1:1", "resolution": "1K",
                "reference_urls": "https://cdn.example/look.png",
            }))[0]
        self.assertEqual(task["reference_files"][0]["url"], "https://cdn.example/look.png")
        self.assertEqual(task["reference_files"][0]["mime"], "image/png")

        with patch.object(server.tos_uploader, "config_status", return_value={"ready": True, "missing": []}):
            server.validate_task_input(
                "image", "hfsy-gpt-image-2", "edit", "1:1", "10", "1K",
                [{"path": "/tmp/local.png", "mime": "image/png", "name": "local.png"}],
            )

        with patch.object(server.tos_uploader, "config_status", return_value={"ready": False, "missing": ["TOS_BUCKET"]}):
            with self.assertRaisesRegex(RuntimeError, "TOS_BUCKET"):
                server.validate_task_input(
                    "image", "hfsy-gpt-image-2", "edit", "1:1", "10", "1K",
                    [{"path": "/tmp/local.png", "mime": "image/png", "name": "local.png"}],
                )

    def test_hfsy_generation_hosts_local_references_and_always_cleans_them_up(self):
        task = {
            "profile": "hfsy-gpt-image-2", "prompt": "edit", "ratio": "1:1", "resolution": "1K",
            "duration": "10", "reference_files": [{"path": "/tmp/look.png", "mime": "image/png", "name": "look.png"}],
        }
        hosted = {"url": "https://tos.example/look.png?signature=x", "mime": "image/png", "name": "look.png", "tos_key": "hfsy-temp/look.png"}
        with patch.object(server.tos_uploader, "upload_reference", return_value=hosted) as upload:
            with patch.object(server.tos_uploader, "delete_hosted_references") as cleanup:
                with patch.object(server.hfsy_client, "generate", return_value={"result_url": "https://cdn.example/result.png"}) as generate:
                    result = server.run_hfsy_generation(task, "hfsy-key")

        upload.assert_called_once()
        self.assertEqual(generate.call_args.kwargs["references"], [hosted])
        cleanup.assert_called_once_with([hosted], server.private_env_value)
        self.assertEqual(result["result_url"], "https://cdn.example/result.png")


if __name__ == "__main__":
    unittest.main()
