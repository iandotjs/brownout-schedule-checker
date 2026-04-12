import truststore
truststore.inject_into_ssl()

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load .env at the very beginning
load_dotenv()

from logic import get_notices
from db import save_notices_to_supabase, delete_old_notices

# --- Flask app setup ---
app = Flask(__name__)
CORS(app)

@app.route("/")
def index():
    return "Hello Flask!"

### API endpoint for notices
@app.route("/api/notices", methods=['GET', 'POST'])
def scrape_and_save_notices():
    notices = get_notices()  # scrape fresh notices
    result = save_notices_to_supabase(notices)  # save via db.py
    deleted = delete_old_notices() # clean up fully expired schedules
    return jsonify({"message": f"Saved {result['inserted']} notices. Deleted {deleted} old notices."}), 201




# ==============================
# Flask entry point
# ==============================
if __name__ == "__main__":
    app.run(debug=True)
