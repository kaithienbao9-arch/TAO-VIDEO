#!/bin/bash

# Thiet lap phong chu de hien thi tieng Viet tren Terminal Mac
export LANG=en_US.UTF-8

# Di chuyen den thu muc chua file script nay
cd "$(dirname "$0")"

clear
echo "===================================================================="
echo "               CREATOR VIDEO PRO - TRINH TAO VIDEO TU DONG"
echo "                     Phat trien boi V-Sync Engine"
echo "===================================================================="
echo ""
echo "Dang kiem tra moi truong Macbook cua ban..."
echo ""

# Kiem tra xem Node.js da duoc cai dat chua
if ! command -v node &> /dev/null
then
    echo "[CANH BAO] Khong tim thay Node.js tren Macbook cua ban!"
    echo "De chay phan mem nay doc lap, ban can cai dat phan mem mien phi Node.js."
    echo ""
    echo "Huong dan cai dat:"
    echo "1. Trinh duyet se tu dong mo trang tai Node.js sau day."
    echo "2. Tai ban 'LTS' cho macOS (file .pkg) va cai dat binh thuong."
    echo "3. Sau khi cai dat xong, hay mo lai file .command nay!"
    echo ""
    sleep 5
    open "https://nodejs.org/"
    exit
fi

echo "[OK] Tim thay Node.js dang hoat dong."
echo ""

# Kiem tra thu muc node_modules
if [ ! -d "node_modules" ]; then
    echo "[THONG BAO] Day la lan dau tien phan mem chay tren Macbook cua ban."
    echo "Dang tu dong thiet lap va cai dat cac thu vien phu tro..."
    echo "Qua trinh nay chi dien ra MOT LAN DUY NHAT va co the mat 1-2 phut."
    echo "Vui long giu ket noi mang va doi..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "[LOI] Cai dat bi loi! Hay dam bao ban co ket noi mang on dinh."
        read -p "Nhan Enter de thoat..."
        exit 1
    fi
    echo ""
    echo "[OK] Cai dat thu vien hoan thanh!"
    echo ""
fi

# Tu dong tao .env neu chua co
if [ ! -f ".env" ]; then
    echo 'GEMINI_API_KEY="Cau hinh khoa goi y tai day"' > .env
    echo 'APP_URL="http://localhost:3000"' >> .env
fi

echo "[OK] Tat ca da san sang!"
echo "Ung dung se duoc tu dong mo tren trinh duyet..."
echo ""

# Mo bang Safari
open -a "Safari" "http://localhost:3000"

# Khoi chay server o che do an duoi nen (Background process)
nohup npm run dev > /dev/null 2>&1 &

echo "[OK] May chu dev da duoc kich hoat an."
echo "Ban co the truy cap tai http://localhost:3000"
echo "Cua so terminal nay se tu dong dong sau 3 giay..."
sleep 3
osascript -e 'tell application "Terminal" to close current window of front window' & exit
