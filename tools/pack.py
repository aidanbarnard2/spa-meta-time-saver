"""Keep the app's source locked in the repo.

    DASH_PASSWORD=... python3 tools/pack.py pack     # src/app.html, src/js, mapping -> src.enc
    DASH_PASSWORD=... python3 tools/pack.py unpack   # src.enc -> those files

Only the lock screen, logo and these tools are public; the app code and the
Monday -> Meta mapping are committed only inside src.enc.
"""
import io
import json
import sys
import tarfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spa_crypt import ROOT, decrypt, derive_key, encrypt, password_from_env  # noqa: E402

PRIVATE = ["src/app.html", "src/js", "src/mapping.json", "src/house_setup.md", "src/accounts.json"]
ENC = ROOT / "src.enc"


def pack(key: bytes) -> None:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for p in PRIVATE:
            if (ROOT / p).exists():
                t.add(ROOT / p, arcname=p)
    ENC.write_text(json.dumps(encrypt(buf.getvalue(), key)))
    print(f"wrote {ENC.name} ({ENC.stat().st_size:,} bytes)")


def unpack(key: bytes) -> None:
    data = decrypt(json.loads(ENC.read_text()), key)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as t:
        for m in t.getmembers():
            if m.name.startswith("/") or ".." in Path(m.name).parts or not any(m.name == p or m.name.startswith(p + "/") for p in PRIVATE):
                raise SystemExit(f"unexpected path in archive: {m.name}")
        t.extractall(ROOT, filter="data")
    print("unpacked:", ", ".join(PRIVATE))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    key = derive_key(password_from_env())
    {"pack": pack, "unpack": unpack}.get(cmd, lambda k: sys.exit("usage: pack.py pack|unpack"))(key)
