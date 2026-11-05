/** Shared primitives for original cartoon vocabulary illustrations (#27). */
export const colors = { ink: '#3f2468', pink: '#ff85b5', orange: '#ff9d47', yellow: '#ffe178', purple: '#af86ef', blue: '#91d7ed', green: '#a6dbad', skin: '#ffcf9c' }
export const wrapSvg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none"><g stroke="${colors.ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>\n`
export const person = (x, y, scale = 1, shirt = colors.pink, skin = colors.skin) => `<g transform="translate(${x} ${y}) scale(${scale})"><circle cy="-45" r="16" fill="${skin}"/><path d="M-14-24h28l7 42h-42Z" fill="${shirt}"/><path d="m-14-16-16 25m44-25 16 25M-9 18l-4 32m22-32 4 32"/><path d="M-5-47v1m10-1v1m-8 9q3 3 6 0" stroke-width="3"/></g>`
export function arrow(x1, y1, x2, y2, color = colors.orange) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const side = offset => `${x2 - 17 * Math.cos(angle + offset)},${y2 - 17 * Math.sin(angle + offset)}`
  return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="9"/><path d="M${side(.55)}L${x2},${y2}L${side(-.55)}" stroke="${color}" stroke-width="9"/>`
}
export const label = (text, x = 128, y = 145, size = 44) => `<text x="${x}" y="${y}" text-anchor="middle" fill="${colors.ink}" stroke="none" font-family="system-ui,sans-serif" font-size="${size}" font-weight="800">${String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</text>`
