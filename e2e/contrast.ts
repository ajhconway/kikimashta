import { expect } from '@playwright/test';
import { intensityColors } from '../src/themes';

export function expectReadableHomeText(textColors: string[]) {
  function luminance(rgb: number[]) {
    const linear = rgb.map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  }
  for (const [level, color] of Object.entries(intensityColors)) {
    const background = luminance(color.slice(1).match(/../g)!.map(channel => parseInt(channel, 16)));
    for (const textColor of textColors) {
      const foreground = luminance(textColor.match(/\d+/g)!.slice(0, 3).map(Number));
      const contrast = (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
      expect(contrast, `${level} background with ${textColor} text`).toBeGreaterThanOrEqual(4.5);
    }
  }
}
