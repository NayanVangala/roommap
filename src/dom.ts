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

/** Play a CSS animation again by removing and re-adding its class. */
export function retrigger(node: HTMLElement, cls = 'in'): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

/** Roll a number up from zero. */
export function countUp(node: HTMLElement, to: number, format: (n: number) => string = String, ms = 800): void {
  if (reducedMotion || to === 0) {
    node.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / ms);
    node.textContent = format(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function copyButton(getText: () => string): HTMLButtonElement {
  const button = el('button', 'ghost', 'Copy');
  button.type = 'button';
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
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = 'Copy'), 1400);
  });
  return button;
}
