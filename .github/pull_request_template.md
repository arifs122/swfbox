## What changed

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- The archive/workflow problem this solves. -->

## Checklist

- [ ] `npm test` passes locally.
- [ ] New parser/scan/server behaviour has a test using a synthetic SWF (no downloaded fixtures).
- [ ] Runtime code uses Node built-ins only; `dependencies` and `devDependencies` are still empty.
- [ ] No new external references in generated HTML (except the documented Ruffle build).
- [ ] Malformed input still produces a clear message, not a stack trace.
- [ ] User-facing changes are added to `CHANGELOG.md`.
- [ ] `npm run demo` was run if parser output changed, and the result is committed.
- [ ] I did not add proprietary SWF files, screenshots of private archives, or a vendored Ruffle build.

## Verification

<!-- Paste the commands you ran and the relevant output. -->

```bash
npm test
node bin/swfbox.js docs/demo/swfs -o /tmp/swfbox.html --no-color
```

## Screenshots (optional)

<!-- UI changes only. Use the synthetic demo archive, never private content. -->
