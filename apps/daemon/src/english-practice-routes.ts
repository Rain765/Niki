import type {
  EnglishPracticeCatalogItem,
  EnglishPracticeCatalogResponse,
  EnglishPracticeDialogueLine,
  EnglishPracticeLessonResponse,
  EnglishPracticeProgress,
  EnglishPracticeProgressResponse,
  EnglishPracticeProgressUpdate,
} from '@open-design/contracts';
import type { Express } from 'express';
import type { RouteDeps } from './server-context.js';
import { currentNikiUser } from './niki-auth-context.js';

const CATALOG: EnglishPracticeCatalogItem[] = [
  { id: 'introductions', number: 1, title: '初次见面与自我介绍', englishTitle: 'Meeting Someone New', description: '打招呼、介绍自己并自然开启话题', level: 'A1', available: false, turnCount: null },
  { id: 'coffee-shop', number: 2, title: '咖啡店点餐', englishTitle: 'Ordering at a Coffee Shop', description: '选择饮品、定制口味、确认价格与取餐', level: 'A2', available: true, turnCount: 12 },
  { id: 'restaurant', number: 3, title: '餐厅用餐与结账', englishTitle: 'Dining at a Restaurant', description: '订位、点餐、提出需求并结账', level: 'A2', available: false, turnCount: null },
  { id: 'shopping', number: 4, title: '商店购物与询价', englishTitle: 'Shopping and Asking Prices', description: '询价、试穿、比较商品和付款', level: 'A2', available: false, turnCount: null },
  { id: 'directions', number: 5, title: '问路与乘坐交通工具', englishTitle: 'Directions and Transport', description: '问路、确认站点并购买车票', level: 'A2', available: false, turnCount: null },
  { id: 'hotel', number: 6, title: '酒店入住与退房', englishTitle: 'Hotel Check-in and Check-out', description: '确认预订、提出房间需求并退房', level: 'A2', available: false, turnCount: null },
  { id: 'airport', number: 7, title: '机场值机与登机', englishTitle: 'Airport Check-in and Boarding', description: '托运行李、确认登机口和登机时间', level: 'A2', available: false, turnCount: null },
  { id: 'meeting', number: 8, title: '工作会议与表达意见', englishTitle: 'Sharing Ideas in a Meeting', description: '表达观点、赞同、补充和礼貌反对', level: 'B1', available: false, turnCount: null },
  { id: 'appointment', number: 9, title: '电话预约与修改时间', englishTitle: 'Making and Changing Appointments', description: '电话预约、确认信息和修改时间', level: 'B1', available: false, turnCount: null },
  { id: 'doctor', number: 10, title: '看医生与描述身体状况', englishTitle: 'At the Doctor’s Office', description: '描述症状、持续时间并理解医嘱', level: 'B1', available: false, turnCount: null },
];

const COFFEE_DIALOGUE: EnglishPracticeDialogueLine[] = [
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

const DEFAULT_PROGRESS: EnglishPracticeProgress = {
  listenedLineIds: [],
  favorites: [],
  sentenceOrderCompleted: false,
  shadowingCompleted: false,
  rolePlayCompleted: false,
  updatedAt: 0,
};

function cleanStringList(value: unknown, allowed?: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLocaleLowerCase())
    .filter((item) => item.length > 0 && item.length <= 80 && (!allowed || allowed.has(item))))];
}
function parseJsonList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    return cleanStringList(JSON.parse(value));
  } catch {
    return [];
  }
}

function userId(): string {
  return currentNikiUser()?.id ?? 'local';
}

export function registerEnglishPracticeRoutes(app: Express, ctx: RouteDeps<'db'>) {
  const { db } = ctx;

  function getProgress(): EnglishPracticeProgress {
    const row = db.prepare(`
      SELECT listened_line_ids_json, favorites_json,
        sentence_order_completed, shadowing_completed, role_play_completed, updated_at
      FROM english_practice_progress
      WHERE user_id = ?
    `).get(userId()) as Record<string, unknown> | undefined;
    if (!row) return DEFAULT_PROGRESS;
    return {
      listenedLineIds: parseJsonList(row.listened_line_ids_json),
      favorites: parseJsonList(row.favorites_json),
      sentenceOrderCompleted: row.sentence_order_completed === 1,
      shadowingCompleted: row.shadowing_completed === 1,
      rolePlayCompleted: row.role_play_completed === 1,
      updatedAt: Number(row.updated_at) || 0,
    };
  }

  app.get('/api/english-practice/catalog', (_req, res) => {
    const response: EnglishPracticeCatalogResponse = { scenarios: CATALOG };
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(response);
  });

  app.get('/api/english-practice/lessons/:lessonId', (req, res) => {
    const lesson = CATALOG.find((item) => item.id === req.params.lessonId);
    if (!lesson || !lesson.available) return res.status(404).json({ error: 'Lesson not found' });
    const response: EnglishPracticeLessonResponse = {
      lesson: { ...lesson, dialogue: lesson.id === 'coffee-shop' ? COFFEE_DIALOGUE : [] },
    };
    return res.json(response);
  });

  app.get('/api/english-practice/progress', (_req, res) => {
    const response: EnglishPracticeProgressResponse = { progress: getProgress() };
    res.setHeader('Cache-Control', 'no-store');
    res.json(response);
  });

  app.patch('/api/english-practice/progress', (req, res) => {
    const input = (req.body ?? {}) as EnglishPracticeProgressUpdate;
    const current = getProgress();
    const lineIds = new Set(COFFEE_DIALOGUE.map((line) => line.id));
    const next: EnglishPracticeProgress = {
      listenedLineIds: input.listenedLineIds === undefined
        ? current.listenedLineIds
        : cleanStringList(input.listenedLineIds, lineIds),
      favorites: input.favorites === undefined
        ? current.favorites
        : cleanStringList(input.favorites),
      sentenceOrderCompleted: input.sentenceOrderCompleted ?? current.sentenceOrderCompleted,
      shadowingCompleted: input.shadowingCompleted ?? current.shadowingCompleted,
      rolePlayCompleted: input.rolePlayCompleted ?? current.rolePlayCompleted,
      updatedAt: Date.now(),
    };
    db.prepare(`
      INSERT INTO english_practice_progress (
        user_id, listened_line_ids_json, favorites_json,
        sentence_order_completed, shadowing_completed, role_play_completed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        listened_line_ids_json = excluded.listened_line_ids_json,
        favorites_json = excluded.favorites_json,
        sentence_order_completed = excluded.sentence_order_completed,
        shadowing_completed = excluded.shadowing_completed,
        role_play_completed = excluded.role_play_completed,
        updated_at = excluded.updated_at
    `).run(
      userId(),
      JSON.stringify(next.listenedLineIds),
      JSON.stringify(next.favorites),
      next.sentenceOrderCompleted ? 1 : 0,
      next.shadowingCompleted ? 1 : 0,
      next.rolePlayCompleted ? 1 : 0,
      next.updatedAt,
    );
    const response: EnglishPracticeProgressResponse = { progress: next };
    res.json(response);
  });
}
