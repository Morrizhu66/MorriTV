import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent


class HfsyFrontendContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = (ROOT / "app.js").read_text(encoding="utf-8")
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")

    def test_catalog_exposes_all_confirmed_hfsy_options_and_no_sd_25(self):
        for profile in (
            "hfsy-gpt-image-2", "hfsy-gpt-image-2pro", "hfsy-nano-banana-2",
            "hfsy-nano-banana-pro", "hfsy-minimax-h3",
        ):
            self.assertIn(profile, self.js)
        self.assertNotIn("sd-2.5", self.js + self.html)
        self.assertIn("HFSY API", self.js)

    def test_model_change_applies_dynamic_ratio_resolution_duration_and_material_limits(self):
        self.assertIn("profile.addEventListener('change', applySelectedModel);", self.js)
        self.assertIn("maxImages: 5", self.js)
        self.assertIn("maxAudios: 1", self.js)
        self.assertIn("accept: 'image/*,audio/*'", self.js)
        self.assertIn("promptLimit: 2000", self.js)
        self.assertIn("document.querySelector('#duration-field').classList.toggle('hidden', !model.duration);", self.js)

    def test_health_uses_hfsy_readiness_for_hfsy_models(self):
        self.assertIn("model.provider === 'hfsy' ? data.hfsy_ready", self.js)
        self.assertIn("未找到 HFSY_API_KEY 配置", self.js)

    def test_retry_restores_model_before_its_dependent_options(self):
        self.assertIn("setSelectValue('#profile', task.profile);", self.js)
        self.assertIn("applySelectedModel();", self.js)
        self.assertLess(
            self.js.index("setSelectValue('#profile', task.profile);"),
            self.js.index("applySelectedModel();", self.js.index("async function restoreTaskInput")),
        )

    def test_html_has_reusable_generation_controls(self):
        self.assertIn('id="generation-options"', self.html)
        self.assertIn('id="duration-field"', self.html)
        self.assertIn('id="resolution"', self.html)
        self.assertIn('id="reference-urls-field"', self.html)
        self.assertIn('id="reference-urls"', self.html)
        self.assertIn("data.tos_ready", self.js)
        self.assertIn("未配置 TOS，可改填公网 URL", self.js)


if __name__ == "__main__":
    unittest.main()
