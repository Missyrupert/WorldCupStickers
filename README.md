# Panini World Cup Sticker Generator

Production-oriented **3-stage** pipeline (see `ultimate-rebuild.md`):

| Stage | What runs |
| --- | --- |
| **1** | `POST /v1/images/edits` with **`gpt-image-1`**, **`input_fidelity: high`**, and the **exact** edit prompt in `lib/transformImagePrompt.ts` (no AI text on the image). |
| **2** | `POST /api/generate-name` — **`gpt-4o-mini`** returns a culturally adapted name (plain string). |
| **3** | **`StickerCard`** — React overlays: **SVG** flag (`country-flag-icons` + small legacy SVGs), name, year, position, Panini-style frame. **`html-to-image`** composes the card for download. |

## Setup

```bash
npm install
copy .env.example .env.local
```

Set in `.env.local`:

```env
OPENAI_API_KEY=sk-...
```

## Run

```bash
npm run dev
```

## API

- **`POST /api/transform-image`** — `multipart/form-data`: `image`, `mode` (`random` \| `custom`), `year`, `userName`; in custom mode also `country`, `position`. Returns JSON with `imageBase64` (PNG) and metadata.
- **`POST /api/generate-name`** — JSON `{ "userName", "country" }` → `{ "name" }`.

## Layout

- **Left:** upload + camera.
- **Right:** year, mode, name, country/position (custom), generate.
- **Below:** `StickerCard` preview and download.

## Forbidden (by design)

- No text-to-image for the portrait pipeline.
- No sticker text drawn by the image model.
- Image model is fixed to **`gpt-image-1`** for edits (see `app/api/transform-image/route.ts`).

## Docs

- `ultimate-rebuild.md` — current architecture spec  
- `rebuild-app.md` / `build-app.md` — earlier briefs  
