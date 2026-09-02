'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';

type CoachStage = 'setup' | 'diagnostic' | 'chunks' | 'transfer' | 'part2' | 'part3' | 'review';
type QuestionSource = 'simulated' | 'pasted' | 'own';
type RecallStatus = 'active' | 'prompted' | 'not-yet';

interface TargetChunk {
  chunk: string;
  meaning: string;
  collocations: string;
  register: string;
  replaceable: string;
  example: string;
  paraphrase: string;
}

interface TransferTask {
  part: 'Part 1' | 'Part 2' | 'Part 3';
  question: string;
  situationHint: string;
  chunkStart: string;
  fullExpression: string;
}

const STAGES: Array<{ id: CoachStage; label: string; number: string }> = [
  { id: 'setup', label: '设置', number: '00' },
  { id: 'diagnostic', label: '诊断', number: '01' },
  { id: 'chunks', label: '语块', number: '02' },
  { id: 'transfer', label: '迁移', number: '03' },
  { id: 'part2', label: '长回答', number: '04' },
  { id: 'part3', label: '深挖', number: '05' },
  { id: 'review', label: '复盘', number: '06–07' },
];

const TOPICS = ['工作与学习', '家乡', '科技', '环境', '人物', '经历'];

const DIAGNOSTIC_QUESTIONS: Record<string, string[]> = {
  工作与学习: [
    'Do you work or are you a student?',
    'What do you enjoy most about your work or studies?',
    'Is there anything you would like to change about it?',
  ],
  家乡: [
    'Where is your hometown?',
    'What do you like most about living there?',
    'Has your hometown changed much in recent years?',
  ],
  科技: [
    'What piece of technology do you use most often?',
    'How does it help you in your daily life?',
    'Is there any technology you find difficult to use?',
  ],
  环境: [
    'Is your neighbourhood a clean place?',
    'What do you personally do to reduce waste?',
    'Do people in your area care about environmental issues?',
  ],
  人物: [
    'Who do you spend the most time with?',
    'What qualities do you value in a friend?',
    'Do you find it easy to meet new people?',
  ],
  经历: [
    'Do you enjoy trying new things?',
    'What is something new you learned recently?',
    'Do you prefer planning an experience or being spontaneous?',
  ],
};

const TARGET_CHUNKS: TargetChunk[] = [
  {
    chunk: 'play a major role in [something]',
    meaning: '在某件事中发挥重要作用',
    collocations: 'play a major role in daily life / education / a decision',
    register: '中性；口语和较正式讨论都自然',
    replaceable: '[something] 可替换为名词或动名词短语',
    example: 'Technology plays a major role in the way I study.',
    paraphrase: 'be an important part of [something]',
  },
  {
    chunk: 'find it [adjective] to [do something]',
    meaning: '觉得做某事是……的',
    collocations: 'find it useful / difficult / relaxing to…',
    register: '中性；非常适合自然口语',
    replaceable: '[adjective] 和 [do something] 都可以替换',
    example: 'I find it easier to focus when I study in the morning.',
    paraphrase: 'It is [adjective] for me to [do something].',
  },
  {
    chunk: 'one of the main reasons is [reason]',
    meaning: '其中一个主要原因是……',
    collocations: 'one of the main reasons is that… / is the fact that…',
    register: '中性；适合解释原因或展开观点',
    replaceable: '[reason] 可替换为名词或 that 从句',
    example: 'One of the main reasons is that it saves me a lot of time.',
    paraphrase: 'A key reason for this is [reason].',
  },
];

