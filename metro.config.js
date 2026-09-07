// expo-sqlite web worker 需要把 wa-sqlite.wasm 當 asset bundle,
// Metro 預設不認 .wasm,加進 assetExts 就會走 asset 解析路徑
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

module.exports = config;
