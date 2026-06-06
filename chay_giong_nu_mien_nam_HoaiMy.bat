@echo off
cd /d "%~dp0"
title Microsoft Edge-TTS - Hoai My (vi-VN) - V-Sync Engine
cls
echo =======================================================================
echo    AUTOMATIC MICROSOFT EDGE-TTS (VOICE: Hoai My - vi-VN Miền Nam Nữ)
echo                     Powered by V-Sync Engine
echo =======================================================================
echo.

REM Kiem tra moi truong Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [CANH BAO] Khong tim thay moi truong Python tren may tinh cua ban!
    echo.
    echo De su dung giong doc Edge-TTS sieu muot hoan toan mien phi:
    echo 1. Hay tai va cai dat Python tu trang chu chinh thuc:
    echo    https://www.python.org/downloads/
    echo 2. QUAN TRONG: Nho tick chon "Add Python to PATH" khi cai dat!
    echo 3. Bam phim bat ky de tu dong mo trang tai Python...
    echo.
    pause
    start https://www.python.org/downloads/
    exit /b
)

echo [*] Dang khoi dong giong doc AI: Hoai My (vi-VN-HoaiMyNeural)...
python run_piper.py vi-VN-HoaiMyNeural

if %errorlevel% equ 0 (
    echo.
    echo =======================================================================
    echo [ THANH CONG RUC RO ]
    echo Da tao xong file giong doc [giong_doc.mp3] va file phu de [phu_de.srt]!
    echo.
    echo Han hanh: Hay de keo tha 2 tep tin nay truc tiep vao V-Sync Engine tren web!
    echo =======================================================================
) else (
    echo.
    echo [LOI] Co loi xay ra trong qua trinh phat giong.
    echo Vui long kiem tra lai ket noi mang Internet va thu lai.
)
echo.
pause
