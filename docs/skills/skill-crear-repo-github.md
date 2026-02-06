# Skill: crear repositorio en GitHub (Copilot)

Este skill automatiza el flujo completo para:
1. Crear repo local si no existe.
2. Pedir autenticación web en GitHub.
3. Crear el repo remoto en GitHub.
4. Hacer commit inicial y push.
5. Verificar que todo quedó funcionando.

## Contrato
- **Entrada**: nombre del repo (`RepoName`), visibilidad opcional y descripción.
- **Salida**: repo remoto creado, commit y push en `origin`, verificación por `gh` y `git`.
- **Errores**: falta `git`/`gh`, sin permisos en GitHub, conflictos con un `origin` ya configurado.

## Uso rápido
Desde la raíz del repo:

- Ejecutar el script:
  - `scripts/skill-github-repo.ps1 -RepoName "mi-org/mi-repo" -Visibility private -Description "Mi proyecto"`

### Dry run (sin efectos)
- `scripts/skill-github-repo.ps1 -RepoName "mi-org/mi-repo" -DryRun`

## Requisitos
- Git instalado y disponible en PATH.
- GitHub CLI (`gh`) instalado y disponible en PATH.

## Notas
- Si no hay commits previos, crea uno inicial.
- Si ya hay un `origin`, el script no lo sobrescribe.
- El script intentará iniciar sesión vía navegador si no existe sesión activa.
- `-DryRun` imprime los comandos sin ejecutarlos.
