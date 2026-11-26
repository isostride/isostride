import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { KNOWN_METRICS } from '@/lib/kernel';
import { LOCALES, dictionary, dictionaryParts, loadLocale } from '@/lib/i18n';
import { recordMeasure } from '../support/fixtures';

/**
 * Every text of the app in every language (requirement "App in English and Polish": "Wszystko od
 * razu ... test pilnuje, że żaden tekst nie zostaje nieprzetłumaczony"; fitness function "No text left
 * untranslated"). The English text is the key (ADR "Languages without a library"): a text shown on a
 * screen goes through t(), tn() or msg(), and each key has its translation in every other language.
 * A literal that is not a text (an id, a unit alone) passes; one that only looks like a text is marked
 * on its line, or the line before, with the comment i18n-ignore.
 */
const ROOT = path.resolve(__dirname, '../..');
const DIRS = ['app', 'components', 'lib'];
// lib/demo: no text of a screen, but what the sample runner of the demo typed (titles, notes, the names of tags
// and gear), written into the demo's folder in English or in Polish from its own list (lib/demo/words.ts).
const SKIP = [/^lib\/i18n\//, /^lib\/kernel\//, /^lib\/demo\//, /\.d\.ts$/];

/** Attributes of JSX elements that are read or shown. */
const TEXT_ATTRS = new Set(['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title', 'placeholder', 'alt', 'label', 'hint', 'name', 'detail', 'empty', 'caption', 'summary', 'heading', 'text', 'description', 'emptyText']);
/** Properties of objects whose value is shown. */
const TEXT_PROPS = new Set(['label', 'title', 'name', 'short', 'hint', 'detail', 'description', 'text', 'summary', 'tells', 'method', 'note', 'caption', 'message', 'reason', 'help', 'explain', 'verdict', 'heading', 'evidence', 'empty', 'what', 'why', 'source', 'plain', 'sub', 'tip', 'meaning', 'says', 'unitName', 'question', 'answer', 'line', 'body', 'aria-label']);
/** Calls whose arguments are shown. */
const TEXT_CALLS = /^(set(Message|Error|Status|Note|Saving|Hint|Notice|Toast|Title|Label|Problem|Warning|Info|Done)\w*|toast|notify|announce|confirm|alert|say)$/;
/** Words that are the same in every language: units, names, abbreviations. */
const SAME = new Set(['IsoStride', 'Iso', 'Stride', 'km', 'm', 's', 'min', 'h', 'd', 'bpm', 'spm', 'brpm', 'W', 'kJ', 'ms', 'mm', 'cm', 'kN', 'kg', 'ºC', 'C', 'VO2max', 'VDOT', 'TRIMP', 'rTSS', 'TSS', 'CTL', 'ATL', 'TSB', 'ACWR', 'EF', 'CS', 'CP', 'HR', 'HRV', 'GCT', 'FIT', 'CSV', 'JSON', 'GPS', 'OK', 'COROS', 'Garmin', 'Stryd', 'Polar', 'Suunto', 'OpenStreetMap', 'GitHub', 'PACE', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'A', 'B', 'vs', 'Δ', 'R²', 'D′', 'W′', 'τ1', 'τ2', 'px', 'ok', 'kmh', 'mi', 'x', 'eg']);

const isText = (s: string): boolean => {
  // Paths, links and units with a slash (/releases/tag/v, min/km) are not words; nor a language's code.
  if (/^[a-z]{2}(-[A-Z]{2})?$/.test(s.trim())) return false;
  const words = s.replace(/\S*[/#]\S*|(^|\s)\.\w+/g, ' ').match(/[\p{L}][\p{L}\p{N}′²]*/gu) ?? [];
  return words.some((w) => !SAME.has(w) && /\p{L}{2,}/u.test(w));
};

function walkFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walkFiles(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

interface Found { untranslated: string[]; keys: Map<string, string> }

/** The calls that take keys: t(key, vars), tn(n, one, other, vars), msg(key); tn's singular is checked as a text of the call. */
const keyArgs = (call: ts.CallExpression): ts.Expression[] => {
  const name = ts.isIdentifier(call.expression) ? call.expression.text : ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : '';
  if (name === 't' || name === 'msg') return call.arguments.slice(0, 1);
  // tn(n, one, other): the plural form is the key, its entry holds every form (the singular is not one of its own).
  if (name === 'tn') return call.arguments.slice(2, 3);
  return [];
};

function scan(file: string, found: Found): void {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = src.split('\n');
  const ignored = (n: ts.Node) => {
    const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
    return /i18n-ignore/.test(lines[line] ?? '') || /i18n-ignore/.test(lines[line - 1] ?? '');
  };
  const at = (n: ts.Node) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const flag = (n: ts.Node, text: string) => { if (!ignored(n)) found.untranslated.push(`${at(n)} ${JSON.stringify(text.trim().slice(0, 70))}`); };

  /** The text parts of a literal, or null when the node is not a literal. */
  const textOf = (n: ts.Node): string | null => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isTemplateExpression(n)) return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ');
    return null;
  };
  /** Whether the literal sits where its value is shown: climbs through ?:, ??, ||, +, ( ), [ ], template spans. */
  const shownAt = (n: ts.Node): ts.Node | null => {
    let cur: ts.Node = n;
    for (;;) {
      const p = cur.parent;
      if (!p) return null;
      if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isArrayLiteralExpression(p) || ts.isTemplateSpan(p) || ts.isTemplateExpression(p)) { cur = p; continue; }
      if (ts.isConditionalExpression(p) && cur !== p.condition) { cur = p; continue; }
      if (ts.isBinaryExpression(p) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(p.operatorToken.kind)) { cur = p; continue; }
      return p;
    }
  };
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const args = keyArgs(n);
      for (const a of args) {
        const text = textOf(a);
        if (text !== null && !ts.isTemplateExpression(a)) found.keys.set(text, found.keys.get(text) ?? at(a));
        else if (a && ts.isTemplateExpression(a)) flag(a, `key built at run time: ${a.getText(sf)}`);
      }
      if (args.length) {
        // The keys themselves are not texts left untranslated; their vars may hold texts.
        n.arguments.forEach((a) => { if (!args.includes(a)) visit(a); });
        return;
      }
    }
    if (ts.isJsxText(n)) {
      if (isText(n.text)) flag(n, n.text);
      return;
    }
    const text = textOf(n);
    if (text !== null && isText(text)) {
      const p = shownAt(n);
      if (p) {
        const shown =
          (ts.isJsxAttribute(p) && TEXT_ATTRS.has(p.name.getText(sf))) ||
          (ts.isJsxExpression(p) && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent) || (ts.isJsxAttribute(p.parent) && TEXT_ATTRS.has(p.parent.name.getText(sf))))) ||
          (ts.isPropertyAssignment(p) && p.initializer !== n.parent && TEXT_PROPS.has(p.name.getText(sf).replace(/['"]/g, ''))) ||
          (ts.isPropertyAssignment(p) && TEXT_PROPS.has(p.name.getText(sf).replace(/['"]/g, ''))) ||
          ts.isReturnStatement(p) ||
          (ts.isArrowFunction(p) && p.body === shownChild(p, n)) ||
          (ts.isCallExpression(p) && TEXT_CALLS.test(calleeName(p))) ||
          (ts.isNewExpression(p) && /Error$/.test(p.expression.getText(sf)));
        if (shown) flag(n, text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const calleeName = (c: ts.CallExpression): string =>
  ts.isIdentifier(c.expression) ? c.expression.text : ts.isPropertyAccessExpression(c.expression) ? c.expression.name.text : '';
/** The child of an arrow function on the way to a node: its body when the node is in it. */
const shownChild = (fn: ts.ArrowFunction, n: ts.Node): ts.Node | null => {
  let cur: ts.Node = n;
  while (cur.parent && cur.parent !== fn) cur = cur.parent;
  return cur.parent === fn ? cur : null;
};

function scanAll(): Found {
  const found: Found = { untranslated: [], keys: new Map() };
  for (const d of DIRS) for (const f of walkFiles(path.join(ROOT, d))) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (!SKIP.some((r) => r.test(rel))) scan(f, found);
  }
  return found;
}

describe('No text left untranslated', () => {
  beforeAll(() => Promise.all(LOCALES.map((l) => loadLocale(l.key))));
  const found = scanAll();
  // The names of the metrics the app knows are shown through t() from the catalog (lib/kernel).
  const catalog = Object.values(KNOWN_METRICS).flatMap((m) => [m.name, m.short]);
  const keys = new Set([...found.keys.keys(), ...catalog]);

  it('Every shown text goes through a translation', async () => {
    // TEXTS_OUT=<file>: the whole list, for the one translating.
    if (process.env.TEXTS_OUT) fs.writeFileSync(process.env.TEXTS_OUT, found.untranslated.join('\n') + '\n');
    await recordMeasure('untranslatedTexts', found.untranslated.length);
    expect(found.untranslated).toEqual([]);
  }, 60_000);

  it('Every text has its translation', async () => {
    const missing = LOCALES.filter((l) => l.key !== 'en').flatMap((l) =>
      [...keys].filter((k) => isText(k) && !(k in dictionary(l.key))).map((k) => `${l.key} ${found.keys.get(k) ?? 'lib/kernel'} ${JSON.stringify(k)}`));
    // Nor a translation left over from a text no longer in the app.
    const unused = LOCALES.filter((l) => l.key !== 'en').flatMap((l) => Object.keys(dictionary(l.key)).filter((k) => !keys.has(k)).map((k) => `${l.key} unused ${JSON.stringify(k)}`));
    // A text in two parts of a dictionary has the same translation in both.
    const differing = LOCALES.flatMap((l) => {
      const seen = new Map<string, string>();
      return Object.entries(dictionaryParts(l.key)).flatMap(([part, d]) => Object.entries(d).flatMap(([k, v]) => {
        const was = seen.get(k);
        seen.set(k, JSON.stringify(v));
        return was !== undefined && was !== JSON.stringify(v) ? [`${l.key} ${part} ${JSON.stringify(k)}: ${was} or ${JSON.stringify(v)}`] : [];
      }));
    });
    await recordMeasure('missingTranslations', missing.length + unused.length + differing.length);
    expect([...missing, ...unused, ...differing]).toEqual([]);
  }, 60_000);
});
