import React, { useState } from 'react';
import { 
  Volume2, 
  Download, 
  Copy, 
  Check, 
  FileText, 
  Terminal, 
  FileAudio, 
  Info, 
  ArrowRight, 
  HelpCircle,
  Sparkles,
  RefreshCw,
  Cpu,
  Mic
} from 'lucide-react';

interface PiperVoice {
  id: string;
  name: string;
  gender: 'Nam' | 'Nữ' | 'Male' | 'Female';
  accent: string;
  modelName: string;
  onnxUrl: string;
  jsonUrl: string;
  description: string;
}

const PIPER_VOICES: PiperVoice[] = [
  {
    id: 'en_us_amy',
    name: 'Amy (US)',
    gender: 'Nữ',
    accent: 'Mỹ (US)',
    modelName: 'en_US-amy-medium.onnx',
    onnxUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx',
    jsonUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json',
    description: 'Giọng nữ Mỹ tự nhiên, rõ ràng, hoàn hảo cho video bài giảng hướng dẫn, bài thuyết trình vác thuyết minh sinh động.'
  },
  {
    id: 'en_us_ryan',
    name: 'Ryan (US)',
    gender: 'Nam',
    accent: 'Mỹ (US)',
    modelName: 'en_US-ryan-medium.onnx',
    onnxUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/en_US-ryan-medium.onnx',
    jsonUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json',
    description: 'Giọng nam Mỹ trầm ấm, dồi dào năng lượng, thích hợp cho phim tài liệu lịch sử phác thảo, giới thiệu công nghệ.'
  },
  {
    id: 'en_us_joe',
    name: 'Joe (US)',
    gender: 'Nam',
    accent: 'Mỹ (US)',
    modelName: 'en_US-joe-medium.onnx',
    onnxUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/joe/medium/en_US-joe-medium.onnx',
    jsonUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/joe/medium/en_US-joe-medium.onnx.json',
    description: 'Giọng nam Mỹ thân thiện, giao lưu tự nhiên như chia sẻ vlog, tâm sự, kết nối người xem.'
  },
  {
    id: 'en_gb_jenny',
    name: 'Jenny (UK)',
    gender: 'Nữ',
    accent: 'Anh (UK)',
    modelName: 'en_GB-jenny_dioco-medium.onnx',
    onnxUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx',
    jsonUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx.json',
    description: 'Giọng nữ Anh-Anh sang trọng, thanh lịch, chuẩn mực học thuật, cuốn hút cho chia sẻ khoa học và tin tức.'
  }
];

const DEFAULT_SAMPLE_TEXT = `Welcome back to our exploration journey today.
In this video, we will discover the fascinating secrets of our universe.
Every slide and animation is meticulously synchronized for an immersive experience.
Don't forget to subscribe to our channel to support future content.`;

