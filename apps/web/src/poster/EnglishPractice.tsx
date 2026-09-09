'use client';

import type {
  EnglishPracticeCatalogResponse,
  EnglishPracticeLessonResponse,
  EnglishPracticeProgressResponse,
  EnglishPracticeProgressUpdate,
} from '@open-design/contracts';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { useI18n } from '../i18n';
import { IeltsChunkCoach } from './IeltsChunkCoach';

type Speaker = 'A' | 'B';
type PracticeView = 'home' | 'lesson' | 'vocabulary';
type LessonTab = 'dialogue' | 'practice';
type SpeechRate = 0.75 | 1 | 1.25;
type PracticeMode = 'scenes' | 'ielts';

interface Scenario {
  id: string;
  number: number;
  title: string;
  englishTitle: string;
  description: string;
  level: 'A1' | 'A2' | 'B1';
  icon: string;
  available: boolean;
}

interface DialogueLine {
  id: string;
  speaker: Speaker;
  english: string;
  chinese: string;
}

interface WordInfo {
  word: string;
  ipa: string;
  meaning: string;
  context: string;
}

interface PhraseInfo {
  phrase: string;
  meaning: string;
  alternatives: string[];
}

interface StoredProgress {
  listenedLineIds: string[];
  favorites: string[];
  sentenceOrderCompleted: boolean;
  shadowingCompleted: boolean;
  rolePlayCompleted: boolean;
}

const STORAGE_KEY = 'niki:daily-english-practice:v1';

const PRACTICE_COPY = {
  en: {
    practiceLabel: 'Daily English practice',
    modeLabel: 'English practice mode',
    scenes: 'Life scenarios',
    ielts: 'IELTS speaking coach',
    title: '10 classic life scenarios',
    subtitle: 'Practice one real-life situation each day: understand it, say it, then use it.',
    vocabulary: 'Vocabulary',
    today: 'Today’s pick · A2',
    coffeeShop: 'Ordering at a Coffee Shop',
    coffeeShopChinese: '咖啡店点餐',
    lessonMeta: '12 natural exchanges · about 8 minutes',
    progress: (value: number) => `Learning progress ${value}%`,
    continue: 'Continue',
    start: 'Start lesson',
    scenarioCourses: 'Scenario lessons',
    scenarioDetail: 'Classic, practical, and made for repetition',
    available: '1 / 10 available',
    comingSoon: 'Coming soon',
    returnCourses: 'Back to lessons',
    vocabularyTitle: 'Vocabulary',
    vocabularySubtitle: 'Review words you saved from the dialogue.',
    pronounce: (word: string) => `Pronounce ${word}`,
    removeVocabulary: 'Remove from vocabulary',
    vocabularyEmpty: 'No saved words yet',
    vocabularyEmptyHint: 'Open the coffee-shop lesson and select any word to save it.',
    firstLesson: 'Start the first lesson',
    lessonLabel: 'Ordering at a Coffee Shop lesson',
    allScenarios: 'All scenarios',
    customer: 'Customer',
    barista: 'Barista',
    dialogue: 'Dialogue',
    speakingPractice: 'Speaking practice',
    stopPlayback: 'Stop playback',
    playAll: 'Play all',
    speed: 'Playback speed',
    chinese: 'Chinese',
    listenOnly: 'Listen only',
    rolePlay: 'Role play',
    playA: 'I am A',
    playB: 'I am B',
    roleActive: 'Your lines are hidden; speak when it is your turn.',
    roleInactive: 'Choose a role and the system will read the other part.',
    playLine: (index: number) => `Play line ${index}`,
    tapToPlay: (index: number) => `Play line ${index}`,
    yourTurn: 'Your turn',
    yourTurnHint: 'Speak first, then play the reference pronunciation',
    keyPhrases: 'Key phrases',
    keyPhrasesHint: 'Use alternatives to express yourself more flexibly',
    shadowing: 'Shadowing practice',
    shadowingHint: 'Listen to the reference, then read the full sentence aloud.',
    listenReference: 'Play reference',
    complete: 'Completed',
    markShadowed: 'I repeated it',
    roleExercise: 'A/B role play',
    roleExerciseHint: 'Choose a role, return to the dialogue, and the system will hide your lines.',
    playCustomer: 'Play customer A',
    playBarista: 'Play barista B',
    sentenceOrder: 'Sentence order',
    sentenceOrderHint: 'Arrange the blocks to ask politely for oat milk instead of regular milk.',
    selectedWords: 'Selected words',
    selectBlocks: 'Choose word blocks below',
    reset: 'Reset',
    checkAnswer: 'Check answer',
    correct: 'Correct! This is a complete and polite substitution request.',
    tryAgain: 'Try again. Start with the polite request “Could I…”.',
    wordCard: (word: string) => `${word} word card`,
    closeWordCard: 'Close word card',
    close: 'Close',
    removeFavorite: 'Remove from favorites',
    addFavorite: 'Save word',
    chineseMeaning: 'Chinese meaning',
    currentContext: 'Current context',
    genericMeaning: 'Lesson vocabulary',
    genericContext: 'Use the play button to hear this word in the current sentence.',
  },
  zh: {
    practiceLabel: '每日英语练习',
    modeLabel: '英语训练模式',
    scenes: '生活场景',
    ielts: 'IELTS 口语教练',
    title: '10 个经典生活场景',
    subtitle: '每天练一个真实场景。先听懂，再开口，最后把表达用出来。',
    vocabulary: '生词本',
    today: '今日推荐 · A2',
    coffeeShop: '咖啡店点餐',
    coffeeShopChinese: 'Ordering at a Coffee Shop',
    lessonMeta: '12 轮自然对话 · 约 8 分钟',
    progress: (value: number) => `学习进度 ${value}%`,
    continue: '继续学习',
    start: '开始学习',
    scenarioCourses: '场景课程',
    scenarioDetail: '经典、实用、可反复练习',
    available: '1 / 10 已开放',
    comingSoon: '即将上线',
    returnCourses: '返回课程',
    vocabularyTitle: '生词本',
    vocabularySubtitle: '复习你在对话中收藏过的单词。',
    pronounce: (word: string) => `朗读 ${word}`,
    removeVocabulary: '移出生词本',
    vocabularyEmpty: '还没有收藏单词',
    vocabularyEmptyHint: '进入咖啡店课程，点击任意单词后就可以收藏。',
    firstLesson: '开始第一课',
    lessonLabel: '咖啡店点餐课程',
    allScenarios: '全部场景',
    customer: '顾客',
    barista: '店员',
    dialogue: '对话学习',
    speakingPractice: '开口练习',
    stopPlayback: '停止播放',
    playAll: '连续播放',
    speed: '朗读语速',
    chinese: '中文',
    listenOnly: '只听不看',
    rolePlay: '角色扮演',
    playA: '我演 A',
    playB: '我演 B',
    roleActive: '你的台词已隐藏；轮到你时请开口朗读。',
    roleInactive: '选择一个角色，系统朗读另一方。',
    playLine: (index: number) => `播放第 ${index} 句`,
    tapToPlay: (index: number) => `点击播放第 ${index} 句`,
    yourTurn: '轮到你说',
    yourTurnHint: '先开口，再点击听参考发音',
    keyPhrases: '重点短语',
    keyPhrasesHint: '换一种说法，表达更灵活',
    shadowing: '跟读练习',
    shadowingHint: '先听参考发音，再完整朗读这句话。',
    listenReference: '听参考',
    complete: '已完成',
    markShadowed: '我已跟读',
    roleExercise: 'A/B 角色扮演',
    roleExerciseHint: '选择角色后返回对话页，系统会隐藏你的台词并朗读另一方。',
    playCustomer: '扮演顾客 A',
    playBarista: '扮演店员 B',
    sentenceOrder: '句子排序',
    sentenceOrderHint: '点击词块，组成“可以把普通牛奶换成燕麦奶吗？”',
    selectedWords: '已选择的单词',
    selectBlocks: '从下面选择词块',
    reset: '重新排列',
    checkAnswer: '检查答案',
    correct: '正确！这是一个礼貌提出替换要求的完整句子。',
    tryAgain: '再试一次，先从礼貌请求 “Could I…” 开始。',
    wordCard: (word: string) => `${word} 单词卡`,
    closeWordCard: '关闭单词卡',
    close: '关闭',
    removeFavorite: '取消收藏',
    addFavorite: '收藏单词',
    chineseMeaning: '中文释义',
    currentContext: '当前语境',
    genericMeaning: '本课词汇',
    genericContext: '点击播放按钮可听这个词在当前句子中的发音。',
  },
} as const;

