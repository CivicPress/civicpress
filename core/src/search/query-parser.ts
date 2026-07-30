/**
 * Query Parser
 *
 * Parses user search queries into structured format for FTS5/PostgreSQL FTS.
 * Supports:
 * - Multi-word queries
 * - Phrase matching (quoted strings)
 * - AND/OR operators
 * - Word prefix matching for autocomplete feel
 */

export interface ParsedQuery {
  words: string[];
  phrases: string[];
  operator: 'AND' | 'OR';
  original: string;
  hasExplicitOperator: boolean;
}

/**
 * Parse a search query into structured components
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const original = query.trim();

  if (!original) {
    return {
      words: [],
      phrases: [],
      operator: 'AND',
      original: '',
      hasExplicitOperator: false,
    };
  }

  // Extract quoted phrases
  const phraseRegex = /"([^"]+)"/g;
  const phrases: string[] = [];
  let match: RegExpExecArray | null;
  let cleanedQuery = original;

  while ((match = phraseRegex.exec(original)) !== null) {
    phrases.push(match[1].trim());
    // Remove phrase from cleaned query
    cleanedQuery = cleanedQuery.replace(match[0], ' ');
  }

  // Check for explicit OR operator
  const hasExplicitOR = /\s+(OR|or)\s+/.test(cleanedQuery);
  const hasExplicitAND = /\s+(AND|and)\s+/.test(cleanedQuery);

  // Remove AND/OR operators from cleaned query for word extraction
  const operatorFreeQuery = cleanedQuery
    .replace(/\s+(OR|or|AND|and)\s+/gi, ' ')
    .trim();

  // Extract words (excluding phrases and operators)
  const words = operatorFreeQuery
    .split(/\s+/)
    .filter((word) => word.length > 0 && !/^["']$/.test(word))
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  // Determine operator
  const operator =
    hasExplicitOR ||
    (!hasExplicitAND && words.length > 1 && hasImplicitOR(query))
      ? 'OR'
      : 'AND';

  return {
    words,
    phrases,
    operator,
    original,
    hasExplicitOperator: hasExplicitOR || hasExplicitAND,
  };
}

/**
 * Check if query has implicit OR (multiple words without quotes, likely OR intent)
 * This is a heuristic: if user types multiple words without quotes, they might want OR
 * But we default to AND for better relevance unless they explicitly use OR
 */
function hasImplicitOR(query: string): boolean {
  // If query has quotes, likely AND intent
  if (query.includes('"')) {
    return false;
  }
  // Default to AND for better relevance
  return false;
}

/**
 * Build FTS5 query string from parsed query
 */
export function buildFTS5Query(parsed: ParsedQuery): string {
  const terms: string[] = [];

  // Add phrases as exact matches
  parsed.phrases.forEach((phrase) => {
    if (phrase.length > 0) {
      // Escape quotes in phrase
      const escaped = phrase.replace(/"/g, '""');
      terms.push(`"${escaped}"`);
    }
  });

  // Add words - use exact match OR prefix match for better results
  // FTS5: "word" matches exact word, "word*" matches prefix
  // We use both: word OR word* to match both exact words and prefixes
  parsed.words.forEach((word) => {
    // FA-CORE-003: emit the prefix term as a quoted FTS5 phrase-prefix. The
    // previous bareword form (`word*`) left punctuation (foo-bar, a.b, colon:x)
    // unquoted, raising a MATCH syntax error → 500 (query DoS / error oracle).
    // Doubling embedded quotes keeps the token inside the phrase literal.
    const escaped = word.replace(/"/g, '""');
    if (escaped.trim().length > 0) {
      // Use exact match OR prefix match for better coverage
      // This matches both "bruit" (exact) and "bruit..." (prefix)
      terms.push(`"${escaped}" OR "${escaped}" *`);
    }
  });

  if (terms.length === 0) {
    return '';
  }

  // Join with operator
  // FTS5: space = AND, "OR" = OR
  const operator = parsed.operator === 'AND' ? ' ' : ' OR ';
  return terms.join(operator);
}
