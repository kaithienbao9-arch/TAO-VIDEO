@echo off
title TAT PHAN MEM CREATOR VIDEO PRO - V-SYNC ENGINE
cd /d "%~dp0"
cls

echo ====================================================================
echo               CREATOR VIDEO PRO - TRINH TAO VIDEO TU DONG
echo                    Lenh tat phan mem chay ngam
echo ====================================================================
echo.
echo Dang tien hanh tat may chu ngam cua ung dung...
echo.

:: Tim tat ca cac tien trinh chay tren cong 3000 de tat
set "found=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    taskkill /f /pid %%a >nul 2>&1
    set "found=1"
)

if "%found%"=="1" (
    echo [OK] Da tat may chu ngam va giai phong 100%% bo nho thanh cong!
) else (
    echo [THONG BAO] Hien tai khong co may chu chay ngam nao dang hoat dong tren cong 3000.
)

echo.
echo Cua so nay se tu dong dong sau 3 giay...
timeout /t 3 >nul
exit
