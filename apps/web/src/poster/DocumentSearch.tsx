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
import { useI18n } from '../i18n';
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

const DOCUMENT_COPY = {
  en: {
    locale: 'en',
    untitled: 'Untitled document',
    justNow: 'Just now',
    minutes: (value: number) => `${value}m`,
    hours: (value: number) => `${value}h`,
    days: (value: number) => `${value}d`,
    today: 'Today',
    previous7Days: 'Previous 7 days',
    older: 'Older',
    summarize: 'Summarize this document',
    emptyDocument: 'This document is empty.',
    noReadableText: 'The source document does not contain readable text.',
    askPlaceholder: 'Ask about this document or paste another Feishu link',
    searchPlaceholder: 'Search Feishu documents or paste a link',
    inputLabel: 'Search Feishu documents or paste a link',
    readDocument: 'Read Feishu document',
    searchDocuments: 'Search documents',
    restoreFailed: 'This saved document could not be restored.',
    projectNamePrompt: 'Project name',
    projectName: (index: number) => `Document project ${index}`,
    myDocuments: 'My documents',
    readFailed: 'Could not read this Feishu document. Please try again.',
    searchFailed: 'Could not search Feishu. Please try again.',
    navigation: 'Document workspace navigation',
    closeNavigation: 'Close navigation',
    newChat: 'New chat',
    projects: 'Projects',
    newProject: 'New project',
    loading: 'Loading…',
    projectsEmpty: 'Your document projects will appear here.',
    recent: 'Recent',
    recentEmpty: 'No document summaries yet.',
    openNavigation: 'Open document navigation',
    project: 'PROJECT',
    projectLabel: 'Document project',
    savedSummaries: (count: number) => `${count} saved ${count === 1 ? 'summary' : 'summaries'}`,
    updatedAgo: (value: string) => `Updated ${value} ago`,
    projectEmpty: 'No summaries in this project',
    projectEmptyHint: 'Start a new chat and paste a Feishu document link.',
    summaryLabel: 'Document summary',
    loadingSummary: 'Loading summary…',
    openFeishu: 'Open in Feishu',
    sourceDocument: 'Source document',
    followUpHint: 'Ask a follow-up grounded in this document, or paste another Feishu link.',
    searchLabel: 'Feishu document search',
    heroTitle: 'What do you want to find?',
    linkDetected: 'Feishu link detected · Read with view-only access',
    permissionHint: 'Search only shows documents you already have permission to view',
    reading: 'Reading Feishu document…',
    searching: 'Searching Feishu…',
    reconnect: 'Reconnect Feishu',
    resultsFor: (query: string) => `Results for “${query}”`,
    found: (count: number) => `${count} found`,
    noMatches: 'No matching documents',
    noMatchesHint: 'Try another title, keyword, or paste a Feishu link.',
  },
  zh: {
    locale: 'zh-CN',
    untitled: '未命名文档',
    justNow: '刚刚',
    minutes: (value: number) => `${value} 分钟`,
    hours: (value: number) => `${value} 小时`,
    days: (value: number) => `${value} 天`,
    today: '今天',
    previous7Days: '过去 7 天',
    older: '更早',
    summarize: '总结这份文档',
    emptyDocument: '这份文档没有内容。',
    noReadableText: '源文档中没有可读取的文本。',
    askPlaceholder: '询问这份文档，或粘贴另一个飞书链接',
    searchPlaceholder: '搜索飞书文档或粘贴链接',
    inputLabel: '搜索飞书文档或粘贴链接',
    readDocument: '读取飞书文档',
    searchDocuments: '搜索文档',
    restoreFailed: '无法恢复这份已保存的文档。',
    projectNamePrompt: '项目名称',
    projectName: (index: number) => `文档项目 ${index}`,
    myDocuments: '我的文档',
    readFailed: '无法读取这份飞书文档，请重试。',
    searchFailed: '无法搜索飞书文档，请重试。',
    navigation: '文档工作区导航',
    closeNavigation: '关闭导航',
    newChat: '新建对话',
    projects: '项目',
    newProject: '新建项目',
    loading: '正在加载…',
    projectsEmpty: '文档项目会显示在这里。',
    recent: '最近',
    recentEmpty: '还没有文档摘要。',
    openNavigation: '打开文档导航',
    project: '项目',
    projectLabel: '文档项目',
    savedSummaries: (count: number) => `已保存 ${count} 份摘要`,
    updatedAgo: (value: string) => `${value}前更新`,
    projectEmpty: '此项目还没有摘要',
    projectEmptyHint: '新建对话并粘贴一个飞书文档链接。',
    summaryLabel: '文档摘要',
    loadingSummary: '正在加载摘要…',
    openFeishu: '在飞书中打开',
    sourceDocument: '源文档',
    followUpHint: '继续询问这份文档，或粘贴另一个飞书链接。',
    searchLabel: '飞书文档搜索',
    heroTitle: '你想查找什么？',
    linkDetected: '已识别飞书链接 · 将以只读权限读取',
    permissionHint: '搜索结果仅包含你已有权限查看的文档',
    reading: '正在读取飞书文档…',
    searching: '正在搜索飞书文档…',
    reconnect: '重新连接飞书',
    resultsFor: (query: string) => `“${query}”的搜索结果`,
    found: (count: number) => `找到 ${count} 项`,
    noMatches: '没有匹配的文档',
    noMatchesHint: '请尝试其他标题或关键词，或粘贴飞书链接。',
  },
} as const;

