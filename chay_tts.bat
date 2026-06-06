@echo off
chcp 65001 > nul
title Bộ công cụ Piper Offline TTS - V-Sync Engine
cls
echo =======================================================================
echo          BỘ CÔNG CỤ TỰ ĐỘNG CHUYỂN ĐỔI GIỌNG ĐỌC PIPER (OFFLINE)
echo                        Đơn vị cung cấp: V-Sync
echo =======================================================================
echo.

:: 1. Kiểm tra môi trường Node.js (ưu tiên tối thượng vì người chạy web app chắc chắn có Node)
where node >nul 2>nul
if %errorlevel% eq 0 (
    echo [OK] Phát hiện hệ thống đã cài đặt Node.js!
    set RUNNER=node
    set RUN_SCRIPT=run_piper.js
    goto DOWNLOAD_ENGINES
)

:: 2. Kiểm tra môi trường Python cũ (phương án phụ phòng hờ)
where python >nul 2>nul
if %errorlevel% eq 0 (
    echo [OK] Phát hiện hệ thống đã cài đặt Python!
    set RUNNER=python
    set RUN_SCRIPT=run_piper.py
    goto DOWNLOAD_ENGINES
)

:: 3. Khi không tìm thấy cả hai
echo [LƯU Ý] Hệ thống không tìm thấy Node.js lẫn Python!
echo.
echo Vì bạn đang chạy bộ mã nguồn V-Sync local, đề xuất nhanh nhất:
echo >> Hãy sử dụng Node.js sẵn có trên máy để chạy.
echo.
echo Hoặc bạn có thể tải nhanh Python từ website chính thức:
echo >> Tải về: https://www.python.org/downloads/
echo >> Ghi nhớ: TÍCH CHỌN ô "Add Python to PATH" lúc cài đặt để kích hoạt tệp lệnh này!
echo.
pause
exit /b

:DOWNLOAD_ENGINES
:: Kiểm tra xem piper.exe đã có sẵn chưa, nếu chưa sẽ tự động tải bản Windows AMD64 chính thức
if not exist "piper.exe" (
    if not exist "piper\piper.exe" (
        echo [*] Đang thiết lập Trình sinh âm thanh Piper TTS (Windows AMD64)...
        curl -L -o piper_win.zip "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_windows_amd64.zip"
        
        echo [*] Đang giải nén Piper thông qua Powershell...
        powershell -Command "Expand-Archive -Path 'piper_win.zip' -DestinationPath 'piper_temp'"
        
        echo [*] Di chuyển tệp tin ra thư mục làm việc...
        move /y "piper_temp\piper\*" ".\"
        
        echo [*] Giải phóng ổ cứng, dọn dẹp thư mục tạm...
        rd /s /q "piper_temp"
        del piper_win.zip
    )
)

:: Tải giọng đọc Tiếng Anh được chỉ định nếu chưa tồn tại cục bộ
if not exist "en_US-amy-medium.onnx" (
    echo [*] Đang tải về giọng đọc thông minh Tiếng Anh: Amy (US) (Nữ - Mỹ (US))...
    echo [!] Kích thước tệp giọng khoảng ~80MB, quá trình này chỉ tải một lần duy nhất.
    
    curl -L -o "en_US-amy-medium.onnx" "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx"
    curl -L -o "en_US-amy-medium.onnx.json" "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
)

echo.
echo [*] Mọi thứ đã chuẩn bị sẵn sàng tuyệt đối!
echo [*] Bắt đầu chạy trình kết xuất bằng: %RUNNER% %RUN_SCRIPT% ...
echo -------------------------------------------------------------
%RUNNER% %RUN_SCRIPT%
echo -------------------------------------------------------------
echo.
echo [XONG] Hoàn tất quá trình! File audio và srt đã được kết xuất thành công!
pause
