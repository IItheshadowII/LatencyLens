# Praxis Connection Test

Aplicación completa para medir la conexión real desde el navegador del usuario hacia un Cloud específico de Praxis, con backend central opcional para guardar historial.

## Requisitos
- Node.js 18+
- npm o pnpm
- En cada Cloud: Windows Server 2022 con IIS disponible

## Estructura
- `apps/web` — Frontend Vite + React + TypeScript
- `apps/api` — Backend Node + Express + TypeScript + SQLite
- `deploy/Deploy-ConnectionProbe.ps1` — Script para publicar `/connection-probe` en cada Cloud
- `docs/architecture.md` — Diagrama y explicación técnica

## Instalación (dev)
1. Instalar dependencias en el monorepo.
2. Levantar API y Web en paralelo.

## Variables de entorno
### Backend (`apps/api/.env`)
```
PORT=3001
CORS_ORIGIN=http://localhost:5173
TRUST_PROXY=false
DATABASE_PATH=./data/praxis.sqlite
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
```

### Frontend (`apps/web/.env`)
```
VITE_API_BASE=http://localhost:3001
```

## Deploy de la web central
1. Construir el frontend (`apps/web`) y publicar `dist/` en la VM central.
2. Configurar `VITE_API_BASE` para apuntar al backend central (si se usa historial).

## Deploy del backend central
1. Construir el backend (`apps/api`).
2. Ejecutar `node dist/index.js` con las variables de entorno.
3. Verificar `/healthz` y `/admin`.

## Deploy con Docker (LAN)
Este modo es ideal si el host Docker está en la misma LAN que los Clouds `praxisclouds`.

1. Ajustar `docker-compose.yml`:
	- `CORS_ORIGIN`: URL pública del frontend (ej: `https://test.praxisclouds.com`)
	- `VITE_API_BASE`: URL pública del backend (ej: `https://api.praxisclouds.com` o IP LAN)
2. Construir y levantar:

```powershell
docker compose build
docker compose up -d
```

URLs por defecto:
- Web: `http://localhost:8080`
- API: `http://localhost:3001`
- Admin: `http://localhost:3001/admin`

## Deploy del probe en cada Cloud
Ejecutar el script en cada VM Windows Server 2022:
- Instala IIS + ASP.NET 4.5
- Crea `C:\inetpub\connection-probe`
- Publica `ping.aspx`, `download.ashx`, `upload.ashx`

Parámetros relevantes:
- `-EnableCors` y `-CorsAllowOrigin` para permitir llamadas desde la web central
- `-MaxDownloadBytes` para limitar la descarga
- `-SiteName` y `-AppAlias` para personalizar IIS

## Checklist de troubleshooting
- **CORS**: habilitar `-EnableCors` y confirmar el `Access-Control-Allow-Origin`.
- **SSL**: el Cloud debe exponer HTTPS válido.
- **Bindings IIS**: verificar que el sitio tenga binding https y el alias correcto.
- **Firewall**: permitir tráfico HTTPS hacia el Cloud.
- **Timeouts**: si hay pérdidas altas, revisar red local o latencia del ISP.

## Comandos
### Dev
```powershell
npm install
npm run dev
```

### Build
```powershell
npm install
npm run build
```

### Prod (Node)
```powershell
npm install --production
npm run build
npm run start
```

### Docker (LAN)
```powershell
docker compose build
docker compose up -d
```

## Deploy en EasyPanel (sin ports)

Para compatibilidad con EasyPanel, el `docker-compose.yml` de este repo **no publica puertos** con `ports:`.
En su lugar, cada servicio declara solo puertos internos mediante `expose:`:

- `api` expone el puerto interno `3001` (`PORT=3001`).
- `web` expone el puerto interno `80` (servidor web dentro del contenedor).

EasyPanel se encarga de mapear estos puertos internos hacia el exterior a través de la sección **Dominios/Redirecciones**.
No es necesario (ni recomendable) definir `ports:` en el compose cuando se usa EasyPanel.

### URLs internas entre servicios

Dentro del stack Docker/EasyPanel, los servicios se hablan por hostname de servicio:

- El frontend se construye con `VITE_API_BASE` apuntando a `http://api:3001`.
- La API permite CORS desde `http://web:80`.

Si necesitás ajustar estos valores para otro puerto interno, modificá:

- En `docker-compose.yml`, variable `PORT` del servicio `api` y el argumento `VITE_API_BASE` del servicio `web`.

### Ejemplo de dominios en EasyPanel

En EasyPanel, configurá algo como:

- Web: `https://web.example.com` → servicio `web`, puerto interno `80`.
- API: `https://api.example.com` → servicio `api`, puerto interno `3001`.

La configuración pública de SSL y dominios se hace íntegramente en EasyPanel; el compose solo define los servicios y sus puertos internos.

## Skill Copilot: crear repo en GitHub
Este repo incluye un skill para crear un repositorio local y remoto en GitHub, pedir autenticación web, hacer commit y push, y verificar el resultado.

- Documentación: `docs/skills/skill-crear-repo-github.md`
- Script: `scripts/skill-github-repo.ps1`