const TRANSFER_TASKS: TransferTask[][] = [
  [
    { part: 'Part 1', question: 'What helps you stay productive?', situationHint: '想一个真实的习惯、工具或环境。', chunkStart: '… plays a major role in …', fullExpression: 'A quiet workspace plays a major role in helping me stay productive.' },
    { part: 'Part 2', question: 'Describe a person who has influenced you.', situationHint: '说清楚这个人在你的某个决定或习惯中产生了什么影响。', chunkStart: '… played a major role in …', fullExpression: 'My first manager played a major role in shaping the way I communicate at work.' },
    { part: 'Part 3', question: 'What influences young people’s career choices?', situationHint: '可以从家庭、学校、收入或兴趣中选择一个因素。', chunkStart: '… plays a major role in …', fullExpression: 'Family expectations can play a major role in young people’s career choices.' },
  ],
  [
    { part: 'Part 1', question: 'Do you enjoy learning new skills?', situationHint: '说一个你亲自学过的技能，以及难或容易在哪里。', chunkStart: 'I find it … to …', fullExpression: 'I find it rewarding to learn skills that I can use straight away.' },
    { part: 'Part 2', question: 'Describe a place where you like to study or work.', situationHint: '描述你在那里集中注意力、放松或完成任务的感受。', chunkStart: 'I find it … to … there.', fullExpression: 'I find it much easier to concentrate there because it is usually quiet.' },
    { part: 'Part 3', question: 'Is it easier to work from home than in an office?', situationHint: '先选自己的立场，再说明哪类人或任务会不同。', chunkStart: 'Some people find it … to …', fullExpression: 'Some people find it difficult to separate work from their personal life at home.' },
  ],
  [
    { part: 'Part 1', question: 'Why do you use your phone so often?', situationHint: '选择一个最真实、最具体的原因。', chunkStart: 'One of the main reasons is …', fullExpression: 'One of the main reasons is that I use it to stay in touch with my family.' },
    { part: 'Part 2', question: 'Describe an experience you would like to have again.', situationHint: '解释这段经历为什么值得再来一次。', chunkStart: 'One of the main reasons is …', fullExpression: 'One of the main reasons is that I felt completely free from my daily routine.' },
    { part: 'Part 3', question: 'Why do people spend money on experiences?', situationHint: '可以比较体验与实物带来的价值。', chunkStart: 'One of the main reasons is …', fullExpression: 'One of the main reasons is that experiences often create longer-lasting memories.' },
  ],
];

const PART_TWO_CUES: Record<string, { title: string; prompts: string[] }> = {
  工作与学习: { title: 'Describe an experience that taught you something useful.', prompts: ['what the experience was', 'when and where it happened', 'what you learned', 'and explain why the lesson was useful'] },
  家乡: { title: 'Describe a place in your hometown that you enjoy visiting.', prompts: ['where it is', 'what it looks like', 'what you do there', 'and explain why you enjoy visiting it'] },
  科技: { title: 'Describe a piece of technology that is useful to you.', prompts: ['what it is', 'when you started using it', 'how you use it', 'and explain why it is useful to you'] },
  环境: { title: 'Describe something you do to help the environment.', prompts: ['what you do', 'when you started doing it', 'how difficult it is', 'and explain why you think it helps'] },
  人物: { title: 'Describe a person who has had a positive influence on you.', prompts: ['who the person is', 'how you know them', 'what they did', 'and explain how they influenced you'] },
  经历: { title: 'Describe a memorable experience you had recently.', prompts: ['what happened', 'where and when it happened', 'who was with you', 'and explain why it was memorable'] },
};

const PART_THREE_QUESTIONS: Record<string, string[]> = {
  工作与学习: ['What skills are most valuable in the workplace today?', 'How has technology changed the way people study?', 'Should practical skills receive more attention than academic knowledge?'],
  家乡: ['Why do some people feel strongly attached to their hometown?', 'How can a growing population change a town or city?', 'Should governments preserve old neighbourhoods when cities develop?'],
  科技: ['Why do some people adopt new technology faster than others?', 'How has technology changed the way people communicate?', 'Should there be limits on the use of artificial intelligence?'],
  环境: ['Why is it difficult for people to change environmentally harmful habits?', 'Do individuals or companies have more influence on the environment?', 'Should governments make environmentally friendly choices cheaper?'],
  人物: ['What qualities make someone a good role model?', 'Are young people influenced more by family or public figures?', 'Has social media changed the meaning of personal influence?'],
  经历: ['Why do some people seek unfamiliar experiences?', 'Can difficult experiences be more valuable than enjoyable ones?', 'How does travel change the way people understand other cultures?'],
};

function shorten(value: string, fallback: string): string {
  const clean = value.trim();
  if (!clean) return fallback;
  return clean.length > 120 ? `${clean.slice(0, 117)}…` : clean;
}

