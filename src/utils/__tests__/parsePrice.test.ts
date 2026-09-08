import { formatPrice, lineTotal, parsePrice } from '@/types';
import { extractPrice } from '@/utils/ocr';

describe('parsePrice', () => {
  it.each([
    ['199', 199],
    ['NT$199', 199],
    ['$199', 199],
    ['1,999', 1999],
    ['NT$1,999', 1999],
    ['  42  ', 42],
    ['199.6', 200],
  ])('parsePrice(%j) → %p', (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it('文件化限制:NTD (無 $) 不被 strip,回 null', () => {
    expect(parsePrice('NTD 199')).toBeNull();
  });

  it('rejects empty / negative / non-numeric', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('   ')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice('-5')).toBeNull();
    expect(parsePrice('1.2.3')).toBeNull();
  });

  it('formatPrice rounds and prefixes NT$', () => {
    expect(formatPrice(199)).toBe('NT$199');
    expect(formatPrice(199.6)).toBe('NT$200');
    expect(formatPrice(undefined)).toBe('');
    expect(formatPrice(null)).toBe('');
  });
});

describe('lineTotal', () => {
  it('price × quantity,兩個都給', () => {
    expect(lineTotal({ expectedPrice: 199, quantity: 3 })).toBe(597);
  });
  it('缺 price → undefined(UI 層不顯示金額)', () => {
    expect(lineTotal({ expectedPrice: undefined, quantity: 3 })).toBeUndefined();
  });
  it('缺 quantity 視為 1,不讓缺欄位的商品突然變成 0 元', () => {
    expect(lineTotal({ expectedPrice: 199, quantity: undefined })).toBe(199);
    expect(lineTotal({ expectedPrice: 199, quantity: 0 })).toBe(199); // < 1 fallback
  });
  it('小數會 round,避免浮點飄掉(單價先 round 一次到底)', () => {
    // Math.round(199.4) = 199;199 * 3 = 597。不會 trade 到下一輪才 round,避免單價×qty 後的微飄。
    expect(lineTotal({ expectedPrice: 199.4, quantity: 3 })).toBe(597);
    // JS Math.round(.5) 是「+∞ 方向」 — 199.5 → 200 × 3 = 600。文件化即可,別誤用。
    expect(lineTotal({ expectedPrice: 199.5, quantity: 3 })).toBe(600);
  });
});

describe('extractPrice', () => {
  it('「X 元」用第一個 match(cheapest heuristic)', () => {
    expect(extractPrice('特價 49 元 / 盒')).toBe(49);
    // 第一個 X 元命中 → 100;這是文件化行為,不是 bug
    expect(extractPrice('原價 100 元 特價 79 元')).toBe(100);
  });

  it('falls back to NT$ / NTD / $', () => {
    expect(extractPrice('NT$199')).toBe(199);
    expect(extractPrice('NTD 250')).toBe(250);
    expect(extractPrice('$ 35')).toBe(35);
  });

  it('falls back to promo keywords', () => {
    expect(extractPrice('特價 89')).toBe(89);
    expect(extractPrice('優惠:199')).toBe(199);
    expect(extractPrice('促銷 250')).toBe(250);
    expect(extractPrice('活動價 399')).toBe(399);
  });

  it('last-resort: takes the last plausible integer (> 0, < 100000)', () => {
    expect(extractPrice('整盒 6 入 共 180')).toBe(180);
  });

  it('returns null when nothing plausible', () => {
    expect(extractPrice('hello world')).toBeNull();
  });

  it('「0 元」會回 0(無下限檢查,只有 last-resort 才過濾)', () => {
    // 文件化:0 元 → 0。欄位可編輯,使用者自己改
    expect(extractPrice('0 元')).toBe(0);
  });
});
