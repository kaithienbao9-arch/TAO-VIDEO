@echo off
chcp 65001 > nul
title Bộ công cụ Piper Offline TTS - V-Sync Engine
cls
echo =======================================================================
echo          BỘ CÔNG CỤ TỰ ĐỘNG CHUYỂN ĐỔI GIỌNG ĐỌC PIPER (OFFLINE)
echo                        Đơn vị cung cấp: V-Sync
echo =======================================================================
echo.

:: Kiểm tra xem Python đã được cài đặt trên máy người dùng chưa
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [LƯU Ý] Hệ thống không tìm thấy lệnh 'python'. 
    echo Bạn vui lòng tải và cài đặt Python từ https://www.python.org/downloads/
    echo Đừng quên TÍCH CHỌN ô "Add Python to PATH" lúc cài đặt nhé!
    echo.
    pause
    exit /b
)

:: Kiểm tra xem piper.exe đã có sẵn chưa, nếu chưa sẽ tự động tải bản Windows AMD64 chính thức
if not exist "piper.exe" (
    if not exist "piper\piper.exe" (
        echo [*] Đang tải xuống Trình sinh âm thanh Piper TTS (Windows AMD64)...
        curl -L -o piper_win.zip "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_windows_amd64.zip"
        
        echo [*] Đang giải nén Piper qua Powershell...
        powershell -Command "Expand-Archive -Path 'piper_win.zip' -DestinationPath 'piper_temp'"
        
        echo [*] Di chuyển tệp tin ra thư mục hiện hành...
        move /y "piper_temp\piper\*" ".\"
        
        echo [*] Dọn dẹp tệp tin cài đặt tạm...
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
echo [*] Mọi thứ đã chuẩn bị sẵn sàng!
echo [*] Bắt đầu kích hoạt động cơ python sinh audio và srt...
echo -------------------------------------------------------------
python run_piper.py
echo -------------------------------------------------------------
echo.
echo [XONG] Hoàn tất quá trình! Bấm phím bất kỳ để đóng cửa sổ.
pause
