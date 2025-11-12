import { useEffect, useState } from "react";
import PixiStage from "./components/PixiStage";
import Paytable from "./components/Paytable";
import spinUrl from "./assets/ui/spin.svg";

/** ===== Constants & Utils ===== */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";
const API = `${API_BASE}/api/v1`;
const MIN_SPIN_MS = 2500;
const DEFAULT_BET = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (n: number) => n.toLocaleString();

async function hmacHex(secret: string, data: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** ===== Types ===== */
type SpinBreakdown = { symbols: string[]; mult: number; reason: string };
type SpinResponse = {
  spinId: string;
  reelStops: number[];
  winMinor: number;
  breakdown: SpinBreakdown;
  sig: string;
};
type HistoryEntry = { symbols: string[]; win: number; bet: number };

/** ===== Component ===== */
export default function App() {
  const [sessionId, setSessionId] = useState<string>();
  const [balance, setBalance] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [symbols, setSymbols] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");
  const [showPaytable, setShowPaytable] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [betMinor, setBetMinor] = useState(DEFAULT_BET);

  /** Bootstrap: restore session if possible; else create a new guest */
  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage.getItem("sid");
        if (saved) {
          const tryBal = await fetch(`${API}/wallet/balance`, {
            headers: { "x-session-id": saved },
          });
          if (tryBal.ok) {
            const b = await tryBal.json();
            setSessionId(saved);
            setBalance(b.balanceMinor);
            setMessage("Session restored");
            return;
          }
        }
        const g = await fetch(`${API}/auth/guest`, { method: "POST" }).then((r) => r.json());
        localStorage.setItem("sid", g.sessionId);
        setSessionId(g.sessionId);
        const b = await fetch(`${API}/wallet/balance`, {
          headers: { "x-session-id": g.sessionId },
        }).then((r) => r.json());
        setBalance(b.balanceMinor);
      } catch (e: any) {
        setMessage(e?.message || "Init failed");
      }
    })();
  }, []);

  /** Spin flow (server-authoritative) */
  const doSpin = async () => {
    if (spinning || !sessionId || betMinor > balance) return;
    setSpinning(true);
    setMessage("");
    setSymbols(null);
    const t0 = performance.now();

    try {
      const res = await fetch(`${API}/slot/spin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({ betMinor }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const sigHeader = res.headers.get("x-spin-sig") || "";
      const r: SpinResponse = await res.json();

      // HMAC integrity check
      const msg = `${r.spinId}|${r.reelStops.join(",")}|${r.winMinor}`;
      const localSig = await hmacHex(import.meta.env.VITE_HMAC_SECRET || "dev-secret", msg);
      const serverSig = sigHeader || r.sig;
      if (localSig !== serverSig) throw new Error("Invalid signature");

      // Render exact symbols; keep total time >= 2.5s
      setSymbols(r.breakdown.symbols);
      const elapsed = performance.now() - t0;
      if (elapsed < MIN_SPIN_MS) await sleep(MIN_SPIN_MS - elapsed);

      // Refresh balance & update history
      const b = await fetch(`${API}/wallet/balance`, {
        headers: { "x-session-id": sessionId },
      }).then((x) => x.json());
      setBalance(b.balanceMinor);
      setHistory((h) => [{ symbols: r.breakdown.symbols, win: r.winMinor, bet: betMinor }, ...h].slice(0, 10));
    } catch (e: any) {
      setMessage(e?.message || "Spin error");
    } finally {
      setSpinning(false);
    }
  };

  /** Bet & Session controls */
  const decBet = () => setBetMinor((b) => Math.max(100, b - 100));
  const incBet = () => setBetMinor((b) => Math.min(balance, b + 100));
  const resetSession = () => {
    localStorage.removeItem("sid");
    setSessionId(undefined);
    setBalance(0);
    setHistory([]);
    setMessage("Session cleared");
    window.location.reload();
  };

  /** ===== UI ===== */
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      {/* Centered, scaled PIXI scene (frame + reels handled inside PixiStage) */}
      <PixiStage spinning={spinning} symbols={symbols || undefined} />

      {/* Top bar — centered capsule */}
      <div
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          color: "#fff",
          fontFamily: "Inter, Arial, system-ui",
          background: "rgba(0,0,0,.45)",
          padding: "8px 12px",
          borderRadius: 9999,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <strong style={{ letterSpacing: 1 }}>777</strong>
        <span>•</span>
        <span>Balance: {fmt(balance)}</span>
        <span>•</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Bet:
          <button onClick={decBet} disabled={spinning || betMinor <= 100}>−</button>
          <strong>{fmt(betMinor)}</strong>
          <button onClick={incBet} disabled={spinning || betMinor >= balance}>+</button>
        </span>
        {message && (
          <>
            <span>•</span>
            <span>{message}</span>
          </>
        )}
        <button onClick={() => setShowPaytable(true)} style={{ marginLeft: 4 }}>
          Paytable
        </button>
        <button onClick={resetSession} style={{ marginLeft: 4 }}>
          Reset
        </button>
      </div>

      {/* Spin history (compact, bottom-right) */}
      <div
        style={{
          position: "fixed",
          right: 12,
          bottom: 100,
          maxWidth: 420,
          color: "#fff",
          fontFamily: "Inter, Arial, system-ui",
          fontSize: 12,
          opacity: 0.9,
          textAlign: "right",
        }}
      >
        {history.map((it, i) => (
          <div key={i}>{it.symbols.join(" | ")} — win:{fmt(it.win)} bet:{fmt(it.bet)}</div>
        ))}
      </div>

      {/* Centered SPIN button (uses svg skin) */}
      <button
        onClick={doSpin}
        disabled={spinning || betMinor > balance}
        style={{
          position: "fixed",
          left: "50%",
          bottom: 24,
          transform: "translateX(-50%)",
          width: 160,
          height: 60,
          background: `url(${spinUrl}) center / contain no-repeat`,
          border: "none",
          outline: "none",
          cursor: spinning || betMinor > balance ? "not-allowed" : "pointer",
          color: "transparent",
          opacity: spinning || betMinor > balance ? 0.7 : 1,
          transition: "transform 120ms ease",
        }}
        aria-label="Spin"
        title="Spin"
        onMouseDown={(e) => (e.currentTarget.style.transform = "translateX(-50%) scale(0.98)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "translateX(-50%)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "translateX(-50%)")}
      >
        SPIN
      </button>

      {showPaytable && <Paytable onClose={() => setShowPaytable(false)} />}
    </div>
  );
}