function StageProgress({ stage }: { stage: CoachStage }) {
  const currentIndex = STAGES.findIndex((item) => item.id === stage);
  return (
    <nav className="ielts-coach__stages" aria-label="训练阶段">
      {STAGES.map((item, index) => (
        <div key={item.id} className={`${index === currentIndex ? 'is-current' : ''}${index < currentIndex ? ' is-complete' : ''}`}>
          <span>{index < currentIndex ? <Icon name="check" size={12} /> : item.number}</span>
          <small>{item.label}</small>
        </div>
      ))}
    </nav>
  );
}

function OptionGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (next: string) => void }) {
  return (
    <fieldset className="ielts-coach__option-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button key={option} type="button" aria-pressed={value === option} className={value === option ? 'is-active' : ''} onClick={() => onChange(option)}>{option}</button>
        ))}
      </div>
    </fieldset>
  );
}

function VoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持本地录音，请直接开口后记录转写。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onstop = () => {
        if (audioUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start();
      setError(null);
      setRecording(true);
    } catch {
      setError('未获得麦克风权限。你仍可直接回答，并在下方记录原话。');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  return (
    <div className="ielts-coach__recorder">
      <button type="button" className={recording ? 'is-recording' : ''} onClick={recording ? stopRecording : () => void startRecording()}>
        <Icon name={recording ? 'stop' : 'mic'} size={15} /> {recording ? '结束录音' : '开始录音'}
      </button>
      {audioUrl ? <audio controls src={audioUrl} aria-label="本题录音回放" /> : <span>录音仅保留在当前浏览器，不会自动上传。</span>}
      {error ? <small role="status">{error}</small> : null}
    </div>
  );
}

function AnswerComposer({ value, onChange, placeholder, label = '回答转写' }: { value: string; onChange: (next: string) => void; placeholder: string; label?: string }) {
  const inputId = useId();
  return (
    <div className="ielts-coach__answer">
      <label htmlFor={inputId}><span>{label}</span><small>先完整说完，再记录关键词或转写；教练不会中途打断。</small></label>
      <VoiceRecorder />
      <textarea id={inputId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={5} />
    </div>
  );
}

export function IeltsChunkCoach() {
  const [stage, setStage] = useState<CoachStage>('setup');
  const [level, setLevel] = useState('不确定');
  const [target, setTarget] = useState('6.5');
  const [topic, setTopic] = useState('工作与学习');
  const [source, setSource] = useState<QuestionSource>('simulated');
  const [customQuestions, setCustomQuestions] = useState('');
  const [diagnosticIndex, setDiagnosticIndex] = useState(0);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState(['', '', '']);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunkExamples, setChunkExamples] = useState(['', '', '']);
  const [transferIndex, setTransferIndex] = useState(0);
  const [transferAnswers, setTransferAnswers] = useState(Array.from({ length: 9 }, () => ''));
  const [transferHints, setTransferHints] = useState(Array.from({ length: 9 }, () => 0));
  const [part2Keywords, setPart2Keywords] = useState('');
  const [part2Answer, setPart2Answer] = useState('');
  const [part2Revision, setPart2Revision] = useState('');
  const [prepSeconds, setPrepSeconds] = useState(60);
  const [prepRunning, setPrepRunning] = useState(false);
  const [speakingSeconds, setSpeakingSeconds] = useState(120);
  const [speakingRunning, setSpeakingRunning] = useState(false);
  const [part3Index, setPart3Index] = useState(0);
  const [part3Answers, setPart3Answers] = useState(['', '', '']);
  const [paraphraseTried, setParaphraseTried] = useState(false);

  const simulatedDiagnosticQuestions = DIAGNOSTIC_QUESTIONS[topic] ?? DIAGNOSTIC_QUESTIONS['工作与学习']!;
  const customQuestionList = customQuestions.split('\n').map((question) => question.trim()).filter(Boolean);
  const diagnosticQuestions = source === 'simulated'
    ? simulatedDiagnosticQuestions
    : Array.from({ length: 3 }, (_, index) => customQuestionList[index] ?? simulatedDiagnosticQuestions[index] ?? 'Tell me more about this topic.');
  const diagnosticSourceLabel = source === 'simulated' ? '模拟题' : source === 'pasted' ? '官方样题（用户提供）' : '自备题目';
  const partTwoCue = PART_TWO_CUES[topic] ?? PART_TWO_CUES['工作与学习']!;
  const partThreeQuestions = PART_THREE_QUESTIONS[topic] ?? PART_THREE_QUESTIONS['工作与学习']!;
  const currentChunk = TARGET_CHUNKS[chunkIndex];
  const currentTransferChunkIndex = Math.floor(transferIndex / 3);
  const currentTransferTask = TRANSFER_TASKS[currentTransferChunkIndex]?.[transferIndex % 3];
  const currentHintLevel = transferHints[transferIndex] ?? 0;
  const currentStageIndex = STAGES.findIndex((item) => item.id === stage);
  const completedPercent = Math.round((currentStageIndex / (STAGES.length - 1)) * 100);

  useEffect(() => {
    if (!prepRunning || prepSeconds <= 0) return;
    const timer = window.setInterval(() => setPrepSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [prepRunning, prepSeconds]);

  useEffect(() => {
    if (prepSeconds === 0) setPrepRunning(false);
  }, [prepSeconds]);

  useEffect(() => {
    if (!speakingRunning || speakingSeconds <= 0) return;
    const timer = window.setInterval(() => setSpeakingSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [speakingRunning, speakingSeconds]);

  useEffect(() => {
    if (speakingSeconds === 0) setSpeakingRunning(false);
  }, [speakingSeconds]);

  const recallStatuses = useMemo<RecallStatus[]>(() => TARGET_CHUNKS.map((_, index) => {
    const hintLevels = transferHints.slice(index * 3, index * 3 + 3);
    const answers = transferAnswers.slice(index * 3, index * 3 + 3);
    if (answers.some(Boolean) && hintLevels.every((hint) => hint === 0)) return 'active';
    if (answers.some(Boolean)) return 'prompted';
    return 'not-yet';
  }), [transferAnswers, transferHints]);

  function updateList(setter: React.Dispatch<React.SetStateAction<string[]>>, index: number, value: string) {
    setter((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  }

  function startSession() {
    setDiagnosticIndex(0);
    setStage('diagnostic');
  }

  function continueDiagnostic() {
    if (diagnosticIndex < 2) {
      setDiagnosticIndex((index) => index + 1);
      return;
    }
    setStage('chunks');
  }

  function continueChunkPractice() {
    if (chunkIndex < TARGET_CHUNKS.length - 1) {
      setChunkIndex((index) => index + 1);
      return;
    }
    setStage('transfer');
  }

  function continueTransfer() {
    if (transferIndex < 8) {
      setTransferIndex((index) => index + 1);
      return;
    }
    setStage('part2');
  }

  function continuePart3() {
    if (part3Index < 2) {
      setPart3Index((index) => index + 1);
      return;
    }
    setStage('review');
  }

  return (
    <section className="ielts-coach" aria-label="IELTS Speaking Chunk Coach">
      <header className="ielts-coach__header">
        <div>
          <span className="english-practice__kicker">IELTS SPEAKING · CHUNK COACH</span>
          <h2>把语块练成随时能用的表达</h2>
          <p>真实任务形式，训练主动调用和跨题迁移；不背范文，不堆生僻词。</p>
        </div>
        <div className="ielts-coach__score">
          <span>本次进度</span>
          <strong>{completedPercent}%</strong>
        </div>
      </header>

      <StageProgress stage={stage} />

      {stage === 'setup' ? (
        <div className="ielts-coach__panel ielts-coach__setup">
          <div className="ielts-coach__panel-heading">
            <span>00 · SESSION SETUP</span>
            <h3>先设定今天的训练</h3>
            <p>目标语块固定为 3 个，整场训练约 20–30 分钟。</p>
          </div>
          <div className="ielts-coach__setup-grid">
            <OptionGroup label="当前口语水平" options={['不确定', '5.5', '6', '6.5', '7+']} value={level} onChange={setLevel} />
            <OptionGroup label="目标分数" options={['6', '6.5', '7', '7.5+']} value={target} onChange={setTarget} />
          </div>
          <OptionGroup label="今日话题" options={TOPICS} value={topic} onChange={setTopic} />
          <fieldset className="ielts-coach__option-group">
            <legend>题目来源</legend>
            <div>
              <button type="button" aria-pressed={source === 'simulated'} className={source === 'simulated' ? 'is-active' : ''} onClick={() => setSource('simulated')}>教练生成模拟题</button>
              <button type="button" aria-pressed={source === 'pasted'} className={source === 'pasted' ? 'is-active' : ''} onClick={() => setSource('pasted')}>粘贴官方样题</button>
              <button type="button" aria-pressed={source === 'own'} className={source === 'own' ? 'is-active' : ''} onClick={() => setSource('own')}>自备题目</button>
            </div>
          </fieldset>
          {source === 'simulated' ? (
            <p className="ielts-coach__notice"><Icon name="info" size={15} /> 本页生成的题目均标注为“模拟题”，不会声称是当季真题或预测题。</p>
          ) : (
            <label className="ielts-coach__answer">
              <span>{source === 'pasted' ? '粘贴题目' : '输入自备题目'}<small>每行一道；后续会保留原题标签。</small></span>
              <textarea value={customQuestions} onChange={(event) => setCustomQuestions(event.target.value)} rows={4} placeholder="Paste or type your questions here…" />
            </label>
          )}
          <div className="ielts-coach__session-summary">
            <span>当前 {level}</span><span>目标 {target}</span><span>{topic}</span><span>3 个语块</span>
          </div>
          <button type="button" className="english-practice__primary ielts-coach__continue" onClick={startSession}>
            开始 Part 1 诊断 <Icon name="chevron-right" size={17} />
          </button>
        </div>
      ) : null}

      {stage === 'diagnostic' ? (
        <div className="ielts-coach__panel">
          <div className="ielts-coach__task-meta"><span>第一阶段 · Part 1 诊断</span><b>{diagnosticIndex + 1} / 3</b></div>
          <div className="ielts-coach__question-card">
            <span>{diagnosticSourceLabel} · Part 1</span>
            <h3>{diagnosticQuestions[diagnosticIndex]}</h3>
            <p>请先自然回答。不要预先找“高级表达”，也不必强行说很长。</p>
          </div>
          <AnswerComposer
            key={`diagnostic-${diagnosticIndex}`}
            value={diagnosticAnswers[diagnosticIndex] ?? ''}
            onChange={(value) => updateList(setDiagnosticAnswers, diagnosticIndex, value)}
            placeholder="先开口回答，再在这里记录你的原话或关键词…"
          />
          <button type="button" className="english-practice__primary ielts-coach__continue" onClick={continueDiagnostic}>
            {diagnosticIndex < 2 ? '完成回答，下一题' : '完成诊断，查看目标语块'} <Icon name="chevron-right" size={17} />
          </button>
        </div>
      ) : null}

      {stage === 'chunks' && currentChunk ? (
        <div className="ielts-coach__panel">
          <div className="ielts-coach__task-meta"><span>第二阶段 · 可替换积木</span><b>{chunkIndex + 1} / 3</b></div>
          <article className="ielts-chunk-card">
            <span>目标语块 {String(chunkIndex + 1).padStart(2, '0')}</span>
            <h3>{currentChunk.chunk}</h3>
            <div className="ielts-chunk-card__details">
              <div><small>整体含义</small><p>{currentChunk.meaning}</p></div>
              <div><small>常见搭配</small><p>{currentChunk.collocations}</p></div>
              <div><small>语体</small><p>{currentChunk.register}</p></div>
              <div><small>可替换部分</small><p>{currentChunk.replaceable}</p></div>
            </div>
            <blockquote>{currentChunk.example}</blockquote>
            <p className="ielts-chunk-card__paraphrase"><b>近义转述</b>{currentChunk.paraphrase}</p>
          </article>
          <AnswerComposer
            key={`chunk-${chunkIndex}`}
            label="现在用你的真实经历完成它"
            value={chunkExamples[chunkIndex] ?? ''}
            onChange={(value) => updateList(setChunkExamples, chunkIndex, value)}
            placeholder="不要照抄例句；把方括号里的部分换成你自己的内容…"
          />
          <button type="button" className="english-practice__primary ielts-coach__continue" onClick={continueChunkPractice}>
            {chunkIndex < 2 ? '保存并练下一个语块' : '进入跨题迁移'} <Icon name="chevron-right" size={17} />
          </button>
        </div>
      ) : null}

      {stage === 'transfer' && currentTransferTask ? (
        <div className="ielts-coach__panel">
          <div className="ielts-coach__task-meta"><span>第三阶段 · 跨题迁移</span><b>{transferIndex + 1} / 9</b></div>
          <div className="ielts-coach__transfer-labels">
            {['Part 1', 'Part 2', 'Part 3'].map((part) => <span key={part} className={currentTransferTask.part === part ? 'is-active' : ''}>{part}</span>)}
          </div>
          <div className="ielts-coach__question-card">
            <span>模拟题 · {currentTransferTask.part} · 语块 {currentTransferChunkIndex + 1}</span>
            <h3>{currentTransferTask.question}</h3>
            <p>换一个具体内容来回答，不要机械重复上一句。</p>
          </div>
          {currentHintLevel > 0 ? (
            <div className="ielts-coach__hint" aria-live="polite">
              <span>提示 {currentHintLevel} / 3</span>
              <p>{currentHintLevel === 1 ? currentTransferTask.situationHint : currentHintLevel === 2 ? currentTransferTask.chunkStart : currentTransferTask.fullExpression}</p>
            </div>
          ) : null}
          <AnswerComposer
            key={`transfer-${transferIndex}`}
            value={transferAnswers[transferIndex] ?? ''}
            onChange={(value) => updateList(setTransferAnswers, transferIndex, value)}
            placeholder="先尝试主动调用今天的语块…"
          />
          <div className="ielts-coach__actions">
            <button type="button" onClick={() => setTransferHints((current) => current.map((hint, index) => index === transferIndex ? Math.min(3, hint + 1) : hint))} disabled={currentHintLevel >= 3}>
              {currentHintLevel === 0 ? '我卡住了，给提示' : currentHintLevel < 3 ? '再给一点提示' : '已显示完整表达'}
            </button>
            <button type="button" className="english-practice__primary" onClick={continueTransfer}>{transferIndex < 8 ? '换一道题' : '进入 Part 2'} <Icon name="chevron-right" size={17} /></button>
          </div>
        </div>
      ) : null}

      {stage === 'part2' ? (
        <div className="ielts-coach__panel">
          <div className="ielts-coach__task-meta"><span>第四阶段 · Part 2 长回答</span><b>1–2 MIN</b></div>
          <div className="ielts-coach__cue-card">
            <span>模拟题 · Part 2</span>
            <h3>{partTwoCue.title}</h3>
            <p>You should say:</p>
            <ul>{partTwoCue.prompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul>
          </div>
          <div className="ielts-coach__timers">
            <article><span>准备</span><strong>0:{String(prepSeconds).padStart(2, '0')}</strong><button type="button" onClick={() => setPrepRunning((running) => !running)}>{prepRunning ? '暂停' : prepSeconds < 60 ? '继续' : '开始 1 分钟准备'}</button></article>
            <article><span>回答</span><strong>{Math.floor(speakingSeconds / 60)}:{String(speakingSeconds % 60).padStart(2, '0')}</strong><button type="button" onClick={() => setSpeakingRunning((running) => !running)}>{speakingRunning ? '结束回答' : speakingSeconds < 120 ? '继续回答' : '开始回答'}</button></article>
          </div>
          <label className="ielts-coach__answer"><span>准备关键词<small>只记人物、地点、转折和故事顺序，不写完整答案。</small></span><textarea rows={3} value={part2Keywords} onChange={(event) => setPart2Keywords(event.target.value)} placeholder="who → where → problem → change → lesson" /></label>
          <AnswerComposer label="长回答转写" value={part2Answer} onChange={setPart2Answer} placeholder="完整说完后，记录你的原话或关键句…" />
          <div className="ielts-coach__repair">
            <h4>只重说最影响表达的部分</h4>
            <p>先从原回答里选 1–2 句你最不满意的表达，再用今天的语块或近义转述重说。这里不替你编造经历。</p>
            <textarea rows={3} value={part2Revision} onChange={(event) => setPart2Revision(event.target.value)} placeholder="把需要重说的部分写在这里…" />
          </div>
          <button type="button" className="english-practice__primary ielts-coach__continue" onClick={() => setStage('part3')}>进入 Part 3 深挖 <Icon name="chevron-right" size={17} /></button>
        </div>
      ) : null}

      {stage === 'part3' ? (
        <div className="ielts-coach__panel">
          <div className="ielts-coach__task-meta"><span>第五阶段 · Part 3 深挖</span><b>{part3Index + 1} / 3</b></div>
          <div className="ielts-coach__question-card">
            <span>模拟题 · Part 3</span>
            <h3>{partThreeQuestions[part3Index]}</h3>
            <p>可以按“观点—原因—例子或对比”展开，但不必每次套同一个模板。</p>
          </div>
          <AnswerComposer key={`part3-${part3Index}`} value={part3Answers[part3Index] ?? ''} onChange={(value) => updateList(setPart3Answers, part3Index, value)} placeholder="尝试自然调用一个旧语块，并把理由说具体…" />
          <label className="ielts-coach__check"><input type="checkbox" checked={paraphraseTried} onChange={(event) => setParaphraseTried(event.target.checked)} /><span>我尝试把今天的一个语块换一种说法</span></label>
          <button type="button" className="english-practice__primary ielts-coach__continue" onClick={continuePart3}>{part3Index < 2 ? '完成回答，下一题' : '完成训练并复盘'} <Icon name="chevron-right" size={17} /></button>
        </div>
      ) : null}

      {stage === 'review' ? (
        <div className="ielts-coach__panel ielts-coach__review">
          <div className="ielts-coach__task-meta"><span>第六、七阶段 · 官方维度复盘与清单</span><b>COMPLETE</b></div>
          <div className="ielts-coach__feedback-grid">
            {[
              ['流利与连贯', '你完成了从短答到长回答的连续训练。', '下一次减少回答开头的犹豫，并让原因与例子衔接得更清楚。'],
              ['词汇资源', `你练习了 ${TARGET_CHUNKS.length} 个可迁移语块。`, '优先保证搭配自然，同一语块在不同题里换具体内容。'],
              ['语法范围与准确性', '你尝试了带替换槽的完整句型。', '复盘时重点检查主谓一致、时态和从句是否完整。'],
              ['发音', '你为 Part 1、Part 2 和 Part 3 都保留了开口环节。', '下次注意重音落在关键词，而不是每个词都同样用力。'],
            ].map(([title, good, improve]) => (
              <article key={title}><h4>{title}</h4><p><b>做得好</b>{good}</p><p><b>最值得改进</b>{improve}</p></article>
            ))}
          </div>
          <p className="ielts-coach__band-note">这不是官方评分。当前界面只记录本次训练表现，不给出确定分数；完整语音分析接入后才会提供谨慎的近似区间和原话证据。</p>
          <section className="ielts-coach__review-list">
            <div className="ielts-coach__panel-heading"><span>TODAY'S CHUNKS</span><h3>今天的复习清单</h3></div>
            {TARGET_CHUNKS.map((chunk, index) => (
              <article key={chunk.chunk}>
                <div><span>{String(index + 1).padStart(2, '0')}</span><h4>{chunk.chunk}</h4><em className={`is-${recallStatuses[index]}`}>{recallStatuses[index] === 'active' ? '主动调用' : recallStatuses[index] === 'prompted' ? '提示后调用' : '暂时不能调用'}</em></div>
                <p><b>可替换结构</b>{chunk.replaceable}</p>
                <p><b>你的真实例句</b>{shorten(chunkExamples[index] ?? '', '本次尚未记录')}</p>
                <p><b>跨题迁移</b>{shorten(transferAnswers[index * 3] ?? '', 'Part 1 未记录')} · {shorten(transferAnswers[index * 3 + 1] ?? '', 'Part 2 未记录')} · {shorten(transferAnswers[index * 3 + 2] ?? '', 'Part 3 未记录')}</p>
              </article>
            ))}
          </section>
          <section className="ielts-coach__tomorrow">
            <span>TOMORROW · BLIND TEST</span>
            <h3>明天盲测的 3 个新问题</h3>
            <ol><li>What makes a place feel comfortable to you?</li><li>Describe a decision that changed your daily routine.</li><li>Why do some habits last longer than others?</li></ol>
          </section>
          <button type="button" className="english-practice__primary ielts-coach__continue" onClick={() => setStage('setup')}>开始新的训练</button>
        </div>
      ) : null}
    </section>
  );
}
