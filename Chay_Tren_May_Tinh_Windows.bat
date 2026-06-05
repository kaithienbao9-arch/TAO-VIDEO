@echo off
title KHOI DONG CREATOR VIDEO PRO - V-SYNC ENGINE
chcp 65001 > nul
cls

echo ====================================================================
echo               CREATOR VIDEO PRO - TRÌNH TẠO VIDEO TỰ ĐỘNG
echo                     Phát triển bởi V-Sync Engine
echo ====================================================================
echo.
echo Đang kiểm tra môi trường máy tính của bạn...
echo.

:: Kiểm tra xem Node.js đã được cài đặt chưa
where node >nul 2>nul
if %errorlevel% neq 0 goto NO_NODE

echo [OK] Tìm thấy Node.js đang hoạt động.
echo.

:: Kiểm tra thư mục node_modules, nếu chưa có thì tự động cài đặt thư viện
if exist node_modules goto NODE_MODULES_OK

echo [THÔNG BÁO] Đây là lần đầu tiên phần mềm chạy trên máy tính của bạn.
echo Đang tự động thiết lập và cài đặt các thư viện cần thiết...
echo Quá trình này chỉ diễn ra MỘT LẦN DUY NHẤT và có thể mất 1-2 phút tùy tốc độ mạng.
echo Vui lòng giữ kết nối internet và đợi trong giây lát...
echo.
call npm install
if %errorlevel% neq 0 goto INSTALL_FAILED

echo.
echo [OK] Cài đặt thư viện thành công!
echo.

:NODE_MODULES_OK

echo [OK] Tất cả mọi thứ đã sẵn sàng!
echo Đang khởi động máy chủ cục bộ (Local Server) trên máy tính của bạn...
echo Ứng dụng sẽ tự động mở trong trình duyệt Chrome / Edge của bạn sau ít giây...
echo.

:: Tự động tạo file .env nếu chưa có để lưu API Key mặc định
if exist .env goto ENV_OK
echo GEMINI_API_KEY="Cấu hình khóa gợi ý từ khóa của bạn tại đây" > .env
echo APP_URL="http://localhost:3000" >> .env
:ENV_OK

:: Đợi server khởi động rồi tự động mở link localhost:3000
start http://localhost:3000

:: Khởi chạy môi trường Dev
call npm run dev
goto END

:NO_NODE
echo [CẢNH BÁO] Không tìm thấy Node.js trên máy tính của bạn!
echo Để chạy phần mềm này độc lập, bạn cần cài đặt một công cụ miễn phí tên là Node.js.
echo.
echo Làm thế nào để cài đặt:
echo 1. Trình duyệt của bạn sẽ tự động mở trang web tải Node.js ngay sau đây.
echo 2. Chọn bản "LTS" (Khuyên dùng cho hầu hết người dùng), tải về và cài đặt giống như phần mềm bình thường (Cứ ấn Next -> Next -> Finish).
echo 3. Sau khi cài đặt xong, hãy mở lại file .bat này!
echo.
echo Thiết bị sẽ tự động mở trang web tải sau 5 giây...
timeout /t 5 >nul
start https://nodejs.org/
pause
exit

:INSTALL_FAILED
echo.
echo [LỖI] Quá trình cài đặt thư viện thất bại! 
echo Vui lòng kiểm tra lại kết nối mạng hoặc thử chạy lệnh "npm install" thủ công từ Command Prompt.
pause
exit

:END
pause
