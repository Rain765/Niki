'use client';

import type {
  FeishuDocumentReadErrorResponse,
  FeishuDocumentReadResponse,
  FeishuDocumentSearchErrorResponse,
  FeishuDocumentSearchResponse,
  FeishuDocumentSearchResult,
} from '@open-design/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/Icon';
import {
  createConversation,
  createProject,
  listConversations,
  listMessages,
  listProjects,
  patchConversation,
  saveMessage,
} from '../state/projects';
import type {
  ChatMessage,
  Conversation,
  Project,
  ProjectMetadata,
} from '../types';
import { randomUUID } from '../utils/uuid';

const FEISHU_DOCUMENT_HOST = /(^|\.)feishu\.cn$/i;
const FEISHU_DOCUMENT_PATH = /^\/(docx|wiki)\/[^/?#]+/i;
const FEISHU_DOCUMENT_URL_IN_TEXT = /https:\/\/(?:[a-z0-9-]+\.)*feishu\.cn\/(?:docx|wiki)\/[a-z0-9_-]+/i;
const DOCUMENT_EVENT_PREFIX = 'niki-feishu-document:';
const MAX_RECENT_THREADS = 18;

interface WorkspaceThread extends Conversation {
  projectName: string;
}

interface PersistedDocumentEvent {
  url: string;
  documentId: string;
  sourceType: 'docx' | 'wiki';
  title: string;
  content: string;
  truncated: boolean;
}

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

function relativeDate(value: number): string {
  const elapsed = Date.now() - value;
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 3_600_000) return `${Math.max(1, Math.floor(elapsed / 60_000))}m`;
  if (elapsed < 86_400_000) return `${Math.max(1, Math.floor(elapsed / 3_600_000))}h`;
  if (elapsed < 604_800_000) return `${Math.max(1, Math.floor(elapsed / 86_400_000))}d`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(value);
}

function recentGroup(value: number): 'Today' | 'Previous 7 days' | 'Older' {
  const age = Date.now() - value;
  if (age < 86_400_000) return 'Today';
  if (age < 604_800_000) return 'Previous 7 days';
  return 'Older';
}

function isDocumentWorkspaceProject(project: Project): boolean {
  return project.metadata?.documentWorkspace?.source === 'feishu';
}

function instructionFromValue(value: string, url: string): string {
  const instruction = value.replace(url, '').trim();
  return instruction || 'Summarize this document';
}

function summarizeDocumentContent(content: string): string {
  const normalized = content.trim();
  if (!normalized) return 'This document is empty.';
  if (normalized.length <= 7_000) return normalized;

  const paragraphs = normalized
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const selected: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (selected.length >= 14 || length + paragraph.length > 6_500) break;
    selected.push(paragraph);
    length += paragraph.length;
  }
  return `${selected.join('\n\n')}\n\n…`;
}

