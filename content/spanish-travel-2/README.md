# Spanish travel level 2 · media review (#166)

36 additional words; picture vocabulary, English interface, and the existing eight regional voices. The owner approved the word list and generation. All 36 pictures (34 new transparent PNGs and 2 unchanged approved JPGs) and all 288 recordings are ready for media acceptance. The owner approved the complete selected media set and requested auto-merge. The pack is registered for activation after required checks and review.

[Combined picture and voice review](../../artifacts/spanish-travel-2-art/review.html) · [All artwork at card size](../../artifacts/spanish-travel-2-art/artwork.html) · [Audio provenance](../../artifacts/spanish-travel-2-audio-review/manifest.json)

## Around town

| Spanish | English |
| --- | --- |
| estación de tren | Train station |
| parada de autobús | Bus stop |
| calle | Street |
| puente | Bridge |
| parque | Park |
| museo | Museum |

## At the table

| Spanish | English |
| --- | --- |
| menú | Menu |
| plato | Plate |
| vaso | Drinking glass |
| taza | Cup |
| tenedor | Fork |
| cuchara | Spoon |

## Food

| Spanish | English |
| --- | --- |
| pollo | Chicken (food) |
| pescado | Fish (food) |
| huevo | Egg |
| queso | Cheese |
| sopa | Soup |
| ensalada | Salad |

## Shopping and money

| Spanish | English |
| --- | --- |
| mercado | Market |
| panadería | Bakery |
| cajero automático | ATM |
| recibo | Receipt |
| cartera | Wallet |
| moneda | Coin |

## At the hotel

| Spanish | English |
| --- | --- |
| habitación | Room |
| mesa | Table |
| silla | Chair |
| ventana | Window |
| escaleras | Stairs |
| piscina | Swimming pool |

## Personal essentials

| Spanish | English |
| --- | --- |
| jabón | Soap |
| champú | Shampoo |
| cepillo de dientes | Toothbrush |
| pasta de dientes | Toothpaste |
| cargador | Charger |
| lentes de sol | Sunglasses |

## Artwork feedback

The earlier Japanese table and chair scenes include Kiku and teach spatial relations (on/under). They are not standalone furniture pictures. Keep the new isolated table and chair for mesa and silla. The owner rejected the original staircase taper; the gallery now selects stairs v5 with consistent-width treads. Earlier variants, their exact prompts and the geometry reference remain preserved under the artwork revisions. All other pictures and all 288 recordings are unchanged.

Owner acceptance is bound to the exact selected manifests in `acceptance.json`; `activation.json` records the production copies. `content/es-419-travel-2.json` is the separate level 2 bank, registered as `es-419-travel-2-pictures`. Both levels share the existing Spanish voice and progress identities.

## Preparation notes

- Reused unchanged: approved empty plate for plato and the existing handleless glass for vaso. The asset historically named ja-cup is a glass; taza needs a handled cup image.
- The remaining 34 subjects were generated with the built-in image tool, using the same style reference. Original PNG bytes, exact prompts, per-image request hashes and decoded transparency measurements are preserved. Review each candidate at 145px without answer text.
- Guard cup/coffee, glass/drink, coin/money, shampoo/bottle and room/bed overlap when both levels are selected. Menu, receipt and museum imagery also require careful review for recognition without labels.
- Use pescado for fish as food. Cartera means wallet in this draft. Piscina is the selected pool term; wording remains editable.
- Keep stable item IDs independent of pack level. The current level 1 bank and retired entrance/exit history remain intact.
- All 288 recordings were generated in the eight existing regional voices from the exact 2240 Unicode input characters. They use the same constant-gain playback profile with no trimming or timing changes. None required quieter-level exceptions. Level 2 uses its own approved plan, batch, scope guard and private archive; level 1 approvals and recordings are untouched.
- Provider originals, requests and normalization evidence are hash-verified in the private archive at `~/.local/share/kikimashta/spanish-audio/166-v1/` (1737 files). Public review files contain normalized recordings and provenance, with no credentials or private account usage.
- Rebuild and verify the combined gallery with `node scripts/content/build-spanish-travel-level-2-media-review.mjs`; serve the repository root with `python3 -m http.server 5180 --bind 127.0.0.1 --directory .`, then open `/artifacts/spanish-travel-2-art/review.html`.

## Lexical references

- [lentes de sol](https://dem.colmex.mx/Ver/lente): Mexican usage includes lenses/eyeglasses and lentes de sol.
- [champú](https://dictionary.cambridge.org/dictionary/spanish-english/champu): Spanish spelling and shampoo meaning.
- [cartera](https://dictionary.cambridge.org/dictionary/spanish-english/cartera): Wallet sense; the word also has purse/bag and other senses, so the intended picture is a bifold wallet.
- [piscina](https://dictionary.cambridge.org/dictionary/spanish-english/piscina): Swimming-pool meaning.
