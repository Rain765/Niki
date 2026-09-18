import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '../types';
import { submitChatRunToolResult } from '../providers/daemon';
import { pendingPresentationQuestion } from './native-presentation-questions';

/** The original workspace owns sending; the parent only presents the question and collects the answer. */
export function useNativePresentationQuestions({ projectId, enabled, messages, canSend, onSend }: {
  projectId: string; enabled: boolean; messages: ChatMessage[]; canSend: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [submitted, setSubmitted] = useState<Set<string>>(() => new Set());
  const pending = useMemo(() => pendingPresentationQuestion(messages, submitted), [messages, submitted]);
  const current = useRef({ pending, canSend, onSend });
  current.current = { pending, canSend, onSend };
  const sending = useRef(false);
  useEffect(() => {
    if (!enabled || window.parent === window) return;
    window.parent.postMessage({ type: 'niki:ppt:question', projectId, question: pending }, window.location.origin);
  }, [enabled, pending, projectId]);
  useEffect(() => {
    if (!enabled || window.parent === window) return;
    const receive = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== 'niki:ppt:answer' || event.data.projectId !== projectId) return;
      const { pending: request, canSend: ready, onSend: send } = current.current;
      if (!request || event.data.id !== request.id || typeof event.data.content !== 'string' || !event.data.content.trim() || sending.current) return;
      sending.current = true;
      let ok = false;
      try {
        if (request.runId && request.toolUseId) {
          const response = await submitChatRunToolResult(request.runId, request.toolUseId, event.data.content);
          ok = response.ok;
          // Only a definitively rejected delivery may fall back to a new turn. Never duplicate an uncertain network delivery.
          if (!ok && response.status !== 404 && response.status !== 410 && response.status !== 400) throw new Error('answer-delivery-failed');
        }
        if (!ok) {
          if (!ready) throw new Error('workspace-busy');
          await send(event.data.content);
          ok = true;
        }
        setSubmitted(old => new Set(old).add(request.id));
      } catch { /* Keep the question and the user's selection available for retry. */ }
      finally {
        sending.current = false;
        window.parent.postMessage({ type: 'niki:ppt:answer-result', projectId, id: request.id, ok }, window.location.origin);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [enabled, projectId]);
}
