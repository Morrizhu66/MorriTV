import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARK_ENDPOINT_URL = (
    "https://cloud.bytedance.net/ark/region:ark+cn-beijing/endpoint/detail?"
    "Id=ep-20260422194853-4h52t&Tab=overview&arkAccountId=2110547014&"
    "arkProjectName=ark_project_20260413_9u9f9&type=&x-bc-region-id=bytedance&"
    "x-resource-account=public"
)


class GithubPackagingTests(unittest.TestCase):
    def test_readme_links_to_the_required_ark_endpoint(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn(ARK_ENDPOINT_URL, readme)
        self.assertIn("ARK_API_KEY", readme)
        self.assertNotIn("/Users/bytedance", readme)

    def test_runtime_files_and_secrets_are_ignored(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        for entry in (".env", "uploads/", "results/", "task-history.jsonl", "*.log"):
            self.assertIn(entry, gitignore)

    def test_public_env_example_contains_placeholders_only(self):
        example = (ROOT / ".env.example").read_text(encoding="utf-8")
        self.assertIn("ARK_API_KEY=", example)
        self.assertIn("SEEDANCE_ARK_API_KEY=", example)
        self.assertIn("LINGGANYA_API_KEY=", example)
        for name in ("TOS_ACCESS_KEY=", "TOS_SECRET_KEY=", "TOS_ENDPOINT=", "TOS_REGION=", "TOS_BUCKET="):
            self.assertIn(name, example)
        self.assertNotRegex(example, r"ark-[A-Za-z0-9_-]{10,}")
        self.assertNotRegex(example, r"sk-[A-Za-z0-9_-]{10,}")

    def test_readme_documents_current_providers(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        for model in ("gpt-image-2.5-sunburst-special", "sd-2.0-mini", "Seedream 5.0 Pro"):
            self.assertIn(model, readme)
        self.assertIn("LINGGANYA_API_KEY", readme)
        self.assertFalse((ROOT / "hfsy_client.py").exists())

    def test_server_uses_the_bundled_model_caller(self):
        import server

        self.assertTrue(server.SKILL_CALLER.is_relative_to(ROOT))
        self.assertTrue(server.SKILL_CALLER.is_file())

    def test_launcher_keeps_the_existing_runtime_and_isolates_the_tos_sdk(self):
        launcher = (ROOT / "Start Model Studio.command").read_text(encoding="utf-8")
        requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8")
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("--target .deps", launcher)
        self.assertIn("PYTHONPATH=.deps", launcher)
        self.assertIn("python3 server.py", launcher)
        self.assertNotIn(".venv/bin/python3 server.py", launcher)
        self.assertIn("tos", requirements)
        self.assertIn(".deps/", gitignore)


if __name__ == "__main__":
    unittest.main()
