# Prediction word packs

Offline frequency dictionaries used by ReachPanel predictive text.

## Format

```json
{
  "language": "en",
  "version": 1,
  "words": [["the", 23135851162], ["hello", 12345]]
}
```

Each pack is the top ~8,000 alphabetic tokens from [HermitDave FrequencyWords](https://github.com/hermitdave/FrequencyWords) (2018 subtitle corpus lists).

## Bundled vs downloadable

| File | Shipped with app | Install |
| --- | --- | --- |
| `src-tauri/resources/wordpacks/en.json` | Yes | Auto-installed on first launch |
| `wordpacks-dist/{el,de,fr,it,es,pt}.json` | No | Settings → Install (download or local dist in dev) |

## Publishing downloadable packs

Create a GitHub release with tag **`wordpacks-v1`** on `pountzas/reach-Panel` and attach:

- `el.json`, `de.json`, `fr.json`, `it.json`, `es.json`, `pt.json`

from `wordpacks-dist/`.

Download URL used by the app:

`https://github.com/pountzas/reach-Panel/releases/download/wordpacks-v1/{lang}.json`

## Regenerating

```bash
node scripts/generate-wordpacks.mjs
```