export default function PiperTtsGenerator() {
  const [text, setText] = useState<string>(DEFAULT_SAMPLE_TEXT);
  const [selectedVoice, setSelectedVoice] = useState<PiperVoice>(PIPER_VOICES[0]);
  const [speed, setSpeed] = useState<number>(1.0); // Length scale = 1.0 / speed
  const [silenceGap, setSilenceGap] = useState<number>(0.3); // seconds of pause between lines
  
  // Script file tabs visibility states
  const [activeCodeTab, setActiveCodeTab] = useState<'run_js' | 'run_py' | 'run_bat' | 'text_txt'>('run_bat');
  const [copiedState, setCopiedState] = useState<Record<string, boolean>>({});

  // Clean lines for processing
  const getLines = (): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  // Convert speed input to Piper length_scale
  // Speed Up (e.g. 1.2) implies length_scale is less (e.g. 1 / 1.2 = 0.83)
  const lengthScale = (1.0 / speed).toFixed(2);

  // Generate Node.js script
  const getNodeScript = (): string => {
    return `const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// --- DỰNG CẤU HÌNH CHO GIỌNG ANH (ENGLISH PIPER VOICES) ---
const INPUT_FILE = "van_ban_phu_de.txt";
const OUTPUT_AUDIO = "giong_doc.wav";
const OUTPUT_SRT = "phu_de.srt";
const PIPER_MODEL = "${selectedVoice.modelName}";
const PIPER_EXE = path.join(".", "piper.exe");
const SILENCE_GAP = ${silenceGap}; // Khoảng lặng nghỉ giữa mỗi câu (giây)
const LENGTH_SCALE = ${lengthScale}; // Tốc độ nói (nhỏ hơn là nói nhanh hơn)

// Cấu hình chuẩn Audio PCM của Piper
const SAMPLE_RATE_VAL = 22050; 
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const BYTES_PER_SECOND = SAMPLE_RATE_VAL * CHANNELS * BYTES_PER_SAMPLE;

function createWavHeader(dataLength) {
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM Format
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE_VAL, 24);
  buffer.writeUInt32LE(BYTES_PER_SECOND, 28);
  buffer.writeUInt16LE(CHANNELS * BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

function formatSrtTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  const pad = (num, size) => ('00' + num).slice(-size);
  const padMs = (num) => ('000' + num).slice(-3);
  
  return \`\${pad(hrs, 2)}:\${pad(mins, 2)}:\${pad(secs, 2)},\${padMs(ms)}\`;
}

function main() {
  console.log("==================================================");
  console.log("    TIẾN TRÌNH KHÉP KÍN PIPER TTS OFFLINE (NODE)   ");
  console.log("==================================================");

  let piperPath = PIPER_EXE;
  if (!fs.existsSync(piperPath)) {
    const backupPath = path.join("piper", "piper.exe");
    if (fs.existsSync(backupPath)) {
      piperPath = backupPath;
    } else {
      console.error("[LỖI] Không tìm thấy file piper.exe!");
      console.error("Vui lòng đảm bảo tệp tin được tải đầy đủ.");
      return;
    }
  }

  if (!fs.existsSync(PIPER_MODEL)) {
    console.error(\`[LỖI] Không tìm thấy giọng đọc dữ liệu: \${PIPER_MODEL}\`);
    return;
  }

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(\`[LỖI] Không tìm thấy file văn bản đầu vào: \${INPUT_FILE}\`);
    return;
  }

  const lines = fs.readFileSync(INPUT_FILE, "utf-8")
    .split(/\\r?\\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    console.error("[LỖI] Tệp văn bản đầu vào đang trống!");
    return;
  }

  console.log(\`[*] Phát hiện cấu trúc \${lines.length} câu thuyết minh...\\n\`);

  const tempDir = "temp_audiolink";
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const chunksBuffer = [];
  const srtBlocks = [];
  let currentTime = 0.0;

  // Tạo đệm cho khoảng nghỉ lặng
  const silenceSamples = Math.floor(SAMPLE_RATE_VAL * SILENCE_GAP);
  const silenceBuffer = Buffer.alloc(silenceSamples * CHANNELS * BYTES_PER_SAMPLE);

  try {
    for (let i = 0; i < lines.length; i++) {
      const sentence = lines[i];
      const idx = i + 1;
      const previewText = sentence.length > 30 ? sentence.slice(0, 30) + "..." : sentence;
      console.log(\` -> [\${idx}/\${lines.length}] Đang nói: "\${previewText}"\`);

      const partWav = path.join(tempDir, \`part_\${String(idx).padStart(4, '0')}.wav\`);

      // Khởi động subprocess Piper để đọc câu thoại
      const result = spawnSync(piperPath, [
        "--model", PIPER_MODEL,
        "--length_scale", String(LENGTH_SCALE),
        "--output_file", partWav
      ], {
        input: sentence,
        encoding: 'utf-8'
      });

      if (result.status !== 0 || !fs.existsSync(partWav)) {
        console.error(\` [LỖI GIỌNG] Không thể kết xuất câu số \${idx}.\`);
        continue;
      }

      // Đọc file WAV tạm vừa tạo để tách đoạn PCM thô (bỏ qua 44 byte WAV header)
      const wavFileData = fs.readFileSync(partWav);
      const pcmData = wavFileData.slice(44);
      const duration = pcmData.length / BYTES_PER_SECOND;

      const startTime = currentTime;
      const endTime = startTime + duration;
      srtBlocks.push({ idx, startTime, endTime, text: sentence });

      chunksBuffer.push(pcmData);

      // Chèn ngắt hơi / khoảng lặng
      if (i < lines.length - 1 && SILENCE_GAP > 0) {
        chunksBuffer.push(silenceBuffer);
        currentTime = endTime + SILENCE_GAP;
      } else {
        currentTime = endTime;
      }

      // Có thể xoá tệp tạm ngay để giải phóng ổ cứng
      try { fs.unlinkSync(partWav); } catch (e) {}
    }

    if (chunksBuffer.length === 0) {
      console.error("[LỖI] Không có phân khúc âm thanh nào được tạo.");
      return;
    }

    // Kết hợp toàn bộ buffer PCM thô
    const totalPcmLength = chunksBuffer.reduce((sum, buf) => sum + buf.length, 0);
    const finalWavHeader = createWavHeader(totalPcmLength);
    const finalWavBuffer = Buffer.concat([finalWavHeader, ...chunksBuffer]);

    // Ghi ra file audio cuối cùng
    fs.writeFileSync(OUTPUT_AUDIO, finalWavBuffer);
    console.log(\`[*] Đã xuất bản file âm thanh: \${OUTPUT_AUDIO}\`);

    // Ghi file phụ đề SRT
    let srtContent = "";
    for (const block of srtBlocks) {
      srtContent += \`\${block.idx}\\n\`;
      srtContent += \`\${formatSrtTime(block.startTime)} --> \${formatSrtTime(block.endTime)}\\n\`;
      srtContent += \`\${block.text}\\n\\n\`;
    }
    fs.writeFileSync(OUTPUT_SRT, srtContent, "utf-8");
    console.log(\`[*] Đã xuất bản phụ đề đồng bộ mốc giây: \${OUTPUT_SRT}\`);

    console.log("\\n[XỬ LÝ THÀNH CÔNG RỰC RỠ]");
    console.log(">> Đưa 2 file này vào V-Sync Engine trên website để tự động khớp cảnh!");

  } catch (err) {
    console.error("[LỖI ĐỘT NGỘT] ", err);
  } finally {
    // Dọn dẹp folder nháp
    if (fs.existsSync(tempDir)) {
      try {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tempDir, file));
        }
        fs.rmdirSync(tempDir);
      } catch (e) {}
    }
  }
}

main();
`;
  };

  // Generate python file code
  const getPythonScript = (): string => {
    return `import os
import wave
import subprocess
import json
import re

# --- CẤU HÌNH ĐÃ ĐỒNG BỘ TỪ GIAO DIỆN V-SYNC ---
INPUT_FILE = "van_ban_phu_de.txt"
OUTPUT_AUDIO = "giong_doc.wav"
OUTPUT_SRT = "phu_de.srt"
PIPER_MODEL = "${selectedVoice.modelName}"
PIPER_EXE = os.path.join(".", "piper.exe")  # Đồ nghề chạy nội bộ trong thư mục
SILENCE_GAP = ${silenceGap}  # Khoảng lặng nghỉ giữa mỗi câu
LENGTH_SCALE = ${lengthScale}  # Hệ số tốc độ nói (nhỏ hơn là nhanh hơn)

# Tham số âm thanh mặc định của Piper
SAMPLE_RATE = 22050  # 22.05kHz 16-bit PCM mono
CHANNELS = 1
SAMPWIDTH = 2  # 16-bit = 2 bytes

def create_silence_wav(path, duration, rate=SAMPLE_RATE, channels=CHANNELS, sampwidth=SAMPWIDTH):
    num_frames = int(rate * duration)
    with wave.open(path, 'wb') as w:
        w.setnchannels(channels)
        w.setsampwidth(sampwidth)
        w.setframerate(rate)
        # Ghi byte trống để giả tạo âm thanh lặng tuyệt đối
        w.writeframes(b'\\x00' * (num_frames * channels * sampwidth))

def main():
    print("==================================================")
    print("      TIẾN TRÌNH CHUYỂN ĐỔI PIPER TTS OFFLINE     ")
    print("==================================================")
    
    # Tìm kiếm trình chạy Piper
    piper_path = PIPER_EXE
    if not os.path.exists(piper_path):
        if os.path.exists(os.path.join("piper", "piper.exe")):
            piper_path = os.path.join("piper", "piper.exe")
        else:
            print("[LỖI] Không tìm thấy file piper.exe!")
            print("Vui lòng tải hoặc cài đặt Piper và đặt vào cùng thư mục chạy.")
            return

    if not os.path.exists(PIPER_MODEL):
        print(f"[LỖI] Không tìm thấy file giọng đọc dữ liệu: {PIPER_MODEL}")
        return
        
    if not os.path.exists(INPUT_FILE):
        print(f"[LỖI] Không tìm thấy file văn bản đầu vào: {INPUT_FILE}")
        print(f"Vui lòng đảm bảo tệp {INPUT_FILE} có tồn tại.")
        return

    # Đọc danh sách câu nói
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]
        
    if not lines:
        print("[LỖI] Tệp văn bản van_ban_phu_de.txt đang trống rỗng!")
        return
        
    print(f"[*] Đang xử lý {len(lines)} đoạn thoại thuyết minh...")
    
    # Tạo thư mục tạm để chứa phân khúc tiếng
    temp_dir = "temp_audiolink"
    os.makedirs(temp_dir, exist_ok=True)
    
    temp_files = []
    srt_blocks = []
    current_time = 0.0
    
    # Tạo sẵn file khoảng lặng dùng chung nếu có cấu hình ngắt nghỉ
    silence_file = os.path.join(temp_dir, "silence.wav")
    if SILENCE_GAP > 0:
        create_silence_wav(silence_file, SILENCE_GAP)
        
    try:
        # Duyệt từng dòng để tổng hợp lời thoại
        for idx, sentence in enumerate(lines, start=1):
            # Cắt ngắn text hiển thị log
            preview_text = sentence[:30] + ("..." if len(sentence) > 30 else "")
            print(f" -> [{idx}/{len(lines)}] Đang đọc: \\"{preview_text}\\"")
            
            part_wav = os.path.join(temp_dir, f"part_{idx:04d}.wav")
            
            # Khởi tạo lệnh cmd cho Piper
            command = [
                piper_path,
                "--model", PIPER_MODEL,
                "--length_scale", str(LENGTH_SCALE),
                "--output_file", part_wav
            ]
            
            # Chạy subprocess và đẩy câu thoại vào stdin
            proc = subprocess.Popen(
                command, 
                stdin=subprocess.PIPE, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE
            )
            stdout, stderr = proc.communicate(input=sentence.encode("utf-8"))
            
            if proc.returncode != 0 or not os.path.exists(part_wav):
                print(f" [LỖI GIỌNG] Không thể kết xuất câu số {idx}. Chi tiết:")
                print(stderr.decode("utf-8", errors="ignore"))
                continue
                
            # Đọc độ dài file wav vừa được tạo
            with wave.open(part_wav, "r") as w:
                frames = w.getnframes()
                rate = w.getframerate()
                duration = frames / float(rate)
                
            # Ghi nhận mốc đồng bộ phụ đề câu thoại
            start_t = current_time
            end_t = start_t + duration
            srt_blocks.append((idx, start_t, end_t, sentence))
            
            temp_files.append(part_wav)
            
            # Thêm khoảng lặng ngắt cấu nghỉ giữa câu (ngoại trừ câu cuối cùng)
            if idx < len(lines) and SILENCE_GAP > 0:
                temp_files.append(silence_file)
                current_time = end_t + SILENCE_GAP
            else:
                current_time = end_t

        if not temp_files:
            print("[LỖI] Không có file âm thanh phân khúc nào được tạo thành công.")
            return

        # Kết xuất file hợp nhất
        print(f"[*] Tiến hành hợp nhất các đoạn âm thanh thành file cuối: {OUTPUT_AUDIO}...")
        with wave.open(OUTPUT_AUDIO, "wb") as outfile:
            with wave.open(temp_files[0], "rb") as infile:
                outfile.setparams(infile.getparams())
            for wav_p in temp_files:
                with wave.open(wav_p, "rb") as infile:
                    outfile.writeframes(infile.readframes(infile.getnframes()))

        # Tạo file SRT
        print(f"[*] Xuất file phụ đề khớp mốc giây: {OUTPUT_SRT}...")
        
        def format_srt_time(seconds):
            hrs = int(seconds // 3600)
            mints = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            millis = int((seconds % 1) * 1000)
            return f"{hrs:02d}:{mints:02d}:{secs:02d},{millis:03d}"

        with open(OUTPUT_SRT, "w", encoding="utf-8") as f:
            for item_idx, s_time, e_time, text_val in srt_blocks:
                f.write(f"{item_idx}\\n")
                f.write(f"{format_srt_time(s_time)} --> {format_srt_time(e_time)}\\n")
                f.write(f"{text_val}\\n\\n")

        print("\\n[XỬ LÝ THÀNH CÔNG RỰC RỠ]")
        print(f" >> File âm thanh audio lời thoại: {OUTPUT_AUDIO}")
        print(f" >> File phụ đề đồng bộ chuẩn chỉnh: {OUTPUT_SRT}")
        print("Mẹo: Đưa 2 file này vào V-Sync Engine trên website là bạn sẽ có Video dựng sẵn!")

    finally:
        # Tự động dọn dẹp các mảnh vụn file rác
        for p in temp_files:
            if p != silence_file:
                try: os.remove(p)
                except: pass
        if os.path.exists(silence_file):
            try: os.remove(silence_file)
            except: pass
        try: os.rmdir(temp_dir)
        except: pass

if __name__ == "__main__":
    main()
`;
  };

  // Generate batch file setup
  const getBatchScript = (): string => {
    return `@echo off
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
if exist "piper\\piper.exe" move /y "piper\\*" .
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
move /y "piper_temp\\piper\\*" .

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
if exist "${selectedVoice.modelName}" goto RUN_TTS

echo [*] Downloading English Voice Model: ${selectedVoice.name} (${selectedVoice.gender} - ${selectedVoice.accent})...
echo [!] Size is approx. 80MB. This download happens only once.

curl -L -o "${selectedVoice.modelName}" "${selectedVoice.onnxUrl}"
curl -L -o "${selectedVoice.modelName}.json" "${selectedVoice.jsonUrl}"

:RUN_TTS
echo.
echo [*] System is ready!
echo [*] Launching TTS engine using: %%RUNNER%% %%RUN_SCRIPT%%
echo -------------------------------------------------------------
%%RUNNER%% %%RUN_SCRIPT%%
echo -------------------------------------------------------------
echo.
echo [SUCCESS] Done! Your audio (giong_doc.wav) and subtitles (phu_de.srt) are ready.
pause
`;
  };

  const copyToClipboard = (textToCopy: string, tabId: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedState(prev => ({ ...prev, [tabId]: true }));
    setTimeout(() => {
      setCopiedState(prev => ({ ...prev, [tabId]: false }));
    }, 2000);
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleTextReset = () => {
    setText(DEFAULT_SAMPLE_TEXT);
  };

  const currentTabContent = () => {
    switch(activeCodeTab) {
      case 'run_js':
        return {
          code: getNodeScript(),
          filename: 'run_piper.js',
          lang: 'javascript'
        };
      case 'run_py':
        return {
          code: getPythonScript(),
          filename: 'run_piper.py',
          lang: 'python'
        };
      case 'run_bat':
        return {
          code: getBatchScript(),
          filename: 'chay_tts.bat',
          lang: 'batch'
        };
      case 'text_txt':
        return {
          code: text,
          filename: 'van_ban_phu_de.txt',
          lang: 'text'
        };
    }
  };

  const activeContent = currentTabContent();

  return (
    <div className="space-y-8 animate-in fade-in duration-350">
      {/* Visual Header card decoration */}
      <div className="bg-gradient-to-r from-blue-950/40 to-indigo-950/30 border border-blue-500/10 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-xs font-semibold">
            <Mic size={13} className="animate-pulse" />
            <span>ĐỒNG BỘ PHỤ ĐỀ OFFLINE</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white font-sans">
            Trình kết xuất giọng nói &amp; Phụ đề Piper (Offline %100)
          </h2>
          <p className="text-xs text-white/50 leading-relaxed font-sans">
            Khắc phục triệt để nhược điểm của Web Speech API (như lỗi phát âm hay mất kết nối mạng). Bạn chỉ cần nhập văn bản, tải trọn bộ script dưới đây về máy của bạn và chạy 1 click. Hệ thống sẽ kết xuất file audio <code className="bg-slate-900 text-white/80 px-1 py-0.5 rounded text-[10px] font-mono">giong_doc.wav</code> và kịch bản phụ đề khớp từng mili-giây chuẩn chỉnh để kéo trực tiếp vào V-Sync dựng video slide!
          </p>
        </div>
        
        <div className="shrink-0 flex items-center justify-center p-4 bg-sky-500/5 rounded-xl border border-sky-400/10 self-center">
          <Terminal size={40} className="text-sky-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Editor & Options */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#0E0E12] border border-white/10 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <FileText size={14} className="text-blue-400" />
                VĂN BẢN KỊCH BẢN (MỖI DÒNG LÀ 1 CÂU)
              </span>
              <button 
                onClick={handleTextReset}
                className="text-[10px] text-white/30 hover:text-white flex items-center gap-1 transition-all"
              >
                <RefreshCw size={10} /> Mặc định
              </button>
            </div>

            {/* Script Text area - Each line is 1 block */}
            <div className="space-y-1.5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full h-80 bg-zinc-950 text-[11px] text-white/90 p-4 rounded-xl border border-white/5 focus:border-blue-500/40 focus:outline-none font-sans leading-relaxed resize-none shadow-inner"
                placeholder="Nhập kịch bản thuyết minh của bạn ở đây...
Mỗi dòng viết xuống sẽ trở thành 1 mốc phụ đề hoàn hảo khớp với âm thanh phát ra!"
              />
              <div className="flex items-center justify-between text-[10px] text-white/40 px-1">
                <span>Số câu/dòng: <strong className="text-white/80">{getLines().length}</strong></span>
                <span>Tự động phân khúc 1 dòng = 1 slide</span>
              </div>
            </div>

            {/* Vocal Config Section */}
            <div className="space-y-4 border-t border-white/5 pt-4">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Volume2 size={14} className="text-blue-400" />
                CẤU HÌNH PIPER OFFLINE
              </span>

              {/* Voice selectors */}
              <div className="space-y-2">
                <label className="text-[10px] text-white/40 uppercase block font-semibold">Giọng đọc Tiếng Anh (English Voices)</label>
                <div className="grid grid-cols-2 gap-2">
                  {PIPER_VOICES.map(voice => (
                    <button
                      key={voice.id}
                      onClick={() => setSelectedVoice(voice)}
                      className={`p-3 rounded-xl border text-left flex flex-col justify-between gap-1 transition-all hover:bg-white/5 active:scale-95 ${
                        selectedVoice.id === voice.id 
                          ? 'bg-blue-600/10 border-blue-500 text-white' 
                          : 'bg-zinc-900/50 border-white/5 text-white/50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[11.5px] font-bold block">{voice.name}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                          voice.gender === 'Nam' ? 'bg-sky-500/10 text-sky-400' : 'bg-pink-500/10 text-pink-400'
                        }`}>
                          {voice.gender} • {voice.accent}
                        </span>
                      </div>
                      <span className="text-[9px] text-white/30 line-clamp-2 leading-relaxed mt-1">
                        {voice.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed controls */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="text-[10px] text-white/40 uppercase font-semibold">Tốc độ đọc</label>
                    <span className="text-[10px] text-blue-400 font-bold font-mono">{speed.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer h-1 rounded bg-zinc-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="text-[10px] text-white/40 uppercase font-semibold">Khoảng lặng nghỉ</label>
                    <span className="text-[10px] text-emerald-400 font-bold font-mono">{silenceGap.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.2"
                    step="0.1"
                    value={silenceGap}
                    onChange={(e) => setSilenceGap(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer h-1 rounded bg-zinc-800"
                  />
                </div>
              </div>

              {/* Informative advice */}
              <div className="p-3 bg-white/5 rounded-xl text-[10px] text-white/50 leading-relaxed space-y-1">
                <div className="flex items-center gap-1.5 text-white/80 font-bold">
                  <Info size={12} className="text-blue-400" />
                  <span>Khoảng lặng thông minh:</span>
                </div>
                <p>
                  Đặt <strong className="text-emerald-400">{silenceGap} giây</strong> nghỉ. Python Script sẽ ghép một file WAV lặng mini vào sau mỗi dòng đọc, giúp phân đoạn thoại không bị dồn cục, nghe tự nhiên y như người thuyết minh ngắt hơi!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Code viewer & Detailed instructions */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-[#0E0E12] border border-white/10 rounded-2xl shadow-xl flex flex-col overflow-hidden">
            
             {/* Header tab controller */}
            <div className="bg-zinc-950 p-4 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex gap-1.5 bg-white/5 p-1 rounded-lg border border-white/10 text-xs flex-wrap">
                <button
                  onClick={() => setActiveCodeTab('run_bat')}
                  className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-[11px] ${
                    activeCodeTab === 'run_bat' ? 'bg-zinc-800 text-sky-400 shadow border border-white/5' : 'text-white/40 hover:text-white'
                  }`}
                >
                  <Terminal size={11} />
                  <span>1. chay_tts.bat</span>
                </button>
                <button
                  onClick={() => setActiveCodeTab('run_js')}
                  className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-[11px] ${
                    activeCodeTab === 'run_js' ? 'bg-zinc-800 text-green-400 shadow border border-white/5' : 'text-white/40 hover:text-white'
                  }`}
                >
                  <Cpu size={11} />
                  <span>2. run_piper.js (Node JS ✨)</span>
                </button>
                <button
                  onClick={() => setActiveCodeTab('run_py')}
                  className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-[11px] ${
                    activeCodeTab === 'run_py' ? 'bg-zinc-800 text-yellow-500 shadow border border-white/5' : 'text-white/40 hover:text-white'
                  }`}
                >
                  <Cpu size={11} />
                  <span>3. run_piper.py (Python)</span>
                </button>
                <button
                  onClick={() => setActiveCodeTab('text_txt')}
                  className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-[11px] ${
                    activeCodeTab === 'text_txt' ? 'bg-zinc-800 text-emerald-400 shadow border border-white/5' : 'text-white/40 hover:text-white'
                  }`}
                >
                  <FileText size={11} />
                  <span>4. van_ban_phu_de.txt</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Copy Button */}
                <button
                  onClick={() => copyToClipboard(activeContent.code, activeCodeTab)}
                  className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 hover:text-white text-white/50 text-[10.5px] px-3 py-1.5 rounded-lg border border-white/5 active:scale-95 transition-all font-semibold"
                >
                  {copiedState[activeCodeTab] ? (
                    <>
                      <Check size={11} className="text-emerald-400" />
                      <span className="text-emerald-400">Đã sao chép</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>

                {/* Download Button */}
                <button
                  onClick={() => handleDownload(activeContent.code, activeContent.filename)}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/10 active:scale-95 text-white text-[10.5px] px-3 py-1.5 rounded-lg font-bold transition-all"
                >
                  <Download size={11} />
                  <span>Tải tệp</span>
                </button>
              </div>
            </div>

            {/* Code Body viewport */}
            <div className="relative">
              <pre className="p-4 bg-zinc-950 font-mono text-[10.5px] leading-relaxed text-white/80 overflow-auto h-72 border-b border-white/5">
                <code>{activeContent.code}</code>
              </pre>
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-zinc-900/90 border border-white/10 text-[9px] text-white/30 font-mono select-none uppercase">
                {activeContent.filename}
              </div>
            </div>

            {/* Step-by-step instructions details */}
            <div className="p-6 bg-zinc-900/20 space-y-4">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <HelpCircle size={14} className="text-blue-400" />
                HƯỚNG DẪN CHẠY TRÊN MÁY TÍNH CỦA BẠN (3 BƯỚC KHÉP KÍN)
              </span>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-950/80 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center text-[9px] font-mono font-bold">1</span>
                    <span className="text-[11px] font-bold text-slate-200">Đặt chung vào 1 Folder</span>
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed font-sans">
                    Tạo một thư mục mới tinh trên ổ cứng máy tính (Vd: <code className="bg-zinc-900 text-white/60 px-1 py-0.2 rounded font-mono text-[9px]">D:\Piper_TTS</code>). Tải cả 3 tệp ở trên về và đặt gọn gàng vào thư mục này.
                  </p>
                </div>

                <div className="bg-zinc-950/80 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center text-[9px] font-mono font-bold">2</span>
                    <span className="text-[11px] font-bold text-slate-200">Kích hoạt chay_tts.bat</span>
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed font-sans">
                    Nhấp đúp chuột để chạy tệp <strong className="text-sky-400">chay_tts.bat</strong>. Nó sẽ tự động tải Piper CLI và Giọng đọc mẫu chuẩn từ HuggingFace về (chỉ tải một lần duy nhất).
                  </p>
                </div>

                <div className="bg-zinc-950/80 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 bg-violet-500/10 text-violet-400 rounded-full flex items-center justify-center text-[9px] font-mono font-bold">3</span>
                    <span className="text-[11px] font-bold text-slate-200">Nạp vào Trình Dựng</span>
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed font-sans">
                    Sau khi chạy xong, bạn sẽ thấy xuất hiện file <strong className="text-lime-400 font-mono">giong_doc.wav</strong> và <strong className="text-indigo-400 font-mono">phu_de.srt</strong>. Kéo nạp chúng ngược lại vào V-Sync để tự động khớp ảnh bối cảnh!
                  </p>
                </div>
              </div>
              
              <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl text-[10px] text-white/60 flex items-start gap-2 leading-relaxed">
                <Sparkles size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Lợi ích tối thượng:</strong> Vì Piper chạy trực tiếp bằng bộ vi xử lý trên máy (CPU/GPU) không qua mạng, thời gian chuyển đổi siêu tốc (chưa đầy 5 giây cho cả chục câu thoại dài) và hoàn toàn bí mật riêng tư, YouTube sẽ quét âm thanh chuẩn chất lượng cao và hoàn toàn tối ưu hóa!
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
