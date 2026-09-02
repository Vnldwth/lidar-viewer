import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.config import MAX_UPLOAD_SIZE, PROCESSED_DIR, THUMBNAILS_DIR, UPLOADS_DIR
from app.database import get_db
from app.models import Capture, CaptureAccess, User
from app.services.processing import process_capture

router = APIRouter(prefix="/api/admin", tags=["admin"])

ALLOWED_EXTENSIONS = {".las", ".laz", ".ply", ".pcd", ".xyz", ".pts", ".e57"}


@router.get("/stats")
async def stats(db: AsyncSession = Depends(get_db), user=Depends(require_admin)):
    async def _count(clause=None):
        q = select(func.count(Capture.id))
        if clause is not None:
            q = q.where(clause)
        return (await db.execute(q)).scalar() or 0

    return {
        "total_captures": await _count(),
        "ready_captures": await _count(Capture.status == "ready"),
        "processing_captures": await _count(Capture.status == "processing"),
        "public_captures": await _count(
            (Capture.visibility == "public") & (Capture.status == "ready"),
        ),
        "total_size": (await db.execute(select(func.sum(Capture.file_size)))).scalar()
        or 0,
        "total_points": (
            await db.execute(select(func.sum(Capture.point_count)))
        ).scalar()
        or 0,
        "total_users": (await db.execute(select(func.count(User.id)))).scalar() or 0,
    }


@router.get("/captures")
async def list_captures(
    db: AsyncSession = Depends(get_db), user=Depends(require_admin),
):
    result = await db.execute(
        select(Capture).order_by(Capture.created_at.desc()),
    )
    captures = result.scalars().all()

    out = []
    for c in captures:
        access = []
        if c.access_list:
            access = [
                {"user_email": a.user_email, "group_name": a.group_name}
                for a in c.access_list
            ]
        out.append(
            {
                "id": c.id,
                "title": c.title,
                "description": c.description,
                "visibility": c.visibility,
                "status": c.status,
                "capture_date": c.capture_date.isoformat()
                if c.capture_date
                else None,
                "location_name": c.location_name,
                "latitude": c.latitude,
                "longitude": c.longitude,
                "sensor_model": c.sensor_model,
                "point_count": c.point_count,
                "file_size": c.file_size,
                "tags": c.tags or [],
                "original_format": c.original_format,
                "original_filename": c.original_filename,
                "error_message": c.error_message,
                "thumbnail_url": f"/api/captures/{c.id}/thumbnail"
                if c.thumbnail_path
                else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                "access_list": access,
            }
        )
    return out


@router.post("/captures")
async def create_capture(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
    title: str = Form(...),
    description: str = Form(""),
    visibility: str = Form("public"),
    location_name: str = Form(None),
    latitude: float = Form(None),
    longitude: float = Form(None),
    sensor_model: str = Form("OS1-64"),
    capture_date: str = Form(None),
    tags: str = Form("[]"),
    file: UploadFile = File(...),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    capture_id = str(uuid.uuid4())
    upload_dir = UPLOADS_DIR / capture_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    upload_path = upload_dir / file.filename

    size = 0
    with open(upload_path, "wb") as f:
        while chunk := await file.read(65536):
            size += len(chunk)
            if size > MAX_UPLOAD_SIZE:
                shutil.rmtree(upload_dir, ignore_errors=True)
                raise HTTPException(status_code=413, detail="File too large")
            f.write(chunk)

    try:
        tag_list = json.loads(tags)
        if not isinstance(tag_list, list):
            tag_list = []
    except (json.JSONDecodeError, TypeError):
        tag_list = []

    cap_date = None
    if capture_date:
        try:
            cap_date = datetime.fromisoformat(capture_date)
        except ValueError:
            pass

    capture = Capture(
        id=capture_id,
        title=title,
        description=description,
        visibility=visibility,
        status="pending",
        location_name=location_name,
        latitude=latitude,
        longitude=longitude,
        sensor_model=sensor_model,
        capture_date=cap_date,
        tags=tag_list,
        original_format=ext.lstrip("."),
        original_filename=file.filename,
        file_size=size,
        uploaded_by=user.id,
    )
    db.add(capture)
    await db.commit()

    background_tasks.add_task(process_capture, capture_id)
    return {"id": capture_id, "status": "pending"}


@router.put("/captures/{capture_id}")
async def update_capture(
    capture_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
    title: str = Form(None),
    description: str = Form(None),
    visibility: str = Form(None),
    location_name: str = Form(None),
    latitude: float = Form(None),
    longitude: float = Form(None),
    sensor_model: str = Form(None),
    capture_date: str = Form(None),
    tags: str = Form(None),
    access_emails: str = Form(None),
    access_groups: str = Form(None),
):
    result = await db.execute(select(Capture).where(Capture.id == capture_id))
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404)

    if title is not None:
        capture.title = title
    if description is not None:
        capture.description = description
    if visibility is not None:
        capture.visibility = visibility
    if location_name is not None:
        capture.location_name = location_name
    if latitude is not None:
        capture.latitude = latitude
    if longitude is not None:
        capture.longitude = longitude
    if sensor_model is not None:
        capture.sensor_model = sensor_model
    if capture_date is not None:
        try:
            capture.capture_date = datetime.fromisoformat(capture_date)
        except ValueError:
            capture.capture_date = None
    if tags is not None:
        try:
            parsed = json.loads(tags)
            if isinstance(parsed, list):
                capture.tags = parsed
        except (json.JSONDecodeError, TypeError):
            pass

    if access_emails is not None or access_groups is not None:
        await db.execute(
            CaptureAccess.__table__.delete().where(
                CaptureAccess.capture_id == capture_id,
            )
        )
        if access_emails:
            for email in access_emails.split(","):
                email = email.strip()
                if email:
                    db.add(CaptureAccess(capture_id=capture_id, user_email=email))
        if access_groups:
            for group in access_groups.split(","):
                group = group.strip()
                if group:
                    db.add(CaptureAccess(capture_id=capture_id, group_name=group))

    capture.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.delete("/captures/{capture_id}")
async def delete_capture(
    capture_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    result = await db.execute(select(Capture).where(Capture.id == capture_id))
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404)

    upload_dir = UPLOADS_DIR / capture_id
    if upload_dir.exists():
        shutil.rmtree(upload_dir, ignore_errors=True)

    if capture.potree_path:
        potree_dir = PROCESSED_DIR / capture.potree_path
        if potree_dir.exists():
            shutil.rmtree(potree_dir, ignore_errors=True)

    if capture.thumbnail_path:
        thumb = THUMBNAILS_DIR / capture.thumbnail_path
        thumb.unlink(missing_ok=True)

    await db.delete(capture)
    await db.commit()
    return {"ok": True}


@router.post("/captures/{capture_id}/reprocess")
async def reprocess(
    capture_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    result = await db.execute(select(Capture).where(Capture.id == capture_id))
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404)

    capture.status = "pending"
    capture.error_message = None
    await db.commit()

    background_tasks.add_task(process_capture, capture_id)
    return {"ok": True}


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db), user=Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.last_login.desc()))
    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "is_admin": u.is_admin,
            "groups": u.groups or [],
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login": u.last_login.isoformat() if u.last_login else None,
        }
        for u in result.scalars().all()
    ]
