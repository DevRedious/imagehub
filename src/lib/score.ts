/** Score qualité des assets d'un projet (0-100). */
export function qualityScore(
  totalBytes: number,
  heavyBytes: number,
  heavyCount: number,
  unusedCount: number,
): number {
  if (totalBytes === 0) return 100;
  let score = 100;
  score -= 60 * Math.min(1, heavyBytes / totalBytes); // part du poids non optimisé
  score -= Math.min(20, unusedCount * 2); // assets morts
  score -= Math.min(15, heavyCount * 1.5); // nombre d'images lourdes
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreHexColor(score: number): string {
  return score >= 70 ? "#34d399" : score >= 40 ? "#fbbf24" : "#f87171";
}
