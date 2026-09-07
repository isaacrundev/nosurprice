import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// ⚠️ MVP-only: key 從 .env.local 進 client bundle(EXPO_PUBLIC_* Metro 會自動內嵌)。
// APK 仍能反組譯拿到,只是不進 git history。上 production 一定要搬後端 proxy。
const OCR_API_KEY = process.env.EXPO_PUBLIC_OCR_API_KEY;
const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';
// ponytail: language=cht 是繁體中文(Taiwan 標籤);OCREngine=2 對中文辨識率較好。

function requireApiKey(): string {
  if (!OCR_API_KEY) {
    throw new Error(
      'EXPO_PUBLIC_OCR_API_KEY 未設定。請在 .env.local 加上 EXPO_PUBLIC_OCR_API_KEY=<你的 OCR.space key>',
    );
  }
  return OCR_API_KEY;
}

async function uriToDataUrl(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await fetch(uri).then((r) => r.blob());
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('FileReader 失敗'));
      reader.readAsDataURL(blob);
    });
  }
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  return `data:${mime};base64,${base64}`;
}

export async function ocrImage(uri: string): Promise<string> {
  const apiKey = requireApiKey();
  const base64Image = await uriToDataUrl(uri);
  const fetchOpts: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: apiKey,
      language: 'cht',
      isOverlayRequired: false,
      OCREngine: 2,
      scale: true,
      base64Image,
    }),
  };
  // 5xx 是 OCR.space 機房 / 流量問題(免費版常見,論壇有大量抱怨)。
  // ponytail: 最多試 3 次 / 500ms backoff。退到第 3 次才放棄讓使用者手動重試,
  // 不做無限退避(失敗要即時回報,不要 spinner 轉 30 秒)。
  let res = await fetch(OCR_ENDPOINT, fetchOpts);
  for (let attempt = 0; attempt < 2 && !res.ok && res.status >= 500; attempt++) {
    await new Promise<void>((r) => setTimeout(r, 500));
    res = await fetch(OCR_ENDPOINT, fetchOpts);
  }
  if (!res.ok) {
    // 5xx 已經 retry 過了還是掛,給中文訊息;4xx 多半是圖的問題,保留 status 方便排查。
    if (res.status >= 500) {
      throw new Error('OCR 服務暫時無法使用,請稍後重試');
    }
    throw new Error(`OCR HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    ParsedResults?: { ParsedText: string }[];
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string;
    ErrorDetails?: string;
  };
  if (json.IsErroredOnProcessing) {
    // 圖被 OCR.space 判定為損毀 / 無法讀("E502: Corrupted JPEG" 之類)— 對使用者
    // 沒意義。raw 留 console 給開發者排查。
    const raw = json.ErrorMessage || json.ErrorDetails || 'OCR 處理失敗';
    console.warn('[OCR]', raw);
    throw new Error('OCR 無法辨識這張圖,請手動輸入價格');
  }
  return json.ParsedResults?.[0]?.ParsedText ?? '';
}

// 從 OCR 文字抽出最可能的價錢;找不到回傳 null。
// ponytail: 啟發式依序 — 「X 元」> 「NT$/NTD/$ X」> 「特價/優惠 X」> 整段最後一個數字。
// 退回最後一個數字可能誤判(如「整盒 6 入」),但欄位可編輯,使用者手動修就好。
export function extractPrice(text: string): number | null {
  const clean = text.replace(/\s+/g, ' ');
  const yuan = clean.match(/(\d{1,5})\s*元/);
  if (yuan) return parseInt(yuan[1], 10);
  const ccy = clean.match(/(?:NT\$|NTD|\$)\s*(\d{1,5})/);
  if (ccy) return parseInt(ccy[1], 10);
  const promo = clean.match(/(?:特價|優惠|促銷|限時|活動價)\s*[:：]?\s*(\d{1,5})/);
  if (promo) return parseInt(promo[1], 10);
  const all = clean.match(/\d{1,5}/g);
  if (all && all.length > 0) {
    const last = parseInt(all[all.length - 1], 10);
    if (last > 0 && last < 100000) return last;
  }
  return null;
}
