# DymoTag

Webapp til DYMO LetraTag LT-200B — print tekst, QR og Code128 via Web Bluetooth (Chrome/Edge/Brave).

**Prod:** https://dymo.mercantec.tech

## Krav

- Chrome, Edge eller Brave (Web Bluetooth)
- HTTPS eller `localhost`
- Bluetooth tændt + LT-200B i nærheden
- Mercantec Auth-login

### Brave

Web Bluetooth er slået fra som standard. Aktivér:

1. Åbn `brave://flags/#brave-web-bluetooth-api`
2. Sæt **Web Bluetooth API** til **Enabled**
3. Klik **Relaunch**

## Lokal udvikling

```bash
cd web
cp .env.example .env
# Sæt VITE_AUTH_CLIENT_ID
npm install
npm run dev
```

Docker lokalt:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Åbn http://localhost:3000

## Env

| Variabel | Beskrivelse |
|----------|-------------|
| `VITE_AUTH_CLIENT_ID` | Mercantec Auth public client id |

Redirect URI’er der skal være registreret:

- `https://dymo.mercantec.tech/callback`
- `http://localhost:5173/callback` (Vite dev)
- `http://localhost:3000/callback` (Docker lokal)

## Stack

- Vite + React + TypeScript
- `@thermal-label/letratag-web` (BLE-protokol)
- Mercantec Auth (PKCE)
- Docker + nginx + Traefik (`dymo.mercantec.tech`)
