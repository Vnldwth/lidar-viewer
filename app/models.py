import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, JSON,
)
from sqlalchemy.orm import relationship

from app.database import Base


def _now():
    return datetime.now(timezone.utc)


def _uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String)
    is_admin = Column(Boolean, default=False)
    groups = Column(JSON, default=list)
    created_at = Column(DateTime, default=_now)
    last_login = Column(DateTime, default=_now)

    captures = relationship("Capture", back_populates="owner")


class Capture(Base):
    __tablename__ = "captures"

    id = Column(String, primary_key=True, default=_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    visibility = Column(String, default="public")
    status = Column(String, default="pending")
    capture_date = Column(DateTime)
    location_name = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    sensor_model = Column(String, default="OS1-64")
    point_count = Column(Integer)
    file_size = Column(Integer)
    tags = Column(JSON, default=list)
    original_format = Column(String)
    original_filename = Column(String)
    potree_path = Column(String)
    thumbnail_path = Column(String)
    error_message = Column(Text)
    uploaded_by = Column(String, ForeignKey("users.id"))
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    owner = relationship("User", back_populates="captures")
    access_list = relationship(
        "CaptureAccess", back_populates="capture", cascade="all, delete-orphan",
    )


class CaptureAccess(Base):
    __tablename__ = "capture_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    capture_id = Column(String, ForeignKey("captures.id", ondelete="CASCADE"))
    user_email = Column(String)
    group_name = Column(String)
    created_at = Column(DateTime, default=_now)

    capture = relationship("Capture", back_populates="access_list")
