"""
Standalone scraper script that can be run by GitHub Actions or manually.
This is the entry point for scheduled brownout notice fetching.
"""

import os
from dotenv import load_dotenv
from logic import get_notices
from db import save_notices_to_supabase, delete_old_notices

# Load environment variables
load_dotenv()

def main():
    """Run the scraper workflow"""
    try:
        print("=" * 60)
        print("Starting brownout notice scraper...")
        print("=" * 60)
        
        # Step 1: Scrape fresh notices from ZANECO
        print("\n[1/3] Scraping notices from ZANECO...")
        notices = get_notices()
        print(f"✓ Found {len(notices)} new notices")
        
        # Step 2: Save to Supabase
        print("\n[2/3] Saving notices to database...")
        result = save_notices_to_supabase(notices)
        print(f"✓ Inserted {result['inserted']} notices")
        
        # Step 3: Clean up old expired notices
        print("\n[3/3] Cleaning up expired notices...")
        deleted = delete_old_notices()
        print(f"✓ Deleted {deleted} old notices")
        
        print("\n" + "=" * 60)
        print("Scraper completed successfully!")
        print(f"Summary: +{result['inserted']} new, -{deleted} old")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Scraper failed: {str(e)}")
        raise

if __name__ == "__main__":
    main()
