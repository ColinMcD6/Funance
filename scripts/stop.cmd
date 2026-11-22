@echo off
rem Stops Finance Tracker. The data stays in the finance_data Docker volume.
rem Usage: scripts\stop.cmd
setlocal
cd /d "%~dp0.."
docker compose down
if errorlevel 1 exit /b 1
echo Finance Tracker is stopped. Start it again with scripts\start.cmd.
endlocal