type PracticeCopy = (typeof PRACTICE_COPY)[keyof typeof PRACTICE_COPY];

const ENGLISH_SCENARIO_DESCRIPTIONS: Record<string, string> = {
  introductions: 'Greet someone, introduce yourself, and start a conversation naturally',
  'coffee-shop': 'Choose a drink, customize it, confirm the price, and collect the order',
  restaurant: 'Book a table, order food, make requests, and pay',
  shopping: 'Ask prices, try things on, compare products, and pay',
  directions: 'Ask for directions, confirm stops, and buy a ticket',
  hotel: 'Confirm a booking, request a room, and check out',
  airport: 'Check bags, confirm the gate, and board on time',
  meeting: 'Share, support, add to, and politely challenge ideas',
  appointment: 'Book, confirm, and reschedule by phone',
  doctor: 'Describe symptoms, duration, and understand advice',
};

const SCENARIOS: Scenario[] = [
  { id: 'introductions', number: 1, title: '初次见面与自我介绍', englishTitle: 'Meeting Someone New', description: '打招呼、介绍自己并自然开启话题', level: 'A1', icon: '👋', available: false },
  { id: 'coffee-shop', number: 2, title: '咖啡店点餐', englishTitle: 'Ordering at a Coffee Shop', description: '选择饮品、定制口味、确认价格与取餐', level: 'A2', icon: '☕', available: true },
  { id: 'restaurant', number: 3, title: '餐厅用餐与结账', englishTitle: 'Dining at a Restaurant', description: '订位、点餐、提出需求并结账', level: 'A2', icon: '🍽️', available: false },
  { id: 'shopping', number: 4, title: '商店购物与询价', englishTitle: 'Shopping and Asking Prices', description: '询价、试穿、比较商品和付款', level: 'A2', icon: '🛍️', available: false },
  { id: 'directions', number: 5, title: '问路与乘坐交通工具', englishTitle: 'Directions and Transport', description: '问路、确认站点并购买车票', level: 'A2', icon: '🚌', available: false },
  { id: 'hotel', number: 6, title: '酒店入住与退房', englishTitle: 'Hotel Check-in and Check-out', description: '确认预订、提出房间需求并退房', level: 'A2', icon: '🏨', available: false },
  { id: 'airport', number: 7, title: '机场值机与登机', englishTitle: 'Airport Check-in and Boarding', description: '托运行李、确认登机口和登机时间', level: 'A2', icon: '✈️', available: false },
  { id: 'meeting', number: 8, title: '工作会议与表达意见', englishTitle: 'Sharing Ideas in a Meeting', description: '表达观点、赞同、补充和礼貌反对', level: 'B1', icon: '💼', available: false },
  { id: 'appointment', number: 9, title: '电话预约与修改时间', englishTitle: 'Making and Changing Appointments', description: '电话预约、确认信息和修改时间', level: 'B1', icon: '📞', available: false },
  { id: 'doctor', number: 10, title: '看医生与描述身体状况', englishTitle: 'At the Doctor’s Office', description: '描述症状、持续时间并理解医嘱', level: 'B1', icon: '🩺', available: false },
];

