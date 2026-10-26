import './style.css';
import type { ExtractResult } from '../server/extract';
import { $, copyButton, countUp, el, pad, reducedMotion, retrigger } from './dom';
import { SAMPLE_EVENT, SAMPLE_NOTES } from './sample';
import type { EventData, Person, PersonKind } from './schema';
import { RoomView } from './scene';
import { renderFollowups, renderPeople, renderTimeline, renderTopics, type TabHooks } from './tabs';
import { validateEvent } from './validate';

/**
 * Everything the model wrote goes into the page with textContent, never innerHTML.
 * The only link it can produce is a LinkedIn URL that validate.ts already approved.
 */

const STORE_KEY = 'roommap:v1';

// ---- state ------------------------------------------------------------------

type ViewName = 'room' | 'people' | 'timeline' | 'topics' | 'followups';
const VIEWS: ViewName[] = ['room', 'people', 'timeline', 'topics', 'followups'];

let event: EventData = SAMPLE_EVENT;
let notes = SAMPLE_NOTES;
let source: 'sample' | 'yours' = 'sample';
let selectedId: string | null = null;
let current: ViewName = 'room';
/** False until the intro curtain lifts. After that, every new room plays its entrance. */
let booted = false;
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

// ---- filter chips -----------------------------------------------------------

/** A fresh Met / Heard bar. Every tab gets its own, and all read the same `shown` state. */
function chips(): HTMLElement {
  const wrap = el('div', 'chips');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Show people');
  for (const kind of ['met', 'heard'] as const) {
    const chip = el('button', 'chip');
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(shown[kind]));
    chip.append(
      el('i', `dot ${kind}`),
      document.createTextNode(kind === 'met' ? 'Met' : 'Heard'),
      el('b', undefined, String(event.people.filter((p) => p.kind === kind).length)),
    );
    chip.addEventListener('click', () => toggleKind(kind));
    wrap.append(chip);
  }
  return wrap;
}

function toggleKind(kind: PersonKind): void {
  shown[kind] = !shown[kind];
  view?.setKindVisible(kind, shown[kind]);
  const selectedKind = event.people.find((p) => p.id === selectedId)?.kind;
  if (selectedKind && !shown[selectedKind]) select(null);
  renderAll();
}

// ---- side panel (room tab) --------------------------------------------------

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
  const wrap = el('div', 'roster-wrap');
  wrap.append(el('p', 'legend rise', 'Orange people are ones you talked to. Blue, see-through ones with sound rings are people you only listened to. The glowing line is your route.'));
  let i = 1;
  for (const kind of ['met', 'heard'] as const) {
    if (!shown[kind]) continue;
    const people = event.people.filter((p) => p.kind === kind).sort((a, b) => a.order - b.order);
    const group = el('section', 'group rise');
    group.style.setProperty('--i', String(i++));
    group.append(el('h3', 'label', `${kind === 'met' ? 'People you met' : 'People you heard'} · ${pad(people.length)}`));
    const list = el('ul', 'roster');
    for (const p of people) {
      const li = el('li');
      const row = el('button', 'row');
      row.type = 'button';
      const text = el('span');
      text.append(el('span', 'name', p.name), el('span', 'sub', [p.role, p.company].filter(Boolean).join(' · ') || p.spot || ''));
      row.append(el('span', `num ${kind}`, pad(p.order)), text);
      row.addEventListener('click', () => select(p.id));
      li.append(row);
      list.append(li);
    }
    group.append(list);
    wrap.append(group);
  }
  return wrap;
}

function field(label: string, ...content: Node[]): HTMLElement {
  const wrap = el('div', 'field rise');
  wrap.append(el('span', 'label', label), ...content);
  return wrap;
}

