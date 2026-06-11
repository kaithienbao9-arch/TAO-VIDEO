/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { tts } from 'edge-tts';
import getMP3Duration from 'get-mp3-duration';

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON with a generous body limit
  app.use(express.json({ limit: '20mb' }));

  // Shared server-side Gemini client
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey 
    ? new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      })
    : null;

  // Standard API health endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', hasApiKey: !!apiKey });
  });

  // Edge-TTS Generation API Route (Online, zero-python dependency!)
  app.post('/api/tts/generate', async (req, res) => {
    try {
      const { lines, voice, speed, silenceGap } = req.body;

      if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ error: 'Danh sách dòng văn bản không hợp lệ hoặc đang trống.' });
      }

      const activeVoice = voice || 'vi-VN-HoaiMyNeural';
      const parsedSpeed = typeof speed === 'number' ? speed : 1.0;
      const parsedSilenceGap = typeof silenceGap === 'number' ? silenceGap : 0.3;

      // Convert speed to percentage rate (e.g. 1.2 -> "+20%", 0.8 -> "-20%")
      const percent = Math.round((parsedSpeed - 1.0) * 100);
      const rateString = percent >= 0 ? `+${percent}%` : `${percent}%`;

      console.log(`[Edge-TTS API] Bắt đầu kết xuất ${lines.length} câu. Giọng: ${activeVoice}, Tốc độ: ${rateString}, Khoảng lặng: ${parsedSilenceGap}s`);

      const audioBuffers: Buffer[] = [];
      const srtBlocks: any[] = [];
      let currentTime = 0.0;

      for (let i = 0; i < lines.length; i++) {
        const sentence = lines[i].trim();
        if (!sentence) continue;

        // 1. Generate audio segment for the sentence
        const speechBuffer = await tts(sentence, {
          voice: activeVoice,
          rate: rateString,
        });

        // 2. Measure audio duration in ms and seconds
        const durationMs = getMP3Duration(speechBuffer);
        const durationSec = durationMs / 1000;

        const startT = currentTime;
        const endT = startT + durationSec;

        srtBlocks.push({
          index: i + 1,
          start: startT,
          end: endT,
          text: sentence
        });

        audioBuffers.push(speechBuffer);

        // 3. Add silence gap if not the last item and gap > 0
        if (i < lines.length - 1 && parsedSilenceGap > 0) {
          const numFrames = Math.max(1, Math.round(parsedSilenceGap / 0.024));
          const actualSilenceDuration = numFrames * 0.024;
          
          const silentFrameBase64 = "//NExAAAAH0AAB76AAAAb0EAAAD5AAAAAG6A/4BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWw==";
          const silentFrameBuffer = Buffer.from(silentFrameBase64, 'base64');
          silentFrameBuffer[0] = 0xFF;
          silentFrameBuffer[1] = 0xF3;
          silentFrameBuffer[2] = 0x64; // 48kbps, 24000Hz, padding 0
          silentFrameBuffer[3] = 0xC4; // Mono, original
          
          const silenceBuffersList = [];
          for (let f = 0; f < numFrames; f++) {
            silenceBuffersList.push(Buffer.from(silentFrameBuffer));
          }
          const silenceBuffer = Buffer.concat(silenceBuffersList);
          
          audioBuffers.push(silenceBuffer);
          currentTime = endT + actualSilenceDuration;
        } else {
          currentTime = endT;
        }
      }

      if (audioBuffers.length === 0) {
        return res.status(400).json({ error: 'Không thể tạo được tệp âm thanh nào từ văn bản đã nhập.' });
      }

      // Concatenate all audio segments into a single MP3 buffer (MP3 buffers can be joined simply)
      const finalMp3Buffer = Buffer.concat(audioBuffers);

      // Construct SRT subtitle content
      const formatSrtTime = (sec: number) => {
        const hrs = Math.floor(sec / 3600);
        const mins = Math.floor((sec % 3600) / 60);
        const secs = Math.floor(sec % 60);
        const ms = Math.floor((sec % 1) * 1000);
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };

      let srtContent = '';
      for (const block of srtBlocks) {
        srtContent += `${block.index}\n`;
        srtContent += `${formatSrtTime(block.start)} --> ${formatSrtTime(block.end)}\n`;
        srtContent += `${block.text}\n\n`;
      }

      const audioBase64 = finalMp3Buffer.toString('base64');

      res.json({
        success: true,
        audioUrl: `data:audio/mp3;base64,${audioBase64}`,
        srtContent: srtContent,
        message: 'Kết xuất giọng nói & phụ đề online hoàn tất!'
      });

    } catch (error: any) {
      console.error('[Edge-TTS API Error]:', error);
      res.status(500).json({ error: error.message || 'Lỗi hệ thống khi tạo giọng đọc trực tuyến.' });
    }
  });

  // AI Subtitle word/association analyzer endpoint with Gemini Mime-response
  app.post('/api/gemini/suggest-keywords', async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ 
          error: 'GEMINI_API_KEY is not set. Please configure it in your Secrets panel.' 
        });
      }

      const { subtitles, characters } = req.body;

      if (!subtitles || !Array.isArray(subtitles)) {
        return res.status(400).json({ error: 'Missing or invalid "subtitles" array.' });
      }

      if (!characters || !Array.isArray(characters)) {
        return res.status(400).json({ error: 'Missing or invalid "characters" list.' });
      }

      // If no characters exist yet, suggest standard key attributes or nothing
      const charDescription = characters.map(c => 
        `- Character: "${c.name}", valid keywords: [${(c.keywords || []).map((k: string) => `"${k}"`).join(', ')}]`
      ).join('\n');

      const systemInstruction = `You are an expert creative assistant for subtitle-to-image matching in video production.
Your task is to analyze subtitle lines (subtexts) and identify the most appropriate characters (and which keywords to select) from a list of valid characters.

Even if the subtext doesn't directly contain the exact keyword word, read between the lines, analyze the dialogue, the sentiments, pronouns, and typical references (e.g., if a stepdaughter or wife is mentioned, cross-reference valid character relationships if possible).
Return EXACTLY matching keyword strings from the available keywords list for each character.
Output up to 3 distinct valid keywords per subtitle block based on character importance or references in the sentence. Match values must be in lower case.`;

      const prompt = `Available Characters and Keywords:
${charDescription}

Subtitles to Analyze:
${JSON.stringify(subtitles.map(s => ({ id: s.id, text: s.text })))}

Predict the best-matched keywords for each subtitle block. Use ONLY keywords that exist in the available characters valid keywords list above! If absolutely no character fits, return an empty array for suggestedKeywords.`;

      // Call the Google GenAI SDK with structured rules
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER, description: 'The original subtitle block ID' },
                    suggestedKeywords: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'List of matching valid lowercase keyword strings that belong to the appropriate characters. Max 3 keywords.'
                    },
                    explanation: { type: Type.STRING, description: 'Brief Vietnamese explanation of why this character keyword is suggested (e.g. \"Ridge được nhắc đến qua vai trò bố dượng, Hope là con riêng\").' }
                  },
                  required: ['id', 'suggestedKeywords']
                }
              }
            },
            required: ['suggestions']
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        return res.status(500).json({ error: 'No response text received from Gemini.' });
      }

      const parsedJSON = JSON.parse(responseText.trim());
      res.json(parsedJSON);

    } catch (error: any) {
      console.error('Error suggesting keywords with Gemini:', error);
      let clientMsg = error.message || 'Failed to analyze subtitles with AI.';
      if (typeof clientMsg === 'string' && (clientMsg.includes('leaked') || clientMsg.includes('API key') || clientMsg.includes('403') || clientMsg.includes('PERMISSION_DENIED'))) {
        clientMsg = 'Khóa API Gemini (GEMINI_API_KEY) hiện tại của bạn đã bị lỗi bảo mật (bị khóa bởi Google do phát hiện rò rỉ - Leaked Key). Vui lòng vào Google AI Studio, lấy một API Key mới HOÀN TOÀN MIỄN PHÍ, tiếp đó cập nhật vào phần Settings / Secrets của ứng dụng.';
      }
      res.status(500).json({ error: clientMsg });
    }
  });

  // Serve static assets correctly using Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production assets
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[V-Sync Server] Application server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[V-Sync Server] Failed to bootstrap application server:', err);
});
