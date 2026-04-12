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

def delete_old_notices():
    """
    Deletes records where the LATEST scheduled date inside the JSON data 
    has entirely passed (is older than today). This ensures notices with 
    multiple future dates are kept until all dates have passed.
    """
    try:
        from datetime import date
        from dateutil import parser
        
        today = date.today()
        
        # 1. Fetch all notices with their data
        res = supabase.table("notices").select("id, data").execute()
        if not res.data:
            return 0
            
        ids_to_delete = []
        
        for row in res.data:
            notice_id = row.get("id")
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
                # If we couldn't parse ANY date from the structured data, but it is very old based on created_at?
                # For safety, we just rely on dates.
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
