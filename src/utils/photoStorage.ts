import * as FileSystem from 'expo-file-system/legacy';

const PHOTOS_DIR = (FileSystem.documentDirectory ?? '') + 'photos/';

async function ensurePhotosDir(): Promise<void> {
  await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
}

// 把 image-picker 回傳的暫存 URI 複製到 app 永久目錄,避免被系統清掉
export async function persistPhoto(sourceUri: string): Promise<string> {
  await ensurePhotosDir();
  const ext =
    sourceUri
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'jpg';
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const dest = PHOTOS_DIR + filename;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

// 刪單張照片。item 刪除時目前沒接線,留擴充點
export async function deletePhoto(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // 檔案可能已不存在,swallow
  }
}
