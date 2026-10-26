# Roommap

Walk back through a networking event in 3D. Every person you met and every person you only heard is standing where they were in the room. Click one to see what you talked about, a line from your notes, their LinkedIn, and a follow-up message you can copy.

You paste your notes after the event (and optionally a photo of the floor plan). Argon (`gemini-4-argon`) turns them into a room and a list of people as JSON. A deterministic checker rejects anything it made up, and the model gets another try until the checker is happy.

- **Orange** people: you talked to them. The dotted line is your route through the night.
- **Blue, see-through** people with sound rings: you listened to them or overheard them.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # validator + retry-loop tests
npm run typecheck
```

No API key needed to try it. Without one the app runs in **mock mode** with the built-in sample night (all fictional people). Press **Build from notes** to watch the checker reject a sloppy first answer and accept the fixed one.

To use Argon with your own notes:

```bash
cp .env.example .env
# put your key in GEMINI_API_KEY
```

The key stays on the dev server. It never reaches the browser.

## Privacy

Notes and the last room you built are saved in this browser's localStorage. They leave your computer only when you press **Build room** with a key set, and then they go to the Gemini API. Only write down contact details people actually gave you. The app never records audio or video.

## How it works

See [CLAUDE.md](CLAUDE.md) for the architecture, rules and next steps.
