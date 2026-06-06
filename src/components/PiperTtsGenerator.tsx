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
  const [activeCodeTab, setActiveCodeTab] = useState<'run_py' | 'run_bat' | 'text_txt'>('run_bat');
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
    if not exist "piper\\piper.exe" (
        echo [*] Đang tải xuống Trình sinh âm thanh Piper TTS (Windows AMD64)...
        curl -L -o piper_win.zip "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_windows_amd64.zip"
        
        echo [*] Đang giải nén Piper qua Powershell...
        powershell -Command "Expand-Archive -Path 'piper_win.zip' -DestinationPath 'piper_temp'"
        
        echo [*] Di chuyển tệp tin ra thư mục hiện hành...
        move /y "piper_temp\\piper\\*" ".\\"
        
        echo [*] Dọn dẹp tệp tin cài đặt tạm...
        rd /s /q "piper_temp"
        del piper_win.zip
    )
)

:: Tải giọng đọc Tiếng Anh được chỉ định nếu chưa tồn tại cục bộ
if not exist "${selectedVoice.modelName}" (
    echo [*] Đang tải về giọng đọc thông minh Tiếng Anh: ${selectedVoice.name} (${selectedVoice.gender} - ${selectedVoice.accent})...
    echo [!] Kích thước tệp giọng khoảng ~80MB, quá trình này chỉ tải một lần duy nhất.
    
    curl -L -o "${selectedVoice.modelName}" "${selectedVoice.onnxUrl}"
    curl -L -o "${selectedVoice.modelName}.json" "${selectedVoice.jsonUrl}"
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
            <div className="bg-zinc-950 p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex gap-1.5 bg-white/5 p-1 rounded-lg border border-white/10 text-xs">
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
                  onClick={() => setActiveCodeTab('run_py')}
                  className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-[11px] ${
                    activeCodeTab === 'run_py' ? 'bg-zinc-800 text-yellow-500 shadow border border-white/5' : 'text-white/40 hover:text-white'
                  }`}
                >
                  <Cpu size={11} />
                  <span>2. run_piper.py</span>
                </button>
                <button
                  onClick={() => setActiveCodeTab('text_txt')}
                  className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-[11px] ${
                    activeCodeTab === 'text_txt' ? 'bg-zinc-800 text-emerald-400 shadow border border-white/5' : 'text-white/40 hover:text-white'
                  }`}
                >
                  <FileText size={11} />
                  <span>3. van_ban_phu_de.txt</span>
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
