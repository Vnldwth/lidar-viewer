from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.auth import get_current_user
from app.config import PROCESSED_DIR, THUMBNAILS_DIR
from app.database import get_db
from app.models import Capture, CaptureAccess

router = APIRouter(prefix="/api/captures", tags=["captures"])


def _can_access(capture, user) -> bool:
    if capture.visibility == "public":
        return True
    if not user:
        return False
    if capture.visibility == "authenticated":
        return True
    if user.is_admin:
        return True
    return False


async def _check_private_access(capture_id: str, user, db: AsyncSession) -> bool:
    if not user:
        return False
    if user.is_admin:
        return True
    result = await db.execute(
        select(CaptureAccess).where(
            CaptureAccess.capture_id == capture_id,
            or_(
                CaptureAccess.user_email == user.email,
                CaptureAccess.group_name.in_(user.groups or []),
            ),
        )
    )
    return result.scalar_one_or_none() is not None


@router.get("")
async def list_captures(
    request: Request,
    tag: str = None,
    search: str = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    query = select(Capture).where(Capture.status == "ready")

    if user:
        if not user.is_admin:
            private_ids = select(CaptureAccess.capture_id).where(
                or_(
                    CaptureAccess.user_email == user.email,
                    CaptureAccess.group_name.in_(user.groups or []),
                )
            )
            query = query.where(
                or_(
                    Capture.visibility == "public",
                    Capture.visibility == "authenticated",
                    Capture.id.in_(private_ids),
                )
            )
    else:
        query = query.where(Capture.visibility == "public")

    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Capture.title.ilike(pattern),
                Capture.description.ilike(pattern),
                Capture.location_name.ilike(pattern),
            )
        )

    query = query.order_by(Capture.created_at.desc())
    result = await db.execute(query)
    captures = result.scalars().all()

    return [
        {
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "visibility": c.visibility,
            "capture_date": c.capture_date.isoformat() if c.capture_date else None,
            "location_name": c.location_name,
            "latitude": c.latitude,
            "longitude": c.longitude,
            "sensor_model": c.sensor_model,
            "point_count": c.point_count,
            "file_size": c.file_size,
            "tags": c.tags or [],
            "thumbnail_url": f"/api/captures/{c.id}/thumbnail"
            if c.thumbnail_path
            else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in captures
    ]


@router.get("/{capture_id}")
async def get_capture(
    capture_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(Capture).where(Capture.id == capture_id))
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    if not _can_access(capture, user):
        if capture.visibility == "private":
            if not await _check_private_access(capture_id, user, db):
                status = 401 if not user else 403
                raise HTTPException(status_code=status, detail="Access denied")
        else:
            raise HTTPException(status_code=401, detail="Login required")

    return {
        "id": capture.id,
        "title": capture.title,
        "description": capture.description,
        "visibility": capture.visibility,
        "status": capture.status,
        "capture_date": capture.capture_date.isoformat()
        if capture.capture_date
        else None,
        "location_name": capture.location_name,
        "latitude": capture.latitude,
        "longitude": capture.longitude,
        "sensor_model": capture.sensor_model,
        "point_count": capture.point_count,
        "file_size": capture.file_size,
        "tags": capture.tags or [],
        "original_format": capture.original_format,
        "thumbnail_url": f"/api/captures/{capture.id}/thumbnail"
        if capture.thumbnail_path
        else None,
        "potree_available": capture.potree_path is not None,
        "created_at": capture.created_at.isoformat() if capture.created_at else None,
        "updated_at": capture.updated_at.isoformat() if capture.updated_at else None,
    }


async def _enforce_access(capture, user, db):
    if _can_access(capture, user):
        return
    if capture.visibility == "private":
        if await _check_private_access(capture.id, user, db):
            return
    raise HTTPException(
        status_code=401 if not user else 403,
        detail="Access denied",
    )


@router.get("/{capture_id}/thumbnail")
async def get_thumbnail(
    capture_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(Capture).where(Capture.id == capture_id))
    capture = result.scalar_one_or_none()
    if not capture or not capture.thumbnail_path:
        raise HTTPException(status_code=404)

    await _enforce_access(capture, user, db)

    path = THUMBNAILS_DIR / capture.thumbnail_path
    if not path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="image/png")


@router.get("/{capture_id}/potree/{file_path:path}")
async def serve_potree_file(
    capture_id: str,
    file_path: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(Capture).where(Capture.id == capture_id))
    capture = result.scalar_one_or_none()
    if not capture or not capture.potree_path:
        raise HTTPException(status_code=404)

    await _enforce_access(capture, user, db)

    full_path = (PROCESSED_DIR / capture.potree_path / file_path).resolve()
    if not str(full_path).startswith(str(PROCESSED_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Path traversal denied")

    if not full_path.exists():
        raise HTTPException(status_code=404)

    media_types = {
        ".json": "application/json",
        ".bin": "application/octet-stream",
        ".js": "application/javascript",
    }
    return FileResponse(
        full_path,
        media_type=media_types.get(full_path.suffix.lower(), "application/octet-stream"),
    )
