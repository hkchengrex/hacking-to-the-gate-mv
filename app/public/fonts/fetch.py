"""Fetch the fonts the renderer loads (they are not in the repository), verify them, and build the static instances.

    uv run --with fonttools python app/public/fonts/fetch.py        (or: pip install fonttools; python fetch.py)

The originals come from the google/fonts repository at one pinned commit, so they are the files the video was
rendered with, byte for byte (each download is checked against its SHA-256). They land in src/ with their licence
texts (all SIL Open Font License): the variable Archivo, Cormorant Garamond and M PLUS 1, and the static Dela
Gothic One, DotGothic16, IBM Plex Mono and Shippori Mincho. Then the static instances the renderer loads from this
folder are cut from the variable fonts with fontTools (Canvas2D and opentype.js need static outlines): Archivo at
six widths x four weights, Archivo Italic at 2 x 2, Cormorant at two weights upright and italic, M PLUS 1 at four
weights. Each instance is checked against the video's by content (every table but `head`, which holds the time of
writing); the video's were cut with fontTools 4.66.1, and a differing instance only prints a note.

Re-running skips what is already in place. Total download: about 44 MB.
"""
import hashlib
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / 'src'
PIN = '7085eb89a950e85db5b166b7a58d414544b4140c'  # google/fonts, 2026-10-05
RAW = f'https://raw.githubusercontent.com/google/fonts/{PIN}/ofl'

# (family folder in google/fonts, file, sha256 of the file the video was rendered with)
ORIGINALS = [
    ('archivo', 'Archivo[wdth,wght].ttf', '0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053'),
    ('archivo', 'Archivo-Italic[wdth,wght].ttf', '305d13b4eb80e62f7d517f78d7c045250d977552a420f2dbed906f314e761305'),
    ('cormorantgaramond', 'CormorantGaramond[wght].ttf', 'b20b7d9626dd956b2c5e558692ad328b1f19e3275e2782db4fa07670d83f35e0'),
    ('cormorantgaramond', 'CormorantGaramond-Italic[wght].ttf', '0f48ea6abb2084537854f7174c470991a463b13036309e3b50a81511611c530d'),
    ('delagothicone', 'DelaGothicOne-Regular.ttf', '4ff87a0965f1b0505e5a2c58424bc6ad3cff27e56a82f21c2fc9d6b0e3857ee2'),
    ('dotgothic16', 'DotGothic16-Regular.ttf', '3ad9af88726d42b40f7f365f0dcac785af73cf20ea6f1d5b44e57cc21150b8f1'),
    ('ibmplexmono', 'IBMPlexMono-Light.ttf', '780bcf65509d72a35ec114b57bcbe220dc6b77d8ea2e9b25e294be3c570c5025'),
    ('ibmplexmono', 'IBMPlexMono-Regular.ttf', '6a3412f058c7d8dfd9170c41e85ade48e5156ecb89356110ca57a0a27734af46'),
    ('ibmplexmono', 'IBMPlexMono-Medium.ttf', 'a9b4c49bb299e05b5f6c481e7fb5e78943d2793249a0c8874ab574a2d1ea6755'),
    ('ibmplexmono', 'IBMPlexMono-SemiBold.ttf', 'd3c38e55c78f5b0f28009fddba4834ec503278936a5986032424c9bd2d23aa46'),
    ('ibmplexmono', 'IBMPlexMono-Bold.ttf', 'ac27abd6450a64dd94467580a02fe6235156d5b92f2926ebbc8e7489df64e0be'),
    ('ibmplexmono', 'IBMPlexMono-Italic.ttf', '3362fc791b0652193328b862c1c5f23a789bc7288b1617fa63302f88689a2a34'),
    ('mplus1', 'MPLUS1[wght].ttf', '32dab296a06c3e87841ecd2bc9912434a964ad541e22ea19f764969dae93fced'),
    ('shipporimincho', 'ShipporiMincho-Regular.ttf', '769b5269f0f9bc6534b352c0e6bd856a566e03ff788f107191c2d835863570b2'),
    ('shipporimincho', 'ShipporiMincho-Bold.ttf', '63bc4eddc74793f671c3ab827c5175e773ffbe569d0bf50ee65375ea9e3bc286'),
    ('shipporimincho', 'ShipporiMincho-ExtraBold.ttf', 'bdb787644b4b347e9a7efdd576f0d16ee4528cc9b5c86d23e06fa1a14ae0444c'),
]

