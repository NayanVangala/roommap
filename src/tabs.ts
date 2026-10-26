import { copyButton, countUp, el, pad } from './dom';
import type { EventData, Person, PersonKind } from './schema';

/**
 * The four list tabs. Each one is a plain function: event in, page out.
 * Same skeleton every time (a header, then a body) so no tab feels more important than another.
 * Everything the model wrote goes in through textContent. The only link is a LinkedIn URL the validator approved.
 */

export interface TabHooks {
  /** Go to the room and select this person. */
  pick(id: string): void;
  /** A fresh Met / Heard filter bar. */
  chips(): HTMLElement;
}

type Shown = Record<PersonKind, boolean>;

function shownPeople(event: EventData, shown: Shown): Person[] {
  return event.people.filter((p) => shown[p.kind]).sort((a, b) => a.order - b.order);
}

/** Cards slide up one after another. --i feeds the CSS delay. */
function rise<T extends HTMLElement>(node: T, i: number): T {
  node.classList.add('rise');
  node.style.setProperty('--i', String(i));
  return node;
}

function page(eyebrow: string, title: string, blurb: string, hooks: TabHooks): { root: HTMLElement; body: HTMLElement } {
  const root = el('div', 'vpage');
  const head = rise(el('header', 'vhead'), 0);
  const text = el('div');
  text.append(el('p', 'eyebrow', eyebrow), el('h2', 'display', title), el('p', 'blurb', blurb));
  head.append(text, hooks.chips());
  const body = el('div', 'vbody');
  root.append(head, body);
  return { root, body };
}

function empty(message: string): HTMLElement {
  return el('p', 'empty', message);
}

function who(p: Person): string {
  return [p.role, p.company].filter(Boolean).join(' · ') || p.spot || '';
}

function kindTag(kind: PersonKind): HTMLElement {
  const tag = el('span', `kind ${kind}`);
  tag.append(el('i', `dot ${kind}`), document.createTextNode(kind === 'met' ? 'Met' : 'Heard'));
  return tag;
}

// ---- People: a grid of everyone -------------------------------------------------

export function renderPeople(event: EventData, shown: Shown, hooks: TabHooks): HTMLElement {
  const { root, body } = page('01 / People', 'Everyone in the room', 'Tap anyone to find them on the map.', hooks);
  const people = shownPeople(event, shown);
  if (!people.length) body.append(empty('Nobody to show. Turn a filter back on.'));
  const grid = el('div', 'pgrid');
  people.forEach((p, i) => {
    const card = el('button', `pcard ${p.kind}`);
    card.type = 'button';
    const top = el('div', 'pcard-top');
    top.append(el('span', 'num', pad(p.order)), kindTag(p.kind));
    card.append(top, el('h3', undefined, p.name), el('p', 'role', who(p)), el('p', 'sum', p.summary));
    card.addEventListener('click', () => hooks.pick(p.id));
    grid.append(rise(card, i + 1));
  });
  body.append(grid);
  return root;
}

// ---- Timeline: the night in order, with four numbers on top ---------------------

export function renderTimeline(event: EventData, shown: Shown, hooks: TabHooks): HTMLElement {
  const { root, body } = page('02 / Timeline', 'Your night in order', 'Who, when, and the one thing worth remembering.', hooks);
  const people = shownPeople(event, shown);

  const topics = new Set(people.flatMap((p) => p.topics.map((t) => t.trim().toLowerCase()).filter(Boolean)));
  const spots = new Set(people.map((p) => p.spot?.trim().toLowerCase()).filter(Boolean));
  const stats = el('div', 'stats');
  const numbers: Array<[string, number]> = [
    ['Met', people.filter((p) => p.kind === 'met').length],
    ['Heard', people.filter((p) => p.kind === 'heard').length],
    ['Topics', topics.size],
    ['Spots', spots.size],
  ];
  numbers.forEach(([label, n], i) => {
    const stat = rise(el('div', 'stat'), i + 1);
    const value = el('b', 'display');
    countUp(value, n, pad);
    stat.append(value, el('span', 'label', label));
    stats.append(stat);
  });
  body.append(stats);

  if (!people.length) body.append(empty('Nobody to show. Turn a filter back on.'));
  const list = el('ol', 'timeline');
  people.forEach((p, i) => {
    const row = el('button', `trow ${p.kind}`);
    row.type = 'button';
    const text = el('div', 'trow-text');
    const heading = el('div', 'trow-head');
    heading.append(el('strong', undefined, p.name), el('span', 'sub', who(p)));
    text.append(heading, el('p', undefined, p.summary));
    if (p.quote) text.append(el('p', 'q', `“${p.quote}”`));
    row.append(el('span', 'num', pad(p.order)), el('i', `dot ${p.kind}`), text);
    row.addEventListener('click', () => hooks.pick(p.id));
    const li = el('li');
    li.append(row);
    list.append(rise(li, i + 5));
  });
  body.append(list);
  return root;
}

// ---- Topics: what the night was about -------------------------------------------

export function renderTopics(event: EventData, shown: Shown, hooks: TabHooks): HTMLElement {
  const { root, body } = page('03 / Topics', 'What people talked about', 'The same topic from different people sits together.', hooks);
  const byTopic = new Map<string, Person[]>();
  for (const p of shownPeople(event, shown)) {
    for (const raw of p.topics) {
      const topic = raw.trim().toLowerCase();
      if (!topic) continue;
      const list = byTopic.get(topic) ?? [];
      if (!list.includes(p)) list.push(p);
      byTopic.set(topic, list);
    }
  }
  const rows = [...byTopic].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  if (!rows.length) body.append(empty('No topics to show.'));
  const list = el('ul', 'topics-list');
  rows.forEach(([topic, people], i) => {
    const row = el('li', 'topic-row');
    row.append(el('h3', 'display', topic), el('span', 'count', pad(people.length)));
    const names = el('div', 'names');
    for (const p of people) {
      const chip = el('button', `namechip ${p.kind}`, p.name);
      chip.type = 'button';
      chip.addEventListener('click', () => hooks.pick(p.id));
      names.append(chip);
    }
    row.append(names);
    list.append(rise(row, i + 1));
  });
  body.append(list);
  return root;
}

// ---- Follow-ups: what to send ---------------------------------------------------

export function renderFollowups(event: EventData, shown: Shown, hooks: TabHooks): HTMLElement {
  const { root, body } = page('04 / Follow-ups', 'What to send', 'One line per person, ready to copy.', hooks);
  const people = shownPeople(event, shown);
  if (!people.length) body.append(empty('Nobody to show. Turn a filter back on.'));
  const grid = el('div', 'fgrid');
  people.forEach((p, i) => {
    const card = el('article', `fcard ${p.kind}`);
    const head = el('div', 'fcard-head');
    const name = el('div');
    name.append(el('h3', undefined, p.name), el('p', 'role', who(p)));
    head.append(name, kindTag(p.kind));
    card.append(head, el('p', 'message', p.reachOut));

    const actions = el('div', 'actions-row');
    actions.append(copyButton(() => p.reachOut));
    if (p.linkedin) {
      const a = el('a', 'ghost', 'LinkedIn');
      a.href = p.linkedin;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      actions.append(a);
    } else {
      actions.append(el('span', 'none', 'No LinkedIn in your notes'));
    }
    const show = el('button', 'ghost', 'Show in room');
    show.type = 'button';
    show.addEventListener('click', () => hooks.pick(p.id));
    actions.append(show);
    card.append(actions);
    grid.append(rise(card, i + 1));
  });
  body.append(grid);
  return root;
}
