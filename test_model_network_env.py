import os
import unittest
from unittest.mock import patch

import server


class ModelNetworkEnvironmentTests(unittest.TestCase):
    def test_ark_calls_bypass_proxy_environment(self):
        inherited = {
            "ARK_API_KEY": "test-image-key",
            "HTTP_PROXY": "http://127.0.0.1:9999",
            "HTTPS_PROXY": "http://127.0.0.1:9999",
            "ALL_PROXY": "socks5://127.0.0.1:9999",
            "http_proxy": "http://127.0.0.1:9999",
            "https_proxy": "http://127.0.0.1:9999",
            "all_proxy": "socks5://127.0.0.1:9999",
        }
        with patch.dict(os.environ, inherited, clear=True):
            child_env = server.model_child_env("image")

        for key in server.PROXY_ENV_KEYS:
            self.assertNotIn(key, child_env)
        self.assertEqual(child_env["ARK_API_KEY"], "test-image-key")
        self.assertIn(server.ARK_HOST, child_env["NO_PROXY"])
        self.assertIn(server.ARK_HOST, child_env["no_proxy"])

    def test_video_uses_its_independent_key_in_the_direct_environment(self):
        with patch.dict(os.environ, {"ARK_API_KEY": "image-key"}, clear=True):
            with patch.object(server, "private_env_value", return_value="video-key"):
                child_env = server.model_child_env("video")

        self.assertEqual(child_env["ARK_API_KEY"], "video-key")


if __name__ == "__main__":
    unittest.main()
