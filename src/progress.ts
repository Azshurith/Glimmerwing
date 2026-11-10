export interface Progress {
  wins: number;
  bestChain: number;
  fevers: number;
  flawless: number;
  unlocked: string[];
}

const KEY = 'glimmerwing-progress-v1';
const fresh = (): Progress => ({ wins: 0, bestChain: 0, fevers: 0, flawless: 0, unlocked: [] });

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch { /* storage unavailable: play with fresh progress */ }
  return fresh();
}

export function saveProgress(p: Progress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function resetProgress(): Progress {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return fresh();
}
