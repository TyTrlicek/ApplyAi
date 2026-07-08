"""Non-destructive profile persistence smoke test.

Reads the current profile, writes a sentinel into a scratch key, reads it back,
then restores the original data exactly. Never touches real profile fields.

    cd backend && python scripts/test_profile_persistence.py
"""
import sys
sys.path.insert(0, "/Users/tytrlicek/projects/ApplyAi/backend")

from app.db.session import get_session
from app.db.repository import get_profile, upsert_profile

with get_session() as session:
    original = get_profile(session)

original_data = original if isinstance(original, dict) else (original or {})

# Write sentinel into a scratch key that doesn't exist in the real profile
test_data = {**original_data, "_persistence_test": "ok"}
with get_session() as session:
    result = upsert_profile(session, test_data)

assert result.get("_persistence_test") == "ok", "Write did not persist"

# Restore original immediately
with get_session() as session:
    upsert_profile(session, original_data)

# Verify restore
with get_session() as session:
    final = get_profile(session)

assert "_persistence_test" not in (final or {}), "Cleanup failed"
print("Profile persistence: OK (read → write → restore → verify all passed)")
