# Security Policy

## Supported versions

`swfbox` is at `0.1.x`. Security fixes land on the latest release.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting on the repository:

<https://github.com/arifs122/swfbox/security/advisories/new>

Include:

- A description of the issue and its impact.
- Steps to reproduce, with the exact command and a minimal file if needed.
- `swfbox --version`, Node version and OS.
- Whether the issue affects the parser, the static page, the server or `--fetch-ruffle`.

You will receive an acknowledgement as soon as possible. Please allow time for a fix and a coordinated disclosure.

## Threat model

`swfbox` treats **every SWF file and filename as untrusted input**. It parses a small part of the SWF format; it never executes ActionScript or renders content itself.

Areas of concern and current mitigations:

| Area | Mitigation |
| --- | --- |
| Parser crashes or hangs | Bounded reads, decompression cap, tag count cap, tag length checks, defensive try/catch; malformed files produce error records |
| Zip bombs (`CWS`) | `inflateSync` with `maxOutputLength` (16 MB by default) |
| LZMA (`ZWS`) | Not implemented; reported as an error instead of guessing |
| Path traversal | Percent-decode, reject absolute paths, NUL and any `..` segment, resolve, verify containment; `/swf/*` must match an indexed entry |
| Serving arbitrary files | Only indexed `.swf` files and the configured Ruffle folder are reachable |
| XSS from filenames/metadata | Server-side HTML escaping; JSON with `<`, `>`, `&`, U+2028/U+2029 escaped; client cards use `textContent` |
| Command injection | No shell interpolation for user paths. `--open` passes an argument array to the platform opener |
| Malicious Ruffle archive | Explicit opt-in only; gzip/tar validation, absolute/traversal path rejection, symlinks skipped, size caps |
| Network exposure | Server binds to `127.0.0.1`; `GET`/`HEAD` only; no CORS, uploads or directory listing |
| Telemetry | None. The only network operation is `--fetch-ruffle`; the only possible remote script is the documented Ruffle URL |

## Out of scope

- **Ruffle vulnerabilities.** Ruffle renders the SWF and executes its ActionScript. Report those to [ruffle-rs/ruffle](https://github.com/ruffle-rs/ruffle/security). `swfbox` cannot sandbox bugs inside the player.
- **Malicious SWFs that behave badly inside Ruffle.** Treat archives as untrusted and use a browser profile you are comfortable with.
- **Running `swfbox serve` on a public interface.** The tool is designed for local use.

## Good practices for users

- Keep the default `127.0.0.1` binding.
- Do not expose the server through a reverse proxy without authentication.
- Use `--fetch-ruffle` (or your own Ruffle build) for an offline, no-CDN setup.
- Keep Node.js up to date.
