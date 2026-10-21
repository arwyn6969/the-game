import { moveIntent } from "./authority.mjs";

// Captures observation/authority BEFORE a pretend slow inference request.
// Calling complete later must pass the authority's checks at commit time.
export function prepareSimulatedMove(authority, characterId, workerId, actionId, dx = 1, dy = 0) {
  const request = moveIntent(authority.snapshot(), characterId, actionId, dx, dy);
  return {
    request: structuredClone(request),
    complete: () => authority.submit({ kind: "worker", workerId }, request),
  };
}

// This is accelerated simulated server time, independent of all client views.
// intervalMs controls the demo's speed, never a production/billing clock.
export function startSimulatedClock(authority, { intervalMs = 10, onTick = () => {} } = {}) {
  const timer = setInterval(() => {
    try {
      const result = authority.tick();
      if (!result.ok) {
        clearInterval(timer);
        onTick(result);
        return;
      }
      onTick(result);
    } catch (error) {
      clearInterval(timer);
      onTick({ ok: false, code: "CLOCK_STOPPED", error: error.message });
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
