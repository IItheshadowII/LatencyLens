# Ejecutar comandos localmente o por SSH (script helper)

Este documento explica cómo usar `scripts/run-cmd.ps1`, un helper PowerShell incluido en el repo para ejecutar comandos localmente o vía SSH y guardar la salida en `logs/`.

Uso básico (PowerShell en Windows):

- Ejecutar localmente:

```
.\scripts\run-cmd.ps1 -Command "docker ps"
```

- Ejecutar por SSH (reemplaza user@host):

```
.\scripts\run-cmd.ps1 -RemoteHost example.com -User ubuntu -Command "docker ps"
```

Salida
- El script crea `logs/run-<timestamp>.log` con la salida (stdout+stderr). Añade `logs/` a `.gitignore` para evitar subir logs al repo.

Seguridad
- El script no almacena contraseñas. Usa tu llavero SSH o agente SSH para autenticación. No ejecutes código de orígenes no confiables.

Limitaciones
- El script ejecuta el comando tal cual — si necesitas interacción (prompts), remotos con tty, o pasar contraseñas, tendrás que usar una sesión SSH interactiva.
