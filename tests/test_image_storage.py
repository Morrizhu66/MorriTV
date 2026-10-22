import importlib.util
import tempfile
import unittest
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
SERVER_PATH = APP_DIR / "server.py"


def load_server_module():
    spec = importlib.util.spec_from_file_location("model_studio_image_storage_test", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ImageStorageTests(unittest.TestCase):
    def test_downloads_generated_image_into_results_and_returns_media_url(self):
        server = load_server_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "generated.png"
            source.write_bytes(b"\x89PNG\r\n\x1a\nimage-data")
            server.RESULTS_DIR = root / "results"

            local_url = server.download_image_result(source.as_uri(), "task123")

            self.assertEqual(local_url, "/media/results/task123.png")
            self.assertEqual((server.RESULTS_DIR / "task123.png").read_bytes(), source.read_bytes())

    def test_downloads_generated_image_into_collection_workspace(self):
        server = load_server_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "generated.png"
            source.write_bytes(b"\x89PNG\r\n\x1a\nimage-data")
            server.RESULTS_DIR = root / "results"
            server.COLLECTIONS_DIR = root / "collections"
            folder_id = "folder123"
            (server.COLLECTIONS_DIR / folder_id / "results").mkdir(parents=True)

            local_url = server.download_image_result(source.as_uri(), "task123", folder_id)

            self.assertEqual(local_url, "/media/collections/folder123/results/task123.png")
            self.assertEqual((server.COLLECTIONS_DIR / folder_id / "results" / "task123.png").read_bytes(), source.read_bytes())


if __name__ == "__main__":
    unittest.main()
