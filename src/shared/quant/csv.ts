export interface ParsedSeries {
  labels: string[];
  values: number[];
  column: string;
  skipped: number;
}

/**
 * Parse a user-supplied CSV (or single column of numbers) into a price series.
 *
 * - Accepts comma, semicolon or tab separators.
 * - Uses the last numeric column by default, or a column named close / adj close / price.
 * - Rows that cannot be parsed are skipped and counted.
 */
export function parsePriceCsv(text: string): ParsedSeries {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("No data found.");

  const sep = detectSeparator(lines[0]!);
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
  const firstIsHeader = rows[0]!.some((c) => c !== "" && !isNumeric(c));
  const header = firstIsHeader ? rows[0]!.map((h) => h.toLowerCase()) : rows[0]!.map((_, i) => `col${i + 1}`);
  const body = firstIsHeader ? rows.slice(1) : rows;

  const preferred = ["adj close", "adj_close", "close", "price", "value"];
  let col = header.findIndex((h) => preferred.includes(h));
  if (col < 0) {
    const width = Math.max(...body.map((r) => r.length));
    for (let c = width - 1; c >= 0; c--) {
      if (body.some((r) => isNumeric(r[c] ?? ""))) {
        col = c;
        break;
      }
    }
  }
  if (col < 0) throw new Error("No numeric column found.");

  const labels: string[] = [];
  const values: number[] = [];
  let skipped = 0;
  body.forEach((r, i) => {
    const raw = r[col] ?? "";
    if (!isNumeric(raw)) {
      skipped++;
      return;
    }
    values.push(Number(raw.replace(/,/g, "")));
    labels.push(col > 0 ? r[0] ?? String(i + 1) : String(i + 1));
  });
  if (values.length < 3) throw new Error("At least 3 numeric rows are required.");
  return { labels, values, column: header[col] ?? `col${col + 1}`, skipped };
}

function detectSeparator(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

function isNumeric(s: string): boolean {
  if (s === "") return false;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n);
}
