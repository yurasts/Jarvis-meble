@echo off
setlocal
cd /d "%~dp0\..\.."
if not exist "%LOCALAPPDATA%\Jarvis" mkdir "%LOCALAPPDATA%\Jarvis"
call npm.cmd run drive-sync >> "%LOCALAPPDATA%\Jarvis\drive-sync.log" 2>&1
endlocal
