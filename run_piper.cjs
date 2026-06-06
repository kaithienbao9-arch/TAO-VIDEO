const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("==================================================");
console.log("    EDGE-TTS INTERMEDIARY CLIENT (V-SYNC ENGINE)   ");
console.log("==================================================");

const pythonScript = path.join(__dirname, "run_piper.py");

if (!fs.existsSync(pythonScript)) {
  console.error("[LỖI] Không tìm thấy file run_piper.py!");
  process.exit(1);
}

console.log("[*] Đang tự động chuyển tiếp tiến trình thuyết minh sang Edge-TTS Python...");
const pyProcess = spawn("python", [pythonScript], { stdio: "inherit" });

pyProcess.on("close", (code) => {
  if (code === 0) {
    console.log("[NodeJS] Chạy thành công rực rỡ.");
  } else {
    console.log(`[NodeJS] Tiến trình kết thúc với mã lỗi ${code}. Sau đây là lí do:`);
    console.log(`- Để chạy Edge-TTS, máy tính của bạn cần cài đặt môi trường Python miễn phí.`);
    console.log(`- Vui lòng chạy trực tiếp file 'chay_tts.bat' để hệ thống tự động hướng dẫn cài đặt Python chỉ trong 10 giây!`);
  }
});
