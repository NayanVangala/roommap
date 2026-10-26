import type { EventData } from './schema';

/**
 * Fictional sample data. Every name, company and LinkedIn URL below is made up.
 * SAMPLE_EVENT must pass validateEvent(SAMPLE_EVENT, SAMPLE_NOTES); a test enforces it.
 */

export const SAMPLE_NOTES = `Founders & Engineers Mixer, SoMa loft, Thursday night. Big open room. Stage and big screen on the north wall, bar down the west wall, high-top tables in the middle, sponsor booth in the north-east corner, sofas along the south-east, front door on the south wall.

7:05 Elise Brandt, the MC, was on the floor just left of the stage welcoming everyone. I only listened. She announced a raffle at the sponsor booth.

7:20 Jun Park gave the keynote on the stage, "Agents need receipts". Did not talk to him. Best line: "if you can't replay it, you can't trust it".

7:40 Priya Raman, staff ML engineer at Fernwood Labs. Met her at the bar. She is fixing flaky evals on agent runs and wants a simple way to replay failures. She said "most of our evals break because the sandbox state drifts". LinkedIn: https://www.linkedin.com/in/example-priya-raman. Promised to send her my replay harness repo.

8:00 Marcus Webb, founder of Tidepool, an eval tooling startup. Standing at the high-top near the middle of the room. He is hiring a first design engineer. He said "we ship a new eval every Friday and nobody reads the results". Wants an intro to anyone building 3D dashboards. I do not have his LinkedIn yet, ask him.

8:15 Sofia Alvarez, head of platform at Meridian Pay, was on the panel on stage. Only listened. She said "the boring part of agents is permissions".

8:35 Hana Ito, product designer at Kelp & Co. Talked to her on the sofas. She prototypes interfaces in three.js on weekends. She said "people remember a space, not a spreadsheet". LinkedIn: https://www.linkedin.com/in/example-hana-ito. She offered to review my demo.

8:50 Overheard Ravi Menon at the table by the plants arguing with a friend: "demo day is a dice roll, only the live demo matters". Did not introduce myself.

9:05 Leo Fischer, developer advocate at Lumen Grid. Met at the sponsor booth. Gave me API credits and said the next hackathon has a build track for students.

9:30 Dana Okafor, runs the summer fellows program at Northgate Robotics. Caught her by the front door as she was leaving. She said applications open in January. Her card is in my jacket pocket.`;

