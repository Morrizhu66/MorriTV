import json
import unittest
from email.message import Message
from unittest.mock import patch


class HfsyClientContractTests(unittest.TestCase):
    def test_catalog_contains_confirmed_image_models_and_both_sd_720_videos(self):
        from hfsy_client import MODEL_SPECS

        self.assertEqual(
            set(MODEL_SPECS),
            {
                "hfsy-gpt-image-2",
                "hfsy-gpt-image-2pro",
                "hfsy-nano-banana-2",
                "hfsy-nano-banana-pro",
                "hfsy-sd-2-0",
                "hfsy-sd-2-5-720",
            },
        )
        self.assertNotIn("hfsy-minimax-h3", MODEL_SPECS)
        self.assertEqual(MODEL_SPECS["hfsy-gpt-image-2pro"]["model"], "gpt-image-2pro")
        self.assertEqual(MODEL_SPECS["hfsy-nano-banana-pro"]["model"], "nano-banana-pro")
        self.assertNotIn("hfsy-sd-2", MODEL_SPECS)
        self.assertEqual(MODEL_SPECS["hfsy-sd-2-0"]["model"], "sd-2.0")
        self.assertEqual(MODEL_SPECS["hfsy-sd-2-5-720"]["model"], "sd-2.5-720")

    def test_builds_sd2_720p_request_for_fifteen_second_image_video(self):
        from hfsy_client import build_generation_request

        endpoint, payload = build_generation_request(
            profile="hfsy-sd-2-0",
            prompt="4K，24fps，原生音频，真人实拍武打电影风格。@图片1 是 Liz，@图片2 是伊芙。",
            ratio="16:9",
            resolution="720p",
            references=[
                ("https://cdn.example/liz.png", "image/png"),
                ("https://cdn.example/eve.png", "image/png"),
            ],
            duration="15",
        )

        self.assertEqual(endpoint, "/v1/video/create")
        self.assertEqual(payload, {
            "model": "sd-2.0",
            "orientation": "landscape",
            "ratio": "16:9",
            "prompt": "4K，24fps，原生音频，真人实拍武打电影风格。@图片1 是 Liz，@图片2 是伊芙。",
            "images": ["https://cdn.example/liz.png", "https://cdn.example/eve.png"],
            "videos": [],
            "audios": [],
            "duration": 15,
            "size": "large",
            "watermark": False,
        })

    def test_sd2_uses_legacy_duration_ratio_and_reference_limits(self):
        from hfsy_client import build_generation_request

        _, minimum_payload = build_generation_request("hfsy-sd-2-0", "x", "16:9", "720p", [], "4")
        self.assertEqual(minimum_payload["duration"], 4)
        with self.assertRaisesRegex(ValueError, "4 到 15 秒"):
            build_generation_request("hfsy-sd-2-0", "x", "16:9", "720p", [], "3")
        with self.assertRaisesRegex(ValueError, "最多支持 9 张参考图"):
            build_generation_request(
                "hfsy-sd-2-0", "x", "16:9", "720p",
                [(f"https://cdn.example/{index}.png", "image/png") for index in range(10)], "15",
            )
        with self.assertRaisesRegex(ValueError, "最多支持 3 条参考视频"):
            build_generation_request(
                "hfsy-sd-2-0", "x", "16:9", "720p",
                [(f"https://cdn.example/{index}.mp4", "video/mp4") for index in range(4)], "15",
            )
        with self.assertRaisesRegex(ValueError, "最多支持 3 条参考音频"):
            build_generation_request(
                "hfsy-sd-2-0", "x", "16:9", "720p",
                [(f"https://cdn.example/{index}.wav", "audio/wav") for index in range(4)], "15",
            )
        with self.assertRaisesRegex(ValueError, "必须同时提供图片或视频素材"):
            build_generation_request(
                "hfsy-sd-2-0", "x", "16:9", "720p",
                [("https://cdn.example/voice.wav", "audio/wav")], "15",
            )

    def test_builds_sd25_720p_request_with_mixed_references(self):
        from hfsy_client import build_generation_request

        endpoint, payload = build_generation_request(
            profile="hfsy-sd-2-5-720",
            prompt="角色A @image1 与角色B @image2 进行写实搏击",
            ratio="16:9",
            resolution="720p",
            references=[
                ("https://cdn.example/a.png", "image/png"),
                ("https://cdn.example/b.webp", "image/webp"),
                ("https://cdn.example/move.mp4", "video/mp4"),
                ("https://cdn.example/music.wav", "audio/wav"),
            ],
            duration="15",
        )

        self.assertEqual(endpoint, "/v1/video/create")
        self.assertEqual(payload, {
            "model": "sd-2.5-720",
            "orientation": "landscape",
            "ratio": "16:9",
            "prompt": "角色A @image1 与角色B @image2 进行写实搏击",
            "images": ["https://cdn.example/a.png", "https://cdn.example/b.webp"],
            "videos": ["https://cdn.example/move.mp4"],
            "audios": ["https://cdn.example/music.wav"],
            "duration": 15,
            "size": "large",
            "watermark": False,
        })

    def test_sd25_rejects_invalid_duration_prompt_resolution_and_ratio(self):
        from hfsy_client import build_generation_request

        with self.assertRaisesRegex(ValueError, "4 到 30 秒"):
            build_generation_request("hfsy-sd-2-5-720", "x", "16:9", "720p", [], "3")
        with self.assertRaisesRegex(ValueError, "4 到 30 秒"):
            build_generation_request("hfsy-sd-2-5-720", "x", "16:9", "720p", [], "31")
        with self.assertRaisesRegex(ValueError, "5000"):
            build_generation_request("hfsy-sd-2-5-720", "x" * 5001, "16:9", "720p", [], "15")
        with self.assertRaisesRegex(ValueError, "仅支持 720p"):
            build_generation_request("hfsy-sd-2-5-720", "x", "16:9", "480p", [], "15")
        with self.assertRaisesRegex(ValueError, "不支持画幅 21:9"):
            build_generation_request("hfsy-sd-2-5-720", "x", "21:9", "720p", [], "15")

    def test_sd25_accepts_audio_only_and_rejects_excess_reference_counts(self):
        from hfsy_client import build_generation_request

        audio_only = [("https://cdn.example/voice.wav", "audio/wav")]
        _, payload = build_generation_request(
            "hfsy-sd-2-5-720", "x", "16:9", "720p", audio_only, "30"
        )
        self.assertEqual(payload["audios"], ["https://cdn.example/voice.wav"])

        images = [(f"https://cdn.example/{index}.png", "image/png") for index in range(31)]
        videos = [(f"https://cdn.example/{index}.mp4", "video/mp4") for index in range(11)]
        audios = [(f"https://cdn.example/{index}.wav", "audio/wav") for index in range(11)]
        with self.assertRaisesRegex(ValueError, "最多支持 30 张参考图"):
            build_generation_request("hfsy-sd-2-5-720", "x", "16:9", "720p", images, "15")
        with self.assertRaisesRegex(ValueError, "最多支持 10 条参考视频"):
            build_generation_request("hfsy-sd-2-5-720", "x", "16:9", "720p", videos, "15")
        with self.assertRaisesRegex(ValueError, "最多支持 10 条参考音频"):
            build_generation_request("hfsy-sd-2-5-720", "x", "16:9", "720p", audios, "15")

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

    def test_generate_does_not_retry_transient_reference_fetch_failure(self):
        from hfsy_client import generate

        responses = [
            RuntimeError("HFSY HTTP 400: failed to load fileData image: context deadline exceeded"),
            {"data": [{"url": "https://cdn.example/result.png"}]},
        ]
        with patch("hfsy_client.request_json", side_effect=responses) as request:
            with self.assertRaisesRegex(RuntimeError, "context deadline exceeded"):
                generate(
                    "hfsy-nano-banana-pro", "edit", "1:1", "1K",
                    [{"url": "https://tos.example/ref.jpg", "mime": "image/jpeg"}],
                    "10", "secret", sleep=lambda _: None,
                )

        self.assertEqual(request.call_count, 1)

    def test_generate_does_not_retry_transient_gateway_502(self):
        from hfsy_client import generate

        responses = [
            RuntimeError("HFSY HTTP 502: Upstream service is temporarily unavailable. Please retry later."),
            {"data": [{"url": "https://cdn.example/result.png"}]},
        ]
        with patch("hfsy_client.request_json", side_effect=responses) as request:
            with self.assertRaisesRegex(RuntimeError, "HFSY HTTP 502"):
                generate(
                    "hfsy-gpt-image-2pro", "edit", "9:16", "4K",
                    [{"url": "https://tos.example/ref.jpg", "mime": "image/jpeg"}],
                    "10", "secret", sleep=lambda _: None,
                )

        self.assertEqual(request.call_count, 1)

    def test_generate_does_not_resubmit_sd25_task_that_fails_with_upstream_eof(self):
        from hfsy_client import generate

        responses = [
            {"id": "video-first", "status": "IN_PROGRESS"},
            {"id": "video-first", "status": "FAILURE", "fail_reason": '任务失败: Post "http://***": EOF'},
            {"id": "video-second", "status": "IN_PROGRESS"},
            {
                "id": "video-second",
                "status": "SUCCESS",
                "result_url": "https://cdn.example/result.mp4",
            },
        ]
        with patch("hfsy_client.request_json", side_effect=responses) as request:
            with self.assertRaisesRegex(RuntimeError, "EOF"):
                generate(
                    "hfsy-sd-2-5-720", "fight", "16:9", "720p", [], "10", "secret",
                    sleep=lambda _: None,
                )

        self.assertEqual(request.call_count, 2)

    def test_generate_does_not_retry_non_transient_bad_request(self):
        from hfsy_client import generate

        with patch("hfsy_client.request_json", side_effect=RuntimeError("HFSY HTTP 400: invalid prompt")) as request:
            with self.assertRaisesRegex(RuntimeError, "invalid prompt"):
                generate("hfsy-nano-banana-pro", "edit", "1:1", "1K", [], "10", "secret", sleep=lambda _: None)
        self.assertEqual(request.call_count, 1)


if __name__ == "__main__":
    unittest.main()
