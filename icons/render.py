import os, subprocess, struct, sys
from PIL import Image

ROOT = os.environ.get("ICON_ROOT", os.path.dirname(os.path.abspath(__file__)))
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SVG_MASTER = os.path.join(ROOT, "svg", "icon-master.svg")
SVG_SMALL = os.path.join(ROOT, "svg", "icon-small.svg")
PNG_DIR = os.path.join(ROOT, "png")
TMP = os.path.join(ROOT, ".tmp")
os.makedirs(PNG_DIR, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

SVG_SIZE = 1024
SS = 4  # supersample factor


def render(svg_path, out_png, px):
    render_px = px * SS
    svg = open(svg_path, encoding="utf-8").read()
    svg = svg.replace('width="1024" height="1024"', f'width="{render_px}" height="{render_px}"', 1)
    html = ("<!doctype html><html><head><meta charset='utf-8'><style>"
            "html,body{margin:0;padding:0;background:transparent;overflow:hidden}"
            f"svg{{display:block;width:{render_px}px;height:{render_px}px}}"
            "</style></head><body>" + svg + "</body></html>")
    hp = os.path.join(TMP, f"r{px}.html")
    open(hp, "w", encoding="utf-8").write(html)
    raw = os.path.join(TMP, f"r{px}.png")
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
           "--default-background-color=00000000", "--no-sandbox",
           "--force-device-scale-factor=1",
           f"--window-size={render_px},{render_px}",
           f"--screenshot={raw}",
           "file:///" + hp.replace("\\", "/")]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                   timeout=120)
    im = Image.open(raw).convert("RGBA")
    if im.size != (render_px, render_px):
        im = im.crop((0, 0, render_px, render_px))
    if render_px != px:
        im = im.resize((px, px), Image.LANCZOS)
    im.save(out_png, "PNG", optimize=True)
    return im


sizes = [
    (512, SVG_MASTER), (256, SVG_MASTER), (128, SVG_MASTER), (64, SVG_MASTER),
    (48, SVG_MASTER), (32, SVG_SMALL), (24, SVG_SMALL), (16, SVG_SMALL),
]
made = {}
for px, svg in sizes:
    p = os.path.join(PNG_DIR, f"icon-{px}.png")
    render(svg, p, px)
    made[px] = p
    print("rendered", px)

# 1024 master preview (from master svg, 2x supersample)
render(SVG_MASTER, os.path.join(PNG_DIR, "icon-1024.png"), 1024)

# ---------- build multi-size .ico (PNG-compressed entries) ----------
ico_sizes = [256, 128, 64, 48, 32, 24, 16]
blobs = [open(made[s], "rb").read() for s in ico_sizes]
n = len(blobs)
header = struct.pack("<HHH", 0, 1, n)
offset = 6 + 16 * n
entries = b""
for s, b in zip(ico_sizes, blobs):
    w = 0 if s == 256 else s
    entries += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(b), offset)
    offset += len(b)
ico_path = os.path.join(ROOT, "octodesk.ico")
open(ico_path, "wb").write(header + entries + b"".join(blobs))
print("ico ->", ico_path, os.path.getsize(ico_path), "bytes")
