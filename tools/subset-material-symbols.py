#!/usr/bin/python3
"""Subset the Material Symbols Outlined font to the icon names the site uses.

Why: the full variable font is 319 KB and was the largest single download on
every page. The site references ~700 icons; the subset is ~60 KB.

How: icon names are GSUB ligatures (text "arrow_forward" -> one glyph), so a
plain --text subset would pull in every ligature reachable from a-z. This
script reads the ligature table, keeps only the ligature glyphs whose name is
referenced anywhere in src/ or public/, plus the a-z 0-9 _ component glyphs,
and disables layout closure.

Run from the repo root after adding icons, then commit the new file:
    /usr/bin/python3 tools/subset-material-symbols.py
Requires fontTools + brotli for /usr/bin/python3 (pip install fonttools brotli).
"""
import glob, os, re, sys
from fontTools.ttLib import TTFont
from fontTools import subset

SRC = glob.glob('public/fonts/files/7c14d745-*.woff2')[0]
OUT = 'public/fonts/files/material-symbols-outlined-subset-20260907.woff2'

tokens = set()
files = (glob.glob('src/**/*.*', recursive=True) + glob.glob('public/**/*.html', recursive=True)
         + glob.glob('public/assets/*.js') + glob.glob('public/legal/*.js') + glob.glob('public/students/**/*.js', recursive=True))
for path in files:
    if not re.search(r'\.(jsx?|tsx?|mjs|cjs|html|css|json)$', path):
        continue
    try:
        text = open(path, encoding='utf-8', errors='ignore').read()
    except OSError:
        continue
    tokens.update(m.group(0) for m in re.finditer(r'[a-z][a-z0-9_]{1,40}', text))

font = TTFont(SRC)
cmap = font.getBestCmap()
by_glyph = {g: chr(c) for c, g in cmap.items()}
keep, found = set(), set()
for lookup in font['GSUB'].table.LookupList.Lookup:
    for st in lookup.SubTable:
        if lookup.LookupType == 7:
            st = st.ExtSubTable
        if not hasattr(st, 'ligatures'):
            continue
        for first, ligs in st.ligatures.items():
            for lig in ligs:
                name = by_glyph.get(first, '?') + ''.join(by_glyph.get(c, '?') for c in lig.Component)
                if name in tokens:
                    keep.add(lig.LigGlyph); found.add(name)
base = {cmap[ord(ch)] for ch in 'abcdefghijklmnopqrstuvwxyz0123456789_' if ord(ch) in cmap}
opts = subset.Options()
opts.flavor = 'woff2'; opts.layout_features = ['liga', 'rlig', 'calt']; opts.layout_closure = False
opts.hinting = False; opts.desubroutinize = True; opts.notdef_outline = True
s = subset.Subsetter(opts)
s.populate(glyphs=list(base | keep | {'.notdef'}))
s.subset(font)
font.flavor = 'woff2'
font.save(OUT)
print(f'{len(found)} icons kept, {os.path.getsize(OUT)} bytes -> {OUT}')
