"""Word breaks inside the lyric words, for the romaji (app/src/engine/romaji.ts).

The lyric data's "words" are sung phrases, often several words long; their romaji needs spaces. MeCab (fugashi with
unidic-lite) finds the words; only its segmentation is used (the readings stay the sung kana in the data). A new
romaji word starts at every token except those that belong to the one before: auxiliary verbs and suffixes
(yurusareta, bokutachi) and conjunctive particles (shite). Writes "brk" (displayed-character indices where a new
word starts) into each word of data/lyrics.json, in place.

    uv pip install --python analysis/.venv/Scripts/python.exe fugashi unidic-lite   (once)
    analysis/.venv/Scripts/python.exe analysis/lyric_breaks.py
"""
import json
from pathlib import Path

import fugashi

PATH = Path(__file__).resolve().parent.parent / 'data' / 'lyrics.json'
ATTACH = {'助動詞', '接尾辞'}


def breaks(text: str, tagger: fugashi.Tagger) -> list[int]:
    chars = list(text)
    out, pos, first = [], 0, True
    for tok in tagger(text):
        s = tok.surface
        # find the token in the displayed text (it may skip quotes and spaces MeCab drops)
        i = text.find(s, pos)
        if i < 0:
            continue
        p1, p2 = tok.feature.pos1, tok.feature.pos2
        joins = p1 in ATTACH or (p1 == '助詞' and p2 == '接続助詞') or p1 in ('補助記号', '記号', '空白')
        if not first and not joins and i > 0:
            out.append(len(list(text[:i])))
        first = False
        pos = i + len(s)
    return sorted(set(b for b in out if 0 < b < len(chars)))


def main() -> None:
    raw = PATH.read_text(encoding='utf-8')
    data = json.loads(raw)
    tagger = fugashi.Tagger()
    n = 0
    for line in data['lines']:
        for w in line['words']:
            if not w.get('kana'):
                continue
            w['brk'] = breaks(w['w'], tagger)
            n += len(w['brk'])
    nl = '\r\n' if '\r\n' in raw else '\n'
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1).replace('\n', nl) + nl, encoding='utf-8')
    print(f'{n} breaks written to {PATH.name}')


if __name__ == '__main__':
    main()
