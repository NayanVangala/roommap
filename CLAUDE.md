# Roommap

A 3D map of a networking event. People you **met** (talked to) and people you **heard** (speakers, overheard) stand where they were in the room. Click one to see the notes, a verbatim quote, LinkedIn, and a suggested follow-up.

Built as practice for hackathons where the winning pattern is: **the model proposes, deterministic code verifies, failures go back to the model, and the UI shows proof.** No hardware. Argon (`gemini-4-argon`) replaces what smart glasses would have captured: it reads typed notes and an optional floor-plan photo.

## Working with Nayan

Nayan is learning by building. Keep changes small, say why in a sentence or two, and keep the code readable enough for him to edit. Casual tone, short answers, no em-dashes, no corporate jargon.

## Commands

```bash
npm run dev         # Vite on :5173, includes the /api dev endpoints
npm test            # vitest: validator + extract loop (17 tests)
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
| `src/scene.ts` | three.js scene: room, furniture boxes, people (met = solid, heard = ghost with sound rings), route line, picking, camera framing. |
| `src/main.ts` | DOM UI: roster, person card, filters, notes dialog, round report. |
| `src/sample.ts` | Fictional sample notes + matching event + `brokenSampleEvent()` for the mock loop. |

## Rules to keep

1. **The model only proposes.** Nothing reaches the screen without passing `validateEvent`. New rule about what is allowed on screen goes in `validate.ts` with a test.
2. **Grounding.** Never show a name, quote or LinkedIn URL that is not in the user's notes. This is the main anti-hallucination check.
3. **Model text goes in with `textContent`**, never `innerHTML`. LinkedIn is the only link and only after the validator's URL pattern passes.
4. **The API key never goes to the browser.**
5. **Sample data is fictional.** Do not put real people's names, companies or profile URLs in `sample.ts`.
6. **No recording.** No audio or video capture. Notes are typed by the user.

## Status

Verified (cloud sandbox, headless Chromium):
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
6. Demo polish: camera fly-through along the route, highlight a person's quote on the 3D label, a "tonight in one view" summary.
7. Deploy for demos: `/api` only exists in the Vite dev server. Move `server/extract.ts` behind a serverless function (the file has no Vite dependency) and keep the mock path as the fallback if a live call fails.
8. Add the Playwright smoke script as a repo script. The sandbox one clicks people via `window.__roommap.screenOf(id)`, a dev-only hook in `main.ts`.

## Gotchas

- Hidden people must not be pickable. The invisible hit cylinders use `MeshBasicMaterial({ visible: false })` and `pickables` is rebuilt whenever a filter changes, because `Raycaster` ignores `object.visible`.
- The camera auto-frames the room on resize until the user touches the controls (`userMoved`). `Reset view` re-enables it.
- The grid in `.app` needs `grid-template-columns: minmax(0, 1fr)` or the header can push the page wider than a phone screen.
