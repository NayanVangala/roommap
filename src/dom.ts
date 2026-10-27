/** Small DOM helpers shared by main.ts and tabs.ts. Model text always goes in through textContent. */

export function $<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in index.html`);
  return node as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- icons -------------------------------------------------------------------
// One family: 24px grid, 1.75 stroke, round caps. Each entry is a list of path strings.

const ICONS = {
  back: ['M15 18l-6-6 6-6'],
  copy: ['M11 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4'],
  locate: ['M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3'],
  reset: ['M3.5 12a8.5 8.5 0 1 0 2.6-6.1', 'M3.5 4v5.5H9'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** A small button with an icon and a label. */
export function iconButton(name: IconName, label: string, className = 'btn sm'): HTMLButtonElement {
  const button = el('button', className);
  button.type = 'button';
  button.append(icon(name), el('span', undefined, label));
  return button;
}

export function copyButton(getText: () => string, label = 'Copy'): HTMLButtonElement {
  const button = iconButton('copy', label);
  let timer: number | undefined;
  button.addEventListener('click', async () => {
    const text = getText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = el('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      try {
        document.execCommand('copy');
      } catch {
        /* Nothing more to try. */
      }
      area.remove();
    }
    button.replaceChildren(icon('check'), el('span', undefined, 'Copied'));
    clearTimeout(timer);
    timer = window.setTimeout(() => button.replaceChildren(icon('copy'), el('span', undefined, label)), 1500);
  });
  return button;
}
