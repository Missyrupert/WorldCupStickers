"use client";

import StickerCard from "@/components/StickerCard";
import { preprocessImageForUpload } from "@/lib/preprocessImageForUpload";
import {
  getCountriesForYear,
  getWorldCupYears,
  OUTFIELD_POSITIONS,
  randomCountryForYear,
  randomOutfieldPosition,
  type CompetitionMode,
  type OutfieldPosition,
} from "@/lib/worldCup";
import { useCallback, useEffect, useRef, useState } from "react";

const API_FAILURE_MSG = "Something went wrong. Please try again.";

// ── Per-user generation limit ──────────────────────────────────────────────
const GEN_LIMIT_KEY = "wc_gens";
const MAX_FREE_GENS = 3;
const RESET_MS = 24 * 60 * 60 * 1000; // 24 hours

type GenRecord = { count: number; since: number };

function readGenRecord(): GenRecord {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(GEN_LIMIT_KEY) : null;
    if (!raw) return { count: 0, since: Date.now() };
    const r = JSON.parse(raw) as GenRecord;
    // Expired window — treat as fresh
    if (Date.now() - r.since > RESET_MS) return { count: 0, since: Date.now() };
    return r;
  } catch {
    return { count: 0, since: Date.now() };
  }
}

function bumpGenRecord(): number {
  const r = readGenRecord();
  const updated: GenRecord =
    r.count === 0
      ? { count: 1, since: Date.now() }       // first gen — start the window now
      : { count: r.count + 1, since: r.since }; // subsequent — keep original window
  localStorage.setItem(GEN_LIMIT_KEY, JSON.stringify(updated));
  return MAX_FREE_GENS - updated.count; // returns remaining after this bump
}
// ──────────────────────────────────────────────────────────────────────────

function safeSlug(s: string): string {
  return s.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 56) || "sticker";
}

type Mode = "random" | "custom";

type TransformResult = {
  imageBase64: string;
  mimeType: string;
  year: number;
  country: string;
  position: string;
  displayName: string;
  mode: Mode;
  competitionMode: CompetitionMode;
};

type PendingSticker = {
  imageSrc: string;
  displayName: string;
  country: string;
  year: number;
  position: string;
  competitionMode: CompetitionMode;
  mode: Mode;
};

