# Changelog

All notable changes to `swfbox` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-20

### Added

- Zero-dependency SWF metadata parser for `FWS`, `CWS` and `ZWS`:
  - header, version, declared length and compression
  - bit-packed stage `RECT` in twips and pixels
  - fixed 8.8 frame rate and frame count
  - top-level tag stream with hard limits
  - `SetBackgroundColor`, `FileAttributes`, `Metadata`/XMP, `DoABC`, `DoAction`, `DoInitAction`
  - counts for sprites, shapes, sounds and video streams
  - graceful handling of truncation, corrupt zlib, absurd lengths and 0-byte files
- Recursive bounded scanner with case-insensitive `.swf` matching, dot-directory skipping, symlink-loop protection, `--max-files` cap and broken-file reporting.
- Static, self-contained library page with search, filter chips, sorting, aspect-ratio cards, a modal player and a clear no-Ruffle state.
- Local `node:http` server with `/`, `/player`, `/swf/*`, `/ruffle/*` and `/health`; path-traversal protection; port auto-increment.
- Ruffle resolution (`--ruffle`, root `.swfbox/ruffle`, home `.swfbox/ruffle`, pinned unpkg CDN for serve/play).
- Explicit `--fetch-ruffle` download from the pinned `@ruffle-rs/ruffle@0.7.1` npm tarball with size/timeout caps, tar validation and progress.
- Terminal `inspect`, text index and summary output, including deterministic `--format json`.
- 60+ assertions using synthetic SWFs generated in tests; no downloaded fixtures.
- Deterministic demo archive in `docs/demo/`.
- CI for Node 18, 20 and 22 with a self-containment check.
