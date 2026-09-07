import { useStore } from '@/store';
import { __db } from '@/../__mocks__/expo-sqlite';

// 每次測試前清掉 in-memory DB 和 store 內部狀態
beforeEach(async () => {
  __db.__reset();
  // zustand store 沒有 reset API;直接重新呼叫 hydrate 會讀空的 db
  await useStore.getState().hydrate();
  // hydrate 之後是空 state;若前次測試有殘留 session,手動清掉
  useStore.setState({ sessions: [], itemsBySession: {} });
});

describe('useStore — sessions', () => {
  it('createSession 寫進 db 並 prepend 進 store', async () => {
    const sess = await useStore.getState().createSession({ storeName: '全聯' });

    expect(sess.id).toBeTruthy();
    expect(sess.storeName).toBe('全聯');
    expect(useStore.getState().sessions[0]).toMatchObject({
      id: sess.id,
      storeName: '全聯',
    });
    expect(__db.__tables().get('sessions')).toHaveLength(1);
  });

  it('updateSession 只更新有帶的欄位', async () => {
    const sess = await useStore.getState().createSession({ storeName: '全聯' });
    await useStore.getState().updateSession(sess.id, { note: '週六採買' });

    const updated = useStore.getState().sessions.find((s) => s.id === sess.id)!;
    expect(updated.storeName).toBe('全聯'); // 沒被清掉
    expect(updated.note).toBe('週六採買');
  });

  it('updateSession 空 patch 是 no-op', async () => {
    const sess = await useStore.getState().createSession({ storeName: '全聯' });
    await useStore.getState().updateSession(sess.id, {});
    expect(useStore.getState().sessions).toHaveLength(1);
  });

  it('deleteSession 同時清掉 session 與其 items(FK OFF,手動 cascade)', async () => {
    const sess = await useStore.getState().createSession({ storeName: 'A' });
    await useStore.getState().addItem({
      sessionId: sess.id,
      name: 'item-1',
      labelPhotos: ['file:///a.jpg'],
      extraPhotos: [],
    });
    await useStore.getState().addItem({
      sessionId: sess.id,
      name: 'item-2',
      labelPhotos: ['file:///b.jpg'],
      extraPhotos: [],
    });
    expect(__db.__tables().get('items')).toHaveLength(2);

    await useStore.getState().deleteSession(sess.id);

    expect(__db.__tables().get('sessions')).toHaveLength(0);
    // ponytail: PRAGMA foreign_keys OFF,所以 CASCADE 不會自動跑;
    // deleteSession 必須自己先 DELETE FROM items WHERE sessionId=?
    expect(__db.__tables().get('items')).toHaveLength(0);
    expect(useStore.getState().sessions).toHaveLength(0);
    expect(useStore.getState().itemsBySession[sess.id]).toBeUndefined();
  });
});

describe('useStore — hydrate 清空 session', () => {
  it('hydrate 會清掉沒有 items 的空 session(幽靈採買)', async () => {
    // 模擬上次沒清乾淨:塞一個空 session + 一個有 items 的 session
    await __db.runAsync(
      'INSERT INTO sessions (id, createdAt, storeName) VALUES (?, ?, ?)',
      ['ghost-1', new Date().toISOString(), '幽靈採買'],
    );
    await __db.runAsync(
      'INSERT INTO sessions (id, createdAt, storeName) VALUES (?, ?, ?)',
      ['real-1', new Date().toISOString(), '真採買'],
    );
    await __db.runAsync(
      'INSERT INTO items (id, sessionId, name, expectedPrice, labelPhotos, extraPhotos, note, capturedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['item-1', 'real-1', '蘋果', null, '[]', '[]', null, new Date().toISOString()],
    );

    await useStore.getState().hydrate();

    const sessions = useStore.getState().sessions;
    expect(sessions.find((s) => s.id === 'ghost-1')).toBeUndefined();
    expect(sessions.find((s) => s.id === 'real-1')).toBeDefined();

    // db 也要清掉,別留垃圾資料
    const dbSessions = __db.__tables().get('sessions') as Array<{ id: string }>;
    expect(dbSessions.find((s) => s.id === 'ghost-1')).toBeUndefined();
    expect(dbSessions.find((s) => s.id === 'real-1')).toBeDefined();
  });
});

describe('useStore — items', () => {
  let sessionId: string;
  beforeEach(async () => {
    const sess = await useStore.getState().createSession({ storeName: 'X' });
    sessionId = sess.id;
  });

  it('addItem 把照片陣列 JSON 化存進 db,回 domain 物件', async () => {
    const item = await useStore.getState().addItem({
      sessionId,
      name: '御飯糰 鮭魚',
      expectedPrice: 35,
      labelPhotos: ['file:///label1.jpg'],
      extraPhotos: ['file:///x.jpg', 'file:///y.jpg'],
      note: '第二件 5 折',
    });

    expect(item.id).toBeTruthy();
    expect(item.expectedPrice).toBe(35);
    expect(item.labelPhotos).toEqual(['file:///label1.jpg']);

    const row = __db.__tables().get('items')[0];
    expect(row.labelPhotos).toBe('["file:///label1.jpg"]');
    expect(row.extraPhotos).toBe('["file:///x.jpg","file:///y.jpg"]');
  });

  it('addItem 沒傳的照片欄位預設空陣列,不打爆 JSON.stringify', async () => {
    // ponytail: TS 嚴格模式不允許少欄位,所以這裡 cast 成 NewItemInput
    const item = await useStore.getState().addItem({
      sessionId,
      name: 'plain',
    } as never);

    expect(item.labelPhotos).toEqual([]);
    expect(item.extraPhotos).toEqual([]);
    expect(__db.__tables().get('items')[0].labelPhotos).toBe('[]');
  });

  it('updateItem 觸發 re-hydrate(目前是 surgical refetch)', async () => {
    const item = await useStore.getState().addItem({
      sessionId,
      name: '原名',
      labelPhotos: ['file:///a.jpg'],
      extraPhotos: [],
    });
    await useStore.getState().updateItem(item.id, {
      name: '新名',
      expectedPrice: 99,
    });
    const after = useStore
      .getState()
      .itemsBySession[sessionId]!.find((i) => i.id === item.id)!;
    expect(after.name).toBe('新名');
    expect(after.expectedPrice).toBe(99);
    expect(after.labelPhotos).toEqual(['file:///a.jpg']); // 沒被清
  });

  it('deleteItem 只從 in-memory state 拿掉,並真的下 DELETE', async () => {
    const item = await useStore.getState().addItem({
      sessionId,
      name: 'x',
      labelPhotos: ['file:///a.jpg'],
      extraPhotos: [],
    });
    expect(__db.__tables().get('items')).toHaveLength(1);

    await useStore.getState().deleteItem(item.id);

    expect(__db.__tables().get('items')).toHaveLength(0);
    expect(useStore.getState().itemsBySession[sessionId]).toEqual([]);
  });
});
