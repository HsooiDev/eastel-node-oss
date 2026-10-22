"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Download, Maximize2, Play, Pause } from "lucide-react";

const PLANS = [
  { id: "EZ15", data: "30 GB", price: "RM 15", badge: null, badgeColor: "" },
  { id: "EZ35", data: "200 GB", price: "RM 35", badge: "Best Value", badgeColor: "bg-violet-500/15 text-violet-400" },
  { id: "EZ50", data: "500 GB", price: "RM 50", badge: "+ Roaming", badgeColor: "bg-fuchsia-500/15 text-fuchsia-400" },
  { id: "EZ68", data: "700 GB", price: "RM 68", badge: "Heavy Data", badgeColor: "bg-fuchsia-500/15 text-fuchsia-400" },
  { id: "EZ98", data: "999 GB", price: "RM 98", badge: "Top Tier", badgeColor: "bg-amber-500/15 text-amber-400" },
];

const SIZES = [
  { label: "540px", value: 540 },
  { label: "720px", value: 720 },
  { label: "1080px", value: 1080 },
  { label: "2K", value: 1440 },
  { label: "4K", value: 2160 },
  { label: "4K UHD", value: 3840 },
];

export default function VideoGeneratorPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [maxSize, setMaxSize] = useState(540);
  const [playing, setPlaying] = useState(true);

  function togglePlay() {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
    setPlaying(!playing);
  }

  function downloadFrame() {
    if (!videoRef.current) return;
    const c = document.createElement("canvas");
    c.width = videoRef.current.videoWidth;
    c.height = videoRef.current.videoHeight;
    c.getContext("2d")!.drawImage(videoRef.current, 0, 0);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `eastel-video-frame-${Date.now()}.png`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div><h1>Video Generator</h1><p className="mt-2 text-on-surface-variant">Preview and export the Eastel product video.</p></div>
      <div className="flex flex-col xl:flex-row gap-6 items-start">
      {/* LEFT: Controls */}
      <div className="w-full xl:w-80 shrink-0 flex flex-col gap-4">
        {/* Info */}
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">Product Listing Video</h3>
          <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
            28-second animated product showcase for Eastel 5G prepaid plans.
            Cycles through brand intro, 5 plan tiers, and an outro CTA.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["Duration", "28 sec"],
              ["Resolution", "1080 × 1080"],
              ["Scenes", "7 total"],
              ["Format", "MP4"],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface-container rounded-lg p-2 text-center">
                <div className="text-xs text-on-surface-variant/60">{label}</div>
                <div className="font-bold">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Plan Data */}
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">Plan Data</h3>
          <div className="flex flex-col gap-1.5">
            {PLANS.map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-surface-container rounded-lg px-3 py-1.5 text-xs">
                <span className="font-extrabold text-sm w-10">{p.id}</span>
                <span className="text-on-surface-variant">{p.data}</span>
                <span className="ml-auto font-bold">{p.price}</span>
                {p.badge && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${p.badgeColor}`}>
                    {p.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Display */}
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">Display</h3>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((s) => (
              <button
                key={s.value}
                onClick={() => setMaxSize(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  maxSize === s.value
                    ? "bg-primary/15 border-primary text-primary"
                    : "bg-surface-container border-outline text-on-surface hover:border-primary/50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Export */}
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">Export</h3>
          <div className="flex flex-col gap-2">
            <a
              href="/images/eastel_product.mp4"
              download="eastel-product-video.mp4"
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold text-sm hover:shadow-lg transition-shadow"
            >
              <Download className="w-4 h-4" /> Download MP4
            </a>
            <button
              onClick={downloadFrame}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm font-semibold hover:border-primary/50 transition-colors"
            >
              <Maximize2 className="w-4 h-4" /> Export Current Frame (PNG)
            </button>
            <Link
              href="/hs/video-recording"
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm font-semibold hover:border-primary/50 transition-colors"
            >
              Record Clean Video (no play bar)
            </Link>
          </div>
        </div>
      </div>

      {/* RIGHT: Video Preview */}
      <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-outline-variant bg-surface-variant overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-outline-variant">
          <span className="text-xs font-semibold">Preview</span>
          <span className="text-xs text-on-surface-variant">Autoplay + Loop</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={togglePlay} aria-label={playing ? "Pause preview" : "Play preview"} className="p-1.5 rounded-lg hover:bg-surface-container transition-colors">
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
          <video
            ref={videoRef}
            src="/images/eastel_product.mp4"
            autoPlay
            loop
            muted
            playsInline
            controlsList="nodownload noplaybackrate nofullscreen"
            disablePictureInPicture
            className="w-full rounded-lg bg-[#05030d]"
            style={{ maxWidth: maxSize, maxHeight: maxSize }}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
