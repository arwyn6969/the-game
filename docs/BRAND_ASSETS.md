# Public brand-tooling contract

The committed scripts work in an ordinary checkout. Private `.grok/skills/og`
instructions and builder workspace files are optional and are not test fixtures.
This reference documents the public commands that the repository tests exercise.

## Background brand work

The pending marker is `.grok/og-pending` relative to the selected workspace root
(the builder's default path is `/workspace/.grok/og-pending`). It demotes warnings
while an independently started brand task runs. A marker expires after 10 minutes
so interrupted work cannot permanently hide missing assets.

Where the builder provides background brand tasks, never wait_tasks or
get_task_output for them. The code lane continues independently and checks the
files available at verification time. The marker is not proof that assets exist.

## Verify files

Run the public gate against the project's actual root:

```sh
node scripts/brand-check.mjs --game --root /workspace/the-game
```

Games need a custom share card, `type: "x:game"` and `card: "custom"` in
`src/lib/og/site.json`, and the X banner. Image limits remain 600 KB. The CLI
ignores the pending marker when checking its own output. A utility can explicitly
use `--placeholder-ok`; that flag cannot excuse a missing game card.

## Atomic handover

Stage outside `public/`, on the same filesystem as the destination. Relative
paths resolve from the script's project root. These commands preserve atomic
rename semantics; they do not copy through a temporary file inside public output.

```sh
node scripts/write-atomic.mjs /workspace/the-game/.grok/og.jpg.tmp public/og.jpg
node scripts/write-atomic.mjs /workspace/the-game/.grok/x-banner.jpg.tmp public/x-banner.jpg
node scripts/write-atomic.mjs /workspace/the-game/.grok/site.json.tmp src/lib/og/site.json
```

Do not commit private builder files or credentials. Public PWA assets are part
of the application and must be available in a clean checkout and deployment.
