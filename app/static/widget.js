(function () {
  "use strict";

  /* ── Configuration ─────────────────────────────────────────────── */
  var script = document.currentScript;
  var API = script?.getAttribute("data-api-url") || "__API_BASE_URL__";
  var BOT = script?.getAttribute("data-bot-name") || "__BOT_NAME__";
  var GREETING = script?.getAttribute("data-greeting") || "__BOT_GREETING__";
  var ACCENT = script?.getAttribute("data-accent-color") || "#2563eb";
  var POS = script?.getAttribute("data-position") || "bottom-right";

  /* ── Inject scoped CSS ─────────────────────────────────────────── */
  var css = `
    .psb-wrap{font-family:inherit,system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;z-index:2147483647}
    .psb-bubble{position:fixed;${POS==="bottom-left"?"left":"right"}:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:${ACCENT};color:#fff;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;transition:transform .2s;z-index:2147483647}
    .psb-bubble:hover{transform:scale(1.08)}
    .psb-bubble svg{width:26px;height:26px;fill:#fff}
    .psb-pulse{animation:psb-pulse 2s ease-in-out 3}
    @keyframes psb-pulse{0%,100%{box-shadow:0 4px 14px rgba(0,0,0,.25)}50%{box-shadow:0 0 0 12px ${ACCENT}33,0 4px 14px rgba(0,0,0,.25)}}
    .psb-window{position:fixed;${POS==="bottom-left"?"left":"right"}:20px;bottom:88px;width:380px;height:520px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(20px) scale(.95);transition:opacity .25s,transform .25s;pointer-events:none;z-index:2147483647}
    .psb-window.psb-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
    .psb-header{background:${ACCENT};color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
    .psb-header span{font-weight:600;font-size:15px}
    .psb-close{background:none;border:none;color:#fff;cursor:pointer;font-size:20px;padding:0 4px;line-height:1;opacity:.8}
    .psb-close:hover{opacity:1}
    .psb-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
    .psb-msg{max-width:85%;padding:10px 14px;border-radius:14px;word-wrap:break-word;white-space:pre-wrap}
    .psb-msg a{color:inherit;text-decoration:underline}
    .psb-bot{background:#f1f3f5;color:#1a1a1a;align-self:flex-start;border-bottom-left-radius:4px}
    .psb-user{background:${ACCENT};color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
    .psb-typing{align-self:flex-start;display:flex;gap:4px;padding:10px 14px}
    .psb-dot{width:8px;height:8px;background:#bbb;border-radius:50%;animation:psb-bounce .6s infinite alternate}
    .psb-dot:nth-child(2){animation-delay:.15s}
    .psb-dot:nth-child(3){animation-delay:.3s}
    @keyframes psb-bounce{to{transform:translateY(-6px);background:#888}}
    .psb-input-bar{display:flex;padding:10px 12px;border-top:1px solid #e5e7eb;gap:8px;flex-shrink:0;background:#fff}
    .psb-input{flex:1;border:1px solid #d1d5db;border-radius:10px;padding:8px 12px;font-size:14px;outline:none;resize:none;font-family:inherit;max-height:80px}
    .psb-input:focus{border-color:${ACCENT}}
    .psb-send{background:${ACCENT};color:#fff;border:none;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:14px;flex-shrink:0}
    .psb-send:disabled{opacity:.5;cursor:default}
    .psb-footer{text-align:center;font-size:11px;color:#9ca3af;padding:4px 0 8px;flex-shrink:0}
    .psb-sources{font-size:11px;color:#6b7280;margin-top:4px}
    @media(max-width:480px){
      .psb-window{width:100vw;height:100vh;bottom:0;${POS==="bottom-left"?"left":"right"}:0;border-radius:0}
      .psb-bubble{bottom:12px;${POS==="bottom-left"?"left":"right"}:12px}
    }
  `;
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ── Build DOM ─────────────────────────────────────────────────── */
  var wrap = document.createElement("div");
  wrap.className = "psb-wrap";

  // Chat bubble
  var bubble = document.createElement("button");
  bubble.className = "psb-bubble psb-pulse";
  bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
  bubble.setAttribute("aria-label", "Open chat");

  // Chat window
  var win = document.createElement("div");
  win.className = "psb-window";
  win.innerHTML =
    '<div class="psb-header"><span>' + esc(BOT) + '</span><button class="psb-close">\u00d7</button></div>' +
    '<div class="psb-messages"></div>' +
    '<div class="psb-input-bar"><textarea class="psb-input" placeholder="Type a message\u2026" rows="1"></textarea><button class="psb-send">Send</button></div>' +
    '<div class="psb-footer">Powered by ' + esc(BOT) + '</div>';

  wrap.appendChild(win);
  wrap.appendChild(bubble);
  document.body.appendChild(wrap);

  var msgArea = win.querySelector(".psb-messages");
  var input = win.querySelector(".psb-input");
  var sendBtn = win.querySelector(".psb-send");
  var closeBtn = win.querySelector(".psb-close");
  var isOpen = false;
  var isBusy = false;
  var history = [];

  // Show greeting
  addMsg(GREETING, "bot");

  /* ── Toggle ────────────────────────────────────────────────────── */
  bubble.onclick = function () {
    isOpen = !isOpen;
    win.classList.toggle("psb-open", isOpen);
    bubble.classList.remove("psb-pulse");
    if (isOpen) input.focus();
  };
  closeBtn.onclick = function () {
    isOpen = false;
    win.classList.remove("psb-open");
  };

  /* ── Send message ──────────────────────────────────────────────── */
  sendBtn.onclick = send;
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  // Auto-resize textarea
  input.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 80) + "px";
  });

  function send() {
    var text = input.value.trim();
    if (!text || isBusy) return;
    addMsg(text, "user");
    history.push({ role: "user", content: text });
    input.value = "";
    input.style.height = "auto";
    isBusy = true;
    sendBtn.disabled = true;
    streamResponse(text);
  }

  /* ── SSE streaming ─────────────────────────────────────────────── */
  function streamResponse(text) {
    var typing = showTyping();
    var botDiv = null;
    var fullText = "";

    fetch(API + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(-6) }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (d) { throw new Error(d.error || "Server error"); });
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        function read() {
          reader.read().then(function (result) {
            if (result.done) { finish(); return; }
            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i];
              if (line.startsWith("data: ")) {
                try {
                  var d = JSON.parse(line.slice(6));
                  if (d.token) {
                    if (!botDiv) { removeEl(typing); typing = null; botDiv = addMsg("", "bot"); }
                    fullText += d.token;
                    botDiv.textContent = fullText;
                    msgArea.scrollTop = msgArea.scrollHeight;
                  }
                  if (d.done) {
                    if (d.sources && d.sources.length) {
                      var srcDiv = document.createElement("div");
                      srcDiv.className = "psb-sources";
                      srcDiv.textContent = "Sources: " + d.sources.map(function (s) { return "Page " + s.page; }).join(", ");
                      if (botDiv) botDiv.appendChild(srcDiv);
                    }
                    history.push({ role: "assistant", content: fullText });
                    finish();
                    return;
                  }
                } catch (e) { /* skip malformed line */ }
              }
            }
            read();
          }).catch(function (err) { errorMsg(err.message); finish(); });
        }
        read();
      })
      .catch(function (err) { removeEl(typing); errorMsg(err.message); finish(); });

    function finish() {
      if (typing) removeEl(typing);
      isBusy = false;
      sendBtn.disabled = false;
      msgArea.scrollTop = msgArea.scrollHeight;
    }
  }

  /* ── Helpers ───────────────────────────────────────────────────── */
  function addMsg(text, role) {
    var div = document.createElement("div");
    div.className = "psb-msg " + (role === "bot" ? "psb-bot" : "psb-user");
    div.textContent = text;
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

  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
})();
