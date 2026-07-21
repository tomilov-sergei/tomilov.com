#!/usr/bin/env python3

import unittest

import photo_upload_server


class HdrDetectionTests(unittest.TestCase):
    def test_detects_iso_21496_gain_map(self):
        body = b"\xff\xd8\xffexample urn:iso:std:iso:ts:21496 payload"
        self.assertTrue(photo_upload_server.detect_hdr_image(body, "image/jpeg"))

    def test_detects_apple_hdr_gain_map_label(self):
        body = b"\xff\xd8\xffexample HDRGainMap payload"
        self.assertTrue(photo_upload_server.detect_hdr_image(body, "image/jpeg"))

    def test_mpf_alone_is_not_treated_as_hdr(self):
        body = b"\xff\xd8\xffexample MPF payload"
        self.assertFalse(photo_upload_server.detect_hdr_image(body, "image/jpeg"))

    def test_ordinary_jpeg_is_not_treated_as_hdr(self):
        self.assertFalse(photo_upload_server.detect_hdr_image(b"\xff\xd8\xffordinary jpeg", "image/jpeg"))

    def test_non_hdr_capable_type_is_rejected(self):
        self.assertFalse(photo_upload_server.detect_hdr_image(b"HDRGainMap", "image/png"))

    def test_unknown_payload_is_rejected_without_content_type(self):
        self.assertFalse(photo_upload_server.detect_hdr_image(b"HDRGainMap"))

    def test_explicit_hdr_header_remains_supported(self):
        for value in ("1", "true", "TRUE", "yes", "on"):
            self.assertTrue(photo_upload_server.parse_boolean(value))


if __name__ == "__main__":
    unittest.main()
