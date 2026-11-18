#!/usr/bin/env python3
"""Gera os SVGs da marca BL Buscar (lupa com "BL" dentro + nome em contornos).

A paleta vem de PALETA abaixo (verde + dourado). Para trocar a identidade visual, ajuste PALETA, o desenho em mark()
e rode de novo. O nome é desenhado em contornos (Montserrat 800 inclinado, guardados em wordmark.json, gerado por
build-wordmark.py), então o logo não depende de fonte instalada.
Uso: python3 scripts/brand/build-logos.py  → apps/web/public/brand/*.svg e apps/web/public/favicon.svg
Depois: node scripts/brand/rasterize.mjs gera os PNGs (ícones PWA, apple-touch, OG) e as capas."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, '../../apps/web/public')
OUT = os.path.join(PUB, 'brand')
os.makedirs(OUT, exist_ok=True)
W = json.load(open(os.path.join(HERE, 'wordmark.json')))

NOME = 'BL Buscar'
PALETA = {
    'night': '#04140D',        # fundo escuro
    'ink': '#0A2418',          # texto/linha sobre fundo claro
    'green_a': '#0B7A43',      # verde principal (claro)
    'green_b': '#22A862',      # verde do degradê (claro)
    'green_a_d': '#1FA25C',    # verde sobre fundo escuro
    'green_b_d': '#4CCB86',
    'gold': '#F2B705',         # dourado (cabo da lupa)
    'gold_d': '#FFC933',
    'lens': '#E3F5EA',         # vidro da lupa (claro)
}
CAP = W['cap']


def grad(gid, dark):
    a, b = (PALETA['green_a_d'], PALETA['green_b_d']) if dark else (PALETA['green_a'], PALETA['green_b'])
    return f'<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'


def letters_bl(fill, cx, cy, cap_h):
    """"BL" centralizado em (cx, cy), com a altura de maiúscula cap_h."""
    s = cap_h / CAP
    x = cx - W['BL_w'] * s / 2
    y = cy + cap_h / 2
    return f'<path transform="translate({x:.2f},{y:.2f}) scale({s:.5f})" d="{W["BL"]}" fill="{fill}"/>'


def mark(ink, gid, dark):
    """Marca 190x172: lupa (aro em degradê verde, cabo dourado) com "BL" dentro do vidro."""
    gold = PALETA['gold_d'] if dark else PALETA['gold']
    lens = 'rgba(255,255,255,.08)' if dark else PALETA['lens']
    return f'''<circle cx="80" cy="78" r="51" fill="{lens}"/>
<path d="M126 124 L170 160" stroke="{gold}" stroke-width="22" stroke-linecap="round" fill="none"/>
<circle cx="80" cy="78" r="58" fill="none" stroke="url(#{gid})" stroke-width="14"/>
{letters_bl(ink, 80, 78, 38)}'''


def word(ink, gid, sc, dark):
    """Nome "BL Buscar" na linha de base (0,0): "BL" em degradê, "BUSCAR" na cor do texto."""
    gap = 150
    return (f'<g transform="scale({sc})"><path d="{W["BL"]}" fill="url(#{gid})"/>'
            f'<path transform="translate({W["BL_w"] + gap},0)" d="{W["Buscar"]}" fill="{ink}"/></g>'), (W['BL_w'] + gap + W['Buscar_w']) * sc


def svg(vb, body, defs, label=NOME):
    w, h = vb.split()[2:]
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{float(w):.0f}" height="{float(h):.0f}" role="img" aria-label="{label}"><title>{label}</title><defs>{defs}</defs>{body}</svg>\n'


def variant(kind, dark):
    ink = '#FFFFFF' if dark else PALETA['ink']
    t = 'd' if dark else 'l'
    gid = f'g{t}'
    defs = grad(gid, dark)
    if kind == 'mark':
        return svg('0 0 190 172', mark(ink, gid, dark), defs)
    if kind == 'horizontal':
        ms, sc = 0.74, 0.075
        mw, mh = 190 * ms, 172 * ms
        wd, ww = word(ink, gid, sc, dark)
        x0 = mw + 16
        base = mh * 0.46 + CAP * sc / 2
        body = f'<g transform="scale({ms})">{mark(ink, gid, dark)}</g><g transform="translate({x0:.1f},{base:.1f})">{wd}</g>'
        return svg(f'0 0 {x0 + ww + 10:.0f} {mh:.0f}', body, defs)
    if kind == 'vertical':
        sc = 0.085
        wd, ww = word(ink, gid, sc, dark)
        total = max(ww, 190)
        base = 172 + 14 + CAP * sc
        body = (f'<g transform="translate({(total - 190) / 2:.1f},0)">{mark(ink, gid, dark)}</g>'
                f'<g transform="translate({(total - ww) / 2:.1f},{base:.1f})">{wd}</g>')
        return svg(f'0 0 {total + 8:.0f} {base + 10:.0f}', body, defs)
    raise ValueError(kind)


def app_icon(pad=0.0, radius=56):
    """Ícone quadrado 256: fundo verde-escuro + marca centralizada (pad = recuo extra para ícone maskable)."""
    gid = 'gi'
    s = (172 - pad * 2) / 190
    tx, ty = (256 - 190 * s) / 2, (256 - 172 * s) / 2
    body = (f'<rect width="256" height="256" rx="{radius}" fill="{PALETA["night"]}"/>'
            f'<rect width="256" height="256" rx="{radius}" fill="url(#bg)"/>'
            f'<g transform="translate({tx:.1f},{ty:.1f}) scale({s:.4f})">{mark("#FFFFFF", gid, True)}</g>')
    defs = grad(gid, True) + f'<radialGradient id="bg" cx=".75" cy=".1" r=".9"><stop offset="0" stop-color="{PALETA["green_b_d"]}" stop-opacity=".40"/><stop offset="1" stop-color="{PALETA["green_b_d"]}" stop-opacity="0"/></radialGradient>'
    return svg('0 0 256 256', body, defs)


def mono(color):
    gid = 'gm'
    defs = f'<linearGradient id="{gid}"><stop offset="0" stop-color="{color}"/><stop offset="1" stop-color="{color}"/></linearGradient>'
    body = (f'<circle cx="80" cy="78" r="58" fill="none" stroke="url(#{gid})" stroke-width="14"/>'
            f'<path d="M126 124 L170 160" stroke="{color}" stroke-width="22" stroke-linecap="round" fill="none"/>'
            + letters_bl(color, 80, 78, 38))
    return svg('0 0 190 172', body, defs)


def favicon():
    """Favicon legível em 16px: lupa com "BL" sobre fundo verde-escuro."""
    gid = 'gf'
    defs = grad(gid, True)
    body = (f'<rect width="64" height="64" rx="14" fill="{PALETA["night"]}"/>'
            f'<circle cx="27" cy="27" r="16" fill="none" stroke="url(#{gid})" stroke-width="6.5"/>'
            f'<path d="M39 39 L52 52" stroke="{PALETA["gold_d"]}" stroke-width="8.5" stroke-linecap="round"/>'
            + letters_bl('#FFFFFF', 27, 27, 12))
    return svg('0 0 64 64', body, defs)


files = {}
for k in ['horizontal', 'vertical', 'mark']:
    files[f'logo-{k}.svg'] = variant(k, False)
    files[f'logo-{k}-dark.svg'] = variant(k, True)
files['logo-app-icon.svg'] = app_icon()
files['logo-app-icon-dark.svg'] = app_icon()
files['logo-mono.svg'] = mono(PALETA['ink'])
files['logo-mono-white.svg'] = mono('#FFFFFF')
# logo-primary: versão principal (mesmo desenho do horizontal)
files['logo-primary.svg'] = variant('horizontal', False)
files['logo-primary-dark.svg'] = variant('horizontal', True)
for name, content in files.items():
    open(os.path.join(OUT, name), 'w').write(content)
open(os.path.join(PUB, 'favicon.svg'), 'w').write(favicon())
open(os.path.join(OUT, 'favicon.svg'), 'w').write(favicon())
open(os.path.join(HERE, '_icon-maskable.svg'), 'w').write(app_icon(pad=14, radius=0))
print('ok', len(files) + 2, 'svgs')
