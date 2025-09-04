from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from logic import get_notices  # <-- import from logic.py
from supabase_client import supabase
from db import save_notices_to_supabase

# --- Flask app setup ---
app = Flask(__name__)
load_dotenv()  # load .env file

@app.route("/")
def index():
    return "Hello Flask!"

### API endpoint for notices
@app.route("/api/notices", methods=['GET', 'POST'])
def scrape_and_save_notices():
    notices = get_notices()  # scrape fresh notices
    result = save_notices_to_supabase(notices)  # save via db.py
    return jsonify({"message": f"Saved {result['inserted']} notices to Supabase"}), 201

@app.route("/api/notices/latest", methods=["GET"])
def get_latest_notices():
    # Query Supabase, ordered by created_at
    response = supabase.table("notices") \
                       .select("id, title, url, created_at, data") \
                       .order("created_at", desc=True) \
                       .limit(10) \
                       .execute()

    if response.data:
        return jsonify(response.data), 200
    else:
        return jsonify({"message": "No notices found"}), 404

# ==============================
# Flask entry point
# ==============================
if __name__ == "__main__":
    app.run(debug=True)
