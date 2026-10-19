/** The registry requires an account session, never the offline shared dev user. */
export class OwnerAuthenticationError extends Error {
  readonly status = 401;
  constructor() {
    super("Sign in to manage agent receiving addresses.");
    this.name = "OwnerAuthenticationError";
  }
}

export function assertRealOwnerUser(userId: unknown): string {
  if (
    typeof userId !== "string" ||
    !userId.length ||
    userId.length > 256 ||
    userId.trim() !== userId ||
    userId === "dev-user" ||
    [...userId].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw new OwnerAuthenticationError();
  return userId;
}

/** Only Better Auth's verified session can establish the registration owner. */
export async function resolveOwnerUser(bearerToken?: string): Promise<string> {
  const { getSessionUser } = await import("../auth/verify.server");
  // Receiving drafts require current account authority after server revocation.
  const user = await getSessionUser(bearerToken, { disableCookieCache: true });
  return assertRealOwnerUser(user?.id);
}
