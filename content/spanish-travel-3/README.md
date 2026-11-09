# Spanish travel level 3 · media review (#174)

36 additional concrete travel words, picture-only practice, English interface and the existing eight regional voices. The owner approved the complete word list and requested media generation. All 36 pictures (32 new transparent PNGs and four unchanged approved reuses) and all 288 recordings are generated and ready for media acceptance. Level 3 is not active.

[Combined pictures and voices](../../artifacts/spanish-travel-3-art/review.html) · [All pictures at card size](../../artifacts/spanish-travel-3-art/artwork.html) · [Word and picture concepts](review.html) · [Structured draft](draft.json)

## Walking around town

| Spanish | English | Artwork |
| --- | --- | --- |
| banqueta | Sidewalk | Generated · awaiting review |
| cruce peatonal | Pedestrian crossing | Generated · awaiting review |
| semáforo | Traffic light | Generated · awaiting review |
| fuente | Fountain | Generated · awaiting review |
| banca | Bench | Generated · awaiting review |
| iglesia | Church | Generated · awaiting review |

## Getting around

| Spanish | English | Artwork |
| --- | --- | --- |
| metro | Subway (metro) | Generated · awaiting review |
| motocicleta | Motorcycle | Generated · awaiting review |
| estacionamiento | Parking lot | Generated · awaiting review |
| gasolinera | Gas station | Generated · awaiting review |
| casco | Helmet | Generated · awaiting review |
| cinturón de seguridad | Seat belt | Generated · awaiting review |

## Fruit and quick food

| Spanish | English | Artwork |
| --- | --- | --- |
| manzana | Apple | Reused approved picture |
| plátano | Banana | Generated · awaiting review |
| naranja | Orange (fruit) | Generated · awaiting review |
| aguacate | Avocado | Generated · awaiting review |
| taco | Taco | Generated · awaiting review |
| helado | Ice cream | Generated · awaiting review |

## Clothing

| Spanish | English | Artwork |
| --- | --- | --- |
| camisa | Shirt | Generated · awaiting review |
| pantalones | Pants / trousers | Generated · awaiting review |
| zapato | Shoe | Generated · awaiting review |
| sombrero | Hat | Generated · awaiting review |
| chamarra | Jacket | Generated · awaiting review |
| traje de baño | Swimsuit | Generated · awaiting review |

## Outdoors

| Spanish | English | Artwork |
| --- | --- | --- |
| montaña | Mountain | Reused approved picture |
| río | River | Reused approved picture |
| lago | Lake | Generated · awaiting review |
| isla | Island | Generated · awaiting review |
| bosque | Forest | Reused approved picture |
| cascada | Waterfall | Generated · awaiting review |

## Hotel comforts and essentials

| Spanish | English | Artwork |
| --- | --- | --- |
| almohada | Pillow | Generated · awaiting review |
| cobija | Blanket | Generated · awaiting review |
| secadora de pelo | Hair dryer | Generated · awaiting review |
| papel higiénico | Toilet paper | Generated · awaiting review |
| peine | Comb | Generated · awaiting review |
| espejo | Mirror | Generated · awaiting review |

## Artwork reuse audit

Four approved pictures were visually inspected, hash-checked and reused unchanged: **apple, mountain, river and forest**. Their exact source paths, hashes and activation evidence are recorded on the items in `draft.json`. The apple, mountain and river are unchanged opaque JPGs; the forest is an unchanged transparent PNG. The other 32 subjects now have new transparent PNG illustrations, produced with the built-in image tool. Exact prompts, style-reference hashes, original bytes and generation records are preserved under `artifacts/spanish-travel-3-art/`.

The existing winter bench picture includes a snowy tree and ground scene. The banana appears in a basket with many apples. Existing blanket/pillow imagery includes a bed and Kiku. These are recorded as rejected direct reuses, with inspected paths/hashes. A matching incidental object does not make a scene suitable for an isolated noun card. The current contextual answer image is tea and supplies no matching subject.

## Wording choices

- **Banqueta**, **banca**, **chamarra** and **cobija** support the Mexican vocabulary focus. Acera, banco, chaqueta and manta/frazada are useful alternatives in other contexts or regions. The chosen words remain the same across all eight voices.
- **Metro** means subway here. Its picture must show the underground setting; the generic train and station cards need distractor exclusions.
- **Plátano** is a dessert banana, **naranja** is the fruit and **fuente** is a water fountain. **Secadora de pelo** is a hair dryer.
- **Pantalones** depicts one pair of trousers; **zapato** depicts one shoe. The approved mountain reuse has two peaks and represents the generic noun montaña.

## Picture-choice review before activation

Review the full notes in `draft.json`, especially metro/train/station, bench/park/bus stop, sidewalk/street/crossing, fruit/market, taco/menu, river/bridge, lake/pool, island/beach and bedding/bed/room. The approved menu already has a taco pictogram and the market includes apples/bananas; do not overlook these cross-pack overlaps. Exclusions remain a later activation decision after pictures are reviewed at 145px.

## Audio scope

The proposed text totals **292 Unicode characters per voice**, or **2336 across eight voices**: **288 recordings**. This is a scope count, not a cost estimate. All 288 clips were generated from the approved words in the eight selected voices, using the same constant-gain playback profile without trimming or timing changes. Two clips remain slightly quieter within processing limits and are flagged: Santiago · taco (-22.57 LUFS, peak headroom) and Carlos Figueroa · isla (-23.41 LUFS, maximum 9 dB gain). All earlier batches and approvals remain unchanged.

Original recordings, exact requests and normalization evidence are hash-verified in the private archive `~/.local/share/kikimashta/spanish-audio/174-v1/` (1737 files). Public review MP3s and provenance are in `artifacts/spanish-travel-3-audio-review/`.

Rebuild the combined review with `node scripts/content/build-spanish-travel-level-3-media-review.mjs`. Serve the repository with `python3 -m http.server 5183 --bind 127.0.0.1 --directory .` and open `/artifacts/spanish-travel-3-art/review.html`.

## Lexical references

- [banqueta · El Colegio de México · Diccionario del español de México](https://dem.colmex.mx/Ver/banqueta): Paved pedestrian sidewalk along a street; chosen over acera for the Mexican vocabulary focus.
- [banca · RAE / ASALE · Diccionario de la lengua española](https://dle.rae.es/banca): The multi-person bench sense is explicitly used in Mexico and other American varieties.
- [chamarra · ASALE · Diccionario de americanismos](https://www.asale.org/damer/chamarra): Jacket/cazadora sense is marked for Mexico and several other American varieties.
- [cobija · RAE / ASALE · Diccionario de la lengua española](https://dle.rae.es/cobija): Bed blanket sense explicitly includes Mexico and many other American varieties.
