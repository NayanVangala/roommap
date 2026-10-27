import './style.css';
import type { ExtractResult } from '../server/extract';
import { $, copyButton, el, icon, iconButton, pad, reducedMotion } from './dom';
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
/** False until the intro screen lifts. After that, every new room plays its entrance. */
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
      tip.textContent = `${person.name} · ${person.kind === 'met' ? 'Met' : 'Heard'}`;
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

function showEveryone(): void {
  for (const kind of ['met', 'heard'] as const) {
    shown[kind] = true;
    view?.setKindVisible(kind, true);
  }
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

function legendItem(swatch: HTMLElement, text: string): HTMLElement {
  const item = el('span');
  item.append(swatch, document.createTextNode(text));
  return item;
}

function renderRoster(): HTMLElement {
  const wrap = el('div', 'roster-wrap');

  const title = el('div', 'panel-title');
  title.append(el('h2', undefined, 'People'), el('span', 'count', String(event.people.length)));
  const legend = el('div', 'legend');
  legend.append(legendItem(el('i', 'dot met'), 'Met'), legendItem(el('i', 'dot heard'), 'Heard'), legendItem(el('i', 'route-swatch'), 'Route'));
  wrap.append(title, legend);

  let any = false;
  for (const kind of ['met', 'heard'] as const) {
    if (!shown[kind]) continue;
    const people = event.people.filter((p) => p.kind === kind).sort((a, b) => a.order - b.order);
    if (!people.length) continue;
    any = true;
    const group = el('section', 'group');
    const label = el('h3', 'group-label', kind === 'met' ? 'Met' : 'Heard');
    label.append(el('span', 'count', String(people.length)));
    group.append(label);
    const list = el('ul', 'roster');
    for (const p of people) {
      const li = el('li');
      const row = el('button', 'row');
      row.type = 'button';
      const text = el('span', 'row-text');
      text.append(el('span', 'name', p.name), el('span', 'sub', [p.role, p.company].filter(Boolean).join(' · ') || p.spot || ''));
      row.append(el('span', `order ${kind}`, pad(p.order)), text);
      row.addEventListener('click', () => select(p.id));
      li.append(row);
      list.append(li);
    }
    group.append(list);
    wrap.append(group);
  }
  if (!any) {
    const none = el('div', 'empty');
    const button = el('button', 'btn sm', 'Show everyone');
    button.type = 'button';
    button.addEventListener('click', showEveryone);
    none.append(el('p', undefined, 'No one matches the current filter.'), button);
    wrap.append(none);
  }
  return wrap;
}

function field(label: string, ...content: Node[]): HTMLElement {
  const wrap = el('div', 'field');
  wrap.append(el('span', 'label', label), ...content);
  return wrap;
}

function renderCard(p: Person): HTMLElement {
  const card = el('article', 'card');

  const back = iconButton('back', 'People', 'btn sm back');
  back.addEventListener('click', () => select(null));

  const head = el('div', 'card-head');
  const kind = el('span', `kind ${p.kind}`);
  kind.append(el('i', `dot ${p.kind}`), document.createTextNode(p.kind === 'met' ? 'Met' : 'Heard'));
  head.append(kind, el('h2', undefined, p.name));
  const who = [p.role, p.company].filter(Boolean).join(' · ');
  if (who) head.append(el('p', 'meta', who));
  head.append(el('p', 'meta faint', [`Person ${p.order} of ${event.people.length}`, p.spot].filter(Boolean).join(' · ')));
  card.append(back, head);

  if (p.topics.length) {
    const topics = el('ul', 'topics');
    for (const t of p.topics) topics.append(el('li', undefined, t));
    card.append(topics);
  }

  card.append(field(p.kind === 'met' ? 'What you talked about' : 'What you heard', el('p', undefined, p.summary)));

  if (p.quote) card.append(field('Quote', el('blockquote', undefined, `“${p.quote}”`)));

  const reach = el('div', 'copyline');
  reach.append(el('p', undefined, p.reachOut), copyButton(() => p.reachOut));
  card.append(field('Suggested follow-up', reach));

  const link = el('div', 'copyline');
  if (p.linkedin) {
    const a = el('a', undefined, p.linkedin.replace(/^https:\/\/(www\.)?/, ''));
    a.href = p.linkedin;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    link.append(a, copyButton(() => p.linkedin ?? ''));
  } else {
    link.append(el('p', 'none', 'No LinkedIn link in your notes.'));
  }
  card.append(field('LinkedIn', link));
  return card;
}

// ---- tabs -------------------------------------------------------------------

const tabHooks: TabHooks = {
  chips,
  showAll: showEveryone,
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

/** The highlight slides under whichever tab is active (CSS crops it to that tab, see .tab-pill). */
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

// ---- room controls ----------------------------------------------------------

function renderHeader(): void {
  $('venue-name').textContent = event.venue.name;
  $('source').textContent = source === 'sample' ? 'Sample data' : 'From your notes';
}

$('reset-view').prepend(icon('reset'));
$('close-dialog').append(icon('close'));
$('reset-view').addEventListener('click', () => view?.resetView());

// Only Safari reports a trackpad twist to web pages, so only it gets the twist hint.
$('hint').textContent =
  'GestureEvent' in window
    ? 'Drag to move. Swipe with two fingers to tilt, twist to rotate, pinch to zoom.'
    : 'Drag to move. Swipe with two fingers to tilt and rotate, pinch to zoom.';

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

// ---- mode badge -------------------------------------------------------------

async function loadMode(): Promise<void> {
  const mode = $('mode');
  try {
    const res = await fetch('/api/status');
    const body = (await res.json()) as { mode: 'mock' | 'argon' };
    mode.dataset.state = body.mode;
    mode.textContent = body.mode === 'argon' ? 'Argon' : 'Demo mode';
    mode.title = body.mode === 'argon' ? 'Argon reads your notes and proposes the room. An API key is set.' : 'No API key. Only the sample notes can be built.';
  } catch {
    mode.dataset.state = 'offline';
    mode.textContent = 'Server offline';
    mode.title = 'The dev server did not answer.';
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
        document.createTextNode(clean ? 'no problems found' : `${round.problems.length} problem${round.problems.length === 1 ? '' : 's'} found, sent back to Argon`),
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
  else if ('ok' in result && result.ok) report.append(el('p', 'status', 'Room built. Close this window to see it.'));
}

$('notes-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = notesBox.value;
  buildButton.disabled = true;
  report.replaceChildren(el('p', 'status', 'Building the room. Argon drafts it and the checker verifies it.'));
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

/** Lift the intro screen once the font is in: the room rises and the camera swoops down. */
async function reveal(): Promise<void> {
  await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))]);
  if (!reducedMotion) await new Promise((resolve) => setTimeout(resolve, 350));
  booted = true;
  $('intro').classList.add('done');
  view?.playIntro();
  movePill();
  setTimeout(() => document.getElementById('intro')?.remove(), 900);
}
void reveal();

if (import.meta.env.DEV) {
  (window as unknown as { __roommap: unknown }).__roommap = {
    screenOf: (id: string) => view?.screenOf(id) ?? null,
  };
}
