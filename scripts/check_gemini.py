#!/usr/bin/env python3
"""Operator check using the configured key. Small billable API calls; no secrets printed."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from google.genai import types
from app import rag, config

async def main():
    if not config.GEMINI_API_KEY:
        print('FAIL: Set GEMINI_API_KEY in your local .env or Render environment.')
        return 1
    try:
        rag.load_embeddings()
        await rag.verify_api_key()
        print('PASS: policy index, embedding dimension and text model access')
        answer = ''.join([token async for token in rag.generate_response('What is the leave policy?', rag.retrieve(await rag.embed_query('leave policy')))])
        if not answer.strip():
            raise RuntimeError('No generated answer')
        print('PASS: text generation')
        voice_config = {'response_modalities': ['AUDIO'], 'system_instruction': rag.SYSTEM_PROMPT + '\nPOLICY_CONTEXT:\n' + rag.voice_context(), 'input_audio_transcription': {}, 'output_audio_transcription': {}}
        async with rag.get_client().aio.live.connect(model=config.GEMINI_LIVE_MODEL, config=voice_config) as session:
            print('PASS: Gemini Live session setup')
            await session.send_client_content(turns=types.Content(role='user', parts=[types.Part.from_text(text='Say hello briefly.')]), turn_complete=True)
            heard_audio = False
            async for msg in session.receive():
                if msg.data:
                    heard_audio = True
            if not heard_audio:
                raise RuntimeError('Live session returned no audio')
            print('PASS: Gemini Live audio generation')
        return 0
    except Exception as exc:
        print(f'FAIL: {type(exc).__name__}, code={getattr(exc, "code", None)}. Check model IDs, key project billing/quota, network and index compatibility.')
        return 1
    finally:
        await rag.close_client()

async def bounded_check():
    try:
        async with asyncio.timeout(90):
            return await main()
    except TimeoutError:
        print('FAIL: provider check timed out. Check network and model availability.')
        return 1

if __name__ == '__main__':
    sys.exit(asyncio.run(bounded_check()))
