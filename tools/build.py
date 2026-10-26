"""Build the locked dashboard page (index.html).

    DASH_PASSWORD=... python3 tools/build.py [--mapping PATH] [--out PATH]

Everything inside the app (code, the Monday -> Meta mapping) is encrypted with
the team password. Only the lock screen, the SPA logo and the public salt are
readable without it. The password itself is never written anywhere.
"""
import argparse
import base64
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spa_crypt import LOCK, ROOT, decrypt, derive_key, encrypt, password_from_env  # noqa: E402

SRC = ROOT / "src"


def build_app(mapping: dict) -> str:
    html = (SRC / "app.html").read_text()
    js = "\n".join(p.read_text() for p in sorted((SRC / "js").glob("*.js")))
    if "</script" in js.lower():
        raise SystemExit("JS contains </script, which would break the page")
    accts = SRC / "accounts.json"
    config = {
        "built": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mapping": mapping,
        "accounts": json.loads(accts.read_text()) if accts.exists() else [],
    }
    cfg = json.dumps(config, separators=(",", ":")).replace("</", "<\\/")
    logo = base64.b64encode((SRC / "logo.webp").read_bytes()).decode()
    for key in ("{{LOGO}}", "{{CONFIG}}", "{{JS}}"):
        if key not in html:
            raise SystemExit(f"app.html is missing {key}")
    return html.replace("{{LOGO}}", logo).replace("{{CONFIG}}", cfg).replace("{{JS}}", js)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mapping", default=os.environ.get("SPA_MAPPING", str(SRC / "mapping.json")))
    ap.add_argument("--out", default=str(ROOT / "index.html"))
    a = ap.parse_args()

    mp = Path(a.mapping)
    mapping = json.loads(mp.read_text()) if mp.exists() else {"groups": {}, "lines": []}
    if not mp.exists():
        print(f"note: no mapping file at {mp}; Monday lines will be matched by name only")

    pw = password_from_env()
    key = derive_key(pw)
    app = build_app(mapping).encode("utf-8")
    env = encrypt(app, key)
    assert decrypt(env, key) == app

    lock = (SRC / "lock.html").read_text()
    logo = base64.b64encode((SRC / "logo.webp").read_bytes()).decode()
    page = (lock.replace("{{LOGO}}", logo)
                .replace("{{LOCK}}", json.dumps(LOCK))
                .replace("{{PAYLOAD}}", json.dumps(env)))
    if pw in page:
        raise SystemExit("password leaked into the page")
    Path(a.out).write_text(page)
    print(f"wrote {a.out}: app {len(app):,} bytes, page {len(page):,} bytes, {len(mapping.get('lines', []))} mapped Monday lines")


if __name__ == "__main__":
    main()
