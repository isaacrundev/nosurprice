form is meaningless (OCR target, dispute evidence, etc.).

## Decisions log

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
