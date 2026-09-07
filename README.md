# NoSurPrice

Receipt & price-tag photo tracker for catching surprise charges at the register.

Open the app while shopping, snap a photo of each item's price tag (plus the item itself if you want), and you'll have a record at checkout to compare what you're being charged against what the shelf said.

## Status

MVP — local-only, single device, no accounts, no cloud sync.

## Stack

- React Native + **Expo SDK 57** (managed workflow, Expo Router)
- **TypeScript**
- **expo-sqlite** for local data (sessions, items)
- **expo-image-picker** + **expo-file-system** for photos
- **Zustand** for state
- **react-hook-form** + **zod** for forms and validation

## Setup

Requires Node 20+ and the Expo Go app on a physical device (or iOS Simulator / Android Emulator).

```bash
npm install
npx expo start
```

Then scan the QR code with Expo Go, or press `i` / `a` for the simulator.

## Project layout

```
src/
  app/         # Expo Router file-based routes + screen tests
  components/  # Shared UI (PhotoGrid, …)
  db/          # SQLite layer (sessions, items schema)
  store/       # Zustand stores
  utils/       # price parsing, photo storage, dialog helpers
  types.ts     # Domain types — Session, Item
```

## How it works

1. Start a shopping **session** (or continue the current one).
2. For each item: name, expected price, **at least one price-tag photo** (required), optional extra photos / note.
3. At checkout, open an item — the photos are right there to dispute the charge.

Prices are integers in NTD (no decimals). `parsePrice()` accepts `199`, `$199`, `NT$199`, `1,999`.

## Out of scope (MVP)

- Cloud sync, accounts, multi-device
- AI / OCR auto-fill from photos (utils/ocr.ts is a stub)
- Multi-currency
- Export / share as PDF

## Conventions

- See `AGENTS.md` for repo-level agent instructions.
- Tests live next to the code (`__tests__/`). Run with `npm test`.

## License

MIT — see [LICENSE](./LICENSE).
