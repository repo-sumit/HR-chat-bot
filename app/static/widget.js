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
    .psb-input{flex:1;border:1px solid #dddde8;border-radius:12px;padding:9px 14px;font-size:14px;outline:none;resize:none;font-family:'Inter',system-ui,sans-serif;max-height:80px;background:#f7f8fc;transition:border-color .2s,background .2s}
    .psb-input:focus{border-color:${TEAL};background:#fff}
    .psb-send{background:${ACCENT};color:#fff;border:none;border-radius:12px;padding:9px 16px;cursor:pointer;font-size:13px;font-weight:600;flex-shrink:0;letter-spacing:0.2px;transition:background .15s,transform .1s;height:38px}
    .psb-send:hover{background:#3d3ba0}
    .psb-send:active{transform:scale(.97)}
    .psb-send:disabled{opacity:.45;cursor:default;transform:none}
    .psb-footer{text-align:center;font-size:11px;color:#9ca3af;padding:6px 0 10px;flex-shrink:0;background:#fff}
    .psb-sources{font-size:11px;color:${TEAL};margin-top:6px;font-weight:500}
    @media(max-width:480px){
      .psb-window{width:100vw;height:100vh;bottom:0;${POS==="bottom-left"?"left":"right"}:0;border-radius:0}
      .psb-bubble{bottom:12px;${POS==="bottom-left"?"left":"right"}:12px}
      .psb-bubble.psb-hidden{display:none}
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
    '<div class="psb-input-bar"><textarea class="psb-input" placeholder="Type a message\u2026" rows="1"></textarea><button class="psb-send">Ask</button></div>' +
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

  /* ── Server warm-up ───────────────────────────────────────────── */
  var serverReady = false;
  function warmUp() {
    fetch(API + "/", { method: "GET" }).then(function () { serverReady = true; }).catch(function () {});
  }
  warmUp(); // ping on page load

  /* ── Toggle ────────────────────────────────────────────────────── */
  function isMobile() { return window.innerWidth <= 480; }

  bubble.onclick = function () {
    isOpen = !isOpen;
    win.classList.toggle("psb-open", isOpen);
    bubble.classList.remove("psb-pulse");
    if (isMobile()) bubble.classList.toggle("psb-hidden", isOpen);
    if (isOpen) { warmUp(); input.focus(); }
  };
  closeBtn.onclick = function () {
    isOpen = false;
    win.classList.remove("psb-open");
    bubble.classList.remove("psb-hidden");
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


  /* ── SSE streaming with auto-retry ──────────────────────────────── */
  var MAX_RETRIES = 3;
  var RETRY_DELAYS = [5000, 10000, 15000]; // 5s, 10s, 15s

  function streamResponse(text, retryCount) {
    retryCount = retryCount || 0;
    var typing = showTyping();
    var statusDiv = null;
    var botDiv = null;
    var fullText = "";

    if (retryCount > 0) {
      statusDiv = addMsg("Server is waking up... attempt " + (retryCount + 1) + "/" + (MAX_RETRIES + 1), "bot");
      statusDiv.style.color = "#5BC5C8";
      statusDiv.style.fontStyle = "italic";
      statusDiv.style.fontSize = "12px";
    }

    fetch(API + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(-6) }),
    })
      .then(function (res) {
        if (statusDiv) removeEl(statusDiv);
        if (!res.ok) {
          return res.json().then(function (d) { throw new Error(d.error || "Server error"); });
        }
        serverReady = true;
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
                  if (d.error) {
                    removeEl(typing); typing = null;
                    errorMsg(d.error);
                    finish();
                    return;
                  }
                  if (d.token) {
                    if (!botDiv) { removeEl(typing); typing = null; botDiv = addMsg("", "bot"); }
                    fullText += d.token;
                    botDiv.innerHTML = renderMarkdown(fullText);
                    msgArea.scrollTop = msgArea.scrollHeight;
                  }
                  if (d.done) {
                    history.push({ role: "assistant", content: fullText });
                    finish();
                    return;
                  }
                } catch (e) { /* skip malformed line */ }
              }
            }
            read();
          }).catch(function (err) { handleError(err); });
        }
        read();
      })
      .catch(function (err) { handleError(err); });

    function handleError(err) {
      var msg = (err && err.message) ? err.message.toLowerCase() : "";
      var isNetworkErr = msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed") || msg.includes("timeout");
      if (isNetworkErr && retryCount < MAX_RETRIES) {
        removeEl(typing); typing = null;
        if (statusDiv) removeEl(statusDiv);
        var waitDiv = addMsg("Server is starting up... retrying in " + (RETRY_DELAYS[retryCount] / 1000) + "s", "bot");
        waitDiv.style.color = "#5BC5C8";
        waitDiv.style.fontStyle = "italic";
        waitDiv.style.fontSize = "12px";
        setTimeout(function () {
          removeEl(waitDiv);
          streamResponse(text, retryCount + 1);
        }, RETRY_DELAYS[retryCount]);
      } else {
        removeEl(typing); typing = null;
        if (statusDiv) removeEl(statusDiv);
        errorMsg(friendlyNetworkError(err));
        finish();
      }
    }

    function finish() {
      if (typing) removeEl(typing);
      isBusy = false;
      sendBtn.disabled = false;
      msgArea.scrollTop = msgArea.scrollHeight;
    }
  }

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
