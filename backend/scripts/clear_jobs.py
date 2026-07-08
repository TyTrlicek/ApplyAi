"""Delete all rows from jobs and companies tables, preserving search_profiles and profiles."""
import sys
sys.path.insert(0, "/Users/tytrlicek/projects/ApplyAi/backend")

from app.db.session import get_session
from app.db.models import Job, Company

with get_session() as session:
    jobs_deleted = session.query(Job).delete()
    companies_deleted = session.query(Company).delete()

print(f"Deleted {jobs_deleted} jobs, {companies_deleted} companies.")
