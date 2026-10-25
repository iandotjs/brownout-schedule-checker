import truststore
truststore.inject_into_ssl()

import os
import time
import threading
import requests as http_requests

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# Load .env at the very beginning
load_dotenv()

from supabase_client import supabase

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "iandotjs/brownout-schedule-checker")
GITHUB_WORKFLOW = os.getenv("GITHUB_WORKFLOW", "scraper.yml")
TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "")

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
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    return response

@app.route("/")
def index():
    return "Hello Flask!"


# ==============================
# Public: Community Reports
# ==============================

REPORT_LIMIT = 5
REPORT_WINDOW_SECONDS = 600
LOCATION_TYPES = {"purok", "landmark", "street", "establishment"}
_report_hits: dict[str, list[float]] = {}
_report_hits_lock = threading.Lock()


def client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() if forwarded else (request.remote_addr or "")


def rate_limited(ip):
    """Best-effort per-instance limit; Turnstile is the primary control."""
    now = time.time()
    with _report_hits_lock:
        for key in [k for k, v in _report_hits.items() if v[-1] < now - REPORT_WINDOW_SECONDS]:
            del _report_hits[key]
        hits = [t for t in _report_hits.get(ip, []) if t > now - REPORT_WINDOW_SECONDS]
        if len(hits) >= REPORT_LIMIT:
            _report_hits[ip] = hits
            return True
        hits.append(now)
        _report_hits[ip] = hits
        return False


def verify_turnstile(token, ip):
    resp = http_requests.post(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        data={"secret": TURNSTILE_SECRET_KEY, "response": token, "remoteip": ip},
        timeout=10,
    )
    return resp.json().get("success") is True


def clean_text(value, max_len):
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if 0 < len(value) <= max_len else None


@app.route("/api/reports", methods=["POST", "OPTIONS"])
def submit_report():
    if request.method == "OPTIONS":
        return ("", 204)
    if not TURNSTILE_SECRET_KEY:
        app.logger.error("TURNSTILE_SECRET_KEY not configured")
        return jsonify({"error": "Reports are temporarily unavailable"}), 503

    body = request.get_json(silent=True) or {}
    token = body.get("turnstile_token")
    if not isinstance(token, str) or not token or len(token) > 2048:
        return jsonify({"error": "Verification required"}), 400

    report_type = body.get("type")
    if report_type == "location_report":
        row = {
            "type": report_type,
            "municipality": clean_text(body.get("municipality"), 100),
            "barangay": clean_text(body.get("barangay"), 100),
            "location_type": body.get("location_type") if body.get("location_type") in LOCATION_TYPES else None,
            "location_name": clean_text(body.get("location_name"), 200),
        }
    elif report_type == "suggestion":
        row = {"type": report_type, "message": clean_text(body.get("message"), 1000)}
    else:
        return jsonify({"error": "Invalid report type"}), 400
    if any(v is None for v in row.values()):
        return jsonify({"error": "Invalid or missing fields"}), 400

    ip = client_ip()
    if rate_limited(ip):
        return jsonify({"error": "Too many reports. Please try again later."}), 429

    try:
        if not verify_turnstile(token, ip):
            return jsonify({"error": "Verification failed. Please try again."}), 403
        supabase.table("community_reports").insert(row).execute()
        return jsonify({"message": "Report submitted"}), 201
    except Exception as e:
        return server_error(e)

# ==============================
# Admin helpers
# ==============================

def server_error(e):
    app.logger.exception(e)
    return jsonify({"error": "Internal server error"}), 500


def require_admin():
    """Verify the Supabase access token and check the user is in public.admins."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401
    token = auth_header[len("Bearer "):].strip()
    try:
        user = supabase.auth.get_user(token).user
    except Exception:
        user = None
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        res = supabase.table("admins").select("user_id").eq("user_id", user.id).limit(1).execute()
    except Exception as e:
        return server_error(e)
    if not res.data:
        return jsonify({"error": "Forbidden"}), 403
    return None


@app.route("/api/admin/me", methods=["GET", "OPTIONS"])
def admin_me():
    if request.method == "OPTIONS":
        return ("", 204)
    auth_err = require_admin()
    if auth_err:
        return auth_err
    return jsonify({"admin": True})


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
        return server_error(e)


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
        return server_error(e)


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
        return server_error(e)


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
        return server_error(e)


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
        return server_error(e)


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
        return server_error(e)




# ==============================
# Flask entry point
# ==============================
if __name__ == "__main__":
    app.run(debug=True)
