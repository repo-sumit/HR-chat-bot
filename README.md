# Gemini HR Support Bot

An embeddable HR policy assistant for ConveGenius.AI. The Vercel landing page loads a vanilla JavaScript widget from a FastAPI service on Render. **Gemini is the only AI provider. There is no database or application-side chat storage.**

- Frontend: https://cg-hr-bot.vercel.app/
- Backend: https://hr-chat-bot-jr1z.onrender.com/
- Typed chat: async Gemini embeddings → NumPy retrieval → async streamed Gemini answer.
- Voice: microphone → Render WebSocket relay → Gemini Live → streamed spoken answer and input/output transcripts.
- One input bar: a text box with a single round button that is a mic when empty, a send arrow once you type, and a stop square while voice or an answer is running. Enter also sends.
- Hands-free voice: tap the mic, speak, and it answers when you stop. It then listens for a follow-up and ends by itself after the quiet period (`NO_SPEECH_MS`, `FOLLOW_UP_MS` at the top of `widget.js`). Tap the button any time to stop, or just speak to interrupt.
- Languages: English, Hindi (Devanagari) and Hinglish. The reply follows the language of the user's **latest** message, so it can switch mid-conversation. Answers are meant to be short and specific to the question, with a human tone (`SYSTEM_PROMPT`, `VOICE_PROMPT` in `app/rag.py`).

## What changed

The old generation path required a separate provider key and ran synchronous SDK calls inside async endpoints. Its health route could return success while actual chat failed. The updated service uses the asynchronous Google SDK, checks actual text-model access and embedding compatibility, bounds requests, and reports readiness separately.

All database logging, analytics endpoints, dashboard, diagnostic script and related settings have been removed. Questions, answers and recordings are not written to disk or a database by this application. Browser history is in memory, capped at six entries, and resets on refresh. The backend keeps ephemeral IP timestamps for rate limiting and transient connection state. Google and the hosting providers have their own processing, retention and logging policies; this is not a claim of zero provider retention.

The frontend build publishes only `dist/index.html`, rather than the whole repository. Existing public repository policy artifacts remain in GitHub; this change does not change their visibility or delete historical database records.

## Architecture

| Path | Behavior |
|---|---|
| Text | `/api/chat` embeds a bounded question plus recent user questions, retrieves four policy chunks, and streams an answer grounded in them. Prior answers are conversation data, not policy evidence. |
| Voice | `/api/voice` relays PCM audio using a server-side Gemini key. The complete existing policy text is included in the Live system context. This avoids a retrieval tool round trip for this small corpus. |
| Voice context | The committed corpus is 183 chunks, approximately 118,000 characters. Startup does not re-ingest it. Voice fails explicitly if the corpus exceeds `VOICE_CONTEXT_MAX_CHARS`; it never silently truncates policy text. Large corpora need a retrieval-tool implementation before voice is enabled. |
| Capture | An AudioWorklet resamples microphone audio to 16 kHz, mono signed 16-bit little-endian PCM; frames are sent every 100 ms. |
| Playback | Model PCM audio is scheduled using Web Audio. Interruption events cancel queued audio. Tapping stop, auto-end, typing, closing and page hiding release microphone/audio resources. |
| Start-up | Microphone permission, the worklet download and the WebSocket/Gemini connection overlap, and up to 2.5 s of early speech is buffered and sent once the session is ready, so the first words are not lost. |
| Memory | The initial voice handshake carries the last six text/voice history entries. A new Gemini session starts each time the mic is tapped; the complete prior live audio session is not resumed. |

Policy grounding is a model instruction, not a formal guarantee. Validate key entitlements against the actual policy before employee rollout. Text retrieval and full-context voice can differ on ambiguous or poorly extracted policy passages. Out-of-policy questions should be declined or referred to HR.

## Repository layout

```text
app/
  config.py                Server settings
  main.py                  Readiness, SSE, CORS, rate limiting, voice relay
  rag.py                   Gemini client, policy index and text generation
  static/
    widget.js              Accessible text and voice controls
    audio-worklet.js       Microphone PCM capture
scripts/
  ingest.py                Operator-only policy ingestion
  check_gemini.py           Key, text generation and live audio diagnostic
  build_frontend.js        Public frontend-only build
data/
  embeddings.npz           Existing 183-chunk policy index
  test.pdf                 Existing source/test PDF
index.html                Landing page source
.env.example              Complete settings template, no secrets
render.yaml               Render blueprint
vercel.json               Static frontend output config
tests/test_bot.py          Offline backend integration tests
.github/workflows/checks.yml
```

