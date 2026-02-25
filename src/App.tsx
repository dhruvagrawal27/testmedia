import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Download,
  Youtube,
  Instagram,
  Settings,
  FileText,
  Video,
  Mic,
  Sparkles,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

type DownloaderType = "instagram" | "youtube";

export default function App() {
  const [downloader, setDownloader] = useState<DownloaderType>("instagram");
  const [url, setUrl] = useState("");
  const [enableHinglish, setEnableHinglish] = useState(true);
  const [generatePrompts, setGeneratePrompts] = useState(false);
  const [promptType, setPromptType] = useState<"Sora 2" | "Veo 3">("Sora 2");
  const [cameos, setCameos] = useState<string[]>(["", "", ""]);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleCameoChange = (index: number, value: string) => {
    const newCameos = [...cameos];
    newCameos[index] = value;
    setCameos(newCameos);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleProcess = async () => {
    if (!url.trim()) {
      setError("Please enter a valid URL");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      // 1. Get Media URL
      setStatus(
        `Fetching ${downloader === "instagram" ? "Instagram" : "YouTube"} content...`,
      );
      const infoRes = await fetch(`/api/${downloader}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!infoRes.ok) throw new Error("Failed to fetch media info");
      const infoData = await infoRes.json();

      let mediaUrl = "";
      if (downloader === "instagram") {
        if (!infoData.success)
          throw new Error("Could not fetch Instagram content");
        mediaUrl = infoData.data?.content?.media_url;
      } else {
        const medias = infoData.medias || [];
        const audioMedia = medias.find(
          (m: any) => m.media_type === "audio" && m.resource_url,
        );
        const videoMedia = medias.find(
          (m: any) => m.media_type === "video" && m.resource_url,
        );
        mediaUrl = audioMedia?.resource_url || videoMedia?.resource_url;
      }

      if (!mediaUrl) throw new Error("No media URL found");

      // 2. Transcribe
      setStatus("Downloading media and transcribing with Groq Whisper...");
      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaUrl, useGroq: true, enableHinglish }),
      });

      if (!transcribeRes.ok) {
        const errData = await transcribeRes.json();
        throw new Error(errData.error || "Transcription failed");
      }

      const transcribeData = await transcribeRes.json();
      const finalTranscript = transcribeData.final;

      let promptsData = null;
      if (generatePrompts && finalTranscript) {
        setStatus(`Generating ${promptType} prompts with Groq LLM...`);
        const validCameos = cameos.filter((c) => c.trim() !== "");
        const promptsRes = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script: finalTranscript,
            promptType,
            cameos: validCameos,
          }),
        });

        if (promptsRes.ok) {
          promptsData = await promptsRes.json();
        }
      }

      setResult({
        mediaUrl,
        rawTranscript: transcribeData.raw,
        finalTranscript,
        prompts: promptsData,
      });
      setStatus("Complete!");
    } catch (err: any) {
      setError(err.message || "An error occurred during processing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">
              Media Previewer
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDownloader("instagram")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                downloader === "instagram"
                  ? "bg-gradient-to-r from-pink-600 to-orange-500 text-white shadow-lg shadow-pink-500/20"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Instagram className="w-4 h-4 inline-block mr-2" />
              Instagram
            </button>
            <button
              onClick={() => setDownloader("youtube")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                downloader === "youtube"
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/20"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Youtube className="w-4 h-4 inline-block mr-2" />
              YouTube
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Options */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-400" />
              Processing Options
            </h2>

            <div className="space-y-6">
              {/* Transcription Settings */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                  Transcription
                </h3>
                <label className="flex items-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-transparent hover:border-white/10">
                  <div className="mt-0.5">
                    <input
                      type="checkbox"
                      checked={enableHinglish}
                      onChange={(e) => setEnableHinglish(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500/50 bg-black"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Hinglish Processing</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Convert Hindi/Hinglish to Roman script using Groq LLM
                    </p>
                  </div>
                </label>
              </div>

              {/* AI Prompts Settings */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                  AI Video Prompts
                </h3>
                <label className="flex items-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-transparent hover:border-white/10">
                  <div className="mt-0.5">
                    <input
                      type="checkbox"
                      checked={generatePrompts}
                      onChange={(e) => setGeneratePrompts(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500/50 bg-black"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Generate Prompts</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Create cinematic prompts for AI video generation
                    </p>
                  </div>
                </label>

                <AnimatePresence>
                  {generatePrompts && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-4 space-y-4 overflow-hidden"
                    >
                      <div className="flex gap-2 p-1 bg-black/50 rounded-lg">
                        {["Sora 2", "Veo 3"].map((type) => (
                          <button
                            key={type}
                            onClick={() => setPromptType(type as any)}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                              promptType === type
                                ? "bg-white/10 text-white"
                                : "text-gray-500 hover:text-gray-300"
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs text-gray-400">
                          Cameo Usernames (Optional)
                        </p>
                        {cameos.map((cameo, i) => (
                          <input
                            key={i}
                            type="text"
                            placeholder={`@username${i + 1}`}
                            value={cameo}
                            onChange={(e) =>
                              handleCameoChange(i, e.target.value)
                            }
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-8 space-y-6">
          {/* Input Area */}
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 shadow-xl">
            <h2 className="text-2xl font-semibold mb-2">
              {downloader === "instagram"
                ? "Instagram to Hinglish"
                : "YouTube to Hinglish"}
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Enter a URL to download, transcribe, and generate AI prompts.
            </p>

            <div className="flex gap-3">
              <input
                type="text"
                placeholder={`Paste ${downloader === "instagram" ? "Instagram" : "YouTube"} URL here...`}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500/50 transition-colors"
                onKeyDown={(e) => e.key === "Enter" && handleProcess()}
              />
              <button
                onClick={handleProcess}
                disabled={loading || !url.trim()}
                className="bg-white text-black px-6 py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                Process
              </button>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </motion.div>
            )}

            {loading && status && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 flex items-center gap-3 text-indigo-400"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <p className="text-sm">{status}</p>
              </motion.div>
            )}
          </div>

          {/* Results Area */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Media Preview */}
                <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 shadow-xl">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <Video className="w-5 h-5 text-gray-400" />
                    Media Preview
                  </h3>
                  <div className="aspect-video bg-black rounded-xl overflow-hidden border border-white/5">
                    <video
                      src={result.mediaUrl}
                      controls
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                {/* Transcripts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 shadow-xl flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium flex items-center gap-2">
                        <Mic className="w-5 h-5 text-gray-400" />
                        Raw Transcript
                      </h3>
                      <button
                        onClick={() => copyToClipboard(result.rawTranscript)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {copied ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <div className="flex-1 bg-black/50 border border-white/5 rounded-xl p-4 overflow-y-auto max-h-64 text-sm text-gray-300 whitespace-pre-wrap font-mono">
                      {result.rawTranscript}
                    </div>
                  </div>

                  <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 shadow-xl flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
                    <div className="flex items-center justify-between mb-4 relative z-10">
                      <h3 className="text-lg font-medium flex items-center gap-2 text-indigo-400">
                        <Sparkles className="w-5 h-5" />
                        Hinglish Transcript
                      </h3>
                      <button
                        onClick={() => copyToClipboard(result.finalTranscript)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {copied ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <div className="flex-1 bg-black/50 border border-indigo-500/20 rounded-xl p-4 overflow-y-auto max-h-64 text-sm text-gray-100 whitespace-pre-wrap font-mono relative z-10">
                      {result.finalTranscript}
                    </div>
                  </div>
                </div>

                {/* AI Prompts */}
                {result.prompts && (
                  <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-medium flex items-center gap-2">
                        <FileText className="w-5 h-5 text-gray-400" />
                        {promptType} Prompts
                      </h3>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            JSON.stringify(result.prompts, null, 2),
                          )
                        }
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {copied ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <div className="space-y-4">
                      {result.prompts.segments?.map(
                        (segment: any, idx: number) => (
                          <div
                            key={idx}
                            className="bg-black/50 border border-white/5 rounded-xl p-5"
                          >
                            <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-3">
                              <h4 className="font-medium text-indigo-400">
                                Part {idx + 1}:{" "}
                                {segment.meta?.title || "Segment"}
                              </h4>
                              <span className="text-xs text-gray-500 font-mono">
                                {segment.meta?.aspect_ratio}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-gray-500 mb-1 text-xs uppercase tracking-wider">
                                  Scene
                                </p>
                                <p className="text-gray-300">
                                  {segment.scene?.location}
                                </p>
                                <p className="text-gray-400 text-xs mt-1">
                                  {segment.scene?.environment?.lighting}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-1 text-xs uppercase tracking-wider">
                                  Camera
                                </p>
                                <p className="text-gray-300">
                                  {segment.scene?.camera?.style}
                                </p>
                              </div>
                              <div className="md:col-span-2">
                                <p className="text-gray-500 mb-1 text-xs uppercase tracking-wider">
                                  Characters & Dialogue
                                </p>
                                {segment.scene?.characters?.map(
                                  (char: any, cIdx: number) => (
                                    <div
                                      key={cIdx}
                                      className="bg-white/5 p-3 rounded-lg mt-2 border border-white/5"
                                    >
                                      <p className="font-medium text-gray-200 mb-1">
                                        {char.role}
                                      </p>
                                      <p className="text-gray-400 text-xs mb-2">
                                        {char.action}
                                      </p>
                                      {char.dialogue && (
                                        <p className="text-indigo-300 font-medium italic">
                                          "{char.dialogue}"
                                        </p>
                                      )}
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                        ),
                      )}

                      {!result.prompts.segments && (
                        <div className="bg-black/50 border border-white/5 rounded-xl p-4 overflow-x-auto text-sm text-gray-300 font-mono whitespace-pre-wrap">
                          {JSON.stringify(result.prompts, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
