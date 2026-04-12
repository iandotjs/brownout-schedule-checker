from google import genai
import json
import re
import requests
from io import BytesIO
from PIL import Image
from rapidfuzz import process
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import urljoin 
import time
from google.genai import errors as genai_errors
from datetime import datetime, date, timedelta
import os
from dotenv import load_dotenv
from db import get_processed_urls

load_dotenv()  # load .env file here too (for GEMINI_API_KEY)

# ==============================
# Your scraper + OCR + Gemini code
# ==============================

USER_AGENT = "ZNBrownoutChecker-Bot/1.0 (contact: dinopol.ianjay@gmail.com)"
REQUEST_HEADERS = {"User-Agent": USER_AGENT}

ZANECO_BASE = "https://zaneco.ph"
CATEGORY_URL = f"{ZANECO_BASE}/category/power-interruption-update/"


def extract_notice_date_from_text(text: str):
    """
    Extract schedule date from title/URL text such as:
    - APRIL-10-2026
    - April 10, 2026
    - april_10_2026
    Returns a date or None when no reliable date is found.
    """
    month_names = (
        "january|february|march|april|may|june|july|august|"
        "september|october|november|december"
    )
    normalized = text.lower().replace("_", "-")

    # month-day-year pattern (supports spaces, commas, and dashes)
    m = re.search(
        rf"({month_names})[\s\-]+(\d{{1,2}})(?:st|nd|rd|th)?[\s,\-]+(\d{{4}})",
        normalized,
        flags=re.IGNORECASE,
    )
    if not m:
        return None

    month_name = m.group(1).title()
    day = int(m.group(2))
    year = int(m.group(3))
    try:
        return datetime.strptime(f"{month_name} {day} {year}", "%B %d %Y").date()
    except Exception:
        return None

def parse_notice_date(soup):
    time_tag = soup.select_one("time.entry-date")
    if time_tag and time_tag.has_attr("datetime"):
        try:
            return datetime.fromisoformat(time_tag["datetime"]).date()
        except Exception:
            pass
    return date.today()

def scrape_notice_image_urls(limit=None):
    notices = []

    # Get previously processed URLs to save rate limits
    processed_urls = get_processed_urls()
    print(f"Skipping {len(processed_urls)} already processed URLs...")

    # Pagination controls
    max_pages = int(os.getenv("SCRAPER_MAX_CATEGORY_PAGES", "8"))
    old_page_streak_limit = 2
    old_page_streak = 0
    page = 1
    seen_post_urls = set()
    today = date.today()

    while page <= max_pages and old_page_streak < old_page_streak_limit:
        page_url = CATEGORY_URL if page == 1 else f"{CATEGORY_URL}page/{page}/"
        print(f"Scanning category page {page}/{max_pages}: {page_url}")

        resp = requests.get(page_url, headers=REQUEST_HEADERS)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        articles = soup.select("article h2 a")
        if not articles:
            print(f"No articles found on page {page}. Stopping pagination.")
            break

        page_has_recent_posts = False

        for a in articles:
            title = a.get_text(strip=True)
            post_url = a.get("href")
            if not post_url:
                continue

            notice_schedule_date = extract_notice_date_from_text(f"{title} {post_url}")

            if post_url in seen_post_urls:
                continue
            seen_post_urls.add(post_url)

            # Already processed URLs likely belong to currently visible pages.
            # Mark page as relevant only if schedule date is today/future (or unknown).
            if post_url in processed_urls:
                if notice_schedule_date is None or notice_schedule_date >= today:
                    page_has_recent_posts = True
                continue

            # Skip old notices using the notice schedule date, not publish date.
            if notice_schedule_date is not None and notice_schedule_date < today:
                print(f"Skipping {post_url} as notice date is past ({notice_schedule_date})")
                continue

            # Detect status
            if "cancelled" in title.lower():
                status = "cancelled"
            else:
                status = "active"  # default for non-cancelled notices

            post_resp = requests.get(post_url, headers=REQUEST_HEADERS)
            post_resp.raise_for_status()
            post_soup = BeautifulSoup(post_resp.text, "html.parser")

            notice_date = parse_notice_date(post_soup)

            page_has_recent_posts = True

            imgs = []
            content_div = post_soup.select_one("div.entry-content")
            if content_div:
                seen = set()
                for img in content_div.select("img"):
                    real = pick_real_image_url(img)
                    if real and real not in seen:
                        seen.add(real)
                        imgs.append(real)

            notices.append({
                "title": title,
                "url": post_url,
                "status": status,
                "images": imgs,
                "publish_date": notice_date.isoformat()
            })

            if limit and len(notices) >= limit:
                print(f"Reached notice limit ({limit}).")
                return notices

        if page_has_recent_posts:
            old_page_streak = 0
        else:
            old_page_streak += 1
            print(f"Page {page} appears old-only. Consecutive old-page streak: {old_page_streak}/{old_page_streak_limit}")

        page += 1

    if old_page_streak >= old_page_streak_limit:
        print(f"Stopping pagination after {old_page_streak_limit} consecutive old-only pages.")
    elif page > max_pages:
        print(f"Stopping pagination at max page limit ({max_pages}).")

    return notices

