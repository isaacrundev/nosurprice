import { Alert, Platform } from 'react-native';

// ponytail: React Native 的 Alert.alert 在 web 是 no-op (只 ios/android 有 native dialog)。
// 用 platform 分流:native 走 Alert,web 走瀏覽器原生 confirm/alert(同步動作,跟
// Alert 等價,UX 不漂亮但 preview 可用)。
export function confirmDestructive(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel', onPress: () => resolve(false) },
      { text: '刪除', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
