# Dismiss recorded exchange captions

The recorded exchange caption covered the town without a close control. Escape only closed the larger panels, so the caption remained visible or reappeared.

The caption now has a visible, touch-sized Close button. Close and Escape dismiss the current exchange for this mounted game session; a different exchange can appear. Town life still provides access to the history. Reload resets the temporary dismissal. No saved town fields change.

Branch: `codex/dismiss-exchange-caption`, based on `940cd70` (the current character social release evidence checkout). The older `product/` checkout and its uncommitted quality-review changes were left untouched.

Validation on Node 24.19.0:

- Typecheck and lint of the two changed TSX files passed; Prettier and `git diff --check` passed.
- Town suite: 155 passed. Full suite: 381 script + 55 app/auth tests passed.
- Town diagnostics completed.
- Full lint is blocked by existing downloaded/minified JS under ignored `artifacts/social-release/` (574 errors, three warnings); these files were not edited.
- Actual Chrome checks at 1280×800 and 390×844 verified Close, Escape from a focused button, reload, and import of an isolated synthetic exchange through the native file picker. The phone Close button measured 44 CSS pixels high. Screenshots: `/private/tmp/caption-close-mobile.png` and `/private/tmp/caption-closed-mobile.png`.
- The broader movement/conversation/export journey and a production build were not rerun for this UI-only change. The hosted game was not published.

The current live version can hide the caption temporarily by selecting a resident portrait. It has no caption dismissal control. Automatic approval review denied opening the private Grok Build chat as outside this popup request; no private chat was inspected or messaged.
