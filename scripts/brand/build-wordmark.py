#!/usr/bin/env python3
"""Gera scripts/brand/wordmark.json: contornos de "BL" e "BUSCAR" (Montserrat 800, levemente inclinado, no estilo da Sorte Tech).
Os contornos ficam guardados para o logo não depender de fonte instalada.
Uso: python3 scripts/brand/build-wordmark.py  (depois: python3 scripts/brand/build-logos.py)"""
import json, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
from fontTools.varLib import instancer
FONT = os.path.join(HERE, 'fonts/Montserrat-Variable.ttf')
f = instancer.instantiateVariableFont(TTFont(FONT), {'wght': 800})
SKEW = 0.17  # inclinação (itálico simulado)
gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f['hmtx']


def outline(text, tracking=0):
    pen = SVGPathPen(gs, ntos=lambda v: ('%g' % round(v, 1)))
    x = 0
    for ch in text:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (1, 0, SKEW, -1, x, 0)))
        x += hmtx[g][0] + tracking
    return pen.getCommands(), x - tracking


bl, bl_w = outline('BL', 10)
busc, busc_w = outline('BUSCAR', 8)
json.dump({'BL': bl, 'BL_w': bl_w, 'Buscar': busc, 'Buscar_w': busc_w, 'cap': f['OS/2'].sCapHeight}, open(os.path.join(HERE, 'wordmark.json'), 'w'))
print('ok', bl_w, busc_w)
