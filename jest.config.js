// jest-expo preset handles TS + React 19 + RN 0.86 transform + Metro assetExts.
// 不在這層覆寫 transformIgnorePatterns(preset 已配好 RN 的 babel-jest 規則),
// 避免擋到 expo-router / worklets。
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
};
