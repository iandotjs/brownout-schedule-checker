"""
Send a test push notification to every device a user has subscribed.

Usage (from backend/, with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
VAPID_PRIVATE_KEY in the environment or .env):

    python send_test_push.py you@example.com
"""

import sys
from dotenv import load_dotenv

load_dotenv()

from push import VAPID_PRIVATE_KEY, _send_one, location_url  # noqa: E402
from supabase_client import supabase  # noqa: E402


def find_user_id(email: str) -> str | None:
    page = 1
    while True:
        users = supabase.auth.admin.list_users(page=page, per_page=200)
        if not users:
            return None
        for user in users:
            if (user.email or "").lower() == email.lower():
                return user.id
        page += 1


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1
    if not VAPID_PRIVATE_KEY:
        print("VAPID_PRIVATE_KEY is not set.")
        return 1

    email = sys.argv[1]
    user_id = find_user_id(email)
    if not user_id:
        print(f"No user found with email {email}.")
        return 1

    subs = supabase.table("push_subscriptions").select("*").eq("user_id", user_id).execute().data or []
    if not subs:
        print("This user has no push subscriptions. Turn on push alerts in the app first.")
        return 1

    sent = 0
    for sub in subs:
        ok = _send_one(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            title="\u26a1 Test alert",
            body=f"Push alerts are working for {sub.get('barangay_name', '')}, {sub.get('city_name', '')}.",
            url=location_url(sub.get("city_name", ""), sub.get("barangay_name", "")),
            tag="brownout-test",
        )
        sent += ok
    print(f"Sent {sent}/{len(subs)} test notification(s).")
    return 0 if sent else 1


if __name__ == "__main__":
    sys.exit(main())
