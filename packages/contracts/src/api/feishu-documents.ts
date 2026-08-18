export interface FeishuDocumentSearchRequest {
  query: string;
  pageSize?: number;
}

export interface FeishuDocumentSearchResult {
  title: string;
  url: string;
  summary?: string;
  ownerName?: string;
  updatedAt?: number;
  entityType?: string;
}

export interface FeishuDocumentSearchResponse {
  query: string;
  results: FeishuDocumentSearchResult[];
  total: number;
  hasMore: boolean;
}

export interface FeishuDocumentSearchErrorResponse {
  error: string;
  code:
    | 'FEISHU_AUTH_REQUIRED'
    | 'FEISHU_SEARCH_FAILED'
    | 'INVALID_QUERY';
  reconnectUrl?: string;
}
