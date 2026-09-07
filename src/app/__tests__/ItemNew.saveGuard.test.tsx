import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockAddItem = jest.fn();

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
  pickFromLibrary: jest.fn(),
}));

jest.mock('@/utils/photoStorage', () => ({
  persistPhoto: jest.fn(),
}));

jest.mock('@/utils/ocr', () => ({
  ocrImage: jest.fn(),
  extractPrice: jest.fn(),
}));

import ItemNewScreen from '@/app/session/[id]/item/new';

describe('ItemNew — save guard', () => {
  beforeEach(() => {
    mockAddItem.mockClear();
  });

  it('沒標籤照時儲存按鈕 disabled,點了也不會 addItem', async () => {
    const { getByText } = await render(<ItemNewScreen />);
    const btn = getByText('需先拍標籤照');
    fireEvent.press(btn);
    expect(mockAddItem).not.toHaveBeenCalled();
  });
});
