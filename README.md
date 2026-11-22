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
Connect to the reader using BLE or USB Serial, open **Tasks**, click **Upload Task Definition…**, and choose a
`.tsk` command file in the dialog. The **Destination slot** selector defaults to the slot encoded in the file (1–20,\nmatching the wand menu). Changing the selection rewrites only the CCD and CIN\nslot numbers; the original file is not modified. Review the resulting frames\nbefore clicking **Upload Definition → Wand**. The destination may be replaced.
The upload sends each bracketed command in file order and waits for the\nreader's matching command-specific OK acknowledgement before continuing. It does **not** erase tasks automatically; any erase/reset commands
included in the file are sent as written and flagged in the confirmation.

**Important:** Each command must receive its matching OK acknowledgement.\nThis still does not prove that the task is persisted. The task list is refreshed after upload; confirm the new task exists\nin the selected wand-menu slot. Test on a spare reader
before using production task configurations. The acknowledgement mapping is based on an AWR250 V2.15 serial capture.

Task numbers displayed in the downloader are one-based to match the wand menu; underlying reader command indices remain zero-based.

### Repository task templates

Task definitions can also be loaded from the **Repository template** dropdown in the
Upload Task Definition dialog. Store plain-text `.tsk` files in `task-definitions/`
and register them in `task-definitions/manifest.json`, for example:

```json
{
  "templates": [
    { "name": "Manual Weighing", "file": "manual_weigh.tsk" }
  ]
}
```

Only filenames containing letters, digits, underscores, or hyphens and ending in
`.tsk` are accepted. Commit both the manifest and task files to the same branch
as the deployed web utility. Templates are loaded read-only via relative URLs;
no GitHub token is needed. The local file picker remains available. The manifest
starts empty until you add your own task files.

### Initialise all tasks (advanced)

After **Get Tasks**, expand **Advanced task maintenance** in the Tasks tab and
select **Initialise All Tasks…**. The action requires typing `DELETE ALL TASKS`
and a second confirmation. It sends the exact TaskTool-captured AWR250 V2.15
command `[CIB|1000|9]`, waits for `[CIBOK]`, invalidates the existing task
catalogue, and tries to retrieve it again. If refresh fails, run **Get Tasks**
before any upload. The exact impact on recorded task data has not been verified:
treat the action as potentially destructive to both definitions and records.