export const SAMPLE_EVENT: EventData = {
  venue: {
    name: 'Founders & Engineers Mixer',
    width: 24,
    depth: 16,
    features: [
      { id: 'stage', kind: 'stage', label: 'Stage', x: 12, z: 2, w: 9, d: 3.2 },
      { id: 'screen', kind: 'screen', x: 12, z: 0.25, w: 7, d: 0.3 },
      { id: 'bar', kind: 'bar', label: 'Bar', x: 1.6, z: 8, w: 1.4, d: 8 },
      { id: 'table-1', kind: 'table', x: 9, z: 7.5, w: 1, d: 1 },
      { id: 'table-2', kind: 'table', x: 15, z: 7.5, w: 1, d: 1 },
      { id: 'table-3', kind: 'table', x: 12, z: 10.5, w: 1, d: 1 },
      { id: 'table-4', kind: 'table', x: 18.5, z: 9.8, w: 1, d: 1 },
      { id: 'table-5', kind: 'table', x: 6.5, z: 11.8, w: 1, d: 1 },
      { id: 'table-6', kind: 'table', x: 21.5, z: 7.2, w: 1, d: 1 },
      { id: 'booth', kind: 'booth', label: 'Sponsor booth', x: 20, z: 2.4, w: 3.6, d: 1.4 },
      { id: 'sofa', kind: 'sofa', label: 'Sofas', x: 20, z: 13.6, w: 4.5, d: 1.4 },
      { id: 'plant-1', kind: 'plant', x: 1, z: 1, w: 0.8, d: 0.8 },
      { id: 'plant-2', kind: 'plant', x: 23, z: 1, w: 0.8, d: 0.8 },
      { id: 'plant-3', kind: 'plant', x: 23, z: 8, w: 0.8, d: 0.8 },
      { id: 'door', kind: 'door', label: 'Door', x: 12, z: 15.85, w: 2.4, d: 0.3 },
    ],
  },
  people: [
    {
      id: 'elise-brandt',
      name: 'Elise Brandt',
      kind: 'heard',
      order: 1,
      role: 'MC',
      x: 5.2,
      z: 3.0,
      spot: 'left of the stage',
      topics: ['welcome', 'raffle'],
      summary: 'Opened the night from the floor left of the stage and announced a raffle at the sponsor booth.',
      reachOut: 'Thanks for hosting the mixer, the raffle kept the whole room moving.',
    },
    {
      id: 'jun-park',
      name: 'Jun Park',
      kind: 'heard',
      order: 2,
      role: 'Keynote speaker',
      x: 11,
      z: 2,
      spot: 'on the stage',
      topics: ['agents', 'logging', 'replay'],
      summary: 'Keynote titled "Agents need receipts". Argued that every tool call should be logged so runs can be replayed.',
      quote: "if you can't replay it, you can't trust it",
      reachOut: 'Your "agents need receipts" keynote changed how I think about logging tool calls. Do you have a write-up?',
    },
    {
      id: 'priya-raman',
      name: 'Priya Raman',
      kind: 'met',
      order: 3,
      role: 'Staff ML engineer',
      company: 'Fernwood Labs',
      x: 3.2,
      z: 7,
      spot: 'at the bar',
      topics: ['evals', 'agent runs', 'replay'],
      summary: 'Fixing flaky evals on agent runs and wants a simple way to replay failures. I promised to send my replay harness repo.',
      quote: 'most of our evals break because the sandbox state drifts',
      linkedin: 'https://www.linkedin.com/in/example-priya-raman',
      reachOut: 'Great meeting you at the bar. Here is the replay harness repo I mentioned, curious if it helps with the sandbox drift.',
    },
    {
      id: 'marcus-webb',
      name: 'Marcus Webb',
      kind: 'met',
      order: 4,
      role: 'Founder',
      company: 'Tidepool',
      x: 10.3,
      z: 7.4,
      spot: 'high-top in the middle',
      topics: ['eval tooling', 'hiring', '3D dashboards'],
      summary: 'Runs an eval tooling startup and is hiring a first design engineer. Wants an intro to anyone building 3D dashboards.',
      quote: 'we ship a new eval every Friday and nobody reads the results',
      reachOut: 'Good chatting at the high-top. I do not have your LinkedIn yet, what is the best way to reach you?',
    },
    {
      id: 'sofia-alvarez',
      name: 'Sofia Alvarez',
      kind: 'heard',
      order: 5,
      role: 'Head of platform',
      company: 'Meridian Pay',
      x: 13.5,
      z: 2.2,
      spot: 'on the panel',
      topics: ['agents', 'permissions'],
      summary: 'Panelist on stage. Argued that permissions are the unglamorous part of building agents.',
      quote: 'the boring part of agents is permissions',
      reachOut: 'I liked your point on the panel that permissions are the boring part of agents. How do you scope them at Meridian Pay?',
    },
    {
      id: 'hana-ito',
      name: 'Hana Ito',
      kind: 'met',
      order: 6,
      role: 'Product designer',
      company: 'Kelp & Co.',
      x: 19.5,
      z: 12,
      spot: 'on the sofas',
      topics: ['three.js', 'interface design', 'prototyping'],
      summary: 'Prototypes interfaces in three.js on weekends. Offered to review my demo.',
      quote: 'people remember a space, not a spreadsheet',
      linkedin: 'https://www.linkedin.com/in/example-hana-ito',
      reachOut: 'Thanks for offering to review my demo. Here is the link, I would love your eye on the interaction design.',
    },
    {
      id: 'ravi-menon',
      name: 'Ravi Menon',
      kind: 'heard',
      order: 7,
      x: 20.4,
      z: 7.2,
      spot: 'table by the plants',
      topics: ['demo day'],
      summary: 'Overheard arguing with a friend about demo day. I did not introduce myself.',
      quote: 'demo day is a dice roll, only the live demo matters',
      reachOut: 'I overheard your take that only the live demo matters. Would love to hear how you prepare for one.',
    },
    {
      id: 'leo-fischer',
      name: 'Leo Fischer',
      kind: 'met',
      order: 8,
      role: 'Developer advocate',
      company: 'Lumen Grid',
      x: 20,
      z: 4,
      spot: 'sponsor booth',
      topics: ['API credits', 'hackathons', 'student build track'],
      summary: 'Gave me API credits and said the next hackathon has a build track for students.',
      reachOut: 'Thanks for the API credits. Can you send the link to the student build track at the next hackathon?',
    },
    {
      id: 'dana-okafor',
      name: 'Dana Okafor',
      kind: 'met',
      order: 9,
      role: 'Runs the summer fellows program',
      company: 'Northgate Robotics',
      x: 13.8,
      z: 14.6,
      spot: 'by the front door',
      topics: ['summer fellows', 'applications'],
      summary: 'Said applications open in January. Her card is in my jacket pocket.',
      reachOut: 'Great meeting you by the door. I will keep an eye out for the fellows applications in January.',
    },
  ],
};

/**
 * What a sloppy first answer looks like. The mock proposer returns this on
 * round 1 so you can watch the verify loop catch three real mistakes:
 * a person inside the bar, an invented LinkedIn URL and a quote that is not in the notes.
 */
export function brokenSampleEvent(): EventData {
  const event = structuredClone(SAMPLE_EVENT);
  const priya = event.people.find((p) => p.id === 'priya-raman');
  const hana = event.people.find((p) => p.id === 'hana-ito');
  const marcus = event.people.find((p) => p.id === 'marcus-webb');
  if (priya) priya.x = 1.5;
  if (hana) hana.linkedin = 'https://www.linkedin.com/in/hana-ito-design';
  if (marcus) marcus.quote = 'nobody reads our eval reports';
  return event;
}