function answerFromDocument(content: string, query: string): string {
  const paragraphs = content
    .split(/\n{2,}|\n(?=[一二三四五六七八九十0-9]+[、.])/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 8);
  const compactQuery = query.toLocaleLowerCase();
  const latinTokens = compactQuery.match(/[a-z0-9_-]{2,}/g) ?? [];
  const hanCharacters = [...compactQuery]
    .filter((character) => /[\p{Script=Han}]/u.test(character))
    .filter((character) => !'的了是在有和与及请问一下什么怎么是否'.includes(character));
  const tokens = [...new Set([...latinTokens, ...hanCharacters])];
  const ranked = paragraphs
    .map((paragraph, index) => ({
      paragraph,
      index,
      score: tokens.reduce(
        (score, token) => score + (paragraph.toLocaleLowerCase().includes(token) ? 1 : 0),
        0,
      ),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const matches = ranked.filter((item) => item.score > 0).slice(0, 3);
  const selected = matches.length > 0 ? matches : ranked.slice(0, 3);
  if (selected.length === 0) return 'The source document does not contain readable text.';
  return selected.map((item) => item.paragraph).join('\n\n');
}

function documentEvent(document: FeishuDocumentReadResponse): ChatMessage['events'] {
  return [{
    kind: 'raw',
    line: `${DOCUMENT_EVENT_PREFIX}${JSON.stringify(document)}`,
  }];
}

function documentFromMessages(messages: ChatMessage[]): FeishuDocumentReadResponse | null {
  for (const message of messages) {
    for (const event of message.events ?? []) {
      if (event.kind !== 'raw' || !event.line.startsWith(DOCUMENT_EVENT_PREFIX)) continue;
      try {
        const candidate = JSON.parse(event.line.slice(DOCUMENT_EVENT_PREFIX.length)) as (
          Partial<PersistedDocumentEvent>
        );
        if (
          typeof candidate.url === 'string'
          && typeof candidate.title === 'string'
          && typeof candidate.content === 'string'
          && (candidate.sourceType === 'docx' || candidate.sourceType === 'wiki')
        ) {
          return {
            url: candidate.url,
            documentId: candidate.documentId ?? candidate.url.split('/').pop() ?? '',
            sourceType: candidate.sourceType,
            title: candidate.title,
            content: candidate.content,
            truncated: candidate.truncated === true,
          };
        }
      } catch {
        // Ignore malformed legacy metadata and keep looking for a valid event.
      }
    }
  }
  return null;
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

interface ComposerProps {
  compact?: boolean;
  documentUrl: string | null;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  value: string;
}

function DocumentComposer({
  compact = false,
  documentUrl,
  loading,
  onChange,
  onSubmit,
  value,
}: ComposerProps) {
  return (
    <form
      className={`document-search__form${compact ? ' is-compact' : ''}`}
      onSubmit={onSubmit}
    >
      <span className="document-search__leading" aria-hidden="true">
        <Icon name={documentUrl ? 'link' : 'search'} size={20} />
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={compact
          ? 'Ask about this document or paste another Feishu link'
          : 'Search Feishu documents or paste a link'}
        aria-label="Search Feishu documents or paste a link"
        autoComplete="off"
        autoFocus={!compact}
      />
      <button
        type="submit"
        aria-label={documentUrl ? 'Read Feishu document' : 'Search documents'}
        disabled={!value.trim() || loading}
      >
        {loading ? <Icon name="spinner" size={19} /> : <Icon name="arrow-up" size={20} />}
      </button>
    </form>
  );
}

export function DocumentSearch() {
  const [value, setValue] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<FeishuDocumentSearchResult[]>([]);
  const [document, setDocument] = useState<FeishuDocumentReadResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [workspaceProjects, setWorkspaceProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<WorkspaceThread[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [view, setView] = useState<'new' | 'project' | 'thread'>('new');
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<(
    FeishuDocumentReadErrorResponse | FeishuDocumentSearchErrorResponse
  ) | null>(null);
  const requestIdRef = useRef(0);
  const documentUrl = useMemo(() => parseFeishuDocumentUrl(value), [value]);
  const hasOutput = loading || Boolean(submittedQuery) || Boolean(document) || Boolean(error);

  const refreshWorkspace = useCallback(async () => {
    setWorkspaceLoading(true);
    const projects = (await listProjects()).filter(isDocumentWorkspaceProject);
    const conversations = await Promise.all(projects.map(async (project) => ({
      project,
      conversations: await listConversations(project.id),
    })));
    const nextThreads = conversations
      .flatMap(({ project, conversations: projectConversations }) => (
        projectConversations
          .filter((conversation) => Boolean(conversation.title))
          .map((conversation) => ({ ...conversation, projectName: project.name }))
      ))
      .sort((left, right) => right.updatedAt - left.updatedAt);
    setWorkspaceProjects(projects);
    setThreads(nextThreads);
    setWorkspaceLoading(false);
    return { projects, threads: nextThreads };
  }, []);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const startNewChat = useCallback((projectId?: string | null) => {
    requestIdRef.current += 1;
    setActiveProjectId(projectId ?? activeProjectId);
    setActiveConversation(null);
    setDocument(null);
    setMessages([]);
    setResults([]);
    setSubmittedQuery('');
    setError(null);
    setValue('');
    setLoading(false);
    setView('new');
    setSidebarOpen(false);
  }, [activeProjectId]);

  const openProject = useCallback((projectId: string) => {
    requestIdRef.current += 1;
    setActiveProjectId(projectId);
    setActiveConversation(null);
    setDocument(null);
    setMessages([]);
    setResults([]);
    setSubmittedQuery('');
    setError(null);
    setView('project');
    setSidebarOpen(false);
  }, []);

  const openThread = useCallback(async (thread: WorkspaceThread) => {
    setThreadLoading(true);
    setError(null);
    setActiveProjectId(thread.projectId);
    setActiveConversation(thread);
    setView('thread');
    setSidebarOpen(false);
    const savedMessages = await listMessages(thread.projectId, thread.id);
    const savedDocument = documentFromMessages(savedMessages);
    setMessages(savedMessages);
    setDocument(savedDocument);
    setValue('');
    if (!savedDocument) {
      setError({
        code: 'FEISHU_READ_FAILED',
        error: 'This saved document could not be restored.',
      });
    }
    setThreadLoading(false);
  }, []);

  const createWorkspaceProject = useCallback(async () => {
    const suggestedName = `Document project ${workspaceProjects.length + 1}`;
    const name = window.prompt('Project name', suggestedName)?.trim();
    if (!name) return null;
    const created = await createProject({
      name,
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: 'other',
        documentWorkspace: { version: 1, source: 'feishu' },
      },
    });
    if (!created) return null;
    await refreshWorkspace();
    setActiveProjectId(created.project.id);
    setView('project');
    setSidebarOpen(false);
    return created;
  }, [refreshWorkspace, workspaceProjects.length]);

  const ensureTargetProject = useCallback(async (): Promise<{
    project: Project;
    conversationId?: string;
  } | null> => {
    const selected = workspaceProjects.find((project) => project.id === activeProjectId);
    if (selected) return { project: selected };
    const existing = workspaceProjects[0];
    if (existing) return { project: existing };
    const created = await createProject({
      name: 'My documents',
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: 'other',
        documentWorkspace: { version: 1, source: 'feishu' },
      } satisfies ProjectMetadata,
    });
    return created
      ? { project: created.project, conversationId: created.conversationId }
      : null;
  }, [activeProjectId, workspaceProjects]);

  const persistDocument = useCallback(async (
    nextDocument: FeishuDocumentReadResponse,
    originalValue: string,
  ) => {
    const target = await ensureTargetProject();
    if (!target) return;
    const conversation = target.conversationId
      ? await patchConversation(target.project.id, target.conversationId, {
        title: nextDocument.title,
      })
      : await createConversation(target.project.id, nextDocument.title);
    if (!conversation) return;
    const now = Date.now();
    const nextMessages: ChatMessage[] = [{
      id: randomUUID(),
      role: 'user',
      content: instructionFromValue(originalValue, nextDocument.url),
      createdAt: now,
    }, {
      id: randomUUID(),
      role: 'assistant',
      agentName: 'Niki',
      content: summarizeDocumentContent(nextDocument.content),
      events: documentEvent(nextDocument),
      createdAt: now + 1,
    }];
    await saveMessage(target.project.id, conversation.id, nextMessages[0]!);
    await saveMessage(target.project.id, conversation.id, nextMessages[1]!);
    setActiveProjectId(target.project.id);
    setActiveConversation(conversation);
    setMessages(nextMessages);
    setView('thread');
    await refreshWorkspace();
  }, [ensureTargetProject, refreshWorkspace]);

  const submitFollowUp = useCallback(async (query: string) => {
    if (!document || !activeConversation || !activeProjectId) return;
    const now = Date.now();
    const nextMessages: ChatMessage[] = [{
      id: randomUUID(),
      role: 'user',
      content: query,
      createdAt: now,
    }, {
      id: randomUUID(),
      role: 'assistant',
      agentName: 'Niki',
      content: answerFromDocument(document.content, query),
      createdAt: now + 1,
    }];
    setMessages((current) => [...current, ...nextMessages]);
    setValue('');
    await saveMessage(activeProjectId, activeConversation.id, nextMessages[0]!);
    await saveMessage(activeProjectId, activeConversation.id, nextMessages[1]!);
    await refreshWorkspace();
  }, [activeConversation, activeProjectId, document, refreshWorkspace]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = value.trim();
    if (!query || loading) return;
    if (!documentUrl && view === 'thread' && document && activeConversation) {
      await submitFollowUp(query);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setSubmittedQuery(documentUrl ? '' : query);
    setDocument(null);
    setMessages([]);
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
      if (!response.ok) throw body;
      if (requestId !== requestIdRef.current) return;
      if (documentUrl) {
        const nextDocument = body as FeishuDocumentReadResponse;
        setDocument(nextDocument);
        await persistDocument(nextDocument, query);
      } else {
        setResults((body as FeishuDocumentSearchResponse).results);
        setView('new');
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

  const recentGroups = useMemo(() => {
    const groups = new Map<string, WorkspaceThread[]>();
    for (const thread of threads.slice(0, MAX_RECENT_THREADS)) {
      const group = recentGroup(thread.updatedAt);
      groups.set(group, [...(groups.get(group) ?? []), thread]);
    }
    return groups;
  }, [threads]);
  const activeProject = workspaceProjects.find((project) => project.id === activeProjectId) ?? null;
  const activeProjectThreads = threads.filter((thread) => thread.projectId === activeProjectId);

  const sidebar = (
    <aside className="document-workspace__sidebar" aria-label="Document workspace navigation">
      <div className="document-workspace__sidebar-head">
        <strong>NIKI DOCS</strong>
        <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
          <Icon name="close" size={17} />
        </button>
      </div>
      <button
        type="button"
        className={`document-workspace__new${view === 'new' ? ' is-active' : ''}`}
        onClick={() => startNewChat()}
      >
        <Icon name="plus" size={17} />
        <span>New chat</span>
      </button>

      <div className="document-workspace__section-heading">
        <span>Projects</span>
        <button type="button" onClick={() => void createWorkspaceProject()} aria-label="New project">
          <Icon name="plus" size={15} />
        </button>
      </div>
      <div className="document-workspace__nav-list">
        {workspaceLoading && workspaceProjects.length === 0 ? (
          <span className="document-workspace__nav-empty">Loading…</span>
        ) : workspaceProjects.length === 0 ? (
          <span className="document-workspace__nav-empty">Your document projects will appear here.</span>
        ) : workspaceProjects.map((project) => {
          const count = threads.filter((thread) => thread.projectId === project.id).length;
          return (
            <button
              type="button"
              key={project.id}
              className={view === 'project' && activeProjectId === project.id ? 'is-active' : ''}
              onClick={() => openProject(project.id)}
              title={project.name}
            >
              <Icon name="folder" size={16} />
              <span>{project.name}</span>
              <small>{count}</small>
            </button>
          );
        })}
      </div>

      <div className="document-workspace__section-heading is-recent"><span>Recent</span></div>
      <div className="document-workspace__recent-list">
        {threads.length === 0 && !workspaceLoading ? (
          <span className="document-workspace__nav-empty">No document summaries yet.</span>
        ) : [...recentGroups.entries()].map(([group, groupThreads]) => (
          <div className="document-workspace__recent-group" key={group}>
            <small>{group}</small>
            {groupThreads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={view === 'thread' && activeConversation?.id === thread.id ? 'is-active' : ''}
                onClick={() => void openThread(thread)}
                title={thread.title ?? 'Untitled document'}
              >
                <Icon name="file" size={15} />
                <span>{thread.title ?? 'Untitled document'}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );

  return (
    <section className="document-workspace">
      <button
        type="button"
        className="document-workspace__mobile-menu"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open document navigation"
      >
        <Icon name="menu" size={20} />
      </button>
      <div className={`document-workspace__sidebar-slot${sidebarOpen ? ' is-open' : ''}`}>
        {sidebar}
      </div>
      <button
        type="button"
        className={`document-workspace__scrim${sidebarOpen ? ' is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-label="Close document navigation"
      />

      <div className="document-workspace__main">
        {view === 'project' ? (
          <section className="document-project" aria-label="Document project">
            <header>
              <span className="document-project__icon"><Icon name="folder" size={22} /></span>
              <div>
                <span>PROJECT</span>
                <h2>{activeProject?.name ?? 'Document project'}</h2>
                <p>{activeProjectThreads.length} saved {activeProjectThreads.length === 1 ? 'summary' : 'summaries'}</p>
              </div>
              <button type="button" onClick={() => startNewChat(activeProjectId)}>
                <Icon name="plus" size={16} />
                New chat
              </button>
            </header>
            {activeProjectThreads.length > 0 ? (
              <div className="document-project__threads">
                {activeProjectThreads.map((thread) => (
                  <button type="button" key={thread.id} onClick={() => void openThread(thread)}>
                    <span className="document-search__result-icon"><Icon name="file" size={18} /></span>
                    <span>
                      <strong>{thread.title}</strong>
                      <small>Updated {relativeDate(thread.updatedAt)} ago</small>
                    </span>
                    <Icon name="chevron-right" size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="document-search__empty">
                <Icon name="file" size={22} />
                <strong>No summaries in this project</strong>
                <span>Start a new chat and paste a Feishu document link.</span>
              </div>
            )}
          </section>
        ) : view === 'thread' ? (
          <section className="document-thread" aria-label="Document summary">
            {threadLoading ? (
              <div className="document-search__empty">
                <Icon name="spinner" size={22} />
                <strong>Loading summary…</strong>
              </div>
            ) : error && !document ? (
              <div className="document-search__empty is-error">
                <Icon name="info" size={22} />
                <strong>{error.error}</strong>
              </div>
            ) : document ? (
              <>
                <header className="document-thread__topbar">
                  <div>
                    <small>{activeProject?.name ?? 'My documents'}</small>
                    <h2>{document.title}</h2>
                  </div>
                  <a href={document.url} target="_blank" rel="noreferrer">
                    Open in Feishu
                    <Icon name="external-link" size={16} />
                  </a>
                </header>
                <div className="document-thread__messages">
                  {messages.map((message, index) => (
                    <article
                      key={message.id}
                      className={`document-thread__message is-${message.role}`}
                    >
                      {message.role === 'assistant' ? (
                        <span className="document-thread__speaker">Niki</span>
                      ) : null}
                      <pre>{message.content}</pre>
                      {message.role === 'assistant' && index === 1 ? (
                        <details className="document-thread__source">
                          <summary>Source document</summary>
                          <pre>{document.content || 'This document is empty.'}</pre>
                        </details>
                      ) : null}
                    </article>
                  ))}
                </div>
                <div className="document-thread__composer">
                  <DocumentComposer
                    compact
                    documentUrl={documentUrl}
                    loading={loading}
                    onChange={setValue}
                    onSubmit={submit}
                    value={value}
                  />
                  <p>Ask a follow-up grounded in this document, or paste another Feishu link.</p>
                </div>
              </>
            ) : null}
          </section>
        ) : (
          <section
            className={`document-search${hasOutput ? ' has-results' : ''}`}
            aria-label="Feishu document search"
          >
            <div className="document-search__hero">
              <h2>What do you want to find?</h2>
              <DocumentComposer
                documentUrl={documentUrl}
                loading={loading}
                onChange={setValue}
                onSubmit={submit}
                value={value}
              />
              <p className="document-search__hint">
                {documentUrl
                  ? 'Feishu link detected · Read with view-only access'
                  : 'Search only shows documents you already have permission to view'}
              </p>
            </div>

            {hasOutput ? (
              <div className="document-search__results" aria-live="polite">
                {loading ? (
                  <div className="document-search__empty">
                    <Icon name="spinner" size={22} />
                    <strong>{documentUrl ? 'Reading Feishu document…' : 'Searching Feishu…'}</strong>
                  </div>
                ) : error ? (
                  <div className="document-search__empty is-error">
                    <Icon name="info" size={22} />
                    <strong>{error.error}</strong>
                    {error.reconnectUrl ? <a href={error.reconnectUrl}>Reconnect Feishu</a> : null}
                  </div>
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
                ) : submittedQuery ? (
                  <div className="document-search__empty">
                    <Icon name="search" size={22} />
                    <strong>No matching documents</strong>
                    <span>Try another title, keyword, or paste a Feishu link.</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        )}
      </div>
    </section>
  );
}
