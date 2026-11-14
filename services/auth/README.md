# auth

Cuentas, sesiones y tokens de los perfiles de la API (ola 2, [`specs/06-acceso`](../../specs/06-acceso/spec.md), T-ANT-14). Dueño: Antena.

Ningún perfil cambia lo que dice un veredicto (constitución X): una cuenta solo añade herramientas y cuotas. Sin cuenta se es `public`, y ninguna ruta actual pide token.

## Rutas

El gateway las publica bajo `/api/auth/` (T-BAL-10). Contrato: [`contracts/auth.openapi.json`](../../contracts/auth.openapi.json).

| Ruta | Método | Qué hace |
|---|---|---|
| `/register` | POST | `{email, password, role: student \| researcher}`. Crea la cuenta, devuelve el token de acceso y fija la cookie de renovación |
| `/login` | POST | `{email, password}`. Igual. Misma respuesta 401 si el correo no existe o la contraseña no coincide |
| `/refresh` | POST | Rota el token de la cookie y devuelve un token de acceso nuevo. Reutilizar uno ya rotado cierra toda la sesión |
| `/logout` | POST | Cierra la sesión de la cookie y la borra |
| `/me` | GET | `{sub, email, role, created_at, email_verified: false}` con `Authorization: Bearer` |
| `/verify` | GET | Solo para el gateway (`auth_request`). Sin `Authorization`, 200 con `X-Auth-Role: public`; con token válido, 200 con `X-Auth-Role` y `X-Auth-Sub`; con token no válido, 401. No toca la base de datos |
| `/.well-known/jwks.json` | GET | Clave pública Ed25519 |
| `/health` | GET | `{"status": "ok"}` |

## Tokens

- **Acceso:** JWT EdDSA (Ed25519) de 15 minutos con `iss=nisar-veredictos`, `aud=nisar-api`, `sub`, `role`, `iat`, `exp` y `jti`, y la huella de la clave en `kid`.
- **Renovación:** 32 bytes aleatorios en la cookie `refresh` (`HttpOnly`, `SameSite=Strict`, `Path=/api/auth/`, 7 días). Lleva `Secure` salvo cuando el `Host` o `X-Forwarded-Host` es localhost. En la base solo se guarda su SHA-256.
- **Contraseñas:** Argon2id, mínimo 12 caracteres y sin reglas de composición. El correo no se verifica, y la API lo dice con `email_verified: false`.

## Configuración

| Variable | Por omisión | Uso |
|---|---|---|
| `AUTH_DATA_DIR` | `data/auth` (`/data/auth` en la imagen) | SQLite (`auth.sqlite3`) y, si no hay `AUTH_PRIVATE_KEY`, la clave generada (`ed25519.pem`, permisos 600). Va en un volumen, nunca en git |
| `AUTH_PRIVATE_KEY` | — | Clave Ed25519 en PEM (PKCS8). Si falta, se genera al primer arranque y se avisa en el registro. Rotarla cierra todas las sesiones |
| `AUTH_COOKIE_SECURE` | `auto` | `true`, `false` o `auto` (Secure salvo en localhost) |
| `AUTH_COOKIE_PATH` | `/api/auth/` | Ruta de la cookie de renovación, la que ve el navegador detrás del gateway |

## Desarrollo

```bash
pip install -e ".[dev]"
pytest -q
python -m auth.export_openapi ../../contracts/auth.openapi.json
uvicorn --factory auth.main:create_app --port 8000
```

Dependencias y licencias (comprobadas en PyPI el 2026-11-14): PyJWT (MIT), cryptography (Apache-2.0 o BSD-3-Clause), argon2-cffi y argon2-cffi-bindings (MIT), cffi (MIT-0) y pycparser (BSD-3-Clause).

Pendiente en otras tareas: las cuentas de prueba con contraseñas del `.env` (T-ANT-15), los tokens personales de `researcher` (T-ANT-18) y el servicio en `docker-compose.yml` y el gateway (Balanza, T-BAL-10).
