"use client";

import { useState, useEffect, useRef } from "react";
import { toPng, toJpeg } from "html-to-image";
import { Download, Upload, SlidersHorizontal, Info } from "lucide-react";

const FONT_LINKS = [
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap",
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap",
];

interface Feature {
  ico: string;
  k: string;
  v: string;
  small?: string;
  hi?: boolean;
}

interface Banner {
  id: string;
  variant: string;
  tagline: string;
  pill: string;
  eyebrow: string;
  pkg: string;
  price: string;
  duration: string;
  features: Feature[];
  code: string;
}

const INITIAL_BANNERS: Banner[] = [
  {
    id: "ez15",
    variant: "v-ez15",
    tagline: "Prepaid · Malaysia",
    pill: "5G Ready",
    eyebrow: "Starter Plan",
    pkg: "EZ15",
    price: "15",
    duration: "15 Days Validity",
    features: [
      { ico: "i-data", k: "High Speed Data", v: "30 GB", hi: true },
      { ico: "i-hotspot", k: "Hotspot", v: "Full", small: "Tethering" },
      { ico: "i-call", k: "Voice Calls", v: "Unlimited" },
      { ico: "i-sms", k: "Messaging", v: "5 SMS" },
    ],
    code: "01 / 05",
  },
  {
    id: "ez35",
    variant: "v-ez35",
    tagline: "Best Value",
    pill: "5G Ready",
    eyebrow: "Most Popular",
    pkg: "EZ35",
    price: "35",
    duration: "30 Days Validity",
    features: [
      { ico: "i-data", k: "High Speed Data", v: "200 GB", hi: true },
      { ico: "i-carry", k: "Unused Data", v: "Carry Forward" },
      { ico: "i-hotspot", k: "Hotspot", v: "100 GB" },
      { ico: "i-call", k: "Calls & SMS", v: "Unlimited", small: "+ 10 SMS" },
    ],
    code: "02 / 05",
  },
  {
    id: "ez50",
    variant: "v-ez50",
    tagline: "+ Roaming",
    pill: "5G + Roam",
    eyebrow: "Travel Plan",
    pkg: "EZ50",
    price: "50",
    duration: "30 Days Validity",
    features: [
      { ico: "i-data", k: "High Speed Data · Hotspot", v: "500 GB", hi: true },
      { ico: "i-carry", k: "Unused Data", v: "Carry Forward" },
      { ico: "i-roam", k: "Roaming · ID/SG/TH", v: "3 GB" },
      { ico: "i-call", k: "Calls · SMS", v: "Unlimited", small: "+ 10 SMS" },
    ],
    code: "03 / 05",
  },
  {
    id: "ez68",
    variant: "v-ez68",
    tagline: "Power User",
    pill: "5G + Roam",
    eyebrow: "Heavy Data Plan",
    pkg: "EZ68",
    price: "68",
    duration: "30 Days Validity",
    features: [
      { ico: "i-data", k: "High Speed Data · Hotspot", v: "700 GB", hi: true },
      { ico: "i-carry", k: "Unused Data", v: "Carry Forward" },
      { ico: "i-roam", k: "Roaming · ID/SG/TH", v: "5 GB" },
      { ico: "i-call", k: "Calls · SMS", v: "Unlimited", small: "+ 10 SMS" },
    ],
    code: "04 / 05",
  },
  {
    id: "ez98",
    variant: "v-ez98",
    tagline: "Premium",
    pill: "5G Premium",
    eyebrow: "Top Tier Plan",
    pkg: "EZ98",
    price: "98",
    duration: "30 Days Validity",
    features: [
      { ico: "i-data", k: "High Speed Data · Hotspot", v: "999 GB", hi: true },
      { ico: "i-carry", k: "Unused Data", v: "Carry Forward" },
      { ico: "i-roam", k: "Roaming · ID/SG/TH", v: "10 GB" },
      { ico: "i-call", k: "Calls · SMS", v: "Unlimited", small: "+ 10 SMS" },
    ],
    code: "05 / 05",
  },
];

