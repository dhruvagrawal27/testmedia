import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import crypto from "crypto";
import { Groq } from "groq-sdk";
import { toFile } from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.post("/api/instagram", async (req, res) => {
    try {
      const { url } = req.body;
      const api_url =
        "https://instagram-story-downloader-media-downloader.p.rapidapi.com/unified/url";
      const response = await fetch(
        `${api_url}?url=${encodeURIComponent(url)}`,
        {
          headers: {
            "x-rapidapi-key":
              "0d7481b280mshcd4e4845f499b53p1ddf9djsnb259e8d623b6",
            "x-rapidapi-host":
              "instagram-story-downloader-media-downloader.p.rapidapi.com",
          },
        },
      );
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/youtube", async (req, res) => {
    try {
      const { url } = req.body;
      const timestamp = Date.now().toString();
      const language = "en";
      const key = "6HTugjCXxR";
      const signature = crypto
        .createHash("md5")
        .update(url + language + timestamp + key)
        .digest("hex");

      const response = await fetch("https://api.snapany.com/v1/extract", {
        method: "POST",
        headers: {
          "G-Timestamp": timestamp,
          "G-Footer": signature,
          "Accept-Language": language,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ link: url }),
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/transcribe", async (req, res) => {
    try {
      const { mediaUrl, useGroq, enableHinglish } = req.body;

      if (!process.env.GROQ_API_KEY) {
        return res
          .status(400)
          .json({ error: "GROQ_API_KEY is missing in environment variables." });
      }

      // Download media
      const mediaRes = await fetch(mediaUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com'
        }
      });
      if (!mediaRes.ok) {
        throw new Error(`Failed to download media: ${mediaRes.statusText} (${mediaRes.status})`);
      }

      const buffer = await mediaRes.arrayBuffer();
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

      // Convert buffer to file for Groq Whisper
      const file = await toFile(Buffer.from(buffer), "audio.mp4");

      const transcription = await groq.audio.transcriptions.create({
        file: file,
        model: "whisper-large-v3",
        response_format: "verbose_json",
        temperature: 0.8,
      });

      const rawText = transcription.text;
      let finalTranscript = rawText;

      if (enableHinglish) {
        const systemPrompt = `You are an expert transcription assistant specialized in handling both English and Hinglish content.
Your tasks are:

1. Language Detection: First determine if the content is primarily English, primarily Hindi, or mixed Hinglish.
2. English Content: For pure English content, provide clean English transcription with corrected spelling and grammar while maintaining the original tone and meaning.
3. Hindi/Hinglish Content: For ANY Hindi or mixed Hinglish content, provide accurate transcription in Roman script ONLY - NEVER use Devanagari (Hindi) script.
4. Contextual Correction: When words are unclear, check 2-3 words before and after to infer the correct meaning.
5. Spelling Correction: Fix misspellings while preserving the intended language of each word.
6. Readable Formatting: Use proper punctuation, sentence breaks, and paragraphing.
7. Preserve Intent: Maintain the original speaker's tone, style, and natural flow.

CRITICAL OUTPUT RULES:
- For English content: Output in clean, corrected English only
- For Hindi/Hinglish content: Output in Roman script Hinglish ONLY (e.g., "tu kaisa hai?" not "तू कैसा है?")
- NEVER use Devanagari script - All Hindi words must be written in Roman letters
- Do not convert English to Hindi or Hindi to English - preserve the original language choice of each word/phrase
- Convert Devanagari to Roman: If input contains Devanagari script, convert it to Roman script equivalent

Example:
Input: "आज मैं gym जा रहा हूँ"
Output: "Aaj main gym ja raha hun"
NOT: "आज मैं gym जा रहा हूँ"
`;

        const userPrompt = `Please transcribe the following audio content with appropriate language handling and correct any spelling errors while maintaining natural flow.

Requirements:
1. Language Detection: Identify if content is English, Hinglish, or Hindi
2. English Content: For pure English, provide clean English transcription with corrected spelling/grammar
3. Hindi/Hinglish Content: For ANY Hindi or mixed content, provide transcription in Roman script Hinglish ONLY - NEVER use Devanagari script
4. Contextual Correction: If a word is garbled, infer the right word from nearby context
5. Spelling Correction: Fix misspellings while preserving intended language
6. Sense Check: Replace nonsensical words with logical alternatives
7. Proper Nouns: Correct names, brands, and cultural references
8. Formatting: Add punctuation and paragraph breaks for readability

Input:
${rawText}

Output:
Provide the transcription maintaining the original language choice - English content in English, Hindi/Hinglish content in Roman script Hinglish ONLY like देख would be written as Dekh.

Return ONLY the cleaned transcription text without any additional commentary or formatting markers.`;

        const llmModels = [
          process.env.GROQ_PRIMARY_LLM || "meta-llama/llama-4-scout-17b-16e-instruct",
          process.env.GROQ_FALLBACK_LLM_1 || "llama-3.3-70b-versatile",
          process.env.GROQ_FALLBACK_LLM_2 || "llama-3.1-8b-instant",
        ];

        let success = false;
        for (const modelName of llmModels) {
          try {
            console.log(`[DEBUG] Attempting LLM post-processing with model: ${modelName}`);
            const completion = await groq.chat.completions.create({
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              model: modelName,
              temperature: 0.8,
              max_tokens: 4000,
            });

            finalTranscript = completion.choices[0]?.message?.content?.trim() || rawText;
            console.log(`[DEBUG] LLM post-processing successful with ${modelName}`);
            success = true;
            break; // Exit loop on success
          } catch (e: any) {
            console.error(`[ERROR] LLM post-processing with ${modelName} failed: ${e.message}`);
          }
        }

        if (!success) {
          console.warn(`[WARNING] All LLM models failed, returning raw transcription`);
        }
      }

      res.json({ raw: rawText, final: finalTranscript });
    } catch (error: any) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/prompts", async (req, res) => {
    try {
      const { script, promptType, cameos } = req.body;

      if (!process.env.GROQ_API_KEY) {
        return res
          .status(400)
          .json({ error: "GROQ_API_KEY is missing in environment variables." });
      }

      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const cameoStr =
        cameos && cameos.length > 0 ? cameos.join(", ") : "No Cameo Provided";

      const systemPrompt = `You are an expert AI video prompt engineer specializing in creating cinematic, viral-style video prompts for advanced AI video generation platforms like ${promptType}. Your expertise includes:

Core Capabilities:
- Script Analysis & Chunking: Break down video scripts into optimal 6-8 second segments that maintain narrative flow and emotional impact
- Cinematic Storytelling: Create high-drama, pattern-interrupt hooks and cinematically compelling scenes
- Technical Precision: Generate detailed JSON prompts with exact specifications for camera movements, lighting, audio design, character actions, visual effects

Prompt Structure Requirements:
Each prompt must include:
- Meta: Title, description, aspect ratio (default 9:16), and tone
- Hook: 2-3 second pattern interrupt (for first segment only)
- Scene: Location, environment (lighting + sound), camera specs, characters with exact dialogue
- FX: Visual effects and cinematic enhancements
- Audio: Dialogue mix and background elements
- End State: Final frame action or transition

Style Principles:
- High Drama: Think creatively about the content's context
- Pattern Interrupts: Start with unexpected visual/audio elements
- Realism: Prioritize handheld, documentary-style authenticity
- Viral Optimization: Create thumb-stopping moments in first 2 seconds

Key Rules:
- Never modify dialogue - use exact words provided
- If user mentions @username, include them as specified character
- If no cameo specified, create prompts without named individuals
- Maintain dialogue continuity across chunked segments
- Each segment must be self-contained but flow into next
- Default to vertical (9:16) format unless specified otherwise`;

      const userPrompt = `Script: ${script}
Cameo: ${cameoStr}

When user provides a script, follow this process:

Step 1: Analyze & Chunk Script
Break the provided script into segments of 6-8 seconds each:
- Identify natural dialogue breaks
- Preserve complete thoughts/sentences
- Note emotional beats and intensity changes
- Consider visual transition points

Step 2: Create Detailed JSON Prompts
For each segment, generate a complete JSON prompt following this structure:

{
  "meta": {
    "title": "[Compelling title - Part X]",
    "description": "[Brief scene description with key visual elements]",
    "aspect_ratio": "9:16",
    "tone": "[mood_category]"
  },
  "scene": {
    "hook": {
      "shot": "[First 2s only for opening segment - pattern interrupt description]"
    },
    "location": "[Specific setting with atmospheric details]",
    "environment": {
      "lighting": "[Detailed lighting setup]",
      "sound": ["ambient_1", "ambient_2", "ambient_3"]
    },
    "camera": {
      "type": "[camera_type]",
      "style": "[movement, framing, focus techniques]",
      "quality": "[visual_aesthetic]"
    },
    "characters": [
      {
        "role": "[Character name or @username if provided]",
        "appearance": "[Detailed physical description]",
        "action": "[Specific movements and gestures]",
        "dialogue": "[EXACT dialogue from script - no changes]",
        "motion": "[Micro-gestures and timing]"
      }
    ],
    "fx": {
      "[effect_name]": true,
      "[effect_name_2]": true
    },
    "audio": {
      "mix": "[audio_mixing_style]",
      "bg": ["sound_1", "sound_2"]
    },
    "end_state": {
      "action": "[Final frame description or transition cue]"
    }
  }
}

Step 3: Provide Context
After all JSON prompts, include:
- Brief explanation of chunking decisions
- Suggested shooting order if different from narrative order
- Tips for maintaining continuity between segments
- Optional: suggestions for editing transitions

Generate the complete JSON response with all segments. Ensure the root object contains a "segments" array.`;

      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      res.json(JSON.parse(responseText));
    } catch (error: any) {
      console.error("Prompts error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
