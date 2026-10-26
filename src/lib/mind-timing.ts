/** One action still transmits once; waiting longer never creates another attempt. */
export const ACTION_PROVIDER_TIMEOUT_MS = 30_000;
// Leave room for authentication and both accounting settlements around inference.
export const ACTION_CLIENT_TIMEOUT_MS = 45_000;

export function actionTimeoutMs(config: { actionTimeoutMs?: number }): number {
  return Math.min(ACTION_PROVIDER_TIMEOUT_MS, config.actionTimeoutMs ?? ACTION_PROVIDER_TIMEOUT_MS);
}