def pick_real_image_url(img_tag):
    candidates = []
    for attr in ("data-lazy-src", "data-src", "data-orig-file", "src"):
        val = img_tag.get(attr)
        if val:
            candidates.append(val)

    srcset = img_tag.get("srcset")
    if srcset:
        try:
            last = srcset.split(",")[-1].strip().split()[0]
            candidates.append(last)
        except Exception:
            pass

    parent = img_tag.parent
    if getattr(parent, "name", None) == "a" and parent.get("href"):
        candidates.append(parent.get("href"))

    for u in candidates:
        if u.startswith("data:"):
            continue
        abs_u = u if u.startswith("http") else urljoin(ZANECO_BASE, u)
        if re.search(r"/wp-content/uploads/.*\.(png|jpe?g)$", abs_u, re.IGNORECASE):
            return abs_u
    return None

# ==============================
# PSGC Reference JSON
# ==============================

PSGC_BASE = "https://psgc.gitlab.io/api"
PROVINCE_CODE = "097200000"  # Zamboanga del Norte
CACHE_FILE = Path("zamboanga_del_norte_locations.json")

def fetch_and_cache_locations(force_refresh=False):
    if CACHE_FILE.exists() and not force_refresh:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)

    url = f"{PSGC_BASE}/provinces/{PROVINCE_CODE}/cities-municipalities/"
    headers = {**REQUEST_HEADERS, "accept": "application/json"}
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    municipalities = resp.json()

    locations = []
    for m in municipalities:
        muni_name = m["name"].upper().strip()
        muni_code = m["code"]

        bgy_url = f"{PSGC_BASE}/cities-municipalities/{muni_code}/barangays/"
        headers = {**REQUEST_HEADERS, "accept": "application/json"}
        bgy_resp = requests.get(bgy_url, headers=headers)
        bgy_resp.raise_for_status()
        barangays = [
            {"code": b["code"], "name": b["name"].upper().strip()}
            for b in bgy_resp.json()
        ]

        locations.append({
            "code": muni_code,
            "name": muni_name,
            "barangays": barangays
        })

        print(f"Fetched {len(barangays)} barangays for {muni_name}")

    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(locations, f, ensure_ascii=False, indent=2)

    return locations

reference_json = fetch_and_cache_locations()

if not reference_json or not isinstance(reference_json[0], dict):
    raise RuntimeError("❌ Reference JSON corrupted, expected list of dicts but got something else.")

def snap_to_reference(name, choices):
    match, score, _ = process.extractOne(name.upper(), [c.upper() for c in choices])
    return match if score > 80 else name

# ==============================
# Gemini client
# ==============================

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def load_image_from_url(url):
    resp = requests.get(url, headers=REQUEST_HEADERS, stream=True)
    resp.raise_for_status()
    # load directly into PIL memory safely
    img = Image.open(BytesIO(resp.content))
    return img

def extract_json(text: str):
    try:
        match = re.search(r"```json(.*?)```", text, re.DOTALL)
        if match:
            return json.loads(match.group(1).strip())
        match = re.search(r"({.*})", text, re.DOTALL)
        if match:
            return json.loads(match.group(1).strip())
        return json.loads(text)
    except Exception as e:
        print("⚠️ JSON parsing failed:", e)
        return {}

