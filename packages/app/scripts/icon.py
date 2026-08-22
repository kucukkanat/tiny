"""Regenerates the PWA icons: a spark on the accent square. Run: python3 scripts/icon.py"""
import struct, zlib, pathlib

BG = (37, 99, 235)          # --color-accent in sRGB
FG = (255, 255, 255)
OUT = pathlib.Path(__file__).parent.parent / "public"

def coverage(size, inside, samples=3):
    """Per-pixel coverage of `inside(x, y)` over [-1, 1], supersampled."""
    step, rows = 2 / size, []
    for py in range(size):
        row = []
        for px in range(size):
            hits = sum(
                inside(-1 + (px + (sx + 0.5) / samples) * step, -1 + (py + (sy + 0.5) / samples) * step)
                for sy in range(samples) for sx in range(samples)
            )
            row.append(hits / samples**2)
        rows.append(row)
    return rows

def png(path, size):
    squircle = coverage(size, lambda x, y: abs(x) ** 4 + abs(y) ** 4 <= 1)
    spark = coverage(size, lambda x, y: abs(x / 0.62) ** 0.55 + abs(y / 0.62) ** 0.55 <= 1)
    raw = b""
    for py in range(size):
        raw += b"\x00"
        for px in range(size):
            a, s = squircle[py][px], spark[py][px]
            raw += bytes(round(BG[c] * (1 - s) + FG[c] * s) for c in range(3)) + bytes([round(a * 255)])

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )

for size in (192, 512):
    png(OUT / f"icon-{size}.png", size)
    print(f"wrote icon-{size}.png")
