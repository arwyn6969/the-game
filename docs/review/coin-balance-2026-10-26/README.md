# Explicit player coin balances — 26 October 2026

[PR #45](https://github.com/arwyn6969/the-game/pull/45) is refreshed onto main
`4a5ae77d531b984320203daa86449c168bd0fe15`, preserving the current AI recovery,
meetings, manuscript, interface and hosting features. Runtime merge `39d048f`
changes only the original player balance copy: “4 coins”, “1 coin”, and the same
unit in the player card and journal. Money, ledger rules and saves are unchanged.

Current typecheck, lint and the normal build pass with no database credentials
and migration skipped. The inherited unused auth-directive warning remains.
The full application run and current-head Verify gate remain pending here.

[Browser results](browser-results.json) pass on desktop 1280×800 and phone
390×844. All three surfaces correctly show 0 coins, 1 coin, 4 coins and 120 coins,
fit the viewport and retain the actual amount after reload. Normal keyboard or
touch movement, pause, local dialogue and synthetic town download/import also
pass, with no JavaScript errors or horizontal page overflow. Screenshots were
inspected. These are disposable local contexts, with no existing browser state,
authenticated account or real provider call. Physical-device acceptance is not
claimed.

The original mismatched financial fixture was rejected by the save validator.
The corrected fresh-town fixtures have no prior ledger to contradict; import
initializes their declared opening balances normally. Product validation is
unchanged.

![Phone balance](phone-4-coins.png)

![Singular phone balance](phone-1-coins.png)
