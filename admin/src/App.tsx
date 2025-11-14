import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
} from "react";
import "./App.css";

type Sym = "Seven" | "Bar" | "Bell" | "Cherry" | "Lemon";
type Config = {
  startBalanceMinor: number;
  reels: Sym[][];
  pay3: Record<Sym, number>;
  anyTwoSevensMult: number;
  anyTwoCherriesMult: number;
  singleCherryMult: number;
  minBetMinor: number;
  allowOverBalance: boolean;
};

const SERVER = import.meta.env.VITE_API_URL || "http://localhost:3001";
const API = `${SERVER}/api/v1/admin`;
const TOKEN = import.meta.env.VITE_ADMIN_TOKEN || "";
const ALLOWED: Sym[] = ["Seven", "Bar", "Bell", "Cherry", "Lemon"];

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const shallowEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");

/* ========= Live math (theoretical) ========= */
function probsForReel(reel: Sym[]) {
  const total = reel.length || 1; // guard (should never be 0 due to validation)
  const p: Record<Sym, number> = { Seven: 0, Bar: 0, Bell: 0, Cherry: 0, Lemon: 0 };
  for (const s of reel) p[s]++;
  (Object.keys(p) as Sym[]).forEach((k) => (p[k] = p[k] / total));
  return p;
}
function payoutMult(a: Sym, b: Sym, c: Sym, cfg: Config) {
  if (a === b && b === c) return cfg.pay3[a];
  const z = (a === "Seven" ? 1 : 0) + (b === "Seven" ? 1 : 0) + (c === "Seven" ? 1 : 0);
  const ch = (a === "Cherry" ? 1 : 0) + (b === "Cherry" ? 1 : 0) + (c === "Cherry" ? 1 : 0);
  if (z === 2) return cfg.anyTwoSevensMult;
  if (ch === 2) return cfg.anyTwoCherriesMult;
  if (ch >= 1) return cfg.singleCherryMult;
  return 0;
}
function calcStats(cfg: Config) {
  const P = cfg.reels.map(probsForReel) as Record<Sym, number>[];
  let E = 0,
    hit = 0,
    p777 = 0,
    pCherry3 = 0,
    p2Seven = 0,
    p2Cherry = 0,
    pSingleCherry = 0;

  for (const a of ALLOWED)
    for (const b of ALLOWED)
      for (const c of ALLOWED) {
        const p = P[0][a] * P[1][b] * P[2][c];
        const m = payoutMult(a, b, c, cfg);
        E += p * m;
        if (m > 0) hit += p;
        if (a === b && b === c && a === "Seven") p777 += p;
        if (a === b && b === c && a === "Cherry") pCherry3 += p;

        const cntZ = (a === "Seven" ? 1 : 0) + (b === "Seven" ? 1 : 0) + (c === "Seven" ? 1 : 0);
        const cntC = (a === "Cherry" ? 1 : 0) + (b === "Cherry" ? 1 : 0) + (c === "Cherry" ? 1 : 0);
        if (cntZ === 2) p2Seven += p;
        if (cntC === 2) p2Cherry += p;
        if (cntC >= 1 && !(cntC === 2 || (a === b && b === c))) pSingleCherry += p;
      }

  return {
    rtp: E * 100,
    hit: hit * 100,
    p777: p777 * 100,
    pCherry3: pCherry3 * 100,
    p2Seven: p2Seven * 100,
    p2Cherry: p2Cherry * 100,
    pSingleCherry: pSingleCherry * 100,
  };
}

