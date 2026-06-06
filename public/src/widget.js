/*
 * Listen-to-this-article widget (source).
 *
 * This file is the hand-written widget logic. It is NOT loaded directly by
 * publishers. The build step (build-embed.js) concatenates the bundled
 * Mozilla Readability library + this file into the single, self-contained
 * `public/embed.js` artifact that publishers embed with one <script> tag.
 *
 * At runtime `Readability` is available in this scope because the bundle wraps
 * the Readability source and this code together inside one IIFE.
 */

(function widgetMain() {
  "use strict";

  // ---------------------------------------------------------------------------
  // Configuration (read from the embedding <script> tag)
  // ---------------------------------------------------------------------------
  // We capture the script element at parse time. `document.currentScript`
  // points at the <script src="/embed.js"> element while the bundle executes.
  var scriptEl =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      return all[all.length - 1];
    })();

  var CONFIG = {
    // Publisher identifier, e.g. <script ... data-site="demo">
    siteId: (scriptEl && scriptEl.getAttribute("data-site")) || "unknown",
    // Analytics API base. Defaults to same-origin "/api"; override with
    // data-api="https://your-backend.example.com/api" when embedding off-origin.
    apiBase: (scriptEl && scriptEl.getAttribute("data-api")) || "/api",
  };

  // ===========================================================================
  // === TTS ENGINE SEAM =======================================================
  // ===========================================================================
  // Everything that actually turns text into audio lives behind this small
  // interface. The rest of the widget only ever talks to a `TtsEngine` object.
  //
  // To swap the browser's Web Speech API for a server-side engine (Amazon
  // Polly, Azure Speech, ElevenLabs, ...) you implement the SAME interface and
  // hand it to `createWidget()` instead of `WebSpeechEngine`. No UI rewrite.
  //
  // Interface contract:
  //   listVoices()                  -> [{ id, label }]
  //   speak(text, opts, callbacks)  -> begins playback
  //       opts:      { voiceId, rate }
  //       callbacks: { onProgress(fraction 0..1), onEnd(), onError(err) }
  //   pause()                       -> pause playback
  //   resume()                      -> resume after pause
  //   stop()                        -> stop and reset
  //   isPaused()                    -> bool
  //   onVoicesChanged(cb)           -> notify when async voice list is ready
  //
  // A server-side engine would, in speak(), POST `text` to your backend, get
  // back an audio URL/stream, and drive an <audio> element here instead of
  // window.speechSynthesis — while keeping onProgress/onEnd semantics identical.
  // ===========================================================================

  function WebSpeechEngine() {
    var synth = window.speechSynthesis;
    var supported = !!synth && typeof window.SpeechSynthesisUtterance === "function";

    // Long text is split into chunks. Some browsers cap utterance length and
    // drop audio past ~32k chars, and chunking gives us reliable progress.
    var chunks = [];
    var totalChars = 0;
    var charsBeforeChunk = []; // cumulative chars before chunk i
    var chunkIndex = 0;
    var paused = false;
    var stopped = false;
    var cb = {};

    function splitIntoChunks(text) {
      // Split on sentence boundaries, then greedily pack into <= ~220 char
      // chunks so progress updates feel smooth.
      var sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
      var out = [];
      var buf = "";
      for (var i = 0; i < sentences.length; i++) {
        var s = sentences[i];
        if ((buf + s).length > 220 && buf.length > 0) {
          out.push(buf);
          buf = s;
        } else {
          buf += s;
        }
      }
      if (buf.trim().length) out.push(buf);
      return out;
    }

    function speakChunk() {
      if (stopped || chunkIndex >= chunks.length) {
        if (!stopped && cb.onEnd) cb.onEnd();
        return;
      }
      var u = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      if (currentVoiceObj) u.voice = currentVoiceObj;
      u.rate = currentRate;

      u.onboundary = function (e) {
        if (cb.onProgress && typeof e.charIndex === "number") {
          var done = charsBeforeChunk[chunkIndex] + e.charIndex;
          cb.onProgress(Math.min(done / totalChars, 0.999));
        }
      };
      u.onend = function () {
        if (stopped) return;
        chunkIndex++;
        if (cb.onProgress) {
          cb.onProgress(Math.min(charsBeforeChunk[chunkIndex] / totalChars || 1, 1));
        }
        speakChunk();
      };
      u.onerror = function (e) {
        // "interrupted"/"canceled" happen on stop() — not real errors.
        if (stopped) return;
        if (cb.onError) cb.onError(e.error || "speech-error");
      };
      synth.speak(u);
    }

    var currentVoiceObj = null;
    var currentRate = 1;

    return {
      supported: supported,

      listVoices: function () {
        if (!supported) return [];
        return synth.getVoices().map(function (v, i) {
          return { id: v.voiceURI || String(i), label: v.name + " (" + v.lang + ")", _v: v };
        });
      },

      onVoicesChanged: function (fn) {
        if (supported && typeof synth.onvoiceschanged !== "undefined") {
          synth.addEventListener("voiceschanged", fn);
        }
      },

      speak: function (text, opts, callbacks) {
        cb = callbacks || {};
        stopped = false;
        paused = false;
        chunkIndex = 0;
        chunks = splitIntoChunks(text);
        totalChars = text.length || 1;
        charsBeforeChunk = [];
        var acc = 0;
        for (var i = 0; i < chunks.length; i++) {
          charsBeforeChunk.push(acc);
          acc += chunks[i].length;
        }
        charsBeforeChunk.push(acc); // sentinel for final onend

        // Resolve voice id -> live SpeechSynthesisVoice object.
        currentVoiceObj = null;
        currentRate = (opts && opts.rate) || 1;
        var voices = synth.getVoices();
        if (opts && opts.voiceId) {
          for (var j = 0; j < voices.length; j++) {
            if ((voices[j].voiceURI || String(j)) === opts.voiceId) {
              currentVoiceObj = voices[j];
              break;
            }
          }
        }

        synth.cancel(); // clear any leftover queue
        speakChunk();
      },

      pause: function () {
        if (supported && synth.speaking) {
          synth.pause();
          paused = true;
        }
      },

      resume: function () {
        if (supported && paused) {
          synth.resume();
          paused = false;
        }
      },

      stop: function () {
        stopped = true;
        paused = false;
        if (supported) synth.cancel();
      },

      isPaused: function () {
        return paused;
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Article extraction (Mozilla Readability — bundled, no runtime CDN)
  // ---------------------------------------------------------------------------
  function extractArticleText() {
    try {
      // Readability mutates the DOM it parses, so clone the live document.
      var docClone = document.cloneNode(true);
      var article = new Readability(docClone).parse();
      if (article && article.textContent && article.textContent.trim().length > 0) {
        return {
          title: article.title || document.title || "",
          text: article.textContent.replace(/\s+\n/g, "\n").trim(),
        };
      }
    } catch (e) {
      // fall through to fallback
    }
    // Fallback: <article> or <main> or body innerText.
    var el =
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.body;
    return { title: document.title || "", text: (el.innerText || "").trim() };
  }

  // ---------------------------------------------------------------------------
  // Analytics tracking -> backend
  // ---------------------------------------------------------------------------
  function track(action) {
    var payload = {
      siteId: CONFIG.siteId,
      articleUrl: window.location.href,
      action: action,
      timestamp: new Date().toISOString(),
    };
    try {
      var body = JSON.stringify(payload);
      // sendBeacon survives page unload (good for "complete"); fall back to fetch.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          CONFIG.apiBase + "/track",
          new Blob([body], { type: "application/json" })
        );
      } else {
        fetch(CONFIG.apiBase + "/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
        }).catch(function () {});
      }
    } catch (e) {
      /* analytics must never break the page */
    }
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  function createWidget(engine) {
    var STATE = { IDLE: "idle", PLAYING: "playing", PAUSED: "paused" };
    var state = STATE.IDLE;
    var extracted = null;
    var firedPlay = false;

    // ---- styles (scoped via unique class prefix) ----
    var css =
      ".ltta-root{position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}" +
      ".ltta-fab{display:flex;align-items:center;gap:8px;background:#1a1a2e;color:#fff;border:none;border-radius:28px;padding:12px 18px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);}" +
      ".ltta-fab:hover{background:#16213e;}" +
      ".ltta-panel{display:none;width:300px;background:#fff;color:#1a1a2e;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:16px;}" +
      ".ltta-panel.open{display:block;}" +
      ".ltta-title{font-size:13px;font-weight:700;margin:0 0 10px;color:#1a1a2e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      ".ltta-controls{display:flex;gap:8px;margin-bottom:12px;}" +
      ".ltta-btn{flex:1;background:#eef0f6;border:none;border-radius:8px;padding:10px;font-size:14px;font-weight:600;cursor:pointer;color:#1a1a2e;}" +
      ".ltta-btn:hover{background:#e0e3ee;}" +
      ".ltta-btn.primary{background:#1a1a2e;color:#fff;}" +
      ".ltta-btn.primary:hover{background:#16213e;}" +
      ".ltta-progress{height:6px;background:#eef0f6;border-radius:3px;overflow:hidden;margin-bottom:12px;}" +
      ".ltta-bar{height:100%;width:0%;background:#4f8cff;transition:width .15s linear;}" +
      ".ltta-row{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}" +
      ".ltta-row label{font-size:11px;font-weight:600;color:#555;}" +
      ".ltta-row select{padding:7px;border:1px solid #d0d4e0;border-radius:8px;font-size:13px;background:#fff;}" +
      ".ltta-close{position:absolute;top:10px;right:12px;border:none;background:none;font-size:18px;cursor:pointer;color:#999;line-height:1;}" +
      ".ltta-status{font-size:11px;color:#888;text-align:center;margin-top:4px;}";

    var styleTag = document.createElement("style");
    styleTag.textContent = css;
    document.head.appendChild(styleTag);

    // ---- DOM ----
    var root = document.createElement("div");
    root.className = "ltta-root";
    root.innerHTML =
      '<button class="ltta-fab" type="button">▶ Listen</button>' +
      '<div class="ltta-panel" role="dialog" aria-label="Listen to this article">' +
      '<button class="ltta-close" type="button" aria-label="Close">×</button>' +
      '<p class="ltta-title">Listen to this article</p>' +
      '<div class="ltta-progress"><div class="ltta-bar"></div></div>' +
      '<div class="ltta-controls">' +
      '<button class="ltta-btn primary" data-act="toggle">▶ Play</button>' +
      '<button class="ltta-btn" data-act="stop">■ Stop</button>' +
      "</div>" +
      '<div class="ltta-row"><label>Voice</label><select class="ltta-voice"></select></div>' +
      '<div class="ltta-row"><label>Speed</label><select class="ltta-speed">' +
      '<option value="0.75">0.75x</option><option value="1" selected>1x</option>' +
      '<option value="1.25">1.25x</option><option value="1.5">1.5x</option>' +
      '<option value="2">2x</option></select></div>' +
      '<div class="ltta-status"></div>' +
      "</div>";
    document.body.appendChild(root);

    var fab = root.querySelector(".ltta-fab");
    var panel = root.querySelector(".ltta-panel");
    var closeBtn = root.querySelector(".ltta-close");
    var toggleBtn = root.querySelector('[data-act="toggle"]');
    var stopBtn = root.querySelector('[data-act="stop"]');
    var bar = root.querySelector(".ltta-bar");
    var voiceSel = root.querySelector(".ltta-voice");
    var speedSel = root.querySelector(".ltta-speed");
    var titleEl = root.querySelector(".ltta-title");
    var statusEl = root.querySelector(".ltta-status");

    function setStatus(msg) {
      statusEl.textContent = msg || "";
    }

    // ---- voice list ----
    function populateVoices() {
      var voices = engine.listVoices();
      voiceSel.innerHTML = "";
      if (!voices.length) {
        var opt = document.createElement("option");
        opt.textContent = "Default voice";
        opt.value = "";
        voiceSel.appendChild(opt);
        return;
      }
      voices.forEach(function (v) {
        var o = document.createElement("option");
        o.value = v.id;
        o.textContent = v.label;
        voiceSel.appendChild(o);
      });
    }
    populateVoices();
    engine.onVoicesChanged(populateVoices);

    if (!engine.supported) {
      setStatus("Speech not supported in this browser.");
      toggleBtn.disabled = true;
    }

    // ---- transitions ----
    function startPlayback() {
      if (!extracted) extracted = extractArticleText();
      if (titleEl && extracted.title) titleEl.textContent = extracted.title;
      if (!extracted.text) {
        setStatus("No readable article text found.");
        return;
      }
      firedPlay = false;
      bar.style.width = "0%";
      engine.speak(
        extracted.text,
        { voiceId: voiceSel.value, rate: parseFloat(speedSel.value) || 1 },
        {
          onProgress: function (f) {
            bar.style.width = (f * 100).toFixed(1) + "%";
            if (!firedPlay) {
              firedPlay = true;
            }
          },
          onEnd: function () {
            state = STATE.IDLE;
            bar.style.width = "100%";
            toggleBtn.innerHTML = "▶ Play";
            setStatus("Finished");
            track("complete"); // <-- analytics: completion
          },
          onError: function (err) {
            state = STATE.IDLE;
            toggleBtn.innerHTML = "▶ Play";
            setStatus("Error: " + err);
          },
        }
      );
      state = STATE.PLAYING;
      toggleBtn.innerHTML = "❚❚ Pause";
      setStatus("Playing…");
      track("play"); // <-- analytics: play started
    }

    function onToggle() {
      if (state === STATE.IDLE) {
        startPlayback();
      } else if (state === STATE.PLAYING) {
        engine.pause();
        state = STATE.PAUSED;
        toggleBtn.innerHTML = "▶ Resume";
        setStatus("Paused");
      } else if (state === STATE.PAUSED) {
        engine.resume();
        state = STATE.PLAYING;
        toggleBtn.innerHTML = "❚❚ Pause";
        setStatus("Playing…");
      }
    }

    function onStop() {
      engine.stop();
      state = STATE.IDLE;
      bar.style.width = "0%";
      toggleBtn.innerHTML = "▶ Play";
      setStatus("Stopped");
    }

    // Re-speak with new voice/speed if changed mid-playback.
    function onSettingChange() {
      if (state === STATE.PLAYING || state === STATE.PAUSED) {
        onStop();
        startPlayback();
      }
    }

    // ---- events ----
    fab.addEventListener("click", function () {
      panel.classList.toggle("open");
    });
    closeBtn.addEventListener("click", function () {
      panel.classList.remove("open");
    });
    toggleBtn.addEventListener("click", onToggle);
    stopBtn.addEventListener("click", onStop);
    voiceSel.addEventListener("change", onSettingChange);
    speedSel.addEventListener("change", onSettingChange);

    // Stop speech if the user leaves the page.
    window.addEventListener("beforeunload", function () {
      engine.stop();
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    // Build the default engine. Swap this line to use a server-side engine.
    var engine = WebSpeechEngine();
    createWidget(engine);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
