import os
import wave
import subprocess
import json
import re

# --- CẤU HÌNH ĐÃ ĐỒNG BỘ CHO GIỌNG ANH (ENGLISH PIPER VOICES) ---
INPUT_FILE = "van_ban_phu_de.txt"
OUTPUT_AUDIO = "giong_doc.wav"
OUTPUT_SRT = "phu_de.srt"
PIPER_MODEL = "en_US-amy-medium.onnx"
PIPER_EXE = os.path.join(".", "piper.exe")  # Đồ nghề chạy nội bộ trong thư mục
SILENCE_GAP = 0.3  # Khoảng lặng nghỉ giữa mỗi câu
LENGTH_SCALE = 1.0  # Hệ số tốc độ nói (nhỏ hơn là nhanh hơn)

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
        w.writeframes(b'\x00' * (num_frames * channels * sampwidth))

def main():
    print("==================================================")
    print("      TIẾN TRÌNH CHUYỂN ĐỔI PIPER TTS OFFLINE     ")
    print("==================================================")
    
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
    
    temp_dir = "temp_audiolink"
    os.makedirs(temp_dir, exist_ok=True)
    
    temp_files = []
    srt_blocks = []
    current_time = 0.0
    
    silence_file = os.path.join(temp_dir, "silence.wav")
    if SILENCE_GAP > 0:
        create_silence_wav(silence_file, SILENCE_GAP)
        
    try:
        for idx, sentence in enumerate(lines, start=1):
            preview_text = sentence[:30] + ("..." if len(sentence) > 30 else "")
            print(f" -> [{idx}/{len(lines)}] Đang đọc: \"{preview_text}\"")
            
            part_wav = os.path.join(temp_dir, f"part_{idx:04d}.wav")
            
            command = [
                piper_path,
                "--model", PIPER_MODEL,
                "--length_scale", str(LENGTH_SCALE),
                "--output_file", part_wav
            ]
            
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
                
            with wave.open(part_wav, "r") as w:
                frames = w.getnframes()
                rate = w.getframerate()
                duration = frames / float(rate)
                
            start_t = current_time
            end_t = start_t + duration
            srt_blocks.append((idx, start_t, end_t, sentence))
            
            temp_files.append(part_wav)
            
            if idx < len(lines) and SILENCE_GAP > 0:
                temp_files.append(silence_file)
                current_time = end_t + SILENCE_GAP
            else:
                current_time = end_t

        if not temp_files:
            print("[LỖI] Không có file âm thanh phân khúc nào được tạo thành công.")
            return

        print(f"[*] Tiến hành hợp nhất các đoạn âm thanh thành file cuối: {OUTPUT_AUDIO}...")
        with wave.open(OUTPUT_AUDIO, "wb") as outfile:
            with wave.open(temp_files[0], "rb") as infile:
                outfile.setparams(infile.getparams())
            for wav_p in temp_files:
                with wave.open(wav_p, "rb") as infile:
                    outfile.writeframes(infile.readframes(infile.getnframes()))

        print(f"[*] Xuất file phụ đề khớp mốc giây: {OUTPUT_SRT}...")
        
        def format_srt_time(seconds):
            hrs = int(seconds // 3600)
            mints = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            millis = int((seconds % 1) * 1000)
            return f"{hrs:02d}:{mints:02d}:{secs:02d},{millis:03d}"

        with open(OUTPUT_SRT, "w", encoding="utf-8") as f:
            for item_idx, s_time, e_time, text_val in srt_blocks:
                f.write(f"{item_idx}\n")
                f.write(f"{format_srt_time(s_time)} --> {format_srt_time(e_time)}\n")
                f.write(f"{text_val}\n\n")

        print("\n[XỬ LÝ THÀNH CÔNG RỰC RỠ]")
        print(f" >> File âm thanh audio lời thoại: {OUTPUT_AUDIO}")
        print(f" >> File phụ đề đồng bộ chuẩn chỉnh: {OUTPUT_SRT}")
        print("Mẹo: Đưa 2 file này vào V-Sync Engine trên website là bạn sẽ có Video dựng sẵn!")

    finally:
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
