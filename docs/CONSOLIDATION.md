# Source consolidation — 2 November 2026

The user authorized combining the current work and reducing fragmented open items. [CURRENT_STATUS.md](CURRENT_STATUS.md) is now the single source/deployment/queue index.

## Integrated inputs

| Input                            | Source                                               | Treatment                                                                                                               |
| -------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Player controls/library feedback | #61 `cd44d16`                                        | Merged as `f9468cf`                                                                                                     |
| Work choices/funding clarity     | #62 `44745f4`                                        | Merged as `9166bfa`; merge tree equals tested head                                                                      |
| A01 reliable meeting lifecycle   | #63 `46bbe82`                                        | Merged as `2df36a9`; merge tree equals tested head                                                                      |
| A02 opt-in café                  | Local `2255384`                                      | Original ancestry retained in consolidation; human control and quick-tap behaviour reconciled                           |
| Personal model choice            | #59 `022c6b2`                                        | Original ancestry retained; personal abort and newer cancellation feedback both preserved                               |
| Historical test/release receipts | #48/#50/#51/#53/#55 and four older evidence branches | Exact heads preserved by recovery tags and source manifest; current claims reconciled without replaying old status text |

The older #59 CI failure used a 150 ms deadline in a delayed-response test. Current main already contains the 2,000 ms test allowance for CPU contention while retaining the shorter legacy deadline and one-call/token assertions. Integration keeps that correction; it does not relax production deadlines.

The café browser harness used to toggle Choices after opening Together. Current controls already expand those terms, so the harness now uses the normal Review choices button and asserts the terms stay open before accepting. The old failing run remains in ignored local artifacts. Café browser coverage is added to Verify.

## Acceptance remains explicit

[#64](https://github.com/arwyn6969/the-game/issues/64) owns hosted/social/human/device release acceptance; [#65](https://github.com/arwyn6969/the-game/issues/65) owns the café's remaining mixed-play/control/human gates; [#66](https://github.com/arwyn6969/the-game/issues/66) owns actual personal-source compatibility. These are open requirements, not hidden failures marked complete by consolidation.

Source checks and the release boundary are recorded in the [verification receipt](review/consolidation-2026-11-02/README.md). No production operation or live inference is part of this source pass.

[Recovery manifest](review/consolidation-2026-11-02/source-manifest.json) · [branch policy](BRANCHES.md) · [historical consolidation](CONSOLIDATION_HISTORY_2026-11-02.md).
