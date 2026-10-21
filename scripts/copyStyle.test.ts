import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * House style guard for public copy (owner directive 2026-10-21): no em dashes in prose, no double hyphens, no hype
 * phrases, consistent names. Scans user-facing string literals and JSX text via the TypeScript AST (comments excluded).
 */
const ROOT = join(import.meta.dirname, '..');
const DIRS = ['src/pages', 'src/components', 'src/data', 'src/auth'];
const EXTRA = ['shared/meta.ts', 'shared/copy.ts', 'shared/cot.ts', 'shared/macro.ts', 'shared/indicators.ts', 'src/lib/briefing.ts', 'src/lib/search.ts', 'src/lib/brain.ts', 'src/lib/tension.ts'];
const COPY_PROPS = new Set(['title', 'label', 'placeholder', 'aria-label', 'alt', 'description', 'text', 'note', 'hint', 'summary', 'tagline', 'eyebrow', 'explanation', 'help', 'name', 'license', 'heading', 'body', 'disclaimer', 'supporting']);

function files(): string[] {
  const out = [...EXTRA];
  for (const d of DIRS) for (const f of readdirSync(join(ROOT, d))) if (/\.tsx?$/.test(f) && !f.includes('.test.')) out.push(`${d}/${f}`);
  return out;
}

function copyStrings(file: string): { line: number; text: string }[] {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { line: number; text: string }[] = [];
  const add = (n: ts.Node, text: string) => out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text: text.replace(/\s+/g, ' ').trim() });
  const visit = (n: ts.Node): void => {
    if (ts.isJsxText(n)) add(n, n.text);
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.parent) {
      const p = n.parent;
      if (
        (ts.isJsxAttribute(p) && COPY_PROPS.has(p.name.getText())) ||
        (ts.isPropertyAssignment(p) && COPY_PROPS.has(p.name.getText().replace(/['"]/g, ''))) ||
        ts.isJsxExpression(p) ||
        ts.isArrayLiteralExpression(p) ||
        ts.isConditionalExpression(p)
      )
        add(n, n.text);
    } else if (ts.isTemplateExpression(n)) add(n, n.getText().slice(1, -1));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out.filter((s) => /[A-Za-z]{3}/.test(s.text));
}

const RULES: [string, (t: string) => boolean][] = [
  ['em dash in prose (use a period, colon or comma)', (t) => /—/.test(t)],
  // Allowed: numeric ranges, including template placeholders (1–${max}, ${a} – ${b}), and the proper name Box–Muller.
  ['en dash outside a numeric range', (t) => /–/.test(t.replace(/Box–Muller/g, '').replace(/[\d}…'] ?– ?[\d$…']/g, ''))],
  ['double hyphen', (t) => /(^|\s)--(\s|$)/.test(t)],
  ['hype phrase', (t) => /unlock the power|seamless|revolutionis|revolutioniz|cutting-edge|game-chang|state-of-the-art|supercharg|world-class|next-gen/i.test(t)],
  ['retired name', (t) => /Conflict Radar|Markets Terminal|synthetic|demo data|demo prices/i.test(t)],
];

describe('public copy style', () => {
  const all = files().flatMap((f) => copyStrings(f).map((s) => ({ ...s, file: f })));

  it('scans a meaningful amount of copy', () => {
    expect(all.length).toBeGreaterThan(800);
  });

  for (const [name, bad] of RULES) {
    it(`has no ${name}`, () => {
      const hits = all.filter((s) => bad(s.text)).map((s) => `${s.file}:${s.line}: ${s.text.slice(0, 120)}`);
      expect(hits).toEqual([]);
    });
  }
});
