"""Stateless Gemini policy chat. No database or transcript persistence."""
from __future__ import annotations
import asyncio
import base64
import json
import logging
import time
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from google.genai import types
from app import config, rag

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)
_ready = False
_rate_store = {}
_voice_connections = 0


def _is_rate_limited(ip):
    now = time.monotonic()
    for key in list(_rate_store):
        if not _rate_store[key] or now - _rate_store[key][-1] >= 60:
            del _rate_store[key]
    entries = [t for t in _rate_store.get(ip, []) if now - t < 60]
    if len(entries) >= 30 or (ip not in _rate_store and len(_rate_store) >= 10000):
        return True
    entries.append(now)
    _rate_store[ip] = entries
    return False


def _friendly_error(exc):
    code = getattr(exc, 'code', None)
    if code == 429:
        return 'Gemini quota reached. Please try again later.'
    if isinstance(exc, TimeoutError):
        return 'The request timed out. Please try again.'
    if code in (400, 401, 403, 404):
        return 'Gemini configuration or model access needs attention. Please contact the administrator.'
    return 'The service is temporarily unavailable. Please try again.'


@asynccontextmanager
async def lifespan(app):
    global _ready
    try:
        rag.load_embeddings()
        async with asyncio.timeout(config.REQUEST_TIMEOUT_SECONDS):
            await rag.verify_api_key()
        _ready = True
    except Exception as exc:
        # Never log questions, transcripts, API keys or upstream exception bodies.
        log.error('Readiness failed: %s (code=%s). Check key, model access and policy index.', type(exc).__name__, getattr(exc, 'code', None))
        _ready = False
    async def retry_readiness():
        global _ready
        while not _ready:
            await asyncio.sleep(15)
            try:
                rag.load_embeddings()
                async with asyncio.timeout(config.REQUEST_TIMEOUT_SECONDS):
                    await rag.verify_api_key()
                _ready = True
            except Exception as exc:
                log.warning('Readiness retry failed: %s (code=%s)', type(exc).__name__, getattr(exc, 'code', None))
    retry_task = asyncio.create_task(retry_readiness()) if not _ready and config.GEMINI_API_KEY else None
    try:
        yield
    finally:
        if retry_task:
            retry_task.cancel()
            await asyncio.gather(retry_task, return_exceptions=True)
        _ready = False
        await rag.close_client()


app = FastAPI(title='Gemini HR Support Bot', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS, allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])


class Turn(BaseModel):
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[Turn] = Field(default_factory=list, max_length=6)


@app.get('/')
async def health():
    return {'status': 'ok', 'bot_name': config.BOT_NAME, 'ready': _ready}


@app.get('/readyz')
async def readiness():
    return JSONResponse({'ready': _ready}, status_code=200 if _ready else 503)


