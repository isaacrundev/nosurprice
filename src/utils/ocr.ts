import { Platform } from 'react-native';

// ⚠️ MVP-only: key 從 .env.local 進 client bundle(EXPO_PUBLIC_* Metro 會自動內嵌)。
// APK 仍能反組組拿到,只是不進 git history。上 production 一定要搬後端 proxy。
//
// ⚠️ PADDLEOCR_URL 是 Cloudflare trycloudflare.com 免費 tunnel,每次重啟 tunnel
// subdomain 會換;WSL / 網路掛掉時整支會死。每次 deploy 後必須更新這個 env。
// 若要走 stable URL → 註冊 domain + 設 Cloudflare named Tunnel。
const PADDLEOCR_URL = process.env.EXPO_PUBLIC_PADDLEOCR_URL;
const PADDLEOCR_API_KEY = process.env.EXPO_PUBLIC_PADDLEOCR_API_KEY;
// Server 目前只載 chinese_cht(看 /health)。其他 lang 會 422。
const PADDLEOCR_LANG = process.env.EXPO_PUBLIC_PADDLEOCR_LANG ?? 'chinese_cht';

function requireConfig(): { url: string; apiKey: string } {
  if (!PADDLEOCR_URL || !PADDLEOCR_API_KEY) {
    throw new Error(
      'OCR 設定未完成。請在 .env.local 加上 EXPO_PUBLIC_PADDLEOCR_URL + EXPO_PUBLIC_PADDLEOCR_API_KEY',
    );
  }
  return { url: PADDLEOCR_URL.replace(/\/$/, ''), apiKey: PADDLEOCR_API_KEY };
}

interface PaddleOCRResponse {
  lang?: string;
  texts?: string[];
  scores?: number[];
  boxes?: number[][];
}

async function buildFormData(uri: string): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    // expo-image-picker 在 web 上回 blob:http://... — fetch 拿 Blob 再 append。
    const blob = await fetch(uri).then((r) => r.blob());
    form.append('file', blob, 'photo.jpg');
  } else {
    // RN native:FormData 接受 {uri, name, type},fetch 內部讀檔上傳。
    const isPng = uri.toLowerCase().includes('.png');
    form.append('file', {
      uri,
      name: isPng ? 'photo.png' : 'photo.jpg',
      type: isPng ? 'image/png' : 'image/jpeg',
    } as unknown as Blob);
  }
  return form;
}

async function postOCR(url: string, apiKey: string, uri: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: await buildFormData(uri),
  });
}

async function callPaddleOCR(uri: string): Promise<string[]> {
  const { url, apiKey } = requireConfig();
  const endpoint = `${url}/ocr?lang=${encodeURIComponent(PADDLEOCR_LANG)}`;

  // fetch throw TypeError 在 web 上 = CORS preflight 失敗 / DNS / 連線拒絕。
  // 不能區分哪一個,但跟「伺服器掛了」是同一類使用者動作:請聯絡開發者。
  // 在 native (iOS/Android) 不會送 CORS 預檢 → 不會遇到這個。
  let res: Response;
  try {
    res = await postOCR(endpoint, apiKey, uri);
  } catch {
    throw new Error('OCR 伺服器無法連線,請檢查網路或聯絡開發者');
  }
  // 5xx / 429 = server 暫時掛 / load shedding(同樣的雲端 load-shed,跟 Gemini 503 一樣情境)。
  // ponytail: 4 retries × [1, 2, 4, 8]s × ±25% jitter = 最壞 ~17s。
  // 不無限退避:失敗要即時回報,不要 spinner 轉 1 分鐘。
  const BACKOFFS_MS = [1000, 2000, 4000, 8000];
  for (let attempt = 0; attempt < BACKOFFS_MS.length && !res.ok && (res.status >= 500 || res.status === 429); attempt++) {
    const jitter = BACKOFFS_MS[attempt] * (0.75 + Math.random() * 0.5);
    await new Promise<void>((r) => setTimeout(r, jitter));
    res = await postOCR(endpoint, apiKey, uri);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('OCR API key 錯誤,請聯絡開發者');
    }
    if (res.status === 404) {
      // 最常見:tunnel 死了 / URL 換了
      throw new Error('OCR 伺服器找不到,請聯絡開發者');
    }
    if (res.status >= 500 || res.status === 429) {
      throw new Error('OCR 服務暫時無法使用,請稍後重試');
    }
    throw new Error(`OCR HTTP ${res.status}`);
  }

  const json = (await res.json()) as PaddleOCRResponse;
  return Array.isArray(json.texts) ? json.texts : [];
}

// 從 OCR 文字抽出最可能的價錢;找不到回傳 null。
// 啟發式依序:「X 元」> 「NT$/NTD/$ X」> 「特價/優惠 X」> 整段最後一個數字。
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

// 從標籤照直接抽出價格。把所有 OCR 行 join 起來丟給 extractPrice,
// 由它的啟發式去挑「X 元」>「NT$」>「特價」>最後一個數字。
// 為什麼不逐行:逐行會讓「可口可樂 350ml」這種行誤命中(走 last-resort 回 350)。
// 跨行 join + 優先順序,才能讓 currency marker 贏過裸數字。
export async function ocrPrice(uri: string): Promise<number | null> {
  const texts = await callPaddleOCR(uri);
  if (texts.length === 0) return null;
  return extractPrice(texts.join(' '));
}
