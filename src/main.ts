import './style.css';
import type { ExtractResult } from '../server/extract';
import { SAMPLE_EVENT, SAMPLE_NOTES } from './sample';
import type { EventData, Person, PersonKind } from './schema';
import { RoomView } from './scene';
import { validateEvent } from './validate';

/**
 * Everything the model wrote goes into the page with textContent, never innerHTML.
 * The only link it can produce is a LinkedIn URL that validate.ts already approved.
 */

const STORE_KEY = 'roommap:v1';

function $<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in index.html`);
  return node as T;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---- state ------------------------------------------------------------------

let event: EventData = SAMPLE_EVENT;
let notes = SAMPLE_NOTES;
let source: 'sample' | 'yours' = 'sample';
let selectedId: string | null = null;
const shown: Record<PersonKind, boolean> = { met: true, heard: true };

function loadSaved(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { notes?: string; event?: unknown };
    if (typeof saved.notes !== 'string') return;
    const result = validateEvent(saved.event, saved.notes);
    if (result.event) {
      event = result.event;
      notes = saved.notes;
      source = 'yours';
    }
  } catch {
    /* Storage can be empty or blocked. The sample is a fine fallback. */
  }
}

function save(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ notes, event }));
  } catch {
    /* Not saving is fine. */
  }
}

// ---- 3D view ----------------------------------------------------------------

const tip = $('tip');
const stage = $('stage');

let view: RoomView | null = null;
try {
  view = new RoomView(stage, {
    onSelect: (id) => select(id),
    onHover: (id, x, y) => {
      const person = id ? event.people.find((p) => p.id === id) : undefined;
      if (!person) {
        tip.hidden = true;
        return;
      }
      const box = stage.getBoundingClientRect();
      tip.textContent = `${person.name} · ${person.kind === 'met' ? 'met' : 'heard'}`;
      tip.style.left = `${x - box.left}px`;
      tip.style.top = `${y - box.top}px`;
      tip.hidden = false;
    },
  });
} catch (error) {
  console.error(error);
  $('webgl-error').hidden = false;
}

// ---- panel ------------------------------------------------------------------

const panelBody = $('panel-body');

function select(id: string | null): void {
  selectedId = id && event.people.some((p) => p.id === id) ? id : null;
  view?.select(selectedId);
  renderPanel();
}

function renderPanel(): void {
  panelBody.replaceChildren();
  const person = selectedId ? event.people.find((p) => p.id === selectedId) : undefined;
  panelBody.append(person ? renderCard(person) : renderRoster());
}

function renderRoster(): HTMLElement {
  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '16px';
  wrap.append(
    Object.assign(el('p', 'legend'), {
      textContent: 'Orange people are ones you talked to. Blue, see-through people with sound rings are ones you only listened to. The dotted line is your route.',
    }),
  );
  for (const kind of ['met', 'heard'] as const) {
    if (!shown[kind]) continue;
    const people = event.people.filter((p) => p.kind === kind).sort((a, b) => a.order - b.order);
    const group = el('section', 'group');
    group.append(el('h3', undefined, `${kind === 'met' ? 'People you met' : 'People you heard'} (${people.length})`));
    const list = el('ul', 'roster');
    for (const p of people) {
      const li = el('li');
      const row = el('button', 'row');
      row.type = 'button';
      row.append(el('i', `dot ${kind}`));
      const text = el('span');
      text.append(el('span', 'name', p.name), el('span', 'sub', [p.role, p.company].filter(Boolean).join(' · ') || p.spot || ''));
      row.append(text);
      row.addEventListener('click', () => select(p.id));
      li.append(row);
      list.append(li);
    }
    group.append(list);
    wrap.append(group);
  }
  return wrap;
}

function copyButton(getText: () => string): HTMLButtonElement {
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

function field(label: string, ...content: Node[]): HTMLElement {
  const wrap = el('div', 'field');
  wrap.append(el('span', 'label', label), ...content);
  return wrap;
}

function renderCard(p: Person): HTMLElement {
  const card = el('article', 'card');
  card.style.display = 'grid';
  card.style.gap = '14px';

  const back = el('button', 'ghost back', 'All people');
  back.type = 'button';
  back.addEventListener('click', () => select(null));

  const head = el('div');
  const badge = el('span', `badge ${p.kind}`);
  badge.append(el('i', `dot ${p.kind}`), document.createTextNode(p.kind === 'met' ? 'Met' : 'Heard'));
  head.append(badge, el('h2', undefined, p.name));
  const who = [p.role, p.company].filter(Boolean).join(' · ');
  if (who) head.append(el('p', 'meta', who));
  const where = [`#${p.order} of the night`, p.spot].filter(Boolean).join(' · ');
  head.append(el('p', 'meta', where));

  card.append(back, head);

  if (p.topics.length) {
    const topics = el('ul', 'topics');
    for (const t of p.topics) topics.append(el('li', undefined, t));
    card.append(topics);
  }

  card.append(field(p.kind === 'met' ? 'What you talked about' : 'What you heard', el('p', undefined, p.summary)));

  if (p.quote) card.append(field('From your notes', el('blockquote', undefined, `“${p.quote}”`)));

  const reach = el('div', 'copyline');
  reach.append(el('p', undefined, p.reachOut), copyButton(() => p.reachOut));
  card.append(field('Reach out', reach));

  const link = el('div', 'copyline');
  if (p.linkedin) {
    const a = el('a', undefined, p.linkedin.replace(/^https:\/\/(www\.)?/, ''));
    a.href = p.linkedin;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    link.append(a, copyButton(() => p.linkedin ?? ''));
  } else {
    link.append(el('p', 'none', 'No LinkedIn in your notes. Ask them next time.'));
  }
  card.append(field('LinkedIn', link));

  return card;
}

