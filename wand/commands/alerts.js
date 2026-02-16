// wand/commands/alerts.js

export async function fetchAlerts(session, { first = null, last = null } = {}) {
  const cmd =
    first == null ? "XGALERT" :
    last == null ? `XGALERT|${first}` :
    `XGALERT|${first}|${last}`;

  const done = await session.send(cmd, { name: "Get alerts", okToken: "XGALERTOK" });

  const rows = done.frames
    .filter(session.helpers.isBracketFrame)
    .filter((fr) => !fr.startsWith("[XGALERT")) // header frame
    .filter((fr) => fr !== "[XGALERTOK]")
    .filter((fr) => fr.includes("|"))
    .map(session.helpers.parsePipeFrame)
    .map((a) => ({
      alertNo: String(a[0] ?? "").trim(),
      alertText: String(a[1] ?? "").trim(),
    }))
    .filter((r) => r.alertNo !== "");

  return rows;
}

export async function setAlert(session, alertNo, alertText) {
  const no = String(alertNo ?? "").trim();
  if (no === "") throw new Error("Missing alertNo");

  // Prevent breaking frames with pipes
  const text = String(alertText ?? "").replaceAll("|", " ").trim();

  await session.send(`XSALERT|${no}|${text}`, { name: "Set alert", okToken: "XSALERTOK" });
}

export async function eraseAlerts(session) {
  await session.send("XEALERT", { name: "Erase alerts", okToken: "XEALERTOK" });
}

export async function uploadAlerts(session, rows, { onProgress } = {}) {
  let i = 0;
  for (const r of rows) {
    i += 1;
    await setAlert(session, r.alertNo, r.alertText);
    onProgress?.({ i, total: rows.length, row: r });
  }
}