const DIALOGUE: DialogueLine[] = [
  { id: 'coffee-01', speaker: 'B', english: 'Good morning! What can I get started for you?', chinese: '早上好！请问想点些什么？' },
  { id: 'coffee-02', speaker: 'A', english: "Hi! I'd like a medium latte, please.", chinese: '你好！我想要一杯中杯拿铁，谢谢。' },
  { id: 'coffee-03', speaker: 'B', english: 'Sure. Would you like it hot or iced?', chinese: '好的。您想要热的还是冰的？' },
  { id: 'coffee-04', speaker: 'A', english: 'Hot, please. Could I have oat milk instead of regular milk?', chinese: '热的，谢谢。可以把普通牛奶换成燕麦奶吗？' },
  { id: 'coffee-05', speaker: 'B', english: 'Absolutely. Would you like an extra shot of espresso?', chinese: '当然可以。您需要额外加一份浓缩咖啡吗？' },
  { id: 'coffee-06', speaker: 'A', english: 'Yes, please. And can I get a blueberry muffin too?', chinese: '好的，谢谢。另外我可以再要一个蓝莓松饼吗？' },
  { id: 'coffee-07', speaker: 'B', english: 'Of course. Is that for here or to go?', chinese: '当然。这些是在店里吃还是带走？' },
  { id: 'coffee-08', speaker: 'A', english: 'To go, please.', chinese: '带走，谢谢。' },
  { id: 'coffee-09', speaker: 'B', english: 'Great. Can I have your name for the order?', chinese: '好的。可以告诉我订单姓名吗？' },
  { id: 'coffee-10', speaker: 'A', english: "It's Maya.", chinese: '我叫 Maya。' },
  { id: 'coffee-11', speaker: 'B', english: "Thanks, Maya. That'll be six dollars and fifty cents.", chinese: '谢谢，Maya。一共是六美元五十美分。' },
  { id: 'coffee-12', speaker: 'A', english: 'Here you go. Thank you!', chinese: '给你。谢谢！' },
];

const PHRASES: PhraseInfo[] = [
  { phrase: "I'd like…", meaning: '我想要……（礼貌点单）', alternatives: ['Can I get…?', 'I’ll have…'] },
  { phrase: 'Would you like it hot or iced?', meaning: '您想要热的还是冰的？', alternatives: ['Hot or iced?', 'Do you want that hot or cold?'] },
  { phrase: 'Could I have…?', meaning: '我可以要……吗？', alternatives: ['Can I have…?', 'Could you make it with…?'] },
  { phrase: 'instead of', meaning: '代替；而不是', alternatives: ['in place of', 'swap … for …'] },
  { phrase: 'an extra shot', meaning: '额外加一份浓缩咖啡', alternatives: ['one more shot', 'a double shot'] },
  { phrase: 'for here or to go', meaning: '堂食还是带走', alternatives: ['dine in or take away', 'eat here or take out'] },
  { phrase: 'Can I have your name?', meaning: '可以告诉我您的名字吗？', alternatives: ['What name should I put on the order?', 'May I get a name?'] },
  { phrase: "That'll be…", meaning: '一共是……（报价格）', alternatives: ['Your total is…', 'It comes to…'] },
];

