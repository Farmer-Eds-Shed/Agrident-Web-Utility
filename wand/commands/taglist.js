// wand/commands/taglist.js

export async function fetchTaglist(session) {
  const done = await session.send("XGTAGLIST", { name: "Get taglist", okToken: "XGTAGLISTOK" });

  const rows = done.frames
    .filter(session.helpers.isBracketFrame)
    .filter((fr) => fr !== "[XGTAGLIST]" && fr !== "[XGTAGLISTOK]")
    .filter((fr) => fr.includes("|"))
    .map(session.helpers.parsePipeFrame)
    .map((a) => ({
      eid: (a[0] ?? "").trim(),
      vid: (a[1] ?? "").trim(),
      alertNo: (a[2] ?? "0").trim(), // omitted if 0
    }))
    .filter((r) => r.eid);

  return rows;
}

export async function eraseTaglist(session) {
  await session.send("XETAGLIST", { name: "Erase taglist", okToken: "XETAGLISTOK" });
}

// Upload tags (append). Reader echoes the uploaded frame.
// Use fuzzy match by EID only to avoid issues with VID truncation or omitted alertNo.
export async function uploadTag(session, { eid, vid, alertNo }) {
  const cleanEid = String(eid ?? "").trim();
  if (!cleanEid) throw new Error("Missing EID");

  const cleanVid = String(vid ?? "").trim().slice(0, 14); // spec: max 14 chars
  const a = String(alertNo ?? "").trim();

  const parts = [cleanEid, cleanVid];
  if (a && a !== "0") parts.push(a);

  const frame = `[${parts.join("|")}]`;

  if (typeof session.sendFrameAndWait !== "function") {
    throw new Error("Session missing sendFrameAndWait()");
  }

  // ✅ send + fuzzy wait (match by EID in echoed frame)
  await session.sendFrameAndWait(
    frame,
    (fr) => {
      if (!fr.startsWith("[E")) return false;
      const p = session.helpers.parsePipeFrame(fr);
      return p[0] === cleanEid;
    },
    { name: `Upload tag ${cleanEid}`, timeoutMsOverride: 12000 }
  );
}

export async function uploadTaglist(session, rows, { onProgress } = {}) {
  let i = 0;
  for (const r of rows) {
    i += 1;
    await uploadTag(session, r);
    onProgress?.({ i, total: rows.length, row: r });
  }
}
