from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware

from app.auth import router as auth_router
from app.config import BASE_DIR, SESSION_SECRET
from app.database import init_db
from app.routers.admin import router as admin_router
from app.routers.captures import router as captures_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="LiDAR Capture Viewer", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    https_only=False,
)

app.include_router(auth_router)
app.include_router(captures_router)
app.include_router(admin_router)

frontend = BASE_DIR / "frontend"

for subdir in ("css", "js", "img"):
    path = frontend / subdir
    if path.exists():
        app.mount(f"/{subdir}", StaticFiles(directory=str(path)), name=subdir)

potree_dir = frontend / "potree"
if potree_dir.exists():
    app.mount("/potree", StaticFiles(directory=str(potree_dir)), name="potree")


@app.get("/")
async def index():
    return FileResponse(frontend / "index.html")


@app.get("/viewer/{capture_id}")
async def viewer(capture_id: str):
    return FileResponse(frontend / "viewer.html")


@app.get("/map")
async def map_page():
    return FileResponse(frontend / "map.html")


@app.get("/admin")
async def admin_page():
    return FileResponse(frontend / "admin.html")