const WORDS: Record<string, Omit<WordInfo, 'word'>> = {
  good: { ipa: '/ɡʊd/', meaning: '好的；愉快的', context: '和 morning 连用，构成早晨问候。' },
  morning: { ipa: '/ˈmɔːrnɪŋ/', meaning: '早晨；上午', context: 'Good morning 是上午常用的礼貌问候。' },
  what: { ipa: '/wʌt/', meaning: '什么', context: '店员用它询问顾客想点什么。' },
  can: { ipa: '/kæn; kən/', meaning: '可以；能够', context: '用于提出请求或询问能为对方做什么。' },
  i: { ipa: '/aɪ/', meaning: '我', context: '说话人指代自己。' },
  get: { ipa: '/ɡet/', meaning: '得到；拿；点', context: '点餐语境中 Can I get… 表示“我可以点……吗”。' },
  started: { ipa: '/ˈstɑːrtɪd/', meaning: '开始了的', context: 'get started for you 是服务场景中的自然表达，表示开始为顾客准备订单。' },
  for: { ipa: '/fɔːr; fər/', meaning: '为了；给；供', context: 'for you 表示“为您”，for here 表示“在这里享用”。' },
  you: { ipa: '/juː; jə/', meaning: '你；您', context: '这里用于礼貌称呼顾客。' },
  hi: { ipa: '/haɪ/', meaning: '你好', context: '自然、轻松的日常问候。' },
  id: { ipa: '/aɪd/', meaning: 'I would 的缩写', context: "I'd like… 是点餐时非常常用的礼貌表达。" },
  like: { ipa: '/laɪk/', meaning: '喜欢；想要', context: "在 I'd like 中表示“我想要”。" },
  a: { ipa: '/ə; eɪ/', meaning: '一个；一杯', context: '用于单数可数名词前，这里指一杯拿铁或一个松饼。' },
  medium: { ipa: '/ˈmiːdiəm/', meaning: '中等的；中杯', context: '饮品尺寸中的“中杯”。' },
  latte: { ipa: '/ˈlɑːteɪ/', meaning: '拿铁咖啡', context: '以浓缩咖啡和蒸奶制成的饮品。' },
  please: { ipa: '/pliːz/', meaning: '请；谢谢', context: '放在请求末尾，让表达更礼貌。' },
  sure: { ipa: '/ʃʊr/', meaning: '当然；好的', context: '店员确认顾客请求时的自然回应。' },
  would: { ipa: '/wʊd/', meaning: '会；想要', context: 'Would you like…? 是礼貌询问偏好的固定句型。' },
  it: { ipa: '/ɪt/', meaning: '它', context: '这里指刚刚点的拿铁。' },
  hot: { ipa: '/hɑːt/', meaning: '热的', context: '描述饮品温度。' },
  or: { ipa: '/ɔːr; ər/', meaning: '或者；还是', context: '连接 hot 和 iced 两个选择。' },
  iced: { ipa: '/aɪst/', meaning: '加冰的；冰的', context: 'iced latte 表示冰拿铁。' },
  could: { ipa: '/kʊd/', meaning: '可以；能否', context: 'Could I…? 比 Can I…? 语气更委婉。' },
  have: { ipa: '/hæv; həv/', meaning: '有；要', context: '点餐时 have 表示“要、获得”。' },
  oat: { ipa: '/oʊt/', meaning: '燕麦', context: 'oat milk 是常见的植物奶替代品。' },
  milk: { ipa: '/mɪlk/', meaning: '牛奶；奶', context: '这里指制作拿铁使用的奶。' },
  instead: { ipa: '/ɪnˈsted/', meaning: '代替；反而', context: 'instead of 连用表示“用……代替……”。' },
  of: { ipa: '/əv; ɒv/', meaning: '……的；属于', context: '和 instead 组成固定短语 instead of。' },
  regular: { ipa: '/ˈreɡjələr/', meaning: '普通的；常规的', context: 'regular milk 在这里指普通牛奶。' },
  absolutely: { ipa: '/ˌæbsəˈluːtli/', meaning: '当然；完全地', context: '服务人员用来爽快地答应请求。' },
  an: { ipa: '/ən; æn/', meaning: '一个', context: '用于元音音素开头的 extra 前。' },
  extra: { ipa: '/ˈekstrə/', meaning: '额外的', context: 'an extra shot 表示多加一份浓缩咖啡。' },
  shot: { ipa: '/ʃɑːt/', meaning: '一小份；一份浓缩', context: '咖啡语境中通常指一份 espresso。' },
  espresso: { ipa: '/eˈspresoʊ/', meaning: '浓缩咖啡', context: '拿铁的咖啡基底，也可以额外添加。' },
  yes: { ipa: '/jes/', meaning: '是；好的', context: '用于肯定回答店员的问题。' },
  and: { ipa: '/ænd; ənd/', meaning: '和；另外', context: '连接两个点单请求。' },
  blueberry: { ipa: '/ˈbluːberi/', meaning: '蓝莓', context: '用来描述松饼口味。' },
  muffin: { ipa: '/ˈmʌfɪn/', meaning: '松饼；玛芬', context: '咖啡店常见的烘焙点心。' },
  too: { ipa: '/tuː/', meaning: '也；还', context: '表示在饮品之外还要一个松饼。' },
  course: { ipa: '/kɔːrs/', meaning: '过程；当然', context: 'Of course 是“当然可以”的固定表达。' },
  is: { ipa: '/ɪz; z/', meaning: '是', context: '用于询问订单是堂食还是带走。' },
  that: { ipa: '/ðæt/', meaning: '那个；那些', context: '这里指顾客的整份订单。' },
  here: { ipa: '/hɪr/', meaning: '这里', context: 'for here 表示在店内享用。' },
  to: { ipa: '/tuː; tə/', meaning: '向；去；用于不定式', context: 'to go 在餐饮场景中表示外带。' },
  go: { ipa: '/ɡoʊ/', meaning: '去；走', context: 'to go 是美式英语中“带走”的常用说法。' },
  great: { ipa: '/ɡreɪt/', meaning: '很好；太好了', context: '店员确认选择后自然承接下一步。' },
  your: { ipa: '/jʊr; jər/', meaning: '你的；您的', context: 'your name 表示顾客的姓名。' },
  name: { ipa: '/neɪm/', meaning: '名字；姓名', context: '咖啡店常用姓名来标记订单。' },
  the: { ipa: '/ðə; ðiː/', meaning: '这个；该', context: 'the order 指双方正在处理的这份订单。' },
  order: { ipa: '/ˈɔːrdər/', meaning: '订单；点单', context: '这里指顾客购买的饮品和点心。' },
  its: { ipa: '/ɪts/', meaning: 'it is 的缩写', context: "It's Maya 用来回答“订单写什么名字”。" },
  maya: { ipa: '/ˈmaɪə/', meaning: 'Maya（人名）', context: '顾客用于取餐的姓名。' },
  thanks: { ipa: '/θæŋks/', meaning: '谢谢', context: '比 Thank you 更口语化。' },
  thatll: { ipa: '/ˈðætl/', meaning: 'that will 的缩写', context: "That'll be… 是服务人员报总价的常用句型。" },
  be: { ipa: '/biː; bi/', meaning: '是；成为', context: '与 That’ll 连用，引出订单总价。' },
  six: { ipa: '/sɪks/', meaning: '六', context: '订单价格中的美元数。' },
  dollars: { ipa: '/ˈdɑːlərz/', meaning: '美元（复数）', context: '美国常用货币单位。' },
  fifty: { ipa: '/ˈfɪfti/', meaning: '五十', context: '订单价格中的美分数。' },
  cents: { ipa: '/sents/', meaning: '美分（复数）', context: '一美元等于一百美分。' },
  thank: { ipa: '/θæŋk/', meaning: '感谢', context: 'Thank you 是完整、礼貌的道谢表达。' },
};

const DEFAULT_PROGRESS: StoredProgress = {
  listenedLineIds: [],
  favorites: [],
  sentenceOrderCompleted: false,
  shadowingCompleted: false,
  rolePlayCompleted: false,
};

const SENTENCE_ORDER_WORDS = ['Could', 'I', 'have', 'oat', 'milk', 'instead', 'of', 'regular', 'milk?'];

