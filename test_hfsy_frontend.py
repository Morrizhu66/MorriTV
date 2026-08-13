import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent


class HfsyFrontendContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = (ROOT / "app.js").read_text(encoding="utf-8")
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")

    def test_catalog_exposes_all_confirmed_hfsy_options_and_both_sd_720p_models(self):
        for profile in (
            "hfsy-gpt-image-2", "hfsy-gpt-image-2pro", "hfsy-nano-banana-2",
            "hfsy-nano-banana-pro", "hfsy-sd-2-0", "hfsy-sd-2-5-720",
        ):
            self.assertIn(profile, self.js)
        self.assertNotIn("hfsy-minimax-h3", self.js)
        self.assertIn("sd-2.5-720", self.js)
        self.assertNotIn("'hfsy-sd-2': {", self.js)
        self.assertIn("'hfsy-sd-2-0': { label: 'SD 2.0 · 720P'", self.js)
        self.assertIn("SD 2.5 · 720P", self.js)
        self.assertIn("promptLimit: 5000", self.js)
        self.assertIn("maxImages: 30", self.js)
        self.assertIn("maxVideos: 10", self.js)
        self.assertIn("maxAudios: 10", self.js)
        self.assertIn("duration: [30,29,28,27,26,25,24,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4]", self.js)
        self.assertIn("duration: [15,14,13,12,11,10,9,8,7,6,5,4]", self.js)
        self.assertIn("maxImages: 9, maxVideos: 3, maxAudios: 3", self.js)
        self.assertIn("HFSY API", self.js)

    def test_model_change_applies_dynamic_ratio_resolution_duration_and_material_limits(self):
        self.assertIn("profile.addEventListener('change', applySelectedModel);", self.js)
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
        self.assertNotIn('id="reference-urls-field"', self.html)
        self.assertNotIn('id="reference-urls"', self.html)
        self.assertIn("data.tos_ready", self.js)
        self.assertIn("未配置 TOS，无法上传本地素材", self.js)

    def test_hfsy_uses_local_reference_picker_without_url_form_logic(self):
        self.assertNotIn("const referenceUrls", self.js)
        self.assertNotIn("reference_urls", self.js)
        self.assertIn("document.querySelector('#dropzone').classList.remove('hidden')", self.js)

    def test_gallery_hides_only_legacy_failures(self):
        self.assertIn("task.status !== 'failed' || task.history_version >= 2", self.js)


if __name__ == "__main__":
    unittest.main()
