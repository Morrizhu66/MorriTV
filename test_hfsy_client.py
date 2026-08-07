import json
import unittest
from email.message import Message
from unittest.mock import patch


class HfsyClientContractTests(unittest.TestCase):
    def test_catalog_contains_four_image_models_and_no_video_model(self):
        from hfsy_client import MODEL_SPECS

        self.assertEqual(
            set(MODEL_SPECS),
            {
                "hfsy-gpt-image-2",
                "hfsy-gpt-image-2pro",
                "hfsy-nano-banana-2",
                "hfsy-nano-banana-pro",
            },
        )
        self.assertNotIn("hfsy-minimax-h3", MODEL_SPECS)
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
            parse_generation_response({"data": {"task_id": "video-nested", "status": "QUEUED"}}),
            {"status": "QUEUED", "task_id": "video-nested", "result_url": "", "error": ""},
        )
        self.assertEqual(
            parse_generation_response({
                "data": {"task_id": "video-done", "status": "COMPLETED", "result_url": "https://cdn.example/video.mp4"}
            }),
            {"status": "SUCCESS", "task_id": "video-done", "result_url": "https://cdn.example/video.mp4", "error": ""},
        )
        self.assertEqual(
            parse_generation_response({"id": "video-2", "status": "FAILURE", "fail_reason": "blocked"}),
            {"status": "FAILURE", "task_id": "video-2", "result_url": "", "error": "blocked"},
        )

    def test_rejects_model_specific_invalid_inputs_before_spending_money(self):
        from hfsy_client import build_generation_request

        with self.assertRaisesRegex(ValueError, "GPT Image 2 仅支持 1K"):
            build_generation_request("hfsy-gpt-image-2", "x", "1:1", "2K", [])

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

    def test_generate_rejects_local_hfsy_reference_instead_of_using_web_console_upload(self):
        from hfsy_client import generate

        with self.assertRaisesRegex(ValueError, "公网 URL"):
            generate(
                "hfsy-gpt-image-2", "edit", "1:1", "1K",
                [{"path": "/tmp/local.png", "mime": "image/png", "name": "local.png"}],
                "10", "secret",
            )

    def test_generate_uses_public_reference_url_without_calling_web_console_upload(self):
        from hfsy_client import generate

        references = [{"url": "https://cdn.example/reference.png", "mime": "image/png", "name": "reference.png"}]
        with patch("hfsy_client.request_json", return_value={"data": [{"url": "https://cdn.example/result.png"}]}) as request:
            result = generate("hfsy-gpt-image-2", "edit", "1:1", "1K", references, "10", "secret")

        self.assertEqual(request.call_args.args[1]["reference_images"], ["https://cdn.example/reference.png"])
        self.assertEqual(result["result_url"], "https://cdn.example/result.png")

    def test_generate_retries_one_transient_reference_fetch_failure(self):
        from hfsy_client import generate

        responses = [
            RuntimeError("HFSY HTTP 400: failed to load fileData image: context deadline exceeded"),
            {"data": [{"url": "https://cdn.example/result.png"}]},
        ]
        with patch("hfsy_client.request_json", side_effect=responses) as request:
            result = generate(
                "hfsy-nano-banana-pro", "edit", "1:1", "1K",
                [{"url": "https://tos.example/ref.jpg", "mime": "image/jpeg"}],
                "10", "secret", sleep=lambda _: None,
            )

        self.assertEqual(request.call_count, 2)
        self.assertEqual(result["result_url"], "https://cdn.example/result.png")

    def test_generate_does_not_retry_non_transient_bad_request(self):
        from hfsy_client import generate

        with patch("hfsy_client.request_json", side_effect=RuntimeError("HFSY HTTP 400: invalid prompt")) as request:
            with self.assertRaisesRegex(RuntimeError, "invalid prompt"):
                generate("hfsy-nano-banana-pro", "edit", "1:1", "1K", [], "10", "secret", sleep=lambda _: None)
        self.assertEqual(request.call_count, 1)


if __name__ == "__main__":
    unittest.main()
