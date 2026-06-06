const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// --- DỰNG CẤU HÌNH CHO GIỌNG ANH (ENGLISH PIPER VOICES) ---
const INPUT_FILE = "van_ban_phu_de.txt";
const OUTPUT_AUDIO = "giong_doc.wav";
const OUTPUT_SRT = "phu_de.srt";
const PIPER_MODEL = "en_US-amy-medium.onnx";
const PIPER_EXE = path.join(".", "piper.exe");
const SILENCE_GAP = 0.3; // Khoảng lặng nghỉ giữa mỗi câu (giây)
const LENGTH_SCALE = 1.0; // Tốc độ nói (nhỏ hơn là nói nhanh hơn)

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
  
  return `${pad(hrs, 2)}:${pad(mins, 2)}:${pad(secs, 2)},${padMs(ms)}`;
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
    console.error(`[LỖI] Không tìm thấy giọng đọc dữ liệu: ${PIPER_MODEL}`);
    return;
  }

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`[LỖI] Không tìm thấy file văn bản đầu vào: ${INPUT_FILE}`);
    return;
  }

  const lines = fs.readFileSync(INPUT_FILE, "utf-8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    console.error("[LỖI] Tệp văn bản đầu vào đang trống!");
    return;
  }

  console.log(`[*] Phát hiện cấu trúc ${lines.length} câu thuyết minh...\n`);

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
      console.log(` -> [${idx}/${lines.length}] Đang nói: "${previewText}"`);

      const partWav = path.join(tempDir, `part_${String(idx).padStart(4, '0')}.wav`);

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
        console.error(` [LỖI GIỌNG] Không thể kết xuất câu số ${idx}.`);
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
    console.log(`[*] Đã xuất bản file âm thanh: ${OUTPUT_AUDIO}`);

    // Ghi file phụ đề SRT
    let srtContent = "";
    for (const block of srtBlocks) {
      srtContent += `${block.idx}\n`;
      srtContent += `${formatSrtTime(block.startTime)} --> ${formatSrtTime(block.endTime)}\n`;
      srtContent += `${block.text}\n\n`;
    }
    fs.writeFileSync(OUTPUT_SRT, srtContent, "utf-8");
    console.log(`[*] Đã xuất bản phụ đề đồng bộ mốc giây: ${OUTPUT_SRT}`);

    console.log("\n[XỬ LÝ THÀNH CÔNG RỰC RỠ]");
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
