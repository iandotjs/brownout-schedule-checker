import importlib
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from google.genai import errors


class GeminiRetryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_directory = os.getcwd()
        backend = Path(__file__).resolve().parents[1]
        os.chdir(backend)
        sys.path.insert(0, str(backend))
        database = types.ModuleType("db")
        database.get_processed_urls = lambda: set()
        database.save_learned_locations = lambda mappings: None
        database.get_verified_learned_locations = lambda: []
        with patch.dict(sys.modules, {"db": database}), patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            cls.logic = importlib.import_module("logic")

    @classmethod
    def tearDownClass(cls):
        os.chdir(cls.original_directory)

    def test_all_quota_exhausted_models_raise_unavailable(self):
        error = errors.ClientError(429, {"error": {"message": "RESOURCE_EXHAUSTED"}})
        with patch.object(self.logic.client.models, "generate_content", side_effect=error), patch.object(self.logic.time, "sleep"):
            with self.assertRaises(self.logic.GeminiUnavailableError):
                self.logic.safe_generate("prompt", retries=1, backoff=0)

    def test_network_failure_tries_all_models_and_raises_unavailable(self):
        error = httpx.ConnectError("connection failed")
        with patch.object(self.logic.client.models, "generate_content", side_effect=error) as generate, patch.object(self.logic.time, "sleep"):
            with self.assertRaises(self.logic.GeminiUnavailableError):
                self.logic.safe_generate("prompt", retries=1, backoff=0)
        self.assertEqual(generate.call_count, 4)

    def test_successful_fallback_does_not_raise_maintenance(self):
        exhausted = errors.ClientError(429, {"error": {"message": "RESOURCE_EXHAUSTED"}})
        response = types.SimpleNamespace(text='{"notices": []}')
        with patch.object(self.logic.client.models, "generate_content", side_effect=[exhausted, response]), patch.object(self.logic.time, "sleep"):
            self.assertEqual(self.logic.safe_generate("prompt", retries=1, backoff=0), '{"notices": []}')

    def test_invalid_key_does_not_enable_maintenance(self):
        error = errors.ClientError(400, {"error": {"message": "invalid key"}})
        with patch.object(self.logic.client.models, "generate_content", side_effect=error):
            with self.assertRaises(RuntimeError) as raised:
                self.logic.safe_generate("prompt", retries=1, backoff=0)
        self.assertNotIsInstance(raised.exception, self.logic.GeminiUnavailableError)

    def test_unavailable_fallbacks_after_missing_model_enable_maintenance(self):
        missing = errors.ClientError(404, {"error": {"message": "model not found"}})
        exhausted = errors.ClientError(429, {"error": {"message": "RESOURCE_EXHAUSTED"}})
        with patch.object(self.logic.client.models, "generate_content", side_effect=[missing, exhausted, exhausted, exhausted]), patch.object(self.logic.time, "sleep"):
            with self.assertRaises(self.logic.GeminiUnavailableError):
                self.logic.safe_generate("prompt", retries=1, backoff=0)

    def test_invalid_model_output_does_not_return_a_processed_notice(self):
        notice = {"title": "Notice", "url": "https://zaneco.ph/notice/123", "images": ["https://zaneco.ph/image.jpg"]}
        with patch.object(self.logic, "scrape_notice_image_urls", return_value=[notice]), \
             patch.object(self.logic, "load_image_from_url", return_value=object()), \
             patch.object(self.logic, "safe_generate", return_value="not JSON"):
            with self.assertRaises(ValueError):
                self.logic.get_notices()

    def test_failed_image_identifies_its_notice(self):
        notice = {"title": "Notice", "url": "https://zaneco.ph/notice/123", "images": ["https://zaneco.ph/image.jpg"]}
        with patch.object(self.logic, "scrape_notice_image_urls", return_value=[notice]), \
             patch.object(self.logic, "load_image_from_url", return_value=object()), \
             patch.object(self.logic, "safe_generate", side_effect=self.logic.GeminiUnavailableError("unavailable")):
            with self.assertRaises(self.logic.GeminiUnavailableError) as raised:
                self.logic.get_notices()
        self.assertEqual(raised.exception.notice_url, notice["url"])


if __name__ == "__main__":
    unittest.main()