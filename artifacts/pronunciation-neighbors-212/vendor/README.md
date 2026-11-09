# Upstream acoustic tables

Unmodified files copied from Jiro Shimaya's [kanasim](https://github.com/jiroshimaya/kanasim) at commit `f067a4e8be10d818b37b8b9f08de933dae01524b`:

- `src/kanasim/data/biphone/kana2phonome_bi.csv`
- `src/kanasim/data/biphone/distance_consonants_bi.csv`
- `src/kanasim/data/biphone/distance_vowels_bi.csv`
- `LICENSE` (Apache-2.0, preserved in full here)

These are kana-to-biphone mappings and directional acoustic-model distance tables. The upstream project derives them from Julius GMM-HMM models. This experiment copies no model weights or upstream Python implementation. The code applies its own documented symmetrization, scaling and edit policy; it is not a reproduction of the library's default word calculator. Original table bytes, including CRLF line endings, are preserved; SHA-256 identities are recorded in `../results.json` and checked during regeneration. Tables stay outside the runtime import graph and production bundle.

Upstream citation: Jiro Shimaya, *Kanasim: Japanese Kana Distance Data and Sample Code for Similarity Calculation*, 2024, https://github.com/jiroshimaya/kanasim.