export default function App() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [base, setBase] = useState<Config | null>(null); // snapshot for dirty-check
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      "x-admin-token": TOKEN,
    }),
    []
  );

  const dirty = !!cfg && !!base && !shallowEqual(cfg, base);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    setErrors([]);
    try {
      const res = await fetch(`${API}/config`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Config;
      setCfg(json);
      setBase(clone(json));
    } catch (e: any) {
      setMsg(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [headers]);

  // Save with a guard (prevents double submit)
  const savingRef = useRef(false);
  const save = useCallback(
    async (next: Config) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setLoading(true);
      setMsg("");
      try {
        const res = await fetch(`${API}/config`, {
          method: "PUT",
          headers,
          body: JSON.stringify(next),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
        setCfg(json.config);
        setBase(clone(json.config));
        setMsg("Saved ✓");
      } catch (e: any) {
        setMsg(e.message || String(e));
      } finally {
        setLoading(false);
        savingRef.current = false;
      }
    },
    [headers]
  );

  const resetToDefaults = useCallback(async () => {
    if (!confirm("Reset to defaults?")) return;
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`${API}/config/reset`, { method: "POST", headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
      setCfg(json.config);
      setBase(clone(json.config));
      setMsg("Reset ✓");
    } catch (e: any) {
      setMsg(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [headers]);

  // Stable Ctrl/⌘+S — attach once; use refs to read latest state
  const cfgRef = useRef<Config | null>(null);
  const dirtyRef = useRef(false);
  const errsRef = useRef<string[]>([]);
  const keyHandlerInstalled = useRef(false);

  useEffect(() => {
    cfgRef.current = cfg;
    dirtyRef.current = dirty;
    errsRef.current = errors;
  }, [cfg, dirty, errors]);

  useEffect(() => {
    if (keyHandlerInstalled.current) return;
    keyHandlerInstalled.current = true;

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "s" || e.key === "S")) {
        const tag = (document.activeElement as HTMLElement | null)?.tagName;
        if (tag && ["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

        e.preventDefault();
        const C = cfgRef.current;
        if (C && dirtyRef.current && (errsRef.current?.length ?? 0) === 0) {
          save(C);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      keyHandlerInstalled.current = false;
    };
  }, [save]);

  useEffect(() => {
    load();
  }, [load]);

  // Validation
  useEffect(() => {
    if (!cfg) return;
    const e: string[] = [];
    if (!Number.isFinite(cfg.startBalanceMinor) || cfg.startBalanceMinor < 0)
      e.push("Start Balance must be ≥ 0.");
    if (!Number.isFinite(cfg.minBetMinor) || cfg.minBetMinor <= 0)
      e.push("Min Bet must be > 0.");
    (["anyTwoSevensMult", "anyTwoCherriesMult", "singleCherryMult"] as const).forEach((k) => {
      if (!Number.isFinite(cfg[k]) || cfg[k] < 0) e.push(`${k} must be ≥ 0.`);
    });
    (["Seven", "Bar", "Bell", "Cherry", "Lemon"] as Sym[]).forEach((sym) => {
      if (!Number.isFinite(cfg.pay3[sym]) || cfg.pay3[sym] < 0) e.push(`pay3.${sym} must be ≥ 0.`);
    });
    if (!Array.isArray(cfg.reels) || cfg.reels.length !== 3) {
      e.push("Reels must have exactly 3 arrays.");
    } else {
      cfg.reels.forEach((r, i) => {
        if (!Array.isArray(r) || r.length === 0) e.push(`Reel ${i + 1} must not be empty.`);
        r.forEach((s, j) => {
          if (!ALLOWED.includes(s)) e.push(`Reel ${i + 1} invalid at #${j + 1}: ${s}`);
        });
      });
    }
    setErrors(e);
  }, [cfg]);

  // Import / Export (hooks declared before any early return)
  const fileRef = useRef<HTMLInputElement>(null);

  const exportCfgFile = useCallback(() => {
    if (!cfg) return;
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = `game-config-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
    setMsg("Exported ✓");
  }, [cfg]);

  const onImportClick = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onImportFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    try {
      if (!f) return;
      const text = await f.text();
      const parsed = JSON.parse(text) as Partial<Config>;
      if (!parsed || !Array.isArray(parsed.reels) || parsed.reels.length !== 3) {
        throw new Error("Invalid config JSON shape.");
      }
      setCfg(parsed as Config);
      setMsg("Imported (not saved yet) ✓");
    } catch (err: any) {
      setMsg(`Import error: ${err?.message || String(err)}`);
    } finally {
      e.target.value = "";
    }
  }, []);

  // Live math (safe while cfg is null)
  const stats = useMemo(() => (cfg ? calcStats(cfg) : null), [cfg]);

  // Simple server ping
  const pingHealth = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER}/api/v1/health`);
      const j = await r.json();
      setMsg(j?.ok ? `Health OK • uptime ${j.uptimeSec}s` : "Health failed");
    } catch {
      setMsg("Health failed");
    }
  }, []);

  if (!cfg) {
    return (
      <div className="page">
        <div className="loading-card">Loading… {loading ? "⏳" : msg}</div>
      </div>
    );
  }

  const canSave = dirty && errors.length === 0 && !loading;

  // Helpers
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setCfg({ ...cfg, [k]: v });
  const setPay3 = (sym: Sym, v: number) => setCfg({ ...cfg, pay3: { ...cfg.pay3, [sym]: v } });
  const setReelFromText = (i: number, text: string) => {
    const tokens = text
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean) as Sym[];
    setCfg({ ...cfg, reels: cfg.reels.map((r, idx) => (idx === i ? tokens : r)) as Sym[][] });
  };
  const normalizeReelCase = (i: number) => {
    const norm = cfg.reels[i].map((x) => {
      const t = x.toLowerCase();
      if (t.startsWith("sev")) return "Seven";
      if (t.startsWith("bar")) return "Bar";
      if (t.startsWith("bel")) return "Bell";
      if (t.startsWith("che")) return "Cherry";
      if (t.startsWith("lem")) return "Lemon";
      return x;
    }) as Sym[];
    setCfg({ ...cfg, reels: cfg.reels.map((r, idx) => (idx === i ? norm : r)) as Sym[][] });
  };

  return (
    <div className="page">
      <div className="shell">
        {/* Header / Actions */}
        <div className="top">
          <div className="left">
            <div className="brand">777 Admin</div>
            {dirty && <span className="badge">Unsaved changes</span>}
            {msg && <span className="hint">{msg}</span>}
          </div>
          <div className="right">
            <button className="btn" onClick={pingHealth}>Health</button>
            <button className="btn" onClick={load} disabled={loading}>Reload</button>
            <button className="btn" onClick={resetToDefaults} disabled={loading}>Reset</button>

            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={onImportFile}
            />
            <button className="btn" onClick={onImportClick} disabled={loading}>Import</button>
            <button className="btn" onClick={exportCfgFile} disabled={!cfg}>Export</button>

            <button className="btn btn-primary" onClick={() => save(cfg)} disabled={!canSave}>
              Save
            </button>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="card card-error">
            <div className="card-title">Fix these before saving</div>
            <ul className="list">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Main grid */}
        <div className="grid">
          {/* Economy */}
          <div className="card">
            <div className="card-title">Economy</div>
            <div className="card-sub">Money & bet rules</div>
            <div className="row-2">
              <label className="field">
                <span className="label">Start Balance (minor)</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={cfg.startBalanceMinor}
                  onChange={(e) => set("startBalanceMinor", Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span className="label">Min Bet (minor)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={cfg.minBetMinor}
                  onChange={(e) => set("minBetMinor", Number(e.target.value))}
                />
              </label>
            </div>

            <label className="switch">
              <input
                type="checkbox"
                checked={cfg.allowOverBalance}
                onChange={(e) => set("allowOverBalance", e.target.checked)}
              />
              <span className="slider" />
              <span className="switch-text">Allow bet over balance (not recommended)</span>
            </label>
          </div>

          {/* 3 of a kind */}
          <div className="card">
            <div className="card-title">3 of a Kind (pay3)</div>
            <div className="card-sub">Multipliers for exact triple matches</div>
            <div className="pay3">
              {ALLOWED.map((sym) => (
                <div key={sym} className="pay3-row">
                  <div className="pay3-label">{sym}</div>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={cfg.pay3[sym]}
                    onChange={(e) => setPay3(sym, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Extra rules */}
          <div className="card">
            <div className="card-title">Extra Rules</div>
            <div className="card-sub">Applied when not a 3-of-a-kind</div>
            <div className="row-3">
              <label className="field">
                <span className="label">Any 2 Sevens Mult</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={cfg.anyTwoSevensMult}
                  onChange={(e) => set("anyTwoSevensMult", Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span className="label">Any 2 Cherries Mult</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={cfg.anyTwoCherriesMult}
                  onChange={(e) => set("anyTwoCherriesMult", Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span className="label">Single Cherry Mult</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={cfg.singleCherryMult}
                  onChange={(e) => set("singleCherryMult", Number(e.target.value))}
                />
              </label>
            </div>
          </div>

          {/* Reels */}
          <div className="card">
            <div className="card-title">Reels</div>
            <div className="card-sub">Comma or space separated; Normalize fixes casing/typos</div>
            <div className="reels">
              {cfg.reels.map((r, i) => (
                <div key={i} className="reel-block">
                  <div className="reel-head">
                    <strong>Reel {i + 1}</strong>
                    <button className="btn btn-sm" onClick={() => normalizeReelCase(i)}>
                      Normalize
                    </button>
                  </div>
                  <input
                    className="input mono"
                    type="text"
                    value={r.join(",")}
                    onChange={(e) => setReelFromText(i, e.target.value)}
                    placeholder="Seven,Seven,Bar,Bell,Cherry,Lemon"
                  />
                </div>
              ))}
              <div className="muted">
                Allowed: <code>Seven</code>, <code>Bar</code>, <code>Bell</code>, <code>Cherry</code>,{" "}
                <code>Lemon</code>
              </div>
            </div>
          </div>

          {/* Live math card */}
          <div className="card">
            <div className="card-title">Live Math</div>
            <div className="card-sub">Theoretical values from current config</div>
            <div className="row-3">
              <label className="field">
                <span className="label">RTP (%)</span>
                <div>{stats ? fmt(stats.rtp) : "—"}</div>
              </label>
              <label className="field">
                <span className="label">Hit rate (%)</span>
                <div>{stats ? fmt(stats.hit) : "—"}</div>
              </label>
              <label className="field">
                <span className="label">Triple Seven (%)</span>
                <div>{stats ? fmt(stats.p777) : "—"}</div>
              </label>
            </div>
            <div className="row-3" style={{ marginTop: 10 }}>
              <label className="field">
                <span className="label">Triple Cherry (%)</span>
                <div>{stats ? fmt(stats.pCherry3) : "—"}</div>
              </label>
              <label className="field">
                <span className="label">Any 2 Sevens (%)</span>
                <div>{stats ? fmt(stats.p2Seven) : "—"}</div>
              </label>
              <label className="field">
                <span className="label">Any 2 Cherries (%)</span>
                <div>{stats ? fmt(stats.p2Cherry) : "—"}</div>
              </label>
            </div>
          </div>
        </div>

        <div className="footer-hint">
          Press <kbd>Ctrl/⌘ + S</kbd> to Save
        </div>
      </div>
    </div>
  );
}
