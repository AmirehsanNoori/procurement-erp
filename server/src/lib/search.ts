// Digit-script–tolerant search.
//
// Persian data frequently stores numbers with Persian (۰۹) or Arabic-Indic (٠٩)
// digits while users type Latin (09) ones (or vice-versa). A literal `contains`
// then fails even though the record is clearly there. To fix this without
// touching stored data, we expand a search term into every digit-script variant
// and match any of them.

const LATIN = '0123456789';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';

function mapDigits(s: string, from: string, to: string): string {
  let out = '';
  for (const ch of s) {
    const i = from.indexOf(ch);
    out += i >= 0 ? to[i] : ch;
  }
  return out;
}

/** Fold any Persian/Arabic digits in a string to Latin (leaves other chars). */
export function toLatinDigits(s: string): string {
  return mapDigits(mapDigits(s, PERSIAN, LATIN), ARABIC, LATIN);
}

/**
 * Distinct digit-script variants of a (trimmed) search term. A term typed with
 * Latin digits also matches values stored with Persian/Arabic digits and back.
 * Non-digit characters (letters, dashes, spaces) are preserved.
 * Returns [] for an empty term.
 */
export function searchTerms(raw: string | undefined | null): string[] {
  const term = (raw ?? '').trim();
  if (!term) return [];
  const latin = toLatinDigits(term);
  return [
    ...new Set([
      term,
      latin,
      mapDigits(latin, LATIN, PERSIAN),
      mapDigits(latin, LATIN, ARABIC),
    ]),
  ];
}
