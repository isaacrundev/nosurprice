import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

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
  pickPhoto: () => mockPick(),
}));

jest.mock('@/utils/photoStorage', () => ({
  persistPhoto: (uri: string) => mockPersist(uri),
}));

jest.mock('@/utils/ocr', () => ({
  ocrPrice: jest.fn(),
  ocrRecognize: jest.fn(),
}));

import ItemNewScreen from '@/app/session/[id]/item/new';
import { showAlert } from '@/utils/dialog';

const mockShowAlert = showAlert as jest.MockedFunction<typeof showAlert>;

const advanceToForm = async (getByText: any) => {
  await act(async () => {
    fireEvent.press(getByText('＋'));
  });
  await act(async () => {
    fireEvent.press(getByText('下一步'));
  });
};

describe('ItemNew — 數量必填 + 標籤照上限', () => {
  beforeEach(() => {
    mockAddItem.mockClear();
    mockShowAlert.mockClear();
    mockPick.mockReset();
    mockPersist.mockReset();
    mockPick.mockResolvedValue('content://picker/photo');
    mockPersist.mockResolvedValue('file:///photos/persisted.jpg');
  });

  it('數量欄清空時按儲存 → 跳出提示、不寫 db', async () => {
    const { getByText, getByPlaceholderText } = await renderWithProviders(
      <ItemNewScreen />,
    );
    await advanceToForm(getByText);

    const qtyInput = getByPlaceholderText('1');
    await act(async () => {
      fireEvent.changeText(qtyInput, '');
    });

    await act(async () => {
      fireEvent.press(getByText('儲存'));
    });

    expect(mockShowAlert).toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it('數量欄輸入非正整數 (0 / 0.5 / abc) → 同樣擋下、不寫 db', async () => {
    const { getByText, getByPlaceholderText } = await renderWithProviders(
      <ItemNewScreen />,
    );
    await advanceToForm(getByText);

    for (const bad of ['0', '0.5', 'abc']) {
      mockShowAlert.mockClear();
      mockAddItem.mockClear();
      const qtyInput = getByPlaceholderText('1');
      await act(async () => {
        fireEvent.changeText(qtyInput, bad);
      });
      await act(async () => {
        fireEvent.press(getByText('儲存'));
      });
      expect(mockShowAlert).toHaveBeenCalled();
      expect(mockAddItem).not.toHaveBeenCalled();
    }
  });

  it('數量欄有值 (預設 1 或手填 3) → 寫 db', async () => {
    const { getByText, getByPlaceholderText } = await renderWithProviders(
      <ItemNewScreen />,
    );
    await advanceToForm(getByText);

    // 預設 quantity='1' 直接存 → 應該成功
    await act(async () => {
      fireEvent.press(getByText('儲存'));
    });
    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem.mock.calls[0][0].quantity).toBe(1);

    // 手填 3
    mockAddItem.mockClear();
    const qtyInput = getByPlaceholderText('1');
    await act(async () => {
      fireEvent.changeText(qtyInput, '3');
    });
    await act(async () => {
      fireEvent.press(getByText('儲存'));
    });
    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem.mock.calls[0][0].quantity).toBe(3);
  });

  it('標籤照達 1 張後「＋」隱藏;刪除後「＋」再出現', async () => {
    const { getByText, queryByText, getAllByText } = await renderWithProviders(
      <ItemNewScreen />,
    );

    // step 1: 1 個 ＋ (label grid 只有一塊)
    expect(getAllByText('＋')).toHaveLength(1);

    // 上傳 1 張
    await act(async () => {
      fireEvent.press(getByText('＋'));
    });

    // 達上限,「＋」應該消失
    expect(queryByText('＋')).toBeNull();

    // 刪掉這張
    await act(async () => {
      fireEvent.press(getByText('×'));
    });

    // 「＋」回來
    expect(getByText('＋')).toBeTruthy();
  });

  it('標籤照 section 灰字備註顯示「點圖重新上傳」', async () => {
    const { getByText } = await renderWithProviders(<ItemNewScreen />);
    await advanceToForm(getByText);

    expect(getByText('點圖重新上傳')).toBeTruthy();
  });
});
