#!/usr/bin/env python3
# Same as scripts/build-ui.js, for machines without Node: rebuilds ui.html from ui/.
# Run from anywhere: python3 scripts/build-ui.py
import os, sys
sys.argv = [sys.argv[0], os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")]
import re,os,sys

root=sys.argv[1]; src=os.path.join(root,'ui')
BANNER='<!-- GENERATED FILE — do not edit.\n     Built from ui/index.html by scripts/build-ui.js (npm run build:ui).\n     Edit ui/index.html, ui/ds-overrides.css, ui/snapkit.css\n     or ui/snapkit.js instead. -->'
def strip(css):
    out='';i=0
    while True:
        st=css.find('@font-face',i)
        if st==-1: return out+css[i:]
        o=css.find('{',st);e=css.find('}',o)
        b=css[st:e+1]; out+=css[i:st]
        if not re.search(r'url\(\s*["\']?https?:',b,re.I): out+=b
        i=e+1
def rd(h): return open(os.path.join(src,h),encoding='utf8').read().rstrip()
h=open(os.path.join(src,'index.html'),encoding='utf8').read()
h=re.sub(r'[ \t]*<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>',lambda m:'<style>\n/* '+m.group(1)+' */\n'+strip(rd(m.group(1)))+'\n</style>',h)
h=re.sub(r'[ \t]*<script\s+src="([^"]+)"\s*></script>',lambda m:'<script>\n'+rd(m.group(1))+'\n</script>',h)
h=h.replace('<!DOCTYPE html>','<!DOCTYPE html>\n'+BANNER,1)
open(os.path.join(root,'ui.html'),'w',encoding='utf8').write(h)
