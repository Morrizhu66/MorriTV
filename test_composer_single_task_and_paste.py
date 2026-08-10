import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

import server


APP_DIR = Path(__file__).resolve().parent


class ComposerSingleTaskAndPasteTests(unittest.TestCase):
    def setUp(self):
        self.js = (APP_DIR / "app.js").read_text(encoding="utf-8")
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_uploads = server.UPLOADS_DIR
        self.original_collections = server.COLLECTIONS_DIR
        self.original_library = server.MEDIA_LIBRARY
        self.original_history = server.HISTORY_FILE
        server.UPLOADS_DIR = Path(self.temp_dir.name) / "uploads"
        server.COLLECTIONS_DIR = Path(self.temp_dir.name) / "collections"
        server.MEDIA_LIBRARY = server.MediaLibrary(Path(self.temp_dir.name) / "library.json", Path(self.temp_dir.name) / "results", server.COLLECTIONS_DIR)
        server.HISTORY_FILE = Path(self.temp_dir.name) / "task-history.jsonl"
        server.TASKS.clear()

    def tearDown(self):
        server.TASKS.clear()
        server.UPLOADS_DIR = self.original_uploads
        server.COLLECTIONS_DIR = self.original_collections
        server.MEDIA_LIBRARY = self.original_library
        server.HISTORY_FILE = self.original_history
        self.temp_dir.cleanup()

    def test_multiline_prompt_is_submitted_as_one_task(self):
        self.assertIn("const prompt = prompts.value.trim();", self.js)
        self.assertIn("if (!prompt)", self.js)
        self.assertIn("payload.set('prompts', prompt);", self.js)
        self.assertNotIn("prompts.value.split('\\n')", self.js)
        self.assertNotIn("一批最多 40 条提示词", self.js)

    def test_server_keeps_multiline_prompt_in_a_single_image_task(self):
        class Fields(dict):
            def getfirst(self, key, default=""):
                return self.get(key, default)

        fields = Fields({
            "kind": "image",
            "profile": "seedream50-pro-ark-direct",
            "prompts": "第一段提示词\n第二段提示词",
        })
        with patch.object(server.IMAGE_EXECUTOR, "submit") as submit:
            tasks = server.create_tasks(fields)

        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["prompt"], "第一段提示词\n第二段提示词")
        submit.assert_called_once()

    def test_task_submitted_from_collection_keeps_folder_and_copies_references_there(self):
        class Fields(dict):
            def getfirst(self, key, default=""):
                return self.get(key, default)

        folder = server.MEDIA_LIBRARY.create_folder("动作镜头")
        fields = Fields({
            "kind": "image", "profile": "seedream43-ark-direct", "prompts": "雨夜街道",
            "folder_id": folder["id"],
        })
        with patch.object(server.IMAGE_EXECUTOR, "submit"):
            task = server.create_tasks(fields)[0]

        self.assertEqual(task["folder_id"], folder["id"])
        self.assertEqual(server.history_task_snapshot(task)["folder_id"], folder["id"])

    def test_pasting_images_adds_them_to_reference_files_without_blocking_text_paste(self):
        self.assertIn("document.addEventListener('paste', event => {", self.js)
        self.assertIn("const images = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));", self.js)
        self.assertIn("if (!images.length) return;", self.js)
        self.assertIn("event.preventDefault();", self.js)
        self.assertIn("updateFiles(images);", self.js)


if __name__ == "__main__":
    unittest.main()
