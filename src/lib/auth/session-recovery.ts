import { authClient, authEnabled } from "./client";

/** Check the current server session without replaying any game or AI action. */
export async function checkGameSession(): Promise<boolean> {
  if (!authEnabled) return true;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      authClient.getSession(
        { query: { disableCookieCache: true } },
        { cache: "no-store", signal: controller.signal },
      ),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new DOMException("Session check timed out", "TimeoutError"));
          controller.abort();
        }, 8_000);
      }),
    ]);
    if (result.error) throw new Error("Your session could not be checked.");
    return Boolean(result.data?.session && result.data.user);
  } finally {
    clearTimeout(timeout);
  }
}
