import { copyButton, el, icon, iconButton, pad } from './dom';
import type { EventData, Person, PersonKind } from './schema';

/**
 * The four list tabs. Each one is a plain function: event in, page out.
 * Same skeleton every time (a title, one line of context, the Met / Heard filter, then the list)
 * so no tab outranks another. Everything the model wrote goes in through textContent.
 * The only link is a LinkedIn URL the validator approved.
 */

export interface TabHooks {
  /** Go to the room and select this person. */
  pick(id: string): void;
  /** A fresh Met / Heard filter bar. */
  chips(): HTMLElement;
  /** Turn both filters back on. */
  showAll(): void;
}

type Shown = Record<PersonKind, boolean>;

function shownPeople(event: EventData, shown: Shown): Person[] {
  return event.people.filter((p) => shown[p.kind]).sort((a, b) => a.order - b.order);
}

/** Rows fade in one after another. --i feeds the CSS delay. */
function rise<T extends HTMLElement>(node: T, i: number): T {
  node.classList.add('rise');
  node.style.setProperty('--i', String(i));
  return node;
}

function page(title: string, blurb: string, hooks: TabHooks): { root: HTMLElement; body: HTMLElement } {
  const root = el('div', 'vpage');
  const head = el('header', 'vhead');
  const text = el('div');
  text.append(el('h2', undefined, title), el('p', 'blurb', blurb));
  head.append(text, hooks.chips());
  const body = el('div', 'vbody');
  root.append(head, body);
  return { root, body };
}

function empty(hooks: TabHooks): HTMLElement {
  const box = el('div', 'empty');
  const button = el('button', 'btn sm', 'Show everyone');
  button.type = 'button';
  button.addEventListener('click', hooks.showAll);
  box.append(el('p', undefined, 'No one matches the current filter.'), button);
  return box;
}

function who(p: Person): string {
  return [p.role, p.company].filter(Boolean).join(' · ');
}

function kindLabel(kind: PersonKind): HTMLElement {
  const label = el('span', `kind ${kind}`);
  label.append(el('i', `dot ${kind}`), document.createTextNode(kind === 'met' ? 'Met' : 'Heard'));
  return label;
}

function orderBadge(p: Person): HTMLElement {
  return el('span', `order ${p.kind}`, pad(p.order));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---- People: one table ----------------------------------------------------------

export function renderPeople(event: EventData, shown: Shown, hooks: TabHooks): HTMLElement {
  const { root, body } = page('People', 'Everyone from the event. Select a row to find them on the map.', hooks);
  const people = shownPeople(event, shown);
  if (!people.length) {
    body.append(empty(hooks));
    return root;
  }

  const table = el('table', 'data');
  table.setAttribute('aria-label', 'People from the event');
  const head = el('tr');
  for (const [text, cls] of [['#', 'col-num'], ['Name', ''], ['Type', 'col-type'], ['Where', 'col-where'], ['Topics', 'col-topics']] as const) {
    const th = el('th', cls, text);
    th.scope = 'col';
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);

  const tbody = el('tbody');
  people.forEach((p, i) => {
    const row = rise(el('tr', 'clickable'), i);
    const name = el('td');
    const link = el('button', 'row-link', p.name);
    link.type = 'button';
    name.append(link, el('span', 'sub', who(p)));

    const topics = el('td', 'col-topics');
    for (const t of p.topics.slice(0, 3)) topics.append(el('span', 'tag', t));
    if (p.topics.length > 3) topics.append(el('span', 'more', `+${p.topics.length - 3}`));

    const type = el('td', 'col-type');
    type.append(kindLabel(p.kind));
    const num = el('td', 'col-num');
    num.append(orderBadge(p));
    row.append(num, name, type, el('td', 'col-where', p.spot ?? ''), topics);
    row.addEventListener('click', () => hooks.pick(p.id));
    tbody.append(row);
  });
  table.append(thead, tbody);
  body.append(table);
  return root;
}

// ---- Timeline: the night in order -----------------------------------------------

export function renderTimeline(event: EventData, shown: Shown, hooks: TabHooks): HTMLElement {
  const people = shownPeople(event, shown);
  const { root, body } = page('Timeline', `${plural(people.length, 'person', 'people')}, in the order you came across them.`, hooks);
  if (!people.length) {
    body.append(empty(hooks));
    return root;
  }

  const list = el('ol', 'timeline');
  people.forEach((p, i) => {
    const row = el('button', 'trow');
    row.type = 'button';
    const text = el('div', 'trow-text');
    const heading = el('div', 'trow-head');
    heading.append(el('strong', undefined, p.name), el('span', 'sub', who(p)), kindLabel(p.kind));
    text.append(heading, el('p', undefined, p.summary));
    if (p.quote) text.append(el('p', 'quote', `“${p.quote}”`));
    row.append(orderBadge(p), text);
    row.addEventListener('click', () => hooks.pick(p.id));
    const li = rise(el('li'), i);
    li.append(row);
    list.append(li);
  });
  body.append(list);
  return root;
}

// ---- Topics: what the night was about -------------------------------------------

export function renderTopics(event: EventData, shown: Shown, hooks: TabHooks): HTMLElement {
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
  const { root, body } = page('Topics', `${plural(rows.length, 'topic', 'topics')} from your notes, with the people behind each one.`, hooks);
  if (!rows.length) {
    body.append(empty(hooks));
    return root;
  }

  const list = el('ul', 'topics-list');
  rows.forEach(([topic, people], i) => {
    const row = rise(el('li', 'topic-row'), i);
    row.append(el('h3', undefined, topic), el('span', 'count', String(people.length)));
    const names = el('div', 'names');
    for (const p of people) {
      const chip = el('button', `namechip ${p.kind}`, p.name);
      chip.type = 'button';
      chip.addEventListener('click', () => hooks.pick(p.id));
      names.append(chip);
    }
    row.append(names);
    list.append(row);
  });
  body.append(list);
  return root;
}

// ---- Follow-ups: what to send ---------------------------------------------------

export function renderFollowups(event: EventData, shown: Shown, hooks: TabHooks): HTMLElement {
  const { root, body } = page('Follow-ups', 'A suggested message for each person. Copy it, open their LinkedIn, or find them on the map.', hooks);
  const people = shownPeople(event, shown);
  if (!people.length) {
    body.append(empty(hooks));
    return root;
  }

  const list = el('ul', 'followups');
  people.forEach((p, i) => {
    const row = rise(el('li', 'frow'), i);
    const identity = el('div', 'frow-who');
    identity.append(el('strong', undefined, p.name), el('span', 'sub', who(p)), kindLabel(p.kind));

    const content = el('div', 'frow-body');
    const actions = el('div', 'actions-row');
    actions.append(copyButton(() => p.reachOut, 'Copy message'));
    if (p.linkedin) {
      const a = el('a', 'btn sm');
      a.href = p.linkedin;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.append(icon('external'), el('span', undefined, 'LinkedIn'));
      actions.append(a);
    } else {
      actions.append(el('span', 'note', 'No LinkedIn link in your notes'));
    }
    const show = iconButton('locate', 'Show on map');
    show.addEventListener('click', () => hooks.pick(p.id));
    actions.append(show);
    content.append(el('p', 'message', p.reachOut), actions);

    row.append(identity, content);
    list.append(row);
  });
  body.append(list);
  return root;
}
