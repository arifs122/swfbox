# Contributing to swfbox

Thanks for helping old Flash archives stay usable. Please keep the project small, dependency-free and honest about what it does.

## Ground rules

- `swfbox` is a library and launcher, **not** an emulator. Ruffle does the playing. Do not add claims or code that pretend otherwise.
- Runtime code must use Node built-ins only. `dependencies` and `devDependencies` stay empty.
- ESM only (`"type": "module"`), Node.js 18+.
- Never crash on malformed input. Return a clear error record or message; no stack traces in user-facing output.
- Generated HTML gets no external references except the documented Ruffle build.
- Tests use `node:test` and `node:assert/strict`, and generate all SWF fixtures locally.

## Development

```bash
git clone https://github.com/arifs122/swfbox.git
cd swfbox
npm test
node bin/swfbox.js docs/demo/swfs -o /tmp/swfbox.html
node bin/swfbox.js serve docs/demo/swfs --open
```

There is no build step and nothing to install.

## Tests

Every change to the parser, scanner, renderer or server needs a test:

- Parser: add a synthetic file in `test-support/swf-builder.js` and assert the stable record shape. Include a broken variant for new edge cases.
- Scanner: cover nested paths, caps, unicode names and symlink behaviour where the platform allows it.
- HTML: assert escaping and self-containment, not pixel-perfect markup.
- Server: assert status codes, content types and traversal rejection.
- CLI: assert exit codes, JSON shape and absence of stack traces.

Run the full suite before opening a pull request:

```bash
npm test
```

Regenerate the demo if your parser changes its output:

```bash
npm run demo
```

The demo is deterministic; CI fails if `docs/demo/` changes after regeneration. Commit the result.

## Code style

- Match the surrounding style: two-space indent, double quotes, explicit `.js` extensions in relative imports.
- Keep modules focused and named after their job.
- Prefer small pure functions for parsing and formatting; keep I/O at the edges.
- Comments explain *why* (format quirks, security decisions), not *what* the next line does.
- Do not hard-code path separators. Use `node:path` and convert to forward slashes only at URL/display boundaries.
- Escape every string that came from the filesystem.

## Pull requests

- One logical change per PR, with a clear description.
- Include the commands you ran and their results.
- Update `CHANGELOG.md` under `Unreleased` for user-visible changes.
- Do not add screenshots or binary SWFs from proprietary archives.
- Do not bump the version; maintainers do that at release time.

## Reporting bugs

Use the issue template. Include:

- `swfbox --version`, Node version, OS.
- The exact command.
- The error message (never a full proprietary SWF; a minimal synthetic reproduction is ideal).
- If the problem is parsing, the file's signature (`FWS`/`CWS`/`ZWS`), size and the offsets involved.

Security issues should follow [SECURITY.md](SECURITY.md), not the public issue tracker.
