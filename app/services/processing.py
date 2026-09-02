import asyncio
import json
import logging
from pathlib import Path

import numpy as np
from PIL import Image
from sqlalchemy import select

from app.config import POTREE_CONVERTER_PATH, PROCESSED_DIR, THUMBNAILS_DIR, UPLOADS_DIR
from app.database import async_session
from app.models import Capture

logger = logging.getLogger(__name__)


async def process_capture(capture_id: str):
    async with async_session() as db:
        result = await db.execute(select(Capture).where(Capture.id == capture_id))
        capture = result.scalar_one_or_none()
        if not capture:
            return

        capture.status = "processing"
        await db.commit()

        try:
            upload_dir = UPLOADS_DIR / capture_id
            input_file = _find_input(upload_dir)
            if not input_file:
                raise FileNotFoundError("No point cloud file found in upload")

            output_dir = PROCESSED_DIR / capture_id
            output_dir.mkdir(parents=True, exist_ok=True)

            await _run_potree_converter(input_file, output_dir)

            metadata_file = output_dir / "metadata.json"
            if metadata_file.exists():
                with open(metadata_file) as f:
                    meta = json.load(f)
                capture.point_count = meta.get("points", 0)

            thumb_name = f"{capture_id}.png"
            _generate_thumbnail(input_file, THUMBNAILS_DIR / thumb_name)
            capture.thumbnail_path = thumb_name
            capture.potree_path = capture_id
            capture.status = "ready"
            capture.error_message = None

        except Exception as exc:
            logger.exception("Failed to process capture %s", capture_id)
            capture.status = "error"
            capture.error_message = str(exc)

        await db.commit()


def _find_input(upload_dir: Path) -> Path | None:
    exts = {".las", ".laz", ".ply", ".pcd", ".xyz", ".pts", ".e57"}
    for f in upload_dir.iterdir():
        if f.suffix.lower() in exts:
            return f
    return None


async def _run_potree_converter(input_file: Path, output_dir: Path):
    cmd = [POTREE_CONVERTER_PATH, str(input_file), "-o", str(output_dir)]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"PotreeConverter exited {proc.returncode}: {stderr.decode(errors='replace')}"
        )


def _generate_thumbnail(input_file: Path, output_path: Path, size: int = 400):
    try:
        x, y, z, intensity = _read_points(input_file)
        if x is None or len(x) == 0:
            _placeholder(output_path, size)
            return

        if len(x) > 500_000:
            idx = np.random.default_rng(42).choice(len(x), 500_000, replace=False)
            x, y, z = x[idx], y[idx], z[idx]

        x_min, x_max = x.min(), x.max()
        y_min, y_max = y.min(), y.max()
        z_min, z_max = z.min(), z.max()
        x_range = max(x_max - x_min, 1e-6)
        y_range = max(y_max - y_min, 1e-6)

        margin = int(size * 0.05)
        inner = size - 2 * margin
        px = (((x - x_min) / x_range) * (inner - 1) + margin).astype(np.int32)
        py = (((y - y_min) / y_range) * (inner - 1) + margin).astype(np.int32)
        py = size - 1 - py

        z_norm = (z - z_min) / max(z_max - z_min, 1e-6)

        img = np.full((size, size, 3), 18, dtype=np.uint8)
        colors = _height_colormap(z_norm)

        valid = (px >= 0) & (px < size) & (py >= 0) & (py < size)
        img[py[valid], px[valid]] = colors[valid]

        Image.fromarray(img).save(str(output_path))
    except Exception:
        logger.warning("Thumbnail generation failed for %s", input_file, exc_info=True)
        _placeholder(output_path, size)


def _read_points(path: Path):
    ext = path.suffix.lower()
    if ext in (".las", ".laz"):
        import laspy
        las = laspy.read(str(path))
        return (
            np.asarray(las.x),
            np.asarray(las.y),
            np.asarray(las.z),
            np.asarray(las.intensity) if hasattr(las, "intensity") else None,
        )
    if ext == ".ply":
        from plyfile import PlyData
        ply = PlyData.read(str(path))
        v = ply["vertex"]
        return (
            np.asarray(v["x"]),
            np.asarray(v["y"]),
            np.asarray(v["z"]),
            np.asarray(v["intensity"]) if "intensity" in v else None,
        )
    return None, None, None, None


def _height_colormap(z_norm: np.ndarray) -> np.ndarray:
    stops = np.array([
        [0.0, 30, 60, 180],
        [0.25, 0, 200, 255],
        [0.5, 0, 220, 100],
        [0.75, 220, 245, 40],
        [1.0, 255, 80, 20],
    ])
    colors = np.zeros((len(z_norm), 3), dtype=np.uint8)
    for i in range(len(stops) - 1):
        lo, hi = stops[i, 0], stops[i + 1, 0]
        mask = (z_norm >= lo) & (z_norm < hi) if i < len(stops) - 2 else (z_norm >= lo)
        if not mask.any():
            continue
        t = (z_norm[mask] - lo) / (hi - lo)
        for ch in range(3):
            colors[mask, ch] = (
                stops[i, ch + 1] + t * (stops[i + 1, ch + 1] - stops[i, ch + 1])
            ).astype(np.uint8)
    return colors


def _placeholder(path: Path, size: int = 400):
    img = Image.new("RGB", (size, size), (18, 18, 24))
    img.save(str(path))
