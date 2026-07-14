@echo off
REM crystal-autobattler :: one-click launcher for Windows
cd /d "%~dp0"
python main.py
if errorlevel 1 (
    echo.
    echo [!] Python failed to launch.
    echo     - Install Python 3.11+ from python.org (tick "Add to PATH")
    echo     - Tkinter ships with the standard Windows installer
    pause
)
