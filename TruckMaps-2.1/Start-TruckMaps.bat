@echo off
cd /d "%~dp0"
if not exist index.html (
 echo Udpak HELE ZIP-filen foerst.
 pause
 exit /b 1
)
where py >nul 2>&1
if not errorlevel 1 (
 start "" http://localhost:8765/index.html
 py -m http.server 8765 --bind 127.0.0.1
 pause
 exit /b
)
python -m http.server 8765 --bind 127.0.0.1
pause
