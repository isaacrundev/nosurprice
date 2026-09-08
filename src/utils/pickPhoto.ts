import { Alert, Platform } from 'react-native';
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

async function takePhoto(): Promise<string | null> {
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.8,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

async function pickFromLibrary(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    quality: 0.8,
    allowsEditing: false,
    mediaTypes: ['images'],
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

// 先問來源(native only),再走對應 picker。回傳原始 URI;後續 persist 由 caller 處理。
export async function pickPhoto(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return pickViaWebFileInput();
  }
  const source = await new Promise<'camera' | 'library' | null>((resolve) => {
    Alert.alert(
      '新增照片',
      undefined,
      [
        { text: '取消', style: 'cancel', onPress: () => resolve(null) },
        { text: '從相簿選取', onPress: () => resolve('library') },
        { text: '拍照', onPress: () => resolve('camera') },
      ],
    );
  });
  if (!source) return null;
  return source === 'camera' ? takePhoto() : pickFromLibrary();
}
