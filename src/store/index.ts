import { create } from 'zustand';
import { getDb } from '@/db';
import type { Item, Session } from '@/types';

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
    labelPhotos: JSON.parse(r.labelPhotos) as string[],
    extraPhotos: JSON.parse(r.extraPhotos) as string[],
    note: r.note ?? undefined,
    capturedAt: new Date(r.capturedAt),
  };
}

export const useStore = create<State>((set, get) => ({
  sessions: [],
  itemsBySession: {},
  isReady: false,

  hydrate: async () => {
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
      set({ sessions, itemsBySession, isReady: true });
    } catch (err) {
      // 失敗也要翻 isReady,spinner 才不會卡住;真實錯誤從 console 撈
      console.error('[hydrate] failed:', err);
      set({ isReady: true });
    }
  },

  createSession: async ({ storeName } = {}) => {
    const db = await getDb();
    const id = crypto.randomUUID();
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
    const id = crypto.randomUUID();
    const capturedAt = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO items
         (id, sessionId, name, expectedPrice, labelPhotos, extraPhotos, note, capturedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.sessionId,
        input.name,
        input.expectedPrice ?? null,
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
