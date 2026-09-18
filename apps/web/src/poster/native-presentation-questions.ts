import type { ChatMessage } from '../types';
import { splitOnQuestionForms, type QuestionForm } from '../artifacts/question-form';

export type PresentationQuestion = { question: string; multiSelect: boolean; options: { label: string; description?: string }[] };
export type PresentationQuestionRequest = {
  id: string; runId?: string; toolUseId?: string;
  questions?: PresentationQuestion[]; form?: QuestionForm;
};

/** Only unanswered questions from the current assistant turn can interrupt the presentation canvas. */
export function pendingPresentationQuestion(messages: ChatMessage[], submitted: ReadonlySet<string>): PresentationQuestionRequest | null {
  const latest = messages.at(-1);
  if (!latest || latest.role !== 'assistant') return null;
  const answered = new Set(messages.flatMap(message => (message.events ?? [])
    .filter(event => event.kind === 'tool_result' && !event.isError)
    .map(event => event.kind === 'tool_result' ? event.toolUseId : '')));
  const active = latest.runStatus === 'running' || latest.runStatus === 'queued';
  const rejected = new Set((latest.events ?? []).filter(event => event.kind === 'tool_result' && event.isError).map(event => event.kind === 'tool_result' ? event.toolUseId : ''));
  for (const event of latest.events ?? []) {
    if (event.kind !== 'tool_use' || !/(?:AskUserQuestion|ask_user_question|request_user_input)$/.test(event.name) || answered.has(event.id) || (active && rejected.has(event.id))) continue;
    const id = `${latest.id}:${event.id}`;
    if (submitted.has(id)) continue;
    const input = event.input as { questions?: unknown } | null;
    if (!Array.isArray(input?.questions)) continue;
    const questions: PresentationQuestion[] = input.questions.flatMap(raw => {
      if (!raw || typeof raw.question !== 'string' || !raw.question.trim()) return [];
      const options = Array.isArray(raw.options) ? raw.options.flatMap((option: unknown) => {
        if (typeof option === 'string') return [{ label: option }];
        if (!option || typeof option !== 'object' || !('label' in option) || typeof option.label !== 'string') return [];
        return [{ label: option.label, description: 'description' in option && typeof option.description === 'string' ? option.description : undefined }];
      }) : [];
      return [{ question: raw.question, multiSelect: raw.multiSelect === true, options }];
    });
    if (questions.length) return { id, runId: latest.runId, toolUseId: event.id, questions };
  }
  // Text forms become actionable only when the turn is no longer producing content.
  if (latest.runStatus === 'running' || latest.runStatus === 'queued') return null;
  for (const segment of splitOnQuestionForms(latest.content)) {
    if (segment.kind !== 'form') continue;
    const id = `${latest.id}:form:${segment.form.id}`;
    if (!submitted.has(id)) return { id, form: segment.form };
  }
  return null;
}
