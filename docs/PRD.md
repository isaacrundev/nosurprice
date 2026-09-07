form is meaningless (OCR target, dispute evidence, etc.).

## Decisions log

- **2025-09-07 — 點標籤照縮圖全螢幕檢視。** `PhotoGrid` 原本點縮圖什麼都不會發生
  (只有 × 釺能按),結帳台場景下使用者需要親眼再確認標籤照上的價格。
  加:<br>
  1. `PhotoGrid` 新增選用 `onPress?: (uri: string) => void`,有設時縮圖包
     `<Pressable accessibilityLabel="檢視照片" accessibilityHint="點擊放大查看">`。
     × 釺跟 onPress 各自獨立 — 不能撞(刪除 vs 檢視不能互撞)。<br>
  2. 新增 `src/components/PhotoViewer.tsx`:`<Modal transparent fade>` 全黑背景 +
     `<Image>` (expo-image) `contentFit="contain"` 撐滿。右上 × + 點背景關閉,×
     用 `useSafeAreaInsets` 避開 notch。`uri: string | null` 控制開關(null 傳入 = 關)。
     expo-image `cachePolicy="memory-disk"`,重開同一張幾乎零延遲。<br>
  3. `new.tsx` 加 `viewerUri` state、`[itemId].tsx` 同 + 加 header 那張 220px 大圖也變可點
     (原本只是裝飾圖,現在優先用途變成「總攬」)。<br>
  **為什麼不做 pinch-to-zoom**:MVP 需求是「看清楚」,1:1 已經比 80×80 縮圖大 10×+,
  expo-image 的 contain 不裁切保留完整標籤。reanimated 4 + gesture-handler 4 的
  pinch worklet ~80 行,有需要時再加(以「使用者反映看不到小字」為升級訊號)。
  測試:`__tests__/PhotoGrid.test.tsx` 鎖住三條路徑(有 onPress / 沒 onPress / 空 photos),
  fireEvent 要包 act() 才能讓 RN 的 useState 完成(不包下一個 render 接到上輪未清的 act()
  會 tree miss)。`test-utils/render.tsx` 包 SafeAreaProvider 因 PhotoViewer 用
  `useSafeAreaInsets` 需 Provider。
- **2025-09-07 — OCR 改自架 PaddleOCR(換掉 Gemini Flash)。** Gemini flash-latest
  免費 tier 的 503 退不掉,連上指數退避 (1/2/4/8s × 5) 還是會全失敗(看 .1 上 3 發
  連續 503 期間的 stack)。原因是免費 GCP 區域性 load-shedding + 我們一個 app 直接打
  `generativelanguage.googleapis.com`,沒有 quota buffer。改用自架的 PaddleOCR FastAPI
  server(託在 Cloudflare trycloudflare tunnel),`POST /ocr` multipart upload + `X-API-Key`
  header,只做 OCR 拿回 `texts[]` 字串陣列,再由前端 `extractPrice` 跑啟發式抽數字。
  代價:Gemini 一發 API 同時做 vision + extraction,現在要自己寫 regex(舊的拿回來)。
  環境變數 `EXPO_PUBLIC_GEMINI_API_KEY` → `EXPO_PUBLIC_PADDLEOCR_URL` +
  `EXPO_PUBLIC_PADDLEOCR_API_KEY`(+ 可選 `EXPO_PUBLIC_PADDLEOCR_LANG` default
  `chinese_cht`)。Retry 退避不變(同樣的 load-shedding 模式,PaddleOCR 也會跳)。
  **可靠性提醒**:trycloudflare tunnel 每次重啟 subdomain 會換、tunnel / WSL / 網路掛了
  整支會死,所以:
  - 404 → 「OCR 伺服器找不到,請聯絡開發者」(幾乎一定是 URL 換了 / tunnel 死了)
  - 401/403 → 「OCR API key 錯誤,請聯絡開發者」
  - 100% stable URL → 註冊 domain + 設 Cloudflare named Tunnel
  - **Web CORS preflight**: FastAPI server 目前沒設 CORS middleware,`OPTIONS /ocr`
    回 405,POST 沒有 `Access-Control-Allow-Origin` → 瀏覽器預檢不通。native
    (iOS/Android) fetch 不會送預檢 → 不受影響。修正:server 端加
    `from fastapi.middleware.cors import CORSMiddleware` + `app.add_middleware(...)`,
    `allow_origins=["http://localhost:8081"]`(生產再加正式 domain)。client 端 fetch
    throw TypeError(CORS / DNS / 連線拒絕同現)→ 「OCR 伺服器無法連線,請檢查網路或聯絡
    開發者」,不做 retry(無 server 不會自己回來)。
- **2025-09-07 — Gemini OCR retry 改指數退避。** 原 retry 寫 `500ms × 2`
  (3 次),使用者實測連收 3 個 503 — Gemini 503 訊息自承 "Spikes in demand are usually
  temporary" 但實測要 5–10s 才退,500ms 等於送死。改 `[1, 2, 4, 8]s` 指數退避 + ±25%
  jitter,5 次嘗試後才放棄(最壞 ~17s 等 + 5 次 API call)。`new.tsx` / `[itemId].tsx`
  不動,「辨識中...」spinner 自然展延。退避底線沒拉更長(不無限退避)因為失敗要即時
  回報 — 讓使用者立刻看到錯誤重試,而不是 spinner 轉 1 分鐘。
