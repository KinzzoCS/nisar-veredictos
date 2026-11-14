"""API de acceso (specs/06-acceso, T-ANT-14). Se arranca con `uvicorn --factory auth.main:create_app`."""
from __future__ import annotations

import os
import re
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import FastAPI, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from .store import REFRESH_DAYS, RefreshRejected, Store
from .tokens import ACCESS_SECONDS, InvalidToken, Signer, load_or_create_key

COOKIE = "refresh"
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}
WRONG_LOGIN = "Correo o contraseña incorrectos"
NO_VERIFICATION = (
    "El correo no se verifica en esta versión: el perfil es declarado, no comprobado (constitución X.3)."
)


def _utc(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _normalize_email(value: str) -> str:
    value = value.strip().lower()
    if len(value) > 254 or not EMAIL.match(value):
        raise ValueError("Correo no válido")
    return value


class Credentials(BaseModel):
    email: str = Field(description="Correo de la cuenta. Se guarda en minúsculas y no se verifica.", max_length=254)
    password: str = Field(
        min_length=12,
        max_length=1024,
        description="Mínimo 12 caracteres, sin reglas de composición (RF-ACC-04).",
    )

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return _normalize_email(value)


class RegisterIn(Credentials):
    role: Literal["student", "researcher"] = Field(
        description="Perfil declarado por la persona; no se verifica (constitución X.3). `public` no necesita cuenta."
    )


class TokenOut(BaseModel):
    access_token: str = Field(description="JWT EdDSA de 15 minutos. Se guarda en memoria, nunca en localStorage.")
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int = Field(description="Segundos de vida del token de acceso.")
    role: Literal["student", "researcher"]
    email_verified: Literal[False] = Field(default=False, description=NO_VERIFICATION)


class MeOut(BaseModel):
    sub: str = Field(description="Identificador de la cuenta (UUID).")
    email: str
    role: Literal["student", "researcher"]
    created_at: str = Field(description="Hora UTC de creación, ISO 8601.")
    email_verified: Literal[False] = Field(default=False, description=NO_VERIFICATION)


class Jwk(BaseModel):
    kty: Literal["OKP"]
    crv: Literal["Ed25519"]
    x: str
    kid: str
    alg: Literal["EdDSA"]
    use: Literal["sig"]


class JwksOut(BaseModel):
    keys: list[Jwk]


def create_app(
    data_dir: Path | None = None,
    private_key_pem: str | None = None,
    clock: Callable[[], datetime] | None = None,
    cookie_secure: Literal["auto", "true", "false"] | None = None,
    cookie_path: str | None = None,
) -> FastAPI:
    data_dir = data_dir or Path(os.environ.get("AUTH_DATA_DIR", "data/auth"))
    private_key_pem = private_key_pem if private_key_pem is not None else os.environ.get("AUTH_PRIVATE_KEY") or None
    now = clock or (lambda: datetime.now(timezone.utc))
    secure_mode = cookie_secure or os.environ.get("AUTH_COOKIE_SECURE", "auto")
    path = cookie_path or os.environ.get("AUTH_COOKIE_PATH", "/api/auth/")

    store = Store(data_dir)
    signer = Signer(load_or_create_key(data_dir, private_key_pem))
    hasher = PasswordHasher()  # Argon2id con los parámetros por omisión de argon2-cffi.
    # Hash de relleno: si el correo no existe se verifica contra él, para tardar lo mismo que con uno real.
    dummy_hash = hasher.hash("contraseña de relleno para igualar tiempos")

    app = FastAPI(
        title="NISAR auth",
        version="0.1.0",
        description="Cuentas, sesiones y tokens de los perfiles. Ningún perfil cambia lo que dice un veredicto "
        "(constitución X.1): solo añade herramientas y cuotas.",
    )

    def is_secure(request: Request) -> bool:
        if secure_mode in ("true", "false"):
            return secure_mode == "true"
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        hostname = host.rsplit(":", 1)[0] if not host.startswith("[") else host.split("]")[0] + "]"
        return hostname not in LOCAL_HOSTS

    def set_refresh(response: Response, request: Request, token: str) -> None:
        response.set_cookie(
            COOKIE,
            token,
            max_age=REFRESH_DAYS * 24 * 3600,
            path=path,
            httponly=True,
            samesite="strict",
            secure=is_secure(request),
        )

    def clear_refresh(response: Response, request: Request) -> None:
        response.delete_cookie(COOKIE, path=path, httponly=True, samesite="strict", secure=is_secure(request))

    def access(user_id: str, role: str) -> TokenOut:
        return TokenOut(access_token=signer.issue(user_id, role, now()), expires_in=ACCESS_SECONDS, role=role)

    def bearer(authorization: str | None) -> str | None:
        """El token de `Authorization: Bearer`, None sin cabecera; 401 si la cabecera no es Bearer."""
        if authorization is None:
            return None
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise unauthorized("La cabecera Authorization debe ser 'Bearer <token>'")
        return token.strip()

    def unauthorized(detail: str) -> HTTPException:
        return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": 'Bearer error="invalid_token"'})

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenOut)
    def register(body: RegisterIn, request: Request, response: Response) -> TokenOut:
        """Crea la cuenta y abre la sesión: devuelve el token de acceso y fija la cookie de renovación."""
        user = store.create_user(body.email, hasher.hash(body.password), body.role, now())
        if user is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay una cuenta con ese correo")
        set_refresh(response, request, store.start_session(user.id, now()))
        return access(user.id, user.role)

    @app.post("/login", response_model=TokenOut, responses={401: {"description": WRONG_LOGIN}})
    def login(body: Credentials, request: Request, response: Response) -> TokenOut:
        """Misma respuesta si el correo no existe o la contraseña no coincide (RF-ACC-04)."""
        user = store.user_by_email(body.email)
        try:
            hasher.verify(user.password_hash if user else dummy_hash, body.password)
        except (VerificationError, InvalidHashError):
            raise unauthorized(WRONG_LOGIN) from None
        if user is None:
            raise unauthorized(WRONG_LOGIN)
        if hasher.check_needs_rehash(user.password_hash):
            store.update_password_hash(user.id, hasher.hash(body.password))
        set_refresh(response, request, store.start_session(user.id, now()))
        return access(user.id, user.role)

    @app.post("/refresh", response_model=TokenOut, responses={401: {"description": "Sesión inexistente, caducada, cerrada o reutilizada"}})
    def refresh(request: Request, response: Response) -> TokenOut | JSONResponse:
        """Rota el token de la cookie. Reutilizar uno ya rotado cierra toda la sesión (RF-ACC-03)."""
        token = request.cookies.get(COOKIE)
        if not token:
            raise unauthorized("Sin sesión")
        try:
            new_token, user_id = store.rotate(token, now())
        except RefreshRejected as error:
            failed = JSONResponse({"detail": str(error)}, status_code=401, headers={"WWW-Authenticate": 'Bearer error="invalid_token"'})
            clear_refresh(failed, request)
            return failed
        user = store.user_by_id(user_id)
        if user is None:
            raise unauthorized("La cuenta ya no existe")
        set_refresh(response, request, new_token)
        return access(user.id, user.role)

    @app.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(request: Request) -> Response:
        """Cierra la sesión de la cookie (toda su familia) y la borra."""
        token = request.cookies.get(COOKIE)
        if token:
            store.revoke(token, now())
        response = Response(status_code=status.HTTP_204_NO_CONTENT)
        clear_refresh(response, request)
        return response

    @app.get("/me", response_model=MeOut, responses={401: {"description": "Sin token o token no válido"}})
    def me(authorization: str | None = Header(default=None)) -> MeOut:
        token = bearer(authorization)
        if token is None:
            raise unauthorized("Hace falta iniciar sesión")
        try:
            claims = signer.verify(token, now())
        except InvalidToken as error:
            raise unauthorized(f"Token no válido: {error}") from None
        user = store.user_by_id(claims.sub)
        if user is None:
            raise unauthorized("La cuenta ya no existe")
        return MeOut(sub=user.id, email=user.email, role=user.role, created_at=_utc(user.created_at))

    @app.get(
        "/verify",
        status_code=200,
        responses={
            200: {"description": "Token válido o sin token. Cabeceras X-Auth-Role (public, student o researcher) y X-Auth-Sub."},
            401: {"description": "Token roto, caducado, con otra firma o de otra audiencia. Nunca se degrada a public."},
        },
    )
    def verify(authorization: str | None = Header(default=None)) -> Response:
        """Solo para el gateway (`auth_request`). Comprueba la firma en memoria, sin tocar la base de datos (RF-ACC-05 y 06)."""
        token = bearer(authorization)
        if token is None:
            return Response(status_code=200, headers={"X-Auth-Role": "public"})
        try:
            claims = signer.verify(token, now())
        except InvalidToken as error:
            raise unauthorized(f"Token no válido: {error}") from None
        return Response(status_code=200, headers={"X-Auth-Role": claims.role, "X-Auth-Sub": claims.sub})

    @app.get("/.well-known/jwks.json", response_model=JwksOut)
    def jwks() -> dict:
        """Clave pública, por si un tercero quiere validar los tokens."""
        return signer.jwks()

    app.state.store = store
    return app
