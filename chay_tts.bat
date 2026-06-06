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

REM If user manually downloaded piper_win.zip, skip download
if exist "piper_win.zip" (
    echo [*] Found manually downloaded piper_win.zip. Skipping download...
    goto EXTRACT_ENGINE
)

echo [*] Downloading Piper TTS Engine (Windows x64)...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip' -OutFile 'piper_win.zip'"

REM Check if download succeeded and file is not empty/corrupted
if not exist "piper_win.zip" goto DOWNLOAD_ERROR
for %%I in ("piper_win.zip") do if %%~zI lss 100000 goto DOWNLOAD_ERROR

:EXTRACT_ENGINE
echo [*] Extracting file via Powershell...
powershell -Command "Expand-Archive -Path 'piper_win.zip' -DestinationPath 'piper_temp' -Force"

echo [*] Moving executable to current directory...
move /y "piper_temp\piper\*" .

echo [*] Cleaning up temp files...
rd /s /q "piper_temp"
del /f /q "piper_win.zip"
goto CHECK_MODEL

:DOWNLOAD_ERROR
echo.
echo =======================================================================
echo [ERROR] Auto-download failed! (Github is blocked or limited in your area)
echo =======================================================================
echo To fix this easily, please follow these simple steps:
echo.
echo 1. Open your web browser and paste/click this link to download:
echo    https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip
echo.
echo 2. Save the ZIP file directly into this folder where the bat file is run.
echo.
echo 3. Ensure the file is named: piper_win.zip
echo.
echo 4. Run this 'chay_tts.bat' file again. It will skip downloading and auto-extract!
echo =======================================================================
echo.
if exist "piper_win.zip" del /f /q "piper_win.zip"
pause
exit /b

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
