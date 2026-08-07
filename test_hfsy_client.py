import json
import unittest
from email.message import Message
from unittest.mock import call, patch


class HfsyClientContractTests(unittest.TestCase):
    def test_catalog_contains_the_five_confirmed_models_and_no_sd_model(self):
        from hfsy_client import MODEL_SPECS

        self.assertEqual(
            set(MODEL_SPECS),
            {
                "hfsy-gpt-image-2",
                "hfsy-gpt-image-2pro",
                "hfsy-nano-banana-2",
                "hfsy-nano-banana-pro",
                "hfsy-minimax-h3",
            },
        )
        self.assertEqual(MODEL_SPECS["hfsy-gpt-image-2pro"]["model"], "gpt-image-2pro")
        self.assertEqual(MODEL_SPECS["hfsy-nano-banana-pro"]["model"], "nano-banana-pro")
        self.assertNotIn("sd-2.5", {spec["model"] for spec in MODEL_SPECS.values()})

    def test_builds_gpt_image_request_with_profile_specific_size_and_references(self):
        from hfsy_client import build_generation_request

        endpoint, payload = build_generation_request(
            profile="hfsy-gpt-image-2pro",
            prompt="商业海报",
            ratio="16:9",
            resolution="2K",
            references=[("https://cdn.example/a.png", "image/png")],
        )

        self.assertEqual(endpoint, "/v1/images/generations")
        self.assertEqual(payload, {
            "model": "gpt-image-2pro",
            "prompt": "商业海报",
            "size": "2048x1152",
            "reference_images": ["https://cdn.example/a.png"],
            "n": 1,
            "response_format": "b64_json",
        })

    def test_builds_nano_request_in_gemini_shape(self):
        from hfsy_client import build_generation_request

        endpoint, payload = build_generation_request(
            profile="hfsy-nano-banana-2",
            prompt="保持主体一致",
            ratio="3:4",
            resolution="1K",
            references=[("https://cdn.example/look.webp", "image/webp")],
        )

        self.assertEqual(endpoint, "/v1beta/models/nano-banana-2:generateContent")
        self.assertEqual(payload["contents"][0]["parts"], [
            {"text": "保持主体一致"},
            {"fileData": {"mimeType": "image/webp", "fileUri": "https://cdn.example/look.webp"}},
        ])
        self.assertEqual(payload["generationConfig"]["imageConfig"], {
            "imageSize": "1K",
            "aspectRatio": "3:4",
        })

    def test_builds_minimax_request_without_video_references(self):
        from hfsy_client import build_generation_request

        endpoint, payload = build_generation_request(
            profile="hfsy-minimax-h3",
            prompt="电影级机场悬疑短片",
            ratio="9:16",
            resolution="large",
            duration="10",
            references=[
                ("https://cdn.example/hero.png", "image/png"),
                ("https://cdn.example/music.m4a", "audio/mp4"),
            ],
        )

        self.assertEqual(endpoint, "/v1/video/create")
        self.assertEqual(payload, {
            "model": "minimax-h3",
            "orientation": "portrait",
            "prompt": "电影级机场悬疑短片",
            "images": ["https://cdn.example/hero.png"],
            "audios": ["https://cdn.example/music.m4a"],
            "duration": 10,
            "size": "large",
            "watermark": False,
        })

    def test_extracts_urls_and_remote_status_from_each_response_shape(self):
        from hfsy_client import parse_generation_response

        self.assertEqual(
            parse_generation_response({"data": [{"url": "https://cdn.example/gpt.png"}]}),
            {"status": "SUCCESS", "task_id": "", "result_url": "https://cdn.example/gpt.png", "error": ""},
        )
        self.assertEqual(
            parse_generation_response({
                "candidates": [{"content": {"parts": [{"fileData": {"fileUri": "https://cdn.example/nano.png"}}]}}]
            }),
            {"status": "SUCCESS", "task_id": "", "result_url": "https://cdn.example/nano.png", "error": ""},
        )
        self.assertEqual(
            parse_generation_response({"task_id": "video-1", "status": "IN_PROGRESS", "progress": "45%"}),
            {"status": "IN_PROGRESS", "task_id": "video-1", "result_url": "", "error": ""},
        )
        self.assertEqual(
            parse_generation_response({"id": "video-2", "status": "FAILURE", "fail_reason": "blocked"}),
            {"status": "FAILURE", "task_id": "video-2", "result_url": "", "error": "blocked"},
        )

    def test_rejects_model_specific_invalid_inputs_before_spending_money(self):
        from hfsy_client import build_generation_request

        with self.assertRaisesRegex(ValueError, "GPT Image 2 仅支持 1K"):
            build_generation_request("hfsy-gpt-image-2", "x", "1:1", "2K", [])
        with self.assertRaisesRegex(ValueError, "Minimax H3 不支持视频参考"):
            build_generation_request(
                "hfsy-minimax-h3", "x", "16:9", "large", [("https://cdn.example/ref.mp4", "video/mp4")], "10"
            )

    def test_request_json_sends_bearer_token_and_json_without_leaking_key_into_result(self):
        from hfsy_client import request_json

        class Response:
            headers = Message()
            def __enter__(self): return self
            def __exit__(self, *_): return None
            def read(self): return b'{"status":"SUCCESS","result_url":"https://cdn.example/x.png"}'

        captured = []
        def opener(request, timeout):
            captured.append((request, timeout))
            return Response()

        result = request_json("/v1/images/generations", {"model": "gpt-image-2"}, "private-key", opener=opener)

        request, timeout = captured[0]
        self.assertEqual(request.full_url, "https://www.hfsyapi.cn/v1/images/generations")
        self.assertEqual(request.get_header("Authorization"), "Bearer private-key")
        self.assertEqual(json.loads(request.data), {"model": "gpt-image-2"})
        self.assertEqual(timeout, 180)
        self.assertNotIn("private-key", repr(result))

    def test_generate_uses_public_reference_then_polls_video_to_terminal_success(self):
        from hfsy_client import generate

        references = [{"url": "https://upload.example/hero.png", "mime": "image/png", "name": "hero.png"}]
        responses = [
            {"task_id": "video-1", "status": "IN_PROGRESS"},
            {"id": "video-1", "status": "SUCCESS", "result_url": "https://cdn.example/video.mp4"},
        ]
        with patch("hfsy_client.request_json", side_effect=responses) as request:
            result = generate(
                "hfsy-minimax-h3", "trailer", "9:16", "large", references, "10", "secret",
                sleep=lambda _: None,
            )

        self.assertEqual(request.call_args_list[1], call("/v1/video/query?id=video-1", None, "secret", method="GET"))
        self.assertEqual(result, {"result_url": "https://cdn.example/video.mp4", "task_id": "video-1"})

    def test_generate_rejects_local_hfsy_reference_instead_of_using_web_console_upload(self):
        from hfsy_client import generate

        with self.assertRaisesRegex(ValueError, "公网 URL"):
            generate(
                "hfsy-gpt-image-2", "edit", "1:1", "1K",
                [{"path": "/tmp/local.png", "mime": "image/png", "name": "local.png"}],
                "10", "secret",
            )

    def test_generate_raises_remote_failure_reason(self):
        from hfsy_client import generate

        with patch("hfsy_client.request_json", return_value={"id": "bad-1", "status": "FAILURE", "fail_reason": "policy"}):
            with self.assertRaisesRegex(RuntimeError, "policy"):
                generate("hfsy-minimax-h3", "x", "16:9", "small", [], "5", "secret", sleep=lambda _: None)

    def test_generate_uses_public_reference_url_without_calling_web_console_upload(self):
        from hfsy_client import generate

        references = [{"url": "https://cdn.example/reference.png", "mime": "image/png", "name": "reference.png"}]
        with patch("hfsy_client.request_json", return_value={"data": [{"url": "https://cdn.example/result.png"}]}) as request:
            result = generate("hfsy-gpt-image-2", "edit", "1:1", "1K", references, "10", "secret")

        self.assertEqual(request.call_args.args[1]["reference_images"], ["https://cdn.example/reference.png"])
        self.assertEqual(result["result_url"], "https://cdn.example/result.png")


if __name__ == "__main__":
    unittest.main()
