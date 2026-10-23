# Town interface styles

23 October 2026. Three arrangements of the actual game interface, using the approved cream speech-window direction. The user has authorised publishing these styles to the existing game, with Hobbs Hearth as the default.

## Try it

Start a local development server with Node 24 using the normal app-environment wrapper, then open the ordinary game URL. Hobbs Hearth is the default. A compact Interface menu in the existing status row offers Plaza Cream, Hobbs Hearth, Library Ink and Original; it reserves no separate toolbar row during play. A valid `?skin=plaza-cream` (or another skin ID) overrides the saved appearance preference; otherwise the saved preference is respected before falling back to Hearth. Old `uiPreview=1` links remain usable but the parameter is no longer required.

Use a separate localhost origin and a disposable town for comparison. The `qa` parameter alone does not isolate storage. A portable backup can be imported through the existing confirmation flow; do not use a personal save for automated QA.

| Interface    | Arrangement and feel                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Plaza Cream  | Compact header, resident ribbon, floating cream conversation window, bottom pixel-icon action dock |
| Hobbs Hearth | Vertical resident sidebar, larger centered paper window, horizontal everyday tools                 |
| Library Ink  | Vertical tool sidebar, resident ribbon, edge-docked reading panel with stronger typographic rules  |
| Original     | Original arrangement and colors, with the shared reply-composer improvements below                 |

At phone widths the candidates share a practical reading-sheet interaction. Their frames and styling differ; three unrelated phone navigation systems would make the comparison harder and add avoidable interaction risk.

## Interaction changes

The main tools use compact inline icons and text, with 40px desktop buttons and 44px touch targets. Narrow screens keep one horizontally scrolling row; Wallets and Stamps retain their full accessible names. The Library Ink rail is 9rem wide. In the measured Hearth preview the horizontal row shrank from about 90px to 52px at phone and medium widths, giving 37px back to the game.

The clock and pause/speed controls now share a compact presentation group. At medium widths they fit on one header line with the brand and money; below 560px, brand and money sit above a clock/control row. Pause keeps its accessible name and tooltip with an icon, while 1×, 4× and Hour stay written. Controls retain 44px touch targets and wrap when enlarged text needs more room. The existing clock and speed handlers are unchanged.

The conversation area now scrolls the complete work/project terms and resident notes with the history. The reply label, text field and Say it action stay together at the bottom. Choices still call the existing action handler, retain their full terms and remain separate from sending a message. Clock, resident access, money, tools, replay and portable backups remain available.

The comparison selector is portaled into the status row while its React ownership stays outside the town's focus/dismissal boundary. Native menu keyboard events stay with the selector so Escape does not dismiss an open conversation. It updates only a validated appearance ID and its own local preference. It neither remounts the game nor calls gameplay, save, provider or money handlers. The preference key is `the-game-ui-appearance-v1`; it is not part of the town save schema. A URL selection takes precedence for direct comparisons.

Sheets measure the real header boundary, including wrapping. A clamped fallback handles short viewports and text enlargement. Existing visual-viewport, safe-area and cramped-world protections are retained. A single main reading panel remains active; this build does not add draggable or simultaneous utility windows.

## Source assets

- `src/components/town/appearance/AppearanceScope.tsx`: stable comparison scope and selection control.
- `src/components/town/appearance/skins.ts`: appearance IDs, labels and optional preference lookup.
- `src/styles/game-ui/foundation.css`: readable paper panels, frames, text, tabs, choices, fields, captions, warnings, onboarding and recovery surfaces.
- `src/styles/game-ui/layouts.css`: three real desktop arrangements, responsive sheets, palettes and compact interface menu.
- `public/game/ui/retro-icons.svg`: thirteen original scalable pixel symbols; their IDs and provenance are documented beside the asset.
- `src/components/town/appearance/TownUiIcon.tsx`: decorative SVG wrapper respecting the hosting base path.

All dialogue, labels and action terms remain live text. Frames stretch with their content. Existing procedural resident portraits, sprites and town artwork are reused, including optional stamp appearance behavior. The richly detailed scenery and large illustrated heads in the concept images are separate future artwork, not assets silently substituted into this build.

## Baseline and validation

The isolated branch is `codex/ui-interface-lab`. The original comparison was based on `adb1f47` from the reviewed hosting/recovery work in PR #41. For the authorised release, PR #41 passed its current Verify check and was merged as `b8381df`; the UI branch incorporates that main baseline and retains the live AI recovery/draft behavior. The UI release does not change authentication, provider limits or town storage.

See `docs/handoffs/ui-interface-lab.md` for actual check results and remaining limits. Browser receipts and complete synthetic screenshots are under ignored `artifacts/ui-skins/`; the focused script is `scripts/skin-browser.mjs`.
