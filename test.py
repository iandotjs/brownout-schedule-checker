import cv2
import easyocr
from google import genai
import json
import re
import requests
import numpy as np
from rapidfuzz import process  # fuzzy matching
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import urljoin 
import time
from google.genai import errors as genai_errors
from datetime import datetime, date

ZANECO_BASE = "https://zaneco.ph"
CATEGORY_URL = f"{ZANECO_BASE}/category/power-interruption-update/"

def parse_notice_date(soup):
    """
    Extract and parse the published date from a notice page.
    Falls back to today's date if missing/unexpected.
    """
    time_tag = soup.select_one("time.entry-date")
    if time_tag and time_tag.has_attr("datetime"):
        try:
            return datetime.fromisoformat(time_tag["datetime"]).date()
        except Exception:
            pass
    return date.today()

def scrape_notice_image_urls(limit=2):
    notices = []
    resp = requests.get(CATEGORY_URL)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    articles = soup.select("article h2 a")
    for a in articles[:limit]:
        title = a.get_text(strip=True)
        post_url = a["href"]

        post_resp = requests.get(post_url)
        post_resp.raise_for_status()
        post_soup = BeautifulSoup(post_resp.text, "html.parser")

        # Keep publish date as metadata only
        notice_date = parse_notice_date(post_soup)

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
            "images": imgs,
            "publish_date": notice_date.isoformat()
        })

    return notices

# ⬅️ add this helper near your other functions
def pick_real_image_url(img_tag):
    """
    Prefer lazy-src / srcset / parent <a href> for WP images.
    Return absolute URL to a .png/.jpg under /wp-content/uploads, or None.
    """
    candidates = []

    # common WP/lazy attributes
    for attr in ("data-lazy-src", "data-src", "data-orig-file", "src"):
        val = img_tag.get(attr)
        if val:
            candidates.append(val)

    # srcset: take the last (usually largest) entry
    srcset = img_tag.get("srcset")
    if srcset:
        try:
            last = srcset.split(",")[-1].strip().split()[0]
            candidates.append(last)
        except Exception:
            pass

    # sometimes the full-size is on the wrapping <a href>
    parent = img_tag.parent
    if getattr(parent, "name", None) == "a" and parent.get("href"):
        candidates.append(parent.get("href"))

    # filter + absolutize
    for u in candidates:
        if u.startswith("data:"):
            continue
        abs_u = u if u.startswith("http") else urljoin(ZANECO_BASE, u)
        if re.search(r"/wp-content/uploads/.*\.(png|jpe?g)$", abs_u, re.IGNORECASE):
            return abs_u
    return None

# --- 0. PSGC fetching helpers ---
PSGC_BASE = "https://psgc.gitlab.io/api"
PROVINCE_CODE = "097200000"  # Zamboanga del Norte
CACHE_FILE = Path("zamboanga_del_norte_locations.json")

def fetch_and_cache_locations(force_refresh=False):
    """Fetch municipalities + barangays for Zamboanga del Norte and cache to JSON."""
    if CACHE_FILE.exists() and not force_refresh:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)

    locations = {}
    # Fetch municipalities/cities
    url = f"{PSGC_BASE}/provinces/{PROVINCE_CODE}/cities-municipalities/"
    resp = requests.get(url, headers={"accept": "application/json"})
    resp.raise_for_status()
    municipalities = resp.json()

    for m in municipalities:
        muni_name = m["name"].upper().strip()
        muni_code = m["code"]

        bgy_url = f"{PSGC_BASE}/cities-municipalities/{muni_code}/barangays/"
        bgy_resp = requests.get(bgy_url, headers={"accept": "application/json"})
        bgy_resp.raise_for_status()
        barangays = [b["name"].upper().strip() for b in bgy_resp.json()]

        locations[muni_name] = barangays
        print(f"Fetched {len(barangays)} barangays for {muni_name}")

    # Save to JSON
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(locations, f, ensure_ascii=False, indent=2)

    return locations

# --- 1. Always ensure reference JSON is available ---
reference_json = fetch_and_cache_locations()

# --- 2. Helper: fuzzy match ---
def snap_to_reference(name, choices):
    match, score, _ = process.extractOne(name.upper(), [c.upper() for c in choices])
    return match if score > 80 else name

# --- 3. Initialize Gemini client ---
client = genai.Client(api_key="AIzaSyA6tXl8cANw5KRwBnB7EYMK6puQunFp8t0")   # 🔑 replace with env var in production

# --- 4. Load and preprocess image from URL ---
def load_image_from_url(url):
    resp = requests.get(url, stream=True)
    resp.raise_for_status()
    img_array = np.asarray(bytearray(resp.content), dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    return img

def get_notice_details(url):
    res = requests.get(url)
    res.raise_for_status()
    soup = BeautifulSoup(res.text, "html.parser")

    images = []
    content_div = soup.select_one("div.entry-content")
    if content_div:
        seen = set()
        for img_tag in content_div.select("img"):
            real = pick_real_image_url(img_tag)
            if real and real not in seen:
                seen.add(real)
                images.append(real)

    return images

# --- Scrape latest notices ---
notices = scrape_notice_image_urls(limit=None)  # adjust limit as needed

final_results = []  # will collect structured outputs

def extract_json(text: str):
    """
    Extract JSON object from a text response.
    Falls back gracefully if no JSON is found.
    """
    try:
        # Try to find a JSON block inside triple backticks ```json ... ```
        match = re.search(r"```json(.*?)```", text, re.DOTALL)
        if match:
            return json.loads(match.group(1).strip())
        
        # Otherwise try to parse any JSON-looking substring
        match = re.search(r"({.*})", text, re.DOTALL)
        if match:
            return json.loads(match.group(1).strip())
        
        # If all else fails, just attempt raw JSON load
        return json.loads(text)
    except Exception as e:
        print("⚠️ JSON parsing failed:", e)
        return {}

def safe_generate(prompt, retries=3, backoff=2):
    """
    Call Gemini with retries and model fallback if overloaded.
    """
    models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"]  # fallback order

    for model in models:
        for attempt in range(retries):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt
                )
                return response.text  # success
            except genai_errors.ServerError as e:
                if "UNAVAILABLE" in str(e) or "overloaded" in str(e).lower():
                    wait_time = backoff ** attempt
                    print(f"⚠️ {model} overloaded (attempt {attempt+1}/{retries}), retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    raise  # some other error, don't swallow it
        print(f"⚠️ Model {model} failed after {retries} retries, falling back...")

    raise RuntimeError("❌ All Gemini models failed after retries + fallback")

for notice in notices:
    notice_result = {
        "title": notice["title"],
        "url": notice["url"],
        "processed_images": []
    }

    for img_url in notice["images"]:
        print(f"Processing image: {img_url}")
        img = load_image_from_url(img_url)

        # --- Preprocess ---
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        denoised = cv2.medianBlur(thresh, 3)

        # --- OCR ---
        reader = easyocr.Reader(['en'])
        results = reader.readtext(denoised)
        ocr_text = " ".join([res[1] for res in results])

        print("Raw OCR Text:")
        print(ocr_text)
        print("="*50)

        # --- Prompt Gemini (one notice at a time) ---
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
        today = datetime.strptime("2025-09-02", "%Y-%m-%d").date()
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
                valid_schedules.append(sched)

        notice_result["processed_images"].append({
            "image_url": img_url,
            "ocr_text": ocr_text,
            "structured": valid_schedules
        })

    # Collect results per notice
    final_results.append(notice_result)

# --- Save/print final structured JSON for all notices ---
print("Structured Results:")
print(json.dumps(final_results, indent=2))
