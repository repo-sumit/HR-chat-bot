(function () {
  "use strict";

  /* ── Configuration ─────────────────────────────────────────────── */
  var script = document.currentScript;
  var API = script?.getAttribute("data-api-url") || "__API_BASE_URL__";
  var BOT = script?.getAttribute("data-bot-name") || "__BOT_NAME__";
  var GREETING = script?.getAttribute("data-greeting") || "__BOT_GREETING__";
  var ACCENT = script?.getAttribute("data-accent-color") || "#2D2B7F";
  var POS = script?.getAttribute("data-position") || "bottom-right";

  /* Voice timing: tweak these to change how hands-free it feels. */
  var NO_SPEECH_MS = 8000;     // nothing said after tapping the mic: end by itself
  var FOLLOW_UP_MS = 6000;     // quiet time after an answer before voice ends by itself (0-ish = one question per tap)
  var PREBUFFER_FRAMES = 25;   // 100 ms each: speech said before the connection is ready is kept, not lost
  var IDLE_HINT = "Ask about a policy or tap the mic…";

  /* ── Inject scoped CSS ─────────────────────────────────────────── */
  var TEAL = "#5BC5C8";
  var css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    .psb-wrap{font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;z-index:2147483647}
    .psb-bubble{position:fixed;${POS==="bottom-left"?"left":"right"}:20px;bottom:20px;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,${ACCENT},#3d3ba0);color:#fff;border:none;cursor:pointer;box-shadow:0 4px 18px rgba(45,43,127,.35);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;z-index:2147483647}
    .psb-bubble:hover{transform:scale(1.1);box-shadow:0 6px 24px rgba(45,43,127,.45)}
    .psb-bubble svg{width:26px;height:26px;fill:#fff}
    .psb-pulse{animation:psb-pulse 2s ease-in-out 3}
    @keyframes psb-pulse{0%,100%{box-shadow:0 4px 18px rgba(45,43,127,.35)}50%{box-shadow:0 0 0 14px rgba(91,197,200,.25),0 4px 18px rgba(45,43,127,.35)}}
    .psb-window{position:fixed;${POS==="bottom-left"?"left":"right"}:20px;bottom:90px;width:388px;height:540px;background:#f7f8fc;border-radius:18px;box-shadow:0 10px 40px rgba(45,43,127,.18);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(20px) scale(.95);transition:opacity .25s,transform .25s;pointer-events:none;z-index:2147483647}
    .psb-window.psb-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
    .psb-header{background:linear-gradient(135deg,${ACCENT} 0%,#3d3ba0 100%);color:#fff;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
    .psb-header span{font-weight:600;font-size:15px;letter-spacing:-0.2px}
    .psb-close{background:rgba(255,255,255,.15);border:none;color:#fff;cursor:pointer;font-size:18px;padding:2px 8px;line-height:1;border-radius:8px;opacity:.9;transition:background .15s}
    .psb-close:hover{background:rgba(255,255,255,.25);opacity:1}
    .psb-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f7f8fc}
    .psb-msg{max-width:85%;padding:10px 14px;border-radius:14px;word-wrap:break-word;font-size:13.5px}
    .psb-msg a{color:inherit;text-decoration:underline}
    .psb-user{white-space:pre-wrap}
    .psb-bot{background:#fff;color:#1a1a1a;align-self:flex-start;border-bottom-left-radius:4px;box-shadow:0 1px 4px rgba(45,43,127,.06);border:1px solid #ececf4}
    .psb-bot strong{color:${ACCENT};font-weight:600}
    .psb-bot ul,.psb-bot ol{margin:6px 0;padding-left:18px}
    .psb-bot li{margin:3px 0}
    .psb-bot p{margin:4px 0}
    .psb-bot h1,.psb-bot h2,.psb-bot h3{color:${ACCENT};font-weight:600;margin:8px 0 4px}
    .psb-bot h1{font-size:16px} .psb-bot h2{font-size:15px} .psb-bot h3{font-size:14px}
    .psb-user{background:${ACCENT};color:#fff;align-self:flex-end;border-bottom-right-radius:4px;box-shadow:0 2px 8px rgba(45,43,127,.15)}
    .psb-note{align-self:center;font-size:12px;color:#9ca3af;text-align:center;padding:0 8px}
    .psb-typing{align-self:flex-start;display:flex;gap:5px;padding:10px 14px;background:#fff;border-radius:14px;border-bottom-left-radius:4px;border:1px solid #ececf4}
    .psb-dot{width:8px;height:8px;background:#c5c5d6;border-radius:50%;animation:psb-bounce .6s infinite alternate}
    .psb-dot:nth-child(2){animation-delay:.15s}
    .psb-dot:nth-child(3){animation-delay:.3s}
    @keyframes psb-bounce{to{transform:translateY(-6px);background:${TEAL}}}
    /* Listening bubble: bars follow the real microphone level (--lvl is 0..1, set from JS). */
    .psb-live{display:flex;align-items:center;justify-content:center;gap:3px;min-width:68px;min-height:20px}
    .psb-live i{display:block;width:3px;border-radius:2px;background:#fff;opacity:.92;height:calc(5px + var(--lvl,0) * 14px * var(--k,1));transition:height .1s linear}
    .psb-live i:nth-child(1){--k:.55} .psb-live i:nth-child(2){--k:.85} .psb-live i:nth-child(3){--k:1} .psb-live i:nth-child(4){--k:.8} .psb-live i:nth-child(5){--k:.5}
    .psb-input-bar{display:flex;padding:12px 14px 6px;border-top:1px solid #ececf4;gap:8px;flex-shrink:0;background:#fff;align-items:flex-end}
    .psb-input{min-width:0;flex:1;box-sizing:border-box;min-height:42px;border:1px solid #dddde8;border-radius:21px;padding:9px 16px;font-size:14px;outline:none;resize:none;font-family:'Inter',system-ui,sans-serif;max-height:80px;background:#f7f8fc;transition:border-color .2s,background .2s}
    .psb-input:focus{border-color:${TEAL};background:#fff}
    .psb-window[data-voice] .psb-input::placeholder{color:${ACCENT};opacity:.75}
    /* One button: mic (empty box) → send (text typed) → stop (voice or answer running). */
    .psb-action{position:relative;flex-shrink:0;width:42px;height:42px;border:none;border-radius:50%;background:${ACCENT};color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:background .15s,transform .1s}
    .psb-action:hover{background:#3d3ba0}
    .psb-action:active{transform:scale(.94)}
    .psb-action svg{width:20px;height:20px;fill:currentColor;display:none}
    .psb-action[data-mode=mic] .psb-i-mic,.psb-action[data-mode=send] .psb-i-send,.psb-action[data-mode=stop] .psb-i-stop{display:block}
    .psb-action::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid ${TEAL};opacity:0;pointer-events:none;transition:transform .12s linear,opacity .2s}
    .psb-window[data-voice=connecting] .psb-action::after,.psb-window[data-voice=listening] .psb-action::after{opacity:.9;transform:scale(calc(1 + var(--lvl,0) * .4))}
    .psb-window[data-voice=thinking] .psb-action::after{opacity:.5;animation:psb-breathe 1s ease-in-out infinite}
    .psb-window[data-voice=speaking] .psb-action::after{opacity:.9;animation:psb-breathe 1.4s ease-in-out infinite}
    @keyframes psb-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
    .psb-action:focus-visible,.psb-close:focus-visible{outline:3px solid ${TEAL};outline-offset:3px}
    .psb-footer{text-align:center;font-size:11px;color:#9ca3af;padding:6px 0 10px;flex-shrink:0;background:#fff}
    .psb-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
    @media(prefers-reduced-motion:reduce){.psb-window .psb-action::after,.psb-dot{animation:none}}
    @media(max-width:480px){
      .psb-window{width:100vw;height:100dvh;bottom:0;${POS==="bottom-left"?"left":"right"}:0;border-radius:0}
      .psb-bubble{bottom:12px;${POS==="bottom-left"?"left":"right"}:12px}
      .psb-bubble.psb-hidden{display:none}
    }
  `;
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var ICONS = '<svg class="psb-i-mic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>' +
    '<svg class="psb-i-send" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>' +
    '<svg class="psb-i-stop" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>';
  var wrap = document.createElement('div'); wrap.className = 'psb-wrap';
  var bubble = document.createElement('button'); bubble.className = 'psb-bubble';
  bubble.textContent = 'Chat'; bubble.setAttribute('aria-label', 'Open HR policy chat');
  var win = document.createElement('div'); win.className = 'psb-window';
  win.inert = true; win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', BOT); win.setAttribute('aria-hidden', 'true');
  win.innerHTML = '<div class="psb-header"><span>' + esc(BOT) + '</span><button class="psb-close" aria-label="Close chat">×</button></div>' +
    '<div class="psb-messages" role="log" aria-live="polite" aria-relevant="additions"></div>' +
    '<div class="psb-input-bar"><textarea class="psb-input" aria-label="Your policy question" placeholder="' + IDLE_HINT + '" rows="1" maxlength="4000"></textarea>' +
    '<button class="psb-action" type="button" data-mode="mic" aria-label="Talk to the assistant">' + ICONS + '</button></div>' +
    '<span class="psb-sr" role="status" aria-live="polite"></span>' +
    '<div class="psb-footer">Chats stay in this page. Audio is processed by Gemini.</div>';
  wrap.append(win, bubble); document.body.appendChild(wrap);
  var msgArea = win.querySelector('.psb-messages'), input = win.querySelector('.psb-input');
  var actionBtn = win.querySelector('.psb-action'), closeBtn = win.querySelector('.psb-close'), srStatus = win.querySelector('.psb-sr');
  var isOpen = false, isBusy = false, history = [], controller = null;          // isBusy: a typed question is being answered
  var ws = null, voiceConnecting = false, voiceReady = false, voiceEpoch = 0, voiceState = '', voiceTurns = 0;
  var mic = null, micSource = null, captureNode = null, captureContext = null, playbackContext = null;
  var audioQueue = new Set(), playbackAt = 0, preBuffer = [], turnDone = false, speechOpen = false, level = 0;
  var pingTimer = null, connectTimer = null, slowTimer = null, idleTimer = null, lastHeardAt = 0;
  var transcriptNodes = {}, transcriptText = {}, liveBubble = null, typingNode = null;
  addMsg(GREETING, 'bot');

  /* ── One-button UI ─────────────────────────────────────────────── */
  function render() {
    var voiceOn = !!ws || voiceConnecting;
    var mode = voiceOn || isBusy ? 'stop' : input.value.trim() ? 'send' : 'mic';
    actionBtn.setAttribute('data-mode', mode);
    actionBtn.setAttribute('aria-label', voiceOn ? 'Stop voice' : isBusy ? 'Stop answer' : mode === 'send' ? 'Send message' : 'Talk to the assistant');
  }
  function setVoice(state, text) {
    voiceState = state;
    if (state) win.setAttribute('data-voice', state); else win.removeAttribute('data-voice');
    input.placeholder = text || IDLE_HINT; srStatus.textContent = text || '';
    render();
  }
  function setBusy(value) { isBusy = value; render(); }

  async function warmUp() {
    if (!ws && !voiceConnecting) input.placeholder = 'Waking up the assistant…';
    var ok = false;
    try {
      var response = await fetch(API + '/readyz', {signal: AbortSignal.timeout(65000)});
      ok = response.ok;
    } catch (err) { ok = false; }
    if (!ws && !voiceConnecting) input.placeholder = ok ? IDLE_HINT : 'Assistant is starting… try again shortly';
    return ok;
  }
  warmUp();
  bubble.onclick = function () {
    isOpen = !isOpen; win.inert = !isOpen; win.classList.toggle('psb-open', isOpen); win.setAttribute('aria-hidden', String(!isOpen));
    bubble.classList.toggle('psb-hidden', isOpen && window.innerWidth <= 480);
    if (isOpen) { warmUp(); input.focus(); }
    else stopAll();
  };
  closeBtn.onclick = function () {
    stopAll(); isOpen = false; win.inert = true; win.classList.remove('psb-open'); win.setAttribute('aria-hidden', 'true');
    bubble.classList.remove('psb-hidden'); bubble.focus();
  };
  win.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeBtn.click(); });
  actionBtn.onclick = function () {
    if (ws || voiceConnecting) stopVoice();
    else if (isBusy) { if (controller) controller.abort(); }
    else if (input.value.trim()) send();
    else startVoice();
  };
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  input.addEventListener('input', function() {
    this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 80) + 'px';
    if (ws || voiceConnecting) stopVoice();   // typing means "let me type": hand the box back
    render();
  });

  /* ── Typed chat ────────────────────────────────────────────────── */
  async function send() {
    var text = input.value.trim(); if (!text || isBusy) return;
    if (ws || voiceConnecting) stopVoice();
    var prior = history.slice(-6); addMsg(text, 'user'); input.value = ''; input.style.height = 'auto';
    setBusy(true);
    var typing = showTyping(), botDiv = null, fullText = '', completed = false, timedOut = false;
    var ownController = new AbortController(); controller = ownController;
    var timer = setTimeout(function() { timedOut = true; ownController.abort(); }, 90000);
    var reader;
    try {
      var res = await fetch(API + '/api/chat', {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:text,history:prior}), signal:ownController.signal});
      if (!res.ok) { var d = await res.json(); throw new Error(d.error || 'Request failed (' + res.status + ')'); }
      reader = res.body.getReader(); var decoder = new TextDecoder(), buffer = '';
      while (!completed) {
        var packet = await reader.read();
        buffer += packet.done ? decoder.decode() : decoder.decode(packet.value,{stream:true});
        var frames = buffer.replace(/\r\n/g,'\n').split('\n\n'); buffer = frames.pop();
        for (var frame of frames) {
          var lines = frame.split('\n').filter(function(line) { return line.startsWith('data:'); });
          if (!lines.length) continue;
          var event = JSON.parse(lines.map(function(line) { return line.slice(5).trimStart(); }).join('\n'));
          if (event.error) throw new Error(event.error);
          if (event.token) {
            if (!botDiv) { removeEl(typing); typing = null; botDiv = addMsg('', 'bot'); }
            fullText += event.token; botDiv.innerHTML = renderMarkdown(fullText); msgArea.scrollTop = msgArea.scrollHeight;
          }
          if (event.done) { completed = true; break; }
        }
        if (packet.done && !completed) throw new Error('The response was interrupted. Please try again.');
      }
      if (!fullText.trim()) throw new Error('No answer received. Please try again.');
      history = prior.concat([{role:'user',content:text},{role:'assistant',content:fullText.slice(0,8000)}]).slice(-6);
    } catch (err) {
      if (botDiv) { var incomplete = document.createElement('div'); incomplete.textContent = 'Incomplete response'; botDiv.appendChild(incomplete); }
      if (err.name !== 'AbortError') errorMsg(friendlyNetworkError(err));
      else if (timedOut) errorMsg('The answer took too long. Please try again.');
    } finally {
      clearTimeout(timer); if (reader) { try { await reader.cancel(); } catch (_) {} }
      removeEl(typing); if (controller === ownController) { controller = null; setBusy(false); }
    }
  }

  /* ── Voice: tap once, talk, it answers, listens briefly for a follow-up, then ends by itself ── */
  function stopPlayback() {
    audioQueue.forEach(function(source) { try { source.stop(); } catch (_) {} }); audioQueue.clear();
    playbackAt = playbackContext ? playbackContext.currentTime : 0;
  }
  function stopVoice(noteText) {
    var wasOn = !!ws || voiceConnecting;
    voiceEpoch++; voiceConnecting = false; voiceReady = false;
    clearInterval(pingTimer); clearTimeout(connectTimer); clearTimeout(slowTimer); clearTimeout(idleTimer);
    pingTimer = connectTimer = slowTimer = idleTimer = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; try { ws.close(); } catch (_) {} ws = null; }
    if (captureNode) { captureNode.port.onmessage = null; captureNode.disconnect(); captureNode = null; }
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (mic) { mic.getTracks().forEach(function(t) {t.stop();}); mic = null; }
    if (captureContext) { captureContext.close().catch(function(){}); captureContext = null; }
    stopPlayback();
    if (playbackContext) { playbackContext.close().catch(function(){}); playbackContext = null; }
    playbackAt = 0;   // each session has its own audio clock; a stale value makes the next session's audio late or "overloaded"
    finishTranscript(); removeTyping(); dropLive();
    preBuffer = []; turnDone = false; speechOpen = false; level = 0; win.style.removeProperty('--lvl');
    setVoice('');
    if (wasOn && noteText) note(noteText);
  }
  function stopAll() { if (controller) controller.abort(); stopVoice(); }

  async function startVoice() {
    if (isBusy || voiceConnecting || ws) return;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.AudioWorkletNode) {
      errorMsg('Voice needs HTTPS and a browser with microphone support. You can still type.'); return;
    }
    var epoch = ++voiceEpoch; voiceConnecting = true; voiceReady = false; voiceTurns = 0; turnDone = false; preBuffer = [];
    setVoice('connecting', 'Getting ready…');
    try {
      // Create and resume audio inside the click gesture, as browser autoplay policies require.
      var Ctx = window.AudioContext || window.webkitAudioContext;
      playbackContext = new Ctx(); captureContext = new Ctx();
      playbackContext.resume(); captureContext.resume();
      var stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if (epoch !== voiceEpoch) { stream.getTracks().forEach(function(t){t.stop();}); return; }
      mic = stream;
      // Connect to the server while the audio worklet loads; speech said before "ready" is buffered, not lost.
      openSocket(epoch);
      await captureContext.audioWorklet.addModule(API + '/audio-worklet.js');
      if (epoch !== voiceEpoch) return;
      await captureContext.resume();
      if (epoch !== voiceEpoch) return;
      micSource = captureContext.createMediaStreamSource(mic);
      captureNode = new AudioWorkletNode(captureContext, 'policy-pcm');
      captureNode.port.onmessage = onMicFrame;
      micSource.connect(captureNode); captureNode.connect(captureContext.destination);
    } catch (err) {
      if (epoch === voiceEpoch) { errorMsg(err.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in browser settings, or type your question.' : err.message); stopVoice(); }
    }
  }
  function openSocket(epoch) {
    var url = new URL(API + '/api/voice'); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(url);
    ws.onopen = function() { ws.send(JSON.stringify({type:'start',history:history.slice(-6)})); };
    ws.onmessage = onVoiceMessage;
    ws.onerror = function() { errorMsg('Cannot connect to voice. Check the server and Gemini Live access.'); stopVoice(); };
    ws.onclose = function() {
      if (!voiceReady) { errorMsg('Voice is unavailable or busy right now. You can still type your question.'); stopVoice(); }
      else stopVoice('Voice ended. Tap the mic to talk again.');
    };
    slowTimer = setTimeout(function() { if (epoch === voiceEpoch && voiceConnecting) setVoice('connecting', 'Still connecting… the server may be waking up'); }, 3500);
    connectTimer = setTimeout(function() { if (epoch === voiceEpoch && voiceConnecting) { errorMsg('Voice connection timed out. Please try again.'); stopVoice(); } }, 40000);
  }

  function onMicFrame(e) {
    var pcm = new Int16Array(e.data), sum = 0;
    for (var i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
    level = Math.max(Math.min(1, Math.sqrt(sum / pcm.length) / 32768 * 9), level * 0.65);
    win.style.setProperty('--lvl', level.toFixed(2));          // drives the ring and the listening bars
    if (!ws) return;
    if (!voiceReady) { preBuffer.push(e.data); if (preBuffer.length > PREBUFFER_FRAMES) preBuffer.shift(); return; }
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 262144) { errorMsg('Voice connection is too slow. Please reconnect.'); stopVoice(); return; }
    sendPCM(new Uint8Array(e.data));
  }
  function sendPCM(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    ws.send(JSON.stringify({type:'audio',data:btoa(binary)}));
  }
  function flushPreBuffer() {
    // Merge buffered 100 ms frames into <=0.5 s messages so the server's frame-rate limit is respected.
    for (var i = 0; i < preBuffer.length; i += 5) {
      var group = preBuffer.slice(i, i + 5), bytes = new Uint8Array(group.length * 3200);
      group.forEach(function(frame, j) { bytes.set(new Uint8Array(frame), j * 3200); });
      sendPCM(bytes);
    }
    preBuffer = [];
  }

  function onVoiceMessage(e) {
    var data;
    try { data = JSON.parse(e.data); } catch (_) { return; }
    try {
      if (data.type === 'ready') {
        clearTimeout(connectTimer); clearTimeout(slowTimer); voiceConnecting = false; voiceReady = true;
        pingTimer = setInterval(function(){ if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'ping'})); }, 10000);
        flushPreBuffer(); showLive(); setVoice('listening', 'Listening… go ahead'); armIdle(NO_SPEECH_MS);
      } else if (data.type === 'speech') {
        if (data.state === 'start') {
          speechOpen = true; turnDone = false; heardUser(); showLive(); setVoice('listening', 'Listening…');
        } else {
          speechOpen = false; heardUser();
          if (voiceState !== 'speaking') { if (!typingNode) typingNode = showTyping(); setVoice('thinking', 'Thinking…'); }
        }
      } else if (data.type === 'audio') {
        removeTyping(); turnDone = false; clearTimeout(idleTimer); idleTimer = null;   // more audio arrived: not idle
        if (voiceState !== 'speaking') setVoice('speaking', 'Speaking… talk to interrupt');
        playPCM(data);
      } else if (data.type === 'transcript') {
        var role = data.role === 'assistant' ? 'assistant' : 'user';
        if (role === 'user') {
          heardUser();
          if (!transcriptNodes.user) {
            var node = liveBubble || addMsg('', 'user'); liveBubble = null;
            if (transcriptNodes.assistant) msgArea.insertBefore(node, transcriptNodes.assistant);   // keep question above answer
            node.classList.remove('psb-live'); node.textContent = ''; transcriptNodes.user = node;
          }
        } else {
          removeTyping();
          if (!transcriptNodes.assistant) transcriptNodes.assistant = addMsg('', 'bot');
        }
        transcriptText[role] = (transcriptText[role] || '') + String(data.text).replace(/\*/g, '');   // spoken text never needs markdown
        transcriptNodes[role].textContent = transcriptText[role].trim(); msgArea.scrollTop = msgArea.scrollHeight;
      } else if (data.type === 'interrupted') {
        stopPlayback(); removeTyping(); finishTranscript(); turnDone = false; heardUser(); setVoice('listening', 'Listening…');
      } else if (data.type === 'turn_complete') {
        removeTyping();
        if (!speechOpen && liveBubble && !transcriptText.user) dropLive();     // heard noise, no words
        if (transcriptText.assistant) voiceTurns++;
        finishTranscript(); turnDone = true; maybeFollowUp();
      } else if (data.type === 'error') { errorMsg(data.error); stopVoice(); }
    } catch (err) { errorMsg('Voice playback failed. You can continue by typing.'); stopVoice(); }
  }

  /* Auto-end: server speech events cancel the timer; it is re-armed after each finished answer. */
  function heardUser() { lastHeardAt = Date.now(); clearTimeout(idleTimer); idleTimer = null; }
  function armIdle(ms) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() {
      idleTimer = null; if (!ws) return;
      if (Date.now() - lastHeardAt < 1500) return armIdle(1500);               // someone just spoke: give it a moment
      stopVoice(voiceTurns ? 'Tap the mic to ask another question.' : 'I didn’t hear anything. Tap the mic to try again.');
    }, ms);
  }
  function maybeFollowUp() {
    // Playback drained after the bot spoke (or the turn ended): the server's turn_complete can lag the audio, so don't wait for it.
    if (ws && voiceReady && !audioQueue.size && !speechOpen && (turnDone || voiceState === 'speaking')) {
      setVoice('listening', 'Anything else? I’m listening'); armIdle(FOLLOW_UP_MS);
    }
  }

  function showLive() {
    if (liveBubble || transcriptNodes.user) return;
    liveBubble = addMsg('', 'user'); liveBubble.classList.add('psb-live'); liveBubble.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
  }
  function dropLive() { removeEl(liveBubble); liveBubble = null; }
  function removeTyping() { removeEl(typingNode); typingNode = null; }
  function finishTranscript() {
    ['user','assistant'].forEach(function(role) { if (transcriptText[role]) history.push({role:role,content:transcriptText[role].trim().slice(0,8000)}); });
    history = history.slice(-6); transcriptNodes = {}; transcriptText = {};
  }
  function playPCM(data) {
    if (!playbackContext) return;
    var rateMatch = /rate=(\d+)/.exec(data.mime_type || ''); var rate = rateMatch ? Number(rateMatch[1]) : 24000;
    var binary = atob(data.data), bytes = new Uint8Array(binary.length);
    for (var i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length % 2) throw new Error('Invalid audio');
    var view = new DataView(bytes.buffer), audio = playbackContext.createBuffer(1, bytes.length / 2, rate), values = audio.getChannelData(0);
    for (var j=0;j<values.length;j++) values[j] = view.getInt16(j*2,true) / 32768;
    var source = playbackContext.createBufferSource(); source.buffer = audio; source.connect(playbackContext.destination);
    playbackAt = Math.max(playbackContext.currentTime + .02, playbackAt);
    if (playbackAt - playbackContext.currentTime > 20) throw new Error('Audio queue overloaded');
    audioQueue.add(source);
    // Grace period: audio arrives in bursts and the queue can run dry between chunks mid-answer.
    source.onended = function() { audioQueue.delete(source); source.disconnect(); if (!audioQueue.size) setTimeout(maybeFollowUp, 500); };
    source.start(playbackAt); playbackAt += audio.duration;
  }
  window.addEventListener('pagehide', stopAll);
  document.addEventListener('visibilitychange', function(){ if (document.hidden) stopAll(); });

  /* ── Markdown renderer (lightweight) ────────────────────────────── */
  function renderMarkdown(text) {
    var html = esc(text);
    // Headers: ###, ##, #
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    // Unordered list items: * item or - item
    html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    // Line breaks for remaining lines (but not inside block elements)
    html = html.replace(/\n/g, '<br>');
    // Clean up <br> after block elements
    html = html.replace(/<\/(h[1-3]|ul|li)><br>/g, '</$1>');
    html = html.replace(/<br><(h[1-3]|ul)/g, '<$1');
    return html;
  }

  /* ── Helpers ───────────────────────────────────────────────────── */
  function addMsg(text, role) {
    var div = document.createElement("div");
    div.className = "psb-msg " + (role === "bot" ? "psb-bot" : "psb-user");
    if (role === "bot") {
      div.innerHTML = renderMarkdown(text);
    } else {
      div.textContent = text;
    }
    msgArea.appendChild(div);
    msgArea.scrollTop = msgArea.scrollHeight;
    return div;
  }

  function showTyping() {
    var div = document.createElement("div");
    div.className = "psb-typing";
    div.innerHTML = '<div class="psb-dot"></div><div class="psb-dot"></div><div class="psb-dot"></div>';
    msgArea.appendChild(div);
    msgArea.scrollTop = msgArea.scrollHeight;
    return div;
  }

  function note(text) {
    var div = document.createElement("div");
    div.className = "psb-note";
    div.textContent = text;
    msgArea.appendChild(div);
    msgArea.scrollTop = msgArea.scrollHeight;
  }

  function removeEl(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  function errorMsg(msg) {
    var div = addMsg("Sorry, something went wrong: " + msg, "bot");
    div.style.color = "#ef4444";
  }

  function friendlyNetworkError(err) {
    var msg = (err && err.message) ? err.message.toLowerCase() : "";
    if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed"))
      return "Cannot reach the server. It may be starting up — please try again in 30 seconds.";
    if (msg.includes("timeout"))
      return "Request timed out. Please try again.";
    return err.message || "Something went wrong. Please try again.";
  }

  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
})();
