'use client';

import type {
  FeishuDocumentReadErrorResponse,
  FeishuDocumentReadResponse,
  FeishuDocumentSearchErrorResponse,
  FeishuDocumentSearchResponse,
  FeishuDocumentSearchResult,
} from '@open-design/contracts';
import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/Icon';

const FEISHU_DOCUMENT_HOST = /(^|\.)feishu\.cn$/i;
const FEISHU_DOCUMENT_PATH = /^\/(docx|wiki)\/[^/?#]+/i;
const FEISHU_DOCUMENT_URL_IN_TEXT = /https:\/\/(?:[a-z0-9-]+\.)*feishu\.cn\/(?:docx|wiki)\/[a-z0-9_-]+/i;

export function parseFeishuDocumentUrl(value: string): string | null {
  const candidate = value.match(FEISHU_DOCUMENT_URL_IN_TEXT)?.[0];
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== 'https:'
      || !FEISHU_DOCUMENT_HOST.test(url.hostname)
      || !FEISHU_DOCUMENT_PATH.test(url.pathname)
    ) {
      return null;
    }
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function cleanHighlightedText(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/<\/?h>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function formatUpdatedAt(value: number | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null;
  const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(milliseconds));
}

function SearchResult({ result }: { result: FeishuDocumentSearchResult }) {
  const updatedAt = formatUpdatedAt(result.updatedAt);
  const metadata = [result.ownerName, updatedAt].filter(Boolean).join(' · ');
  return (
    <a
      className="document-search__result"
      href={result.url}
      target="_blank"
      rel="noreferrer"
    >
      <span className="document-search__result-icon" aria-hidden="true">
        <Icon name="file" size={19} />
      </span>
      <span className="document-search__result-copy">
        <strong>{cleanHighlightedText(result.title) || 'Untitled document'}</strong>
        {result.summary ? <small>{cleanHighlightedText(result.summary)}</small> : null}
        {metadata ? <span>{metadata}</span> : null}
      </span>
      <Icon name="external-link" size={18} />
    </a>
  );
}

export function DocumentSearch() {
  const [value, setValue] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<FeishuDocumentSearchResult[]>([]);
  const [document, setDocument] = useState<FeishuDocumentReadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<(
    FeishuDocumentReadErrorResponse | FeishuDocumentSearchErrorResponse
  ) | null>(null);
  const requestIdRef = useRef(0);
  const documentUrl = useMemo(() => parseFeishuDocumentUrl(value), [value]);
  const hasOutput = loading || Boolean(submittedQuery) || Boolean(document) || Boolean(error);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = value.trim();
    if (!query || loading) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setSubmittedQuery(documentUrl ? '' : query);
    setDocument(null);
    setResults([]);
    try {
      const endpoint = documentUrl
        ? '/api/feishu/documents/read'
        : '/api/feishu/documents/search';
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(documentUrl
          ? { url: documentUrl }
          : { query, pageSize: 12 }),
      });
      const body = await response.json() as (
        | FeishuDocumentReadResponse
        | FeishuDocumentReadErrorResponse
        | FeishuDocumentSearchResponse
        | FeishuDocumentSearchErrorResponse
      );
      if (!response.ok) {
        throw body;
      }
      if (requestId !== requestIdRef.current) return;
      if (documentUrl) {
        setDocument(body as FeishuDocumentReadResponse);
      } else {
        setResults((body as FeishuDocumentSearchResponse).results);
      }
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      const candidate = cause as Partial<
        FeishuDocumentReadErrorResponse | FeishuDocumentSearchErrorResponse
      >;
      setResults([]);
      setDocument(null);
      setError({
        code: candidate.code ?? (documentUrl ? 'FEISHU_READ_FAILED' : 'FEISHU_SEARCH_FAILED'),
        error: candidate.error ?? (documentUrl
          ? 'Could not read this Feishu document. Please try again.'
          : 'Could not search Feishu. Please try again.'),
        ...(candidate.reconnectUrl ? { reconnectUrl: candidate.reconnectUrl } : {}),
      });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  return (
    <section
      className={`document-search${hasOutput ? ' has-results' : ''}`}
      aria-label="Feishu document search"
    >
      <div className="document-search__hero">
        <h2>What do you want to find?</h2>
        <form className="document-search__form" onSubmit={submit}>
          <span className="document-search__leading" aria-hidden="true">
            <Icon name={documentUrl ? 'link' : 'search'} size={20} />
          </span>
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search Feishu documents or paste a link"
            aria-label="Search Feishu documents or paste a link"
            autoComplete="off"
            autoFocus
          />
          <button
            type="submit"
            aria-label={documentUrl ? 'Read Feishu document' : 'Search documents'}
            disabled={!value.trim() || loading}
          >
            {loading ? <Icon name="spinner" size={19} /> : <Icon name="arrow-up" size={20} />}
          </button>
        </form>
        <p className="document-search__hint">
          {documentUrl
            ? 'Feishu link detected · Read with view-only access'
            : 'Search only shows documents you already have permission to view'}
        </p>
      </div>

      {hasOutput ? (
        <div
          className={`document-search__results${document ? ' has-document' : ''}`}
          aria-live="polite"
        >
          {loading ? (
            <div className="document-search__empty">
              <Icon name="spinner" size={22} />
              <strong>{documentUrl ? 'Reading Feishu document…' : 'Searching Feishu…'}</strong>
            </div>
          ) : error ? (
            <div className="document-search__empty is-error">
              <Icon name="info" size={22} />
              <strong>{error.error}</strong>
              {error.reconnectUrl ? (
                <a href={error.reconnectUrl}>Reconnect Feishu</a>
              ) : null}
            </div>
          ) : document ? (
            <article className="document-search__document">
              <header>
                <span className="document-search__result-icon" aria-hidden="true">
                  <Icon name="file" size={19} />
                </span>
                <span>
                  <strong>{document.title}</strong>
                  <small>{document.sourceType === 'wiki' ? 'Feishu Wiki document' : 'Feishu document'}</small>
                </span>
                <a href={document.url} target="_blank" rel="noreferrer">
                  Open in Feishu
                  <Icon name="external-link" size={16} />
                </a>
              </header>
              <pre>{document.content || 'This document is empty.'}</pre>
              {document.truncated ? (
                <p>Preview shortened because this document is very long.</p>
              ) : null}
            </article>
          ) : results.length > 0 ? (
            <>
              <header>
                <h3>Results for “{submittedQuery}”</h3>
                <span>{results.length} found</span>
              </header>
              <div className="document-search__result-list">
                {results.map((result, index) => (
                  <SearchResult key={`${result.url}:${index}`} result={result} />
                ))}
              </div>
            </>
          ) : (
            <div className="document-search__empty">
              <Icon name="search" size={22} />
              <strong>No matching documents</strong>
              <span>Try another title, keyword, or paste a Feishu link.</span>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