function renderCard(p: Person): HTMLElement {
  const card = el('article', 'card');

  const back = el('button', 'ghost back rise', 'All people');
  back.type = 'button';
  back.addEventListener('click', () => select(null));

  const head = el('div', 'card-head rise');
  const badge = el('span', `badge ${p.kind}`);
  badge.append(el('i', `dot ${p.kind}`), document.createTextNode(p.kind === 'met' ? 'Met' : 'Heard'));
  head.append(badge, el('h2', 'display', p.name));
  const who = [p.role, p.company].filter(Boolean).join(' · ');
  if (who) head.append(el('p', 'meta', who));
  const where = [`#${p.order} of the night`, p.spot].filter(Boolean).join(' · ');
  head.append(el('p', 'meta mono', where));

  card.append(back, head);

  if (p.topics.length) {
    const topics = el('ul', 'topics rise');
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

  // Stagger the sections in, whatever order they ended up in.
  card.querySelectorAll<HTMLElement>('.rise').forEach((node, i) => node.style.setProperty('--i', String(i)));
  return card;
}

// ---- tabs -------------------------------------------------------------------

const tabHooks: TabHooks = {
  chips,
  pick(id) {
    go('room');
    select(id);
  },
};

const RENDERERS: Record<Exclude<ViewName, 'room'>, (e: EventData, s: Record<PersonKind, boolean>, h: TabHooks) => HTMLElement> = {
  people: renderPeople,
  timeline: renderTimeline,
  topics: renderTopics,
  followups: renderFollowups,
};

function renderView(name: ViewName): void {
  if (name === 'room') {
    $('room-chips').replaceChildren(chips());
    return;
  }
  $(`view-${name}`).replaceChildren(RENDERERS[name](event, shown, tabHooks));
}

function renderAll(): void {
  renderPanel();
  renderView('room');
  if (current !== 'room') renderView(current);
}

/** The orange pill slides under whichever tab is active (CSS crops it to that tab, see .tab-pill). */
function movePill(): void {
  const tab = $<HTMLButtonElement>(`tab-${current}`);
  const tabs = $('tabs');
  const pill = $('tab-pill');
  // Measure the bar without the pill stretching it, then make the pill as wide as the scrollable bar.
  pill.style.width = '0';
  const full = tabs.scrollWidth;
  pill.style.width = `${full}px`;
  pill.style.setProperty('--pill-l', `${tab.offsetLeft}px`);
  pill.style.setProperty('--pill-r', `${full - tab.offsetLeft - tab.offsetWidth}px`);
}

function go(next: ViewName): void {
  current = next;
  renderView(next);
  for (const name of VIEWS) {
    const on = name === next;
    const section = $(`view-${name}`);
    section.classList.toggle('is-active', on);
    section.inert = !on;
    if (on) section.scrollTop = 0;
    const tab = $<HTMLButtonElement>(`tab-${name}`);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  movePill();
  $(`tab-${next}`).scrollIntoView({ inline: 'center', block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
}

$('tabs').addEventListener('click', (e) => {
  const tab = (e.target as HTMLElement).closest<HTMLElement>('.tab');
  if (tab) go(tab.dataset.view as ViewName);
});

$('tabs').addEventListener('keydown', (e) => {
  const key = (e as KeyboardEvent).key;
  const i = VIEWS.indexOf(current);
  const next = key === 'ArrowRight' ? i + 1 : key === 'ArrowLeft' ? i - 1 : key === 'Home' ? 0 : key === 'End' ? VIEWS.length - 1 : -1;
  if (next < 0) return;
  e.preventDefault();
  const name = VIEWS[(next + VIEWS.length) % VIEWS.length] as ViewName;
  go(name);
  $(`tab-${name}`).focus();
});

window.addEventListener('resize', movePill);

// ---- header / hero ----------------------------------------------------------

function renderHeader(): void {
  $('venue-name').textContent = event.venue.name;
  $('source').textContent = source === 'sample' ? 'Sample data' : 'Your notes';
  countUp($('n-met'), event.people.filter((p) => p.kind === 'met').length, pad);
  countUp($('n-heard'), event.people.filter((p) => p.kind === 'heard').length, pad);
  retrigger($('venue-name').parentElement as HTMLElement);
}

$('reset-view').addEventListener('click', () => view?.resetView());

// What a plain drag does in the room: spin around it, or travel across the floor.
const HINTS = {
  orbit: 'Drag to orbit · Shift-drag or WASD to move · Scroll to zoom',
  pan: 'Drag to move around · Shift-drag to orbit · WASD works too',
};

function setDragMode(mode: 'orbit' | 'pan'): void {
  view?.setDragMode(mode);
  $('drag-orbit').setAttribute('aria-pressed', String(mode === 'orbit'));
  $('drag-pan').setAttribute('aria-pressed', String(mode === 'pan'));
  $('hint').textContent = HINTS[mode];
}

$('drag-orbit').addEventListener('click', () => setDragMode('orbit'));
$('drag-pan').addEventListener('click', () => setDragMode('pan'));
setDragMode('orbit');

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
  if (booted) view?.playIntro();
  renderHeader();
  renderAll();
}

// ---- mode chip --------------------------------------------------------------

async function loadMode(): Promise<void> {
  const mode = $('mode');
  try {
    const res = await fetch('/api/status');
    const body = (await res.json()) as { mode: 'mock' | 'argon' };
    mode.dataset.state = body.mode;
    mode.textContent = body.mode === 'argon' ? 'Argon connected' : 'Mock mode (no API key)';
  } catch {
    mode.dataset.state = 'offline';
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
go('room');

/** Lift the curtain once fonts are in: the room rises and the camera swoops down. */
async function reveal(): Promise<void> {
  await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))]);
  if (!reducedMotion) await new Promise((resolve) => setTimeout(resolve, 900));
  booted = true;
  document.body.classList.add('ready');
  $('intro').classList.add('done');
  view?.playIntro();
  movePill();
  setTimeout(() => document.getElementById('intro')?.remove(), 1800);
}
void reveal();

if (import.meta.env.DEV) {
  (window as unknown as { __roommap: unknown }).__roommap = {
    screenOf: (id: string) => view?.screenOf(id) ?? null,
  };
}