@app.post('/api/chat')
async def chat(req: ChatRequest, request: Request):
    if _is_rate_limited(request.client.host if request.client else 'unknown'):
        return JSONResponse({'error': 'Too many requests. Please wait a minute.'}, status_code=429)
    if not _ready:
        return JSONResponse({'error': 'Bot is not ready. Ask the administrator to check Gemini settings and the policy index.'}, status_code=503)
    query = req.message.strip()
    if not query:
        return JSONResponse({'error': 'Empty message'}, status_code=400)
    history = [t.model_dump() for t in req.history]

    async def events():
        try:
            async with asyncio.timeout(config.REQUEST_TIMEOUT_SECONDS):
                # Include a bounded follow-up context in retrieval, without treating it as policy.
                prior = [t['content'] for t in history if t['role'] == 'user'][-2:]
                embedding = await rag.embed_query('\n'.join(prior + [query]))
                chunks = rag.retrieve(embedding)
                async for token in rag.generate_response(query, chunks, history):
                    if await request.is_disconnected():
                        return
                    yield 'data: ' + json.dumps({'token': token, 'done': False}) + '\n\n'
                yield 'data: ' + json.dumps({'token': '', 'done': True, 'sources': [{'page': c['page'], 'score': round(c['score'], 3)} for c in chunks]}) + '\n\n'
        except Exception as exc:
            log.warning('Chat failed: %s (code=%s)', type(exc).__name__, getattr(exc, 'code', None))
            yield 'data: ' + json.dumps({'token': '', 'done': True, 'error': _friendly_error(exc)}) + '\n\n'
    return StreamingResponse(events(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache, no-store', 'X-Accel-Buffering': 'no'})


@app.get('/widget.js')
async def widget(request: Request):
    js = (Path(__file__).parent / 'static/widget.js').read_text()
    # JSON literals protect names/greetings containing quotes and line breaks.
    base = str(request.base_url).rstrip('/')
    if request.headers.get('x-forwarded-proto') == 'https':
        base = base.replace('http://', 'https://', 1)
    for key, value in {'__API_BASE_URL__': base, '__BOT_NAME__': config.BOT_NAME, '__BOT_GREETING__': config.BOT_GREETING}.items():
        js = js.replace('"' + key + '"', json.dumps(value))
    return Response(js, media_type='application/javascript', headers={'Cache-Control': 'no-cache'})


@app.websocket('/api/voice')
async def voice(ws: WebSocket):
    global _voice_connections
    origin = ws.headers.get('origin')
    if origin not in config.ALLOWED_ORIGINS and '*' not in config.ALLOWED_ORIGINS:
        await ws.close(code=1008)
        return
    ip = ws.client.host if ws.client else 'unknown'
    if not _ready or _is_rate_limited(ip) or _voice_connections >= config.MAX_VOICE_SESSIONS:
        await ws.close(code=1013)
        return
    _voice_connections += 1
    tasks = []
    try:
        await ws.accept()
        initial = await asyncio.wait_for(ws.receive_text(), timeout=10)
        if len(initial) > 100000:
            raise ValueError('Oversized voice history')
        initial = json.loads(initial)
        if initial.get('type') != 'start':
            raise ValueError('Voice session must begin with start')
        prior = ChatRequest(message='voice', history=initial.get('history', [])).history
        context = rag.voice_context()
        live_config = {
            'response_modalities': ['AUDIO'],
            'system_instruction': rag.SYSTEM_PROMPT + '\nFor voice, speak naturally in short sentences. Never read formatting symbols aloud.\n\nPOLICY_CONTEXT:\n' + context,
            'input_audio_transcription': {}, 'output_audio_transcription': {},
            'speech_config': {'voice_config': {'prebuilt_voice_config': {'voice_name': config.GEMINI_VOICE}}},
        }
        async with asyncio.timeout(config.VOICE_SESSION_SECONDS):
            async with rag.get_client().aio.live.connect(model=config.GEMINI_LIVE_MODEL, config=live_config) as session:
                if prior:
                    await session.send_client_content(turns=[types.Content(role='user' if t.role == 'user' else 'model', parts=[types.Part.from_text(text=t.content)]) for t in prior], turn_complete=False)
                await ws.send_json({'type': 'ready'})

                async def incoming():
                    audio_times = []
                    while True:
                        raw = await asyncio.wait_for(ws.receive_text(), timeout=30)
                        if len(raw) > 24000:
                            raise ValueError('Oversized voice frame')
                        data = json.loads(raw)
                        if data.get('type') == 'audio':
                            now = time.monotonic()
                            audio_times = [t for t in audio_times if now - t < 1]
                            if len(audio_times) >= 25:
                                raise ValueError('Voice frame rate exceeded')
                            audio_times.append(now)
                            audio = base64.b64decode(data.get('data', ''), validate=True)
                            if not audio or len(audio) > 16384 or len(audio) % 2:
                                raise ValueError('Invalid PCM frame')
                            await session.send_realtime_input(audio=types.Blob(data=audio, mime_type='audio/pcm;rate=16000'))
                        elif data.get('type') == 'end_audio':
                            await session.send_realtime_input(audio_stream_end=True)
                        elif data.get('type') == 'ping':
                            continue
                        elif data.get('type') == 'stop':
                            return
                        else:
                            raise ValueError('Unsupported voice frame')

                async def outgoing():
                    while True:
                        async for msg in session.receive():
                            content = msg.server_content
                            if not content:
                                continue
                            if content.interrupted:
                                await ws.send_json({'type': 'interrupted'})
                            if content.input_transcription and content.input_transcription.text:
                                await ws.send_json({'type': 'transcript', 'role': 'user', 'text': content.input_transcription.text})
                            if content.output_transcription and content.output_transcription.text:
                                await ws.send_json({'type': 'transcript', 'role': 'assistant', 'text': content.output_transcription.text})
                            if content.model_turn:
                                for part in content.model_turn.parts:
                                    if part.inline_data and part.inline_data.data:
                                        await ws.send_json({'type': 'audio', 'data': base64.b64encode(part.inline_data.data).decode(), 'mime_type': part.inline_data.mime_type})
                            if content.turn_complete:
                                await ws.send_json({'type': 'turn_complete'})
                tasks = [asyncio.create_task(incoming()), asyncio.create_task(outgoing())]
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.warning('Voice ended: %s (code=%s)', type(exc).__name__, getattr(exc, 'code', None))
        with suppress(Exception):
            await ws.send_json({'type': 'error', 'error': _friendly_error(exc)})
    finally:
        # Release the capacity slot before any await: cancellation during cleanup
        # must not permanently consume a voice slot.
        _voice_connections -= 1
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        with suppress(Exception):
            await ws.close()


@app.get('/audio-worklet.js')
async def audio_worklet():
    return Response((Path(__file__).parent / 'static/audio-worklet.js').read_text(), media_type='application/javascript', headers={'Cache-Control': 'public, max-age=3600'})