# (variable source, axis location, instance file); INSTANCE_SHA: sha256 of the video's instance's content (tables but head)
INSTANCES = []
for wd, s in [(62, '620'), (75, '750'), (87.5, '875'), (100, '1000'), (112.5, '1125'), (125, '1250')]:
    for wt in [300, 500, 700, 900]:
        INSTANCES.append(('Archivo[wdth,wght].ttf', {'wdth': wd, 'wght': wt}, f'Archivo-w{s}-{wt}.ttf'))
for wd, s in [(75, '750'), (100, '1000')]:
    for wt in [400, 800]:
        INSTANCES.append(('Archivo-Italic[wdth,wght].ttf', {'wdth': wd, 'wght': wt}, f'ArchivoItalic-w{s}-{wt}.ttf'))
for wt in [400, 600]:
    INSTANCES.append(('CormorantGaramond[wght].ttf', {'wght': wt}, f'Cormorant-{wt}.ttf'))
    INSTANCES.append(('CormorantGaramond-Italic[wght].ttf', {'wght': wt}, f'CormorantItalic-{wt}.ttf'))
for wt in [300, 500, 700, 900]:
    INSTANCES.append(('MPLUS1[wght].ttf', {'wght': wt}, f'MPLUS1-{wt}.ttf'))
INSTANCE_SHA = {
    'Archivo-w620-300.ttf': '7a56806c6846f4e38dc10938d10acdf91bb98757e56903fa9c745480b88b625f',
    'Archivo-w620-500.ttf': '9bc43b9251f264c8a841fb4c6e9dd993ad54ae11798a84680017badb7d89a663',
    'Archivo-w620-700.ttf': 'f0c47bacbf722ab91c2cd999af7dab1405dbe3d179b378380c78b2467591a7a7',
    'Archivo-w620-900.ttf': '3f2e3d55b6f84c271dc2ff0cc54f3b780064548e52574e23cd1fe9b0cdf5b926',
    'Archivo-w750-300.ttf': '197b94c2eda7ce839f50b6c5b1bb17b43d2dcf11891234158002347f2038a85c',
    'Archivo-w750-500.ttf': '7c59b48eede2ed6bb2c8c27e01aeb151aae2f2949d75dc4a1409c6a152ac16b3',
    'Archivo-w750-700.ttf': '3b035c56a70f7e189aa4f0cc2e08f989d4bfadf6c93cb24e53213fda54e18737',
    'Archivo-w750-900.ttf': '3649b70ce0f98e35de21c76abc9c1f3594cd1b0af8774fae01957929c62da201',
    'Archivo-w875-300.ttf': '2a0b65359d5e0cd90abd91be74d33c854930d5dbe941c15d8914267bdeda2857',
    'Archivo-w875-500.ttf': '8daf7a7c9ea740dd0772dfd187633bd8a0e942090e8636b88be8cda1cd4d4a3a',
    'Archivo-w875-700.ttf': 'd6236260a025a755a751a03ac3cd2d1dfa086357c99440c10579376779036492',
    'Archivo-w875-900.ttf': '1cf4bf24c26c0a7a6729d858b16723fadcb2b36b6935d3930a3241924a6be367',
    'Archivo-w1000-300.ttf': '96ec49fbfe58837a188249e211359ad33e3f8455c1d4b4e1936664ceb25d22bf',
    'Archivo-w1000-500.ttf': '6ce2770737f7b3b9cc0092e30f6759da102c9b85f8f3476ff646b804cae893d3',
    'Archivo-w1000-700.ttf': '53a024c2a0ecb6a68140af14920ce71e96296ffeccdab669eab15fc18e4b86a7',
    'Archivo-w1000-900.ttf': 'f5fd8ae08488a5426acbc120adf8d37f28d3036c3ed84eeee18205d36e15fce3',
    'Archivo-w1125-300.ttf': '13927479a08cedfd9d4b8162a7e294f70c010c65faf4cfc7e102ea42a881cabf',
    'Archivo-w1125-500.ttf': '40d6da917a8206a9f75d924ecac58a64d645c6d7e661137217861e0bae592c4a',
    'Archivo-w1125-700.ttf': '9af50e26cf7a49f586f48f7f16f24cc1272c2a15a3eaf190ea0c324e14128f80',
    'Archivo-w1125-900.ttf': '98bf1efc1abdab20a0b25c27cce7db6ad1bcbf7748f4edcbd90db5761a76a9a2',
    'Archivo-w1250-300.ttf': 'a78d507e1e07053f4d5787a2e6739fdb0ad49552865ab0fcbfb7c694c3401f98',
    'Archivo-w1250-500.ttf': '4803803ad9b3d1294c4085d5af1cb9ae201caf5400956239df96ca6f1576114c',
    'Archivo-w1250-700.ttf': '30b4876731261c96a9235153dcb4b1e7d0bf4ec4d6758879710985634b64f5a4',
    'Archivo-w1250-900.ttf': '1d0743db1c8709ebc83447ddd1bdb64ea9c304a716c95766f3a7a46fa04b73db',
    'ArchivoItalic-w750-400.ttf': '1f93187e6e4c1090307d42d469c90014fa2dad8bb55e2624d688bd7359243c59',
    'ArchivoItalic-w750-800.ttf': 'e7c2d166b81e6a062c33f3e0eea23d51dbb758bd8c98333cea6fa259c3b769a6',
    'ArchivoItalic-w1000-400.ttf': '1ddcab92daac884c87b1f002378f7d9ad31f8aed61bac4e0f8dec46847f75c13',
    'ArchivoItalic-w1000-800.ttf': '2d5d881c365a42bbea7de8dca08f637feb6740a8656d969533ebcf7aabce275d',
    'Cormorant-400.ttf': 'd9c56030633c4af93946051483e798546cf2fade1c312b94aadde4564e7f335c',
    'Cormorant-600.ttf': '75bc6e72affe381ad36bbc8d7c45e3e6dbd23df0af874917265c091f2a93df27',
    'CormorantItalic-400.ttf': 'e64791c3c38113da23ab11e44b62363d5bbe3d799bb158c61e63ff0934c7f786',
    'CormorantItalic-600.ttf': '0c8e3061b98fca79dab4350d7a9dc37473ba71deabecf028b41c005f016a2759',
    'MPLUS1-300.ttf': '373b39dbb6f45ce1803eeaab6b211d9496910a68c9e3e792a41c8307056a9762',
    'MPLUS1-500.ttf': '837e0d89effbcbec2eec3fc04bd83eb225a0046701f19a657490c3d9cb1e87f3',
    'MPLUS1-700.ttf': '022fee3553a5427912dfc12e6f98f1dcc818a5ef1bb880ea0a3cec182c81189f',
    'MPLUS1-900.ttf': '9101ab97fe2335b6c1b6f6502593fdfe54f9dadfad078b46474ff2245b2f6ee4',
}


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def fetch(url: str, dest: Path):
    req = urllib.request.Request(url, headers={'User-Agent': 'hacking-to-the-gate fonts/1.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        dest.write_bytes(r.read())


def main():
    SRC.mkdir(parents=True, exist_ok=True)
    # the originals and their licences
    for family, name, want in ORIGINALS:
        dest = SRC / name
        if dest.exists() and sha256(dest) == want:
            print(f'  have   src/{name}')
            continue
        print(f'  fetch  src/{name}')
        fetch(f'{RAW}/{family}/{urllib.request.quote(name)}', dest)
        got = sha256(dest)
        if got != want:
            dest.unlink()
            sys.exit(f'{name}: SHA-256 {got} is not the expected {want}; nothing kept')
    for family in sorted({f for f, _, _ in ORIGINALS}):
        dest = SRC / f'OFL-{family}.txt'
        if not dest.exists():
            print(f'  fetch  src/OFL-{family}.txt')
            fetch(f'{RAW}/{family}/OFL.txt', dest)
    # the static instances
    try:
        from fontTools.ttLib import TTFont
        from fontTools.varLib import instancer
    except ImportError:
        sys.exit('fontTools is needed to cut the static instances: uv run --with fonttools python fetch.py')
    def content_sha(p: Path) -> str:
        f = TTFont(p)
        h = hashlib.sha256()
        for tag in sorted(f.keys()):
            if tag not in ('GlyphOrder', 'head'):
                h.update(tag.encode())
                h.update(f.getTableData(tag))
        return h.hexdigest()

    for source, loc, name in INSTANCES:
        dest = HERE / name
        if dest.exists() and content_sha(dest) == INSTANCE_SHA[name]:
            print(f'  have   {name}')
            continue
        print(f'  cut    {name}')
        inst = instancer.instantiateVariableFont(TTFont(SRC / source), loc, updateFontNames=False)
        inst.save(dest)
        if content_sha(dest) != INSTANCE_SHA[name]:
            print(f'         ({name} differs from the video\'s instance: a different fontTools version?)')
    print('fonts in place')


if __name__ == '__main__':
    main()
