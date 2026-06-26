// QVAC Dashboard — Frontend Logic
// Talks to dashboard server at /api/qvac/* which proxies to QVAC :11435

const API = "/api/qvac";
const HEALTH_API = "/api/health";

// ─── State ───────────────────────────────────────────────
const state = {
  qvacModels: [],
  routerModels: [],
  selectedModel: "default-llm",
  lastHealth: null,
  streaming: false,
};

// ─── DOM Refs ────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const btnSend = document.getElementById("btn-send");
const modelSelect = document.getElementById("model-select");
const toast = document.getElementById("toast");

// ─── Toast ───────────────────────────────────────────────
let toastTimer;

function showToast(msg, type = "info") {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = "toast " + type;
  toast.classList.remove("hidden");
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 4000);
}

// ─── Health Polling ──────────────────────────────────────
async function pollHealth() {
  try {
    const res = await fetch(HEALTH_API);
    const data = await res.json();
    state.lastHealth = data;

    // Server badges
    for (const [name, status] of Object.entries(data.servers)) {
      const el = document.getElementById(`status-${name}`);
      if (el) {
        el.className = `server-badge ${status}`;
        el.querySelector(".dot").textContent = status === "up" ? "●" : "○";
        el.title = `${name.charAt(0).toUpperCase() + name.slice(1)}: ${status}`;
      }
    }

    // VRAM
    const v = data.vram;
    const indicator = document.getElementById("vram-indicator");
    if (v.error) {
      indicator.textContent = "VRAM: N/A";
    } else {
      indicator.textContent = `VRAM: ${v.used} / ${v.total} MiB (${v.percent}%)`;
      indicator.style.color = v.percent > 90 ? "var(--red)" : v.percent > 75 ? "var(--yellow)" : "var(--text2)";
    }

    // VRAM gauge
    const gauge = document.getElementById("vram-gauge-fill");
    const gaugeText = document.getElementById("vram-gauge-text");
    const gaugeDetails = document.getElementById("vram-details");
    if (gauge && !v.error) {
      gauge.style.width = Math.min(v.percent, 100) + "%";
      gaugeText.textContent = `${v.used} / ${v.total} MiB (${v.percent}%)`;
      gaugeDetails.textContent = `GPU: ${v.gpuUtil}% | Mem: ${v.memUtil}% | Temp: ${v.temp}°C`;
    } else if (v.error) {
      gaugeText.textContent = "nvidia-smi unavailable";
    }
    document.getElementById("gpu-temp").textContent = v.temp ? `🌡 ${v.temp}°C` : "🌡 N/A";

    // Server info list
    const infoList = document.getElementById("server-info-list");
    infoList.innerHTML = Object.entries(data.servers).map(([name, status]) => {
      const label = { qvac: "QVAC", router: "Router" }[name] || name;
      return `<div class="detail-row">
        <span class="label">${label}</span>
        <span class="value" style="color: ${
          status === "up" ? "var(--green)" :
          status === "down" ? "var(--red)" :
          "var(--yellow)"
        }">${status}</span>
      </div>`;
    }).join("");

  } catch (err) {
    console.error("Health poll failed:", err);
  }
}

// ─── Model Loading ───────────────────────────────────────
async function loadModels() {
  try {
    // QVAC models
    const qRes = await fetch(`${API}/models`);
    const qData = await qRes.json();
    state.qvacModels = qData.data || [];
    renderModelList("qvac-models", state.qvacModels, "qvac");

    // Router (unified) models
    try {
      const rRes = await fetch("/api/router/v1/models");
      const rData = await rRes.json();
      state.routerModels = rData.data || [];
      renderRouterModels(state.routerModels);
    } catch { renderRouterModels([]); }

    // Update model selector
    updateModelSelect();
  } catch (err) {
    console.error("Failed to load models:", err);
  }
}

