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

## Upload task definitions (.tsk)
Connect to the reader using BLE or USB Serial, open **Tasks**, and choose a
`.tsk` command file. Review its frames before clicking **Upload Definition → Wand**.
The upload sends each bracketed command in file order and waits for the\nreader's matching command-specific OK acknowledgement before continuing. It does **not** erase tasks automatically; any erase/reset commands
included in the file are sent as written and flagged in the confirmation.

**Important:** Each command must receive its matching OK acknowledgement.\nThis still does not prove that the task is persisted. Click **Get Tasks** afterward\nand confirm the new task exists. Test on a spare reader
before using production task configurations. The acknowledgement mapping is based on an AWR250 V2.15 serial capture.
