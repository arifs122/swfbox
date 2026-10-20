# Publishing swfbox

This is the maintainer checklist for getting `0.1.0` from a local checkout to a public repository, an optional GitHub release and an optional npm package. It assumes the GitHub owner is `arifs122` and the repository is `swfbox`.

Nothing here is run automatically. Do the steps in order.

## 1. Preflight

```bash
npm test
npm run demo
git diff --exit-code -- docs/demo
node bin/swfbox.js docs/demo/swfs -o /tmp/swfbox-check.html --no-color
node bin/swfbox.js inspect "docs/demo/swfs/Neon Bolt.swf" --no-color
```

- All tests green.
- Demo regeneration produces no diff.
- The generated page has no external URLs (the CI check also enforces this).
- `docs/screenshots/library.png`, `docs/screenshots/player.png` and `docs/screenshots/inspect.png` exist and match the README paths. The owner captures these manually; do not invent placeholder screenshots in the README.
- `package.json` still has empty `dependencies` and `devDependencies`, `"type": "module"`, `engines.node >= 18`, and the `swfbox` bin.

Do not commit a local `.swfbox/` folder. It is ignored because it may contain a downloaded Ruffle build (tens of megabytes).

## 2. Create the private repository

```bash
git init -b main
git add .
git update-index --chmod=+x bin/swfbox.js
git commit -m "swfbox 0.1.0: offline Flash library and launcher"
gh auth status
gh repo create arifs122/swfbox --private --source=. --remote=origin --push
```

If the repository already exists, add the remote instead:

```bash
git remote add origin https://github.com/arifs122/swfbox.git
git push -u origin main
```

Confirm the workflow file is present and CI starts:

```bash
gh run list --repo arifs122/swfbox
gh run watch --repo arifs122/swfbox
```

CI must pass on Node 18, 20 and 22 before making the repository public.

## 3. Repository settings

```bash
gh repo edit arifs122/swfbox \
  --description "Your offline Flash library. Point it at a folder of .swf files — browse, inspect and play them through Ruffle." \
  --homepage "https://github.com/arifs122/swfbox" \
  --add-topic swf,flash,ruffle,cli,offline,archive,metadata,nodejs
```

Recommended in the web UI:

- Enable Issues and Discussions.
- Enable private vulnerability reporting (Security > Advisories).
- Protect `main`: require the CI check, require a pull request for changes, disallow force pushes.
- Add the repository description and social preview.

## 4. Make it public

```bash
gh repo edit arifs122/swfbox --visibility public --accept-visibility-change-consequences
```

Then verify unauthenticated access:

```bash
git ls-remote https://github.com/arifs122/swfbox.git
```

## 5. Tag the release

```bash
git tag -a v0.1.0 -m "swfbox 0.1.0"
git push origin v0.1.0
gh release create v0.1.0 \
  --repo arifs122/swfbox \
  --title "swfbox 0.1.0" \
  --notes-file CHANGELOG.md
```

The release notes can be trimmed to the `0.1.0` section of `CHANGELOG.md`.

## 6. Optional: publish to npm

Check that the name is still available:

```bash
npm view swfbox version
```

If it is taken, either keep the CLI repo-only or publish under a scope (for example `@arifs122/swfbox`) and update the README and `package.json` install instructions. The current package is unscoped `swfbox`.

Inspect the package contents before publishing:

```bash
npm pack --dry-run
```

Expected: `bin/`, `src/`, `README.md`, `LICENSE`, `CHANGELOG.md` and `package.json`. Tests, docs, screenshots and `.github/` are intentionally not shipped.

```bash
npm login
npm publish --access public
```

For a provenance-attested publish from public GitHub Actions, use `npm publish --provenance --access public` from a trusted workflow with `id-token: write`.

After publishing:

```bash
npx swfbox@0.1.0 --version
npx swfbox@0.1.0 --help
```

## 7. Version bumps

Update all of these together:

- `package.json` `version`
- `src/util.js` `VERSION`
- `CHANGELOG.md` (move entries from Unreleased to the new version and date)
- Any README examples that pin a version

Then repeat the tag and publish steps.

## 8. Post-release checks

- Open the repository in a private browser window; README badges and image paths should resolve.
- Run the quick start from a clean directory: `npx swfbox .` on a folder with one synthetic SWF.
- Verify the CI badge shows green.
- Check that `docs/demo/demo.html` renders from the GitHub raw URL with no console errors (the page has no external dependencies).
- Confirm `SECURITY.md` links to the private advisory form.

## Rollback

- npm: `npm unpublish swfbox@0.1.0` within 72 hours, or `npm deprecate swfbox@0.1.0 "reason"` after that.
- GitHub: delete the release and tag, or publish a patch release. Do not rewrite `main` history after it is public.
