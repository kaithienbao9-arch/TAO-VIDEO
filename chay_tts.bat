@echo off
title Piper Offline TTS Toolkit - V-Sync Engine
cls
echo =======================================================================
echo          AUTOMATIC PIPER OFFLINE TTS TOOLKIT
echo                        Powered by V-Sync
echo =======================================================================
echo.

REM 1. Check Node.js runtime environment (highly recommended)
where node >nul 2>nul
if %errorlevel% equ 0 set "RUNNER=node"
if %errorlevel% equ 0 set "RUN_SCRIPT=run_piper.js"
if %errorlevel% equ 0 goto DOWNLOAD_ENGINES

REM 2. Check Python runtime environment as fallback
where python >nul 2>nul
if %errorlevel% equ 0 set "RUNNER=python"
if %errorlevel% equ 0 set "RUN_SCRIPT=run_piper.py"
if %errorlevel% equ 0 goto DOWNLOAD_ENGINES

REM 3. If neither is found
echo [WARN] Neither Node.js nor Python was found on your system!
echo.
echo To run this offline generator, please install one of them:
echo - Install Node.js (Recommended): https://nodejs.org/
echo - Or install Python: https://www.python.org/downloads/
echo   (Make sure to check "Add Python to PATH" during installation)
echo.
pause
exit /b

:DOWNLOAD_ENGINES
REM Check for piper.exe, download if missing
if exist "piper.exe" goto CHECK_MODEL
if exist "piper\piper.exe" move /y "piper\*" .
if exist "piper.exe" goto CHECK_MODEL

echo [*] Downloading Piper TTS Engine (Windows x64)...
curl -L -o "piper_win.zip" "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_windows_amd64.zip"

echo [*] Extracting file via Powershell...
powershell -Command "Expand-Archive -Path 'piper_win.zip' -DestinationPath 'piper_temp'"

echo [*] Moving executable to current directory...
move /y "piper_temp\piper\*" .

echo [*] Cleaning up temp files...
rd /s /q "piper_temp"
del /f /q "piper_win.zip"

:CHECK_MODEL
if exist "en_US-amy-medium.onnx" goto RUN_TTS

echo [*] Downloading English Voice Model: Amy (US)...
echo [!] Size is approx. 80MB. This download happens only once.

curl -L -o "en_US-amy-medium.onnx" "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx"
curl -L -o "en_US-amy-medium.onnx.json" "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json"

:RUN_TTS
echo.
echo [*] System is ready!
echo [*] Launching TTS engine using: %RUNNER% %RUN_SCRIPT%
echo -------------------------------------------------------------
%RUNNER% %RUN_SCRIPT%
echo -------------------------------------------------------------
echo.
echo [SUCCESS] Done! Your audio (giong_doc.wav) and subtitles (phu_de.srt) are ready.
pause
