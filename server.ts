/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

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
