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
  Mic,
  Settings,
  Languages,
  Play,
  Pause,
  CloudLightning,
  AlertCircle
} from 'lucide-react';
import { parseSRT } from '../utils/srtParser';

interface EdgeVoice {
  id: string;
  name: string;
  gender: 'Nam' | 'Nữ' | 'Male' | 'Female';
  accent: string;
  voiceId: string;
  description: string;
}

const EDGE_VOICES: EdgeVoice[] = [
  {
    id: 'vi_vn_hoaimy',
    name: 'Hoài My (vi-VN)',
    gender: 'Nữ',
    accent: 'Việt Nam (Miền Nam)',
    voiceId: 'vi-VN-HoaiMyNeural',
    description: 'Giọng nữ Miền Nam ngọt ngào, truyền cảm, cực kỳ tự nhiên, thích hợp cho video review phim, truyện và tài liệu.'
  },
  {
    id: 'vi_vn_namminh',
    name: 'Nam Minh (vi-VN)',
    gender: 'Nam',
    accent: 'Việt Nam (Miền Nam)',
    voiceId: 'vi-VN-NamMinhNeural',
    description: 'Giọng nam Miền Nam trầm ấm, vững chãi, rõ nét từng câu chữ, tối ưu cho video tin tức, thuyết trình, bài giảng.'
  },
  {
    id: 'vi_vn_hoanganh',
    name: 'Hoài An (vi-VN)',
    gender: 'Nữ',
    accent: 'Việt Nam (Miền Bắc)',
    voiceId: 'vi-VN-HoaiAnNeural',
    description: 'Giọng nữ Miền Bắc trong trẻo, điềm đạm, chuẩn mực phát thanh, phù hợp cho tin tức và chia sẻ kiến thức.'
  },
  {
    id: 'en_us_aria',
    name: 'Aria (en-US)',
    gender: 'Nữ',
    accent: 'Mỹ (US)',
    voiceId: 'en-US-AriaNeural',
    description: 'Giọng nữ Mỹ hiện đại, mượt mà và sinh động, chuyên nghiệp cho các video giới thiệu sản phẩm và vlog chia sẻ.'
  },
  {
    id: 'en_us_guy',
    name: 'Guy (en-US)',
    gender: 'Nam',
    accent: 'Mỹ (US)',
    voiceId: 'en-US-GuyNeural',
    description: 'Giọng nam Mỹ đĩnh đạc, ấm áp, sâu sắc và đầy sức mạnh cho video công nghệ, phim tài liệu ngắn.'
  },
  {
    id: 'en_gb_sonia',
    name: 'Sonia (en-GB)',
    gender: 'Nữ',
    accent: 'Anh Quốc (UK)',
    voiceId: 'en-GB-SoniaNeural',
    description: 'Giọng nữ Anh sang trọng, quý phái, chuẩn âm điệu hoàng gia, tuyệt vời cho các nội dung lịch lãm.'
  },
  {
    id: 'it_it_elsa',
    name: 'Elsa (it-IT)',
    gender: 'Nữ',
    accent: 'Ý (Italy)',
    voiceId: 'it-IT-ElsaNeural',
    description: 'Giọng nữ tiếng Ý thanh thoát, sang trọng, uyển chuyển, phù hợp cho du lịch, ẩm thực, và thời trang Ý.'
  },
  {
    id: 'it_it_diego',
    name: 'Diego (it-IT)',
    gender: 'Nam',
    accent: 'Ý (Italy)',
    voiceId: 'it-IT-DiegoNeural',
    description: 'Giọng nam tiếng Ý đĩnh đạc, nam tính, trầm ấm, thích hợp cho tài liệu, giới thiệu địa danh và bài giảng.'
  }
];

const DEFAULT_SAMPLE_TEXT = `Chào mừng bạn đã đến với trình thuyết minh tự động của V-Sync Engine.
Trong bài viết hướng dẫn này, chúng tôi sẽ chỉ cho bạn cách tạo ra giọng đọc siêu thực.
Giọng đọc Edge-TTS thế hệ mới hoàn toàn miễn phí, không giới hạn số lượng ký tự và cực kỳ mượt mà.
Duyệt qua từng câu nói, căn chỉnh tốc độ và khoảng lặng nghỉ ngắt hơi phù hợp.
Sau đó tải bộ công cụ này về máy tính và chạy duy nhất một click là hoàn thành!
Tất cả các cảnh bối cảnh bento-grid và phụ đề sẽ tự động ăn khớp lẫn nhau.
Chúc bạn xây dựng được những clip triệu view chất lượng hàng đầu nhé!`;

interface PiperTtsGeneratorProps {
  onAudioAndSubtitlesGenerated?: (audioFile: File, srtFile: File, parsedBlocks: any[], audioDuration: number) => void;
}

