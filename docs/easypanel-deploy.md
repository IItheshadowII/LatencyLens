# Despliegue en EasyPanel — API y Frontend por separado

Esta guía explica cómo desplegar la API (`apps/api`) y la Web (`apps/web`) por separado en EasyPanel (o en cualquier panel que gestione contenedores), usando las imágenes/Dockerfiles existentes en el repositorio.

Propósito
- Mantener servicios desacoplados: API y Frontend corren como contenedores separados.
- Evitar bind de puertos al host (EasyPanel prefiere `expose`/red interna). Si necesitas acceso público, usa la configuración del panel para exponer puertos o un proxy inverso.

Resumen rápido
1. Construir imágenes (local o en CI) para `api` y `web` usando `Dockerfile.api` y `Dockerfile.web`.
2. Subir las imágenes a un registry (GitHub Container Registry, Docker Hub, etc.) o usar el build dentro de EasyPanel si lo soporta.
3. Crear dos servicios en EasyPanel: `latencylens-api` y `latencylens-web`.
4. Configurar variables de entorno correctamente: `VITE_API_BASE`, `CORS_ORIGIN`, `DATABASE_PATH`, `PORT`, etc.
5. Configurar volúmenes (persistencia SQLite) y reglas de seguridad (CORS, allowed hosts, proxys).

Recomendaciones previas
- Si vas a ejecutar en producción, usa un registry privado o GitHub Container Registry (GHCR) y despliega las imágenes desde ahí.
- Nunca dejes secrets en archivos del repositorio. Usa la UI de EasyPanel para variables de entorno secretas.
- Para tests locales rápidos, puedes usar `docker compose` con `docker-compose.override.yml` que mapea puertos a localhost (ya presente en este repo como archivo local de ejemplo).

Variables principales y qué hacen
- `VITE_API_BASE` — URL base que el frontend usa para llamar a la API. En EasyPanel normalmente será `http://<api-service-host>:<port>` o la URL pública del servicio API si el frontend corre en un dominio distinto.
- `CORS_ORIGIN` — dominio permitido por la API (ej. `https://example.com` o `http://frontend:80` si usan red interna).
- `PORT` — puerto en que la API escucha dentro del contenedor (por defecto 3001 en este repo).
- `DATABASE_PATH` — ruta al archivo SQLite dentro del contenedor/volumen (por ejemplo `/data/praxis.sqlite`).

Opción A — Build local y push a registry (recomendado si EasyPanel no construye)

1) Build API y web localmente y taggea las imágenes (ejemplo con GHCR):

```powershell
# Autenticarte en GHCR (ejemplo GitHub)
docker login ghcr.io -u YOUR_GH_USER

# Build API
docker build -f Dockerfile.api -t ghcr.io/YOUR_GH_USER/latencylens-api:latest .
# Build Web
docker build -f Dockerfile.web -t ghcr.io/YOUR_GH_USER/latencylens-web:latest .

# Push
docker push ghcr.io/YOUR_GH_USER/latencylens-api:latest
docker push ghcr.io/YOUR_GH_USER/latencylens-web:latest
```

2) En EasyPanel crea dos servicios y usa esas imágenes (o el nombre del repositorio del registry). Configura las siguientes env vars en cada servicio:

- Servicio `latencylens-api`:
  - Image: `ghcr.io/YOUR_GH_USER/latencylens-api:latest`
  - Expose/Ports: exponer puerto interno 3001 (no es necesario mapear al host si EasyPanel usa proxy interno). En EasyPanel: marca `expose 3001` o configura puerto interno según UI.
  - Env:
    - PORT=3001
    - CORS_ORIGIN=https://TU_FRONTEND_DOMAIN (o http://frontend:80 si usan red interna)
    - DATABASE_PATH=/data/praxis.sqlite
    - RATE_LIMIT_* (si aplica)
  - Volumes:
    - Host o managed volume -> container `/data` (importante para persistencia SQLite).

- Servicio `latencylens-web`:
  - Image: `ghcr.io/YOUR_GH_USER/latencylens-web:latest`
  - Expose/Ports: exponer puerto 80 (el contenedor web sirve en 80), o el puerto del Dockerfile.
  - Env / Build args:
    - VITE_API_BASE=https://api.tudomain.com  (o la URL pública del API o la URL interna si los servicios comparten red)

