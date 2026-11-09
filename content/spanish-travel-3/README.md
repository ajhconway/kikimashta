# Spanish travel level 3 · media review (#174)

36 additional concrete travel words, picture-only practice, English interface and the existing eight regional voices. The owner approved the complete word list and requested media generation. All 36 pictures (31 new transparent PNGs and five unchanged approved reuses) and all 288 recordings are generated. The owner accepted the corrected complete media set and requested shipment. The separate level 3 picture pack is approved for activation.

[Combined pictures and voices](../../artifacts/spanish-travel-3-art/review.html) · [All pictures at card size](../../artifacts/spanish-travel-3-art/artwork.html) · [Word and picture concepts](review.html) · [Structured draft](draft.json)

## Walking around town

| Spanish | English | Artwork |
| --- | --- | --- |
| banqueta | Sidewalk | Accepted new artwork |
| cruce peatonal | Pedestrian crossing | Accepted new artwork |
| semáforo | Traffic light | Accepted new artwork |
| fuente | Fountain | Accepted new artwork |
| banca | Bench | Accepted new artwork |
| iglesia | Church | Accepted new artwork |

## Getting around

| Spanish | English | Artwork |
| --- | --- | --- |
| metro | Subway (metro) | Accepted new artwork |
| motocicleta | Motorcycle | Accepted new artwork |
| estacionamiento | Parking lot | Accepted new artwork |
| gasolinera | Gas station | Accepted new artwork |
| casco | Helmet | Accepted new artwork |
| cinturón de seguridad | Seat belt | Accepted new artwork |

## Fruit and quick food

| Spanish | English | Artwork |
| --- | --- | --- |
| manzana | Apple | Reused approved picture |
| plátano | Banana | Reused approved picture |
| naranja | Orange (fruit) | Accepted new artwork |
| aguacate | Avocado | Accepted new artwork |
| taco | Taco | Accepted new artwork |
| helado | Ice cream | Accepted new artwork |

## Clothing

| Spanish | English | Artwork |
| --- | --- | --- |
| camisa | Shirt | Accepted new artwork |
| pantalones | Pants / trousers | Accepted new artwork |
| zapato | Shoe | Accepted new artwork |
| sombrero | Hat | Accepted new artwork |
| chamarra | Jacket | Accepted new artwork |
| traje de baño | Swimsuit | Accepted new artwork |

## Outdoors

| Spanish | English | Artwork |
| --- | --- | --- |
| montaña | Mountain | Reused approved picture |
| río | River | Reused approved picture |
| lago | Lake | Accepted new artwork |
| isla | Island | Accepted new artwork |
| bosque | Forest | Reused approved picture |
| cascada | Waterfall | Accepted new artwork |

## Hotel comforts and essentials

| Spanish | English | Artwork |
| --- | --- | --- |
| almohada | Pillow | Accepted new artwork |
| cobija | Blanket | Accepted new artwork |
| secadora de pelo | Hair dryer | Accepted new artwork |
| papel higiénico | Toilet paper | Accepted new artwork |
| peine | Comb | Accepted new artwork |
| espejo | Mirror | Accepted new artwork |

## Artwork reuse audit

Five approved pictures were visually inspected, hash-checked and reused unchanged: **apple, banana, mountain, river and forest**. Their exact source paths, hashes and activation evidence are recorded on the items in `draft.json`. The apple, banana, mountain and river are unchanged opaque JPGs; the forest is an unchanged transparent PNG. The other 31 subjects now have new transparent PNG illustrations, produced with the built-in image tool. Exact prompts, style-reference hashes, original bytes and generation records are preserved under `artifacts/spanish-travel-3-art/`.

The existing winter bench picture includes a snowy tree and ground scene. The initial audit inspected a banana in a basket with apples but overlooked the approved standalone banana. The owner identified this omission; the standalone banana is now reused unchanged. Existing blanket/pillow imagery includes a bed and Kiku. These are recorded as rejected direct reuses, with inspected paths/hashes. A matching incidental object does not make a scene suitable for an isolated noun card. The current contextual answer image is tea and supplies no matching subject.

The owner requested clearer toilet-paper, blanket and crossing geometry. The selected revisions show a straight paper tail, a broad bed blanket and a crossing between opposite sidewalks. All first versions, four additional generated variants and exact edit prompts are preserved in the [revision history](../../artifacts/spanish-travel-3-art/revisions/history.json). The owner accepted these revisions with the complete pack; [acceptance](acceptance.json) binds the selected manifests.

## Wording choices

- **Banqueta**, **banca**, **chamarra** and **cobija** support the Mexican vocabulary focus. Acera, banco, chaqueta and manta/frazada are useful alternatives in other contexts or regions. The chosen words remain the same across all eight voices.
- **Metro** means subway here. Its picture must show the underground setting; the generic train and station cards need distractor exclusions.
- **Plátano** is a dessert banana, **naranja** is the fruit and **fuente** is a water fountain. **Secadora de pelo** is a hair dryer.
- **Pantalones** depicts one pair of trousers; **zapato** depicts one shoe. The approved mountain reuse has two peaks and represents the generic noun montaña.

## Picture-choice review before activation

Review the full notes in `draft.json`, especially metro/train/station, bench/park/bus stop, sidewalk/street/crossing, fruit/market, taco/menu, river/bridge, lake/pool, island/beach and bedding/bed/room. The approved menu already has a taco pictogram and the market includes apples/bananas; do not overlook these cross-pack overlaps. The [picture-choice review](picture-choice-review.json) records the 145px audit and stable-ID exclusions for activation.

## Audio scope

The proposed text totals **292 Unicode characters per voice**, or **2336 across eight voices**: **288 recordings**. This is a scope count, not a cost estimate. All 288 clips were generated from the approved words in the eight selected voices, using the same constant-gain playback profile without trimming or timing changes. Two clips remain slightly quieter within processing limits and are flagged: Santiago · taco (-22.57 LUFS, peak headroom) and Carlos Figueroa · isla (-23.41 LUFS, maximum 9 dB gain). All earlier batches and approvals remain unchanged.

Original recordings, exact requests and normalization evidence are hash-verified in the private archive `~/.local/share/kikimashta/spanish-audio/174-v1/` (1737 files). Public review MP3s and provenance are in `artifacts/spanish-travel-3-audio-review/`.

Rebuild the combined review with `node scripts/content/build-spanish-travel-level-3-media-review.mjs`. Serve the repository with `python3 -m http.server 5183 --bind 127.0.0.1 --directory .` and open `/artifacts/spanish-travel-3-art/review.html`.

## Lexical references

- [banqueta · El Colegio de México · Diccionario del español de México](https://dem.colmex.mx/Ver/banqueta): Paved pedestrian sidewalk along a street; chosen over acera for the Mexican vocabulary focus.
- [banca · RAE / ASALE · Diccionario de la lengua española](https://dle.rae.es/banca): The multi-person bench sense is explicitly used in Mexico and other American varieties.
- [chamarra · ASALE · Diccionario de americanismos](https://www.asale.org/damer/chamarra): Jacket/cazadora sense is marked for Mexico and several other American varieties.
- [cobija · RAE / ASALE · Diccionario de la lengua española](https://dle.rae.es/cobija): Bed blanket sense explicitly includes Mexico and many other American varieties.


## Activation

`acceptance.json` records the owner's shipment approval and exact reviewed manifest hashes. `activation.json` records every production image/recording. Stage with `node scripts/content/stage-spanish-travel-level-3.mjs`; the separate approved bank is `content/es-419-travel-3.json`. The runtime combines all three approved banks with symmetric picture exclusions, while saved pack choices and existing progress keep their original identities.
