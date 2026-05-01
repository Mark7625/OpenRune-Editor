export const OSRS_EXPERIENCE_TABLE: readonly number[] = (() => {
  const out: number[] = [];
  let xp = 0;
  for (let level = 1; level <= 99; level++) {
    out.push((xp / 4) | 0);
    const difference = Math.trunc(level + 300 * Math.pow(2, level / 7));
    xp += difference;
  }
  return out;
})();

export function experienceForMaxLevel(level: number): number {
  if (level < 1) return OSRS_EXPERIENCE_TABLE[0]!;
  if (level > 99) return OSRS_EXPERIENCE_TABLE[98]!;
  return OSRS_EXPERIENCE_TABLE[level - 1]!;
}
