import { useState } from 'react';
import { useI18n } from '../i18n';
import { Button } from '../components/Button';
import { renderMarkdown } from '../runtime/markdown';
import { QuestionFormView } from '../components/QuestionForm';
import type { PresentationQuestionRequest } from './native-presentation-questions';

export function NativePresentationQuestionForm({ request, busy, error, onSubmit }: {
  request: PresentationQuestionRequest; busy: boolean; error: string; onSubmit: (content: string) => void;
}) {
  const { locale } = useI18n(); const zh = locale.startsWith('zh');
  const [choices, setChoices] = useState<Record<number, string[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const questions = request.questions ?? [];
  const ready = questions.every((_, index) => custom[index]?.trim() || choices[index]?.length);
  return <div className="native-ppt-question">
    {request.continuation ? <form onSubmit={event => {
      event.preventDefault();
      if (busy) return;
      const feedback = custom[0]?.trim();
      onSubmit(feedback
        ? (zh ? `请根据以下补充要求继续生成演示稿。\n${feedback}` : `Continue generating the deck with this feedback.\n${feedback}`)
        : (zh ? '确认按上述方案继续生成完整演示稿。' : 'Proceed with the plan above and generate the complete deck.'));
    }}>
      <div className="native-ppt-question__summary">{renderMarkdown(request.continuation)}</div>
      <textarea rows={2} aria-label={zh ? '补充要求' : 'Additional requirements'} placeholder={zh ? '补充要求（可选）' : 'Additional requirements (optional)'} value={custom[0] ?? ''} disabled={busy} onChange={event => setCustom({ 0: event.target.value })} />
      <div className="native-ppt-question__actions"><Button type="submit" variant="primary" disabled={busy} loading={busy}>{zh ? '继续生成' : 'Continue generating'}</Button></div>
    </form> : request.form ? <fieldset disabled={busy} className="native-ppt-question__form">
      <QuestionFormView form={{ ...request.form, submitLabel: zh ? '继续生成' : 'Continue generating' }} interactive={!busy} onSubmit={text => onSubmit(text)} />
    </fieldset> : <form onSubmit={event => {
      event.preventDefault();
      if (!ready || busy) return;
      onSubmit(questions.map((question, index) => `${question.question}\n${custom[index]?.trim() || (question.multiSelect ? choices[index]!.map(value => `- ${value}`).join('\n') : choices[index]![0])}`).join('\n\n'));
    }}>
      {questions.map((question, index) => <fieldset key={index} disabled={busy} className="native-ppt-question__field">
        <legend>{question.question}</legend>
        <div className="native-ppt-question__options">
          {question.options.map(option => <button type="button" key={option.label} aria-pressed={!custom[index]?.trim() && Boolean(choices[index]?.includes(option.label))} onClick={() => {
            setCustom(old => ({ ...old, [index]: '' }));
            setChoices(old => ({ ...old, [index]: question.multiSelect
              ? old[index]?.includes(option.label) ? old[index]!.filter(value => value !== option.label) : [...(old[index] ?? []), option.label]
              : [option.label] }));
          }}><strong>{option.label}</strong>{option.description && <span>{option.description}</span>}</button>)}
        </div>
        <textarea rows={2} aria-label={zh ? `自定义回答：${question.question}` : `Your answer: ${question.question}`} placeholder={zh ? '也可以填写你的想法' : 'Or write your own answer'} value={custom[index] ?? ''} onChange={event => setCustom(old => ({ ...old, [index]: event.target.value }))} />
      </fieldset>)}
      <div className="native-ppt-question__actions"><Button type="submit" variant="primary" disabled={!ready} loading={busy}>{zh ? (busy ? '正在提交…' : '继续生成') : (busy ? 'Submitting…' : 'Continue generating')}</Button></div>
    </form>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
