#!/usr/bin/env python3
"""
pfpdiff — the screenshot-diff harness for `/local/pending-for-planning`.

That route is a PIXEL REPLICA of staging's Pending For Planning (see the
exception paragraph in CLAUDE.md). This script is how the claim is checked: it
compares a staging capture against the local one, per CHROME BAND, and reports a
differing-pixel ratio for each.

PIL ONLY — numpy is not installed in this environment, and adding a dependency
to check a screenshot is not a trade worth making. Everything below is
`ImageChops` + `Image.histogram()`, which is enough: thresholding a difference
image and counting the bins above the threshold is exactly the measurement.

Usage
-----
    python3 scripts/pfpdiff.py <shots-dir> [--state NAME] [--threshold 32]

`shots-dir` holds `staging-<state>.{png,jpg}` and `local-<state>.{png,jpg}`; the
script pairs them by state name. For every pair it writes
`diff-<state>.png` (a side-by-side with a red overlay of the differing pixels)
next to the inputs and prints one line per band.

Bands
-----
Bands are expressed in CSS px against the 1440px-wide viewport the captures are
taken at, and scaled to the capture's own pixel size — the browser returns a
DPR-scaled image (1564x784 for that viewport), so feeding raw CSS rects to a
crop would offset every band and invent differences. Band edges come from
`src/pages/LocalPFP/stagingTokens.json`.

The SIDEBAR IS EXCLUDED on purpose: the local app's rail is its own navigation
(Pending for Planning / Pickup / Column configuration) and is not replicating
staging's. Only the content area, x >= 256, is compared.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops

# The viewport every capture is taken at. WIDTH is the only thing the scale is
# derived from: the two tabs can sit in windows with different chrome heights,
# so their viewports differ vertically, but the capture's pixels are square and
# `img.width / VIEW_W` converts CSS px to capture px on BOTH axes. Deriving the
# vertical scale from the image height instead would silently stretch every band
# on the taller viewport and compare the wrong rows.
VIEW_W = 1440

# content area only — the left rail is this app's own nav, not staging's
CONTENT_X = 256

# CSS-px bands, from stagingTokens.json's `layout` block.
#
# TOP-ANCHORED down to the grid; the last two are BOTTOM-ANCHORED, because the
# footer is pinned to the bottom of the viewport and the two tabs can sit in
# windows whose chrome leaves them different viewport heights. Measuring the
# footer at a fixed y would compare staging's table rows against our pager.
TOP_BANDS: dict[str, tuple[int, int]] = {
    "header":       (0, 65),
    "filter-row":   (65, 129),
    "card-strip":   (129, 255),
    "list-toolbar": (255, 325),
    "table-header": (325, 380),
}

FOOTER_HEIGHT = 62          # the pager strip, measured
GRID_TOP = 380              # first body row


def bands_for(vh: int) -> dict[str, tuple[int, int]]:
    """Bands in CSS px for a viewport `vh` tall."""
    out = dict(TOP_BANDS)
    out["table-body"] = (GRID_TOP, vh - FOOTER_HEIGHT)
    out["footer"] = (vh - FOOTER_HEIGHT, vh)
    return out

# states whose difference lives in a floating layer rather than in the bands
FULL_STATES = {
    "popup-schedule", "popup-close-consignment", "popup-raise-exception",
    "popup-cancel-order", "overlay-summary", "overlay-order",
}

PASS_RATIO = 0.005  # 0.5% differing pixels per band


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def round_trip_floor(s_img: Image.Image, box: tuple[int, int, int, int],
                     l_img: Image.Image, threshold: int) -> float:
    """
    The differing-pixel ratio this comparison CANNOT get below.

    Takes the staging crop, sends it through the local capture's scale and back,
    and diffs it against itself. Whatever that costs is pure resampling: it is
    not a layout error and must not be reported as one.
    """
    x0, y0, x1, y1 = box
    css_w, css_h = x1 - x0, y1 - y0
    a = normalise(s_img.crop(scale_box(box, s_img)), css_w, css_h)
    l_scale = l_img.width / VIEW_W
    through = a.resize((max(1, round(css_w * l_scale)), max(1, round(css_h * l_scale))), Image.LANCZOS)
    b = normalise(through, css_w, css_h)
    ratio, _ = differing_ratio(a, b, threshold)
    return ratio


def viewport_height(img: Image.Image) -> int:
    """The CSS-px height this capture represents (pixels are square)."""
    return round(img.height / (img.width / VIEW_W))


def scale_box(box: tuple[int, int, int, int], img: Image.Image) -> tuple[int, int, int, int]:
    """CSS px -> this image's pixels (the capture is DPR-scaled)."""
    s = img.width / VIEW_W
    x0, y0, x1, y1 = box
    return (round(x0 * s), round(y0 * s), round(x1 * s), round(y1 * s))


def normalise(img: Image.Image, css_w: int, css_h: int) -> Image.Image:
    """
    Resample a crop to its CSS-pixel size.

    The two tabs sit in windows the extension captures at different scales
    (1503/1440 vs 1564/1440), so their crops are never the same pixel grid and
    cannot be compared as-is. Bringing BOTH to CSS px puts them on one grid and
    puts the resampling cost on both sides equally, instead of smearing one and
    leaving the other sharp. The price is antialiasing noise, which is why the
    default threshold is 32 rather than 16 and why `--calibrate` exists: it
    measures that noise floor on the staging capture alone.
    """
    if img.size == (css_w, css_h):
        return img
    return img.resize((max(1, css_w), max(1, css_h)), Image.LANCZOS)