3) Si el frontend y la API quedan en dominios distintos, asegúrate de que `CORS_ORIGIN` en la API coincide con la URL pública del frontend.

Opción B — Usar build dentro de EasyPanel

- Si EasyPanel puede construir imágenes desde tu repo (git provider): configura un build por cada servicio apuntando al contexto y al Dockerfile correcto:
  - API: build context `.` y Dockerfile `Dockerfile.api` (o `apps/api` según tu estructura).
  - Web: build context `.` y Dockerfile `Dockerfile.web`.
- Ventaja: no necesitas subir imágenes a un registry. Desventaja: build time y permisos.

Detalles de red y CORS
- Si ambos servicios quedan en la misma red interna y el frontend se sirve desde la misma red, puedes usar `http://latencylens-api:3001` como `VITE_API_BASE` en el contenedor web (cuando ambos en la misma red). Sin embargo, en el navegador final, `VITE_API_BASE` debe ser una URL accesible desde el navegador del usuario (si el usuario navega a https://app.example.com, las llamadas fetch deben usar https://api.example.com o la misma host-origen).
- Si no puedes controlar CORS en el probe que mides, puedes mantener la proxy que añadimos en la API (endpoints `/api/proxy/*`) para evitar problemas de CORS, pero lo ideal es que el probe permita CORS y configurarlo en `Deploy-ConnectionProbe.ps1` si tienes control de esos IIS.

Persistencia de la DB (SQLite)
- SQLite necesita un volumen persistente. En EasyPanel crea un volumen o bind mount y monta en `/app/data` o la ruta que uses (ver `apps/api` `DATABASE_PATH`). Ejemplo:
  - Volume host: `/opt/latencylens/data` -> container `/data`
  - `DATABASE_PATH=/data/praxis.sqlite`
- Respaldos: haz snapshot o copia periódica del archivo `.sqlite`.

Ejemplo minimal de env por servicio
- API envs:
  - PORT=3001
  - CORS_ORIGIN=https://app.tudominio.com
  - DATABASE_PATH=/data/praxis.sqlite
- Web envs (si construyes la imagen con variable en build):
  - VITE_API_BASE=https://api.tudominio.com

Comprobaciones post-deploy
1. API: curl desde el host del panel o desde tu máquina:
```powershell
curl -i https://api.tudominio.com/healthz
```
Respuesta esperada: 200 OK y `ok`.

2. Web: abrir la URL pública del frontend y revisar consola/network. Verifica que las llamadas a la API van a la URL configurada y que no hay errores CORS.

3. Logs: usa la interfaz de EasyPanel para revisar logs de ambos servicios. Si el API no puede escribir SQLite, revisa permisos y path del volumen.

Solución de problemas comunes
- CORS errors: verifica `CORS_ORIGIN` y que la respuesta del servidor incluya `Access-Control-Allow-Origin` para la petición solicitante.
- SQLite locked / permisos: asegúrate que el contenedor tenga permisos de escritura en el volumen (UID/GID si aplica).
- Variables de build para Vite: si tu `VITE_API_BASE` se inyecta en tiempo de build, asegúrate de rebuildear la imagen del frontend si cambias esa URL; alternativa: configurar el frontend para leer la URL en runtime desde una ruta `/env` servida por la API o por un archivo estático montado.

Notas de seguridad
- No expongas la base de datos directamente al host.
- Usa HTTPS (certificados) para frontend y API en producción.
- Protege endpoints de administración (`/admin`) con auth o acceso restringido.

¿Quieres que lo haga por vos?
- Puedo:
  - 1) Añadir un `docs/easypanel-deploy.md` (ya creado). ✅
  - 2) Generar sample systemd/pm2/docker-run scripts para arrancar la API en un host remoto.
  - 3) Crear GitHub Actions para build + push a GHCR cuando merges a main.

Dime qué prefieres (2 o 3) o si quieres que genere ejemplos de configuración de servicio EasyPanel (capturas JSON / form fields) específicos para tu panel y lo commitee en la rama actual.