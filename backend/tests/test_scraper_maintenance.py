import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


class GeminiUnavailableError(RuntimeError):
    def __init__(self, notice_url):
        super().__init__("Gemini unavailable")
        self.notice_url = notice_url


class ScraperMaintenanceTests(unittest.TestCase):
    def make_scraper(self, settings, get_notices, save_notices=None, processed_urls=None):
        logic = types.ModuleType("logic")
        logic.GeminiUnavailableError = GeminiUnavailableError
        logic.get_notices = get_notices
        database = types.ModuleType("db")
        database.save_notices_to_supabase = save_notices or (lambda notices: {"inserted": len(notices)})
        database.delete_old_notices = lambda: 0
        database.get_gemini_maintenance = lambda: settings.get("gemini_maintenance", "")
        database.set_gemini_maintenance = lambda value: settings.__setitem__("gemini_maintenance", value)
        database.get_processed_urls = lambda: processed_urls or set()
        push = types.ModuleType("push")
        push.notify_affected_subscribers = lambda notices: 0
        dotenv = types.ModuleType("dotenv")
        dotenv.load_dotenv = lambda: None

        module_path = Path(__file__).resolve().parents[1] / "run_scraper.py"
        spec = importlib.util.spec_from_file_location("scraper_under_test", module_path)
        scraper = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"logic": logic, "db": database, "push": push, "dotenv": dotenv}):
            spec.loader.exec_module(scraper)
        return scraper

    def test_gemini_failure_records_the_unprocessed_notice(self):
        settings = {"maintenance_mode": "true"}
        notice_url = "https://zaneco.ph/notice/123"
        def fail():
            raise GeminiUnavailableError(notice_url)
        scraper = self.make_scraper(settings, fail)

        with self.assertRaises(GeminiUnavailableError):
            scraper.main()

        self.assertEqual(settings.get("gemini_maintenance"), notice_url)
        self.assertEqual(settings["maintenance_mode"], "true")

    def test_saving_the_failed_notice_clears_only_automatic_maintenance(self):
        notice_url = "https://zaneco.ph/notice/123"
        settings = {"maintenance_mode": "true", "gemini_maintenance": notice_url}
        scraper = self.make_scraper(settings, lambda: [{"url": notice_url}])

        scraper.main()

        self.assertEqual(settings["gemini_maintenance"], "")
        self.assertEqual(settings["maintenance_mode"], "true")

    def test_empty_or_unrelated_scrape_does_not_clear_maintenance(self):
        notice_url = "https://zaneco.ph/notice/123"
        for notices in ([], [{"url": "https://zaneco.ph/notice/other"}]):
            with self.subTest(notices=notices):
                settings = {"gemini_maintenance": notice_url}
                self.make_scraper(settings, lambda: notices).main()
                self.assertEqual(settings["gemini_maintenance"], notice_url)

    def test_failed_save_does_not_clear_maintenance(self):
        notice_url = "https://zaneco.ph/notice/123"
        settings = {"gemini_maintenance": notice_url}
        def fail_save(notices):
            raise RuntimeError("database unavailable")
        scraper = self.make_scraper(settings, lambda: [{"url": notice_url}], fail_save)

        with self.assertRaises(RuntimeError):
            scraper.main()

        self.assertEqual(settings["gemini_maintenance"], notice_url)

    def test_previously_saved_pending_notice_clears_maintenance(self):
        notice_url = "https://zaneco.ph/notice/123"
        settings = {"gemini_maintenance": notice_url}
        scraper = self.make_scraper(settings, lambda: [], processed_urls={notice_url})

        scraper.main()

        self.assertEqual(settings["gemini_maintenance"], "")

    def test_settings_failure_does_not_skip_notifications(self):
        notices = [{"url": "https://zaneco.ph/notice/123"}]
        notified = []
        scraper = self.make_scraper({}, lambda: notices)
        def fail_settings():
            raise RuntimeError("settings unavailable")
        scraper.get_gemini_maintenance = fail_settings
        scraper.notify_affected_subscribers = lambda value: notified.extend(value) or 1

        with self.assertRaises(RuntimeError):
            scraper.main()

        self.assertEqual(notified, notices)


if __name__ == "__main__":
    unittest.main()