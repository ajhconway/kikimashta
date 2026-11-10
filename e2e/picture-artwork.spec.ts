import { expect, test } from './fixtures';
import manifest from '../artifacts/picture-art-229/manifest.json' with { type: 'json' };
import sceneManifest from '../artifacts/scene-art-233/release-manifest.json' with { type: 'json' };
import activation from '../content/card-regeneration/activation.json' with { type: 'json' };

for (const set of [
  { name: 'picture', manifest, examples: ['月見', '町', '皮', '金玉', '目', '白'] },
  { name: 'scene and contrast', manifest: sceneManifest, examples: ['立てる', '広げる', '近い', '作る', '走行', '日の出', '夕方', '夜'] },
]) test(`shipped ${set.name} artwork decodes and retains approved descriptions in the real card library`, async ({ page }) => {
  await page.goto('./vocabulary/');
  const selected = set.manifest.assets.map(asset => {
    const delivery = activation.assets.find(record => record.id === asset.id)!;
    return { text: asset.text, src: delivery.path.replace(/^public\//, ''), image: asset.image, description: asset.imageDescription };
  });
  const decoded = await page.evaluate(async assets => Promise.all(assets.map(async asset => {
    const image = new Image();
    image.src = new URL(`../${asset.src}`, location.href).href;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  })), selected);
  for (const [index, size] of decoded.entries()) {
    expect(Math.max(size.width, size.height)).toBe(640);
    expect(size.width / size.height).toBeCloseTo(selected[index]!.image.width / selected[index]!.image.height, 2);
  }
  for (const text of set.examples) {
    const asset = selected.find(asset => asset.text === text)!;
    await page.getByLabel('Search words').fill(text);
    const card = page.getByRole('article', { name: `${text} Pictures`, exact: true });
    await expect(card).toBeVisible();
    const image = card.locator('.card-image');
    await expect(image).toHaveAttribute('src', `../${asset.src}`);
    await expect(image).toHaveAttribute('alt', asset.description);
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await image.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
