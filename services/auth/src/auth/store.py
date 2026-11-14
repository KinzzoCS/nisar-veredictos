"""Cuentas y sesiones en SQLite (RF-ACC-03 y 04). De los tokens de renovación solo se guarda el hash."""
from __future__ import annotations

import hashlib
import secrets
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

REFRESH_DAYS = 7
DB_FILE = "auth.sqlite3"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  rotated_at TEXT
);
"""


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class User:
    id: str
    email: str
    password_hash: str
    role: str
    created_at: datetime


class RefreshRejected(Exception):
    """Token de renovación inexistente, caducado, revocado o reutilizado."""


class Store:
    def __init__(self, data_dir: Path):
        data_dir.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(data_dir / DB_FILE, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA foreign_keys = ON")
        self._db.executescript(SCHEMA)
        self._lock = threading.Lock()

    def close(self) -> None:
        self._db.close()

    # --- Cuentas ---

    def create_user(self, email: str, password_hash: str, role: str, now: datetime) -> User | None:
        """La cuenta nueva, o None si ya existe una con ese correo."""
        user = User(str(uuid.uuid4()), email, password_hash, role, now)
        with self._lock, self._db:
            try:
                self._db.execute(
                    "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                    (user.id, email, password_hash, role, now.isoformat()),
                )
            except sqlite3.IntegrityError:
                return None
        return user

    def user_by_email(self, email: str) -> User | None:
        return self._user("SELECT * FROM users WHERE email = ?", email)

    def user_by_id(self, user_id: str) -> User | None:
        return self._user("SELECT * FROM users WHERE id = ?", user_id)

    def update_password_hash(self, user_id: str, password_hash: str) -> None:
        with self._lock, self._db:
            self._db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))

    def _user(self, query: str, value: str) -> User | None:
        with self._lock:
            row = self._db.execute(query, (value,)).fetchone()
        if row is None:
            return None
        return User(row["id"], row["email"], row["password_hash"], row["role"], datetime.fromisoformat(row["created_at"]))

    # --- Sesiones ---

    def start_session(self, user_id: str, now: datetime) -> str:
        """Familia nueva con su primer token de renovación, que se devuelve en claro una sola vez."""
        family = str(uuid.uuid4())
        with self._lock, self._db:
            self._db.execute("INSERT INTO families (id, user_id, created_at) VALUES (?, ?, ?)", (family, user_id, now.isoformat()))
            return self._new_token(family, now)

    def rotate(self, token: str, now: datetime) -> tuple[str, str]:
        """(token nuevo, user_id). Reutilizar un token ya rotado revoca toda su familia."""
        rejected: str | None = None
        with self._lock, self._db:
            row = self._db.execute(
                "SELECT t.family_id, t.expires_at, t.rotated_at, f.user_id, f.revoked_at "
                "FROM refresh_tokens t JOIN families f ON f.id = t.family_id WHERE t.hash = ?",
                (hash_token(token),),
            ).fetchone()
            if row is None or row["revoked_at"] is not None:
                rejected = "Sesión inexistente o cerrada"
            elif row["rotated_at"] is not None:
                # La revocación se guarda al salir del bloque; la excepción va fuera para no deshacerla.
                self._db.execute("UPDATE families SET revoked_at = ? WHERE id = ?", (now.isoformat(), row["family_id"]))
                rejected = "Token de renovación reutilizado: se cerró la sesión"
            elif datetime.fromisoformat(row["expires_at"]) <= now:
                rejected = "Sesión caducada"
            else:
                self._db.execute(
                    "UPDATE refresh_tokens SET rotated_at = ? WHERE hash = ?", (now.isoformat(), hash_token(token))
                )
                return self._new_token(row["family_id"], now), row["user_id"]
        raise RefreshRejected(rejected)

    def revoke(self, token: str, now: datetime) -> None:
        with self._lock, self._db:
            row = self._db.execute("SELECT family_id FROM refresh_tokens WHERE hash = ?", (hash_token(token),)).fetchone()
            if row is not None:
                self._db.execute(
                    "UPDATE families SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?", (now.isoformat(), row["family_id"])
                )

    def _new_token(self, family: str, now: datetime) -> str:
        token = secrets.token_urlsafe(32)
        self._db.execute(
            "INSERT INTO refresh_tokens (hash, family_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (hash_token(token), family, now.isoformat(), (now + timedelta(days=REFRESH_DAYS)).isoformat()),
        )
        return token