type DocumentCopy = (typeof DOCUMENT_COPY)[keyof typeof DOCUMENT_COPY];

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

function formatUpdatedAt(value: number | undefined, copy: DocumentCopy): string | null {
  if (!value || !Number.isFinite(value)) return null;
  const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
  return new Intl.DateTimeFormat(copy.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(milliseconds));
}

function relativeDate(value: number, copy: DocumentCopy): string {
  const elapsed = Date.now() - value;
  if (elapsed < 60_000) return copy.justNow;
  if (elapsed < 3_600_000) return copy.minutes(Math.max(1, Math.floor(elapsed / 60_000)));
  if (elapsed < 86_400_000) return copy.hours(Math.max(1, Math.floor(elapsed / 3_600_000)));
  if (elapsed < 604_800_000) return copy.days(Math.max(1, Math.floor(elapsed / 86_400_000)));
  return new Intl.DateTimeFormat(copy.locale, { month: 'short', day: 'numeric' }).format(value);
}

function recentGroup(value: number, copy: DocumentCopy): string {
  const age = Date.now() - value;
  if (age < 86_400_000) return copy.today;
  if (age < 604_800_000) return copy.previous7Days;
  return copy.older;
}

function isDocumentWorkspaceProject(project: Project): boolean {
  return project.metadata?.documentWorkspace?.source === 'feishu';
}

function instructionFromValue(value: string, url: string, copy: DocumentCopy): string {
  const instruction = value.replace(url, '').trim();
  return instruction || copy.summarize;
}

function summarizeDocumentContent(content: string, copy: DocumentCopy): string {
  const normalized = content.trim();
  if (!normalized) return copy.emptyDocument;
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

function answerFromDocument(content: string, query: string, copy: DocumentCopy): string {
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
  if (selected.length === 0) return copy.noReadableText;
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

function SearchResult({ result, copy }: { result: FeishuDocumentSearchResult; copy: DocumentCopy }) {
  const updatedAt = formatUpdatedAt(result.updatedAt, copy);
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
        <strong>{cleanHighlightedText(result.title) || copy.untitled}</strong>
        {result.summary ? <small>{cleanHighlightedText(result.summary)}</small> : null}
        {metadata ? <span>{metadata}</span> : null}
      </span>
      <Icon name="external-link" size={18} />
    </a>
  );
}

interface ComposerProps {
  copy: DocumentCopy;
  compact?: boolean;
  documentUrl: string | null;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  value: string;
}

function DocumentComposer({
  compact = false,
  copy,
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
          ? copy.askPlaceholder
          : copy.searchPlaceholder}
        aria-label={copy.inputLabel}
        autoComplete="off"
      />
      <button
        type="submit"
        aria-label={documentUrl ? copy.readDocument : copy.searchDocuments}
        disabled={!value.trim() || loading}
      >
        {loading ? <Icon name="spinner" size={19} /> : <Icon name="arrow-up" size={20} />}
      </button>
    </form>
  );
}