## Restore environment variables and deploy

### 1. Render backend

In the **existing Render service → Environment**, add these values. `render.yaml` does not automatically update a manually managed service.

```dotenv
GEMINI_API_KEY=<your-new-Google-AI-Studio-API-key>
GEMINI_MODEL=gemini-3.8-flash
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_VOICE=Kore
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDINGS_PATH=data/embeddings.npz
ALLOWED_ORIGINS=https://cg-hr-bot.vercel.app
```

Model defaults follow Google's current published model catalog, but access must be verified with **your key/project**. Standard text/Pro models and Live audio models are different endpoints. Override model IDs if your project only has another compatible model. Never silently fall back to a different provider.

Remove obsolete generation-provider, database and admin-dashboard settings from Render after this change is deployed. Keep the Gemini key exclusively on the backend, not Vercel or the browser. Copy `.env.example` to `.env` for local use; never commit real keys.

Set the Render health check path to **`/readyz`**. `/` is liveness, not proof of a working AI pipeline. Missing/invalid keys, inaccessible text models, missing indices and dimension mismatches make readiness return HTTP 503. Recover configuration by editing the environment and redeploying; the service also retries failed readiness checks in the background.

The Docker entry point binds port 8000. Set Render's port configuration accordingly if you override it. The committed index is copied into the container, so Render's ephemeral filesystem does not lose it on redeploy. Do not ingest at runtime.

### 2. Verify Gemini access

From a local checkout with the new key in `.env`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/check_gemini.py
```

The diagnostic makes small billable requests and verifies index compatibility, actual text generation, Live session setup and generated audio. It does not print the key or policy answer. A Google AI Pro subscription is not proof of external API quota; check the API project's billing, model access and usage limits in AI Studio. Set a project spend cap for a public bot.

### 3. Vercel frontend

The existing static deployment needs:

```dotenv
API_BASE_URL=https://hr-chat-bot-jr1z.onrender.com
```

This is a public origin, not a secret. Use framework **Other**, the checked-in `vercel.json`, build command `node scripts/build_frontend.js`, and output directory `dist`. Remove old dashboard-level output/build overrides if they still publish `.`. Redeploy after the backend is ready.

Use your actual deployment domain in `ALLOWED_ORIGINS`. Add preview domains explicitly when testing them; HTTP CORS does not enforce WebSocket origin checks, so the voice endpoint validates origins itself. Local frontend defaults allow ports 3000 and 8000.

### 4. Production acceptance checks

```bash
curl -fsS https://hr-chat-bot-jr1z.onrender.com/readyz
curl -N https://hr-chat-bot-jr1z.onrender.com/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"What is the leave policy?","history":[]}'
```

Open the deployed frontend and check:

1. English, Hindi and Hinglish typed questions stream complete policy answers.
2. Follow-up questions remain grounded; absent policies are not invented.
3. Tap the mic, allow the microphone, speak a policy question, see your words and the answer appear and hear it.
4. After the answer, ask a follow-up in a different language (English ↔ Hindi) without tapping again; the reply uses the new language. Stay quiet and voice ends by itself.
5. Speak while the bot is talking; queued output stops when the provider sends an interruption. Tapping the button (now a stop square) ends voice at any time; typing in the box also ends it.
6. Close/hide the page and confirm microphone capture ends.
7. Denied microphone permission leaves typed chat usable.
8. Test Chrome desktop, Android Chrome, Safari/iOS, headphones and built-in speakers with real audio. HTTPS is required outside localhost.
8. Confirm no requests go to a database or alternate AI provider and `/dashboard` and `/api/analytics*` return 404.

The offline tests simulate Google responses; they cannot certify credentials, actual Hindi pronunciation, Gemini model behavior, network latency, acoustic echo cancellation or production hosting availability.

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Required | Server-side API key |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Streaming text model |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` | Native audio Live model |
| `GEMINI_VOICE` | `Kore` | Live prebuilt voice |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | Must match the committed policy index |
| `EMBEDDINGS_PATH` | `data/embeddings.npz` | Repository-owned policy artifact |
| `MAX_CONTEXT_CHUNKS` | `4` | Text retrieval chunk count |
| `TEMPERATURE` | `0.3` | Text generation temperature |
| `ALLOWED_ORIGINS` | Production URL, localhost:3000, localhost:8000 | HTTP and WebSocket origin allowlist |
| `BOT_NAME` | `HR Support Bot` | Widget title |
| `BOT_GREETING` | See `.env.example` | Widget greeting |
| `REQUEST_TIMEOUT_SECONDS` | `45` | Backend text request/provider timeout |
| `VOICE_SESSION_SECONDS` | `300` | Maximum continuous voice session duration |
| `MAX_VOICE_SESSIONS` | `8` | Concurrent voice connection cap per process |
| `VOICE_CONTEXT_MAX_CHARS` | `160000` | Full-context voice safety bound |
| `API_BASE_URL` | Current Render origin | Vercel build only |

