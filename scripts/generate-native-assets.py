"""Render the existing four-tile FNRx mark for native app icons and splash."""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SLATE = "#19647E"
TEAL_LIGHT = "#8AE8DD"
WHITE = "#FFFFFF"
CANVAS = "#F8FAFA"


def mark(size: int, *, background: bool = True) -> Image.Image:
    scale = size / 192
    image = Image.new("RGBA", (size, size), SLATE if background else (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # Matches mobile/icon.svg; the OS supplies the final app-icon mask.
    for x, y, color in [(46, 46, WHITE), (104, 46, TEAL_LIGHT),
                        (46, 104, TEAL_LIGHT), (104, 104, WHITE)]:
        box = [round(v * scale) for v in (x, y, x + 42, y + 42)]
        draw.rounded_rectangle(box, radius=round(11 * scale), fill=color)
    return image


ios_icon = ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
mark(1024).convert("RGB").save(ios_icon)

for folder, size in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96),
                     ("xxhdpi", 144), ("xxxhdpi", 192)]:
    mipmap = ROOT / f"android/app/src/main/res/mipmap-{folder}"
    mark(size).save(mipmap / "ic_launcher.png")
    round_icon = mark(size)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    round_icon.putalpha(mask)
    round_icon.save(mipmap / "ic_launcher_round.png")
    # Adaptive icon foreground has transparent padding inside the safe zone.
    foreground = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inset = size // 6
    symbol = mark(size - inset * 2, background=False)
    foreground.alpha_composite(symbol, (inset, inset))
    foreground.save(mipmap / "ic_launcher_foreground.png")

background_color = ROOT / "android/app/src/main/res/values/ic_launcher_background.xml"
background_color.write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<resources>\n    <color name="ic_launcher_background">#19647E</color>\n</resources>\n'
)

for splash in (ROOT / "ios/App/App/Assets.xcassets/Splash.imageset").glob("splash-*.png"):
    with Image.open(splash) as old:
        size = old.size[0]
    image = Image.new("RGB", (size, size), CANVAS)
    logo_size = round(size * 0.25)
    tile = mark(logo_size).convert("RGB")
    image.paste(tile, ((size - logo_size) // 2, (size - logo_size) // 2))
    image.save(splash)

print("Generated FNRx iOS and Android icons and iOS splash artwork")
