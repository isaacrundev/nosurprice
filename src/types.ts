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
  name: string;
  // 整數 NTD;台幣無小數點。MVP 鎖台灣,日後做多幣別再抽 Currency
  expectedPrice?: number;
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

// 解析使用者輸入 → 整數 NTD。接受 "199" / "$199" / "NT$199" / "1,999"
export function parsePrice(input: string): number | null {
  const trimmed = input.trim().replace(/^NT\$|^\$/i, '').replace(/,/g, '');
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}
