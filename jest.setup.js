// expo-sqlite mock 已經放在 __mocks__/expo-sqlite.js — Jest 自動用 manual mock
// 取代原生模組,這裡不用再寫 jest.mock。
// (若再寫 jest.mock('expo-sqlite', () => require('./__mocks__/...'))
// 會造成 mock factory 在 require 自己時遞迴 → stack overflow。)
