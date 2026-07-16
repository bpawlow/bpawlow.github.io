function clampProbability(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Selects a half-point line whose simulated over probability is closest to
 * 50%. The preferred quantile only breaks ties between equally balanced
 * discrete lines; it cannot force a materially unbalanced market.
 */
export function balancedHalfLine(values: ArrayLike<number>, preferredQuantile = 0.5): number {
  if (!values.length) return 0.5;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  const sorted: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
    sorted.push(value);
  }
  sorted.sort((left, right) => left - right);
  const preferredValue = sorted[Math.min(sorted.length - 1, Math.floor(clampProbability(preferredQuantile) * (sorted.length - 1)))];
  const preferredLine = Math.floor(preferredValue) + 0.5;

  let bestLine = Math.floor(minimum) + 0.5;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestTieDistance = Number.POSITIVE_INFINITY;
  for (let line = Math.floor(minimum) + 0.5; line <= Math.floor(maximum) - 0.5; line += 1) {
    let over = 0;
    for (let index = 0; index < values.length; index += 1) {
      if (Number(values[index]) > line) over += 1;
    }
    const distance = Math.abs(over / values.length - 0.5);
    const tieDistance = Math.abs(line - preferredLine);
    if (distance < bestDistance || (distance === bestDistance && tieDistance < bestTieDistance)) {
      bestLine = line;
      bestDistance = distance;
      bestTieDistance = tieDistance;
    }
  }
  return bestLine;
}
