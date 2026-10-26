# Roommap

A 3D map of a networking event. People you **met** (talked to) and people you **heard** (speakers, overheard) stand where they were in the room. Click one to see the notes, a verbatim quote, LinkedIn, and a suggested follow-up.

Built as practice for hackathons where the winning pattern is: **the model proposes, deterministic code verifies, failures go back to the model, and the UI shows proof.** No hardware. Argon (`gemini-4-argon`) replaces what smart glasses would have captured: it reads typed notes and an optional floor-plan photo.

## Working with Nayan

Nayan is learning by building. Keep changes small, say why in a sentence or two, and keep the code readable enough for him to edit. Casual tone, short answers, no em-dashes, no corporate jargon.

## Commands

```bash
npm run dev         # Vite on :5173, includes the /api dev endpoints
npm test            # vitest: validator, extract loop, furniture facing (21 tests)
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + vite build (frontend only, no /api)
```

`GEMINI_API_KEY` in `.env` switches from mock mode to real Argon calls. `GEMINI_MODEL` defaults to `gemini-4-argon`.

## Data flow

```
notes (+ image) --POST /api/extract--> server/extract.ts
                                         loop up to 3 rounds:
                                           propose  (Argon, or mockProposer)
                                           parse JSON
                                           validateEvent()  <-- src/validate.ts
                                           problems? send them back, propose again
                                       --> { ok, event, rounds[] }
event --> RoomView.setEvent() (src/scene.ts) + side panel (src/main.ts)
```

| File | Job |
| --- | --- |
| `src/schema.ts` | zod types: venue, features (boxes), people. Metres, origin north-west corner, x east, z south. |
| `src/validate.ts` | The checker. Schema + bounds + nobody inside furniture + spacing + grounding (names, quotes and LinkedIn URLs must appear in the notes). Messages are plain sentences fed straight back to the model. |
| `server/extract.ts` | The propose/verify loop. `argonProposer` calls the Interactions API. `mockProposer` returns a sloppy answer on round 1 and a clean one after. |
| `vite.config.ts` | Dev-only plugin serving `/api/status` and `/api/extract` so the key stays server-side. |
| `src/scene.ts` | three.js view: lights, bloom, camera (orbit, move, WASD), intro animation, picking, route line with a walking light. Builds nothing itself, it places what `src/models/` makes. |
| `src/models/parts.ts` | Tiny helpers (rounded box, cylinder, glow material) and `hash`/`pick` so a person always looks the same. |
| `src/models/person.ts` | One person from primitives: legs, torso, arms, head, hair styles, glasses, cup, badge. Met = orange with a name badge. Heard = see-through ghost. Idle motion in `update(t)`. |
| `src/models/venue.ts` | Floor planks, walls, string lights, dust, and one detailed model per feature kind (stage with truss and beams, bar with bottles, sofa, screen marquee, plant, door). `facingOf` turns furniture away from the nearest wall. |
| `src/main.ts` | Wiring: tabs, filter chips, hero, side panel (roster + person card), notes dialog, intro curtain. |
| `src/tabs.ts` | The four list tabs (People, Timeline, Topics, Follow-ups). Each is a plain function: event in, page out. |
| `src/dom.ts` | `$`, `el`, `copyButton`, `countUp`, `retrigger`. Model text always goes in through `el(..., text)`. |
| `src/style.css` | Whole look: warm black `#100904`, orange `#ff8539`, serif titles, mono labels. Inspired by Oryzo AI (Awwwards Site of the Month, Apr 2026). |
| `src/sample.ts` | Fictional sample notes + matching event + `brokenSampleEvent()` for the mock loop. |

## Rules to keep

1. **The model only proposes.** Nothing reaches the screen without passing `validateEvent`. New rule about what is allowed on screen goes in `validate.ts` with a test.
2. **Grounding.** Never show a name, quote or LinkedIn URL that is not in the user's notes. This is the main anti-hallucination check.
3. **Model text goes in with `textContent`**, never `innerHTML`. LinkedIn is the only link and only after the validator's URL pattern passes.
4. **The API key never goes to the browser.**
5. **Sample data is fictional.** Do not put real people's names, companies or profile URLs in `sample.ts`.
6. **No recording.** No audio or video capture. Notes are typed by the user.

