"""Encryption helpers shared by the build and the daily check.

Format of every locked file (JSON):
  {"v": 1, "iv": <base64 12 bytes>, "ct": <base64 AES-256-GCM ciphertext+tag>}
The key is PBKDF2-HMAC-SHA256(password, SALT, ITERATIONS) -> 32 bytes.
SALT and ITERATIONS are public (src/lock.json); the password never goes in the repo.
"""
import base64
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = Path(__file__).resolve().parent.parent
LOCK = json.loads((ROOT / "src" / "lock.json").read_text())


def derive_key(password: str) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=base64.b64decode(LOCK["salt"]),
        iterations=int(LOCK["iterations"]),
    )
    return kdf.derive(password.encode("utf-8"))


def encrypt(data: bytes, key: bytes) -> dict:
    iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, data, None)
    return {"v": 1, "iv": base64.b64encode(iv).decode(), "ct": base64.b64encode(ct).decode()}


def decrypt(env: dict, key: bytes) -> bytes:
    return AESGCM(key).decrypt(base64.b64decode(env["iv"]), base64.b64decode(env["ct"]), None)


def password_from_env() -> str:
    pw = os.environ.get("DASH_PASSWORD", "")
    if not pw:
        raise SystemExit("DASH_PASSWORD is not set")
    return pw
