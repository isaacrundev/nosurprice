import React from 'react';
import { render } from '@testing-library/react-native';

// 純 jest mock,不走真 store;這個測試只關心「unmount 時自動清空 session」邏輯
const mockDeleteSession = jest.fn();
let mockItemsBySession: Record<string, unknown[]> = {};
let mockSessions: unknown[] = [];

jest.mock('@/store', () => ({
  useStore: Object.assign(
    (sel: (s: any) => any) =>
      sel({
        sessions: mockSessions,
        itemsBySession: mockItemsBySession,
        isReady: true,
      }),
    {
      getState: () => ({ deleteSession: mockDeleteSession }),
    },
  ),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'sess-1' }),
}));

jest.mock('@/utils/dialog', () => ({
  confirmDestructive: jest.fn(() => Promise.resolve(true)),
  showAlert: jest.fn(),
}));

import ItemListScreen from '@/app/session/[id]';

describe('ItemList — empty session auto-delete', () => {
  beforeEach(() => {
    mockDeleteSession.mockClear();
    mockSessions = [{ id: 'sess-1', createdAt: new Date(), storeName: 'A' }];
    mockItemsBySession = { 'sess-1': [] }; // 空
  });

  it('unmount 時若 items 為空,呼叫 deleteSession', async () => {
    const { unmount } = await render(<ItemListScreen />);
    await unmount();
    expect(mockDeleteSession).toHaveBeenCalledWith('sess-1');
  });

  it('有 items 時不應自動刪', async () => {
    mockItemsBySession = {
      'sess-1': [{ id: 'i1', name: 'x', labelPhotos: ['f'] }],
    };
    const { unmount } = await render(<ItemListScreen />);
    await unmount();
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('unmount 後才新增 items 不會被追溯刪除(ref 已是 [] 的快照)', async () => {
    const { unmount } = await render(<ItemListScreen />);
    await unmount();
    mockItemsBySession = { 'sess-1': [{ id: 'i1', name: 'x' }] };
    expect(mockDeleteSession).toHaveBeenCalledTimes(1);
  });
});

// ponytail: 釣底 TotalBar 是這次 commit 的核心 UX — 一眼看到「採買總計」採買人最在意的數字。
// 只驗「空 / 單筆 / 多筆 × quantity × price 混合 / 沒 price」四條路徑,夠鎖行為就行。
describe('ItemList — TotalBar 加總', () => {
  function setupMocks(items: unknown[]) {
    mockDeleteSession.mockClear();
    mockSessions = [{ id: 'sess-1', createdAt: new Date(), storeName: 'A' }];
    mockItemsBySession = { 'sess-1': items };
  }

  it('空清單顯示 NT$0,2 件不算(空就不算單位)', async () => {
    setupMocks([]);
    const { getByText } = await render(<ItemListScreen />);
    expect(getByText('採買總計 0 件')).toBeTruthy();
    expect(getByText('NT$0')).toBeTruthy();
  });

  it('單筆 price × quantity 加到總計', async () => {
    // NT$199 × 3 = NT$597
    setupMocks([
      {
        id: 'i1',
        name: '御飯糰',
        expectedPrice: 199,
        quantity: 3,
        labelPhotos: ['f'],
        extraPhotos: [],
      },
    ]);
    const { getAllByText, getByText } = await render(<ItemListScreen />);
    // 小計跟總計都會顯示 NT$597(單筆情境兩者相等)
    expect(getAllByText('NT$597').length).toBe(2);
    expect(getByText('採買總計 3 件')).toBeTruthy();
  });

  it('多筆混合:price × qty 加總,缺 price 的不計入金額(但仍算件數)', async () => {
    // 199 × 2 = 398, 沒 price 不計金額但算 1 件, 45 × 1 = 45
    setupMocks([
      {
        id: 'a',
        name: 'A',
        expectedPrice: 199,
        quantity: 2,
        labelPhotos: [],
        extraPhotos: [],
      },
      {
        id: 'b',
        name: 'B',
        quantity: 1,
        labelPhotos: [],
        extraPhotos: [],
      },
      {
        id: 'c',
        name: 'C',
        expectedPrice: 45,
        quantity: 1,
        labelPhotos: [],
        extraPhotos: [],
      },
    ]);
    const { getByText } = await render(<ItemListScreen />);
    expect(getByText('NT$443')).toBeTruthy(); // 總計(row 加總不會剛好撞同一個數)
    expect(getByText('採買總計 4 件')).toBeTruthy(); // 2 + 1 + 1
  });

  it('商品 name 空白時各列顯示「未命名商品」而非空白字串', async () => {
    setupMocks([
      {
        id: 'x',
        name: '',
        expectedPrice: 50,
        quantity: 1,
        labelPhotos: [],
        extraPhotos: [],
      },
    ]);
    const { getAllByText } = await render(<ItemListScreen />);
    expect(getAllByText('未命名商品').length).toBeGreaterThan(0);
  });
});
