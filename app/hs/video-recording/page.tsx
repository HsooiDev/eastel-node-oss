"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Download, Play, Pause } from "lucide-react";

export default function VideoRecordingPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing...");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [engineLoaded, setEngineLoaded] = useState(false);
  const [recSize, setRecSize] = useState(3840);
  const [recLabel, setRecLabel] = useState("4K UHD");

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewRAF = useRef<number | null>(null);

  const qualities = [
    { size: 1080, label: "1080p" },
    { size: 1440, label: "2K" },
    { size: 2160, label: "4K" },
    { size: 3840, label: "4K UHD" }
  ];

  const startPreview = useCallback(() => {
    // @ts-expect-error EastelVideo is injected at runtime by product-video-engine.js
    const vid = window.EastelVideo;
    if (!vid || !previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext("2d")!;
    
    const disp = Math.max(320, Math.min(window.innerWidth - 40, window.innerHeight - 250, 600));
    const buf = Math.round(disp * (window.devicePixelRatio || 1));
    
    canvas.width = buf;
    canvas.height = buf;
    canvas.style.width = `${disp}px`;
    canvas.style.height = `${disp}px`;

    let previewT0 = performance.now();

    if (previewRAF.current) cancelAnimationFrame(previewRAF.current);

    function loop() {
      if (!vid || !canvas) return;
      const t = ((performance.now() - previewT0) / 1000) % vid.TIMING.total;
      ctx.save();
      ctx.scale(buf / vid.W, buf / vid.H);
      vid.renderFrame(ctx, t);
      ctx.restore();
      previewRAF.current = requestAnimationFrame(loop);
    }
    loop();
  }, []);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/components/product-video/product-video-engine.js";
    script.async = true;
    script.onload = () => {
      const checkInterval = setInterval(() => {
        // @ts-expect-error EastelVideo is injected at runtime by product-video-engine.js
        const vid = window.EastelVideo;
        if (vid && vid.simLoaded && vid.logoLoaded) {
          clearInterval(checkInterval);
          setEngineLoaded(true);
          setStatus("Ready — select quality and click Record");
        }
      }, 200);
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
      if (previewRAF.current) cancelAnimationFrame(previewRAF.current);
    };
  }, []);

  useEffect(() => {
    if (engineLoaded) {
      startPreview();
      window.addEventListener("resize", startPreview);
    }
    return () => {
      window.removeEventListener("resize", startPreview);
      if (previewRAF.current) cancelAnimationFrame(previewRAF.current);
    };
  }, [engineLoaded, startPreview]);

  async function startRecording() {
    // @ts-expect-error EastelVideo is injected at runtime by product-video-engine.js
    const vid = window.EastelVideo;
    if (!vid) return;

    setIsRecording(true);
    setStatus("Preparing...");
    setProgress(0);
    setDownloadUrl(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = recSize;
      canvas.height = recSize;
      const ctx = canvas.getContext("2d")!;

      const stream = canvas.captureStream(30);
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
        videoBitsPerSecond: 20000000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const recordedBlob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(recordedBlob);
        setDownloadUrl(url);
        setStatus("Done!");
        setIsRecording(false);
      };

      recorder.start();
      setStatus("Recording...");

      const dur = vid.TIMING.total * 1000;
      const t0 = performance.now();

      function drawNext() {
        const elapsed = performance.now() - t0;
        if (elapsed >= dur) {
          recorder.stop();
          return;
        }
        const t = elapsed / 1000;

        canvas.width = recSize;
        canvas.height = recSize;
        ctx.save();
        ctx.scale(recSize / vid.W, recSize / vid.H);
        vid.renderFrame(ctx, t);
        ctx.restore();

        const pct = (elapsed / dur) * 100;
        setProgress(pct);
        setStatus(`Recording... ${Math.floor(elapsed / 1000)}s / 28s`);

        requestAnimationFrame(drawNext);
      }

      requestAnimationFrame(drawNext);

    } catch (err) {
      console.error("Recording failed:", err);
      setStatus("Recording failed: " + (err as Error).message);
      setIsRecording(false);
    }
  }

  function downloadVideo() {
    if (downloadUrl) {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `eastel-product-${recLabel.replace(/\s/g, "-")}.webm`;
      a.click();
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start p-6 space-y-6">
      <div className="text-center max-w-xl">
        <h1 className="text-2xl font-bold text-primary mb-2">Eastel Video Recorder</h1>
        <p className="text-on-surface-variant text-sm">
          Records the exact same animation as the Video Generator — frame-by-frame canvas rendering, no play bar.
        </p>
      </div>

      <div className="bg-surface-container rounded-xl p-6 w-full max-w-2xl border border-outline-variant">
        <div className="space-y-4">
          <div className="text-lg font-semibold flex items-center gap-2 mb-2 justify-center">
            Clean Video Recorder
          </div>

          <div className="flex gap-2 justify-center flex-wrap">
            {qualities.map((q) => (
              <button
                key={q.size}
                disabled={isRecording || !engineLoaded}
                onClick={() => {
                  setRecSize(q.size);
                  setRecLabel(q.label);
                }}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  recSize === q.size
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-surface border-outline-variant text-on-surface-variant hover:border-primary disabled:opacity-50"
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>

          {engineLoaded && (
            <div className="flex justify-center py-2">
              <canvas
                ref={previewCanvasRef}
                className="rounded-xl shadow-2xl bg-black border border-outline-variant"
              />
            </div>
          )}

          <div className="bg-surface rounded-lg p-4 border border-outline-variant">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-xs text-on-surface-variant">{progress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-surface-container/50 rounded-full h-2.5 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-teal-500 transition-width duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          <div className="text-center text-on-surface-variant/70 text-sm font-mono min-h-[20px]">
            {status}
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={startRecording}
              disabled={isRecording || !engineLoaded}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all disabled:opacity-50 ${
                isRecording
                  ? "bg-surface/50 text-on-surface-variant/50 cursor-not-allowed"
                  : "bg-gradient-to-r from-primary to-teal-500 text-white hover:shadow-lg"
              }`}
            >
              {isRecording ? (
                <>
                  <Pause className="w-4 h-4 animate-pulse" />
                  <span>Recording...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Record 28s Video</span>
                </>
              )}
            </button>

            {downloadUrl && (
              <button
                onClick={downloadVideo}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm bg-gradient-to-r from-amber-400 to-yellow-500 text-white hover:shadow-lg"
              >
                <Download className="w-4 h-4" /> Download {recLabel} WebM
              </button>
            )}
          </div>

          {!isRecording && downloadUrl && (
            <div className="mt-4 text-xs text-on-surface-variant/60 text-center">
              Note: The downloaded WebM file can be converted to MP4 using tools like ffmpeg:
              <br />
              <code className="bg-surface/50 px-1 py-0.5 rounded font-mono">ffmpeg -i input.webm -c:v libx264 -crf 18 output.mp4</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
