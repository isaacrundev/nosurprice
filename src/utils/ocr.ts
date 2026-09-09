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

// 從 OCR 一行一行文字裡挑最像品名的候選;找不到回傳 null。
// ponytail: 純啟發式,沒有 LLM / layout 分析。預期 ~75% 命中常見台灣標籤
// (品名在上半 + 中文 + 沒價格/容量/規格關鍵字),怪 label (全英文、品名混
// 在成分表、橫排變直排順序亂) 會誤抓 — 失敗就讓欄位空,使用者打字覆蓋。
// 升級路徑:把 texts 丟 Gemini Flash 問「哪行是品名?」,成本 ~1s + 額外 API key。
const NAME_HAS_CJK = /[\u4e00-\u9fff]/;
// 純容量 / 純數字 (例:「350ml」「6 入」「100g」「1.5L」) 直接略過。
const NAME_CAPACITY_ONLY = /^[\d\s.,mlMgGkK入個片包罐瓶條袋組]+$/i;
// 價格 / 促銷 / 規格關鍵字 — 這些行幾乎不會是品名。
const NAME_NOISE_PATTERNS: RegExp[] = [
  /NT\$|NTD\b|\$/i,
  /(?:特價|優惠|促銷|限時|活動價|原價|建議售價)/,
  /(?:產地|製造|保存|有效|期限|成分|容量|重量|淨重|規格|數量|條碼|進口|代理商)/,
];

export function extractName(texts: string[]): string | null {
  for (const raw of texts) {
    const line = raw.trim();
    if (!line) continue;
    if (!NAME_HAS_CJK.test(line)) continue;
    if (NAME_CAPACITY_ONLY.test(line)) continue;
    if (NAME_NOISE_PATTERNS.some((p) => p.test(line))) continue;
    return line;
  }
  return null;
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

// OCR 一次跑完,同時回傳「原始文字陣列 + 抽出的價格 + 抽出的品名」。
// 原始文字留給備註欄,讓使用者對著原文自己挑價格 — 自動抽取失準時還有
// 救濟管道,不用盲目相信 regex 挑到的數字。
export interface OcrResult {
  price: number | null;
  name: string | null;
  texts: string[];
}

export async function ocrRecognize(uri: string): Promise<OcrResult> {
  const texts = await callPaddleOCR(uri);
  if (texts.length === 0) return { price: null, name: null, texts: [] };
  const joined = texts.join(' ');
  return {
    price: extractPrice(joined),
    name: extractName(texts),
    texts,
  };
}

// 從標籤照直接抽出價格。為什麼不逐行:逐行會讓「可口可樂 350ml」這種行誤命中
// (走 last-resort 回 350)。跨行 join + 優先順序,才能讓 currency marker 贏過裸數字。
// 既有契約保留 — 測試 / 外部呼叫不會被打破;新流程請改用 ocrRecognize 拿 texts。
export async function ocrPrice(uri: string): Promise<number | null> {
  return (await ocrRecognize(uri)).price;
}
