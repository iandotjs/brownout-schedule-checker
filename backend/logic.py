import cv2
import easyocr
from google import genai
import json
import re
import requests
import numpy as np
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

ZANECO_BASE = "https://zaneco.ph"
CATEGORY_URL = f"{ZANECO_BASE}/category/power-interruption-update/"

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

    resp = requests.get(CATEGORY_URL)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    articles = soup.select("article h2 a")
    for a in articles[:limit]:
        title = a.get_text(strip=True)
        post_url = a["href"]

        if post_url in processed_urls:
            # We already ran this through OCR and Gemini! Skip.
            continue

        # Check if the title text indicates a very old notice date? (Optional but handled below)

        # Detect status
        if "cancelled" in title.lower():
            status = "cancelled"
        else:
            status = "active"   # default for non-cancelled notices

        post_resp = requests.get(post_url)
        post_resp.raise_for_status()
        post_soup = BeautifulSoup(post_resp.text, "html.parser")

        notice_date = parse_notice_date(post_soup)
        
        # If the notice was published more than 14 days ago, it's definitely past. Skip it.
        if notice_date < date.today() - timedelta(days=14):
            print(f"Skipping {post_url} as it is too old ({notice_date})")
            continue

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
    resp = requests.get(url, headers={"accept": "application/json"})
    resp.raise_for_status()
    municipalities = resp.json()

    locations = []
    for m in municipalities:
        muni_name = m["name"].upper().strip()
        muni_code = m["code"]

        bgy_url = f"{PSGC_BASE}/cities-municipalities/{muni_code}/barangays/"
        bgy_resp = requests.get(bgy_url, headers={"accept": "application/json"})
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
    resp = requests.get(url, stream=True)
    resp.raise_for_status()
    img_array = np.asarray(bytearray(resp.content), dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
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
    """
    # Regex out something like 'april-8-2026' or 'january-15-2025'
    match = re.search(r'(january|february|march|april|may|june|july|august|september|october|november|december)-(\d{1,2})-(\d{4})', url.lower())
    if match:
        try:
            date_str = match.group(0) # e.g. april-8-2026
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

            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            denoised = cv2.medianBlur(thresh, 3)

            reader = easyocr.Reader(['en'])
            results = reader.readtext(denoised)
            ocr_text = " ".join([res[1] for res in results])

            image_prompt = f"""
            The following text is extracted from a single power interruption notice image via OCR.
            It may contain misreads, weird formatting, and grammar errors.

            Correct errors and map municipality + barangay names strictly using the provided location reference JSON.

            Return a JSON with this structure:
            {{
              "notices": [
                {{
                  "dates": ["August 27, 2025"],
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

            Text:
            {ocr_text}
            """

            response_text = safe_generate(image_prompt)
            result_json = extract_json(response_text)

            today = date.today()
            valid_schedules = []
            for sched in result_json.get("notices", []):
                dates = sched.get("dates", [])
                keep = False
                for d in dates:
                    try:
                        parsed = datetime.strptime(d, "%B %d, %Y").date()
                        if parsed >= today:
                            keep = True
                            break
                    except Exception:
                        continue
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
                "ocr_text": ocr_text,
                "structured": valid_schedules
            })

        final_results.append(notice_result)

    return final_results