export default function HomePage() {
  const [competitionMode, setCompetitionMode] = useState<CompetitionMode>("men");
  const [mode, setMode] = useState<Mode>("random");
  const [year, setYear] = useState<number>(2022);
  const [country, setCountry] = useState("");
  const [position, setPosition] = useState<OutfieldPosition>("Midfielder");
  const [userName, setUserName] = useState("");
  const [generationCount, setGenerationCount] = useState(0);
  const [lastRandomCountry, setLastRandomCountry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [camOn, setCamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [gensLeft, setGensLeft] = useState<number>(MAX_FREE_GENS);

  // Initialise generation counter from localStorage on mount
  useEffect(() => {
    const { count } = readGenRecord();
    setGensLeft(Math.max(0, MAX_FREE_GENS - count));
  }, []);
  const [result, setResult] = useState<TransformResult | null>(null);
  const [pendingSticker, setPendingSticker] = useState<PendingSticker | null>(null);

  const stickerRef = useRef<HTMLDivElement>(null);
  const generatingRef = useRef(false);

  const tournamentYears = getWorldCupYears(competitionMode);
  const countries = getCountriesForYear(year, competitionMode);

  useEffect(() => {
    if (!countries.length) return;
    if (!countries.includes(country)) setCountry(countries[0]!);
  }, [countries, country]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const setImageFile = useCallback((f: File | null) => {
    setFile(f);
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCamOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError("Camera access denied — please check your browser permissions and try again.");
    }
  };

  const captureFromCamera = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setImageFile(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  };

  const readJsonResponse = async (
    res: Response,
    label: string
  ): Promise<Record<string, unknown>> => {
    const raw = await res.text();
    if (!res.ok) {
      try {
        const err = JSON.parse(raw) as { error?: string };
        throw new Error(err.error ?? raw ?? `${label} failed (${res.status})`);
      } catch (parseErr) {
        if (parseErr instanceof SyntaxError) throw new Error(raw || `${label} failed (${res.status})`);
        throw parseErr;
      }
    }
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid response from ${label}`);
    }
  };

  const generate = async () => {
    if (generatingRef.current) return;
    setError(null);

    // Generation limit check
    const { count, since } = readGenRecord();
    const withinWindow = Date.now() - since <= RESET_MS;
    if (withinWindow && count >= MAX_FREE_GENS) {
      setError("Free limit reached – come back tomorrow.");
      return;
    }

    if (!file) {
      setError("Take a selfie first — then hit Generate.");
      return;
    }
    if (!userName.trim()) {
      setError("Enter your name first.");
      return;
    }
    if (mode === "custom" && !country) {
      setError("Please select a country.");
      return;
    }

    const pickCountry = mode === "random"
      ? randomCountryForYear(year, competitionMode, generationCount, lastRandomCountry)
      : country;
    const pickPosition = mode === "random" ? randomOutfieldPosition() : position;

    if (mode === "random") {
      setGenerationCount((c) => c + 1);
      setLastRandomCountry(pickCountry);
    }

    generatingRef.current = true;
    setLoading(true);
    setWarning(null);

    if (!result) {
      setPendingSticker({
        imageSrc: previewUrl!,
        displayName: mode === "custom" ? userName.trim() : "…",
        country: pickCountry,
        year,
        position: pickPosition,
        competitionMode,
        mode,
      });
    }

    try {
      const processedFile = await preprocessImageForUpload(file);

      const fd = new FormData();
      fd.append("image", processedFile);
      fd.append("mode", mode);
      fd.append("competitionMode", competitionMode);
      fd.append("year", String(year));
      fd.append("userName", userName.trim());
      fd.append("country", pickCountry);
      fd.append("position", pickPosition);

      if (mode === "random") {
        const [imgRes, nameRes] = await Promise.all([
          fetch("/api/transform-image", { method: "POST", body: fd }),
          fetch("/api/generate-name", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userName: userName.trim(), country: pickCountry, competitionMode }),
          }),
        ]);

        const [data, namePayload] = await Promise.all([
          readJsonResponse(imgRes, "transform-image"),
          readJsonResponse(nameRes, "generate-name"),
        ]);

        const imageBase64 = typeof data.imageBase64 === "string" ? data.imageBase64 : "";
        if (!imageBase64) throw new Error("No image returned");

        const displayName = typeof namePayload.name === "string" ? namePayload.name.trim() : "";
        if (!displayName) throw new Error("No name returned");

        if (data.fallback) {
          const reason = typeof data.fallbackReason === "string" ? ` (${data.fallbackReason})` : "";
          setWarning(`Couldn't transform this one — try again.${reason}`);
        }

        setResult({
          imageBase64,
          mimeType: typeof data.mimeType === "string" ? data.mimeType : "image/png",
          year: typeof data.year === "number" ? data.year : year,
          country: typeof data.country === "string" ? data.country : pickCountry,
          position: typeof data.position === "string" ? data.position : pickPosition,
          displayName,
          mode: "random",
          competitionMode: data.competitionMode === "women" ? "women" : "men",
        });
        setGensLeft(bumpGenRecord());
      } else {
        const imgRes = await fetch("/api/transform-image", { method: "POST", body: fd });
        const data = await readJsonResponse(imgRes, "transform-image");

        const imageBase64 = typeof data.imageBase64 === "string" ? data.imageBase64 : "";
        if (!imageBase64) throw new Error("No image returned");

        if (data.fallback) {
          const reason = typeof data.fallbackReason === "string" ? ` (${data.fallbackReason})` : "";
          setWarning(`Couldn't transform this one — try again.${reason}`);
        }

        const displayName =
          typeof data.displayName === "string" && data.displayName.trim()
            ? data.displayName.trim()
            : userName.trim();

        setResult({
          imageBase64,
          mimeType: typeof data.mimeType === "string" ? data.mimeType : "image/png",
          year: typeof data.year === "number" ? data.year : year,
          country: typeof data.country === "string" ? data.country : pickCountry,
          position: typeof data.position === "string" ? data.position : pickPosition,
          displayName,
          mode: "custom",
          competitionMode: data.competitionMode === "women" ? "women" : "men",
        });
        setGensLeft(bumpGenRecord());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : API_FAILURE_MSG);
    } finally {
      setLoading(false);
      setPendingSticker(null);
      generatingRef.current = false;
    }
  };

  const stickerFilename = (r: TransformResult) =>
    `sticker-${safeSlug(r.country)}-${r.year}.png`;

  const renderStickerPng = async (): Promise<string> => {
    const { toPng } = await import("html-to-image");
    return toPng(stickerRef.current!, { pixelRatio: 2, cacheBust: true });
  };

  const downloadSticker = async () => {
    if (!result || !stickerRef.current) return;
    try {
      const dataUrl = await renderStickerPng();
      const a = document.createElement("a");
      a.download = stickerFilename(result);
      a.href = dataUrl;
      a.click();
    } catch {
      setError("Download failed. Try again.");
    }
  };

  const shareSticker = async () => {
    if (!result || !stickerRef.current) return;
    try {
      const dataUrl = await renderStickerPng();
      const blob = await fetch(dataUrl).then((r) => r.blob());
      const filename = stickerFilename(result);
      const pngFile = new File([blob], filename, { type: "image/png" });
      const caption = `I just got drafted into the ${result.year} ${result.country} squad 😂`;

      if (navigator.share && navigator.canShare?.({ files: [pngFile] })) {
        await navigator.share({ files: [pngFile], title: "My World Cup sticker", text: caption });
        return;
      }
      const a = document.createElement("a");
      a.download = filename;
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Share failed. Try downloading instead.");
    }
  };

  const tryAgain = () => void generate();

  const stickerImageSrc =
    result != null
      ? `data:${result.mimeType};base64,${result.imageBase64}`
      : (pendingSticker?.imageSrc ?? "");
  const stickerMeta = result ?? pendingSticker;
  const stickerImagePending = loading && result === null && pendingSticker !== null;
  const stickerRegenerating = loading && result !== null;

  return (
    <main className="layout-main">
      <header className="layout-header">
        <div className="header-badge">⚽ AI STICKER GENERATOR</div>
        <h1>World Cup Sticker Generator</h1>
        <p className="sub">
          Take a selfie and become a FIFA World Cup legend. AI transforms you into a
          photorealistic footballer — same face, national kit, stadium backdrop.
        </p>
      </header>

      <div className="layout-columns">

        {/* ── Left: Settings ── */}
        <section className="card layout-left">
          <h2>Your Details</h2>

          <label htmlFor="userName">Your full name</label>
          <input
            id="userName"
            type="text"
            placeholder="e.g. Chris Lee"
            value={userName}
            disabled={loading}
            onChange={(e) => setUserName(e.target.value)}
            autoComplete="name"
          />

          <label htmlFor="competition" style={{ marginTop: "1rem", display: "block" }}>Competition</label>
          <select
            id="competition"
            value={competitionMode}
            disabled={loading}
            onChange={(e) => {
              const next = e.target.value as CompetitionMode;
              setCompetitionMode(next);
              const ys = getWorldCupYears(next);
              setYear(ys[ys.length - 1]!);
            }}
          >
            <option value="men">Men&apos;s World Cup</option>
            <option value="women">Women&apos;s World Cup</option>
          </select>

          <label htmlFor="year" style={{ marginTop: "1rem", display: "block" }}>Tournament year</label>
          <select
            id="year"
            value={year}
            disabled={loading}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {tournamentYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <div style={{ marginTop: "1rem" }}>
            <label>Mode</label>
            <div className="toggle" role="group" aria-label="Generation mode">
              <button
                type="button"
                className={mode === "random" ? "active" : ""}
                disabled={loading}
                onClick={() => setMode("random")}
              >
                Random
              </button>
              <button
                type="button"
                className={mode === "custom" ? "active" : ""}
                disabled={loading}
                onClick={() => setMode("custom")}
              >
                Custom
              </button>
            </div>
            <p className="hint">
              {mode === "random"
                ? "Random country + position. AI adapts your name to match."
                : "You choose country and position. Your name appears exactly as typed."}
            </p>
          </div>

          {mode === "custom" && (
            <>
              <div style={{ marginTop: "1rem" }}>
                <label htmlFor="country">Country</label>
                <select
                  id="country"
                  value={country}
                  disabled={loading}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginTop: "1rem" }}>
                <label htmlFor="position">Position</label>
                <select
                  id="position"
                  value={position}
                  disabled={loading}
                  onChange={(e) => setPosition(e.target.value as OutfieldPosition)}
                >
                  {OUTFIELD_POSITIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </section>

        {/* ── Right: Camera ── */}
        <section className="card layout-right">
          <h2>Your Selfie</h2>

          {!camOn && !previewUrl && (
            <p className="hint" style={{ marginBottom: "0.75rem" }}>
              Position your face in the oval guide and capture your photo.
            </p>
          )}

          <div className="row">
            {!camOn ? (
              <button
                type="button"
                className="btn btn-full"
                disabled={loading}
                onClick={startCamera}
              >
                📷 {previewUrl ? "Retake selfie" : "Open camera"}
              </button>
            ) : (
              <>
                <button type="button" className="btn secondary" onClick={stopCamera}>
                  Cancel
                </button>
                <button type="button" className="btn" disabled={loading} onClick={captureFromCamera}>
                  Capture
                </button>
              </>
            )}
          </div>

          {camOn && (
            <div className="cam-container" style={{ marginTop: "0.75rem" }}>
              <video ref={videoRef} className="cam" playsInline muted />
              <div className="cam-overlay" aria-hidden>
                <div className="cam-oval-guide" />
                <span className="cam-guide-text">Center your face</span>
              </div>
            </div>
          )}

          {!camOn && (
            <div className="preview-wrap" style={{ marginTop: "0.75rem" }}>
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Your selfie" />
              ) : (
                <div className="preview-empty">
                  <span>📷</span>
                  <p>No photo yet</p>
                </div>
              )}
            </div>
          )}
        </section>

      </div>

      {/* ── Generate — full width below both panels ── */}
      <div className="generate-row">
        <button
          type="button"
          className="btn btn-generate btn-full"
          onClick={() => void generate()}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? (
            <>
              <span className="spinner spinner-in-btn" aria-hidden />
              Generating your sticker…
            </>
          ) : (
            "⚡ Generate sticker"
          )}
        </button>
        {error && <p className="error" style={{ textAlign: "center" }}>{error}</p>}
        {!error && gensLeft > 0 && (
          <p className="hint" style={{ textAlign: "center", marginTop: "0.5rem" }}>
            {gensLeft} free {gensLeft === 1 ? "generation" : "generations"} remaining today
          </p>
        )}
      </div>

      {/* ── Sticker output ── */}
      {stickerMeta && (
        <section className="card layout-output">
          <h2>Your Sticker</h2>
          <div className={stickerRegenerating ? "sticker-regenerating" : ""}>
            <StickerCard
              key={result ? `r-${result.imageBase64.slice(0, 40)}` : "pending"}
              ref={stickerRef}
              imageSrc={stickerImageSrc}
              displayName={stickerMeta.displayName}
              country={stickerMeta.country}
              year={stickerMeta.year}
              position={stickerMeta.position}
              competitionMode={stickerMeta.competitionMode}
              imagePending={stickerImagePending}
            />
          </div>

          {loading && (
            <p className="meta" style={{ marginTop: "0.75rem" }}>
              <span className="spinner" aria-hidden style={{ display: "inline-block", verticalAlign: "middle", marginRight: "0.4rem" }} />
              {stickerRegenerating ? "Generating new sticker…" : "AI is transforming your photo…"}
            </p>
          )}

          {warning && !loading && (
            <p className="warning">{warning}</p>
          )}

          {result && (
            <>
              {result.mode === "random" && (
                <p className="meta" style={{ marginTop: "0.5rem" }}>
                  New country, position &amp; name each time you try again.
                </p>
              )}
              <div className="actions">
                <button type="button" className="btn" disabled={loading} onClick={tryAgain}>
                  🔄 Try Again
                </button>
                <button type="button" className="btn secondary" onClick={() => void shareSticker()}>
                  📤 Share
                </button>
                <button type="button" className="btn secondary" onClick={() => void downloadSticker()}>
                  ⬇ Download
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
