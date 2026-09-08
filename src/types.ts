// Domain types — 對應 PRD §5
export type Session = {
  id: string;
  createdAt: Date;
  storeName?: string;
  note?: string;
};

export type Item = {
  id: string;
  sessionId: string;
  // ponytail: 採買現場常見「先看見標籤才想到名字」 — 名字不再必填,空字串表示未命名。
  // UI 列表顯示「未命名商品」placeholder;DB 層 schema 仍 NOT NULL,空字串合法(避免改 FK 結構)。
  name: string;
  // 整數 NTD;台幣無小數點。MVP 鎖台灣,日後做多幣別再抽 Currency
  expectedPrice?: number;
  // 採買數量(預設 1)。購物場景一次買多件相同商品很常見(三杯鷄 x 3) — 之前要分三筆存,
  // 加這欄讓使用者一筆就能表達「買 3 個」並在列表加總。optional 是要讓
  // test fixture / NewItemInput 不必每次硬塞 1,store 層會補 default。
  quantity?: number;
  // 標籤照(§8.1 required,>= 1 張);UI 層擋下沒有時不能存
  labelPhotos: string[];
  // 其他照片:商品照、DM 廣宣等 optional
  extraPhotos: string[];
  note?: string;
  capturedAt: Date;
};

// 顯示用 — 把 NTD 整數轉成 "NT$199"
export function formatPrice(price: number | undefined | null): string {
  if (price == null) return '';
  return `NT$${Math.round(price)}`;
}

// 小計 = 單價 × 數量。沒有單價(使用者只先記名字/標籤照)回 undefined,
// 列表層遇到就只顯示「x N」。
export function lineTotal(item: Pick<Item, 'expectedPrice' | 'quantity'>): number | undefined {
  if (item.expectedPrice == null) return undefined;
  return Math.round(item.expectedPrice) * Math.max(1, Math.round(item.quantity || 1));
}

// 解析使用者輸入 → 整數 NTD。接受 "199" / "$199" / "NT$199" / "1,999"
export function parsePrice(input: string): number | null {
  const trimmed = input.trim().replace(/^NT\$|^\$/i, '').replace(/,/g, '');
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}
