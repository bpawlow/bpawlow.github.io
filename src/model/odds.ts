export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / Math.max(0.01, decimal - 1));
}

export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) return 0;
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function manualParlayPrice(decimalOdds: number[]): {
  fairProbability: number;
  offeredProbability: number;
  decimalOdds: number;
  americanOdds: number;
  sampleWins: number;
  eligibleSamples: number;
} {
  const decimal = decimalOdds.reduce((product, value) => product * value, 1);
  const fairProbability = decimal > 0 ? 1 / decimal : 0;
  return { fairProbability, offeredProbability: fairProbability, decimalOdds: decimal, americanOdds: decimalToAmerican(decimal), sampleWins: 0, eligibleSamples: 0 };
}

export function formatAmerican(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function offeredPrice(fairProbability: number, hold: number): {
  offeredProbability: number;
  decimalOdds: number;
  americanOdds: number;
} {
  const offeredProbability = clamp(fairProbability * (1 + hold), 0.015, 0.98);
  const decimalOdds = Math.min(1001, 1 / offeredProbability);
  return { offeredProbability, decimalOdds, americanOdds: decimalToAmerican(decimalOdds) };
}

export function money(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}
