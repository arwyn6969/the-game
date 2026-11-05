# F1 local companion handoff

Owner: this Codex chat, 5 November 2026. Branch `codex/followers-local` in the reused
clean `a01-replay/` checkout. Fetched main `49cf76f`; explicit unmerged dependency
and feature base: PR #71 at `2ee631fa62ca9ecbba9aab4453d7bfd7c3b69399`.
Implementation head: `40c67dc7c2699a295698aacac0b22283625bddeb`.
`product/` and `codex/a01-qualify` are preserved. No remote action is authorized.

F1 is implemented locally, with the deterministic controller first and coordinated
additive save/UI/simulation integration afterwards. One local movement grant,
validated exact-context attention, truthful bounded journal, immediate manual
control, explicit Resume and save/recovery suspension are qualified.

[Consolidated evidence](../review/followers-local-2026-11-05/README.md) contains
all checks, screenshots, boundaries, source identity and remaining human-playtest
limits. [Proposed PR](../review/followers-local-2026-11-05/proposed-pr.md).

Next: review the bounded feature diff against `2ee631f`, integrate the #71
dependency under its own approval, and conduct a short human comprehension and
repeat-visit playtest. Upload, merge, publication, live inference and F2–F4 remain
outside this packet. Remote CI must qualify any future uploaded integration head.
