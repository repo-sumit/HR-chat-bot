"""Diagnostic: verify Supabase chat_logs insert works end-to-end.

Run: python scripts/check_supabase.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from app.config import SUPABASE_KEY, SUPABASE_URL


def main() -> int:
    print("=" * 60)
    print("SUPABASE DIAGNOSTIC")
    print("=" * 60)

    # 1. Env vars
    print(f"\n[1] SUPABASE_URL: {SUPABASE_URL!r}")
    print(f"[1] SUPABASE_KEY length: {len(SUPABASE_KEY)} chars")
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("\nFAIL: SUPABASE_URL or SUPABASE_KEY is empty. Check your .env file.")
        return 1

    # Detect key type
    if SUPABASE_KEY.startswith("sb_secret_"):
        print("[1] Key type: sb_secret_ (new secret key — bypasses RLS) OK")
    elif SUPABASE_KEY.startswith("sb_publishable_"):
        print("[1] Key type: sb_publishable_ (new publishable key — RLS applies)")
        print("    WARNING: publishable key will be blocked by RLS unless a policy allows inserts.")
    elif SUPABASE_KEY.startswith("eyJ"):
        try:
            import base64
            payload_b64 = SUPABASE_KEY.split(".")[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            payload = json.loads(base64.b64decode(payload_b64))
            role = payload.get("role", "unknown")
            print(f"[1] Key type: legacy JWT, role={role}")
            if role == "anon":
                print("    WARNING: 'anon' key — RLS will block inserts unless a policy allows it.")
            elif role == "service_role":
                print("    OK: service_role key bypasses RLS.")
        except Exception:
            print("[1] Key type: legacy JWT (could not decode payload)")
    else:
        print("[1] Key type: unknown format")

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    base = f"{SUPABASE_URL}/rest/v1"

    # 2. GET — can we read?
    print(f"\n[2] GET {base}/chat_logs?select=id&limit=1")
    try:
        r = httpx.get(f"{base}/chat_logs?select=id&limit=1", headers=headers, timeout=10)
        print(f"    Status: {r.status_code}")
        print(f"    Body:   {r.text[:300]}")
    except Exception as exc:
        print(f"    FAIL: {exc}")
        return 1

    # 3. POST — can we insert?
    print(f"\n[3] POST {base}/chat_logs  (inserting test row)")
    payload = {
        "ip": "127.0.0.1-diagnostic",
        "question": "DIAGNOSTIC TEST — delete me",
        "sources": json.dumps([{"page": 1, "score": 0.99}]),
    }
    try:
        r = httpx.post(f"{base}/chat_logs", headers=headers, json=payload, timeout=10)
        print(f"    Status: {r.status_code}")
        print(f"    Body:   {r.text[:500]}")
        if r.status_code in (200, 201):
            print("\nSUCCESS: insert worked. Refresh your Supabase table editor.")
            return 0
        print("\nFAIL: insert was rejected. See status + body above.")
        if r.status_code in (401, 403):
            print("  -> RLS or wrong key. Use service_role key OR add an INSERT policy.")
        elif r.status_code == 404:
            print("  -> Table 'chat_logs' not found, or SUPABASE_URL wrong.")
        elif r.status_code == 400:
            print("  -> Column mismatch. Check the table schema.")
        return 1
    except Exception as exc:
        print(f"    FAIL: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
