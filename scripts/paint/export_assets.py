"""Turn the two rendered masters into the files the site serves.

Run after `MODE=<mode> S=2 node scripts/paint/camelback.js` for each of light, golden, dark, night and monsoon:

    python scripts/paint/export_assets.py      # needs Pillow

The masters (4800x2400 PNG, about 22 MB each) stay in scripts/paint/out/, which git ignores.
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
MASTERS = HERE / "out"
ASSETS = HERE.parent.parent / "assets" / "painted"
WIDTHS = (2400, 1200)
# A piece of the morning master at one image pixel per screen pixel, for the write-up: the head's
# flank and the valley below it, where the tooth of the paper and the pencil hatching both show.
DETAIL_BOX = (2000, 860, 3200, 1535)


def save(image: Image.Image, stem: str) -> None:
    image.save(ASSETS / f"{stem}.webp", "WEBP", quality=80, method=6)
    image.save(ASSETS / f"{stem}.jpg", "JPEG", quality=82, optimize=True, progressive=True)
    print(f"{stem}: {(ASSETS / f'{stem}.webp').stat().st_size // 1024} KB webp, "
          f"{(ASSETS / f'{stem}.jpg').stat().st_size // 1024} KB jpg")


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    for name in ("morning", "golden", "dusk", "night", "monsoon"):
        master = Image.open(MASTERS / f"camelback-{name}.png").convert("RGB")
        for width in WIDTHS:
            save(master.resize((width, width // 2), Image.Resampling.LANCZOS), f"camelback-{name}-{width}")
        if name == "morning":
            save(master.crop(DETAIL_BOX), "camelback-detail")


if __name__ == "__main__":
    main()
