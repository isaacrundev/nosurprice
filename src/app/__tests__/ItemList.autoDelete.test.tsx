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