export default function PiperTtsGenerator({ onAudioAndSubtitlesGenerated }: PiperTtsGeneratorProps) {
  const [text, setText] = useState<string>(DEFAULT_SAMPLE_TEXT);
  const [selectedVoice, setSelectedVoice] = useState<EdgeVoice>(EDGE_VOICES[0]);
  const [speed, setSpeed] = useState<number>(1.0); 
  const [silenceGap, setSilenceGap] = useState<number>(0.3); // seconds of pause between lines
  
  // Tab generation mode (online default vs offline instructions)
  const [generationMode, setGenerationMode] = useState<'online' | 'offline'>('online');
  
  // Online generation states
  const [isGeneratingOnline, setIsGeneratingOnline] = useState<boolean>(false);
  const [onlineAudioUrl, setOnlineAudioUrl] = useState<string | null>(null);
  const [onlineSrtContent, setOnlineSrtContent] = useState<string | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineSuccess, setOnlineSuccess] = useState<boolean>(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioPreviewElement, setAudioPreviewElement] = useState<HTMLAudioElement | null>(null);

  // Script file tabs visibility states
  const [activeCodeTab, setActiveCodeTab] = useState<'run_py' | 'run_js' | 'run_bat' | 'text_txt'>('run_bat');
  const [copiedState, setCopiedState] = useState<Record<string, boolean>>({});

  // Clean lines for processing
  const getLines = (): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  // Convert speed input to percentage rate format (e.g. 1.2 -> "+20%", 0.8 -> "-20%")
  const getRateString = (): string => {
    const percent = Math.round((speed - 1.0) * 100);
    return percent >= 0 ? `+${percent}%` : `${percent}%`;
  };

  const handleOnlineGenerate = async () => {
    const lines = getLines();
    if (lines.length === 0) {
      setOnlineError('Nội dung kịch bản trống. Vui lòng nhập ít nhất một dòng.');
      return;
    }

    setIsGeneratingOnline(true);
    setOnlineError(null);
    setOnlineSuccess(false);
    setOnlineAudioUrl(null);
    setOnlineSrtContent(null);
    setIsPlayingAudio(false);
    if (audioPreviewElement) {
      audioPreviewElement.pause();
      setAudioPreviewElement(null);
    }

    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lines,
          voice: selectedVoice.voiceId,
          speed,
          silenceGap
        })
      });

      const res = await response.json();

      if (!response.ok || !res.success) {
        throw new Error(res.error || 'Không thể kết xuất giọng nói từ máy chủ.');
      }

      setOnlineAudioUrl(res.audioUrl);
      setOnlineSrtContent(res.srtContent);
      setOnlineSuccess(true);
    } catch (err: any) {
      console.error('Lỗi tts online:', err);
      setOnlineError(err.message || 'Lỗi mạng hoặc hệ thống không kết nối được.');
    } finally {
      setIsGeneratingOnline(false);
    }
  };

  const handleApplyToProject = async () => {
    if (!onlineAudioUrl || !onlineSrtContent || !onAudioAndSubtitlesGenerated) return;

    try {
      // 1. Convert base64 dataUrl back to a File
      const response = await fetch(onlineAudioUrl);
      const blob = await response.blob();
      const audioFile = new File([blob], 'giong_doc.mp3', { type: 'audio/mp3' });

      // 2. Convert SRT string to a File
      const srtBlob = new Blob([onlineSrtContent], { type: 'text/plain;charset=utf-8' });
      const srtFile = new File([srtBlob], 'phu_de.srt', { type: 'text/plain;charset=utf-8' });

      // 3. Parse SRT content to get blocks
      const parsedBlocks = parseSRT(onlineSrtContent);

      // 4. Determine total duration
      let totalDuration = 0;
      if (parsedBlocks.length > 0) {
        totalDuration = parsedBlocks[parsedBlocks.length - 1].endTime;
      }

      onAudioAndSubtitlesGenerated(audioFile, srtFile, parsedBlocks, totalDuration);
    } catch (err) {
      console.error('Lỗi khi áp dụng vào dự án:', err);
      setOnlineError('Lỗi dọn nạp tự động: ' + (err as Error).message);
    }
  };

  const handleTogglePlayPreview = () => {
    if (!onlineAudioUrl) return;

    if (isPlayingAudio && audioPreviewElement) {
      audioPreviewElement.pause();
      setIsPlayingAudio(false);
    } else {
      if (audioPreviewElement) {
         audioPreviewElement.currentTime = 0;
         audioPreviewElement.play();
         setIsPlayingAudio(true);
      } else {
        const audio = new Audio(onlineAudioUrl);
        audio.onended = () => {
          setIsPlayingAudio(false);
        };
        audio.play().then(() => {
          setAudioPreviewElement(audio);
          setIsPlayingAudio(true);
        }).catch(err => {
          console.error("Lỗi phát audio:", err);
        });
      }
    }
  };

  // Generate Python script for Edge-TTS
  const getPythonScript = (): string => {
    return `import os
import sys
import asyncio
import re

# --- CẤU HÌNH ĐÃ ĐỒNG BỘ TỪ GIAO DIỆN V-SYNC ENGINE ---
INPUT_FILE = "van_ban_phu_de.txt"
OUTPUT_AUDIO = "giong_doc.mp3"
OUTPUT_SRT = "phu_de.srt"
VOICE_ID = "${selectedVoice.voiceId}"
SPEED_RATE = "${getRateString()}"
SILENCE_GAP = ${silenceGap}  # Khoảng lặng nghỉ giữa mỗi câu (giây)

# --- THAY THẾ BẰNG THAM SỐ DÒNG LỆNH NẾU ĐƯỢC CHUYỂN VÀO ---
if len(sys.argv) > 1:
    arg_voice = sys.argv[1].strip()
    if arg_voice:
        VOICE_ID = arg_voice

if len(sys.argv) > 2:
    arg_speed = sys.argv[2].strip()
    if arg_speed:
        SPEED_RATE = arg_speed

if len(sys.argv) > 3:
    try:
        SILENCE_GAP = float(sys.argv[3])
    except Exception:
        pass

# --- TỰ ĐỘNG KIỂM TRA & CÀI ĐẶT THƯ VIỆN CHUYÊN DỤNG EDGE-TTS ---
try:
    import edge_tts
except ImportError:
    print("[*] Thư viện 'edge-tts' chưa được cài đặt.")
    print("[*] Tiến hành tự động tải và cấu hình thư viện từ Internet...")
    import subprocess
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "edge-tts"])
        import edge_tts
        print("[+] Cài đặt thành công thư viện edge-tts. Bắt đầu xử lý!\\n")
    except Exception as e:
        print(f"[!] Lỗi tự động cài đặt thư viện: {e}")
        print("[!] Vui lòng tự chạy lệnh sau ngoài CMD: pip install edge-tts")
        sys.exit(1)

def format_srt_time(seconds):
    hrs = int(seconds // 3600)
    mints = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hrs:02d}:{mints:02d}:{secs:02d},{millis:03d}"

async def generate_speech_chunk(sentence, voice, rate, chunk_idx, temp_dir):
    part_mp3 = os.path.join(temp_dir, f"part_{chunk_idx:04d}.mp3")
    
    # Sử dụng Communicate của edge-tts
    communicate = edge_tts.Communicate(sentence, voice, rate=rate)
    
    audio_data = bytearray()
    last_ticks = 0
    
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            # word boundary ticks (100-nanoseconds)
            offset = chunk["offset"]
            duration = chunk["duration"]
            last_ticks = max(last_ticks, offset + duration)
            
    if not audio_data:
        return None, 0.0

    # Lưu file Mp3 phân khúc tạm thời
    with open(part_mp3, "wb") as f:
        f.write(audio_data)
        
    duration = last_ticks / 10000000.0 if last_ticks > 0 else len(audio_data) / 6000.0
    return part_mp3, duration

async def generate_silence_chunk(duration, voice, chunk_idx, temp_dir):
    part_silence = os.path.join(temp_dir, f"silence_{chunk_idx:04d}.mp3")
    ms = int(duration * 1000)
    
    # Sử dụng SSML break tag để Microsoft tự động tạo audio im lặng đồng bộ hoàn hảo
    ssml = f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN"><voice name="{voice}"><break time="{ms}ms"/></voice></speak>'
    communicate = edge_tts.Communicate(ssml, voice)
    
    audio_data = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.extend(chunk["data"])
            
    if not audio_data:
        return None
        
    with open(part_silence, "wb") as f:
        f.write(audio_data)
        
    return part_silence

async def async_main():
    print("==================================================")
    print("     TIẾN TRÌNH MICROSOFT EDGE-TTS SIÊU TỰ NHIÊN  ")
    print("==================================================")
    
    if not os.path.exists(INPUT_FILE):
        print(f"[LỖI] Không tìm thấy file văn bản thuyết minh: {INPUT_FILE}")
        print("Vui lòng đảm bảo tệp này nằm cùng thư mục chạy script.")
        return

    # Đọc danh sách câu nói
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]
        
    if not lines:
        print("[LỖI] Tệp văn bản thuyết minh đang trống rỗng!")
        return
        
    print(f"[*] Nhận diện: {len(lines)} câu thuyết minh.")
    print(f"[*] Giọng đọc AI: {VOICE_ID} | Tốc độ: {SPEED_RATE}")
    
    temp_dir = "temp_edge_tts"
    os.makedirs(temp_dir, exist_ok=True)
    
    temp_audio_files = []
    srt_blocks = []
    current_time = 0.0
    
    try:
        for idx, sentence in enumerate(lines, start=1):
            preview = sentence[:35] + ("..." if len(sentence) > 35 else "")
            print(f" -> [{idx}/{len(lines)}] Đang thuyết minh AI: \\"{preview}\\"")
            
            # 1. Tạo audio tiếng nói cho câu
            try:
                part_path, duration = await generate_speech_chunk(sentence, VOICE_ID, SPEED_RATE, idx, temp_dir)
            except Exception as e:
                # Nếu không nhận được audio, khả năng cao là do thư viện edge-tts đã cũ bị Microsoft từ chối kết nối
                if "NoAudioReceived" in str(type(e)) or "NoAudioReceived" in str(e):
                    print("\\n[!] Cảnh báo: Không lấy được giọng thuyết minh từ Microsoft (Lỗi NoAudioReceived).")
                    print("[*] Có thể thư viện 'edge-tts' trên máy tính của bạn đã cũ (Outdated).")
                    print("[*] Đang tự động nâng cấp 'edge-tts' lên phiên bản mới nhất từ Internet...")
                    import subprocess
                    try:
                        subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "edge-tts"])
                        print("[+] Đã tự động nâng cấp thư viện thành công! Đang thử khởi động lại phân cảnh...")
                        import importlib
                        importlib.reload(edge_tts)
                        # Thử lại một lần nữa
                        part_path, duration = await generate_speech_chunk(sentence, VOICE_ID, SPEED_RATE, idx, temp_dir)
                    except Exception as re_err:
                        print(f"[!] Cài đặt tự động thất bại hoặc vẫn gặp lỗi: {re_err}")
                        print("[QUAN TRỌNG] Vui lòng mở Command Prompt (CMD) trên Windows và chạy lệnh:")
                        print("  pip install --upgrade edge-tts")
                        print("Sau đó chạy lại file chay_tts.bat để sửa lỗi hoàn toàn.")
                        raise e
                else:
                    raise e

            if not part_path:
                print(f" [!] Lỗi khi tạo tiếng câu số {idx}, bỏ qua.")
                continue
                
            start_t = current_time
            end_t = start_t + duration
            srt_blocks.append((idx, start_t, end_t, sentence))
            temp_audio_files.append(part_path)
            
            # 2. Tạo đoạn lặng chèn ngắt hơi (ngoại trừ câu cuối cùng)
            if idx < len(lines) and SILENCE_GAP > 0:
                silence_path = await generate_silence_chunk(SILENCE_GAP, VOICE_ID, idx, temp_dir)
                if silence_path:
                    temp_audio_files.append(silence_path)
                current_time = end_t + SILENCE_GAP
            else:
                current_time = end_t
                
        if not temp_audio_files:
            print("[LỖI] Không tạo được bất kỳ file âm thanh nào.")
            return
            
        # 3. Ghép các file MP3 lại thành file duy nhất (MP3 ghép trực tiếp cực kỳ mượt mà và an toàn)
        print(f"[*] Tiến hành hợp nhất các phân đoạn thành sản phẩm cuối: {OUTPUT_AUDIO}...")
        with open(OUTPUT_AUDIO, "wb") as outfile:
            for audio_p in temp_audio_files:
                if os.path.exists(audio_p):
                    with open(audio_p, "rb") as infile:
                        outfile.write(infile.read())
                        
        # 4. Ghi file phụ đề SRT
        print(f"[*] Tiến hành xuất bản file phụ đề đồng bộ: {OUTPUT_SRT}...")
        with open(OUTPUT_SRT, "w", encoding="utf-8") as f:
            for num, s_t, e_t, text_v in srt_blocks:
                f.write(f"{num}\\n")
                f.write(f"{format_srt_time(s_t)} --> {format_srt_time(e_t)}\\n")
                f.write(f"{text_v}\\n\\n")
                
        print("\\n[ĐÃ HOÀN THÀNH XUẤT SẮC]")
        print(f" >> Tệp audio thuyết minh: {OUTPUT_AUDIO}")
        print(f" >> Tệp phụ đề đồng bộ: {OUTPUT_SRT}")
        print("Mẹo: Kéo thả 2 tệp trên vào website V-Sync Engine để tự dựng video tự động!")
        
    finally:
        # Dọn dẹp folder rác và file tạm
        for path in temp_audio_files:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except:
                pass
        try:
            os.rmdir(temp_dir)
        except:
            pass

if __name__ == "__main__":
    if sys.platform == "win32":
        # Tránh lỗi Event Loop Policy trên Windows
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(async_main())
`;
  };

  // Generate Node JS Bridge Script
  const getNodeScript = (): string => {
    return `const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("==================================================");
console.log("    EDGE-TTS PIPELINE CLIENT FOR V-SYNC ENGINE    ");
console.log("==================================================");

// Đoạn script này đóng vai trò kích hoạt trình biên dịch Python Edge-TTS tối tân
const pythonScript = path.join(__dirname, "run_edge_tts.py");

if (!fs.existsSync(pythonScript)) {
  console.error("[LỖI] Không tìm thấy file run_edge_tts.py!");
  console.error("Vui lòng tải đầy đủ cả 2 file run_edge_tts.py và bản cjs về cùng thư mục.");
  process.exit(1);
}

console.log("[*] Đang chuyển tiếp tiến trình thuyết minh sang trình Python...");
const pyProcess = spawn("python", [pythonScript], { stdio: "inherit" });

pyProcess.on("close", (code) => {
  if (code === 0) {
    console.log("[NodeJS] Tiến trình thành công rực rỡ.");
  } else {
    console.log(\`[NodeJS] Tiến trình kết thúc với mã lỗi \${code}.\`);
  }
});
`;
  };

  // Generate Batch file loader
  const getBatchScript = (voiceId?: string, voiceName?: string): string => {
    const targetVoice = voiceId || selectedVoice.voiceId;
    const targetName = voiceName || selectedVoice.name;
    const rateString = getRateString();
    return `@echo off
cd /d "%~dp0"
title Edge-TTS Automatic Generator [${targetName}] - V-Sync Engine
cls
echo =======================================================================
echo          AUTOMATIC MICROSOFT EDGE-TTS (VOICE: ${targetName})
echo                     Powered by V-Sync Engine
echo =======================================================================
echo.

REM Kiểm tra sự hiện diện của môi trường Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [LỖI] Không tìm thấy môi trường Python trên máy tính của bạn!
    echo.
    echo Để sử dụng giọng đọc siêu thật, mượt mà từ Edge-TTS hoàn toàn miễn phí:
    echo 1. Hãy tải và cài đặt Python từ website chính thức:
    echo    https://www.python.org/downloads/
    echo 2. Cực kỳ quan trọng: Nhớ TÍCH CHỌN "Add Python to PATH" khi cài đặt!
    echo 3. Nhấp đúp lại file này để chạy lại.
    echo.
    echo ----------------------------------------------------------------------
    echo Ưu điểm lớn nhất của Edge-TTS là miễn phí, không cần bất kỳ API Key nào,
    echo không giới hạn ký tự và hỗ trợ đầy đủ tiếng Việt Nam cực kỳ mượt mà!
    echo ----------------------------------------------------------------------
    echo.
    pause
    exit /b
)

echo [*] Đang kiểm tra thư viện 'edge-tts' và kích hoạt giọng nói [${targetName}]...
python run_edge_tts.py "${targetVoice}" "${rateString}" ${silenceGap}

if %errorlevel% equ 0 (
    echo.
    echo =======================================================================
    echo [ THÀNH CÔNG RỰC RỠ ]
    echo Đã tạo xong file giọng đọc [giong_doc.mp3] và file phụ đề [phu_de.srt]!
    echo.
    echo Kế tiếp: Hãy kéo thả 2 tệp tin này trực tiếp vào V-Sync Engine trên web
    echo để thưởng thức thành phẩm ăn khớp slide bối cảnh bento-grid đỉnh cao!
    echo =======================================================================
) else (
    echo.
    echo [LỖI] Tiến trình thuyết minh thất bại. 
    echo Hãy đảm bảo máy tính của bạn có kết nối Internet để kết nối tới máy chủ Edge-TTS.
)
echo.
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
          filename: 'run_edge_tts.cjs',
          lang: 'javascript'
        };
      case 'run_py':
        return {
          code: getPythonScript(),
          filename: 'run_edge_tts.py',
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
    <div className="space-y-8 animate-in fade-in duration-350" id="edge-tts-tool-component">
      {/* Visual Header card decoration */}
      <div className="bg-gradient-to-r from-emerald-950/40 to-blue-950/30 border border-emerald-500/10 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">
            <Mic size={13} className="animate-pulse" />
            <span>EDGE-TTS GIỌNG AI SIÊU MƯỢT (MIỄN PHÍ %100)</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white font-sans">
            Trình kết xuất giọng nói &amp; Phụ đề Edge-TTS chất lượng cao
          </h2>
          <p className="text-xs text-white/50 leading-relaxed font-sans">
            Thay thế hoàn toàn Piper thô cứng bằng <strong>Microsoft Edge-TTS</strong> thế hệ mới. Không chỉ miễn phí hoàn toàn, không cần API Key, không bị bóp băng thông, Edge-TTS còn sở hữu những giọng đọc tiếng Việt siêu truyền cảm (vượt trội so với Piper). Bạn chỉ cần nhập kịch bản bên dưới, tải gói script về máy chạy và tận hưởng file audio <code className="bg-slate-900 text-white/80 px-1 py-0.5 rounded text-[10px] font-mono">giong_doc.mp3</code> lẫn phụ đề chuẩn khung slide!
          </p>
        </div>
        
        <div className="shrink-0 flex items-center justify-center p-4 bg-emerald-500/5 rounded-xl border border-emerald-400/10 self-center">
          <Terminal size={40} className="text-emerald-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Editor & Options */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#0E0E12] border border-white/10 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <FileText size={14} className="text-emerald-400" />
                VĂN BẢN KỊCH BẢN (MỖI DÒNG LÀ 1 PHÂN CẢNH)
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
                className="w-full h-80 bg-zinc-950 text-[11px] text-white/90 p-4 rounded-xl border border-white/5 focus:border-emerald-500/40 focus:outline-none font-sans leading-relaxed resize-none shadow-inner"
                placeholder="Nhập kịch bản thuyết minh của bạn ở đây...
Mỗi dòng viết xuống sẽ trở thành 1 phân cảnh srt có mốc thời gian hoàn hảo khớp với câu thuyết minh đó!"
              />
              <div className="flex items-center justify-between text-[10px] text-white/40 px-1">
                <span>Số câu/phân cảnh: <strong className="text-white/80">{getLines().length}</strong></span>
                <span>Tự động khớp 1 dòng = 1 slide</span>
              </div>
            </div>

            {/* Vocal Config Section */}
            <div className="space-y-4 border-t border-white/5 pt-4">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Volume2 size={14} className="text-emerald-400" />
                LỰA CHỌN GIỌNG ĐỌC AI MƯỢT MÀ
              </span>

              {/* Voice selectors */}
              <div className="space-y-2">
                <label className="text-[10px] text-white/40 uppercase block font-semibold flex items-center gap-1">
                  <Languages size={10} /> Giọng đọc khuyên dùng (Mẫu thử tiếng Việt &amp; Anh)
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {EDGE_VOICES.map(voice => (
                    <button
                      key={voice.id}
                      onClick={() => setSelectedVoice(voice)}
                      className={`p-3 rounded-xl border text-left flex flex-col justify-between gap-1 transition-all hover:bg-white/5 active:scale-95 ${
                        selectedVoice.id === voice.id 
                          ? 'bg-emerald-600/10 border-emerald-500 text-white' 
                          : 'bg-zinc-900/50 border-white/5 text-white/50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[11px] font-bold block truncate max-w-[80px]">{voice.name}</span>
                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                          voice.gender === 'Nam' ? 'bg-sky-500/10 text-sky-400' : 'bg-pink-500/10 text-pink-400'
                        }`}>
                          {voice.gender === 'Nam' ? 'Nam' : 'Nữ'}
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
                    <span className="text-[10px] text-emerald-400 font-bold font-mono">{speed.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer h-1 rounded bg-zinc-800"
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
                    max="1.5"
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
                  <Info size={12} className="text-emerald-400" />
                  <span>Cắt ghép khoảng lặng tối tân:</span>
                </div>
                <p>
                  Đặt nghỉ <strong className="text-emerald-400">{silenceGap} giây</strong>. Script sẽ lấy trực tiếp break tag từ Microsoft để có được dải âm im lặng cực tinh tế, tạo độ trễ thích nghi cho slide bối cảnh mà không bị lệch nhịp!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Mode selector, Online render panel, or Code viewer */}
        <div className="lg:col-span-7 space-y-6">
          {/* Mode Switcher Buttons */}
          <div className="flex bg-zinc-950 p-1 border border-white/5 rounded-2xl">
            <button
              onClick={() => setGenerationMode('online')}
              className={`flex-1 py-3 text-center rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-xs ${
                generationMode === 'online'
                  ? 'bg-emerald-600 text-white shadow shadow-emerald-600/10'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <CloudLightning size={14} />
              <span>⚡ KẾT XUẤT ONLINE (Khuyên dùng - Không cần cài đặt)</span>
            </button>
            <button
              onClick={() => setGenerationMode('offline')}
              className={`flex-1 py-3 text-center rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-xs ${
                generationMode === 'offline'
                  ? 'bg-zinc-800 text-white shadow'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <Terminal size={14} />
              <span>💻 CHẠY OFFLINE LOCAL (Kịch bản CMD cá nhân)</span>
            </button>
          </div>

          {generationMode === 'online' ? (
            <div className="bg-[#0E0E12] border border-white/10 rounded-2xl shadow-xl flex flex-col overflow-hidden p-6 space-y-6">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 font-sans">
                  <CloudLightning size={16} className="text-emerald-400 font-sans" />
                  Kết xuất giọng nói &amp; Căn chỉnh thời gian tự động (Online Server)
                </h3>
                <p className="text-[11px] text-white/40 leading-relaxed font-sans">
                  Hệ thống sẽ gửi yêu cầu trực tiếp đến Microsoft Cloud để chuyển hóa kịch bản của bạn thành audio chất lượng 24kHz kết hợp định hình tệp phụ đề <code className="text-white/60 bg-white/5 px-1 rounded">.srt</code> ăn khớp từng giây!
                </p>
              </div>

              {onlineError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-start gap-2 animate-in fade-in duration-200">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <div className="space-y-1 font-sans">
                    <span className="font-bold block">Gặp lỗi kết xuất:</span>
                    <p className="leading-relaxed">{onlineError}</p>
                    <p className="text-[10px] text-rose-400/60 mt-1">Gợi ý: Hãy kiểm tra kết nối mạng của bạn hoặc bớt một số dòng trống có thể gây xung đột.</p>
                  </div>
                </div>
              )}

              {/* Action viewport */}
              <div className="bg-zinc-950/80 rounded-2xl p-6 border border-white/5 space-y-6 flex flex-col items-center justify-center text-center min-h-[16rem]">
                {!onlineSuccess && !isGeneratingOnline && (
                  <div className="space-y-4 max-w-sm">
                    <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                      <CloudLightning size={20} className="text-emerald-400" />
                    </div>
                    <div className="space-y-1.5 font-sans">
                      <span className="text-xs font-bold text-white block">Sẵn sàng khởi tạo online!</span>
                      <p className="text-[10px] text-white/30 leading-relaxed">
                        Nhấn nút kết xuất phía dưới để chuyển đổi toàn bộ <strong className="text-white/60">{getLines().length} dòng kịch bản</strong> sang giọng AI của <strong className="text-white/60">{selectedVoice.name} ({selectedVoice.gender})</strong>.
                      </p>
                    </div>

                    <button
                      onClick={handleOnlineGenerate}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white py-3.5 px-6 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10 font-sans cursor-pointer"
                    >
                      <CloudLightning size={14} className="animate-bounce" />
                      <span>BẮT ĐẦU KẾT XUẤT PHỤ ĐỀ &amp; AUDIO</span>
                    </button>
                  </div>
                )}

                {isGeneratingOnline && (
                  <div className="space-y-4 max-w-sm py-4">
                    <div className="relative mx-auto w-14 h-14 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-2 border-emerald-500/10 border-t-emerald-500 animate-spin"></div>
                      <CloudLightning size={20} className="text-emerald-400 animate-pulse" />
                    </div>
                    <div className="space-y-1.5 font-sans">
                      <span className="text-xs font-bold text-emerald-400 block animate-pulse">Đang yêu cầu Microsoft Cloud...</span>
                      <p className="text-[10px] text-white/30 leading-relaxed font-sans">
                        Đang lấy mẫu giọng đọc kịch bản và căn khớp mốc thời gian mượt mà. Tiến trình có thể mất từ 5-15 giây tùy vào độ dài của kịch bản của bạn.
                      </p>
                    </div>
                  </div>
                )}

                {onlineSuccess && (
                  <div className="space-y-6 w-full max-w-md">
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 justify-center font-sans">
                        <Check size={14} />
                        <span>KẾT XUẤT HOÀN TẤT THÀNH CÔNG!</span>
                      </div>
                      <p className="text-[10px] text-white/50 leading-relaxed font-sans max-w-xs mx-auto">
                        Đã sẵn sàng luồng âm thanh <strong className="text-white/70">giong_doc.mp3</strong> cùng file phụ đề khớp hoàn hảo theo dòng bối cảnh của bạn. Bạn có thể nghe thử trước hoặc áp dụng trực tiếp!
                      </p>

                      {/* Custom Audio Player */}
                      <div className="flex items-center justify-between bg-[#0B0B0C] rounded-lg p-2.5 border border-white/5">
                        <button
                          onClick={handleTogglePlayPreview}
                          className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center active:scale-90 transition-all shrink-0 cursor-pointer"
                        >
                          {isPlayingAudio ? <Pause size={12} fill="white" /> : <Play size={12} fill="white" className="ml-0.5" />}
                        </button>
                        <div className="flex-1 px-3 text-left overflow-hidden font-sans">
                          <span className="text-[10px] font-bold text-white block truncate">Mẫu nghe thử Trình Thuyết Minh</span>
                          <span className="text-[8px] text-white/30 font-mono block">Giọng đọc: {selectedVoice.name} ({speed.toFixed(1)}x)</span>
                        </div>
                        <div className="shrink-0 flex items-center gap-1 bg-white/5 px-2 py-1 rounded text-[8px] font-mono font-bold text-emerald-400">
                          <Volume2 size={10} />
                          <span>Online</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 font-sans">
                      {onAudioAndSubtitlesGenerated && (
                        <button
                          onClick={handleApplyToProject}
                          className="w-full bg-linear-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 hover:shadow-xl hover:shadow-emerald-600/15 active:scale-[0.98] text-white py-3 px-6 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 border border-emerald-400/20 select-none animate-pulse cursor-pointer"
                        >
                          <Sparkles size={13} className="text-amber-300" />
                          <span>⚡ ÁP DỤNG TRỰC TIẾP VÀO DỰ ÁN (1 CLICK)</span>
                        </button>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        {/* Download MP3 */}
                        <a
                          href={onlineAudioUrl || undefined}
                          download="giong_doc.mp3"
                          className="bg-[#121216] select-none hover:bg-zinc-800 text-white/80 py-2.5 px-4 rounded-xl font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 border border-white/5 active:scale-95 animate-in slide-in-from-left-2 duration-150 cursor-pointer font-sans"
                        >
                          <Download size={12} />
                          <span>Tải giong_doc.mp3</span>
                        </a>

                        {/* Download SRT */}
                        <button
                          onClick={() => {
                            if (!onlineSrtContent) return;
                            const blob = new Blob([onlineSrtContent], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'phu_de.srt';
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="bg-[#121216] select-none hover:bg-zinc-800 text-white/80 py-2.5 px-4 rounded-xl font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 border border-white/5 active:scale-95 animate-in slide-in-from-right-2 duration-150 cursor-pointer font-sans"
                        >
                          <Download size={12} />
                          <span>Tải phu_de.srt</span>
                        </button>
                      </div>

                      <button
                        onClick={handleOnlineGenerate}
                        className="text-[10px] text-white/30 hover:text-white flex items-center gap-1 justify-center mt-1.5 transition-all cursor-pointer font-sans"
                      >
                        <RefreshCw size={10} /> Tạo lại giọng đọc khác
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Informative advice */}
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-[10px] text-white/60 flex items-start gap-2 leading-relaxed font-sans">
                <Sparkles size={14} className="text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                <span>
                  <strong>Phương pháp tiện lợi nhất:</strong> Sử dụng luồng kết xuất Online giúp bạn không cần cài đặt Python hay chạy bất cứ lệnh DOS/CMD phức tạp nào trên máy tính. Bạn vừa có thể nghe thử trước giọng thuyết minh, vừa nạp trực tiếp chỉ qua 1 click cực kỳ tinh giản, mượt mà!
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-[#0E0E12] border border-white/10 rounded-2xl shadow-xl flex flex-col overflow-hidden">
               {/* Header tab controller */}
              <div className="bg-zinc-950 p-4 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="flex gap-1.5 bg-white/5 p-1 rounded-lg border border-white/10 text-xs flex-wrap">
                  <button
                    onClick={() => setActiveCodeTab('run_bat')}
                    className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-[11px] ${
                      activeCodeTab === 'run_bat' ? 'bg-zinc-800 text-emerald-400 shadow border border-white/5' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    <Terminal size={11} />
                    <span>1. chay_tts.bat</span>
                  </button>
                  <button
                    onClick={() => setActiveCodeTab('run_py')}
                    className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-[11px] ${
                      activeCodeTab === 'run_py' ? 'bg-zinc-800 text-yellow-500 shadow border border-white/5' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    <Cpu size={11} />
                    <span>2. run_edge_tts.py (Mã nguồn chính 🌟)</span>
                  </button>
                  <button
                    onClick={() => setActiveCodeTab('run_js')}
                    className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-[11px] ${
                      activeCodeTab === 'run_js' ? 'bg-zinc-800 text-sky-450 text-sky-400 shadow border border-white/5' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    <Cpu size={11} />
                    <span>3. run_edge_tts.cjs (Node JS 🎉)</span>
                  </button>
                  <button
                    onClick={() => setActiveCodeTab('text_txt')}
                    className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-[11px] ${
                      activeCodeTab === 'text_txt' ? 'bg-zinc-800 text-rose-405 text-rose-450 text-rose-400 shadow border border-white/5' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    <FileText size={11} />
                    <span>4. van_ban_phu_de.txt</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 font-sans">
                  {/* Copy Button */}
                  <button
                    onClick={() => copyToClipboard(activeContent.code, activeCodeTab)}
                    className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 hover:text-white text-white/50 text-[10.5px] px-3 py-1.5 rounded-lg border border-white/5 active:scale-95 transition-all font-semibold cursor-pointer"
                  >
                    {copiedState[activeCodeTab] ? (
                      <>
                        <Check size={11} className="text-emerald-400" />
                        <span className="text-emerald-400 font-bold">Đã sao chép</span>
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
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-600/10 active:scale-95 text-white text-[10.5px] px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer"
                  >
                    <Download size={11} />
                    <span>Tải tệp</span>
                  </button>
                </div>
              </div>

              {/* Code Body viewport */}
              <div className="relative">
                <pre className="p-4 bg-zinc-950 font-mono text-[10.5px] leading-relaxed text-white/85 overflow-auto h-72 border-b border-white/5">
                  <code>{activeContent.code}</code>
                </pre>
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#0A0A0C]/90 border border-white/10 text-[9px] text-white/30 font-mono select-none uppercase">
                  {activeContent.filename}
                </div>
              </div>

              {/* Dynamic Multiple Voice BAT Downloader Grid */}
              {activeCodeTab === 'run_bat' && (
                <div className="p-4 bg-zinc-950/60 border-b border-white/5 space-y-3 font-sans">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                    <Terminal size={12} />
                    <span>📥 ĐẮT LỰC: Tải nhanh file BAT thiết lập sẵn cho từng giọng nói:</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {EDGE_VOICES.map((v) => {
                      let fileNameStr = "chay_tts.bat";
                      if (v.voiceId.startsWith("vi-")) {
                        fileNameStr = `chay_giong_${v.gender === "Nam" ? "nam" : "nu"}_mien_${v.accent.includes("Nam") ? "nam" : "bac"}_${v.name.split(' ')[0]}.bat`;
                      } else if (v.voiceId.startsWith("en-")) {
                        fileNameStr = `chay_giong_${v.gender === "Nam" ? "nam" : "nu"}_tieng_anh_${v.name.split(' ')[0]}.bat`;
                      } else if (v.voiceId.startsWith("it-")) {
                        fileNameStr = `chay_giong_${v.gender === "Nam" ? "nam" : "nu"}_tieng_y_${v.name.split(' ')[0]}.bat`;
                      }
                      
                      return (
                        <button
                          key={v.id}
                          onClick={() => handleDownload(getBatchScript(v.voiceId, v.name), fileNameStr)}
                          className="flex items-center justify-between p-2.5 bg-white/5 hover:bg-emerald-600/15 hover:border-emerald-500/40 border border-white/5 rounded-xl text-left text-[10px] text-white transition-all font-semibold active:scale-95 group cursor-pointer"
                          title={`Tải xuống file BAT chạy giọng ${v.name}`}
                        >
                          <div className="truncate pr-1">
                            <span className="font-bold block truncate text-slate-200 group-hover:text-emerald-400">{v.name}</span>
                            <span className="text-[8.5px] text-white/45 block truncate leading-tight">{v.accent} ({v.gender})</span>
                          </div>
                          <Download size={11} className="text-white/30 group-hover:text-emerald-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9.5px] text-white/35 leading-relaxed font-medium">
                    * Bạn có thể tải nhiều tệp BAT tương ứng với từng giọng đọc khác nhau về lưu chung 1 thư mục. Khi muốn đổi giọng, bạn chỉ cần mở file .txt sửa nội dung rồi kích đúp chọn file BAT tương ứng để xuất giọng phù hợp!
                  </p>
                </div>
              )}

              {/* Step-by-step instructions details */}
              <div className="p-6 bg-emerald-950/5 border-t border-white/5 space-y-4">
                <span className="text-xs font-bold text-white flex items-center gap-2 font-sans">
                  <HelpCircle size={14} className="text-emerald-400" />
                  HƯỚNG DẪN 3 BƯỚC THUYẾT MINH OFFLINE ĐƠN GIẢN TRÊN MÁY TÍNH
                </span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans text-xs">
                  <div className="bg-zinc-950/80 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center text-[9px] font-mono font-bold">1</span>
                      <span className="text-[11px] font-bold text-slate-200">Gom chung 1 Folder</span>
                    </div>
                    <p className="text-[10px] text-white/40 leading-relaxed font-sans">
                      Tạo một thư mục mới trên máy tính của bạn (Vd: <code className="bg-zinc-900 text-white/60 px-1 py-0.2 rounded font-mono text-[9px]">D:\Edge_TTS</code>). Tải tệp tin chính <strong className="text-yellow-400 font-mono">run_edge_tts.py</strong> và bất kỳ tệp <strong className="text-emerald-400 font-mono">.bat</strong> giọng đọc nào bạn muốn sử dụng ở trên về cùng thư mục này.
                    </p>
                  </div>

                  <div className="bg-zinc-950/80 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 bg-yellow-500/10 text-yellow-500 rounded-full flex items-center justify-center text-[9px] font-mono font-bold">2</span>
                      <span className="text-[11px] font-bold text-slate-200">Sửa văn bản &amp; Kích hoạt BAT</span>
                    </div>
                    <p className="text-[10px] text-white/40 leading-relaxed font-sans">
                      Tạo hoặc tải tệp <strong className="text-rose-400">van_ban_phu_de.txt</strong> lưu vào thư mục. Sửa nội dung tiếng Việt, Anh, Ý... sau đó chỉ cần kích đúp chuột trái vào tệp tệp tin <strong className="text-emerald-400 font-bold">BAT của giọng đọc tương ứng</strong> để tự động tạo audio giọng đọc chất lượng cao!
                    </p>
                  </div>

                  <div className="bg-zinc-950/80 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 bg-violet-500/10 text-violet-400 rounded-full flex items-center justify-center text-[9px] font-mono font-bold">3</span>
                      <span className="text-[11px] font-bold text-slate-200">Nạp lại vào V-Sync</span>
                    </div>
                    <p className="text-[10px] text-white/40 leading-relaxed font-sans">
                      Ngay khi chạy xong, trong thư mục sẽ xuất hiện tự động hai file <strong className="text-lime-400 font-mono">giong_doc.mp3</strong> và <strong className="text-indigo-400 font-mono">phu_de.srt</strong>. Bạn kéo nạp ngược lại website để tự động phát khớp video bối cảnh!
                    </p>
                  </div>
                </div>
                
                <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-[10px] text-white/60 flex items-start gap-2 leading-relaxed font-sans">
                  <Sparkles size={14} className="text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                  <span>
                    <strong>Cần cài đặt những gì?</strong> Đối với chế độ chạy Offline Local này, máy tính cá nhân của bạn cần cài đặt sẵn Python (trong lúc cài Windows hãy tích chọn "Add python to PATH"). Nếu máy của bạn không cài đặt sẵn Python, chúng tôi khuyên bạn nên sử dụng tùy chọn <strong>KẾT XUẤT ONLINE</strong> tiện lợi ở kề bên!
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
