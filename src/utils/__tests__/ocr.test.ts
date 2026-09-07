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