## UI

Five tabs: **Room** (3D map plus side panel), **People** (grid), **Timeline** (stats strip plus the night in order), **Topics** (who said what, grouped), **Follow-ups** (copyable messages). Same skeleton on the list tabs so none outranks another. The Met / Heard chips filter every tab.

Moving in the room: drag orbits by default. The Orbit / Move switch makes a plain drag travel across the floor instead. Shift-drag and right-drag always do the other one. WASD and arrow keys glide. The view stays inside the room. Keys are ignored while typing or when the dialog is open.

Motion: curtain intro, then furniture rises and people pop in while the camera swoops down (`RoomView.playIntro`). Tab pages fade and slide, cards rise in staggered. All of it stops under `prefers-reduced-motion`. The 3D loop pauses while another tab is showing.

## Status

Latest session (Oct 26): redesign, new tabs, detailed 3D models, movement. Checked in a real browser: all five tabs, close-up of a person, WASD, Move-mode drag, 390px wide with no horizontal scroll, no console errors. 21 tests pass, typecheck and build clean.

**Argon is still unverified.** Key now works against Google (`gemini-4-argon` exists) but every call returns 402 "prepayment credits are depleted". Top up billing in AI Studio, then rerun the sample notes. The SDK hides Google's error text behind `{"httpMeta":...}`, so use curl against `/v1beta/interactions` to see the real message.

Verified earlier (cloud sandbox, headless Chromium):
- 17 unit tests pass: validator rules, loop behavior (feedback, round limit, non-JSON recovery, model errors).
- Browser smoke run: scene renders, clicking people in 3D opens the right card, filters hide and unpick people, roster and Escape work, mock build shows round 1 with 3 problems then a clean round 2, no console errors, no horizontal scroll at 390px.

**Not verified:**
- **The real Argon call.** `argonProposer` mirrors the Interactions call shape from the Morf repo (`client.interactions.create` with `input`, `system_instruction`, `generation_config`, `response_format`) and reads text from `steps[].content[]` where `type === 'model_output'`. It was written without an API key, so the first real run may need small fixes. Start there.
- Image input (floor-plan photo) has never been sent to the model.
- `response_format` is sent without a JSON schema on purpose, so a schema the API rejects cannot break the first run. The loop repairs bad shapes. Once the call works, try passing `z.toJSONSchema(EventSchema)` and see if the model needs fewer rounds.

## Next steps (in order)

1. Put a key in `.env`, press Build with the sample notes, fix `argonProposer` until it works. Check that rounds make sense in the report.
2. Try your own messy notes. Tune the system prompt in `server/extract.ts` where the model keeps losing the checker's rules.
3. Try a floor-plan photo or a photo of the room.
4. Stream round updates to the UI (SSE) so the dialog shows each round as it happens instead of at the end.
5. Edit mode: drag a person to fix their spot, then re-run the checker locally. Export/import the event as JSON.
6. Demo polish: camera fly-through along the route, highlight a person's quote on the 3D label. (The "tonight in one view" summary is now the Timeline tab.)
7. Deploy for demos: `/api` only exists in the Vite dev server. Move `server/extract.ts` behind a serverless function (the file has no Vite dependency) and keep the mock path as the fallback if a live call fails.
8. Add the Playwright smoke script as a repo script. The sandbox one clicks people via `window.__roommap.screenOf(id)`, a dev-only hook in `main.ts`.

## Gotchas

- Hidden people must not be pickable. The invisible hit cylinders use `MeshBasicMaterial({ visible: false })` and `pickables` is rebuilt whenever a filter changes, because `Raycaster` ignores `object.visible`.
- The camera auto-frames the room on resize until the user touches the controls (`userMoved`). `Reset view` re-enables it.
- Props on furniture must stay inside the feature's own footprint (w by d). The validator only knows the box, so a stool or lectern sticking out can clip a person standing next to it.
- three 0.186 removed `PCFSoftShadowMap`. Use `PCFShadowMap`.
- `Object3D.add()` with no arguments logs an error. Do not spread an empty array into it.
- Facing uses `rotation.y = atan2(dx, dz)` because local +z is the front of every model.
- The grid in `.app` needs `grid-template-columns: minmax(0, 1fr)` or the header can push the page wider than a phone screen.
