"""Prepare the supplied event photos and video for the site.

Usage: python scripts/process_media.py "<folder holding the original files>"

Writes web-sized WebP/JPEG/MP4 files to images/events/. Camera metadata (EXIF, including
any location data) is deliberately not carried over. Needs Pillow, opencv-python and
imageio-ffmpeg (pip install pillow opencv-python-headless imageio-ffmpeg).
"""
from pathlib import Path
import io
import subprocess
import sys

import cv2
import imageio_ffmpeg
from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'images' / 'events'
Image.MAX_IMAGE_PIXELS = 200_000_000  # camera originals are large (~42 MP); keep a guard against decompression bombs

# (original file name, output name, width of the main WebP in px)
PHOTOS = (
    ('R6M25496.JPG', 'gala-podium', 1800),
    ('R6M25978.JPG', 'gala-degree', 1800),
    ('R6M26114.JPG', 'gala-birthday', 1800),
    ('星域 x VYBE Event-145.JPEG', 'vybe-event', 1800),
    ('CSR Event-165.jpg', 'csr-portrait', 1200),
)
PRESS_PORTRAIT = ('CSR Event-165.jpg', 'csr-portrait-press.jpg', 2000)
VIDEO = ('420b63555364dac5015816d171d01405.mp4', 'gala-reel.mp4')
SOCIAL_NAME = 'gala-podium-og.jpg'
SOCIAL_SIZE = (1200, 630)
POSTER_NAME = 'gala-reel-poster.webp'
POSTER_SECONDS = 19.6  # the birthday-celebration stage with confetti
POSTER_WIDTH = 1280
SMALL_WIDTH = 640
WEBP_QUALITY = 82
JPEG_QUALITY = 88
VIDEO_CRF = '31'  # x264 quality: higher is smaller; 31 keeps 720p acceptable at a mobile-friendly size


def load_upright(path: Path) -> Image.Image:
    """Open an image, apply its orientation tag, and return plain RGB pixels (no metadata)."""
    with Image.open(path) as source:
        upright = ImageOps.exif_transpose(source)
        profile = upright.info.get('icc_profile')
        if profile:  # convert to sRGB so colours survive dropping the embedded profile
            upright = ImageCms.profileToProfile(upright, ImageCms.ImageCmsProfile(io.BytesIO(profile)), ImageCms.createProfile('sRGB'), outputMode='RGB')
        return upright.convert('RGB')


def resized(image: Image.Image, width: int) -> Image.Image:
    if image.width <= width:
        return image
    return image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)


def write_photo(source: Path, name: str, width: int) -> None:
    image = load_upright(source)
    main = resized(image, width)
    main.save(OUT / f'{name}.webp', 'WEBP', quality=WEBP_QUALITY, method=6)
    resized(image, SMALL_WIDTH).save(OUT / f'{name}-640.webp', 'WEBP', quality=WEBP_QUALITY, method=6)
    print(f'{name}: {main.width}x{main.height}')


def write_press_portrait(source: Path, name: str, width: int) -> None:
    resized(load_upright(source), width).save(OUT / name, 'JPEG', quality=JPEG_QUALITY, optimize=True)
    print(f'{name}: ok')


def write_social_image(source: Path) -> None:
    """1200x630 JPEG for link previews (WebP is not read by every social crawler)."""
    image = resized(load_upright(source), SOCIAL_SIZE[0])
    top = max(0, (image.height - SOCIAL_SIZE[1]) // 2)
    image.crop((0, top, SOCIAL_SIZE[0], top + SOCIAL_SIZE[1])).save(OUT / SOCIAL_NAME, 'JPEG', quality=JPEG_QUALITY, optimize=True)
    print(f'{SOCIAL_NAME}: ok')


def write_poster(source: Path) -> None:
    capture = cv2.VideoCapture(str(source))
    capture.set(cv2.CAP_PROP_POS_MSEC, POSTER_SECONDS * 1000)
    found, frame = capture.read()
    capture.release()
    if not found:
        raise RuntimeError(f'Could not read a frame at {POSTER_SECONDS}s from {source.name}')
    image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    resized(image, POSTER_WIDTH).save(OUT / POSTER_NAME, 'WEBP', quality=WEBP_QUALITY, method=6)
    print(f'{POSTER_NAME}: ok')


def write_video(source: Path, name: str) -> None:
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', '-i', str(source),
        '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', VIDEO_CRF, '-preset', 'slow',
        '-map_metadata', '-1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', str(OUT / name),
    ]
    subprocess.run(command, check=True)
    print(f'{name}: {(OUT / name).stat().st_size / 1_000_000:.1f} MB')


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    folder = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    for file_name, name, width in PHOTOS:
        write_photo(folder / file_name, name, width)
    portrait_source, portrait_name, portrait_width = PRESS_PORTRAIT
    write_press_portrait(folder / portrait_source, portrait_name, portrait_width)
    write_social_image(folder / PHOTOS[0][0])
    write_poster(folder / VIDEO[0])
    write_video(folder / VIDEO[0], VIDEO[1])


if __name__ == '__main__':
    main()