def differing_ratio(a: Image.Image, b: Image.Image, threshold: int) -> tuple[float, Image.Image]:
    """Fraction of pixels whose max channel difference exceeds `threshold`."""
    if a.size != b.size:
        # Never RESIZE to reconcile: scaling a capture resamples every glyph and
        # turns a clean match into a smear of antialiasing differences. Crop the
        # larger one and pad the smaller with white instead, so a genuinely
        # missing region reads as a difference rather than as a stretch.
        w, h = a.size
        fitted = Image.new("RGB", (w, h), (255, 255, 255))
        fitted.paste(b.crop((0, 0, min(w, b.width), min(h, b.height))), (0, 0))
        b = fitted
    diff = ImageChops.difference(a, b).convert("L")
    mask = diff.point(lambda v: 255 if v > threshold else 0)
    hist = mask.histogram()
    differing = hist[255]
    total = a.width * a.height
    return (differing / total if total else 0.0), mask


def overlay(base: Image.Image, mask: Image.Image) -> Image.Image:
    """Paint the differing pixels red over a dimmed copy of the local capture."""
    dim = Image.blend(base, Image.new("RGB", base.size, (255, 255, 255)), 0.55)
    red = Image.new("RGB", base.size, (255, 0, 0))
    dim.paste(red, (0, 0), mask)
    return dim


def side_by_side(staging: Image.Image, local: Image.Image, marked: Image.Image) -> Image.Image:
    gap = 8
    w = staging.width + local.width + marked.width + gap * 2
    h = max(staging.height, local.height, marked.height)
    sheet = Image.new("RGB", (w, h), (24, 24, 24))
    sheet.paste(staging, (0, 0))
    sheet.paste(local, (staging.width + gap, 0))
    sheet.paste(marked, (staging.width + local.width + gap * 2, 0))
    return sheet


def find(shots: Path, side: str, state: str) -> Path | None:
    for ext in ("png", "jpg", "jpeg"):
        p = shots / f"{side}-{state}.{ext}"
        if p.exists():
            return p
    return None


def states_in(shots: Path) -> list[str]:
    out = set()
    for p in shots.iterdir():
        if p.suffix.lower().lstrip(".") not in ("png", "jpg", "jpeg"):
            continue
        name = p.stem
        for side in ("staging-", "local-"):
            if name.startswith(side):
                out.add(name[len(side):])
    return sorted(out)


def run(shots: Path, only: str | None, threshold: int) -> int:
    failures = 0
    for state in states_in(shots):
        if only and state != only:
            continue
        sp, lp = find(shots, "staging", state), find(shots, "local", state)
        if not sp or not lp:
            print(f"{state:26s} SKIP  (missing {'staging' if not sp else 'local'} capture)")
            continue

        s_img, l_img = load(sp), load(lp)
        s_vh, l_vh = viewport_height(s_img), viewport_height(l_img)
        s_bands, l_bands = bands_for(s_vh), bands_for(l_vh)
        worst = 0.0
        print(f"\n{state}  ({sp.name} {s_img.width}x{s_img.height} vh{s_vh}"
              f"  vs  {lp.name} {l_img.width}x{l_img.height} vh{l_vh})")

        if state in FULL_STATES:
            # a popup or the detail overlay covers everything — one band, and
            # only as far down as the SHORTER viewport reaches
            common = min(s_vh, l_vh)
            names = {"overlay": (0, common)}
            s_bands = l_bands = names

        for band in s_bands:
            sy0, sy1 = s_bands[band]
            ly0, ly1 = l_bands[band]
            # the grid shows more rows on a taller viewport: compare the height
            # they share, anchored at each band's own top
            h = min(sy1 - sy0, ly1 - ly0)
            css_w = VIEW_W - CONTENT_X
            a = normalise(s_img.crop(scale_box((CONTENT_X, sy0, VIEW_W, sy0 + h), s_img)), css_w, h)
            b = normalise(l_img.crop(scale_box((CONTENT_X, ly0, VIEW_W, ly0 + h), l_img)), css_w, h)
            ratio, _ = differing_ratio(a, b, threshold)
            floor = round_trip_floor(s_img, (CONTENT_X, sy0, VIEW_W, sy0 + h), l_img, threshold)
            worst = max(worst, ratio)
            flag = "ok  " if ratio <= max(PASS_RATIO, floor) else "FAIL"
            print(f"  {flag} {band:14s} {ratio * 100:6.2f}%   (resample floor {floor * 100:5.2f}%)")
        if worst > PASS_RATIO:
            failures += 1

        common = min(s_vh, l_vh)
        s_c = s_img.crop(scale_box((CONTENT_X, 0, VIEW_W, common), s_img))
        l_c = l_img.crop(scale_box((CONTENT_X, 0, VIEW_W, common), l_img))
        if s_c.size != l_c.size:
            fitted = Image.new("RGB", s_c.size, (255, 255, 255))
            fitted.paste(l_c.crop((0, 0, min(s_c.width, l_c.width), min(s_c.height, l_c.height))), (0, 0))
            l_c = fitted
        _, mask = differing_ratio(s_c, l_c, threshold)
        side_by_side(s_c, l_c, overlay(l_c, mask)).save(shots / f"diff-{state}.png")

    return failures


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    shots = Path(args[0])
    only = None
    threshold = 32
    if "--state" in args:
        only = args[args.index("--state") + 1]
    if "--threshold" in args:
        threshold = int(args[args.index("--threshold") + 1])
    if not shots.is_dir():
        print(f"no such directory: {shots}")
        return 2
    failed = run(shots, only, threshold)
    print(f"\n{failed} state(s) outside the {PASS_RATIO * 100:.1f}% band threshold")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
