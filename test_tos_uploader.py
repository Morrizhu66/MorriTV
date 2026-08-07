import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


class FakeClient:
    def __init__(self, ak, sk, endpoint, region):
        self.init = (ak, sk, endpoint, region)
        self.puts = []
        self.presigns = []
        self.deletes = []

    def put_object(self, bucket, key, **kwargs):
        self.puts.append((bucket, key, kwargs))

    def pre_signed_url(self, method, bucket, key, expires):
        self.presigns.append((method, bucket, key, expires))
        return SimpleNamespace(signed_url=f"https://signed.example/{key}?ttl={expires}")

    def delete_object(self, bucket, key):
        self.deletes.append((bucket, key))


class FakeTos:
    class HttpMethodType:
        Http_Method_Get = "GET"

    def __init__(self):
        self.clients = []

    def TosClientV2(self, *args):
        client = FakeClient(*args)
        self.clients.append(client)
        return client


CONFIG = {
    "TOS_ACCESS_KEY": "ak",
    "TOS_SECRET_KEY": "sk",
    "TOS_ENDPOINT": "tos-cn-beijing.volces.com",
    "TOS_REGION": "cn-beijing",
    "TOS_BUCKET": "model-studio-private",
    "TOS_SIGNED_URL_TTL": "1800",
}


class TosUploaderTests(unittest.TestCase):
    def test_reports_missing_configuration_without_exposing_values(self):
        from tos_uploader import config_status

        status = config_status(lambda name: {"TOS_ACCESS_KEY": "secret"}.get(name, ""))

        self.assertFalse(status["ready"])
        self.assertIn("TOS_SECRET_KEY", status["missing"])
        self.assertNotIn("secret", repr(status))

    def test_uploads_private_object_and_returns_short_lived_signed_url(self):
        from tos_uploader import upload_reference

        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "look.png"
            source.write_bytes(b"png-data")
            fake_tos = FakeTos()
            hosted = upload_reference(
                {"path": str(source), "name": "look.png", "mime": "image/png"},
                CONFIG.get,
                tos_module=fake_tos,
            )

        client = fake_tos.clients[0]
        self.assertEqual(client.init, ("ak", "sk", "tos-cn-beijing.volces.com", "cn-beijing"))
        bucket, key, kwargs = client.puts[0]
        self.assertEqual(bucket, "model-studio-private")
        self.assertTrue(key.startswith("hfsy-temp/"))
        self.assertTrue(key.endswith(".png"))
        self.assertEqual(kwargs["content_type"], "image/png")
        self.assertEqual(kwargs["content"], b"png-data")
        self.assertEqual(client.presigns[0], ("GET", bucket, key, 1800))
        self.assertTrue(hosted["url"].startswith("https://signed.example/"))
        self.assertEqual(hosted["tos_key"], key)

    def test_cleanup_deletes_only_hosted_temporary_objects(self):
        from tos_uploader import delete_hosted_references

        fake_tos = FakeTos()
        references = [
            {"url": "https://signed.example/a", "tos_key": "hfsy-temp/a.png"},
            {"url": "https://external.example/b.png"},
        ]
        delete_hosted_references(references, CONFIG.get, tos_module=fake_tos)

        self.assertEqual(fake_tos.clients[0].deletes, [("model-studio-private", "hfsy-temp/a.png")])


if __name__ == "__main__":
    unittest.main()
