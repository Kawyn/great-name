export const DAY_DURATION_SECONDS = 30 * 60;
// Fixed dawn reference keeps the requested evening phase continuous across restarts.
export const DAY_CYCLE_EPOCH_MS = 1793581013566;

export function dayCycle(timeMs) {
    if (!Number.isFinite(timeMs) || timeMs < 0)
        throw new Error('Invalid authoritative world time.');
    const durationMs = DAY_DURATION_SECONDS * 1000;
    const elapsed = timeMs - DAY_CYCLE_EPOCH_MS;
    return {
        phase: ((elapsed % durationMs) + durationMs) % durationMs / durationMs,
        duration: DAY_DURATION_SECONDS
    };
}
