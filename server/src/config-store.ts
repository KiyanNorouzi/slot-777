import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GameConfig, Sym } from './game-config';

type ConfigShape = typeof GameConfig;

const DATA_DIR = join(process.cwd(), 'data');
const FILE_PATH = join(DATA_DIR, 'runtime-config.json');
const SYMBOLS: Sym[] = ['Seven', 'Bar', 'Bell', 'Cherry', 'Lemon'];

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function validateConfig(cfg: any): asserts cfg is ConfigShape {
  if (typeof cfg !== 'object' || !cfg) throw new Error('Config must be an object');

  // startBalanceMinor
  if (!Number.isFinite(cfg.startBalanceMinor) || cfg.startBalanceMinor < 0)
    throw new Error('startBalanceMinor must be a non-negative number');

  // reels
  if (!Array.isArray(cfg.reels) || cfg.reels.length !== 3)
    throw new Error('reels must be an array of 3 arrays');
  for (let i = 0; i < 3; i++) {
    const r = cfg.reels[i];
    if (!Array.isArray(r) || r.length === 0) throw new Error(`reel ${i} must be a non-empty array`);
    for (const s of r) {
      if (!SYMBOLS.includes(s)) throw new Error(`Invalid symbol "${s}" in reel ${i}`);
    }
  }

  // pay3
  if (typeof cfg.pay3 !== 'object' || !cfg.pay3) throw new Error('pay3 missing');
  for (const sym of SYMBOLS) {
    const v = cfg.pay3[sym];
    if (!Number.isFinite(v) || v < 0) throw new Error(`pay3.${sym} must be >= 0`);
  }

  // multipliers
  for (const k of ['anyTwoSevensMult', 'anyTwoCherriesMult', 'singleCherryMult'] as const) {
    if (!Number.isFinite(cfg[k]) || cfg[k] < 0) throw new Error(`${k} must be >= 0`);
  }

  // bet rules
  if (!Number.isFinite(cfg.minBetMinor) || cfg.minBetMinor <= 0)
    throw new Error('minBetMinor must be > 0');
  if (typeof cfg.allowOverBalance !== 'boolean')
    throw new Error('allowOverBalance must be boolean');
}

function mergeDeep<T extends object>(base: T, partial: Partial<T>): T {
  const out: any = deepClone(base);
  for (const [k, v] of Object.entries(partial)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      (out as any)[k] = mergeDeep((out as any)[k] ?? {}, v as any);
    } else {
      (out as any)[k] = v;
    }
  }
  return out;
}

class ConfigStore {
  private current: ConfigShape = deepClone(GameConfig);

  constructor() {
    this.loadFromDisk();
  }

  get(): ConfigShape {
    return this.current;
  }

  set(partial: Partial<ConfigShape>): ConfigShape {
    const next = mergeDeep(this.current, partial);
    validateConfig(next);
    this.current = next;
    this.saveToDisk();
    return this.current;
  }

  reset(): ConfigShape {
    const next = deepClone(GameConfig);
    validateConfig(next);
    this.current = next;
    this.saveToDisk();
    return this.current;
  }

  private ensureDir() {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  }

  private saveToDisk() {
    this.ensureDir();
    writeFileSync(FILE_PATH, JSON.stringify(this.current, null, 2), 'utf8');
  }

  private loadFromDisk() {
    try {
      if (existsSync(FILE_PATH)) {
        const raw = readFileSync(FILE_PATH, 'utf8');
        const json = JSON.parse(raw);
        const merged = mergeDeep(GameConfig, json);
        validateConfig(merged);
        this.current = merged;
      } else {
        this.saveToDisk(); // write defaults
      }
    } catch (e) {
      // If bad file, fall back to defaults
      this.current = deepClone(GameConfig);
      this.saveToDisk();
    }
  }
}

export const Config = new ConfigStore();