export default function ProductListingPhotosPage() {
  const [banners, setBanners] = useState<Banner[]>(INITIAL_BANNERS);
  const [outWidth, setOutWidth] = useState(1080);
  const [outFormat, setOutFormat] = useState<"png" | "jpeg">("png");
  const [outQuality, setOutQuality] = useState(0.92);
  const [downloadEstimates, setDownloadEstimates] = useState<Record<string, string>>({});
  const [dlLoading, setDlLoading] = useState<Record<string, boolean>>({});
  const [combinedLoading, setCombinedLoading] = useState(false);
  const [combinedEst, setCombinedEst] = useState("≈ — KB");

  const wrapRef = useRef<HTMLDivElement>(null);
  const combinedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    FONT_LINKS.forEach((href) => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        document.head.appendChild(l);
      }
    });

    const handleResize = () => {
      if (!wrapRef.current) return;
      const preview = wrapRef.current.querySelector(".admin-design-preview-scroll") as HTMLElement | null;
      const avail = (preview?.clientWidth ?? wrapRef.current.clientWidth) - 32;
      const scale = Math.min(0.7, avail / 1080);
      wrapRef.current.style.setProperty("--plg-scale", scale.toFixed(4));

      const cse = document.querySelector(".plg-combined-scale") as HTMLElement;
      if (cse && cse.parentElement) {
        const availW = cse.parentElement.clientWidth - 16;
        const availH = Math.max(520, window.innerHeight - 200);
        const cs = Math.min(availW / 5400, availH / 3820);
        wrapRef.current.style.setProperty("--plg-scale-combined", cs.toFixed(4));
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    const timer = setTimeout(handleResize, 500);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, []);

  const updateBannerField = (id: string, field: keyof Banner, val: string) => {
    setBanners((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: val } : b))
    );
  };

  const updateFeatureField = (
    bannerId: string,
    featIdx: number,
    field: keyof Feature,
    val: string
  ) => {
    setBanners((prev) =>
      prev.map((b) => {
        if (b.id !== bannerId) return b;
        const nextFeats = b.features.map((f, i) =>
          i === featIdx ? { ...f, [field]: val } : f
        );
        return { ...b, features: nextFeats };
      })
    );
  };

  const prepSvgForExport = (node: HTMLElement) => {
    const stash: Array<{
      svg: SVGElement;
      origHTML: string;
      origAttrs: Array<[string, string]>;
    }> = [];

    node.querySelectorAll("svg use[href]").forEach((u) => {
      const href = u.getAttribute("href");
      if (!href) return;
      const sym = document.querySelector(href);
      if (!sym) return;
      const svg = u.closest("svg");
      if (!svg) return;

      stash.push({
        svg,
        origHTML: svg.innerHTML,
        origAttrs: Array.from(svg.attributes).map((a) => [a.name, a.value]),
      });

      svg.innerHTML = sym.innerHTML;
      if (sym.hasAttribute("viewBox")) {
        svg.setAttribute("viewBox", sym.getAttribute("viewBox")!);
      }
      if (sym.hasAttribute("fill")) {
        svg.setAttribute("fill", sym.getAttribute("fill")!);
      }
      if (sym.hasAttribute("stroke")) {
        svg.setAttribute("stroke", sym.getAttribute("stroke")!);
      }
      if (sym.hasAttribute("stroke-width")) {
        svg.setAttribute("stroke-width", sym.getAttribute("stroke-width")!);
      }
      if (sym.hasAttribute("stroke-linecap")) {
        svg.setAttribute("stroke-linecap", sym.getAttribute("stroke-linecap")!);
      }
      if (sym.hasAttribute("stroke-linejoin")) {
        svg.setAttribute("stroke-linejoin", sym.getAttribute("stroke-linejoin")!);
      }
    });

    return stash;
  };

  const restoreSvgAfterExport = (
    stash: Array<{
      svg: SVGElement;
      origHTML: string;
      origAttrs: Array<[string, string]>;
    }>
  ) => {
    stash.forEach(({ svg, origHTML, origAttrs }) => {
      svg.innerHTML = origHTML;
      Array.from(svg.attributes).forEach((a) => svg.removeAttribute(a.name));
      origAttrs.forEach(([n, v]) => svg.setAttribute(n, v));
    });
  };

  const exportNode = async (
    node: HTMLElement,
    nativeW: number,
    filename: string,
    nativeH?: number
  ) => {
    const targetW = outWidth || nativeW;
    const pixelRatio = targetW / nativeW;
    const height = nativeH || node.offsetHeight;

    const stash = prepSvgForExport(node);
    const opts = {
      width: nativeW,
      height,
      pixelRatio,
      cacheBust: true,
      backgroundColor: "#050309",
      style: {
        transform: "none",
        margin: "0",
      },
      skipFonts: false,
    };

    let dataUrl = "";
    try {
      if (outFormat === "jpeg") {
        dataUrl = await toJpeg(node, { ...opts, quality: outQuality });
      } else {
        dataUrl = await toPng(node, opts);
      }
    } finally {
      restoreSvgAfterExport(stash);
    }

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${filename}.${outFormat === "jpeg" ? "jpg" : "png"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    const bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
    return bytes;
  };

  const fmtSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  const handleDownloadSingle = async (id: string) => {
    const bannerEl = document.querySelector(`[data-banner-el="${id}"]`) as HTMLElement;
    if (!bannerEl) return;

    setDlLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const bytes = await exportNode(bannerEl, 1080, `Eastel-${id.toUpperCase()}`);
      setDownloadEstimates((prev) => ({ ...prev, [id]: fmtSize(bytes) }));
    } catch (err) {
      console.error(err);
      alert("Download failed. Please see the console logs.");
    } finally {
      setDlLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleDownloadCombined = async () => {
    if (!combinedRef.current) return;

    setCombinedLoading(true);
    try {
      const bytes = await exportNode(
        combinedRef.current,
        5400,
        "Eastel-A4-All-Packages",
        3820
      );
      setCombinedEst(`≈ ${fmtSize(bytes)}`);
    } catch (err) {
      console.error(err);
      alert("Download failed. Please see the console logs.");
    } finally {
      setCombinedLoading(false);
    }
  };

  const renderBannerContent = (b: Banner, isCombinedView = false) => {
    const ce = { contentEditable: true, suppressContentEditableWarning: true };

    return (
      <div data-admin-artwork className={`plg-banner ${b.variant} relative w-[1080px] h-[1350px] overflow-hidden bg-[#050309] text-[#e9e7f5] select-none pointer-events-auto`}>
        <div className="bg base absolute inset-0 z-0"></div>
        <div className="bg glow absolute inset-0 z-0"></div>
        <div className="waves absolute inset-[-6%] z-0 opacity-70"></div>
        <div className="dots absolute inset-0 z-0 opacity-55"></div>
        <div className="particles absolute inset-0 z-0 pointer-events-none">
          <i></i><i></i><i></i><i></i><i></i><i></i>
        </div>

        <div className="wmark-sim absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-semibold text-[22px] tracking-[0.18em] text-[#dff7ff]/68 z-[3] whitespace-nowrap pointer-events-none">
          eastel.site
        </div>

        <div className="fg absolute inset-0 z-[2] px-[54px] py-[59px] flex flex-col bg-transparent">
          <header className="plg-topbar flex items-center justify-between gap-[22px] bg-transparent border-none h-auto static shadow-none">
            <div className="brand flex items-center gap-[15px]">
              <img className="logo w-[119px] h-auto block filter drop-shadow-[0_0_12px_rgba(167,120,255,0.4)]" src="/images/eastel.svg" alt="Eastel" />
              <span className="divider w-[1px] h-[48px] bg-gradient-to-b from-transparent via-white/25 to-transparent"></span>
              <span
                className="tagline font-mono text-[16px] tracking-[0.22em] text-[#cfcadf] uppercase"
                {...ce}
                onBlur={(e) => updateBannerField(b.id, "tagline", e.currentTarget.innerText)}
              >
                {b.tagline}
              </span>
            </div>
            <span className="pill5g inline-flex items-center gap-[11px] px-[18px] py-[11px] rounded-full bg-gradient-to-br from-[#5be4ff]/16 to-[#a778ff]/16 border border-[#5be4ff]/35 shadow-[inset_0_0_18px_rgba(91,228,255,0.12),_0_0_24px_rgba(91,228,255,0.15)] font-semibold text-[18px] tracking-[0.18em] text-[#dff7ff] uppercase whitespace-nowrap">
              <span className="dot w-[11px] h-[11px] rounded-full bg-[#5be4ff] shadow-[0_0_10px_#5be4ff,_0_0_22px_#22b6ff]"></span>
              <span
                {...ce}
                onBlur={(e) => updateBannerField(b.id, "pill", e.currentTarget.innerText)}
              >
                {b.pill}
              </span>
            </span>
          </header>

          <section className="hero mt-[38px] flex flex-col items-center text-center">
            <div
              className="eyebrow font-mono text-[16px] tracking-[0.34em] text-[#9b96bd] uppercase"
              {...ce}
              onBlur={(e) => updateBannerField(b.id, "eyebrow", e.currentTarget.innerText)}
            >
              {b.eyebrow}
            </div>
            <h2 className="title mt-[13px] font-bold text-[54px] leading-[1.04] tracking-[-0.01em] text-white whitespace-nowrap">
              <span className="accent bg-gradient-to-r from-[#5be4ff] via-[#a778ff] to-[#e36bff] bg-clip-text text-transparent">
                5G High Speed
              </span>
              <br />
              <span>Internet</span>
            </h2>
            <div className="priceblock mt-[26px] flex flex-col items-center gap-[12px]">
              <span className="pkg-tag inline-flex items-center gap-[10px] px-[22px] py-[11px] rounded-full bg-white/4 border border-white/12 backdrop-blur-[8px] font-mono text-[17px] tracking-[0.28em] text-[#cfcadf] uppercase">
                <b
                  {...ce}
                  onBlur={(e) => updateBannerField(b.id, "pkg", e.currentTarget.innerText)}
                >
                  {b.pkg}
                </b>
              </span>
              <div className="price-row flex items-end justify-center leading-none gap-[14px] px-[40px] whitespace-nowrap">
                <span className="currency font-semibold text-[48px] text-[#cfcadf] -translate-y-[14px] tracking-[0.04em] whitespace-nowrap shrink-0">
                  RM
                </span>
                <span
                  className="price font-bold text-[184px] bg-gradient-to-b from-white via-[#cdf3ff] to-[#a8c8ff] bg-clip-text text-transparent filter drop-shadow-[0_0_22px_rgba(91,228,255,0.35)] drop-shadow-[0_0_60px_rgba(167,120,255,0.25)] tracking-[-0.02em] px-[0.06em] whitespace-nowrap shrink-0"
                  {...ce}
                  onBlur={(e) => updateBannerField(b.id, "price", e.currentTarget.innerText)}
                >
                  {b.price}
                </span>
              </div>
              <div
                className="duration font-mono text-[17px] tracking-[0.24em] text-[#9b96bd] uppercase mt-[6px]"
                {...ce}
                onBlur={(e) => updateBannerField(b.id, "duration", e.currentTarget.innerText)}
              >
                {b.duration}
              </div>
            </div>
          </section>

          <section className="stage relative mt-[22px] flex-auto grid grid-cols-[1fr_0.9fr] gap-[26px] items-stretch min-h-0 pb-[24px]">
            <div className="features flex flex-col gap-[13px] self-center">
              {b.features.map((f, i) => (
                <div
                  key={i}
                  className={`feature flex items-center gap-[15px] px-[16px] py-[14px] rounded-[13px] bg-gradient-to-br from-white/4 to-white/[0.015] border border-white/6 backdrop-blur-[6px] ${
                    f.hi
                      ? "border-[#5be4ff]/45 bg-gradient-to-br from-[#5be4ff]/16 to-[#a778ff]/10 shadow-[inset_0_0_0_1px_rgba(91,228,255,0.18),_0_0_30px_rgba(91,228,255,0.12)]"
                      : ""
                  }`}
                >
                  <span className="ico shrink-0 w-[46px] h-[46px] rounded-[10px] grid place-items-center bg-gradient-to-br from-[#5be4ff]/18 to-[#a778ff]/18 border border-[#5be4ff]/25 shadow-[inset_0_0_10px_rgba(91,228,255,0.18)] text-[#dff7ff]">
                    <svg className="w-[58%] h-[58%]">
                      <use href={`#${f.ico}`} />
                    </svg>
                  </span>
                  <div className="meta flex flex-col min-w-0 flex-auto">
                    <span
                      className="k font-mono text-[14.5px] tracking-[0.24em] text-[#8a85a8] uppercase"
                      {...ce}
                      onBlur={(e) => updateFeatureField(b.id, i, "k", e.currentTarget.innerText)}
                    >
                      {f.k}
                    </span>
                    <span className="v font-semibold text-[24px] text-white tracking-[-0.005em] leading-[1.15] whitespace-nowrap overflow-visible">
                      <span
                        {...ce}
                        onBlur={(e) => updateFeatureField(b.id, i, "v", e.currentTarget.innerText)}
                      >
                        {f.v}
                      </span>
                      {f.small && (
                        <small
                          className="font-normal text-[16px] text-[#a9a4c7] ml-[6px] tracking-normal"
                          {...ce}
                          onBlur={(e) => updateFeatureField(b.id, i, "small", e.currentTarget.innerText)}
                        >
                          {f.small}
                        </small>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="product relative flex items-center justify-center pb-[12px]">
              <div className="reticle absolute inset-[8%_6%] rounded-full border border-dashed border-[#5be4ff]/18 z-0"></div>
              <img
                className="relative z-[1] w-[88%] h-auto max-h-[90%] object-contain filter drop-shadow-[0_30px_30px_rgba(0,0,0,0.55)] drop-shadow-[0_0_30px_rgba(91,228,255,0.18)]"
                src="/images/sim_4k.png"
                alt="Eastel 5G SIM card"
              />
              <div className="wmark-sim absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-semibold text-[22px] tracking-[0.18em] text-[#dff7ff]/68 z-[3] whitespace-nowrap pointer-events-none">
                eastel.site
              </div>
            </div>
          </section>

          <footer className="bottombar mt-auto pt-[22px] flex justify-between items-center gap-[13px] border-t border-white/7">
            <div className="tags flex gap-[11px] flex-wrap">
              <span className="inline-flex items-center gap-[7px] px-[14px] py-[9px] rounded-full bg-white/[0.035] border border-white/[0.09] font-medium text-[15.5px] text-[#e9e7f5] tracking-[0.01em] whitespace-nowrap">
                <svg className="w-[17px] h-[17px] text-[#5be4ff]">
                  <use href="#i-num" />
                </svg>
                <span>Keep Old Number</span>
              </span>
              <span className="inline-flex items-center gap-[7px] px-[14px] py-[9px] rounded-full bg-white/[0.035] border border-white/[0.09] font-medium text-[15.5px] text-[#e9e7f5] tracking-[0.01em] whitespace-nowrap">
                <svg className="w-[17px] h-[17px] text-[#5be4ff]">
                  <use href="#i-bolt" />
                </svg>
                <span>Fast Activation</span>
              </span>
              <span className="inline-flex items-center gap-[7px] px-[14px] py-[9px] rounded-full bg-white/[0.035] border border-white/[0.09] font-medium text-[15.5px] text-[#e9e7f5] tracking-[0.01em] whitespace-nowrap">
                <svg className="w-[17px] h-[17px] text-[#5be4ff]">
                  <use href="#i-shield" />
                </svg>
                <span>No Contract</span>
              </span>
            </div>
          </footer>
        </div>
      </div>
    );
  };

  return (
    <div className="plg-wrap relative p-0 font-sans">
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --plg-scale: 0.5;
          --plg-scale-combined: 0.22;
        }

        .plg-banner {
          font-family: "Inter", system-ui, sans-serif;
        }

        .plg-banner .bg.base {
          background:
            radial-gradient(120% 80% at 110% 8%, #2a1670 0%, transparent 55%),
            radial-gradient(110% 80% at -10% 110%, #062a55 0%, transparent 60%),
            radial-gradient(80% 60% at 50% 100%, #1a0941 0%, transparent 70%),
            linear-gradient(180deg, #05030d 0%, #0a0626 45%, #06031a 100%);
        }

        .plg-banner .bg.glow {
          background:
            radial-gradient(40% 28% at 78% 30%, rgba(91,228,255,0.22) 0%, transparent 60%),
            radial-gradient(38% 26% at 22% 75%, rgba(167,120,255,0.22) 0%, transparent 60%);
          filter: blur(2px);
        }

        .plg-banner .waves {
          background:
            repeating-linear-gradient(12deg, transparent 0 38px, rgba(91,228,255,0.05) 38px 39px),
            repeating-linear-gradient(-8deg, transparent 0 64px, rgba(167,120,255,0.04) 64px 65px);
          -webkit-mask: radial-gradient(80% 70% at 50% 40%, #000 30%, transparent 80%);
          mask: radial-gradient(80% 70% at 50% 40%, #000 30%, transparent 80%);
        }

        .plg-banner .dots {
          background-image: radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.4px);
          background-size: 22px 22px;
          -webkit-mask: linear-gradient(180deg, transparent 0%, #000 30%, #000 70%, transparent 100%);
          mask: linear-gradient(180deg, transparent 0%, #000 30%, #000 70%, transparent 100%);
        }

        .plg-banner .particles i {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: radial-gradient(circle, #b9f6ff 0%, rgba(91,228,255,0) 70%);
          filter: drop-shadow(0 0 6px #5be4ff);
        }
        .plg-banner .particles i:nth-child(1) { left: 14%; top: 18%; }
        .plg-banner .particles i:nth-child(2) { left: 68%; top: 9%; background: radial-gradient(circle, #e7c7ff 0%, rgba(167,120,255,0) 70%); filter: drop-shadow(0 0 6px #a778ff); }
        .plg-banner .particles i:nth-child(3) { left: 88%; top: 42%; width: 3px; height: 3px; }
        .plg-banner .particles i:nth-child(4) { left: 8%; top: 62%; width: 5px; height: 5px; }
        .plg-banner .particles i:nth-child(5) { left: 48%; top: 78%; background: radial-gradient(circle, #e7c7ff 0%, rgba(167,120,255,0) 70%); filter: drop-shadow(0 0 6px #a778ff); }
        .plg-banner .particles i:nth-child(6) { left: 30%; top: 32%; width: 3px; height: 3px; }

        .plg-banner.v-ez98 .price {
          background: linear-gradient(180deg, #fff7d8 0%, #ffd66b 60%, #ff9d6b 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 0 26px rgba(255,214,107,0.45)) drop-shadow(0 0 60px rgba(255,157,107,0.25));
        }
        .plg-banner.v-ez98 .pill5g {
          border-color: rgba(255,214,107,0.45);
          background: linear-gradient(135deg, rgba(255,214,107,0.18), rgba(255,157,107,0.18));
          color: #fff5d8;
        }
        .plg-banner.v-ez98 .pill5g .dot {
          background: #ffd66b;
          box-shadow: 0 0 10px #ffd66b, 0 0 22px #ff9d6b;
        }
        .plg-banner.v-ez98 .title .accent {
          background: linear-gradient(95deg, #ffd66b 0%, #ff9d6b 60%, #e36bff 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .plg-banner-scale {
          transform: scale(var(--plg-scale, 0.5));
          transform-origin: top left;
        }

        .plg-combined-scale {
          transform: scale(var(--plg-scale-combined, 0.22));
          transform-origin: top left;
        }

        [contenteditable="true"] {
          outline: none;
          transition: background-color .15s ease, box-shadow .15s ease;
          border-radius: 4px;
        }
        [contenteditable="true"]:hover {
          background: rgba(91,228,255,0.06);
          box-shadow: 0 0 0 2px rgba(91,228,255,0.15);
        }
        [contenteditable="true"]:focus {
          background: rgba(91,228,255,0.12);
          box-shadow: 0 0 0 2px rgba(91,228,255,0.4);
        }
      ` }} />

      {/* SVG symbols definitions */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <symbol id="i-data" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7c0-1.5 3.6-3 8-3s8 1.5 8 3-3.6 3-8 3-8-1.5-8-3z" /><path d="M4 7v10c0 1.5 3.6 3 8 3s8-1.5 8-3V7" /><path d="M4 12c0 1.5 3.6 3 8 3s8-1.5 8-3" />
          </symbol>
          <symbol id="i-hotspot" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="2" /><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7" /><path d="M5.5 18.5a9 9 0 0 1 0-13M18.5 5.5a9 9 0 0 1 0 13" />
          </symbol>
          <symbol id="i-call" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />
          </symbol>
          <symbol id="i-sms" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 3V6a1 1 0 0 1 1-1z" /><path d="M8 11h.01M12 11h.01M16 11h.01" />
          </symbol>
          <symbol id="i-carry" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3.2-6.9" /><path d="M21 4v5h-5" />
          </symbol>
          <symbol id="i-roam" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </symbol>
          <symbol id="i-bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
          </symbol>
          <symbol id="i-num" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10 18h4" />
          </symbol>
          <symbol id="i-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
          </symbol>
        </defs>
      </svg>

      {/* Control bar */}
      <div className="plg-controls sticky top-0 z-[50] bg-[#080510]/92 backdrop-blur-md border-b border-white/8 px-6 py-4">
        <div className="plg-controls-inner max-w-[1600px] margin-0-auto flex flex-wrap items-center gap-4 text-[13px] text-[#cfcadf]">
          <h1 className="margin-0 font-display font-semibold text-[16px] text-white tracking-[0.01em] mr-auto flex items-center gap-2.5 before:content-[''] before:w-2 before:h-2 before:rounded-full before:bg-[#5be4ff] before:shadow-[0_0_10px_#5be4ff]">
            Eastel · Product Listing Photos
          </h1>
          <div className="plg-ctrl flex items-center gap-2">
            <label className="text-[#8a85a8] text-[11px] tracking-[0.06em] uppercase font-mono">Output Width</label>
            <input
              type="number"
              value={outWidth}
              onChange={(e) => setOutWidth(Math.max(400, Math.min(4000, Number(e.target.value))))}
              className="bg-white/5 border border-white/12 text-white px-2.5 py-1.5 rounded-lg font-mono text-[12.5px] w-[84px] outline-none focus:border-[#5be4ff]/55"
              min="400"
              max="4000"
              step="20"
            />
            <span className="text-[#6b6790] font-mono text-xs">px</span>
          </div>
          <div className="plg-ctrl flex items-center gap-2">
            <label className="text-[#8a85a8] text-[11px] tracking-[0.06em] uppercase font-mono">Format</label>
            <select
              value={outFormat}
              onChange={(e) => setOutFormat(e.target.value as "png" | "jpeg")}
              className="bg-white/5 border border-white/12 text-white px-2.5 py-1.5 rounded-lg font-mono text-[12.5px] outline-none focus:border-[#5be4ff]/55 cursor-pointer"
            >
              <option value="png" className="bg-[#120f21] text-white">PNG</option>
              <option value="jpeg" className="bg-[#120f21] text-white">JPEG</option>
            </select>
          </div>
          {outFormat === "jpeg" && (
            <div className="plg-ctrl flex items-center gap-2">
              <label className="text-[#8a85a8] text-[11px] tracking-[0.06em] uppercase font-mono">Quality</label>
              <input
                type="range"
                min="0.4"
                max="1"
                step="0.05"
                value={outQuality}
                onChange={(e) => setOutQuality(parseFloat(e.target.value))}
                className="w-[120px] accent-[#5be4ff]"
              />
              <span className="text-[#cfcadf] font-mono text-xs w-[40px] text-right">{outQuality.toFixed(2)}</span>
            </div>
          )}
          <div className="plg-note flex-none w-full text-[11.5px] text-[#8a85a8] max-w-[800px] leading-relaxed flex items-start gap-1">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              <b>Tip:</b> Click any text directly on the banners below to edit in-place (tagline, eyebrow, package name, price, features, validity, etc.).
              Downloads capture the exact edits. A4 compiles all 5 packages side-by-side.
            </span>
          </div>
        </div>
      </div>

      {/* Main page content */}
      <div className="plg-page px-6 py-9 max-w-[1600px] mx-auto space-y-14" ref={wrapRef}>
        
        {/* Individual Banners Section */}
        <section className="space-y-4">
          <div className="flex justify-between items-center gap-4">
            <h2 className="text-[17px] font-semibold text-white tracking-[0.01em]">
              Individual Banners · 1080 × 1350 (4:5)
            </h2>
            <p className="text-xs text-[#8a85a8]">Click text to edit. Export each card individually.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {banners.map((b) => {
              const estimate = downloadEstimates[b.id] || "— KB";
              const isDlLoading = dlLoading[b.id] || false;

              return (
                <div key={b.id} className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-4 text-xs text-[#8a85a8]">
                    <span className="font-mono tracking-[0.16em]">{b.id.toUpperCase()} · 1080 × 1350</span>
                    <span>≈ <b>{estimate}</b></span>
                    <button
                      onClick={() => handleDownloadSingle(b.id)}
                      disabled={isDlLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer bg-gradient-to-br from-[#5be4ff]/16 to-[#a778ff]/16 border border-[#5be4ff]/35 text-[#dff7ff] font-semibold text-xs tracking-[0.04em] transition-all hover:bg-[#5be4ff]/26 hover:shadow-[0_0_12px_rgba(91,228,255,0.2)] disabled:opacity-50"
                    >
                      <Download size={12} className={isDlLoading ? "animate-pulse" : ""} />
                      Download {outFormat.toUpperCase()}
                    </button>
                  </div>
                  
                  {/* Aspect Ratio Wrap Card */}
                  <div className="admin-design-preview-scroll w-full bg-surface rounded-xl border border-outline-variant p-4">
                    <div className="plg-banner-scale shrink-0 shadow-2xl rounded-lg overflow-hidden border border-white/10" style={{ height: 1350, width: 1080 }}>
                      <div data-banner-el={b.id}>
                        {renderBannerContent(b)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Combined Section */}
        <section className="space-y-4">
          <div className="flex justify-between items-center gap-4">
            <h2 className="text-[17px] font-semibold text-white tracking-[0.01em]">
              Combined Image · A4 Landscape · All 5 Packages
            </h2>
            <p className="text-xs text-[#8a85a8]">Prints or downloads all 5 packages in a single row (5400 × 3820).</p>
          </div>
          
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-4 text-xs text-[#8a85a8]">
              <span className="font-mono tracking-[0.16em]">A4 LANDSCAPE · 5400 × 3820</span>
              <span>{combinedEst}</span>
              <button
                onClick={handleDownloadCombined}
                disabled={combinedLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg cursor-pointer bg-gradient-to-br from-[#5be4ff] to-[#a778ff] text-[#0a0712] font-semibold text-xs tracking-[0.04em] transition-all hover:shadow-[0_0_20px_rgba(167,120,255,0.5)] disabled:opacity-50"
              >
                <Download size={14} className={combinedLoading ? "animate-pulse" : ""} />
                Download A4 {outFormat.toUpperCase()}
              </button>
            </div>

            {/* Scale Wrapper */}
            <div className="admin-design-preview-scroll admin-combined-preview w-full bg-surface rounded-xl border border-outline-variant p-4">
              <div className="plg-combined-scale shrink-0 shadow-2xl rounded-lg overflow-hidden border border-white/10" style={{ height: 3820, width: 5400 }}>
                <div ref={combinedRef} data-admin-artwork className="plg-combined relative w-[5400px] h-[3820px] bg-gradient-to-b from-[#050309] via-[#050309] to-[#0d091e] flex flex-col justify-between pointer-events-auto">
                  
                  {/* Radial Background Glows for Combined Canvas */}
                  <div className="absolute inset-0 z-0 bg-[radial-gradient(1400px_900px_at_18%_8%,_rgba(26,11,58,0.55),_transparent_60%),_radial-gradient(1200px_800px_at_82%_92%,_rgba(10,19,64,0.66),_transparent_60%)] pointer-events-none" />

                  {/* Header Row */}
                  <div className="plg-combined-head relative z-10 flex items-center justify-between gap-10 px-[100px] pt-[80px] pb-[70px]">
                    <div className="brand-row flex items-center gap-8">
                      <img className="logo w-[240px] h-auto filter drop-shadow-[0_0_18px_rgba(167,120,255,0.45)]" src="/images/eastel.svg" alt="Eastel" />
                      <span className="divider w-[1px] h-[96px] bg-gradient-to-b from-transparent via-white/30 to-transparent" />
                      <div className="label font-display font-bold text-[54px] text-white tracking-[0.01em] leading-[1.05]">
                        <span className="accent bg-gradient-to-r from-[#5be4ff] via-[#a778ff] to-[#e36bff] bg-clip-text text-transparent">
                          5G Prepaid Plans
                        </span>
                        <small className="block font-mono font-medium text-[22px] tracking-[0.32em] text-[#8a85a8] uppercase mt-2.5">
                          Malaysia · Full Lineup
                        </small>
                      </div>
                    </div>
                    <span className="badge inline-flex items-center gap-4 px-[36px] py-[20px] rounded-full bg-gradient-to-br from-[#5be4ff]/16 to-[#a778ff]/16 border border-[#5be4ff]/35 shadow-[inset_0_0_24px_rgba(91,228,255,0.12),_0_0_40px_rgba(91,228,255,0.15)] font-semibold text-[28px] tracking-[0.18em] text-[#dff7ff] uppercase whitespace-nowrap">
                      <span className="dot w-3.5 h-3.5 rounded-full bg-[#5be4ff] shadow-[0_0_14px_#5be4ff,_0_0_30px_#22b6ff]"></span>
                      All 5 Packages
                    </span>
                  </div>

                  {/* Banners Row */}
                  <div className="plg-combined-row relative z-10 flex flex-row justify-center align-center w-[5400px] px-[100px] gap-[96px]">
                    {banners.map((b) => (
                      <div key={b.id} className="shadow-[0_30px_80px_rgba(0,0,0,0.55),_0_0_60px_rgba(91,228,255,0.08)] rounded-xl overflow-hidden">
                        {renderBannerContent(b, true)}
                      </div>
                    ))}
                  </div>

                  {/* Footer Row */}
                  <div className="plg-combined-foot relative z-10 flex items-center justify-between gap-10 px-[100px] pt-[70px] pb-[80px] border-t border-white/8">
                    <span className="site font-display font-bold text-[48px] tracking-[0.20em] text-[#dff7ff] filter drop-shadow-[0_0_18px_rgba(91,228,255,0.65)] drop-shadow-[0_0_36px_rgba(91,228,255,0.35)]">
                      eastel.site
                    </span>
                    <div className="pkgs flex gap-5">
                      {banners.map((b) => (
                        <span key={b.id} className="inline-flex items-center px-[30px] py-[18px] rounded-full bg-white/4 border border-white/14 font-mono font-medium text-[24px] tracking-[0.24em] text-[#cfcadf] uppercase">
                          {b.pkg}
                        </span>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
