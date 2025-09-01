import os
from typing import List, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime

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
        "created_at": (n.get("created_at") or datetime.utcnow()).isoformat(),
        "data": {k: v for k, v in n.items() if k not in ("title", "url")},
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