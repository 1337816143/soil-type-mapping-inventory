"""Remove the original CAU logo's white matte without redrawing any lettering.

Usage: python scripts/build-transparent-logo.py
The JPEG is preserved. White compositing of the PNG reconstructs the source ink.
"""
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/logo.jpg'
TARGET = ROOT / 'assets/cau-logo-transparent.png'

def build():
    source = Image.open(SOURCE).convert('RGB')
    pixels = []
    for rgb in source.getdata():
        alpha = 255 - min(rgb)
        if alpha <= 5:
            pixels.append((0, 0, 0, 0))
        else:
            ink = tuple(max(0, min(255, round((v - (255 - alpha)) * 255 / alpha))) for v in rgb)
            pixels.append((*ink, alpha))
    rgba = Image.new('RGBA', source.size)
    rgba.putdata(pixels)
    bounds = rgba.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
    if not bounds:
        raise ValueError('No logo ink found')
    x0, y0, x1, y1 = bounds
    bounds = (max(0, x0-10), max(0, y0-10), min(source.width, x1+10), min(source.height, y1+10))
    rgba = rgba.crop(bounds)
    white = Image.new('RGBA', rgba.size, 'white')
    composite = Image.alpha_composite(white, rgba).convert('RGB')
    difference = ImageChops.difference(composite, source.crop(bounds))
    assert max(v[1] for v in difference.getextrema()) <= 5, 'Source lettering changed'
    assert rgba.getpixel((0, 0))[3] == 0, 'White matte was not removed'
    rgba.save(TARGET, optimize=True)
    print(f'CAU transparent asset verified: {rgba.width} x {rgba.height}; original JPEG unchanged')

if __name__ == '__main__':
    build()
