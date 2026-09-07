import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// 測試用的 render 工具。expo-image / expo-router / safe-area 等需要 Provider 的
// 元件不會裸跑(例如 PhotoViewer 用 useSafeAreaInsets)。包一個最小 SafeAreaProvider
// (initialMetrics 必填,不然 RN 不給半成品 0),讓測試不用每次手動包。
export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions,
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 320, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
    ...options,
  });
}
