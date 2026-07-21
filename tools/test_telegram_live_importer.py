#!/usr/bin/env python3

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


TOOLS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS_DIR))

import generate_telegram_seo
import telegram_live_importer


class TelegramRichMessageTests(unittest.TestCase):
    def rich_update(self):
        return {
            "update_id": 99,
            "channel_post": {
                "message_id": 2088,
                "date": 1784660696,
                "chat": {"id": -1001, "username": "screenshot_of_the_day", "type": "channel"},
                "rich_message": {
                    "blocks": [
                        {"type": "heading", "size": 1, "text": {"type": "bold", "text": "Rich heading"}},
                        {
                            "type": "paragraph",
                            "text": [
                                "Before ",
                                {"type": "url", "text": "the link", "url": "https://example.com"},
                            ],
                        },
                        {
                            "type": "photo",
                            "photo": [
                                {"file_id": "small", "width": 90, "height": 60, "file_size": 100},
                                {"file_id": "large", "width": 1800, "height": 1200, "file_size": 2000},
                            ],
                            "caption": {"text": "Inline image", "credit": "Photographer"},
                        },
                        {"type": "paragraph", "text": "After"},
                    ]
                },
            },
        }

    def test_imports_rich_message_and_inline_media(self):
        with tempfile.TemporaryDirectory() as directory:
            posts_path = Path(directory) / "posts.json"
            with (
                mock.patch.object(telegram_live_importer.CONFIG, "posts_json_path", posts_path),
                mock.patch.object(telegram_live_importer.CONFIG, "upload_posts_json_to_s3", False),
                mock.patch.object(telegram_live_importer.CONFIG, "bot_api_local_mode", False),
                mock.patch.object(
                    telegram_live_importer,
                    "get_telegram_file",
                    return_value={"file_path": "photos/rich-message.jpg"},
                ) as get_file,
                mock.patch.object(telegram_live_importer, "download_telegram_file", return_value=b"jpeg"),
                mock.patch.object(telegram_live_importer, "upload_bytes_to_s3"),
                mock.patch.object(telegram_live_importer, "regenerate_seo_pages"),
            ):
                telegram_live_importer.process_update(self.rich_update())

            database = json.loads(posts_path.read_text(encoding="utf-8"))
            post = database["posts"][0]

            self.assertEqual(post["id"], "2088")
            self.assertEqual(post["text"], "Rich heading\n\nBefore the link\n\nInline image\n\nPhotographer\n\nAfter")
            self.assertEqual(post["entities"], [])
            self.assertEqual([block["type"] for block in post["richContent"]["blocks"]], ["heading", "paragraph", "photo", "paragraph"])
            self.assertEqual(post["richContent"]["blocks"][2]["media"]["src"], "/assets/telegram/live/2026/07/21/2088-photo-rich-message.jpg")
            self.assertEqual(post["media"][0]["sourceBlockPath"], "0002")
            get_file.assert_called_once_with("large")

    def test_static_renderer_keeps_text_and_media_order(self):
        post = {
            "id": "2088",
            "date": "2026-07-21T19:04:56Z",
            "telegramUrl": "https://t.me/screenshot_of_the_day/2088",
            "text": "Before\n\nAfter",
            "entities": [],
            "media": [{"type": "photo", "src": "/assets/telegram/live/rich.jpg", "width": 1200, "height": 800}],
            "reactions": [],
            "richContent": {
                "blocks": [
                    {"type": "paragraph", "text": "Before"},
                    {
                        "type": "photo",
                        "media": {"type": "photo", "src": "/assets/telegram/live/rich.jpg", "width": 1200, "height": 800},
                        "caption": {"text": "Inline image"},
                    },
                    {"type": "paragraph", "text": "After"},
                ]
            },
        }

        html = generate_telegram_seo.render_static_post(post)
        rich_html = html[html.index('<div class="screenshot-rich"'):]

        self.assertLess(rich_html.index("Before"), rich_html.index("rich.jpg"))
        self.assertLess(rich_html.index("rich.jpg"), rich_html.index("After"))
        self.assertEqual(html.count("rich.jpg"), 1)
        self.assertIn("screenshot-rich", html)

    def test_plain_text_supports_nested_blocks_and_custom_emoji(self):
        blocks = [
            {
                "type": "list",
                "items": [
                    {
                        "label": "•",
                        "blocks": [
                            {"type": "paragraph", "text": ["Hello ", {"type": "custom_emoji", "alternative_text": "👋"}]}
                        ],
                    }
                ],
            },
            {"type": "details", "summary": "More", "blocks": [{"type": "paragraph", "text": "Details"}]},
        ]

        self.assertEqual(telegram_live_importer.plain_rich_blocks(blocks), "• Hello 👋\n\nMore\n\nDetails")


if __name__ == "__main__":
    unittest.main()
