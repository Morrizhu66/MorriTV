import unittest
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent


class VideoPromptExpansionTests(unittest.TestCase):
    def setUp(self):
        self.html = (APP_DIR / "index.html").read_text(encoding="utf-8")
        self.js = (APP_DIR / "app.js").read_text(encoding="utf-8")
        self.css = (APP_DIR / "style.css").read_text(encoding="utf-8")

    def test_task_template_has_an_accessible_full_prompt_disclosure(self):
        self.assertIn('<details class="task-prompt-details" hidden>', self.html)
        self.assertIn('<summary>展开完整提示词</summary>', self.html)
        self.assertIn('<p class="task-prompt-full"></p>', self.html)

    def test_video_cards_bind_the_untruncated_prompt_to_the_disclosure(self):
        self.assertIn("if (task.kind === 'video')", self.js)
        self.assertIn("promptDetails.hidden = false", self.js)
        self.assertIn("promptDetails.querySelector('.task-prompt-full').textContent = task.prompt", self.js)
        self.assertIn('.task-prompt-full { white-space:pre-wrap;', self.css)


if __name__ == "__main__":
    unittest.main()
