import os
import sys
import asyncio
import re

# --- CẤU HÌNH ĐỒNG BỘ EDGE-TTS V-SYNC ENGINE ---
INPUT_FILE = "van_ban_phu_de.txt"
OUTPUT_AUDIO = "giong_doc.mp3"
OUTPUT_SRT = "phu_de.srt"
VOICE_ID = "vi-VN-HoaiMyNeural"  # Giọng nữ Miền Nam truyền cảm chất lượng hàng đầu
SPEED_RATE = "+0%"
SILENCE_GAP = 0.3  # Khoảng lặng nghỉ giữa mỗi câu (giây)

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

# --- TỰ ĐỘNG THIẾT LẬP THƯ VIỆN EDGE-TTS ---
try:
    import edge_tts
except ImportError:
    print("[*] Thu vien 'edge-tts' chua duoc cai dat tren may tinh.")
    print("[*] Dang tu dong ket noi Internet va tai thu vien tuy chon...")
    import subprocess
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "edge-tts"])
        import edge_tts
        print("[+] Cai dat thanh cong edge-tts! Bat dau tien trinh thuyet minh...\n")
    except Exception as e:
        print(f"[!] Loi tu dong cai dat thu vien: {e}")
        print("[!] Vui long mo CMD tren may tinh cua ban va go: pip install edge-tts")
        sys.exit(1)

def format_srt_time(seconds):
    hrs = int(seconds // 3605)
    hrs = int(seconds // 3600)
    mints = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hrs:02d}:{mints:02d}:{secs:02d},{millis:03d}"

async def generate_speech_chunk(sentence, voice, rate, chunk_idx, temp_dir):
    part_mp3 = os.path.join(temp_dir, f"part_{chunk_idx:04d}.mp3")
    
    # Kết nối stream trực tiếp tới dịch vụ Speech của Microsoft
    communicate = edge_tts.Communicate(sentence, voice, rate=rate)
    audio_data = bytearray()
    last_ticks = 0
    
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            offset = chunk["offset"]
            duration = chunk["duration"]
            last_ticks = max(last_ticks, offset + duration)
            
    if not audio_data:
        return None, 0.0

    with open(part_mp3, "wb") as f:
        f.write(audio_data)
        
    duration = last_ticks / 10000000.0 if last_ticks > 0 else len(audio_data) / 6000.0
    return part_mp3, duration

async def generate_silence_chunk(duration, voice, chunk_idx, temp_dir):
    part_silence = os.path.join(temp_dir, f"silence_{chunk_idx:04d}.mp3")
    ms = int(duration * 1000)
    
    # Sử dụng tính năng SSML và ngắt âm tinh gọn
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
    print("     TIEN TRINH MICROSOFT EDGE-TTS SIEU TU NHIEN  ")
    print("==================================================")
    
    if not os.path.exists(INPUT_FILE):
        print(f"[LOI] Khong tim thay file van ban kich ban: {INPUT_FILE}")
        print("Vui long chon Tab 'Giong doc Edge-TTS' va bam tai van_ban_phu_de.txt ve dat cung o thu muc.")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]
        
    if not lines:
        print("[LOI] Kich ban van_ban_phu_de.txt dang trong rong!")
        return
        
    print(f"[*] He thong phat hien: {len(lines)} dong van ban can thuyet minh.")
    print(f"[*] Giong doc AI: {VOICE_ID} | Toc do rate: {SPEED_RATE}")
    
    temp_dir = "temp_edge_tts"
    os.makedirs(temp_dir, exist_ok=True)
    
    temp_audio_files = []
    srt_blocks = []
    current_time = 0.0
    
    try:
        for idx, sentence in enumerate(lines, start=1):
            preview = sentence[:35] + ("..." if len(sentence) > 35 else "")
            print(f" -> [{idx}/{len(lines)}] Dang chay Thuyet minh AI: \"{preview}\"")
            
            # 1. Chuyển ngữ giọng đọc
            try:
                part_path, duration = await generate_speech_chunk(sentence, VOICE_ID, SPEED_RATE, idx, temp_dir)
            except Exception as e:
                # Nếu không nhận được audio, khả năng cao là do thư viện edge-tts đã cũ bị Microsoft từ chối kết nối
                if "NoAudioReceived" in str(type(e)) or "NoAudioReceived" in str(e):
                    print("\n[!] Canh bao: Khong lay duoc giong doc tu Microsoft (Loi NoAudioReceived).")
                    print("[*] Co the thu vien 'edge-tts' tren may tinh cua ban da cu (Outdated).")
                    print("[*] Dang tu dong nang cap 'edge-tts' len phien ban moi nhat tu Internet...")
                    import subprocess
                    try:
                        subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "edge-tts"])
                        print("[+] Da tu dong nang cap thu vien thanh cong! Dang khoi dong lai lua chon...")
                        import importlib
                        importlib.reload(edge_tts)
                        # Thu lai mot lan nua
                        part_path, duration = await generate_speech_chunk(sentence, VOICE_ID, SPEED_RATE, idx, temp_dir)
                    except Exception as re_err:
                        print(f"[!] Cai dat tu dong that bai hoac van gap loi: {re_err}")
                        print("[QUAN TRONG] Vui long mo Command Prompt (CMD) tren Windows va chay lenh:")
                        print("  pip install --upgrade edge-tts")
                        print("Sau do chay lai file chay_tts.bat de sua loi hoan toan.")
                        raise e
                else:
                    raise e

            if not part_path:
                print(f" [!] Gap su co khi ket xuat cau so {idx}, bỏ qua.")
                continue
                
            start_t = current_time
            end_t = start_t + duration
            srt_blocks.append((idx, start_t, end_t, sentence))
            temp_audio_files.append(part_path)
            
            # 2. Tạo khoảng lặng nghỉ (trừ câu cuối)
            if idx < len(lines) and SILENCE_GAP > 0:
                silence_path = await generate_silence_chunk(SILENCE_GAP, VOICE_ID, idx, temp_dir)
                if silence_path:
                    temp_audio_files.append(silence_path)
                current_time = end_t + SILENCE_GAP
            else:
                current_time = end_t
                
        if not temp_audio_files:
            print("[LOI] Khong co bat ky phan doan nao ghep noi thanh cong.")
            return
            
        print(f"\n[*] Dang tien hanh ghep cac dong thanh file duy nhat: {OUTPUT_AUDIO}...")
        with open(OUTPUT_AUDIO, "wb") as outfile:
            for audio_p in temp_audio_files:
                if os.path.exists(audio_p):
                    with open(audio_p, "rb") as infile:
                        outfile.write(infile.read())
                        
        print(f"[*] Dang tai va ghi file phu de dong bo thoi gian: {OUTPUT_SRT}...")
        with open(OUTPUT_SRT, "w", encoding="utf-8") as f:
            for num, s_t, e_t, text_v in srt_blocks:
                f.write(f"{num}\n")
                f.write(f"{format_srt_time(s_t)} --> {format_srt_time(e_t)}\n")
                f.write(f"{text_v}\n\n")
                
        print("\n[TIEN TRINH DA HOAN THANH XUAT SAC]")
        print(f" >> Tệp audio thuyet minh giong doc: {OUTPUT_AUDIO}")
        print(f" >> Tep phu de SRT dong bo hoan hao: {OUTPUT_SRT}")
        print("Huong dan: Keo tha ca 2 tep tren vao V-Sync Engine de tu dong dung Video!")
        
    finally:
        # Don dep tep tam bieu dien
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
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(async_main())
