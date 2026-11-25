@echo off
rem Starts Finance Tracker in Docker, waits until it answers, and prints the address to use.
rem Usage: scripts\start.cmd
setlocal
cd /d "%~dp0.."

if not exist backups mkdir backups

echo Starting Finance Tracker (the first start builds the image and takes a few minutes)...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Docker could not start the app. Is Docker Desktop running?
  exit /b 1
)

echo Waiting for the app to answer...
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(120); while ((Get-Date) -lt $deadline) { try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://localhost:8080/api/health; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1"
if errorlevel 1 (
  echo.
  echo The app did not answer within 2 minutes. Its log follows:
  docker compose logs --tail 50 app
  exit /b 1
)

echo.
echo Finance Tracker is running.
echo   On this computer:                http://localhost:8080
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notlike 'vEthernet*' -and $_.InterfaceAlias -notlike '*WSL*' -and $_.InterfaceAlias -notlike '*Loopback*' } | ForEach-Object { '  From a phone or another computer: http://' + $_.IPAddress + ':8080' }"
echo   Or, on most home networks:       http://%COMPUTERNAME%.local:8080
echo.
echo Stop it with scripts\stop.cmd. Backups are saved in the backups folder.
endlocal
