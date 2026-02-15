// parsers/format.js
export function pad2(n) { return String(n).padStart(2, "0"); }

export function isValidDMY(dd, mm, yyyy) {
  const d = Number(dd), m = Number(mm), y = Number(yyyy);
  if (!(y >= 1900 && y <= 2100)) return false;
  if (!(m >= 1 && m <= 12)) return false;
  if (!(d >= 1 && d <= 31)) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && (dt.getMonth() + 1) === m && dt.getDate() === d;
}

export function formatDateMaybe(v) {
  const s = String(v ?? "").trim();
  if (!s) return s;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

  let m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) {
    const dd = m[1], mm = m[2], yyyy = m[3];
    if (isValidDMY(dd, mm, yyyy)) return `${dd}/${mm}/${yyyy}`;
    return s;
  }

  m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const dd = m[1], mm = m[2], yy = m[3];
    const yyyy = String(2000 + Number(yy));
    if (isValidDMY(dd, mm, yyyy)) return `${dd}/${mm}/${yyyy}`;
    return s;
  }

  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
  if (m) {
    const dd = pad2(m[1]), mm = pad2(m[2]);
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = String(2000 + Number(yyyy));
    if (isValidDMY(dd, mm, yyyy)) return `${dd}/${mm}/${yyyy}`;
    return s;
  }

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    const dd = pad2(m[1]), mm = pad2(m[2]);
    const yyyy = String(2000 + Number(m[3]));
    if (isValidDMY(dd, mm, yyyy)) return `${dd}/${mm}/${yyyy}`;
    return s;
  }

  m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) {
    const yyyy = m[1], mm = pad2(m[2]), dd = pad2(m[3]);
    if (isValidDMY(dd, mm, yyyy)) return `${dd}/${mm}/${yyyy}`;
    return s;
  }

  if (/^\d{10}$/.test(s) || /^\d{13}$/.test(s)) {
    const ms = s.length === 10 ? Number(s) * 1000 : Number(s);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
  }

  return s;
}

export function trimLeadingZerosNumberMaybe(v) {
  const s = String(v ?? "").trim();
  if (!s) return s;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;

  const neg = s.startsWith("-");
  const core = neg ? s.slice(1) : s;

  if (core.includes(".")) {
    const [ip, fp] = core.split(".");
    const ip2 = ip.replace(/^0+(?=\d)/, "");
    return (neg ? "-" : "") + (ip2 === "" ? "0" : ip2) + "." + fp;
  } else {
    const core2 = core.replace(/^0+(?=\d)/, "");
    return (neg ? "-" : "") + (core2 === "" ? "0" : core2);
  }
}

export function formatRow(row, headers) {
  return row.map((v, i) => {
    const raw = String(v ?? "").trim();
    const h = String(headers?.[i] ?? "").toLowerCase();
    if (h.includes("date")) return formatDateMaybe(raw);
    if (h.includes("weight") || h.includes("kg") || h === "wgt") return trimLeadingZerosNumberMaybe(raw);
    return raw;
  });
}
