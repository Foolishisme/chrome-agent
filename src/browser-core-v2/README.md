# Browser Core V2

Browser Core V2 is the isolated rewrite island for the next browser-agent mainline.

It is intentionally separate from the current `src/background/runtime`, `src/background/tools`, and legacy workflow code. The old MVP remains available as a reference, fallback, and validation harness while this directory builds the new store-safe browser capability path.

Default path:

- content-script JS/DOM observation and interaction
- `@mozilla/readability` plus `turndown` for page reading
- stable element refs for links and controls
- low-risk browser actions behind policy gates
- CDP/debugger only as a future advanced/local/enterprise driver

This directory must not register runtime-visible tools until the explicit URL overview loop is ready to be validated as a separate path.
