"""Copy a three.js release into public/vendor/, without its comments and indentation.

    python3 scripts/vendor-three.py /path/to/three.js/build

three.js publishes minified files only on npm; the repository has the readable build. This strips
whole-line comments and leading whitespace, which roughly halves the size and changes no code.
"""
import sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / 'public' / 'vendor'
out.mkdir(parents=True, exist_ok=True)
for name in ('three.module.js', 'three.core.js'):
    kept, in_block = [], False
    for line in (src / name).read_text().splitlines():
        t = line.strip()
        if in_block:
            in_block = '*/' not in t
            continue
        if not t or t.startswith('//'):
            continue
        if t.startswith('/*') and '@license' not in t:
            in_block = '*/' not in t
            continue
        kept.append(t)
    (out / name).write_text('\n'.join(kept) + '\n')
    print(name, (src / name).stat().st_size, '->', (out / name).stat().st_size)
