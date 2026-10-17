"""Draws desktop/city_ai.ico (the app's taskbar/shortcut icon): a city skyline on a dark tile."""
from pathlib import Path
from PIL import Image, ImageDraw

S = 256
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((8, 8, S - 8, S - 8), radius=48, fill=(7, 11, 20, 255), outline=(59, 130, 246, 255), width=8)
towers = [(40, 150, 70), (78, 95, 104), (112, 55, 146), (154, 110, 182), (190, 140, 216)]
for x0, top, x1 in towers:
    d.rectangle((x0, top, x1, 208), fill=(30, 64, 175, 255))
    for y in range(top + 12, 200, 18):
        for x in range(x0 + 7, x1 - 6, 12):
            d.rectangle((x, y, x + 5, y + 7), fill=(103, 232, 249, 255))
d.polygon([(129, 22), (122, 55), (136, 55)], fill=(52, 211, 153, 255))  # spire
d.rectangle((28, 208, S - 28, 216), fill=(52, 211, 153, 255))
img.save(Path(__file__).with_name("city_ai.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("wrote city_ai.ico")
