# Automatic library meeting interface

24 October 2026. UI lane on `codex/library-auto-meeting-20261024`, based on `origin/main` `6f890add7968002a59aee3ebd506f7f6129479cd`. This lane changes only `src/components/town/DiscussionPanel.tsx` and this handoff. TownApp scheduling, core rules, production configuration and release evidence belong to the parent integration.

## Entry and controls

Open **Town life → Library meeting**. A new proposal has a labelled **Proposed facilitator** select, defaulting to Arwyn. It derives the supported Arwyn/Northern IDs from `NPC_IDS` and displays their current town names. Player and unsupported residents are excluded. **Propose another meeting** restores the Arwyn default. Selection proposes a facilitator; it does not force acceptance, participation or speech. Existing meetings show their saved proposed facilitator.

The existing decision area offers **Start automatic meeting** or **Stop automatic meeting**. Start is allowed for a paused meeting when meetings and AI actions are enabled, transport is idle and the displayed 16-decision/6-statement bounds are not reached. The parent start handler resumes a paused meeting. Stop remains available while transport is busy or AI becomes unavailable. **Request next AI decision** remains visible and is disabled while automatic mode runs; its existing paused/busy/unavailable guards remain.

Short guidance explains that one start runs resident AI decisions at the free service's pace while the tab is visible, that residents choose freely, and that errors, limits or no ready decision stop the run without local substitute dialogue. The panel does not implement timers or dispatch AI itself. The parent supplies accurate running/waiting/stopped feedback through the existing status note.

Listening, leaving, public joins, player turn commands, transcript following, player drafts and the collapsed composer retain their existing controls. The select reuses the existing full-width, 44-pixel field styling; buttons use the existing wrapping action row.

## Integration contract

`DiscussionControls` now requires:

```ts
autoRunning: boolean;
onAutoStart: () => void;
onAutoStop: () => void;
onCreate: (topic: string, facilitator: "northern" | "arwyn") => void;
```

`DiscussionFacilitator` exports that supported union. TownApp must accept and forward the second `onCreate` argument to `createLibraryDiscussion`; TypeScript also accepts a one-argument callback, which would ignore the choice. `autoRunning` is runtime state supplied by TownApp, not a saved meeting property or an attendance instruction. Rendering the panel, selecting a facilitator and proposing a topic do not start the automatic loop.

## Validation and remaining acceptance

Node 24 changed-file ESLint, Prettier checks and `git diff --check` pass. Initial full typecheck reported only TownApp's expected missing `autoRunning`, `onAutoStart` and `onAutoStop` fields while parent integration was pending. No browser, model/provider call, deployment or save mutation was performed by this lane. Parent integration must run the combined typecheck and synthetic desktop/phone journeys at 1280×800 and 390×844, including paused Start, busy Stop, manual-step exclusion, facilitator forwarding, and retained listening/draft controls.
