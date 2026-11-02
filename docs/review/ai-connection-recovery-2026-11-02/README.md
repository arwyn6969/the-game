# Safari AI connection recovery — 2 November 2026

The live Safari game displayed “The sign-in check could not finish” while the
status strip still showed an earlier accepted AI response. Safari's console
contained five failed authoritative session checks and two failed availability
checks, all reporting “The internet connection appears to be offline.”
These errors show a browser connection interruption; they do not establish a
provider inference timeout or an expired account session.

The public, unauthenticated session endpoint subsequently returned HTTP 200 in
0.46 seconds. Reloading the existing Safari tab restored “AI ready,” retained the
town and its Arwyn exchange, and removed the old error. No diagnostic model reply
was requested. “AI ready” confirms configuration/availability, not that a new
authenticated model reply has succeeded.

The interface rendered its retry button only while `aiWarning` was present.
Availability can recover independently while a failed session `connectionNote`
remains, removing the only retry control. Keep the connection-check explanation
and button available whenever the connection message is open. Preserve the
existing sign-in condition, dismissal behavior, draft and no-replay semantics.

The browser regression simulates an unavailable service, a failed session check,
then an online event that restores availability. It verifies that the remaining
session error can be checked successfully without reloading, changing the draft
or generating a model request. It also exercises dismissal, stale results,
explicit resend, save recovery, movement, import/export and sign-in draft return.

Validation on Node 24 with `DATABASE_URL` unset:

- Typecheck, lint, town tests, full tests and build pass. Lint retains the existing
  unused-disable warning in `src/lib/auth/use-current-user.ts` (zero errors).
- `diagnose:town` completes; its observations are not a release verdict.
- [Synthetic browser receipt](browser-results.json): 1280×800 and 390×844, zero
  unexpected errors/network leaks and zero live provider calls. Both recovery
  journeys retain the retry button after availability returns.
- [Desktop](desktop-session-retry-after-online.png) and
  [phone](phone-session-retry-after-online.png) captures preserve the composer.

The first browser run hit Vite's cold dependency-cache error; restarting after
optimization resolved it. The initial full test run hit three sandbox loopback
permission failures; the permitted loopback rerun passes. A first version of
the new browser assertion expected “AI ready” after earlier successful replies;
the correct assertion waits for the availability warning to disappear, since
the game appropriately shows “AI responded” in that case.

No deployment, configuration/credential/budget change, live database mutation or
diagnostic inference was performed. A fresh authenticated provider reply and
physical-device acceptance remain untested. The user's browser save is not in
the committed evidence.
