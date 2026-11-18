#!/usr/bin/env python3
"""Gera as assinaturas vetoriais do BL Buscarr a partir do monograma e do lettering em curvas."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[1] / 'apps/web/public'
BRAND = PUBLIC / 'brand'
WORD = json.loads((HERE / 'wordmark.json').read_text())
NAME = 'BL Buscarr'
PINE = '#123A32'
INK = '#152D26'
SAGE = '#A9C4B6'
WHITE = '#F6F7F4'
MONOGRAM = 'M17 4H49C61 4 67 10 64 20C62 27 58 30 53 32C59 35 60 40 58 46C55 56 46 60 34 60H4ZM26 15L23 26H42C47 26 50 24 51 20C52 17 50 15 46 15ZM20 37L17 49H35C41 49 45 47 46 43C47 39 45 37 40 37ZM70 4H84L73 48H101L98 60H52C59 56 63 51 65 45C67 39 67 35 64 31Z'


def svg(width, height, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-label="{NAME}"><title>{NAME}</title>{body}</svg>\n'


def mark(color, transform=''):
    return f'<path fill="{color}" fill-rule="evenodd" transform="{transform}" d="{MONOGRAM}"/>'


def lettering(color, x, y, scale):
    return f'<path fill="{color}" transform="translate({x} {y}) scale({scale})" d="{WORD["Buscar"]}"/>'


def icon(maskable=False):
    radius = 0 if maskable else 55
    scale = 1.50 if maskable else 1.79
    x, y = (256 - 105 * scale) / 2, (256 - 64 * scale) / 2
    return svg(256, 256, f'<rect width="256" height="256" rx="{radius}" fill="{PINE}"/>' + mark(WHITE, f'translate({x} {y}) scale({scale})'))


for dark in (False, True):
    suffix = '-dark' if dark else ''
    word_color, mark_color = (WHITE, SAGE) if dark else (INK, PINE)
    width = round(118 + WORD['Buscar_w'] * .055 + 10)
    horizontal = svg(width, 64, mark(mark_color) + lettering(word_color, 118, 49, .055))
    vertical_width = round(WORD['Buscar_w'] * .049 + 14)
    vertical = svg(vertical_width, 118, mark(mark_color, f'translate({(vertical_width - 105 * .95) / 2} 3) scale(.95)') + lettering(word_color, 7, 103, .049))
    for kind, artwork in {'horizontal': horizontal, 'primary': horizontal, 'vertical': vertical, 'mark': svg(105, 64, mark(mark_color)), 'app-icon': icon()}.items():
        (BRAND / f'logo-{kind}{suffix}.svg').write_text(artwork)

(BRAND / 'logo-mono.svg').write_text(svg(105, 64, mark('#000000')))
(BRAND / 'logo-mono-white.svg').write_text(svg(105, 64, mark('#FFFFFF')))
for favicon in (PUBLIC / 'favicon.svg', BRAND / 'favicon.svg'):
    favicon.write_text(icon())
(HERE / '_icon-maskable.svg').write_text(icon(maskable=True))
