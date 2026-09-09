// 最小單元測試:ocrPrice 的 5xx / 429 retry + 多行文字價格抽取。
// 不 mock 整個 RN — 只 mock fetch,鎖在 retry / 解析邏輯本身。

process.env.EXPO_PUBLIC_PADDLEOCR_URL = 'https://fake.example.com';
process.env.EXPO_PUBLIC_PADDLEOCR_API_KEY = 'K_FAKE_KEY_FOR_TEST';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.resetModules();
  jest.restoreAllMocks();
});

function mockFetchSequence(responses: Array<{ status: number; body?: unknown }>) {
  let i = 0;
  global.fetch = jest.fn(async () => {
    if (i >= responses.length) {
      throw new Error(`mockFetchSequence 用光 (call #${i + 1},已備 ${responses.length} 個)`);
    }
    const r = responses[i++];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
}

describe('ocrPrice — 5xx / 429 retry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('503 → 200:第 2 次就成功', async () => {
    mockFetchSequence([
      { status: 503 },
      {
        status: 200,
        body: { lang: 'chinese_cht', texts: ['NT$199'], scores: [0.99], boxes: [[0, 0, 1, 1]] },
      },
    ]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    const promise = ocrPrice('file:///fake.jpg');
    await jest.advanceTimersByTimeAsync(1000);
    expect(await promise).toBe(199);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('503 × 3 → 200:第 4 次才成功', async () => {
    mockFetchSequence([
      { status: 503 },
      { status: 503 },
      { status: 503 },
      {
        status: 200,
        body: { lang: 'chinese_cht', texts: ['NT$89'], scores: [0.99], boxes: [[0, 0, 1, 1]] },
      },
    ]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    const promise = ocrPrice('file:///fake.jpg');
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(4000);
    expect(await promise).toBe(89);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('429 也 retry:流量錯誤一樣退避', async () => {
    mockFetchSequence([
      { status: 429 },
      {
        status: 200,
        body: { lang: 'chinese_cht', texts: ['NT$89'], scores: [0.99], boxes: [[0, 0, 1, 1]] },
      },
    ]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    const promise = ocrPrice('file:///fake.jpg');
    await jest.advanceTimersByTimeAsync(1000);
    expect(await promise).toBe(89);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('503 連發 5 次:retry 用盡,丟中文訊息', async () => {
    mockFetchSequence([
      { status: 502 },
      { status: 503 },
      { status: 503 },
      { status: 504 },
      { status: 503 },
    ]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    const promise = ocrPrice('file:///fake.jpg');
    const expectation = expect(promise).rejects.toThrow('OCR 服務暫時無法使用,請稍後重試');
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(4000);
    await jest.advanceTimersByTimeAsync(8000);
    await expectation;
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it('401 → 立刻丟 API key 錯誤(不 retry)', async () => {
    mockFetchSequence([{ status: 401 }]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    await expect(ocrPrice('file:///fake.jpg')).rejects.toThrow('OCR API key 錯誤');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('404 → 立刻丟伺服器找不到(通常 tunnel 死了)', async () => {
    mockFetchSequence([{ status: 404 }]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    await expect(ocrPrice('file:///fake.jpg')).rejects.toThrow('OCR 伺服器找不到');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('422 → 立刻丟 status(通常 lang 不支援)', async () => {
    mockFetchSequence([{ status: 422 }]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    await expect(ocrPrice('file:///fake.jpg')).rejects.toThrow('OCR HTTP 422');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('fetch throw TypeError(CORS / DNS / 連線拒絕)→ 中文錯誤,不重試', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    await expect(ocrPrice('file:///fake.jpg')).rejects.toThrow('OCR 伺服器無法連線');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('ocrPrice — 多行文字處理', () => {
  it('多行只有一行有價 → 用那一行', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          lang: 'chinese_cht',
          texts: ['可口可樂 350ml', 'NT$199', '產地:台灣'],
          scores: [0.99, 0.99, 0.99],
          boxes: [[0, 0, 1, 1]],
        },
      },
    ]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    expect(await ocrPrice('file:///fake.jpg')).toBe(199);
  });

  it('多行都有價 → join 後套啟發式(「X 元」priority 高於 NT$)', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          lang: 'chinese_cht',
          texts: ['原價 250 元', '特價 NT$199'],
          scores: [0.99, 0.99],
          boxes: [[0, 0, 1, 1]],
        },
      },
    ]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    expect(await ocrPrice('file:///fake.jpg')).toBe(250);
  });

  it('完全沒文字 → 回傳 null', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: { lang: 'chinese_cht', texts: [], scores: [], boxes: [] },
      },
    ]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    expect(await ocrPrice('file:///fake.jpg')).toBeNull();
  });

  it('有文字但沒價 → 回傳 null', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          lang: 'chinese_cht',
          texts: ['可口可樂', '產地:台灣', '成分:水、糖、二氧化碳'],
          scores: [0.99, 0.99, 0.99],
          boxes: [[0, 0, 1, 1]],
        },
      },
    ]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    expect(await ocrPrice('file:///fake.jpg')).toBeNull();
  });

  it('價格格式 NT$ / NTD / $ / X 元 都吃', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          lang: 'chinese_cht',
          texts: ['NTD 250 元'],
          scores: [0.99],
          boxes: [[0, 0, 1, 1]],
        },
      },
    ]);
    jest.resetModules();
    const { ocrPrice } = require('@/utils/ocr');
    expect(await ocrPrice('file:///fake.jpg')).toBe(250);
  });
});

describe('ocrRecognize — 同時回傳原文 + 價格', () => {
  // 新增的入口,UI 要拿 texts 丟備註 — 鎖住這條路徑別被悄悄改回單純丟 number
  it('回傳 { price, texts },兩者同源', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          lang: 'chinese_cht',
          texts: ['可口可樂 350ml', 'NT$199', '產地:台灣'],
          scores: [0.99, 0.99, 0.99],
          boxes: [[0, 0, 1, 1]],
        },
      },
    ]);
    jest.resetModules();
    const { ocrRecognize } = require('@/utils/ocr');
    const result = await ocrRecognize('file:///fake.jpg');
    expect(result.price).toBe(199);
    expect(result.texts).toEqual(['可口可樂 350ml', 'NT$199', '產地:台灣']);
  });

  it('完全沒文字 → price 與 texts 都空', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: { lang: 'chinese_cht', texts: [], scores: [], boxes: [] },
      },
    ]);
    jest.resetModules();
    const { ocrRecognize } = require('@/utils/ocr');
    const result = await ocrRecognize('file:///fake.jpg');
    expect(result.price).toBeNull();
    expect(result.texts).toEqual([]);
  });
});

