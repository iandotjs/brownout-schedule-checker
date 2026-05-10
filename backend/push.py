"""
Push notification module.

Sends Web Push notifications to subscribers whose default location
matches newly scraped brownout schedules.
"""

import os
import re
import json
from pywebpush import webpush, WebPushException
from supabase_client import supabase

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_EMAIL = os.getenv("VAPID_EMAIL", "admin@example.com")


def _normalize(text: str) -> str:
    return re.sub(r"[^A-Z0-9\s]", " ", str(text).upper()).strip()


def _extract_affected_locations(notices: list) -> set:
    """Extract all (municipality, barangay) name pairs from notice data."""
    affected = set()
    for notice in notices:
        for pi in notice.get("processed_images") or []:
            for sched in pi.get("structured") or []:
                for loc in sched.get("locations") or []:
                    muni = loc.get("municipality", "")
                    if isinstance(muni, dict):
                        muni = muni.get("name", "")
                    muni_norm = _normalize(muni)

                    for b in loc.get("barangays") or []:
                        brgy = b
                        if isinstance(b, dict):
                            brgy = b.get("name", "")
                        brgy_norm = _normalize(str(brgy))
                        if muni_norm and brgy_norm:
                            affected.add((muni_norm, brgy_norm))
    return affected


def _send_one(subscription_info: dict, title: str, body: str, url: str = "/", tag: str = "brownout-alert") -> bool:
    """Send a push notification to a single subscriber."""
    try:
        payload = json.dumps({
            "title": title,
            "body": body,
            "url": url,
            "tag": tag,
        })
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{VAPID_EMAIL}"},
        )
        return True
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (404, 410):
            # Subscription expired or unsubscribed — clean up
            try:
                supabase.table("push_subscriptions").delete().eq(
                    "endpoint", subscription_info["endpoint"]
                ).execute()
                print(f"  Removed stale subscription")
            except Exception:
                pass
        else:
            print(f"  Push failed: {e}")
        return False


def notify_affected_subscribers(notices: list) -> int:
    """
    Match newly scraped notices against push subscribers and send
    notifications to users whose default location is affected.

    Returns the number of notifications successfully sent.
    """
    if not VAPID_PRIVATE_KEY:
        print("  VAPID_PRIVATE_KEY not set — skipping push notifications")
        return 0

    affected = _extract_affected_locations(notices)
    if not affected:
        print("  No affected locations extracted from notices")
        return 0

    print(f"  Found {len(affected)} affected location(s)")

    try:
        res = supabase.table("push_subscriptions").select("*").execute()
        subscribers = res.data or []
    except Exception as e:
        print(f"  Could not fetch push subscriptions: {e}")
        return 0

    if not subscribers:
        print("  No push subscribers")
        return 0

    sent = 0
    for sub in subscribers:
        sub_city = _normalize(sub.get("city_name", ""))
        sub_brgy = _normalize(sub.get("barangay_name", ""))

        if (sub_city, sub_brgy) in affected:
            ok = _send_one(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                },
                title="\u26a1 Brownout Alert",
                body=f"New brownout scheduled for {sub.get('barangay_name', '')}, {sub.get('city_name', '')}. Tap to view.",
                tag=f"brownout-{sub_city}-{sub_brgy}",
            )
            if ok:
                sent += 1

    print(f"  Sent {sent}/{len(subscribers)} push notification(s)")
    return sent
