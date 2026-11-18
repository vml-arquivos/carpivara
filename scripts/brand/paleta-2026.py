#!/usr/bin/env python3
"""
Aplica o Manual de Marca BL (Bolão Livre, "sem verde") sobre o código do BL Buscarr.

Três camadas, nesta ordem:

1. EXATO — as cores nomeadas da marca trocam pelo hex do manual: azul principal #2563EB,
   azul claro #60A5FA, azul escuro #1E40AF, cinza neutro #E5E7EB, branco #FFFFFF.
2. GIRO — qualquer outro tom verdejante que não seja de estado: se for saturação baixa
   (cinza com castanho verde) vira cinza neutro na mesma luminância; se for verde vivo de
   marca, o matiz gira para 222 graus preservando saturação e luminância, então o
   contraste medido de cada tela não muda.
3. RGBA — as sombras e brilhos escritos em rgba(...) com cast verde seguem a mesma regra.

O que é protegido e nunca muda: as cores de ESTADO do relatório (ok/sem registro, farol
verde, sucesso), sejam as da lista fixa sejam as de linha cujo contexto indica estado
(token --ok, seletor de status, nível GREEN). Ellas significam "a fonte não registrou
nada"; recolori-las por estética faria o cliente ler um resultado diferente do que a
fonte afirmou, o que a diretiva do produto proíbe.

Idempotente: pode rodar mais de uma vez. Sem --apply, só relata.
Uso: python3 scripts/brand/paleta-2026.py [--apply]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APPLY = '--apply' in sys.argv

EXATO = {
    # segunda passada (comentário fora do dict não serve; documentado abaixo): a landing tinha um sistema próprio de tokens (herança da página dourada) -- --
    '#ECCC85': '#60A5FA', '#F8DCA0': '#93C5FD', '#AD8245': '#1E40AF', '#C9A400': '#1E40AF',
    '#211B10': '#0B1220', '#101513': '#0B1220', '#F7F5EF': '#FFFFFF', '#FAF8F2': '#F9FAFB',
    '#1C1C1C': '#111827', '#E1E1E1': '#E5E7EB', '#4ADE80': '#60A5FA',
     '#ADF1CD': '#DBEAFE', '#81E9B2': '#93C5FD', '#CCF2DE': '#BFDBFE',
    '#C5F1DA': '#BFDBFE', '#D1E8DC': '#DBEAFE', '#DEF7EA': '#DBEAFE', '#ABF0CB': '#BFDBFE',
    '#BCE4D0': '#DBEAFE', '#C1E9D1': '#BFDBFE', '#C3EFD8': '#BFDBFE', '#C9F1DC': '#BFDBFE',
    '#CDF3E0': '#DBEAFE', '#D5F0E0': '#DBEAFE', '#D6ECE0': '#E5E7EB', '#DCF2E3': '#E5E7EB',
    '#E2F4EA': '#EFF6FF', '#98EABE': '#93C5FD', '#70E6A7': '#60A5FA', '#7DDFAB': '#60A5FA',
    '#52DF94': '#60A5FA', '#5ECD92': '#60A5FA', '#35C176': '#2563EB', '#34C075': '#2563EB',
    '#2D9D61': '#1E40AF', '#4CB37C': '#60A5FA', '#81C995': '#93C5FD', '#3B9F6A': '#2563EB',
    '#418D64': '#1E40AF', '#1FA971': '#1E40AF', '#20834E': '#1E40AF', '#219758': '#1E40AF',
    '#276E48': '#1E40AF', '#31724F': '#1E40AF', '#367E58': '#2563EB', '#17432C': '#111827',
    '#174A38': '#1E40AF', '#183A30': '#111827', '#183E2A': '#1E40AF', '#18513E': '#1E40AF',
    '#193A28': '#111827', '#19472E': '#1E40AF', '#1D1D1D': '#1F2937', '#0B2417': '#0B1220',
    '#0C2718': '#0B1220', '#0F2B1C': '#0B1220', '#0F301E': '#0B1220', '#102B1D': '#0B1220',
    '#10311F': '#0B1220', '#113421': '#0B1220', '#123924': '#0B1220', '#123B25': '#0B1220',
    '#132B20': '#0B1220', '#14261D': '#0B1220', '#23362C': '#1F2937', '#C1D8CD': '#D1D5DB',
    '#245A4B': '#2563EB', '#326C58': '#2563EB', '#205539': '#2563EB', '#246241': '#2563EB',
    '#153E34': '#1E40AF', '#1C493D': '#1E40AF', '#123A32': '#1E40AF', '#173A2E': '#1E40AF',
    '#152D26': '#1F2937', '#101F1B': '#111827', '#12351F': '#0B1220', '#103220': '#111827',
    '#143B26': '#1E3A8A', '#040E09': '#030712', '#07170E': '#0B1220', '#071C11': '#0B1220',
    '#081C11': '#0B1220', '#10392B': '#111827',
    '#548674': '#60A5FA', '#779F8F': '#60A5FA', '#7E9589': '#60A5FA',
    '#9DBFB0': '#93C5FD', '#9DBBAB': '#93C5FD', '#A9C4B6': '#93C5FD', '#86B39B': '#93C5FD',
    '#9DB8A8': '#BFDBFE', '#A6E3C0': '#BFDBFE', '#9EC2AE': '#93C5FD', '#BBD2C7': '#DBEAFE',
    '#C9DDD0': '#DBEAFE', '#CFE3D6': '#DBEAFE', '#EEFBF4': '#DBEAFE',
    '#DBE5DE': '#E5E7EB', '#BCCDC3': '#D1D5DB', '#C5D2CB': '#D1D5DB', '#D2DCD7': '#E5E7EB',
    '#D5E4DC': '#E5E7EB', '#D7DDD9': '#E5E7EB', '#D9DFDC': '#E5E7EB', '#CBDDD4': '#E5E7EB',
    '#E6EFEA': '#EFF6FF', '#E6F0EA': '#EFF6FF', '#E8F6EE': '#EFF6FF', '#EAF0EB': '#F3F4F6',
    '#EDF4F0': '#F3F4F6', '#E7F1EC': '#F3F4F6', '#EFF3F0': '#F3F4F6', '#E6EAE8': '#F3F4F6',
    '#F1F4F2': '#F3F4F6', '#ECEDE6': '#F3F4F6', '#F5F9F7': '#F9FAFB', '#F5FCF8': '#F9FAFB',
    '#F6F7F4': '#FFFFFF',
    '#53675F': '#4B5563', '#5B6661': '#4B5563', '#516359': '#4B5563', '#394D43': '#374151',
    '#183229': '#111827', '#677A6E': '#4B5563', '#789184': '#4B5563', '#4C695B': '#4B5563',
    '#8FAA9A': '#6B7280', '#91AC9E': '#6B7280', '#9CB4A7': '#6B7280', '#A5B5AA': '#9CA3AF',
    '#AEB9AF': '#9CA3AF', '#35493E': '#374151', '#364B40': '#374151', '#3D4F45': '#4B5563',
    '#41554A': '#4B5563', '#4C6255': '#4B5563', '#53635A': '#4B5563', '#23362C': '#1F2937',
    '#304D40': '#374151', '#C1D8CD': '#D1D5DB', '#CDDBD2': '#D1D5DB',
}

# Verde de estado: intocável (sem registro / risco baixo / medidor de senha / botão do WhatsApp).
# O que não está aqui é protegido só quando a própria linha indica estado (PROTEGE).
ESTADO = {
    '#0E9F6E', '#046C4E', '#0A7A43', '#0A7A4B', '#0B7A43', '#0F7B4F', '#13492C', '#15803D',
    '#166534', '#16A34A', '#1FA855', '#22C55E', '#34D399', '#4ADE80', '#84CC16', '#86EFAC',
    '#BBF7D0', '#D1FAE5', '#DCFCE7', '#E3F8EF', '#ECFDF5', '#F0FDF4', '#064E3B', '#059669',
    '#10B981', '#0F766E', '#0D9488', '#14B8A6', '#188038', '#0A7A43',
}
PROTEGE = re.compile(
    r"(--ok\b|--ok-|farol|verde|is-ok|status-ok|\.ok\b|state:\s*'CLEAR'|level === 'GREEN'"
    r"|'GREEN'|sem risco|sucesso|success|positive|risco baixo)", re.I)

ARQS = [
    *ROOT.glob('apps/web/src/**/*.css'), *ROOT.glob('apps/web/src/**/*.ts'),
    *ROOT.glob('apps/web/src/**/*.tsx'), *ROOT.glob('apps/api/src/**/*.ts'),
    *ROOT.glob('apps/web/public/brand/**/*.svg'), *ROOT.glob('apps/web/*.html'),
    *ROOT.glob('scripts/brand/*.svg'), *ROOT.glob('scripts/brand/*.py'),
    *ROOT.glob('scripts/brand/*.mjs'), ROOT / 'apps/web/public/site.webmanifest',
]
PULA = re.compile(r"(node_modules|/dist/|\.test\.|/test/|/fonts/|paleta-2026\.py)")

HEX = re.compile(r'#([0-9A-Fa-f]{6})\b')
RGBA = re.compile(r'rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([0-9.]+)\s*\)')


def srgb2hsl(r, g, b):
    r, g, b = r / 255, g / 255, b / 255
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, l
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return h * 60, s, l


def hsl2srgb(h, s, l):
    h = h % 360
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(h // 60) % 6]
    return tuple(round((v + m) * 255) for v in (r, g, b))


def cast_verde(r, g, b):
    """Cinza esverdeado vira cinza neutro; verde vivo de marca vira azul, na mesma luminância."""
    h, s, l = srgb2hsl(r, g, b)
    if max(r, g, b) - min(r, g, b) < 40:
        return hsl2srgb(0, 0, l)
    return hsl2srgb(222, s, l)


def eh_verde(r, g, b):
    # verde evidente, ou verde escuro de saturação baixa (o fundo do herói era este caso:
    # rgb(17, 29, 24) tem o verde como canal máximo sem dominar o azul)
    if max(r, g, b) < 90 and g > r and g >= b:
        return True
    return g > r + 6 and g > b + 6


rel = {}
for f in ARQS:
    if not f.is_file() or PULA.search(str(f)):
        continue
    src = f.read_text(encoding='utf-8')
    mudou = {'exato': 0, 'giro': 0, 'protegido': 0}

    def sub_hex(m, line):
        HX = '#' + m.group(1).upper()
        if HX in EXATO:
            mudou['exato'] += 1
            return EXATO[HX]
        if HX in ESTADO or PROTEGE.search(line):
            mudou['protegido'] += 1
            return m.group(0)
        r, g, b = int(m.group(1)[0:2], 16), int(m.group(1)[2:4], 16), int(m.group(1)[4:6], 16)
        if not eh_verde(r, g, b):
            return m.group(0)
        mudou['giro'] += 1
        return '#%02X%02X%02X' % cast_verde(r, g, b)

    def sub_rgba(m, line):
        r, g, b = (int(m.group(i)) for i in (1, 2, 3))
        if not eh_verde(r, g, b) or PROTEGE.search(line):
            return m.group(0)
        mudou['giro'] += 1
        nr, ng, nb = cast_verde(r, g, b)
        return f'rgba({nr}, {ng}, {nb}, {m.group(4)})'

    out = []
    for line in src.split('\n'):
        out.append(RGBA.sub(lambda m: sub_rgba(m, line), HEX.sub(lambda m: sub_hex(m, line), line)))
    new = '\n'.join(out)
    if new != src:
        rel[str(f.relative_to(ROOT))] = mudou
        if APPLY:
            f.write_text(new, encoding='utf-8')

tot = {k: sum(v[k] for v in rel.values()) for k in ('exato', 'giro', 'protegido')}
print(('APLICADO' if APPLY else 'SIMULACAO'), '| arquivos:', len(rel), '|', tot)
for k, v in sorted(rel.items(), key=lambda x: -(x[1]['exato'] + x[1]['giro']))[:14]:
    print(f'  {v["exato"]:>4} exato {v["giro"]:>4} giro {v["protegido"]:>4} protegido  {k}')
