import React from 'react';
import { act, cleanup, fireEvent } from '@testing-library/react-native';

import { PhotoGrid } from '@/components/PhotoGrid';
import { renderWithProviders } from '@/test-utils/render';

afterEach(async () => {
  // jest-expo 預設不一定 await act() 卸載,連跑多個 render 會被下一個污染。
  await cleanup();
});

// fireEvent 要包 act() 才能讓 RN 內部 pending update 走完,否則下一個
// render 接到上輪的 un-await act() 會踏到錯的樹上。
const press = async (...args: Parameters<typeof fireEvent.press>) =>
  act(async () => {
    fireEvent.press(...args);
  });

// 鎖住兩條路徑:
// 1) 有 onPress → 點縮圖叫 onPress(uri);點 × 仍走 onRemove (兩動作不互撞)
// 2) 沒 onPress → 縮圖不可按,但 × 跟 ＋ 仍能用
describe('PhotoGrid', () => {
  it('有 onPress:點縮圖呼叫 onPress(帶該張 uri);× 仍走 onRemove;＋ 仍走 onAdd', async () => {
    const onPress = jest.fn();
    const onRemove = jest.fn();
    const onAdd = jest.fn();

    const { getAllByLabelText, getAllByText } = await renderWithProviders(
      <PhotoGrid
        photos={['file:///a.jpg', 'file:///b.jpg']}
        onAdd={onAdd}
        onRemove={onRemove}
        onPress={onPress}
      />,
    );

    const thumbs = getAllByLabelText('檢視照片');
    expect(thumbs).toHaveLength(2);

    await press(thumbs[0]);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith('file:///a.jpg');

    await press(thumbs[1]);
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(onPress).toHaveBeenLastCalledWith('file:///b.jpg');

    // × 路徑:2 張 → 2 個 ×
    const xs = getAllByText('×');
    await press(xs[1]); // 第二張的 ×
    expect(onRemove).toHaveBeenCalledWith(1);
    expect(onPress).toHaveBeenCalledTimes(2); // 點 × 不應觸發 onPress

    // ＋ 路徑
    await press(getAllByText('＋')[0]);
    expect(onAdd).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('沒傳 onPress:照片不渲染可點 Pressable,但 × 跟 ＋ 仍能用', async () => {
    const onRemove = jest.fn();
    const onAdd = jest.fn();

    const { queryByLabelText, getByText, getAllByText } = await renderWithProviders(
      <PhotoGrid
        photos={['file:///x.jpg']}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    );

    // 沒 onPress → 沒有「檢視照片」a11y label
    expect(queryByLabelText('檢視照片')).toBeNull();

    await press(getByText('×'));
    expect(onRemove).toHaveBeenCalledWith(0);

    await press(getAllByText('＋')[0]);
    expect(onAdd).toHaveBeenCalled();
  });

  it('空陣列:不渲染縮圖,只看到 ＋', async () => {
    const { queryByLabelText, getByText } = await renderWithProviders(
      <PhotoGrid
        photos={[]}
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        onPress={jest.fn()}
      />,
    );
    expect(queryByLabelText('檢視照片')).toBeNull();
    expect(getByText('＋')).toBeTruthy();
  });
});
