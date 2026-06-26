#!/usr/bin/env node
// QVAC Unified Server — HTTP API + P2P Provider (for iOS sync)
// 
// Starts the QVAC HTTP server on port 11435, preloads models,
// THEN starts a P2P provider with a stable identity so the iPhone
// QVAC app can discover and use our cached models.
//
// Run: node monitoring/qvac-unified-server.js

// We import startServer from the internal module path directly since @qvac/cli
// only exports its main CLI entry point publicly.
import { startServer } from "/home/athar/.nvm/versions/node/v24.16.0/lib/node_modules/@qvac/cli/dist/serve/index.js";
// Import from the SAME SDK instance that the CLI uses so models and provider
// share the same Bare worker process.
import { startQVACProvider, stopQVACProvider, close } from "/home/athar/.nvm/versions/node/v24.16.0/lib/node_modules/@qvac/cli/node_modules/@qvac/sdk/dist/index.js";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(PROJECT_ROOT, "qvac.config.json");
const IDENTITY_PATH = resolve(PROJECT_ROOT, ".qvac-provider-identity.json");

// Stable seed for persistent P2P identity
const SEED = process.env.QVAC_HYPERSWARM_SEED || "323c4f19a273c04fa01ca5b729fa448fb52e8e62ac8777956011152ecb70941b";
let app = null;

async function main() {
  console.log(`
╔══════════════════════════════════════════════╗
║   QVAC Unified Server                        ║
║   HTTP API :11435 + P2P iOS                  ║
╚══════════════════════════════════════════════╝
`);

  // 1. Start HTTP server with all models
  console.log("📡 Starting QVAC HTTP server...");
  app = await startServer({
    projectRoot: PROJECT_ROOT,
    config: CONFIG_PATH,
    port: 11435,
    host: "0.0.0.0",
    cors: true,
    docs: true,
    verbose: false,
  });
  console.log(`✅ HTTP server on :11435 with models loaded`);

  // 2. Start P2P provider (shares same SDK worker → same models)
  console.log("🌐 Starting P2P provider for iOS sync...");
  try {
    const result = await startQVACProvider({
      firewall: {}, // Allow all connections
      // seed parameter is handled via QVAC_HYPERSWARM_SEED env var
    });
    
    const pk = result.publicKey;
    const identity = {
      publicKey: pk,
      started: new Date().toISOString(),
      syncKey: `${pk.slice(0, 8)}-${pk.slice(8, 16)}-${pk.slice(16, 24)}-${pk.slice(24, 32)}-${pk.slice(32, 40)}-${pk.slice(40, 48)}-${pk.slice(48, 56)}-${pk.slice(56, 64)}`,
    };
    writeFileSync(IDENTITY_PATH, JSON.stringify(identity, null, 2));
    
    console.log(`
  ✅ P2P Provider Active
  📡 Public Key: ${pk}
  📱 Sync Key:   ${identity.syncKey}

  🔗 Dashboard: http://localhost:3000
  🔗 iOS Setup: http://localhost:3000/ios.html
  🔗 API:       http://localhost:11435/v1

  Press Ctrl+C to stop.
`);
  } catch (e) {
    console.error(`❌ P2P provider error: ${e.message}`);
    console.log("  ⚠ HTTP server still running on :11435");
  }

  // 3. Handle shutdown
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function shutdown() {
  console.log("\n🛑 Shutting down...");
  try {
    await stopQVACProvider();
    console.log("✅ Provider stopped");
  } catch (e) {
    console.log(`  Provider stop: ${e.message}`);
  }
  try {
    await app.close();
    console.log("✅ HTTP server stopped");
  } catch (e) {
    console.log(`  Server stop: ${e.message}`);
  }
  await close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
