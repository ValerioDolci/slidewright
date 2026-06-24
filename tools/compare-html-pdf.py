#!/usr/bin/env python3
"""Confronta gli screenshot HTML (/tmp/html/sN.png) col PDF (arg1), 100 punti/slide."""
import sys, fitz
from PIL import Image
import numpy as np
pdf=sys.argv[1] if len(sys.argv)>1 else '/tmp/RC.pdf'
TOL=int(sys.argv[2]) if len(sys.argv)>2 else 24
doc=fitz.open(pdf)
gx=[int((j+0.5)/10*1280) for j in range(10)]; gy=[int((k+0.5)/10*720) for k in range(10)]
allok=True
for i in range(doc.page_count):
    h=np.asarray(Image.open(f'/tmp/html/s{i}.png').convert('RGB').resize((1280,720)))
    pix=doc[i].get_pixmap(matrix=fitz.Matrix(1280/960,1280/960))
    p=np.asarray(Image.frombytes('RGB',[pix.width,pix.height],pix.samples).resize((1280,720)))
    bad=[(x,y,tuple(int(v) for v in h[y,x]),tuple(int(v) for v in p[y,x]),int(np.abs(h[y,x].astype(int)-p[y,x].astype(int)).max()))
         for y in gy for x in gx if int(np.abs(h[y,x].astype(int)-p[y,x].astype(int)).max())>TOL]
    allok&=not bad
    print(f'slide {i+1:2d}: {100-len(bad):3d}/100 {"OK" if not bad else "DIFF "+str(len(bad))}')
    for b in sorted(bad,key=lambda z:-z[4])[:3]: print(f'     ({b[0]},{b[1]}) html={b[2]} pdf={b[3]} Δ={b[4]}')
print('TUTTE OK' if allok else 'CI SONO DIFFERENZE')
