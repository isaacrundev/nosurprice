import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { getDb } from '@/db';
import type { Item, Session } from '@/types';

// ponytail: Hermes 不像瀏覽器有全域 crypto,Web 的 `crypto.randomUUID()` 在 RN 直接報
// `ReferenceError: Property 'crypto' doesn't exist`。`expo-crypto` 跨平台(web 也吃),
// API 一致,Expo Go 已預裝,免 native rebuild。
const randomUUID = (): string => Crypto.randomUUID();

type NewSessionInput = { storeName?: string };
type NewItemInput = Omit<Item, 'id' | 'capturedAt'>;

type State = {
  sessions: Session[];
  itemsBySession: Record<string, Item[]>;
  isReady: boolean;
  hydrate: () => Promise<void>;
  createSession: (input?: NewSessionInput) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  updateSession: (id: string, patch: Partial<NewSessionInput> & { note?: string }) => Promise<void>;
  addItem: (input: NewItemInput) => Promise<Item>;
  updateItem: (id: string, patch: Partial<NewItemInput>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
};

// row → domain 物件
function rowToSession(r: {
  id: string;
  createdAt: string;
  storeName: string | null;
  note: string | null;
}): Session {
  return {
    id: r.id,
    createdAt: new Date(r.createdAt),
    storeName: r.storeName ?? undefined,
    note: r.note ?? undefined,
  };
}

function rowToItem(r: {
  id: string;
  sessionId: string;
  name: string;
  expectedPrice: number | null;
  quantity: number | null;
  labelPhotos: string;
  extraPhotos: string;
  note: string | null;
  capturedAt: string;
}): Item {
  return {
    id: r.id,
    sessionId: r.sessionId,
    name: r.name,
    expectedPrice: r.expectedPrice ?? undefined,
    // ponytail: 老 DB 行可能沒有 quantity 欄位(SELECT * 拿到 undefined),
    // 一律 fallback 1 避免「數量欄空白」這種半殘狀態
    quantity: r.quantity ?? 1,
    labelPhotos: JSON.parse(r.labelPhotos) as string[],
    extraPhotos: JSON.parse(r.extraPhotos) as string[],
    note: r.note ?? undefined,
    capturedAt: new Date(r.capturedAt),
  };
}

// 模組級:web OPFS 平行呼叫 coalesce 用。見 hydrate() 內 ponytail 註解。
let hydrateInflight: Promise<void> | null = null;

export const useStore = create<State>((set, get) => ({
  sessions: [],
  itemsBySession: {},
  isReady: false,

  hydrate: () => {
    // ponytail: web OPFS 一個 file 同時只准一個 sync access handle,平行呼叫 hydrate
    // (HMR 重 eval 後 store 重生 + 舊 instance 的 effect 還在跑 / 任何外部觸發)
    // 會撞 NoModificationAllowedError。in-flight coalesce:同時間只跑一份,後面
    // 的呼叫直接拿同一個 promise。finally 清掉讓下次重試可跑。
    if (hydrateInflight) return hydrateInflight;
    hydrateInflight = (async () => {
      try {
        const db = await getDb();
        const sRows = await db.getAllAsync<{
          id: string;
          createdAt: string;
          storeName: string | null;
          note: string | null;
        }>('SELECT * FROM sessions ORDER BY createdAt DESC');
        const iRows = await db.getAllAsync<{
          id: string;
          sessionId: string;
          name: string;
          expectedPrice: number | null;
          quantity: number | null;
          labelPhotos: string;
          extraPhotos: string;
          note: string | null;
          capturedAt: string;
        }>('SELECT * FROM items ORDER BY capturedAt DESC');

        const sessions = sRows.map(rowToSession);
        const itemsBySession: Record<string, Item[]> = {};
        for (const r of iRows) {
          const item = rowToItem(r);
          (itemsBySession[item.sessionId] ??= []).push(item);
        }

        // 清掉沒有 items 的空 session:detail 的 auto-delete 只在 unmount 時跑,
        // force-quit / crash / 沒走完 detail 的流程會留孤兒在 db,冷啟動顯示為幽靈採買。
        // ponytail: 用 IN 一發 DELETE 取代 for-loop 的 N 個 runAsync。Web OPFS 一個
        // file 同時只允許一個 sync access handle,N 次寫入幾乎一定會撞到 NoModificationAllowed
        // (`github.com/expo/expo/issues/36835, 49450`)。單一 statement 也比較省 round-trip。
        const emptyIds = sessions
          .filter((s) => !(itemsBySession[s.id]?.length))
          .map((s) => s.id);
        if (emptyIds.length > 0) {
          const placeholders = emptyIds.map(() => '?').join(',');
          await db.runAsync(
            `DELETE FROM sessions WHERE id IN (${placeholders})`,
            emptyIds,
          );
        }
        const cleanedSessions = emptyIds.length
          ? sessions.filter((s) => !emptyIds.includes(s.id))
          : sessions;

        set({ sessions: cleanedSessions, itemsBySession, isReady: true });
      } catch (err) {
        // 失敗也要翻 isReady,spinner 才不會卡住;真實錯誤從 console 撈
        console.error('[hydrate] failed:', err);
        set({ isReady: true });
      } finally {
        hydrateInflight = null;
      }
    })();
    return hydrateInflight;
  },

  createSession: async ({ storeName } = {}) => {
    const db = await getDb();
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO sessions (id, createdAt, storeName) VALUES (?, ?, ?)',
      [id, createdAt, storeName ?? null],
    );
    const session: Session = {
      id,
      createdAt: new Date(createdAt),
      storeName,
    };
    set((s) => ({ sessions: [session, ...s.sessions] }));
    return session;
  },

  deleteSession: async (id) => {
    const db = await getDb();
    // ponytail: PRAGMA foreign_keys 預設 OFF,FK CASCADE 不生效。手動先刪 items。
    await db.runAsync('DELETE FROM items WHERE sessionId = ?', [id]);
    await db.runAsync('DELETE FROM sessions WHERE id = ?', [id]);
    set((s) => {
      const next = { ...s.itemsBySession };
      delete next[id];
      return {
        sessions: s.sessions.filter((x) => x.id !== id),
        itemsBySession: next,
      };
    });
  },

  updateSession: async (id, patch) => {
    const fields: string[] = [];
    const values: (string | null)[] = [];
    if (patch.storeName !== undefined) {
      fields.push('storeName = ?');
      values.push(patch.storeName);
    }
    if (patch.note !== undefined) {
      fields.push('note = ?');
      values.push(patch.note);
    }
    if (fields.length === 0) return;
    const db = await getDb();
    values.push(id);
    await db.runAsync(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, values);
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  },

  addItem: async (input) => {
    const db = await getDb();
    const id = randomUUID();
    const capturedAt = new Date().toISOString();
    // ponytail: quantity 直接信任 input,UI 層擋下空 / < 1 / NaN 都會送 1 進來。
    await db.runAsync(
      `INSERT INTO items
         (id, sessionId, name, expectedPrice, quantity, labelPhotos, extraPhotos, note, capturedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.sessionId,
        input.name,
        input.expectedPrice ?? null,
        Math.max(1, Math.round(input.quantity ?? 1)),
        JSON.stringify(input.labelPhotos ?? []),
        JSON.stringify(input.extraPhotos ?? []),
        input.note ?? null,
        capturedAt,
      ],
    );
    const item: Item = {
      ...input,
      id,
      labelPhotos: input.labelPhotos ?? [],
      extraPhotos: input.extraPhotos ?? [],
      quantity: Math.max(1, Math.round(input.quantity ?? 1)),
      capturedAt: new Date(capturedAt),
    };
    set((s) => ({
      itemsBySession: {
        ...s.itemsBySession,
        [input.sessionId]: [item, ...(s.itemsBySession[input.sessionId] ?? [])],
      },
    }));
    return item;
  },

  updateItem: async (id, patch) => {
    const db = await getDb();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.expectedPrice !== undefined) {
      fields.push('expectedPrice = ?');
      values.push(patch.expectedPrice);
    }
    if (patch.quantity !== undefined) {
      fields.push('quantity = ?');
      values.push(Math.max(1, Math.round(patch.quantity)));
    }
    if (patch.labelPhotos !== undefined) {
      fields.push('labelPhotos = ?');
      values.push(JSON.stringify(patch.labelPhotos));
    }
    if (patch.extraPhotos !== undefined) {
      fields.push('extraPhotos = ?');
      values.push(JSON.stringify(patch.extraPhotos));
    }
    if (patch.note !== undefined) {
      fields.push('note = ?');
      values.push(patch.note);
    }
    if (patch.sessionId !== undefined) {
      fields.push('sessionId = ?');
      values.push(patch.sessionId);
    }
    if (fields.length === 0) return;
    values.push(id);
    await db.runAsync(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`, values);
    // 簡化:MVP 直接 re-hydrate;之後再 surgical update
    await get().hydrate();
  },

  deleteItem: async (id) => {
    const db = await getDb();
    await db.runAsync('DELETE FROM items WHERE id = ?', [id]);
    set((s) => {
      const next: Record<string, Item[]> = {};
      for (const [sid, items] of Object.entries(s.itemsBySession)) {
        next[sid] = items.filter((i) => i.id !== id);
      }
      return { itemsBySession: next };
    });
  },
}));