function renderModelList(containerId, models, source) {
  const container = document.getElementById(containerId);
  if (!models.length) {
    container.innerHTML = '<div class="loading">No models available</div>';
    return;
  }
  container.innerHTML = models.map(m => {
    const name = m.id || m.name || "(unknown)";
    const isActive = name === state.selectedModel;
    // Check if this is a configured alias (comes from serve.models)
    const isConfigured = ["default-llm","fast-llm","quality-llm","tiny-llm"].includes(name);
    const tag = isConfigured ? '<span class="tag">configured</span>' : 
                name.includes("preloaded") ? '<span class="tag preloaded">preloaded</span>' : '';
    return `<div class="model-item ${isActive ? 'active' : ''}" data-model="${name}" data-source="${source}">
      <span class="name">${name}</span>
      <span>${tag}</span>
    </div>`;
  }).join("");

  // Click to select
  container.querySelectorAll(".model-item").forEach(el => {
    el.addEventListener("click", () => {
      const name = el.dataset.model;
      state.selectedModel = name;
      document.getElementById("model-select").value = name;
      // Update highlights
      document.querySelectorAll(".model-item").forEach(m => m.classList.remove("active"));
      el.classList.add("active");
    });
  });
}

function renderRouterModels(models) {
  const container = document.getElementById("router-models");
  if (!models.length) {
    container.innerHTML = '<div class="loading">No models discovered</div>';
    return;
  }
  container.innerHTML = models.map(m => {
    const owned = m.owned_by || "unknown";
    return `<div class="model-item" data-model="${m.id}" data-source="${owned}">
      <span class="name">${m.id}</span>
      <span class="tag">${owned}</span>
    </div>`;
  }).join("");

  // Click to select (also works for router models)
  container.querySelectorAll(".model-item").forEach(el => {
    el.addEventListener("click", () => {
      state.selectedModel = el.dataset.model;
      document.getElementById("model-select").value = el.dataset.model;
      document.querySelectorAll(".model-item").forEach(m => m.classList.remove("active"));
      el.classList.add("active");
    });
  });
}

function updateModelSelect() {
  const allModels = [
    ...state.qvacModels.map(m => ({ id: m.id || m.name, source: "qvac" })),
    ...state.routerModels.map(m => ({ id: m.id, source: m.owned_by || "router" })),
  ];
  modelSelect.innerHTML = allModels.map(m =>
    `<option value="${m.id}" ${m.id === state.selectedModel ? "selected" : ""}>${m.id} (${m.source})</option>`
  ).join("");
  // If no models, add default entries
  if (!allModels.length) {
    modelSelect.innerHTML = `
      <option value="default-llm">default-llm (qvac)</option>
      <option value="fast-llm">fast-llm (qvac)</option>
      <option value="quality-llm">quality-llm (qvac)</option>
      <option value="tiny-llm">tiny-llm (qvac)</option>
    `;
  }
}

// ─── Load/Unload Model ───────────────────────────────────
async function loadSelectedModel() {
  const model = modelSelect.value;
  const statusEl = document.getElementById("model-status");
  statusEl.textContent = "Loading...";
  try {
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
    });
    if (res.ok) {
      statusEl.textContent = "✅ Loaded";
      showToast(`Model "${model}" is ready`, "success");
    } else {
      const err = await res.json();
      statusEl.textContent = `❌ ${err.error?.message || "Failed"}`;
    }
  } catch (err) {
    statusEl.textContent = "❌ Error";
    showToast(err.message, "error");
  }
}

async function unloadSelectedModel() {
  const model = modelSelect.value;
  const statusEl = document.getElementById("model-status");
  try {
    const res = await fetch(`${API}/models/${model}`, { method: "DELETE" });
    if (res.ok || res.status === 404) {
      statusEl.textContent = "🧹 Unloaded";
      showToast(`Model "${model}" unloaded`, "info");
    } else {
      statusEl.textContent = "❌ Failed to unload";
    }
  } catch (err) {
    statusEl.textContent = "❌ Error";
  }
}

