import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import doubao_work
import doubao_web
import server
from tests.test_canvas import Fields


class DoubaoWorkTests(unittest.TestCase):
    def test_prompt_keeps_user_text_and_uses_upload_order(self):
        refs = [
            {"mime": "image/png", "path": "/tmp/first.png"},
            {"mime": "video/mp4", "path": "/tmp/motion.mp4"},
            {"mime": "image/jpeg", "path": "/tmp/second.jpg"},
        ]
        text = doubao_work.prompt_text("  图一向图二走去\n", "16:9", "4", refs)
        self.assertIn("模式：视频生视频", text)
        self.assertTrue(text.endswith("[  图一向图二走去\n]"))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bridge = root / "bridge.py"
            video = root / "result.mp4"
            video.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"0" * 12)
            bridge.write_text("#!/usr/bin/env python3\nimport json,sys\nr=json.load(sys.stdin)\n"
                              "print(json.dumps({'status':'completed','tool':'doubao-creative-video','video_file':sys.argv[1]}))\n")
            bridge.chmod(0o700)
            task = {"prompt": "图一", "ratio": "16:9", "duration": "4", "reference_files": refs}
            with patch.object(doubao_work.subprocess, "run") as run:
                run.return_value.stdout = json.dumps({"status": "completed", "tool": "doubao-creative-video", "video_file": str(video)})
                run.return_value.returncode = 0
                self.assertEqual(doubao_work.generate(task, str(bridge)), video)
                request = json.loads(run.call_args.kwargs["input"])
                self.assertEqual([r["label"] for r in request["references"]], ["图片1", "视频1", "图片2"])
                self.assertEqual(request["allowed_tools"], ["doubao-creative-video"])
                self.assertEqual(request["reasoning_effort"], "low")

    def test_second_task_fails_without_queueing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fields = Fields(kind="video", profile=doubao_work.PROFILE, prompts="  prompt  ", ratio="16:9", duration="4")
            with patch.object(server, "TASKS", {}), patch.object(server, "UPLOADS_DIR", root / "uploads"), \
                 patch.object(server, "HISTORY_FILE", root / "history.jsonl"), \
                 patch.object(server.DOUBAO_EXECUTOR, "submit") as submit, \
                 patch.object(doubao_work, "pending_task_id", return_value=""), \
                 patch.object(doubao_work, "status", return_value={"ready": True}):
                first = server.create_tasks(fields)[0]
                second = server.create_tasks(fields)[0]
                self.assertEqual(first["status"], "queued")
                self.assertEqual(first["prompt"], "  prompt  ")
                self.assertEqual(second["status"], "failed")
                self.assertIn("进行中", second["error"])
                submit.assert_called_once()

    def test_formal_model_default_is_25_and_mini_is_explicit(self):
        self.assertIn("模型：seedance 2.5", doubao_work.prompt_text("x", "16:9", "4", []))
        self.assertIn("模型：seedance 2.0 mini", doubao_work.prompt_text("x", "16:9", "4", [], "seedance 2.0 mini"))

    def test_all_models_use_their_own_tool_model(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "output.mp4"
            video.write_bytes(b"\x00\x00\x00\x18ftypmp42")
            for profile, model in doubao_work.PROFILES.items():
                self.assertEqual(server.validate_task_input("video", profile, "x", "16:9", "4", "720p", []), "doubao_work")
                task = {"profile": profile, "prompt": " x ", "ratio": "16:9", "duration": "4", "reference_files": []}
                with patch.object(doubao_work.subprocess, "run") as run:
                    run.return_value.stdout = json.dumps({"status": "completed", "tool": "doubao-creative-video", "video_file": str(video)})
                    run.return_value.returncode = 0
                    doubao_work.generate(task)
                    request = json.loads(run.call_args.kwargs["input"])
                    self.assertIn(f"模型：{model}\n", request["prompt"])
                    self.assertTrue(request["prompt"].endswith("[ x ]"))

    def test_logged_out_rejected_before_upload_or_task_creation(self):
        with patch.object(doubao_work, "status", return_value={"ready": False}), \
             patch.object(server, "TASKS", {}), patch.object(server, "copy_references") as copy, \
             patch.object(server.DOUBAO_EXECUTOR, "submit") as submit:
            for profile in doubao_work.PROFILES:
                with self.assertRaisesRegex(ValueError, "豆包登录工具"):
                    server.create_tasks(Fields(kind="video", profile=profile, prompts="x"))
            copy.assert_not_called()
            submit.assert_not_called()
            self.assertEqual(server.TASKS, {})

    def test_login_running_is_not_ready_and_duplicate_open_is_ignored(self):
        with patch.object(doubao_work, "_LOGIN", {"logging_in": True, "error": ""}), \
             patch.object(doubao_work, "ready", return_value=True), \
             patch.object(doubao_work.threading, "Thread") as thread:
            self.assertFalse(doubao_work.start_login()["ready"])
            thread.assert_not_called()

    def test_durable_pending_and_process_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(doubao_web, "ROOT", root), patch.object(doubao_work, "STATE_DIR", root):
                with doubao_web.exclusive():
                    with self.assertRaisesRegex(RuntimeError, "进行中"):
                        with doubao_web.exclusive():
                            self.fail("second driver acquired the lock")
                    doubao_web.save("pending.json", {"task_id": "upstream-still-running"})
                self.assertEqual(doubao_work.pending_task_id(), "upstream-still-running")
                # Process exit releases only the OS lock, not the upstream gate.
                with doubao_web.exclusive():
                    self.assertEqual(doubao_work.pending_task_id(), "upstream-still-running")

    def test_invalid_arguments_and_official_profile_remain_separate(self):
        self.assertEqual(server.validate_task_input("video", doubao_work.PROFILE, "x", "16:9", "4", "720p", []), "doubao_work")
        self.assertEqual(server.validate_task_input("video", "seedance-reference-video-ark-direct", "x", "16:9", "5", "720p", []), "ark")
        with self.assertRaisesRegex(ValueError, "4–30"):
            server.validate_task_input("video", doubao_work.PROFILE, "x", "16:9", "3", "720p", [])

    def test_completed_bridge_video_uses_existing_local_task_result_flow(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "agent.mp4"
            source.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"0" * 12)
            task = {"id": "db-result", "kind": "video", "provider": "doubao_work", "profile": doubao_work.PROFILE,
                    "prompt": "x", "ratio": "16:9", "duration": "4", "reference_files": [], "status": "queued",
                    "folder_id": "", "created_at": 1, "error": ""}
            with patch.object(server, "TASKS", {task["id"]: task}), patch.object(server, "RESULTS_DIR", root / "results"), \
                 patch.object(server, "HISTORY_FILE", root / "history.jsonl"), patch.object(server, "register_completed_task"), \
                 patch.object(server.doubao_work, "generate", return_value=source):
                server.run_task(task["id"])
                self.assertEqual(task["status"], "completed")
                self.assertEqual(task["local_video_url"], "/media/results/db-result.mp4")
                self.assertEqual((root / "results" / "db-result.mp4").read_bytes(), source.read_bytes())


if __name__ == "__main__":
    unittest.main()