def safe_generate(prompt, retries=5, backoff=30):
    models = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"]
    last_error = None

    for model in models:
        for attempt in range(retries):
            try:
                print(f"    >> Trying {model} (attempt {attempt+1}/{retries})...")
                response = client.models.generate_content(
                    model=model,
                    contents=prompt
                )
                print(f"    >> {model} SUCCESS")
                return response.text
            except genai_errors.ClientError as e:
                error_str = str(e)
                last_error = e

                if "RESOURCE_EXHAUSTED" in error_str or "429" in error_str:
                    # Rate limited — wait and retry the SAME model
                    # Try to extract retry delay from error message
                    wait_time = backoff
                    import re as _re
                    delay_match = _re.search(r'retry in (\d+)', error_str)
                    if delay_match:
                        wait_time = int(delay_match.group(1)) + 2  # add small buffer
                    print(f"    >> {model} rate limited (attempt {attempt+1}/{retries}), waiting {wait_time}s...")
                    time.sleep(wait_time)
                    continue  # retry same model
                else:
                    # Other client errors (invalid key, location, etc.) — skip to next model
                    print(f"    >> {model} ClientError: {error_str[:200]}. Trying next model...")
                    break
            except genai_errors.ServerError as e:
                last_error = e
                if "UNAVAILABLE" in str(e) or "overloaded" in str(e).lower():
                    wait_time = backoff
                    print(f"    >> {model} overloaded (attempt {attempt+1}/{retries}), retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"    >> {model} ServerError: {e}. Trying next model...")
                    break
        else:
            print(f"    >> {model} failed after {retries} attempts, trying next model...")

    raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")

def is_filename_date_past(url: str) -> bool:
    """
    Attempts to extract an explicit date like APRIL-8-2026 from the filename/URL.
    If it exists and is earlier than today, return True (past).
    Handles both full and abbreviated month names (e.g., April or Apr).
    """
    # Regex to match both full and abbreviated month names
    match = re.search(r'(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-(\d{1,2})-(\d{4})', url.lower())
    if match:
        try:
            month_str = match.group(1)
            day = match.group(2)
            year = match.group(3)
            
            # Map abbreviated months to full names for parsing
            month_map = {
                'jan': 'january', 'feb': 'february', 'mar': 'march', 'apr': 'april',
                'may': 'may', 'jun': 'june', 'jul': 'july', 'aug': 'august',
                'sep': 'september', 'oct': 'october', 'nov': 'november', 'dec': 'december'
            }
            full_month = month_map.get(month_str[:3], month_str)
            date_str = f"{full_month.capitalize()}-{day}-{year}"
            parsed_date = datetime.strptime(date_str, "%B-%d-%Y").date()
            return parsed_date < date.today()
        except Exception:
            pass
    return False

# ==============================
# Main function
# ==============================

def get_notices():
    notices = scrape_notice_image_urls()  
    final_results = []

    for notice in notices:
        notice_result = {
            "title": notice["title"],
            "url": notice["url"],
            "processed_images": []
        }

        for img_url in notice["images"]:
            # Rapid-skip if URL specifies a fully past date
            if is_filename_date_past(img_url):
                print(f"Skipping past schedule image based on filename: {img_url}")
                continue
                
            print(f"Processing image: {img_url}")
            img = load_image_from_url(img_url)

            image_prompt = f"""
            The attached image is a power interruption schedule/notice.
            Carefully read the text and details natively from the image.
            For context, the image was extracted from this URL filename: {img_url.split('/')[-1]}
            Use the date/year in the filename to infer the exact date if it's missing from the visual text.

            Correct errors and map municipality + barangay names strictly using the provided location reference JSON.

            Return a JSON with this structure:
            {{
              "notices": [
                {{
                  "dates": ["April 14, 2026"],
                  "times": ["8:30AM - 5:00PM"],
                  "duration_hours": 8.5,
                  "locations": [
                    {{
                      "municipality": "POLANCO",
                      "barangays": ["Labrador", "Poblacion North", "Poblacion South", "Guinles"]
                    }}
                  ],
                  "reason": "Cleaned reason text here"
                }}
              ]
            }}

            Rules:
            - There may be multiple schedules inside this ONE image. Extract ALL of them.
            - Each schedule must be a separate object inside the "notices" array.
            - Always use the provided reference JSON for municipalities and barangays.
            - If OCR has a close but invalid name, replace it with the nearest valid one from the reference.
            - Return valid JSON only.

            Location reference:
            {json.dumps(reference_json, ensure_ascii=False)}
            """

            # Pass both the text prompt and the raw PIL image natively to Gemini!
            response_text = safe_generate([image_prompt, img])
            result_json = extract_json(response_text)

            today = date.today()
            valid_schedules = []
            for sched in result_json.get("notices", []):
                dates = sched.get("dates", [])
                
                # Default keep to True. We only discard if we CONFIDENTLY parse a date and it's in the past.
                # Do NOT discard just because the date parsing fails or is weird.
                keep = True 
                
                for d in dates:
                    try:
                        # Try parsing various formats Gemini might return
                        from dateutil import parser
                        parsed = parser.parse(d).date()
                        if parsed < today:
                            keep = False
                        else:
                            keep = True 
                            break # Found at least one valid future/today date, keep it!
                    except Exception:
                        pass # Ignore parsing errors, default to keep=True
                        
                if keep:
                    # ✅ Normalize municipality + barangay with PSGC reference
                    new_locs = []
                    for loc in sched.get("locations", []):
                        muni_name = loc.get("municipality", "").upper()
                        muni = next((m for m in reference_json if m["name"] == muni_name), None)
                        if muni:
                            muni_code = muni["code"]
                            barangays = []
                            for bname in loc.get("barangays", []):
                                b = next((b for b in muni["barangays"] if b["name"] == bname.upper()), None)
                                if b:
                                    barangays.append({"code": b["code"], "name": b["name"]})
                                else:
                                    barangays.append({"code": None, "name": bname})
                            new_locs.append({
                                "municipality": {"code": muni_code, "name": muni["name"]},
                                "barangays": barangays
                            })
                        else:
                            # fallback if no match found
                            new_locs.append({
                                "municipality": {"code": None, "name": muni_name},
                                "barangays": [{"code": None, "name": b} for b in loc.get("barangays", [])]
                            })
                    sched["locations"] = new_locs
                    valid_schedules.append(sched)

            notice_result["processed_images"].append({
                "image_url": img_url,
                "ocr_text": "Processed directly via Gemini Multimodal Vision",
                "structured": valid_schedules
            })

        # Skip placeholder notices that ended up with no valid future/today schedules.
        if notice_result["processed_images"]:
            final_results.append(notice_result)

    return final_results