// ---- header -----------------------------------------------------------------

function renderHeader(): void {
  $('venue-name').textContent = event.venue.name;
  $('source').textContent = source === 'sample' ? 'Sample data' : 'Your notes';
  $('n-met').textContent = String(event.people.filter((p) => p.kind === 'met').length);
  $('n-heard').textContent = String(event.people.filter((p) => p.kind === 'heard').length);
}

for (const kind of ['met', 'heard'] as const) {
  const chip = $<HTMLButtonElement>(`chip-${kind}`);
  chip.addEventListener('click', () => {
    shown[kind] = !shown[kind];
    chip.setAttribute('aria-pressed', String(shown[kind]));
    view?.setKindVisible(kind, shown[kind]);
    if (selectedId && !shown[event.people.find((p) => p.id === selectedId)?.kind ?? 'met']) select(null);
    else renderPanel();
  });
}

$('reset-view').addEventListener('click', () => view?.resetView());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && selectedId && !(document.getElementById('notes-dialog') as HTMLDialogElement).open) select(null);
});

function applyEvent(next: EventData, nextNotes: string, nextSource: 'sample' | 'yours'): void {
  event = next;
  notes = nextNotes;
  source = nextSource;
  selectedId = null;
  view?.setEvent(event);
  for (const kind of ['met', 'heard'] as const) view?.setKindVisible(kind, shown[kind]);
  renderHeader();
  renderPanel();
}

// ---- mode chip --------------------------------------------------------------

async function loadMode(): Promise<void> {
  const mode = $('mode');
  try {
    const res = await fetch('/api/status');
    const body = (await res.json()) as { mode: 'mock' | 'argon' };
    mode.textContent = body.mode === 'argon' ? 'Argon connected' : 'Mock mode (no API key)';
  } catch {
    mode.textContent = 'Server offline';
  }
}

// ---- notes dialog -----------------------------------------------------------

const dialog = $<HTMLDialogElement>('notes-dialog');
const notesBox = $<HTMLTextAreaElement>('notes');
const imageInput = $<HTMLInputElement>('image');
const buildButton = $<HTMLButtonElement>('build');
const report = $('report');

$('open-notes').addEventListener('click', () => {
  notesBox.value = notes;
  report.replaceChildren();
  dialog.showModal();
});
$('close-dialog').addEventListener('click', () => dialog.close());
$('use-sample').addEventListener('click', () => {
  notesBox.value = SAMPLE_NOTES;
  imageInput.value = '';
  report.replaceChildren();
});

function readImage(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ mimeType: file.type, data: url.slice(url.indexOf(',') + 1) });
    };
    reader.readAsDataURL(file);
  });
}

function renderReport(result: ExtractResult | { error: string }): void {
  report.replaceChildren();
  if ('rounds' in result) {
    for (const round of result.rounds) {
      const box = el('div', 'round');
      const clean = round.problems.length === 0;
      const title = el('div');
      title.append(
        el('b', clean ? 'ok' : 'bad', `Round ${round.n}: `),
        document.createTextNode(clean ? 'checker found nothing wrong' : `checker found ${round.problems.length} problem${round.problems.length === 1 ? '' : 's'}`),
      );
      box.append(title);
      if (!clean) {
        const list = el('ul');
        for (const p of round.problems) list.append(el('li', undefined, p.message));
        box.append(list);
      }
      report.append(box);
    }
  }
  if ('error' in result && result.error) report.append(el('p', 'status bad', result.error));
  else if ('ok' in result && result.ok) report.append(el('p', 'status', 'Room built. Close this to look around.'));
}

$('notes-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = notesBox.value;
  buildButton.disabled = true;
  report.replaceChildren(el('p', 'status', 'Working. Argon proposes, the checker verifies, and this can take a little while.'));
  try {
    const file = imageInput.files?.[0];
    const image = file ? await readImage(file) : undefined;
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: text, image }),
    });
    const result = (await res.json()) as ExtractResult;
    renderReport(result);
    if (result.ok && result.event) {
      applyEvent(result.event, text, text.trim() === SAMPLE_NOTES.trim() ? 'sample' : 'yours');
      if (source === 'yours') save();
      else
        try {
          localStorage.removeItem(STORE_KEY);
        } catch {
          /* ignore */
        }
    }
  } catch (error) {
    renderReport({ error: error instanceof Error ? error.message : 'Something went wrong.' });
  } finally {
    buildButton.disabled = false;
  }
});

// ---- boot -------------------------------------------------------------------

loadSaved();
applyEvent(event, notes, source);
void loadMode();

if (import.meta.env.DEV) {
  (window as unknown as { __roommap: unknown }).__roommap = {
    screenOf: (id: string) => view?.screenOf(id) ?? null,
  };
}