function normalizeWord(word: string): string {
  return word.toLocaleLowerCase().replace(/[’']/gu, '').replace(/[^a-z]/gu, '');
}

function tokens(text: string): Array<{ value: string; word: boolean }> {
  return text.split(/([A-Za-z]+(?:[’'][A-Za-z]+)?)/gu)
    .filter(Boolean)
    .map((value) => ({ value, word: /^[A-Za-z]/u.test(value) }));
}

function readProgress(): StoredProgress {
  if (typeof window === 'undefined') return DEFAULT_PROGRESS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<StoredProgress>;
    return {
      listenedLineIds: Array.isArray(stored.listenedLineIds) ? stored.listenedLineIds : [],
      favorites: Array.isArray(stored.favorites) ? stored.favorites : [],
      sentenceOrderCompleted: stored.sentenceOrderCompleted === true,
      shadowingCompleted: stored.shadowingCompleted === true,
      rolePlayCompleted: stored.rolePlayCompleted === true,
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

function wordInfo(value: string, copy: PracticeCopy): WordInfo {
  const normalized = normalizeWord(value);
  const entry = WORDS[normalized];
  return entry
    ? { word: value, ...entry }
    : { word: value, ipa: `/${normalized}/`, meaning: copy.genericMeaning, context: copy.genericContext };
}

function shuffledOrder(): string[] {
  return SENTENCE_ORDER_WORDS;
}

function useSpeechPlayer(rate: SpeechRate, onLineListened: (id: string) => void) {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    setSpeakingId(null);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback((text: string, id: string, speaker: Speaker = 'A') => new Promise<void>((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }
    cancelledRef.current = false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    utterance.pitch = speaker === 'A' ? 1.05 : 0.92;
    const englishVoices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith('en'));
    utterance.voice = englishVoices[speaker === 'A' ? 0 : 1] ?? englishVoices[0] ?? null;
    utterance.onend = () => {
      setSpeakingId(null);
      onLineListened(id);
      resolve();
    };
    utterance.onerror = () => {
      setSpeakingId(null);
      resolve();
    };
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }), [onLineListened, rate]);

  const speakSequence = useCallback(async (lines: DialogueLine[]) => {
    stop();
    cancelledRef.current = false;
    for (const line of lines) {
      if (cancelledRef.current) break;
      await speak(line.english, line.id, line.speaker);
    }
  }, [speak, stop]);

  return { speak, speakSequence, speakingId, stop };
}

export function EnglishPractice() {
  const { locale } = useI18n();
  const language = locale === 'zh-CN' ? 'zh' : 'en';
  const copy = PRACTICE_COPY[language];
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('scenes');
  const [view, setView] = useState<PracticeView>('home');
  const [lessonTab, setLessonTab] = useState<LessonTab>('dialogue');
  const [showChinese, setShowChinese] = useState(true);
  const [listenOnly, setListenOnly] = useState(false);
  const [rolePlayRole, setRolePlayRole] = useState<Speaker | null>(null);
  const [rate, setRate] = useState<SpeechRate>(1);
  const [selectedWord, setSelectedWord] = useState<WordInfo | null>(null);
  const [progress, setProgress] = useState<StoredProgress>(readProgress);
  const [scenarios, setScenarios] = useState<Scenario[]>(SCENARIOS);
  const [dialogue, setDialogue] = useState<DialogueLine[]>(DIALOGUE);
  const [orderedWords, setOrderedWords] = useState<string[]>([]);
  const [orderFeedback, setOrderFeedback] = useState<string | null>(null);
  const serverSyncReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPractice() {
      try {
        const [catalogResponse, lessonResponse, progressResponse] = await Promise.all([
          fetch('/api/english-practice/catalog', { credentials: 'include' }),
          fetch('/api/english-practice/lessons/coffee-shop', { credentials: 'include' }),
          fetch('/api/english-practice/progress', { credentials: 'include', cache: 'no-store' }),
        ]);
        if (!catalogResponse.ok || !lessonResponse.ok || !progressResponse.ok) {
          throw new Error('Daily English API is unavailable');
        }
        const catalog = await catalogResponse.json() as EnglishPracticeCatalogResponse;
        const lesson = await lessonResponse.json() as EnglishPracticeLessonResponse;
        const { progress: serverProgress } = await progressResponse.json() as EnglishPracticeProgressResponse;
        if (cancelled) return;
        setScenarios(catalog.scenarios.map((scenario) => ({
          ...scenario,
          icon: SCENARIOS.find((fallback) => fallback.id === scenario.id)?.icon ?? '💬',
        })));
        if (lesson.lesson.dialogue.length > 0) setDialogue(lesson.lesson.dialogue);
        setProgress((localProgress) => ({
          listenedLineIds: [...new Set([
            ...localProgress.listenedLineIds,
            ...serverProgress.listenedLineIds,
          ])],
          favorites: [...new Set([
            ...localProgress.favorites,
            ...serverProgress.favorites,
          ])],
          sentenceOrderCompleted: localProgress.sentenceOrderCompleted || serverProgress.sentenceOrderCompleted,
          shadowingCompleted: localProgress.shadowingCompleted || serverProgress.shadowingCompleted,
          rolePlayCompleted: localProgress.rolePlayCompleted || serverProgress.rolePlayCompleted,
        }));
      } catch {
        // Keep the bundled lesson usable when the daemon is temporarily offline.
      } finally {
        if (!cancelled) serverSyncReadyRef.current = true;
      }
    }
    void loadPractice();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    if (!serverSyncReadyRef.current) return;
    const update: EnglishPracticeProgressUpdate = progress;
    void fetch('/api/english-practice/progress', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    }).catch(() => {
      // localStorage remains the offline persistence layer.
    });
  }, [progress]);

  const markListened = useCallback((id: string) => {
    if (id.startsWith('word:')) return;
    setProgress((current) => current.listenedLineIds.includes(id)
      ? current
      : { ...current, listenedLineIds: [...current.listenedLineIds, id] });
  }, []);
  const speech = useSpeechPlayer(rate, markListened);
  const lessonPercent = Math.min(100, Math.round((progress.listenedLineIds.length / dialogue.length) * 100));
  const favoriteWords = useMemo(
    () => progress.favorites.map((word) => wordInfo(word, copy)),
    [copy, progress.favorites],
  );

  function openLesson() {
    speech.stop();
    setView('lesson');
    setLessonTab('dialogue');
  }

  function toggleFavorite(word: string) {
    const normalized = normalizeWord(word);
    setProgress((current) => ({
      ...current,
      favorites: current.favorites.includes(normalized)
        ? current.favorites.filter((item) => item !== normalized)
        : [...current.favorites, normalized],
    }));
  }

  function chooseOrderWord(word: string) {
    setOrderedWords((current) => [...current, word]);
  }

  function checkOrder() {
    const correct = orderedWords.join(' ') === 'Could I have oat milk instead of regular milk?';
    setOrderFeedback(correct ? copy.correct : copy.tryAgain);
    if (correct) setProgress((current) => ({ ...current, sentenceOrderCompleted: true }));
  }

  function handleModeTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const modeOrder: PracticeMode[] = ['scenes', 'ielts'];
    let nextIndex = modeOrder.indexOf(practiceMode);
    if (event.key === 'ArrowRight') nextIndex = (nextIndex + 1) % modeOrder.length;
    else if (event.key === 'ArrowLeft') nextIndex = (nextIndex - 1 + modeOrder.length) % modeOrder.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = modeOrder.length - 1;
    else return;

    event.preventDefault();
    const nextMode = modeOrder[nextIndex];
    if (!nextMode) return;
    setPracticeMode(nextMode);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]
      ?.focus();
  }

  if (view === 'home') {
    return (
      <section className="english-practice" aria-label={copy.practiceLabel}>
        <div className="english-practice__mode-switch" role="tablist" aria-label={copy.modeLabel}>
          <button
            id="english-practice-tab-scenes"
            type="button"
            role="tab"
            className={practiceMode === 'scenes' ? 'is-active' : undefined}
            aria-controls="english-practice-panel-scenes"
            aria-selected={practiceMode === 'scenes'}
            tabIndex={practiceMode === 'scenes' ? 0 : -1}
            onClick={() => setPracticeMode('scenes')}
            onKeyDown={handleModeTabKeyDown}
          >
            <span>{copy.scenes}</span>
          </button>
          <button
            id="english-practice-tab-ielts"
            type="button"
            role="tab"
            className={practiceMode === 'ielts' ? 'is-active' : undefined}
            aria-controls="english-practice-panel-ielts"
            aria-selected={practiceMode === 'ielts'}
            tabIndex={practiceMode === 'ielts' ? 0 : -1}
            onClick={() => setPracticeMode('ielts')}
            onKeyDown={handleModeTabKeyDown}
          >
            <span>{copy.ielts}</span>
          </button>
        </div>

        <div
          id={`english-practice-panel-${practiceMode}`}
          className="english-practice__mode-panel"
          role="tabpanel"
          aria-labelledby={`english-practice-tab-${practiceMode}`}
          tabIndex={-1}
        >
        {practiceMode === 'ielts' ? <IeltsChunkCoach language={language} /> : (
          <>
        <div className="english-practice__hero">
          <div>
            <h2>{copy.title}</h2>
            <p>{copy.subtitle}</p>
          </div>
          <button type="button" className="english-practice__vocab-link" onClick={() => setView('vocabulary')}>
            <Icon name="star" size={17} />
            {copy.vocabulary}
            <span>{progress.favorites.length}</span>
          </button>
        </div>

        <article className="english-practice__today">
          <div className="english-practice__today-icon" aria-hidden>☕</div>
          <div>
            <span>{copy.today}</span>
            <h3>{copy.coffeeShop}</h3>
            <p>{copy.lessonMeta}</p>
          </div>
          <div className="english-practice__today-progress" aria-label={copy.progress(lessonPercent)}>
            <strong>{lessonPercent}%</strong>
            <span><i style={{ width: `${lessonPercent}%` }} /></span>
          </div>
          <button type="button" className="english-practice__primary" onClick={openLesson}>
            {lessonPercent > 0 ? copy.continue : copy.start}
            <Icon name="chevron-right" size={17} />
          </button>
        </article>

        <div className="english-practice__section-heading">
          <div>
            <h3>{copy.scenarioCourses}</h3>
            <p>{copy.scenarioDetail}</p>
          </div>
          <span>{copy.available}</span>
        </div>

        <div className="english-practice__scenarios">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className={`english-practice__scenario${scenario.available ? ' is-available' : ''}`}
              onClick={scenario.available ? openLesson : undefined}
              disabled={!scenario.available}
            >
              <span className="english-practice__scenario-number">{String(scenario.number).padStart(2, '0')}</span>
              <span className="english-practice__scenario-icon" aria-hidden>{scenario.icon}</span>
              <span className="english-practice__scenario-copy">
                <strong>{language === 'zh' ? scenario.title : scenario.englishTitle}</strong>
                <small>{language === 'zh' ? scenario.englishTitle : scenario.title}</small>
                <em>{language === 'zh'
                  ? scenario.description
                  : ENGLISH_SCENARIO_DESCRIPTIONS[scenario.id] ?? scenario.description}</em>
              </span>
              <span className="english-practice__scenario-meta">
                <b>{scenario.level}</b>
                {scenario.available ? `${lessonPercent}%` : copy.comingSoon}
              </span>
            </button>
          ))}
        </div>
          </>
        )}
        </div>
      </section>
    );
  }

  if (view === 'vocabulary') {
    return (
      <section className="english-practice english-practice--subpage" aria-label={copy.vocabularyTitle}>
        <button type="button" className="english-practice__back" onClick={() => setView('home')}>
          <Icon name="arrow-left" size={17} /> {copy.returnCourses}
        </button>
        <div className="english-practice__subhead">
          <span className="english-practice__kicker">VOCABULARY</span>
          <h2>{copy.vocabularyTitle}</h2>
          <p>{copy.vocabularySubtitle}</p>
        </div>
        {favoriteWords.length > 0 ? (
          <div className="english-practice__vocab-grid">
            {favoriteWords.map((info) => (
              <article key={normalizeWord(info.word)}>
              <button type="button" className="english-practice__vocab-speak" aria-label={copy.pronounce(info.word)} onClick={() => void speech.speak(info.word, `word:${info.word}`)}>
                  <Icon name="play" size={15} />
                </button>
                <strong>{info.word}</strong>
                <span>{info.ipa}</span>
                <p>{info.meaning}</p>
                <small>{info.context}</small>
                <button type="button" onClick={() => toggleFavorite(info.word)}>{copy.removeVocabulary}</button>
              </article>
            ))}
          </div>
        ) : (
          <div className="english-practice__empty">
            <Icon name="star" size={28} />
            <h3>{copy.vocabularyEmpty}</h3>
            <p>{copy.vocabularyEmptyHint}</p>
            <button type="button" className="english-practice__primary" onClick={openLesson}>{copy.firstLesson}</button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="english-practice english-practice--lesson" aria-label={copy.lessonLabel}>
      <div className="english-lesson__topbar">
        <button type="button" className="english-practice__back" onClick={() => { speech.stop(); setView('home'); }}>
          <Icon name="arrow-left" size={17} /> {copy.allScenarios}
        </button>
        <div className="english-lesson__progress"><span><i style={{ width: `${lessonPercent}%` }} /></span><b>{lessonPercent}%</b></div>
      </div>

      <div className="english-lesson__intro">
        <div className="english-lesson__intro-icon" aria-hidden>☕</div>
        <div>
          <span>A2 · SCENE 02</span>
          <h2>{copy.coffeeShop}</h2>
          <p>{copy.coffeeShopChinese}</p>
        </div>
        <div className="english-lesson__roles">
          <span><i className="is-a">A</i> Maya · {copy.customer}</span>
          <span><i className="is-b">B</i> Alex · {copy.barista}</span>
        </div>
      </div>

      <div className="english-lesson__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={lessonTab === 'dialogue'} onClick={() => setLessonTab('dialogue')}>{copy.dialogue}</button>
        <button type="button" role="tab" aria-selected={lessonTab === 'practice'} onClick={() => setLessonTab('practice')}>{copy.speakingPractice}</button>
      </div>

      {lessonTab === 'dialogue' ? (
        <>
          <div className="english-lesson__controls">
            <div className="english-lesson__playback">
              <button type="button" className="english-practice__primary" onClick={() => {
                if (speech.speakingId) speech.stop();
                else void speech.speakSequence(dialogue);
              }}>
                <Icon name={speech.speakingId ? 'stop' : 'play'} size={16} />
                {speech.speakingId ? copy.stopPlayback : copy.playAll}
              </button>
              <div className="english-lesson__rate" aria-label={copy.speed}>
                {([0.75, 1, 1.25] as const).map((value) => (
                  <button key={value} type="button" className={rate === value ? 'is-active' : ''} onClick={() => { speech.stop(); setRate(value); }}>{value}×</button>
                ))}
              </div>
            </div>
            <div className="english-lesson__toggles">
              <button type="button" className={showChinese ? 'is-active' : ''} onClick={() => setShowChinese((current) => !current)}>
                <Icon name={showChinese ? 'eye' : 'eye-off'} size={15} /> {copy.chinese}
              </button>
              <button type="button" className={listenOnly ? 'is-active' : ''} onClick={() => setListenOnly((current) => !current)}>
                <Icon name="play" size={15} /> {copy.listenOnly}
              </button>
            </div>
          </div>

          <div className="english-lesson__roleplay">
            <span>{copy.rolePlay}</span>
            <button type="button" className={rolePlayRole === 'A' ? 'is-active' : ''} onClick={() => setRolePlayRole((current) => current === 'A' ? null : 'A')}>{copy.playA}</button>
            <button type="button" className={rolePlayRole === 'B' ? 'is-active' : ''} onClick={() => setRolePlayRole((current) => current === 'B' ? null : 'B')}>{copy.playB}</button>
            {rolePlayRole ? <small>{copy.roleActive}</small> : <small>{copy.roleInactive}</small>}
          </div>

          <div className={`english-lesson__dialogue${listenOnly ? ' is-listen-only' : ''}`}>
            {dialogue.map((line, index) => {
              const isYourTurn = rolePlayRole === line.speaker;
              return (
                <article key={line.id} className={`english-line is-${line.speaker.toLocaleLowerCase()}${speech.speakingId === line.id ? ' is-speaking' : ''}${isYourTurn ? ' is-your-turn' : ''}`}>
                  <div className="english-line__avatar">{line.speaker}</div>
                  <div className="english-line__body">
                    <span className="english-line__speaker">{line.speaker === 'A' ? 'Maya · Customer' : 'Alex · Barista'} <b>{index + 1}</b></span>
                    {listenOnly ? (
                      <button type="button" className="english-line__listen-card" onClick={() => void speech.speak(line.english, line.id, line.speaker)}>
                        <Icon name="play" size={18} />
                        <span>{copy.tapToPlay(index + 1)}</span>
                      </button>
                    ) : isYourTurn ? (
                      <button type="button" className="english-line__your-turn" onClick={() => {
                        void speech.speak(line.english, line.id, line.speaker);
                        setProgress((current) => ({ ...current, rolePlayCompleted: true }));
                      }}>
                        <Icon name="mic" size={18} />
                        <span><strong>{copy.yourTurn}</strong><small>{copy.yourTurnHint}</small></span>
                      </button>
                    ) : (
                      <div className="english-line__bubble">
                        <p className="english-line__english">
                          {tokens(line.english).map((token, tokenIndex) => token.word ? (
                            <button key={`${line.id}-${tokenIndex}`} type="button" onClick={() => setSelectedWord(wordInfo(token.value, copy))}>{token.value}</button>
                          ) : <span key={`${line.id}-${tokenIndex}`}>{token.value}</span>)}
                        </p>
                        {showChinese ? <p className="english-line__chinese">{line.chinese}</p> : null}
                      </div>
                    )}
                  </div>
                  {!listenOnly && !isYourTurn ? (
                    <button type="button" className="english-line__play" aria-label={copy.playLine(index + 1)} onClick={() => void speech.speak(line.english, line.id, line.speaker)}>
                      <Icon name={speech.speakingId === line.id ? 'stop' : 'play'} size={15} />
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>

          <section className="english-lesson__phrases">
            <div className="english-practice__section-heading"><div><h3>{copy.keyPhrases}</h3><p>{copy.keyPhrasesHint}</p></div></div>
            <div className="english-lesson__phrase-grid">
              {PHRASES.map((phrase) => (
                <article key={phrase.phrase}>
                  <button type="button" onClick={() => void speech.speak(phrase.phrase.replace('…', ''), `word:${phrase.phrase}`)}><Icon name="play" size={14} /></button>
                  <strong>{phrase.phrase}</strong>
                  <p>{phrase.meaning}</p>
                  <small>{phrase.alternatives.join(' · ')}</small>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="english-practice__exercises">
          <article className="english-exercise english-exercise--shadowing">
            <span className="english-exercise__number">01</span>
            <div><h3>{copy.shadowing}</h3><p>{copy.shadowingHint}</p></div>
            <blockquote>“I’d like a medium latte, please.”</blockquote>
            <div className="english-exercise__actions">
              <button type="button" onClick={() => void speech.speak("I'd like a medium latte, please.", 'shadowing', 'A')}><Icon name="play" size={16} /> {copy.listenReference}</button>
              <button type="button" className={progress.shadowingCompleted ? 'is-complete' : ''} onClick={() => setProgress((current) => ({ ...current, shadowingCompleted: true }))}><Icon name={progress.shadowingCompleted ? 'check' : 'mic'} size={16} /> {progress.shadowingCompleted ? copy.complete : copy.markShadowed}</button>
            </div>
          </article>

          <article className="english-exercise english-exercise--roleplay">
            <span className="english-exercise__number">02</span>
            <div><h3>{copy.roleExercise}</h3><p>{copy.roleExerciseHint}</p></div>
            <div className="english-exercise__role-buttons">
              <button type="button" onClick={() => { setRolePlayRole('A'); setLessonTab('dialogue'); }}>{copy.playCustomer}</button>
              <button type="button" onClick={() => { setRolePlayRole('B'); setLessonTab('dialogue'); }}>{copy.playBarista}</button>
            </div>
          </article>

          <article className="english-exercise english-exercise--ordering">
            <span className="english-exercise__number">03</span>
            <div><h3>{copy.sentenceOrder}</h3><p>{copy.sentenceOrderHint}</p></div>
            <div className="english-exercise__answer" aria-label={copy.selectedWords}>
              {orderedWords.length > 0 ? orderedWords.map((word, index) => <button type="button" key={`${word}-${index}`} onClick={() => setOrderedWords((current) => current.filter((_, itemIndex) => itemIndex !== index))}>{word}</button>) : <span>{copy.selectBlocks}</span>}
            </div>
            <div className="english-exercise__word-bank">
              {shuffledOrder().map((word, index) => (
                <button key={`${word}-${index}`} type="button" disabled={orderedWords.filter((item) => item === word).length >= SENTENCE_ORDER_WORDS.filter((item) => item === word).length} onClick={() => chooseOrderWord(word)}>{word}</button>
              ))}
            </div>
            <div className="english-exercise__actions">
              <button type="button" onClick={() => { setOrderedWords([]); setOrderFeedback(null); }}>{copy.reset}</button>
              <button type="button" onClick={checkOrder}>{copy.checkAnswer}</button>
            </div>
            {orderFeedback ? <p className={progress.sentenceOrderCompleted ? 'is-correct' : 'is-error'}>{orderFeedback}</p> : null}
          </article>
        </div>
      )}

      {selectedWord ? (
        <div className="english-word-sheet" role="dialog" aria-modal="true" aria-label={copy.wordCard(selectedWord.word)}>
          <button type="button" className="english-word-sheet__scrim" onClick={() => setSelectedWord(null)} aria-label={copy.closeWordCard} />
          <article>
            <div className="english-word-sheet__handle" />
            <button type="button" className="english-word-sheet__close" onClick={() => setSelectedWord(null)} aria-label={copy.close}><Icon name="close" size={18} /></button>
            <div className="english-word-sheet__word-row">
              <div><strong>{selectedWord.word}</strong><span>{selectedWord.ipa}</span></div>
              <button type="button" aria-label={copy.pronounce(selectedWord.word)} onClick={() => void speech.speak(selectedWord.word, `word:${selectedWord.word}`)}><Icon name="play" size={18} /></button>
              <button type="button" aria-label={progress.favorites.includes(normalizeWord(selectedWord.word)) ? copy.removeFavorite : copy.addFavorite} className={progress.favorites.includes(normalizeWord(selectedWord.word)) ? 'is-active' : ''} onClick={() => toggleFavorite(selectedWord.word)}><Icon name="star" size={18} /></button>
            </div>
            <div className="english-word-sheet__meaning"><span>{copy.chineseMeaning}</span><p>{selectedWord.meaning}</p></div>
            <div className="english-word-sheet__context"><span>{copy.currentContext}</span><p>{selectedWord.context}</p></div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
