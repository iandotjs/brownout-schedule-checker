import os
import re
from typing import List, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, date, timedelta

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def flatten_notice_for_db(n: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert one notice_result from your OCR pipeline into a single DB row.
    - images: list of image URLs across processed_images
    - ocr_text: concatenated OCR text
    - structured: merged list of schedules (jsonb)
    """
    images, ocr_chunks, schedules = [], [], []

    for p in n.get("processed_images", []):
        if p.get("image_url"):
            images.append(p["image_url"])
        if p.get("ocr_text"):
            ocr_chunks.append(p["ocr_text"])
        if p.get("structured"):
            schedules.extend(p["structured"])

    row = {
        "title": n.get("title"),
        "url": n.get("url"),
        "status": n.get("status", "active"),
        "created_at": (n.get("created_at") or datetime.utcnow()).isoformat(),
        "data": {k: v for k, v in n.items() if k not in ("title", "url", "status")},
    }
    return row

def save_notices_to_supabase(final_results: List[Dict[str, Any]]) -> dict:
    """
    Upsert by URL to avoid duplicates.
    final_results is the list returned by your get_notices()
    """
    rows = [flatten_notice_for_db(n) for n in final_results]
    if not rows:
        return {"inserted": 0, "data": []}

    # upsert using unique index on url
    res = supabase.table("notices").upsert(rows, on_conflict="url").execute()
    return {"inserted": len(res.data or []), "data": res.data}

def get_processed_urls() -> set:
    try:
        res = supabase.table("notices").select("url").execute()
        return {row["url"] for row in res.data}
    except Exception as e:
        print(f"Error fetching processed urls: {e}")
        return set()


def _parse_latest_date_from_title_or_url(title: str, url: str):
    """
    Best-effort fallback date extraction from title/url text.
    Handles common patterns such as:
    - "February 23,24,25,26 & 27 2026"
    - "February 28, March 2,3,4,5,6 & 7 2026"
    Also falls back to URL path date /YYYY/MM/DD/.
    """
    text = f"{title or ''} {url or ''}".lower()

    months = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
    }

    latest = None

    # Pattern: month + day list + year (single month segment)
    # Example: "february 23,24,25,26 & 27 2026"
    single_month_matches = re.finditer(
        r"(january|february|march|april|may|june|july|august|september|october|november|december)\s+([0-9,\s&-]+)\s+(\d{4})",
        text,
        flags=re.IGNORECASE,
    )
    for m in single_month_matches:
        month_name = m.group(1).lower()
        year = int(m.group(3))
        days = [int(x) for x in re.findall(r"\d{1,2}", m.group(2)) if 1 <= int(x) <= 31]
        for day_num in days:
            try:
                d = date(year, months[month_name], day_num)
                if latest is None or d > latest:
                    latest = d
            except Exception:
                pass

    # Pattern: explicit month day year triples
    # Example: "march 7 2026"
    explicit_matches = re.finditer(
        r"(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})",
        text,
        flags=re.IGNORECASE,
    )
    for m in explicit_matches:
        try:
            d = date(int(m.group(3)), months[m.group(1).lower()], int(m.group(2)))
            if latest is None or d > latest:
                latest = d
        except Exception:
            pass

    # Conservative URL fallback: /YYYY/MM/DD/
    url_match = re.search(r"/(\d{4})/(\d{2})/(\d{2})/", url or "")
    if url_match:
        try:
            d = date(int(url_match.group(1)), int(url_match.group(2)), int(url_match.group(3)))
            if latest is None or d > latest:
                latest = d
        except Exception:
            pass

    return latest

def delete_old_notices():
    """
    Deletes records where the LATEST scheduled date inside the JSON data 
    has entirely passed (is older than today). This ensures notices with 
    multiple future dates are kept until all dates have passed.
    """
    try:
        from dateutil import parser
        
        today = date.today()
        stale_fallback_days = int(os.getenv("SCRAPER_STALE_NOTICE_DAYS", "21"))
        
        # 1. Fetch all notices with their data
        res = supabase.table("notices").select("id, title, url, created_at, data").execute()
        if not res.data:
            return 0
            
        ids_to_delete = []
        
        for row in res.data:
            notice_id = row.get("id")
            title = row.get("title", "")
            url = row.get("url", "")
            created_at_raw = row.get("created_at")
            data = row.get("data", {})
            
            # Empty processed images are placeholder/incomplete rows; remove them.
            if not data.get("processed_images"):
                ids_to_delete.append(notice_id)
                continue
                
            latest_date_in_notice = None
            
            # Extract all dates from all processed_images -> structured
            for p_img in data.get("processed_images", []):
                for sched in p_img.get("structured", []):
                    for d_str in sched.get("dates", []):
                        try:
                            parsed_date = parser.parse(d_str).date()
                            if latest_date_in_notice is None or parsed_date > latest_date_in_notice:
                                latest_date_in_notice = parsed_date
                        except Exception:
                            pass
                            
            # If we found successfully parsed dates
            if latest_date_in_notice is not None:
                # If the absolutely LATEST date scheduled in this entire post has already passed
                if latest_date_in_notice < today:
                    ids_to_delete.append(notice_id)
            else:
                # Fallback 1: extract schedule/post date from title/url patterns.
                fallback_date = _parse_latest_date_from_title_or_url(title, url)
                if fallback_date is not None and fallback_date < today:
                    ids_to_delete.append(notice_id)
                    continue

                # Fallback 2: stale row age threshold when no parsable dates exist.
                if created_at_raw:
                    try:
                        created_at_dt = datetime.fromisoformat(created_at_raw.replace("Z", "+00:00")).date()
                        if created_at_dt < (today - timedelta(days=stale_fallback_days)):
                            ids_to_delete.append(notice_id)
                    except Exception:
                        pass
                
        # 2. Delete the fully expired notices
        if ids_to_delete:
            del_res = supabase.table("notices").delete().in_("id", ids_to_delete).execute()
            deleted_count = len(del_res.data or [])
            print(f"Cleanup: Deleted {deleted_count} perfectly expired notices based on schedule dates.")
            return deleted_count
            
        return 0
    except Exception as e:
        print(f"Error deleting old notices: {e}")
        return 0
