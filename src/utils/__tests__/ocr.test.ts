// 最小單元測試:ocrImage 的 5xx retry 行為。
// 不 mock 整個 RN — 只 mock fetch + 平台檢查,鎖在 retry 邏輯本身。

process.env.EXPO_PUBLIC_OCR_API_KEY = 'K_FAKE_KEY_FOR_TEST';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.resetModules();
});

function mockFetchSequence(responses: { status: number; body?: unknown }[]) {
  let i = 0;
  global.fetch = jest.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
}

describe('ocrImage — 5xx retry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('5xx → 5xx → 200:retry 後成功,parse 出文字', async () => {
    mockFetchSequence([
      { status: 502 },
      { status: 502 },
      {
        status: 200,
        body: { ParsedResults: [{ ParsedText: 'NT$199' }], IsErroredOnProcessing: false },
      },
    ]);
    // require 之後才 mock fetch,避免 require 階段就 call fetch
    jest.resetModules();
    const { ocrImage } = require('@/utils/ocr');
    const promise = ocrImage('file:///fake.jpg');
    // 走 fake timer 把 backoff 推完
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(500);
    const text = await promise;
    expect(text).toBe('NT$199');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('5xx 連發 3 次:retry 用盡,丟中文訊息', async () => {
    mockFetchSequence([{ status: 502 }, { status: 503 }, { status: 504 }]);
    jest.resetModules();
    const { ocrImage } = require('@/utils/ocr');
    const promise = ocrImage('file:///fake.jpg');
    // 把兩個 backoff 都跑完
    const expectation = expect(promise).rejects.toThrow('OCR 服務暫時無法使用,請稍後重試');
    await jest.advanceTimersByTimeAsync(1000);
    await expectation;
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('4xx 不 retry:丟 OCR HTTP <status>', async () => {
    mockFetchSequence([{ status: 400 }]);
    jest.resetModules();
    const { ocrImage } = require('@/utils/ocr');
    await expect(ocrImage('file:///fake.jpg')).rejects.toThrow('OCR HTTP 400');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('200 + IsErroredOnProcessing → 「OCR 無法辨識這張圖」', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: { IsErroredOnProcessing: true, ErrorMessage: 'E502: Corrupted JPEG' },
      },
    ]);
    jest.resetModules();
    const { ocrImage } = require('@/utils/ocr');
    await expect(ocrImage('file:///fake.jpg')).rejects.toThrow('OCR 無法辨識這張圖,請手動輸入價格');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
