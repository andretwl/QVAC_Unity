// QVAC HTTP Server Example — use the OpenAI-compatible API
// Prerequisites: qvac serve openai --cors --docs --port 11435 (running in background)
// This script uses the OpenAI-like REST API, no SDK import needed

const API = "http://localhost:11435/v1";

async function main() {
  // 1. List models
  console.log("📋 Available models:");
  const models = await fetch(`${API}/models`).then(r => r.json());
  for (const m of models.data) {
    console.log(`   - ${m.id}`);
  }

  // 2. Chat completion (non-streaming)
  console.log("\n💬 Chat with default-llm:");
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "default-llm",
      messages: [
        { role: "user", content: "What is QVAC? Answer in one sentence." },
      ],
      stream: false,
    }),
  });
  const data = await res.json();
  console.log(`   ${data.choices[0].message.content}`);
  console.log(`   (${data.usage.completion_tokens} tokens, ${data.usage.total_tokens} total)`);

  // 3. Try the fast model (loads on first request)
  console.log("\n⚡ Chat with fast-llm:");
  const res2 = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "fast-llm",
      messages: [
        { role: "user", content: "Say 'QVAC is running!' in exactly 3 words." },
      ],
      stream: false,
    }),
  });
  const data2 = await res2.json();
  if (data2.error) {
    console.log(`   ❌ ${data2.error.message || JSON.stringify(data2.error)}`);
  } else {
    console.log(`   ${data2.choices?.[0]?.message?.content ?? "no content"}`);
  }
}

main().catch(console.error);