export function DocumentSearch() {
  const { locale } = useI18n();
  const copy = DOCUMENT_COPY[locale === 'zh-CN' ? 'zh' : 'en'];
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
        error: copy.restoreFailed,
      });
    }
    setThreadLoading(false);
  }, [copy.restoreFailed]);

  const createWorkspaceProject = useCallback(async () => {
    const suggestedName = copy.projectName(workspaceProjects.length + 1);
    const name = window.prompt(copy.projectNamePrompt, suggestedName)?.trim();
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
  }, [copy, refreshWorkspace, workspaceProjects.length]);

  const ensureTargetProject = useCallback(async (): Promise<{
    project: Project;
    conversationId?: string;
  } | null> => {
    const selected = workspaceProjects.find((project) => project.id === activeProjectId);
    if (selected) return { project: selected };
    const existing = workspaceProjects[0];
    if (existing) return { project: existing };
    const created = await createProject({
      name: copy.myDocuments,
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
  }, [activeProjectId, copy.myDocuments, workspaceProjects]);

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
      content: instructionFromValue(originalValue, nextDocument.url, copy),
      createdAt: now,
    }, {
      id: randomUUID(),
      role: 'assistant',
      agentName: 'Niki',
      content: summarizeDocumentContent(nextDocument.content, copy),
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
  }, [copy, ensureTargetProject, refreshWorkspace]);

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
      content: answerFromDocument(document.content, query, copy),
      createdAt: now + 1,
    }];
    setMessages((current) => [...current, ...nextMessages]);
    setValue('');
    await saveMessage(activeProjectId, activeConversation.id, nextMessages[0]!);
    await saveMessage(activeProjectId, activeConversation.id, nextMessages[1]!);
    await refreshWorkspace();
  }, [activeConversation, activeProjectId, copy, document, refreshWorkspace]);

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
          ? copy.readFailed
          : copy.searchFailed),
        ...(candidate.reconnectUrl ? { reconnectUrl: candidate.reconnectUrl } : {}),
      });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const recentGroups = useMemo(() => {
    const groups = new Map<string, WorkspaceThread[]>();
    for (const thread of threads.slice(0, MAX_RECENT_THREADS)) {
      const group = recentGroup(thread.updatedAt, copy);
      groups.set(group, [...(groups.get(group) ?? []), thread]);
    }
    return groups;
  }, [copy, threads]);
  const activeProject = workspaceProjects.find((project) => project.id === activeProjectId) ?? null;
  const activeProjectThreads = threads.filter((thread) => thread.projectId === activeProjectId);

  const sidebar = (
    <aside className="document-workspace__sidebar" aria-label={copy.navigation}>
      <div className="document-workspace__sidebar-head">
        <strong>NIKI DOCS</strong>
        <button type="button" onClick={() => setSidebarOpen(false)} aria-label={copy.closeNavigation}>
          <Icon name="close" size={17} />
        </button>
      </div>
      <button
        type="button"
        className={`document-workspace__new${view === 'new' ? ' is-active' : ''}`}
        onClick={() => startNewChat()}
      >
        <Icon name="plus" size={17} />
        <span>{copy.newChat}</span>
      </button>

      <div className="document-workspace__section-heading">
        <span>{copy.projects}</span>
        <button type="button" onClick={() => void createWorkspaceProject()} aria-label={copy.newProject}>
          <Icon name="plus" size={15} />
        </button>
      </div>
      <div className="document-workspace__nav-list">
        {workspaceLoading && workspaceProjects.length === 0 ? (
          <span className="document-workspace__nav-empty">{copy.loading}</span>
        ) : workspaceProjects.length === 0 ? (
          <span className="document-workspace__nav-empty">{copy.projectsEmpty}</span>
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

      <div className="document-workspace__section-heading is-recent"><span>{copy.recent}</span></div>
      <div className="document-workspace__recent-list">
        {threads.length === 0 && !workspaceLoading ? (
          <span className="document-workspace__nav-empty">{copy.recentEmpty}</span>
        ) : [...recentGroups.entries()].map(([group, groupThreads]) => (
          <div className="document-workspace__recent-group" key={group}>
            <small>{group}</small>
            {groupThreads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={view === 'thread' && activeConversation?.id === thread.id ? 'is-active' : ''}
                onClick={() => void openThread(thread)}
                title={thread.title ?? copy.untitled}
              >
                <Icon name="file" size={15} />
                <span>{thread.title ?? copy.untitled}</span>
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
        aria-label={copy.openNavigation}
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
        aria-label={copy.closeNavigation}
      />

      <div className="document-workspace__main">
        {view === 'project' ? (
          <section className="document-project" aria-label={copy.projectLabel}>
            <header>
              <span className="document-project__icon"><Icon name="folder" size={22} /></span>
              <div>
                <span>{copy.project}</span>
                <h2>{activeProject?.name ?? copy.projectLabel}</h2>
                <p>{copy.savedSummaries(activeProjectThreads.length)}</p>
              </div>
              <button type="button" onClick={() => startNewChat(activeProjectId)}>
                <Icon name="plus" size={16} />
                {copy.newChat}
              </button>
            </header>
            {activeProjectThreads.length > 0 ? (
              <div className="document-project__threads">
                {activeProjectThreads.map((thread) => (
                  <button type="button" key={thread.id} onClick={() => void openThread(thread)}>
                    <span className="document-search__result-icon"><Icon name="file" size={18} /></span>
                    <span>
                      <strong>{thread.title}</strong>
                      <small>{copy.updatedAgo(relativeDate(thread.updatedAt, copy))}</small>
                    </span>
                    <Icon name="chevron-right" size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="document-search__empty">
                <Icon name="file" size={22} />
                <strong>{copy.projectEmpty}</strong>
                <span>{copy.projectEmptyHint}</span>
              </div>
            )}
          </section>
        ) : view === 'thread' ? (
          <section className="document-thread" aria-label={copy.summaryLabel}>
            {threadLoading ? (
              <div className="document-search__empty">
                <Icon name="spinner" size={22} />
                <strong>{copy.loadingSummary}</strong>
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
                    <small>{activeProject?.name ?? copy.myDocuments}</small>
                    <h2>{document.title}</h2>
                  </div>
                  <a href={document.url} target="_blank" rel="noreferrer">
                    {copy.openFeishu}
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
                          <summary>{copy.sourceDocument}</summary>
                          <pre>{document.content || copy.emptyDocument}</pre>
                        </details>
                      ) : null}
                    </article>
                  ))}
                </div>
                <div className="document-thread__composer">
                  <DocumentComposer
                    compact
                    copy={copy}
                    documentUrl={documentUrl}
                    loading={loading}
                    onChange={setValue}
                    onSubmit={submit}
                    value={value}
                  />
                  <p>{copy.followUpHint}</p>
                </div>
              </>
            ) : null}
          </section>
        ) : (
          <section
            className={`document-search${hasOutput ? ' has-results' : ''}`}
            aria-label={copy.searchLabel}
          >
            <div className="document-search__hero">
              <h2>{copy.heroTitle}</h2>
              <DocumentComposer
                copy={copy}
                documentUrl={documentUrl}
                loading={loading}
                onChange={setValue}
                onSubmit={submit}
                value={value}
              />
              <p className="document-search__hint">
                {documentUrl
                  ? copy.linkDetected
                  : copy.permissionHint}
              </p>
            </div>

            {hasOutput ? (
              <div className="document-search__results" aria-live="polite">
                {loading ? (
                  <div className="document-search__empty">
                    <Icon name="spinner" size={22} />
                    <strong>{documentUrl ? copy.reading : copy.searching}</strong>
                  </div>
                ) : error ? (
                  <div className="document-search__empty is-error">
                    <Icon name="info" size={22} />
                    <strong>{error.error}</strong>
                    {error.reconnectUrl ? <a href={error.reconnectUrl}>{copy.reconnect}</a> : null}
                  </div>
                ) : results.length > 0 ? (
                  <>
                    <header>
                      <h3>{copy.resultsFor(submittedQuery)}</h3>
                      <span>{copy.found(results.length)}</span>
                    </header>
                    <div className="document-search__result-list">
                      {results.map((result, index) => (
                        <SearchResult key={`${result.url}:${index}`} result={result} copy={copy} />
                      ))}
                    </div>
                  </>
                ) : submittedQuery ? (
                  <div className="document-search__empty">
                    <Icon name="search" size={22} />
                    <strong>{copy.noMatches}</strong>
                    <span>{copy.noMatchesHint}</span>
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
