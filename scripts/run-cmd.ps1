<#
.SYNOPSIS
  Ejecuta un comando localmente o por SSH y guarda la salida en un archivo de log.

.DESCRIPTION
  Uso seguro y simple para ejecutar comandos tanto en la máquina local como
  en un host remoto accesible por SSH. No almacena credenciales.

.PARAMETER Host
  (Opcional) Host remoto. Forma: host.example.com o IP. Si se pasa, el comando se
  ejecuta vía SSH en el host remoto.

.PARAMETER User
  (Opcional) Usuario para SSH. Si se omite y `Host` está presente, se intentará
  usar el usuario actual o la configuración SSH por defecto.

.PARAMETER Command
  (Requerido) El comando a ejecutar (entre comillas si contiene espacios).

.PARAMETER OutFile
  (Opcional) Ruta al archivo de salida. Por defecto `logs/run-<timestamp>.log`.

.EXAMPLES
  # Ejecutar localmente
  .\scripts\run-cmd.ps1 -Command "docker ps"

  # Ejecutar por SSH
  .\scripts\run-cmd.ps1 -Host example.com -User ubuntu -Command "docker ps"
#>

param(
    [string]$Host,
    [string]$User,
    [Parameter(Mandatory=$true)][string]$Command,
    [string]$OutFile
)

function Ensure-LogsDir([string]$path)
{
    $dir = Split-Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}

$timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
if (-not $OutFile) { $OutFile = "logs/run-$timestamp.log" }
Ensure-LogsDir $OutFile

if ($Host) {
    $sshTarget = if ($User) { "$User@$Host" } else { $Host }
    Write-Host "[run-cmd] Ejecutando remotamente: $sshTarget -> $Command"
    # Ejecuta el comando remoto via ssh; la salida (stdout/stderr) se guarda en archivo
    ssh $sshTarget $Command 2>&1 | Tee-Object -FilePath $OutFile
} else {
    Write-Host "[run-cmd] Ejecutando localmente -> $Command"
    # Ejecuta en PowerShell; si el comando es para PowerShell puede contener pipes, etc.
    try {
        Invoke-Expression $Command 2>&1 | Tee-Object -FilePath $OutFile
    } catch {
        "ERROR: $_" | Tee-Object -FilePath $OutFile
    }
}

Write-Host "[run-cmd] Salida guardada en: $OutFile"
