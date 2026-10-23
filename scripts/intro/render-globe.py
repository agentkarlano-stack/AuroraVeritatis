"""Renders the closing globe shot of the cinematic intro (docs/INTRO.md).

NASA Black Marble 2016 night lights (public domain, NASA Earth Observatory) on an orthographic globe that turns slowly
eastwards, with thin gold great-circle arcs between financial centres drawing themselves in. Output: PNG frames.

    python3 scripts/intro/render-globe.py <texture.jpg> <out_dir> <width> <height> [frames=80]
"""
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

tex_path, out_dir, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
FRAMES = int(sys.argv[5]) if len(sys.argv) > 5 else 80

tex = np.asarray(Image.open(tex_path).convert('RGB'), dtype=np.float32) / 255.0
TH, TW, _ = tex.shape
# Brand grade: keep the lights warm (gold/platinum), quieten the blue oceans.
lum = tex @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
gold = np.array([1.0, 0.80, 0.50], dtype=np.float32)
graded = np.clip(lum[..., None] ** 1.1 * gold * 1.6 + tex * 0.15, 0, 1)

SUPER = 2  # supersampling for the arc layer only; the sphere edge is antialiased analytically
w, h = W, H
R = min(w, h) * (0.36 if w >= h else 0.44)
cx, cy = w / 2, h / 2
ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
nx, ny = (xs - cx) / R, -(ys - cy) / R
r2 = nx**2 + ny**2
inside = r2 <= 1.0
edge = np.clip((1 - np.sqrt(r2)) * R, 0, 1)[..., None]  # 1 px antialiased limb
nz = np.sqrt(np.clip(1 - r2, 0, 1))

CITIES = {
    'London': (51.51, -0.13), 'New York': (40.71, -74.0), 'Tokyo': (35.68, 139.69), 'Dubai': (25.2, 55.27),
    'Singapore': (1.29, 103.85), 'Frankfurt': (50.11, 8.68), 'Budapest': (47.5, 19.04), 'Hong Kong': (22.32, 114.17),
}
ROUTES = [('London', 'New York'), ('London', 'Dubai'), ('Frankfurt', 'Singapore'), ('Budapest', 'Tokyo'), ('Dubai', 'Hong Kong'), ('New York', 'Frankfurt')]


def rot(lat0, lon0):
    """Rotation taking view coordinates to world coordinates (centre at lat0, lon0)."""
    la, lo = math.radians(lat0), math.radians(lon0)
    rx = np.array([[1, 0, 0], [0, math.cos(la), math.sin(la)], [0, -math.sin(la), math.cos(la)]])
    ry = np.array([[math.cos(lo), 0, math.sin(lo)], [0, 1, 0], [-math.sin(lo), 0, math.cos(lo)]])
    return ry @ rx


def to_vec(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    return np.array([math.cos(la) * math.sin(lo), math.sin(la), math.cos(la) * math.cos(lo)])


def slerp(a, b, t):
    om = math.acos(max(-1, min(1, float(a @ b))))
    return a if om < 1e-6 else (math.sin((1 - t) * om) * a + math.sin(t * om) * b) / math.sin(om)


def frame(i):
    p = i / max(1, FRAMES - 1)
    ease = 0.5 - 0.5 * math.cos(math.pi * p)
    lat0, lon0 = 24.0, 18.0 + 22.0 * ease  # over Europe and the Middle East, turning east
    M = rot(lat0, lon0)
    v = np.stack([nx, ny, nz], axis=-1) @ M.T  # view → world
    lat = np.degrees(np.arcsin(np.clip(v[..., 1], -1, 1)))
    lon = np.degrees(np.arctan2(v[..., 0], v[..., 2]))
    u = (lon + 180) / 360 * (TW - 1)
    t = (90 - lat) / 180 * (TH - 1)
    u0, t0 = np.floor(u).astype(int), np.floor(t).astype(int)
    du, dt = (u - u0)[..., None], (t - t0)[..., None]
    u1, t1 = (u0 + 1) % TW, np.clip(t0 + 1, 0, TH - 1)
    u0, t0 = u0 % TW, np.clip(t0, 0, TH - 1)
    col = (graded[t0, u0] * (1 - du) * (1 - dt) + graded[t0, u1] * du * (1 - dt) + graded[t1, u0] * (1 - du) * dt + graded[t1, u1] * du * dt)
    shade = (0.35 + 0.65 * nz[..., None] ** 0.6)  # soft limb darkening
    img = np.zeros((h, w, 3), np.float32)
    bg = np.array([0.055, 0.051, 0.047], np.float32)  # warm charcoal
    img[:] = bg
    img = img * (1 - edge) + np.where(inside[..., None], col * shade, 0) * edge
    # Thin atmosphere rim in platinum-gold.
    rr = np.sqrt(r2)
    rim = np.where(rr > 0.995, np.exp(-((rr - 1.0) ** 2) / 0.0012) * 0.16, np.exp(-((rr - 1.0) ** 2) / 0.00015) * 0.10)
    img += rim[..., None] * np.array([0.95, 0.86, 0.68], np.float32)
    # Faint vignette towards the frame edges.
    vig = 1 - 0.35 * np.clip(((xs - cx) ** 2 + (ys - cy) ** 2) / (0.6 * w) ** 2, 0, 1)
    img *= vig[..., None]
    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))

    # Gold arcs that draw themselves in, front hemisphere only.
    layer = Image.new('RGBA', (w * SUPER, h * SUPER), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    Minv = M  # world → view is M.T applied as v @ M
    for k, (a, b) in enumerate(ROUTES):
        start = 0.08 + k * 0.09
        grow = min(1.0, max(0.0, (p - start) / 0.45))
        if grow <= 0:
            continue
        va, vb = to_vec(*CITIES[a]), to_vec(*CITIES[b])
        pts = []
        n = 90
        for j in range(int(n * grow) + 1):
            s = j / n
            q = slerp(va, vb, s) * (1 + 0.045 * math.sin(math.pi * s))  # lift the arc above the surface
            vq = q @ Minv
            if vq[2] < 0.06:
                pts.append(None)
                continue
            pts.append(((cx + vq[0] * R) * SUPER, (cy - vq[1] * R) * SUPER))
        seg = []
        for pt in pts + [None]:
            if pt is None:
                if len(seg) > 1:
                    d.line(seg, fill=(201, 163, 90, 190), width=max(1, int(1.9 * SUPER)))
                seg = []
            else:
                seg.append(pt)
    for name, (la, lo) in CITIES.items():
        vq = to_vec(la, lo) @ Minv
        if vq[2] > 0.05:
            x, y = (cx + vq[0] * R) * SUPER, (cy - vq[1] * R) * SUPER
            rr = 2.0 * SUPER
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(241, 240, 236, 200))
    layer = layer.resize((w, h), Image.LANCZOS)
    glow = layer.filter(ImageFilter.GaussianBlur(3))
    out = out.convert('RGBA')
    out.alpha_composite(glow)
    out.alpha_composite(layer)
    out = out.convert('RGB')
    out.save(f'{out_dir}/g{i:04d}.png')


for i in range(FRAMES):
    frame(i)
print(f'{FRAMES} frames {W}x{H}')