- **2025-09-07 — OCR 換成 Gemini Flash vision。** `src/utils/ocr.ts` 原本走
  `api.ocr.space/parse/image`(OCREngine=2 + cht),免費 tier 機房長期不穩
  (`forum.ui.vision` 有大量 502/503 抱怨,「retry 3 次」只是治標)。改用
  `generativelanguage.googleapis.com` 的 `gemini-flash-latest`(目前 alias 到
  3.8-flash),一發 API 同時做 vision + price extraction,JSON mode + temperature 0
  → 回 `{"price": 199}` 直接吃。同步:`ocrImage(uri)→extractPrice(text)` 兩段
  收成 `ocrPrice(uri): Promise<number | null>`、`extractPrice` regex 全砍
  (Gemini 自己會挑價格)、`new.tsx` / `[itemId].tsx` 呼叫端從兩行壓成一行。
  Retry 邏輯保留(5xx + 429,1+2+4+8s + ±25% jitter,5 次)。環境變數 `EXPO_PUBLIC_OCR_API_KEY` 改名
  `EXPO_PUBLIC_GEMINI_API_KEY`,取 key `aistudio.google.com/apikey`。模型用
  `-latest` alias 不寫死版本號,免得幾個月後又 404。
- **2025-09-07 — OCR 錯誤訊息中文化。** `src/utils/ocr.ts` 原本把 HTTP status / OCR.space
  error code 直接 throw 出去,使用者看到「OCR HTTP 502」或「E502: Corrupted JPEG」這種純
  技術訊息。改:5xx (OCR.space 機房 / 流量問題,免費版常見) → 「OCR 服務暫時無法使用,請稍後
  重試」;`IsErroredOnProcessing` (圖被判定損毀,如 E502 Corrupted JPEG) → 「OCR 無法辨識這
  張圖,請手動輸入價格」,raw error 留 console。改在 throw site,新頁 / 編輯頁 (`new.tsx`
  / `[itemId].tsx`) 共用同一支 `ocrImage`,一次修兩邊都受惠。
- **2025-09-07 — Hydrate 清幽靈 session 改單一 DELETE (Web OPFS)。** 上條加的 for-loop 在
  web 平台炸出 `NoModificationAllowedError: createSyncAccessHandle`。根因:expo-sqlite web
  的 OPFS AccessHandlePoolVFS 一個 file 同時只准一個 sync access handle
  (`github.com/expo/expo/issues/36835, 49450`),N 個 runAsync 等於 N 次搶 handle,幾乎必
  撞。改:一個 `DELETE FROM sessions WHERE id IN (?, ?, ...)` 一發送掉。也順便更新
  `__mocks__/expo-sqlite.js` 讓 mock 認得 `IN (?, ?, ...)`(原本只吃 `WHERE col = ?`)。
  single statement 也順手省 round-trip,native 不受影響。
- **2025-09-07 — OCR 5xx retry。** 上條只翻錯誤訊息,使用者按下「辨識價格」還是會直接吃 502。
  OCR.space 免費版機房 `forum.ui.vision/t/why-is-free-apis-down-continuously/27797` 有長期
  故障歷史,這是免費層 *本來就會遇到* 的事,不是我們能修的東西。加 retry:5xx 時最多重試 2 次
  / 500ms backoff / 共 3 次。判定門檻 `res.status >= 500` 不 retry 4xx(圖的問題,重發也一樣)。
  3 次後才走錯誤訊息路徑。spinneer 期間使用者看到「辨識中...」沒有變化,反正 < 2s。
- **Step-1 footer 釘底: `labelGridWrap` 加 `flex: 1`,把「下一步」壓到螢幕底部。**
  原本 footer 在 flex column 裡跟著 photo grid 自然排,標籤照少時按鈕漂在畫面中段、下方一大塊空白。同樣的「scroll/expanding 內容 + 釘底 footer」pattern 已在 step 2 用 `KeyboardAvoidingView` + `ScrollView` 實作,step 1 補上即可。
- **2025-09-07 — Two-step add-item flow.** Insert a gate step requiring the user
  to upload ≥ 1 label photo before the form is shown. Previous design showed
  the form and the label grid together; users were tempted to fill name/price
  first and skip the label, defeating the app's purpose. Change confined to
  `src/app/session/[id]/item/new.tsx` (added `step` state, split render into
  two views) and the matching screen test.
- **2025-09-07 — Step-1 推進按鈕: 改為「下一步」,只在已上傳標籤照後出現。**
  原本是 disabled 的「繼續填寫 →」永遠顯示,改成完全不在畫面上(沒有標籤照時),上傳 ≥1 張才出現「下一步」。語意更乾淨:沒標籤就沒有「下一步」這回事,而不是「卡住等你按」。
- **2025-09-07 — Hydrate 清空 session,修幽靈採買。** Detail 頁的 auto-delete 只在
  unmount 跑,force-quit / crash / 沒走完 detail 的流程會留沒有 items 的空 session 在 db,
  下次冷啟動 hydrate 讀進 state 後會顯示為幽靈採買。hydrate() 加一段:塞完
  itemsBySession 後,找出空 session 從 db 跟 state 一起刪掉。Detail 頁的 cleanup
  保留(走完正常流程時提供即時刪除的 UX)。

## Conventions

- See `AGENTS.md` for repo-level agent instructions.
- Tests live next to the code (`__tests__/`). Run with `npm test`.
