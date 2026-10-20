# Demo archive

This folder is generated, not curated. It exists so the README can show real output and so contributors can exercise the parser, scanner, static report and server without downloading a single SWF.

- `scripts/make-demo-swfs.mjs` builds ten tiny synthetic SWFs and regenerates the two output files below.
- `swfs/` contains the generated files: FWS, CWS, ZWS, AS2, AS3, XMP metadata, no metadata, a corrupt zlib stream, varied dimensions and frame rates.
- `demo.html` is a self-contained static library page for `swfs/`.
- `cli.txt` is a transcript of real `swfbox` scans and inspections.

Regenerate:

```bash
npm run demo
```

The script pins file mtimes to `2009-05-01` and the report timestamp, so the text and page are reproducible on the same Node/zlib runtime. It uses no network.

The corrupt and LZMA files are deliberately unreadable. They appear in the "Could not read" section, which is the point.