## API contracts

- `GET /` → `{status:"ok", bot_name, ready}`.
- `GET /readyz` → `{ready:true}` (200), or `{ready:false}` (503). Checks text-model metadata access and an embedding round trip; Live readiness is proven at connection setup, not by this route.
- `POST /api/chat` → `{message, history:[{role:"user"|"assistant", content}]}`. Maximum question length 4,000; maximum six history entries of 8,000 characters each. History does **not** include the current question.
- SSE text events: `data: {"token":"...","done":false}\n\n`; terminal event includes `done:true` and sources, or a friendly `error`. Errors after HTTP streaming starts travel in SSE, so clients must inspect the terminal event. An interrupted stream is not accepted as a complete answer.
- `GET /widget.js` → widget JavaScript with JSON-escaped public bot settings.
- `GET /audio-worklet.js` → microphone audio processor.
- `WS /api/voice`: origin-checked, rate-limited relay. First client message: `{type:"start",history:[]}`. Server sends `{type:"ready"}` only after Gemini connects and prior context is submitted. Client sends `{type:"audio",data:"<base64 PCM16 16kHz>"}`, `{type:"end_audio"}`, `{type:"ping"}` or `{type:"stop"}`. Server sends `audio` with base64 PCM and MIME type, `transcript` with role/text (the user's words arrive as one block shortly after they stop speaking; Gemini Live does not stream them word by word), `speech` with `state: "start"|"end"` (server-side voice activity), `turn_complete`, `interrupted`, or `error`.

## Update the policy

```bash
python scripts/ingest.py path/to/policy.pdf
git add data/embeddings.npz
git commit -m "Update policy index"
git push
```

Changing the embedding model requires re-ingestion even if vector dimensions match. The legacy committed index has no model metadata; keep its known original `gemini-embedding-001` model. New indices record their model and use string arrays. Extraction handles PDF text only, without OCR or faithful table reconstruction.

## Local development and tests

```bash
pip install -r requirements-dev.txt
python -m pytest -q
node --check app/static/widget.js
node --check app/static/audio-worklet.js
node tests/test_audio.cjs
API_BASE_URL=http://localhost:8000 node scripts/build_frontend.js
python -m uvicorn app.main:app --port 8000
# In a second terminal:
python -m http.server 3000 --directory dist
```

Tests cover the existing corpus, SSE completion/failures, bounded input/history, readiness, removed storage routes, origin restrictions, PCM relay, transcripts, provider API call shapes and cleanup. No secrets are needed for offline tests.

## Speed and reliability limits

- Gemini Live streams audio without separate speech recognition and TTS requests. The full policy context incurs input/context costs on each new session. No paid latency target is claimed before measurement with your key and hosting.
- Render Free can sleep after 15 minutes without inbound traffic, causing cold starts. Self-pinging has been removed. Use an always-running paid instance for predictable availability; this repository deliberately keeps the existing free blueprint until you choose to upgrade.
- The widget warms readiness and bounds connection/request waits. It does not silently replay partially generated answers or recordings after disconnects.
- Rate limiting and voice caps are process-local and reset on restart. Use an external limiter or gateway when scaling to multiple instances. CORS/origin checks are not authentication and do not prevent non-browser callers from using a public endpoint.
- Voice sessions are capped at five minutes and need to be reopened after disconnect/expiry. Audio is not retained for automatic reconnection.

References: [Gemini Live](https://ai.google.dev/gemini-api/docs/live-api), [model catalog](https://ai.google.dev/gemini-api/docs/models), [Google AI plans vs API usage](https://ai.google.dev/gemini-api/docs/google-ai-plans), [Render Free limits](https://render.com/docs/free).