describe('extractName — 從 OCR 原文挑品名', () => {
  let extractName: (texts: string[]) => string | null;
  beforeEach(() => {
    jest.resetModules();
    ({ extractName } = require('@/utils/ocr'));
  });

  it('常見台灣標籤:品名 + 容量同行、價格/產地另外行 → 取第一個含中文的候選', () => {
    expect(
      extractName(['可口可樂 350ml', 'NT$199', '產地:台灣']),
    ).toBe('可口可樂 350ml');
  });

  it('跳過價格行 (特價/原價) — 即使整行有中文', () => {
    expect(
      extractName(['特價 49 元', '御飯糰 鮭魚', '產地:日本']),
    ).toBe('御飯糰 鮭魚');
  });

  it('跳過純容量行 (350ml、6 入) — 中文必備', () => {
    expect(
      extractName(['350ml', '御飯糰 鮭魚', 'NT$49']),
    ).toBe('御飯糰 鮭魚');
  });

  it('跳過規格/成分/產地行', () => {
    expect(
      extractName([
        '產地:台灣',
        '成分:水、糖',
        '保存期限:2025/12/31',
        '可口可樂',
      ]),
    ).toBe('可口可樂');
  });

  it('只有英文品名 → 跳過(本 app 中文為主)', () => {
    // 文件化行為: 沒 CJK 就視為不可信,留 null 給使用者手動
    expect(extractName(['Coca-Cola', 'NT$199'])).toBeNull();
  });

  it('全部都是價格/規格行 → null,UI 不覆蓋使用者可能已打的空字串', () => {
    expect(
      extractName(['NT$199', '特價 89', '產地:台灣', '350ml']),
    ).toBeNull();
  });

  it('空陣列 / 全空白 → null', () => {
    expect(extractName([])).toBeNull();
    expect(extractName(['', '   ', '\t'])).toBeNull();
  });
});
