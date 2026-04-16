import truststore
truststore.inject_into_ssl()

import os
import requests as http_requests

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# Load .env at the very beginning
load_dotenv()

from logic import get_notices
from db import save_notices_to_supabase, delete_old_notices
from supabase_client import supabase

ADMIN_KEY = os.getenv("ADMIN_KEY", "")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "iandotjs/brownout-schedule-checker")
GITHUB_WORKFLOW = os.getenv("GITHUB_WORKFLOW", "scraper.yml")

# --- Flask app setup ---
app = Flask(__name__)

# Lock CORS to known frontend origins while allowing local dev.
ALLOWED_ORIGINS = [
    os.getenv("FRONTEND_ORIGIN", "https://zn-outages.vercel.app"),
    "http://localhost:5173",
]

CORS(
    app,
    resources={r"/api/.*": {"origins": ALLOWED_ORIGINS}},
    methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Admin-Key"],
)


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization,X-Admin-Key"
    return response

@app.route("/")
def index():
    return "Hello Flask!"

### API endpoint for notices
@app.route("/api/notices", methods=['GET', 'POST', 'OPTIONS'])
def scrape_and_save_notices():
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        notices = get_notices()  # scrape fresh notices
        result = save_notices_to_supabase(notices)  # save via db.py
        deleted = delete_old_notices() # clean up fully expired schedules
        return jsonify({"message": f"Saved {result['inserted']} notices. Deleted {deleted} old notices."}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==============================
# Admin helpers
# ==============================

def require_admin():
    """Check X-Admin-Key header matches ADMIN_KEY."""
    key = request.headers.get("X-Admin-Key", "")
    if not ADMIN_KEY or key != ADMIN_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    return None


# ==============================
# Admin: Learned Locations
# ==============================

@app.route("/api/admin/learned-locations", methods=["GET", "OPTIONS"])
def admin_get_learned_locations():
    if request.method == "OPTIONS":
        return ("", 204)
    auth_err = require_admin()
    if auth_err:
        return auth_err
    try:
        res = supabase.table("learned_locations") \
            .select("*") \
            .order("created_at", desc=True) \
            .execute()
        return jsonify(res.data or [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/learned-locations/<int:loc_id>", methods=["PATCH", "DELETE", "OPTIONS"])
def admin_update_learned_location(loc_id):
    if request.method == "OPTIONS":
        return ("", 204)
    auth_err = require_admin()
    if auth_err:
        return auth_err
    try:
        if request.method == "DELETE":
            supabase.table("learned_locations").delete().eq("id", loc_id).execute()
            return jsonify({"message": "Deleted"})
        # PATCH
        body = request.get_json(force=True)
        updates = {}
        for field in ("verified", "municipality", "barangay", "location_type", "location_name"):
            if field in body:
                updates[field] = body[field]
        if not updates:
            return jsonify({"error": "No valid fields to update"}), 400
        res = supabase.table("learned_locations").update(updates).eq("id", loc_id).execute()
        return jsonify(res.data[0] if res.data else {})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==============================
# Admin: Community Reports
# ==============================

@app.route("/api/admin/reports", methods=["GET", "OPTIONS"])
def admin_get_reports():
    if request.method == "OPTIONS":
        return ("", 204)
    auth_err = require_admin()
    if auth_err:
        return auth_err
    try:
        res = supabase.table("community_reports") \
            .select("*") \
            .order("created_at", desc=True) \
            .execute()
        return jsonify(res.data or [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/reports/<int:report_id>", methods=["PATCH", "DELETE", "OPTIONS"])
def admin_update_report(report_id):
    if request.method == "OPTIONS":
        return ("", 204)
    auth_err = require_admin()
    if auth_err:
        return auth_err
    try:
        if request.method == "DELETE":
            supabase.table("community_reports").delete().eq("id", report_id).execute()
            return jsonify({"message": "Deleted"})
        # PATCH — update status
        body = request.get_json(force=True)
        status = body.get("status")
        if status not in ("confirmed", "not_yet_confirmed", "ongoing"):
            return jsonify({"error": "Invalid status"}), 400
        res = supabase.table("community_reports").update({"status": status}).eq("id", report_id).execute()
        return jsonify(res.data[0] if res.data else {})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==============================
# Admin: Maintenance Mode
# ==============================

@app.route("/api/admin/maintenance", methods=["GET", "PUT", "OPTIONS"])
def admin_maintenance():
    if request.method == "OPTIONS":
        return ("", 204)
    auth_err = require_admin()
    if auth_err:
        return auth_err
    try:
        if request.method == "GET":
            res = supabase.table("app_settings").select("value").eq("key", "maintenance_mode").execute()
            enabled = res.data[0]["value"] == "true" if res.data else False
            return jsonify({"enabled": enabled})
        # PUT
        body = request.get_json(force=True)
        enabled = "true" if body.get("enabled") else "false"
        supabase.table("app_settings").upsert(
            {"key": "maintenance_mode", "value": enabled},
            on_conflict="key"
        ).execute()
        return jsonify({"enabled": enabled == "true"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==============================
# Admin: Trigger GitHub Actions Workflow
# ==============================

@app.route("/api/admin/trigger-scrape", methods=["POST", "OPTIONS"])
def admin_trigger_scrape():
    if request.method == "OPTIONS":
        return ("", 204)
    auth_err = require_admin()
    if auth_err:
        return auth_err
    if not GITHUB_TOKEN:
        return jsonify({"error": "GITHUB_TOKEN not configured on server"}), 500
    try:
        body = request.get_json(force=True) or {}
        target_env = body.get("environment", "prod")
        if target_env not in ("dev", "prod"):
            return jsonify({"error": "Invalid environment"}), 400
        ref = "main" if target_env == "prod" else "dev"

        resp = http_requests.post(
            f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/{GITHUB_WORKFLOW}/dispatches",
            headers={
                "Authorization": f"Bearer {GITHUB_TOKEN}",
                "Accept": "application/vnd.github.v3+json",
            },
            json={"ref": ref, "inputs": {"target_environment": target_env}},
            timeout=15,
        )
        if resp.status_code == 204:
            return jsonify({"message": f"Workflow dispatched for {target_env} on {ref}"})
        else:
            return jsonify({"error": f"GitHub API returned {resp.status_code}: {resp.text}"}), resp.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500




# ==============================
# Flask entry point
# ==============================
if __name__ == "__main__":
    app.run(debug=True)
