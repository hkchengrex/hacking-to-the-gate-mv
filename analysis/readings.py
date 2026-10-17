"""Sung readings of the lyrics (all 30 lines of the album version), one kana reading per displayed character.

Each lyric line is a list of its space-separated phrases; each phrase is the "|"-joined
readings of its characters in order ("" for brackets, which are not sung). Particles are
written as sung (は -> わ, へ -> え, を -> お), and the English line as it is pronounced. A small っ
has no reading of its own (""): its gemination goes into the next character's reading (か|っ|た -> か||った).
`romaji()` turns a reading into the lowercase letters the MMS aligner uses.
"""

READINGS = [
    ["すう|じゅう|おく|も|の", "こ|どう|の|かず|さ|え"],
    ["あ|な|た|に|わ", "まばた|き|てい|ど|の|さ|じ|な|とう|きゅう"],
    ["か|こ|に|とら|わ|れ|て", "み|らい|お|なげ|く|も"],
    ["ちり|ひと|つ", "ご|さん|お|ゆる|さ|ぬ|ひつ|ぜん"],
    ["|む|げん||に|ひろ|が|る|ゆめ|も", "えが|く|み|らい|も"],
    ["ぼく|たち|に|ゆる|さ|れ|た", "きょ|えい|の|けん|り"],
    ["|ゆう|げん||そ|れ|わ|ふた|つ|の", "はり|が|しめ|す"],
    ["ざん|こく|な|やく|じょう|と", "せん|たく|え"],
    ["ハッキング", "トゥ", "ザ", "ゲート"],  # English, sung with Japanese pronunciation
    ["だ|か|ら|い|ま", "いち|びょう|ご|と|に", "せ|かい|せん|お|こ|え|て"],
    ["きみ|の|そ|の|え|がお", "まも|り|た|い|の|さ"],
    ["そ|し|て|ま|た", "かな|し|み|の|な|い", "じ|かん|の|る|ー|ぷ|え|と"],
    ["の|み|こ|ま|れ|て|ゆ|く", "こ|どく|の|かん|そく|しゃ"],
    # verse 2
    ["いのち|の|しゅ|ちょう|と", "む|い|み|な|しょう|めい"],
    ["あ|な|た|に|わ", "たい|くつ|し|の|ぎ|に|た|ら|ぬ|こっ|けい"],
    ["し|はい|しゃ|き|ど|り|の", "おろ|か|な|しゅ|ぞく|わ"],
    ["う|ぬ|ぼ|れ|た", "ち|せつ|な|てい|り|お|なら|べ|た"],
    # pre-chorus 2
    ["|む|げん||と|しん|じ|た|あい|も", "そら|の|かな|た|も"],
    ["ぼく|たち|に|しめ|さ|れ|た", "か|そう|の|じ|ゆう"],
    ["|ゆう|げん||そ|れ|わ|む|じ|ひ|に", "とき|お|きざ|み"],
    ["あ|す|さ|え|も|ひ|てい|す|る", "せん|たく|え"],
    ["ハッキング", "トゥ", "ザ", "ゲート"],
    # chorus 2
    ["い|く|つ|も|の", "かがや|け|る|ひ|び", "なか|ま|と|の|やく|そく"],
    ["な|か||った|こと|に|わ", "し|て|わ|い|け|な|い"],
    ["そ|の|た|め|に", "とき|お|あざむ|く", "のこ|さ|れ|た|し|か|け|に"],
    ["も|う|まよ|い|わ|な|い", "こ|どく|の|かん|そく|しゃ"],
]
# final chorus: the first chorus again
READINGS += READINGS[9:13]

_BASE = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "を": "o", "ん": "n",
}
_SMALL = {"ゃ": "a", "ゅ": "u", "ょ": "o"}


def romaji(kana: str) -> str:
    """Hepburn-ish romanisation of a hiragana/katakana reading (ASCII passes through, lowercased)."""
    s = "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in kana)  # katakana -> hiragana
    out, i, double = "", 0, False
    while i < len(s):
        c = s[i]
        if c == "っ":
            double = True
        elif c == "ー":
            out += next((ch for ch in reversed(out) if ch in "aiueo"), "")
        elif c in _BASE:
            r = _BASE[c]
            if i + 1 < len(s) and s[i + 1] in _SMALL:  # youon: きゃ -> kya, しゃ -> sha, じょ -> jo
                v = _SMALL[s[i + 1]]
                r = r[:-1] + ("" if r[:-1] in ("sh", "ch", "j") else "y") + v
                i += 1
            if double:
                r = r[0] + r
                double = False
            out += r
        elif c.isascii() and c.isalpha():
            out += c.lower()
        i += 1
    return out