// ─── Chat ────────────────────────────────────────────────
function addMessage(role, content, extra = "") {
  const div = document.createElement("div");
  const isSystem = role === "system";
  div.className = `message ${role}${extra ? " " + extra : ""}`;
  if (isSystem) {
    div.textContent = content;
  } else {
    div.innerHTML = `<div class="role-label">${role}</div><div class="msg-content">${escapeHtml(content)}</div>`;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || state.streaming) return;

  const model = modelSelect.value;
  // Route through the unified model router for best model selection
  const chatEndpoint = "/api/router/v1/chat/completions";
  chatInput.value = "";
  addMessage("user", text);

  // Remove welcome message
  const welcome = chatMessages.querySelector(".welcome-msg");
  if (welcome) welcome.remove();

  const msgEl = addMessage("assistant", "", "streaming");
  const contentDiv = msgEl.querySelector(".msg-content");
  state.streaming = true;
  btnSend.disabled = true;
  btnSend.textContent = "⏳";

  try {
    const res = await fetch(chatEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "user", content: text },
        ],
        stream: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      contentDiv.textContent = `Error: ${err.error?.message || res.statusText}`;
      msgEl.className = "message system";
      state.streaming = false;
      btnSend.disabled = false;
      btnSend.textContent = "Send";
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || "";
          if (delta) {
            contentDiv.textContent += delta;
          }
        } catch {}
      }
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    msgEl.className = "message assistant";
  } catch (err) {
    contentDiv.textContent = `Connection error: ${err.message}`;
    msgEl.className = "message system";
  }

  state.streaming = false;
  btnSend.disabled = false;
  btnSend.textContent = "Send";
}

// ─── Quick Tests ─────────────────────────────────────────
async function testEmbeddings() {
  const model = modelSelect.value;
  showToast("Testing embeddings...", "info");
  try {
    const res = await fetch(`${API}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: "QVAC is a local AI SDK.",
      }),
    });
    const data = await res.json();
    const dims = data.data?.[0]?.embedding?.length || "?";
    showToast(`✅ Embeddings OK — ${dims} dimensions`, "success");
  } catch (err) {
    showToast(`❌ Embeddings: ${err.message}`, "error");
  }
}

async function testListModels() {
  showToast("Fetching models from QVAC API...", "info");
  try {
    const res = await fetch(`${API}/models`);
    const data = await res.json();
    const names = data.data.map(m => m.id).join(", ");
    showToast(`✅ Models: ${names || "(none)"}`, "success");
  } catch (err) {
    showToast(`❌ ${err.message}`, "error");
  }
}

async function testVRAM() {
  const h = state.lastHealth;
  if (h && !h.vram.error) {
    showToast(`VRAM: ${h.vram.used}/${h.vram.total} MiB (${h.vram.percent}%), Temp: ${h.vram.temp}°C`, "info");
  } else {
    showToast(`VRAM data unavailable`, "error");
  }
}

// ─── Init ─────────────────────────────────────────────────
async function init() {
  // Initial loads
  await loadModels();
  await pollHealth();

  // Poll health every 5s
  setInterval(pollHealth, 5000);
  // Poll models every 30s
  setInterval(loadModels, 30000);

  // Events
  btnSend.addEventListener("click", sendMessage);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  document.getElementById("btn-refresh").addEventListener("click", async () => {
    await Promise.all([pollHealth(), loadModels()]);
    showToast("Refreshed", "success");
  });

  document.getElementById("btn-load-model").addEventListener("click", loadSelectedModel);
  document.getElementById("btn-unload-model").addEventListener("click", unloadSelectedModel);

  modelSelect.addEventListener("change", () => {
    state.selectedModel = modelSelect.value;
  });

  // Quick test buttons
  document.querySelectorAll(".btn-test[data-prompt]").forEach(btn => {
    btn.addEventListener("click", () => {
      chatInput.value = btn.dataset.prompt;
      sendMessage();
    });
  });

  document.getElementById("btn-test-embed").addEventListener("click", testEmbeddings);
  document.getElementById("btn-test-list").addEventListener("click", testListModels);
  document.getElementById("btn-test-vram").addEventListener("click", testVRAM);

  console.log("QVAC Dashboard initialized");
}

// Wait for DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
