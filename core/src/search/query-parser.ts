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
    if (word.length > 0) {
      // Escape special FTS5 characters
      const escaped = word.replace(/["']/g, '');
      // Use exact match OR prefix match for better coverage
      // This matches both "bruit" (exact) and "bruit..." (prefix)
      terms.push(`"${escaped}" OR ${escaped}*`);
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

/**
 * Build PostgreSQL tsquery string from parsed query
 */
export function buildPostgreSQLQuery(parsed: ParsedQuery): string {
  const terms: string[] = [];

  // Add phrases as exact matches (using <-> operator for phrase matching in PostgreSQL)
  parsed.phrases.forEach((phrase) => {
    if (phrase.length > 0) {
      const words = phrase.split(/\s+/).filter((w) => w.length > 0);
      if (words.length > 0) {
        // PostgreSQL phrase matching: "word1 <-> word2"
        const phraseQuery = words.join(' <-> ');
        terms.push(`(${phraseQuery})`);
      }
    }
  });

  // Add words (no prefix matching for PostgreSQL - use tsquery syntax)
  parsed.words.forEach((word) => {
    if (word.length > 0) {
      // Escape special tsquery characters
      const escaped = word.replace(/[:'&|!()]/g, '');
      if (escaped.length > 0) {
        terms.push(escaped);
      }
    }
  });

  if (terms.length === 0) {
    return '';
  }

  // Join with operator
  // PostgreSQL: & = AND, | = OR
  const operator = parsed.operator === 'AND' ? ' & ' : ' | ';
  return terms.join(operator);
}

/**
 * Calculate Levenshtein distance between two strings
 * Returns a similarity score (0-1, where 1 is identical)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) {
    return 1.0;
  }

  const distance = levenshteinDistance(
    longer.toLowerCase(),
    shorter.toLowerCase()
  );
  return 1 - distance / longer.length;
}

/**
 * Simple Levenshtein distance implementation
 * (We'll use fast-levenshtein library for production, but this is a fallback)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
