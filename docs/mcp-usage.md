# Uso del MCP (Model Context Protocol) en LatencyLens

Este documento explica cómo se ha provisionado y cómo usar el contexto (MCP) para asistentes/Copilot en este repositorio.

Contenido
- `/.github/copilot-instructions.md` — archivo principal que contiene las instrucciones de contexto para Copilot/MCP. Contiene la arquitectura, rutas clave, workflows y variables de entorno.

¿Qué hace esto?
- Provee contexto claro y específico para asistentes automáticos (Copilot, MCP) que trabajan con el repositorio.
- No es un servidor ni un servicio en ejecución; es un archivo de instrucciones estático que las herramientas pueden leer.

Cómo usarlo localmente
1. Asegúrate de que la rama actual contiene el archivo `/.github/copilot-instructions.md` (ya está en `fix/easypanel-no-ports`).
2. Si usas un asistente que soporta MCP/archivos de contexto, apunta la herramienta a este archivo. Las recomendaciones del archivo están en la cabecera y en la sección "Big picture architecture".

Buenas prácticas
- Mantén la información actualizada y concisa: incluye rutas de archivos críticos, comandos comunes y variables de entorno.
- No incluyas secretos, tokens o claves en este archivo. Usa `.env` y mecanismos seguros para secretos.
- Para despliegues automatizados o servidores MCP externos, crea un `mcp.json` separado con metadatos (si tu herramienta lo requiere).

Opciones avanzadas
- Si quieres un servidor MCP (service que sirva contexto a asistentes):
  1. Define un pequeño servidor (por ejemplo `scripts/mcp-server.js`) que sirva `/.github/copilot-instructions.md` y otros archivos relacionados.
  2. Asegura el acceso con autenticación o whitelist de IPs antes de exponerlo públicamente.
  3. Documenta la URL del servidor en `README.md` o en la sección de deploy.

Próximos pasos sugeridos
- (Opcional) Añadir `mcp.json` en la raíz con metadatos si alguna herramienta lo requiere.
- (Opcional) Crear `docs/mcp-deploy.md` con pasos para desplegar un servidor MCP seguro.

Contacto
- Mantén este archivo breve; si necesitas que genere `mcp.json` o el servidor MCP, responde aquí y lo implemento.

---
Archivo generado y preparado para commit en la rama `fix/easypanel-no-ports`.
