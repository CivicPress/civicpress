/**
 * SQLite search suggestions — extracted from sqlite-search-service.ts in
 * Phase 2d W2-T3. Owns the word + title suggestion logic including the
 * typo-tolerance scoring, stop-word filtering, and Levenshtein-based
 * similarity computation.
 *
 * Stateless functions. Cache logic stays with the orchestrator.
 */

import type { DatabaseAdapter } from '../../database/database-adapter.js';
import type { SearchSuggestions } from '../search-service.js';
import { coreDebug } from '../../utils/core-output.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const levenshtein = require('fast-levenshtein') as {
  get: (str1: string, str2: string) => number;
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
  'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'mais',
  'dans', 'sur', 'avec', 'pour', 'par', 'sans', 'sous', 'entre', 'parmi',
]);

/**
 * Calculate Levenshtein-distance-based similarity (0-1) between a query
 * and a candidate. Boosted for prefix matches and short queries.
 */
export function calculateTypoSimilarity(
  query: string,
  candidate: string
): number {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedCandidate = candidate.toLowerCase().trim();

  if (normalizedCandidate.startsWith(normalizedQuery)) {
    return 0.95;
  }

  const distance = levenshtein.get(normalizedQuery, normalizedCandidate);
  const maxLength = Math.max(
    normalizedQuery.length,
    normalizedCandidate.length
  );

  if (maxLength === 0) return 1.0;

  const similarity = 1 - distance / maxLength;
  const boost = normalizedQuery.length <= 3 ? 0.1 : 0;
  return Math.min(1.0, similarity + boost);
}

/**
 * Extract words from text: lowercase, strip punctuation (preserving
 * common accented chars), filter to ≥3 chars.
 */
export function extractWords(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s-àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word && word.length >= 3)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
}

/**
 * Get word suggestions (without typo-tolerance fallback orchestration).
 * Reads matching titles+tags from search_index, extracts candidate words,
 * filters stop-words, and ranks by match-quality + frequency.
 */
