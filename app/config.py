import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
UPLOADS_DIR = DATA_DIR / "uploads"
PROCESSED_DIR = DATA_DIR / "processed"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DATA_DIR}/captures.db")

OIDC_ISSUER = os.getenv("OIDC_ISSUER", "https://auth.example.com/application/o/capture-viewer/")
OIDC_CLIENT_ID = os.getenv("OIDC_CLIENT_ID", "")
OIDC_REDIRECT_URI = os.getenv("OIDC_REDIRECT_URI", "https://capture.example.com/auth/callback")
OIDC_SCOPES = "openid profile email groups"

SESSION_SECRET = os.getenv("SESSION_SECRET", os.urandom(32).hex())
ADMIN_EMAILS = [e.strip() for e in os.getenv("ADMIN_EMAILS", "admin@example.com").split(",") if e.strip()]
ADMIN_GROUPS = [g.strip() for g in os.getenv("ADMIN_GROUPS", "authentik Admins").split(",") if g.strip()]

POTREE_CONVERTER_PATH = os.getenv("POTREE_CONVERTER_PATH", "/opt/PotreeConverter/PotreeConverter")
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(5 * 1024 * 1024 * 1024)))

SITE_TITLE = os.getenv("SITE_TITLE", "LiDAR Capture Viewer")
SITE_DESCRIPTION = os.getenv("SITE_DESCRIPTION", "Interactive 3D LiDAR point cloud viewer")

for d in [UPLOADS_DIR, PROCESSED_DIR, THUMBNAILS_DIR]:
    d.mkdir(parents=True, exist_ok=True)
