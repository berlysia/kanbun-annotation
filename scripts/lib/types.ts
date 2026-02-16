export type AdrStatus = 'Proposed' | 'Accepted' | 'InProgress' | 'Complete';

export interface AdrSubstatus {
  [key: string]: AdrStatus;
}

export interface AdrFrontmatter {
  status: AdrStatus;
  deps?: number[];
  plan?: string;
  substatus?: AdrSubstatus;
}

export interface AdrInfo {
  number: number;
  slug: string;
  title: string;
  frontmatter: AdrFrontmatter;
  filePath: string;
  planExists: boolean;
  planValidated: boolean;
  bodyRefs: number[];
}

export type AdrPhase = 'investigation' | 'planning' | 'validation' | 'implementation' | 'done';