export async function getWordSuggestions(
  adapter: DatabaseAdapter,
  query: string,
  limit: number,
  _enableTypoTolerance: boolean
): Promise<SearchSuggestions[]> {
  try {
    return await getWordSuggestionsFallback(adapter, query, limit);
  } catch (error) {
    coreDebug('getWordSuggestions error', {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function getWordSuggestionsFallback(
  adapter: DatabaseAdapter,
  query: string,
  limit: number
): Promise<SearchSuggestions[]> {
  const sql = `
    SELECT
      si.title,
      si.tags
    FROM search_index si
    INNER JOIN records r ON si.record_id = r.id
    WHERE (COALESCE(si.title_normalized, LOWER(si.title)) LIKE '%' || ? || '%'
           OR (si.tags IS NOT NULL AND LOWER(si.tags) LIKE '%' || ? || '%'))
      AND (r.workflow_state IS NULL OR r.workflow_state != 'internal_only')
    LIMIT 100
  `;

  const queryLower = query.toLowerCase();
  const results = await adapter.query<{ title?: string; tags?: string }>(
    sql,
    [queryLower, queryLower]
  );

  if (results.length === 0) {
    coreDebug('Word extraction: no results from SQL query', {
      query: queryLower,
    });
    return [];
  }

  const wordMap = new Map<string, number>();

  for (const row of results) {
    if (row.title) {
      const words = extractWords(row.title);
      for (const word of words) {
        const isStopWord = STOP_WORDS.has(word);
        const hasQuery = word.includes(queryLower);
        const isLongEnough = word.length >= 3;
        if (!isStopWord && isLongEnough && hasQuery) {
          wordMap.set(word, (wordMap.get(word) || 0) + 1);
        }
      }
    }

    if (row.tags) {
      const tagWords = row.tags
        .split(',')
        .map((t: string) => t.trim().toLowerCase())
        .filter((t: string) => t.length >= 3);
      for (const word of tagWords) {
        if (!STOP_WORDS.has(word) && word.includes(queryLower)) {
          wordMap.set(word, (wordMap.get(word) || 0) + 1);
        }
      }
    }
  }

  if (wordMap.size === 0) {
    return [];
  }

  return Array.from(wordMap.entries())
    .map(([word, frequency]) => {
      let matchQuality = 0;
      if (word.startsWith(queryLower)) {
        matchQuality = 3;
      } else if (word.includes(queryLower)) {
        matchQuality = 2;
      } else {
        matchQuality = 1;
      }
      return { word, frequency, matchQuality };
    })
    .sort((a, b) => {
      if (a.matchQuality !== b.matchQuality) {
        return b.matchQuality - a.matchQuality;
      }
      if (a.frequency !== b.frequency) {
        return b.frequency - a.frequency;
      }
      return a.word.localeCompare(b.word);
    })
    .slice(0, limit)
    .map((item) => ({
      text: item.word,
      source: 'word',
      type: 'word' as const,
      frequency: item.frequency,
    }));
}

/**
 * Fetch title suggestions for the query, applying typo-tolerance
 * filtering + sorting when requested.
 */
export async function getTitleSuggestions(
  adapter: DatabaseAdapter,
  normalized: string,
  titleLimit: number,
  enableTypoTolerance: boolean
): Promise<SearchSuggestions[]> {
  const fetchLimit = enableTypoTolerance ? titleLimit * 3 : titleLimit;

  const sql = `
    SELECT DISTINCT
      si.title as suggestion,
      'title' as source,
      COUNT(*) as frequency,
      COALESCE(si.title_normalized, LOWER(si.title)) as title_normalized
    FROM search_index si
    INNER JOIN records r ON si.record_id = r.id
    WHERE (COALESCE(si.title_normalized, LOWER(si.title)) LIKE '%' || ? || '%')
      AND (r.workflow_state IS NULL OR r.workflow_state != 'internal_only')
    GROUP BY si.title, si.title_normalized
    ORDER BY frequency DESC, si.title
    LIMIT ?
  `;

  interface TitleSuggestionRow {
    suggestion: string;
    source: string;
    frequency?: number;
    title_normalized?: string;
  }
  const results = await adapter.query<TitleSuggestionRow>(sql, [
    normalized,
    fetchLimit,
  ]);

  if (!enableTypoTolerance || results.length >= titleLimit) {
    return results.slice(0, titleLimit).map((row) => ({
      text: row.suggestion,
      source: row.source,
      type: 'title' as const,
      frequency: row.frequency || 1,
    }));
  }

  const suggestionsWithSimilarity = results.map((row) => {
    const similarity = calculateTypoSimilarity(
      normalized,
      row.title_normalized || ''
    );
    return {
      text: row.suggestion,
      source: row.source,
      frequency: row.frequency || 1,
      similarity,
    };
  });

  suggestionsWithSimilarity.sort((a, b) => {
    if (a.similarity >= 0.9 && b.similarity < 0.9) return -1;
    if (a.similarity < 0.9 && b.similarity >= 0.9) return 1;

    if (a.similarity >= 0.7 && b.similarity >= 0.7) {
      if (Math.abs(a.similarity - b.similarity) > 0.05) {
        return b.similarity - a.similarity;
      }
      if (a.frequency !== b.frequency) {
        return b.frequency - a.frequency;
      }
    } else if (a.similarity >= 0.7) {
      return -1;
    } else if (b.similarity >= 0.7) {
      return 1;
    } else {
      return 0;
    }

    return a.text.localeCompare(b.text);
  });

  return suggestionsWithSimilarity
    .filter((item) => item.similarity >= 0.7 || item.similarity >= 0.5)
    .slice(0, titleLimit)
    .map((item) => ({
      text: item.text,
      source: item.source,
      type: 'title' as const,
      frequency: item.frequency,
    }));
}
