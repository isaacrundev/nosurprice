import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockAddItem = jest.fn();
const mockPick = jest.fn();
const mockPersist = jest.fn();

jest.mock('@/store', () => ({
  useStore: (sel: any) =>
    sel({
      addItem: mockAddItem,
      itemsBySession: {},
    }),
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

jest.mock('@/utils/pickPhoto', () => ({
  pickFromLibrary: () => mockPick(),
}));

jest.mock('@/utils/photoStorage', () => ({
  persistPhoto: (uri: string) => mockPersist(uri),
}));

jest.mock('@/utils/ocr', () => ({
  ocrPrice: jest.fn(),
}));

import ItemNewScreen from '@/app/session/[id]/item/new';

describe('ItemNew — 兩步驟流程', () => {
  beforeEach(() => {
    mockAddItem.mockClear();
    mockPick.mockReset();
    mockPersist.mockReset();
  });

  it('預設顯示第一步上傳標籤照,沒標籤時不顯示「下一步」按鈕、表單不渲染', async () => {
    const { getByText, queryByText } = await render(<ItemNewScreen />);

    // step 1 的提示文案
    expect(getByText('先拍標籤照')).toBeTruthy();
    // 沒標籤前不應出現「下一步」按鈕
    expect(queryByText('下一步')).toBeNull();

    // step 2 的欄位此時尚未掛載
    expect(queryByText('商品名稱')).toBeNull();
    expect(queryByText('看到的價格 (NTD)')).toBeNull();
    expect(queryByText('儲存')).toBeNull();
  });

  it('上傳標籤後出現「下一步」,推進到表單;在表單內刪光標籤會擋住儲存', async () => {
    mockPick.mockResolvedValue('content://picker/photo');
    mockPersist.mockResolvedValue('file:///photos/persisted.jpg');

    const { getByText, queryByText } = await render(<ItemNewScreen />);

    // 上傳前沒有「下一步」
    expect(queryByText('下一步')).toBeNull();

    // 模擬上傳一張標籤照
    await act(async () => {
      fireEvent.press(getByText('＋'));
    });

    // 上傳成功後才出現「下一步」
    expect(getByText('下一步')).toBeTruthy();
    // 還沒進 step 2,表單不出現
    expect(queryByText('商品名稱')).toBeNull();

    // 推進到 step 2
    await act(async () => {
      fireEvent.press(getByText('下一步'));
    });

    // 表單已掛,儲存按鈕可按(label 有 required 標記被切成 nested Text,用 regex 找)
    expect(getByText(/商品名稱/)).toBeTruthy();
    expect(getByText('儲存')).toBeTruthy();

    // 在 step 2 把唯一的標籤照刪掉
    await act(async () => {
      fireEvent.press(getByText('×'));
    });

    // canSave=false → 儲存按鈕回到 disabled 文字
    expect(getByText('需先拍標籤照')).toBeTruthy();

    // 點 disabled 的儲存,不會 addItem
    await act(async () => {
      fireEvent.press(getByText('需先拍標籤照'));
    });
    expect(mockAddItem).not.toHaveBeenCalled();
  });
});
