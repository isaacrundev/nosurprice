import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

function pickViaWebFileInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve(URL.createObjectURL(file));
    };
    input.click();
  });
}

// 只負責「打開挑選器並回傳原始 URI」,不做任何處理。
// 進度回饋由 caller 負責包 persistPhoto 那段(native 才有實質工作)。
export async function pickFromLibrary(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return pickViaWebFileInput();
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.8,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}
