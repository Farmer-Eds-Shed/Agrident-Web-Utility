# Agrident Web Utility

Static multi-file version of the original single-page prototype.

## Run locally
Use any static server (due to ES modules):
- `python -m http.server 8000`
- then open http://localhost:8000

## Structure
- `index.html` UI
- `app.js` main app logic (currently mostly legacy, staged for refactor)
- `wand/` protocol + transports
- `parsers/` CSV helpers
- `configs/` .tsk command loader
- `ui/` DOM helpers

## Notes
This is a refactor skeleton: functionality should match the original page,
while the logic gradually moves out of `app.js` into modules.
