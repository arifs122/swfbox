#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2))
  .then((code) => {
    if (typeof code === "number") process.exitCode = code;
  })
  .catch((error) => {
    // Never leak a stack trace to a user with a malformed archive.
    const message = error && error.message ? error.message : "Unknown error";
    process.stderr.write(`swfbox: ${message}\n`);
    if (process.env.SWFBOX_DEBUG) process.stderr.write(`${error?.stack || ""}\n`);
    process.exitCode = 2;
  });
