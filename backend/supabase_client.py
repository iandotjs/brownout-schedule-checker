# supabase_client.py
import os
from supabase import create_client, Client

# Store in environment variables for security
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Use service_role or anon depending on needs

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
