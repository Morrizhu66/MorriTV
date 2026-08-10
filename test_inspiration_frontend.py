import unittest
from pathlib import Path


class InspirationFrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parent
        cls.html = (root / "index.html").read_text(encoding="utf-8")
        cls.js = (root / "app.js").read_text(encoding="utf-8")
        cls.css = (root / "style.css").read_text(encoding="utf-8")

    def test_inspiration_workspace_supports_manual_save_restore_and_delete(self):
        for identifier in ("inspiration-tab", "inspiration-view", "inspiration-grid"):
            self.assertIn(f'id="{identifier}"', self.html)
        for contract in (
            "async function loadInspirations()", "async function saveInspiration(task)",
            "async function restoreInspiration(item)", "async function deleteInspiration(item)",
            "fetch('/api/inspirations')", "存入灵感库", "一键复刻", "删除灵感",
        ):
            self.assertIn(contract, self.js)
        self.assertIn(".inspiration-card", self.css)

    def test_reference_images_are_unlimited_ordered_and_draggable(self):
        self.assertIn("draggable = true", self.js)
        self.assertIn("function moveReference(fromIndex, toIndex)", self.js)
        self.assertIn("reference-order", self.js)
        self.assertNotIn(".slice(0, 8)", self.js)
        self.assertIn("dragstart", self.js)
        self.assertIn("drop", self.js)

    def test_every_library_image_can_append_to_the_composer(self):
        self.assertIn("async function appendAssetToComposer(asset)", self.js)
        self.assertIn("async function appendTaskImageToComposer(task)", self.js)
        self.assertIn("asset.kind === 'image'", self.js)
        self.assertIn("填入输入框", self.js)


if __name__ == "__main__":
    unittest.main()
