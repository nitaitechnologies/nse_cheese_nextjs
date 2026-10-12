# Build on this PC and load the images on the server.
# Use this when the repo is not on GitHub.
# Example: npm run deploy -- -Server root@203.0.113.10
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [int]$Port = 22,
  [string]$Key = ""
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$alive = @(
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "ServerAliveInterval=15",
  "-o", "ServerAliveCountMax=40",
  "-o", "TCPKeepAlive=yes"
)
$sshArgs = @("-p", "$Port") + $alive
$scpArgs = @("-P", "$Port") + $alive
if ($Key) {
  $sshArgs += @("-i", $Key)
  $scpArgs += @("-i", $Key)
}

function Send-WithRetry([string]$LocalPath, [string]$RemotePath) {
  $name = Split-Path $LocalPath -Leaf
  for ($try = 1; $try -le 5; $try++) {
    Write-Host "Uploading $name (attempt $try of 5)"
    ssh @sshArgs $Server "rm -f '$RemotePath'" | Out-Null
    scp @scpArgs $LocalPath "${Server}:${RemotePath}"
    if ($LASTEXITCODE -eq 0) { return }
    Write-Host "Upload dropped. Waiting 5 seconds, then trying again."
    Start-Sleep -Seconds 5
  }
  throw "Upload failed: $name"
}

Write-Host "Building web and worker images locally"
docker build -f Dockerfile.web -t nse-cheese-web:latest .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker build -f Dockerfile.worker -t nse-cheese-worker:latest .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$webTar = Join-Path $env:TEMP "nse-cheese-web.tar"
$workerTar = Join-Path $env:TEMP "nse-cheese-worker.tar"
Write-Host "Saving images"
docker save -o $webTar nse-cheese-web:latest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker save -o $workerTar nse-cheese-worker:latest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Copying compose files and images to $Server"
Write-Host "The root password is asked again for each connection."
ssh @sshArgs $Server "mkdir -p /opt/nse-cheese && rm -f /tmp/nse-cheese-images.tar"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
scp @scpArgs docker-compose.yml "${Server}:/opt/nse-cheese/"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Send-WithRetry $webTar "/tmp/nse-cheese-web.tar"
Send-WithRetry $workerTar "/tmp/nse-cheese-worker.tar"

Write-Host "Loading images and restarting"
ssh @sshArgs $Server "docker load -i /tmp/nse-cheese-web.tar && docker load -i /tmp/nse-cheese-worker.tar && rm -f /tmp/nse-cheese-web.tar /tmp/nse-cheese-worker.tar && cd /opt/nse-cheese && docker compose up -d --no-build --remove-orphans"
$code = $LASTEXITCODE
Remove-Item $webTar, $workerTar -Force -ErrorAction SilentlyContinue
if ($code -ne 0) { exit $code }
Write-Host "Server is running the new images. The sqlite file in /opt/nse-cheese/sqlite-data was kept."
