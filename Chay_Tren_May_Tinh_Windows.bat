@echo off
title KHOI DONG CREATOR VIDEO PRO - V-SYNC ENGINE
cd /d "%~dp0"
cls

echo ====================================================================
echo               CREATOR VIDEO PRO - TRINH TAO VIDEO TU DONG
echo                     Phat trien boi V-Sync Engine
echo ====================================================================
echo.
echo Dang kiem tra moi truong may tinh cua ban...
echo.

:: Kiem tra xem Node.js da duoc cai dat chua
where node >nul 2>nul
if %errorlevel% neq 0 goto NO_NODE

echo [OK] Tim thay Node.js dang hoat dong.
echo.

:: Kiem tra thu muc node_modules, neu chua co thi tu dong cai dat thu vien
if exist node_modules goto NODE_MODULES_OK

echo [THONG BAO] Day la lan dau tien phan mem chay tren may tinh cua ban.
echo Dang tu dong thiet lap va cai dat cac thu vien can thiet...
echo Qua trinh nay chi dien ra MOT LAN DUY NHAT va co the mat 1-2 phut tuy toc do mang.
echo Vui long giu ket noi internet va doi trong giay lat...
echo.
call npm install
if %errorlevel% neq 0 goto INSTALL_FAILED

echo.
echo [OK] Cai dat thu vien thanh cong!
echo.

:NODE_MODULES_OK

:: Tu dong tim va tat phien ban dang chay ngam truoc do de giai phong bo nho va tranh xung dot cong 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [OK] Tat ca moi thu da san sang!
echo Dang khoi dong may chu cuc bo (Local Server) tren may tinh cua ban...
echo Ung dung se tu dong mo trong trinh duyet Chrome / Edge cua ban sau it giay...
echo.

:: Tu dong tao file .env neu chua co de luu API Key mac dinh
if exist .env goto ENV_OK
echo GEMINI_API_KEY="Cau hinh khoa goi y tu khoa cua ban tai day" > .env
echo APP_URL="http://localhost:3000" >> .env
:ENV_OK

:: Mo ung dung duoi dang cua so doc lap (App Mode), loai bo hoan toan thanh dia chi va tab de giong phan mem Desktop
start chrome --app=http://localhost:3000

:: Chay may chu ngam hoan toan bang VBScript (An hoan toan khoi man hinh va thanh Taskbar)
echo Set WshShell = CreateObject("WScript.Shell") > temp_run.vbs
echo WshShell.Run "cmd.exe /c npm run dev", 0, false >> temp_run.vbs
wscript.exe temp_run.vbs
del temp_run.vbs

echo [OK] May chu da duoc kich hoat ngam thanh cong!
echo Cua so CMD nay se tu dong dong lap tuc de giu sach man hinh cua ban.
timeout /t 1 >nul
exit

:NO_NODE
echo [CANH BAO] Khong tim thay Node.js tren may tinh cua ban!
echo De chay phan mem nay doc lap, ban can cai dat mot cong cu mien phi ten la Node.js.
echo.
echo Lam the nao de cai duoc:
echo 1. Trinh duyet cua ban se tu dong mo trang web tai Node.js ngay sau day.
echo 2. Chon ban "LTS" (Khuyen dung cho lau dai), tai ve va cai dat giong nhu phan mem binh thuong (Bam Next -> Next -> Finish).
echo 3. Sau khi cai dat xong, hay mo lai file .bat nay!
echo.
echo Thiet bi se tu dong mo trang web tai sau 5 giay...
timeout /t 5 >nul
start https://nodejs.org/
pause
exit

:INSTALL_FAILED
echo.
echo [LOI] Qua trinh cai dat thu vien that bai! 
echo Vui long kiem tra lai ket noi mang hoac thu chay lenh "npm install" thu cong tu Command Prompt thu muc nay.
pause
exit

:END
pause
