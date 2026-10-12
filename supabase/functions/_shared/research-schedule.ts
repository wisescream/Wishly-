const FIVE_MINUTES = 5 * 60 * 1000;
const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Exponential provider retry delay, capped at the normal six-hour cadence. */
export function getResearchRetryDelayMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  return Math.min(SIX_HOURS, FIVE_MINUTES * (2 ** Math.min(safeAttempt - 1, 7)));
}
