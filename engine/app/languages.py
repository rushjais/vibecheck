"""Language detection from the file tree.

We start with the dominant 'vibecoder' stacks — JavaScript/TypeScript and
Python. Anything else still gets the OWASP + secrets passes, but we flag it as
limited support.
"""

import os

from . import config

EXT_TO_LANG = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".py": "python",
}

# Languages we have a dedicated Semgrep pack for.
LANG_TO_SEMGREP_PACK = {
    "javascript": "p/javascript",
    "typescript": "p/typescript",
    "python": "p/python",
}

FULLY_SUPPORTED = {"javascript", "typescript", "python"}


def detect_languages(repo_dir: str) -> dict:
    counts: dict[str, int] = {}

    for root, dirs, files in os.walk(repo_dir):
        dirs[:] = [d for d in dirs if d not in config.EXCLUDE_DIRS]
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            lang = EXT_TO_LANG.get(ext)
            if lang:
                counts[lang] = counts.get(lang, 0) + 1

    languages = sorted(counts, key=lambda lng: counts[lng], reverse=True)

    packs: list[str] = []
    for lang in languages:
        pack = LANG_TO_SEMGREP_PACK.get(lang)
        if pack and pack not in packs:
            packs.append(pack)

    limited_support = not any(lang in FULLY_SUPPORTED for lang in languages)

    return {
        "languages": languages,
        "counts": counts,
        "semgrep_packs": packs,
        "limited_support": limited_support,
    }
