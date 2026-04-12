import truststore
truststore.inject_into_ssl()

import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# Load .env at the very beginning
load_dotenv()

from logic import get_notices
from db import save_notices_to_supabase, delete_old_notices

# --- Flask app setup ---
app = Flask(__name__)

# Lock CORS to known frontend origins while allowing local dev.
ALLOWED_ORIGINS = [
    os.getenv("FRONTEND_ORIGIN", "https://zn-outages.vercel.app"),
    "http://localhost:5173",
]

CORS(
    app,
    resources={r"/api/*": {"origins": ALLOWED_ORIGINS}},
    methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
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
# Flask entry point
# ==============================
if __name__ == "__main__":
    app.run(debug=True)
