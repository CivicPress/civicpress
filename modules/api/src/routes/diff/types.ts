export interface DiffOptions {
  commit1?: string;
  commit2?: string;
  format?: 'unified' | 'side-by-side' | 'json';
  context?: number;
  showMetadata?: boolean;
  showContent?: boolean;
  wordLevel?: boolean;
  includeStats?: boolean;
}

export interface DiffResult {
  recordId: string;
  type: string;
  commit1: string;
  commit2: string;
  changes: {
    metadata: MetadataChange[];
    content: ContentDiff;
  };
  summary: DiffSummary;
}

export interface MetadataChange {
  field: string;
  oldValue?: string;
  newValue?: string;
  type: 'added' | 'removed' | 'modified';
}

export interface ContentDiff {
  unified?: string;
  sideBySide?: {
    left: DiffLine[];
    right: DiffLine[];
  };
  wordLevel?: {
    lines: WordLevelLine[];
  };
  stats: {
    linesAdded: number;
    linesRemoved: number;
    wordsAdded: number;
    wordsRemoved: number;
    filesChanged: number;
  };
}

export interface DiffLine {
  lineNumber: number;
  content: string;
  type: 'unchanged' | 'added' | 'removed' | 'context';
  wordChanges?: WordChange[];
}

export interface WordLevelLine {
  lineNumber: number;
  words: WordChange[];
}

export interface WordChange {
  word: string;
  type: 'unchanged' | 'added' | 'removed';
  position: number;
}

export interface DiffSummary {
  hasChanges: boolean;
  changeTypes: string[];
  severity: 'none' | 'minor' | 'major';
  totalFiles: number;
  totalChanges: number;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  message: string;
  changes: string[];
}
