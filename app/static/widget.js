(function () {
  "use strict";

  /* ── Configuration ─────────────────────────────────────────────── */
  var script = document.currentScript;
  var API = script?.getAttribute("data-api-url") || "__API_BASE_URL__";
  var BOT = script?.getAttribute("data-bot-name") || "__BOT_NAME__";
  var GREETING = script?.getAttribute("data-greeting") || "__BOT_GREETING__";
  var ACCENT = script?.getAttribute("data-accent-color") || "#2D2B7F";
  var POS = script?.getAttribute("data-position") || "bottom-right";

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
    .psb-typing{align-self:flex-start;display:flex;gap:5px;padding:10px 14px;background:#fff;border-radius:14px;border-bottom-left-radius:4px;border:1px solid #ececf4}
    .psb-dot{width:8px;height:8px;background:#c5c5d6;border-radius:50%;animation:psb-bounce .6s infinite alternate}
    .psb-dot:nth-child(2){animation-delay:.15s}
    .psb-dot:nth-child(3){animation-delay:.3s}
    @keyframes psb-bounce{to{transform:translateY(-6px);background:${TEAL}}}
    .psb-input-bar{display:flex;padding:12px 14px;border-top:1px solid #ececf4;gap:6px;flex-shrink:0;background:#fff;align-items:flex-end}
    .psb-input{min-width:0;flex:1;border:1px solid #dddde8;border-radius:12px;padding:9px 14px;font-size:14px;outline:none;resize:none;font-family:'Inter',system-ui,sans-serif;max-height:80px;background:#f7f8fc;transition:border-color .2s,background .2s}
    .psb-input:focus{border-color:${TEAL};background:#fff}
    .psb-send{background:${ACCENT};color:#fff;border:none;border-radius:12px;padding:9px 16px;cursor:pointer;font-size:13px;font-weight:600;flex-shrink:0;letter-spacing:0.2px;transition:background .15s,transform .1s;height:38px}
    .psb-send:hover{background:#3d3ba0}
    .psb-send:active{transform:scale(.97)}
    .psb-send:disabled{opacity:.45;cursor:default;transform:none}
    .psb-footer{text-align:center;font-size:11px;color:#9ca3af;padding:6px 0 10px;flex-shrink:0;background:#fff}
    .psb-sources{font-size:11px;color:${TEAL};margin-top:6px;font-weight:500}
    @media(max-width:480px){
      .psb-window{width:100vw;height:100dvh;bottom:0;${POS==="bottom-left"?"left":"right"}:0;border-radius:0}
      .psb-bubble{bottom:12px;${POS==="bottom-left"?"left":"right"}:12px}
      .psb-bubble.psb-hidden{display:none}
    }
  `;
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var voiceStyle = document.createElement("style");
  voiceStyle.textContent = ".psb-tools{display:flex;align-items:center;gap:8px;padding:9px 14px;background:#fff;border-top:1px solid #ececf4}.psb-tools button{border:1px solid #dddde8;border-radius:8px;background:#fff;padding:6px 10px;color:#2D2B7F;cursor:pointer}.psb-tools button:disabled{opacity:.5;cursor:default}.psb-status{font-size:12px;color:#666;flex:1}.psb-tools button:focus-visible,.psb-send:focus-visible,.psb-close:focus-visible{outline:3px solid #5BC5C8;outline-offset:2px}";
  document.head.appendChild(voiceStyle);
  var wrap = document.createElement('div'); wrap.className = 'psb-wrap';
  var bubble = document.createElement('button'); bubble.className = 'psb-bubble';
  bubble.textContent = 'Chat'; bubble.setAttribute('aria-label', 'Open HR policy chat');
  var win = document.createElement('div'); win.className = 'psb-window';
  win.inert = true; win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', BOT); win.setAttribute('aria-hidden', 'true');
  win.innerHTML = '<div class="psb-header"><span>' + esc(BOT) + '</span><button class="psb-close" aria-label="Close chat">×</button></div>' +
    '<div class="psb-messages" role="log" aria-live="polite" aria-relevant="additions"></div>' +
    '<div class="psb-tools"><button class="psb-talk">Talk</button><button class="psb-mute" hidden>Mute</button><button class="psb-stop" disabled>Stop</button><span class="psb-status" role="status">Type or talk</span></div>' +
    '<div class="psb-input-bar"><textarea class="psb-input" aria-label="Your policy question" placeholder="Ask about a policy…" rows="1" maxlength="4000"></textarea><button class="psb-send">Ask</button></div>' +
    '<div class="psb-footer">Chats stay in this page. Audio is processed by Gemini.</div>';
  wrap.append(win, bubble); document.body.appendChild(wrap);
  var msgArea = win.querySelector('.psb-messages'), input = win.querySelector('.psb-input');
  var sendBtn = win.querySelector('.psb-send'), closeBtn = win.querySelector('.psb-close');
  var talkBtn = win.querySelector('.psb-talk'), muteBtn = win.querySelector('.psb-mute');
  var stopBtn = win.querySelector('.psb-stop'), status = win.querySelector('.psb-status');
  var isOpen = false, isBusy = false, history = [], controller = null;
  var ws = null, mic = null, captureContext = null, playbackContext = null, captureNode = null;
  var micSource = null, audioQueue = new Set(), playbackAt = 0, muted = false;
  var voiceConnecting = false, voiceEpoch = 0, pingTimer = null, connectTimer = null;
  var transcriptNodes = {}, transcriptText = {}, lastAudioAt = 0;
  addMsg(GREETING, 'bot');

  function busy(value) {
    isBusy = value; sendBtn.disabled = value || !!ws || voiceConnecting;
    talkBtn.disabled = value || voiceConnecting;
    input.disabled = !!ws || voiceConnecting;
    stopBtn.disabled = !value && !ws && !voiceConnecting;
  }
  async function warmUp() {
    try {
      var response = await fetch(API + '/readyz', {signal: AbortSignal.timeout(65000)});
      if (!response.ok) throw new Error('Bot is not ready. Check Gemini settings or wait for the server to start.');
      return true;
    } catch (err) { if (!isBusy && !ws) status.textContent = 'Server starting or unavailable'; return false; }
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
  sendBtn.onclick = send;
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  input.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight,80) + 'px'; });
  stopBtn.onclick = stopAll;
  talkBtn.onclick = function() { if (ws) stopVoice(); else startVoice(); };
  muteBtn.onclick = function() {
    muted = !muted;
    if (mic) mic.getAudioTracks().forEach(function(track) { track.enabled = !muted; });
    if (muted && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'end_audio'}));
    muteBtn.textContent = muted ? 'Unmute' : 'Mute'; muteBtn.setAttribute('aria-pressed', String(muted));
    status.textContent = muted ? 'Microphone muted' : 'Listening';
  };

  async function send() {
    var text = input.value.trim(); if (!text || isBusy || ws || voiceConnecting) return;
    var prior = history.slice(-6); addMsg(text, 'user'); input.value = ''; input.style.height = 'auto';
    busy(true); status.textContent = 'Thinking…';
    var typing = showTyping(), botDiv = null, fullText = '', completed = false;
    var ownController = new AbortController(); controller = ownController;
    var timer = setTimeout(function() { ownController.abort(); }, 90000);
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
      status.textContent = 'Ready';
    } catch (err) {
      if (botDiv) { var note = document.createElement('div'); note.textContent = 'Incomplete response'; botDiv.appendChild(note); }
      if (err.name !== 'AbortError') errorMsg(err.message);
      status.textContent = err.name === 'AbortError' ? 'Stopped or timed out' : 'Could not answer';
    } finally {
      clearTimeout(timer); if (reader) { try { await reader.cancel(); } catch (_) {} }
      removeEl(typing); if (controller === ownController) { controller = null; busy(false); }
    }
  }

  function stopPlayback() {
    audioQueue.forEach(function(source) { try { source.stop(); } catch (_) {} }); audioQueue.clear();
    playbackAt = playbackContext ? playbackContext.currentTime : 0;
  }
  function stopVoice() {
    voiceEpoch++; voiceConnecting = false;
    clearInterval(pingTimer); clearTimeout(connectTimer); pingTimer = connectTimer = null;
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    if (captureNode) { captureNode.disconnect(); captureNode = null; }
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (mic) { mic.getTracks().forEach(function(t) {t.stop();}); mic = null; }
    if (captureContext) { captureContext.close().catch(function(){}); captureContext = null; }
    stopPlayback();
    if (playbackContext) { playbackContext.close().catch(function(){}); playbackContext = null; }
    transcriptNodes = {}; transcriptText = {}; muted = false; muteBtn.hidden = true;
    talkBtn.textContent = 'Talk'; status.textContent = 'Voice ended'; busy(!!controller);
  }
  function stopAll() { if (controller) controller.abort(); stopVoice(); }

  async function startVoice() {
    if (isBusy || voiceConnecting) return;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.AudioWorkletNode) {
      errorMsg('Voice needs HTTPS and a browser with microphone support. You can still type.'); return;
    }
    voiceConnecting = true; var epoch = ++voiceEpoch; busy(false); status.textContent = 'Starting voice…';
    try {
      // Initialize output on the click gesture for browser autoplay policies.
      playbackContext = new (window.AudioContext || window.webkitAudioContext)(); await playbackContext.resume();
      var stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if (epoch !== voiceEpoch) { stream.getTracks().forEach(function(t){t.stop();}); return; }
      mic = stream;
      if (!await warmUp()) throw new Error('Bot is unavailable. Wait for Render to start, or check Gemini configuration.');
      if (epoch !== voiceEpoch) return;
      captureContext = new (window.AudioContext || window.webkitAudioContext)();
      await captureContext.audioWorklet.addModule(API + '/audio-worklet.js');
      if (epoch !== voiceEpoch) return;
      await captureContext.resume();
      micSource = captureContext.createMediaStreamSource(mic);
      captureNode = new AudioWorkletNode(captureContext, 'policy-pcm');
      captureNode.port.onmessage = function(e) {
        if (!muted && ws && ws.readyState === WebSocket.OPEN) {
          if (ws.bufferedAmount > 65536) { errorMsg('Voice connection is too slow. Please reconnect.'); stopVoice(); return; }
          var bytes = new Uint8Array(e.data), binary = '';
          for (var i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
          ws.send(JSON.stringify({type:'audio',data:btoa(binary)}));
        }
      };
      var url = new URL(API + '/api/voice'); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(url);
      ws.onopen = function() { if (epoch === voiceEpoch) ws.send(JSON.stringify({type:'start',history:history.slice(-6)})); };
      connectTimer = setTimeout(function(){ if (epoch === voiceEpoch) { errorMsg('Voice connection timed out. Check Gemini Live model access.'); stopVoice(); } }, 25000);
      ws.onmessage = function(e) {
        if (epoch !== voiceEpoch) return;
        try {
          var data = JSON.parse(e.data);
          if (data.type === 'ready') {
            clearTimeout(connectTimer); voiceConnecting = false;
            micSource.connect(captureNode); captureNode.connect(captureContext.destination);
            talkBtn.textContent = 'End'; muteBtn.hidden = false; busy(false); status.textContent = 'Listening';
            pingTimer = setInterval(function(){ if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'ping'})); },10000);
          } else if (data.type === 'audio') {
            playPCM(data); status.textContent = 'Speaking';
          } else if (data.type === 'transcript') {
            var role = data.role;
            if (!transcriptNodes[role]) transcriptNodes[role] = addMsg('', role === 'assistant' ? 'bot' : 'user');
            transcriptText[role] = (transcriptText[role] || '') + data.text;
            transcriptNodes[role].textContent = transcriptText[role]; msgArea.scrollTop = msgArea.scrollHeight;
          } else if (data.type === 'interrupted') {
            stopPlayback(); finishTranscript(); status.textContent = 'Listening';
          } else if (data.type === 'turn_complete') {
            finishTranscript();
            if (!audioQueue.size) status.textContent = muted ? 'Microphone muted' : 'Listening';
          } else if (data.type === 'error') { errorMsg(data.error); stopVoice(); }
        } catch (err) { errorMsg('Voice playback failed. You can continue by typing.'); stopVoice(); }
      };
      ws.onerror = function() { if (epoch === voiceEpoch) { errorMsg('Cannot connect to voice. Check the server and Gemini Live access.'); stopVoice(); } };
      ws.onclose = function() { if (epoch === voiceEpoch) stopVoice(); };
    } catch (err) {
      if (epoch === voiceEpoch) { errorMsg(err.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in browser settings, or type your question.' : err.message); stopVoice(); }
    }
  }
  function finishTranscript() {
    ['user','assistant'].forEach(function(role) { if (transcriptText[role]) history.push({role:role,content:transcriptText[role].slice(0,8000)}); });
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
    source.onended = function() { audioQueue.delete(source); source.disconnect(); if (!audioQueue.size && ws) status.textContent = muted ? 'Microphone muted' : 'Listening'; };
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
