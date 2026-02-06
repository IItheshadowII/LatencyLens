param(
  [switch]$EnableCors,
  [string]$CorsAllowOrigin = "*",
  [int]$MaxDownloadBytes = 8388608,
  [string]$SiteName = "Default Web Site",
  [string]$AppAlias = "connection-probe"
)

$ErrorActionPreference = "Stop"

Write-Host "Installing IIS + ASP.NET features..."
Install-WindowsFeature Web-Server, Web-Default-Doc, Web-Static-Content, Web-Asp-Net45, Web-ISAPI-Ext, Web-ISAPI-Filter | Out-Null

Import-Module WebAdministration

$appPath = "C:\inetpub\$AppAlias"
if (-not (Test-Path $appPath)) {
  New-Item -Path $appPath -ItemType Directory | Out-Null
}

$poolName = "${AppAlias}-pool"
if (-not (Test-Path "IIS:\AppPools\$poolName")) {
  New-WebAppPool -Name $poolName | Out-Null
  Set-ItemProperty "IIS:\AppPools\$poolName" -Name managedRuntimeVersion -Value "v4.0"
  Set-ItemProperty "IIS:\AppPools\$poolName" -Name managedPipelineMode -Value "Integrated"
}

if (-not (Get-WebApplication -Site $SiteName -Name $AppAlias -ErrorAction SilentlyContinue)) {
  New-WebApplication -Site $SiteName -Name $AppAlias -PhysicalPath $appPath -ApplicationPool $poolName | Out-Null
}

$indexHtml = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Praxis Connection Probe</title>
</head>
<body>
  <h2>Praxis Connection Probe</h2>
  <p>OK</p>
</body>
</html>
"@

$pingAspx = @"
<%@ Page Language="C#" %>
<%
  Response.ContentType = "application/json";
  Response.Cache.SetCacheability(System.Web.HttpCacheability.NoCache);
  Response.Cache.SetNoStore();
  var utc = System.DateTime.UtcNow.ToString("o");
  var ticks = System.DateTime.UtcNow.Ticks;
  Response.Write("{\"serverUtc\":\"" + utc + "\",\"serverTicks\":" + ticks + "}");
%>
"@

$downloadHandler = @"
<%@ WebHandler Language="C#" Class="DownloadHandler" %>
using System;
using System.Web;
using System.Configuration;

public class DownloadHandler : IHttpHandler
{
  public void ProcessRequest(HttpContext context)
  {
    context.Response.ContentType = "application/octet-stream";
    context.Response.Cache.SetCacheability(System.Web.HttpCacheability.NoCache);
    context.Response.Cache.SetNoStore();

    int maxBytes = 8388608;
    int.TryParse(ConfigurationManager.AppSettings["MaxDownloadBytes"], out maxBytes);
    int requested = maxBytes;
    int.TryParse(context.Request.QueryString["bytes"], out requested);
    if (requested <= 0 || requested > maxBytes)
    {
      requested = maxBytes;
    }

    context.Response.BufferOutput = false;
    byte[] buffer = new byte[8192];
    int remaining = requested;
    while (remaining > 0)
    {
      int chunk = Math.Min(buffer.Length, remaining);
      context.Response.OutputStream.Write(buffer, 0, chunk);
      remaining -= chunk;
    }
  }

  public bool IsReusable { get { return false; } }
}
"@

$uploadHandler = @"
<%@ WebHandler Language="C#" Class="UploadHandler" %>
using System;
using System.Web;

public class UploadHandler : IHttpHandler
{
  public void ProcessRequest(HttpContext context)
  {
    long total = 0;
    byte[] buffer = new byte[8192];
    int read;
    while ((read = context.Request.InputStream.Read(buffer, 0, buffer.Length)) > 0)
    {
      total += read;
    }

    context.Response.ContentType = "application/json";
    context.Response.Cache.SetCacheability(System.Web.HttpCacheability.NoCache);
    context.Response.Cache.SetNoStore();
    context.Response.Write("{\"receivedBytes\":" + total + "}");
  }

  public bool IsReusable { get { return false; } }
}
"@

$corsHeaderBlock = ""
if ($EnableCors) {
  $corsHeaderBlock = @"
        <add name="Access-Control-Allow-Origin" value="$CorsAllowOrigin" />
        <add name="Access-Control-Allow-Methods" value="GET, POST, OPTIONS" />
        <add name="Access-Control-Allow-Headers" value="Content-Type" />
"@
}

$webConfig = @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <appSettings>
    <add key="MaxDownloadBytes" value="$MaxDownloadBytes" />
  </appSettings>
  <system.webServer>
    <httpProtocol>
      <customHeaders>
        <add name="Cache-Control" value="no-store, no-cache, must-revalidate" />
        <add name="Pragma" value="no-cache" />
        <add name="Expires" value="0" />
$corsHeaderBlock      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
"@

Set-Content -Path (Join-Path $appPath "index.html") -Value $indexHtml -Encoding UTF8
Set-Content -Path (Join-Path $appPath "ping.aspx") -Value $pingAspx -Encoding UTF8
Set-Content -Path (Join-Path $appPath "download.ashx") -Value $downloadHandler -Encoding UTF8
Set-Content -Path (Join-Path $appPath "upload.ashx") -Value $uploadHandler -Encoding UTF8
Set-Content -Path (Join-Path $appPath "web.config") -Value $webConfig -Encoding UTF8

Write-Host "Connection probe deployed to $SiteName/$AppAlias"
