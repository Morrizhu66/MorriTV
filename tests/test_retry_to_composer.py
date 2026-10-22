import unittest
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]


class RetryToComposerTests(unittest.TestCase):
    def setUp(self):
        self.js = (APP_DIR / "app.js").read_text(encoding="utf-8")

    def test_history_card_has_a_non_submitting_retry_to_composer_action(self):
        self.assertIn("retry.textContent = '再次制作 ↶'", self.js)
        self.assertIn("retry.type = 'button'", self.js)
        self.assertIn("retry.addEventListener('click', () => restoreTaskInput(task))", self.js)

    def test_retry_restores_full_prompt_parameters_and_reference_files(self):
        self.assertIn("async function restoreTaskInput(task)", self.js)
        self.assertIn("setKind(task.kind)", self.js)
        self.assertIn("prompts.value = task.prompt", self.js)
        self.assertIn("fetch(reference.url)", self.js)
        self.assertIn("new File([blob], reference.name", self.js)
        self.assertIn("renderReferences()", self.js)


if __name__ == "__main__":
    unittest.main()
