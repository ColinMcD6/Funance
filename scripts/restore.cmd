@echo off
rem Replaces the app's database with a backup file, then starts the app again.
rem The database being replaced is saved as a new backup first, so a restore can be undone.
rem Usage: scripts\restore.cmd backups\finance-20261120-120000.sqlite
setlocal
if "%~1"=="" goto usage
if not "%~2"=="" goto usage
rem Resolve the file before changing folder, so a path relative to where you are works.
set "BACKUP_FILE=%~f1"
set "BACKUP_FOLDER=%~dp1"
set "BACKUP_NAME=%~nx1"
if not exist "%BACKUP_FILE%" (
  echo No such file: %BACKUP_FILE%
  exit /b 2
)
rem Docker wants the folder without its trailing backslash.
set "BACKUP_FOLDER=%BACKUP_FOLDER:~0,-1%"
cd /d "%~dp0.."

echo Stopping the app...
docker compose stop app
if errorlevel 1 exit /b 1

echo Restoring %BACKUP_NAME%...
docker compose run --rm --no-deps -v "%BACKUP_FOLDER%:/restore:ro" app node apps/server/dist/restore.js "/restore/%BACKUP_NAME%"
if errorlevel 1 (
  echo.
  echo The restore failed and the database was not changed. Starting the app again.
  call "%~dp0start.cmd"
  exit /b 1
)

call "%~dp0start.cmd"
endlocal
exit /b %errorlevel%

:usage
echo Usage: scripts\restore.cmd backups\finance-YYYYMMDD-HHMMSS.sqlite
exit /b 2
