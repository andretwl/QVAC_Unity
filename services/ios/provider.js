#!/usr/bin/env node
// QVAC P2P Provider — Persistent P2P peer for iOS sync
// Run: QVAC_HYPERSWARM_SEED=<seed> node monitoring/qvac-provider.js
//
// The iOS QVAC app can discover this device via "Sync with another device"
// using the public key shown in the output.

import { startQVACProvider, stopQVACProvider, state, close } from "@qvac/sdk";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "../.qvac-provider-identity.json");

async function main() {
  console.log("🔄 Starting QVAC P2P Provider...");
  console.log(`   Seed: ${process.env.QVAC_HYPERSWARM_SEED ? "✅ Set (stable identity)" : "❌ Not set (random identity)"}`);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    const result = await startQVACProvider({
      firewall: {}, // Allow all connections (open network for LAN)
    });

    const pk = result.publicKey;
    
    // Save identity to config file for the dashboard/iOS page
    const identity = {
      publicKey: pk,
      started: new Date().toISOString(),
      syncKey: `${pk.slice(0, 8)}-${pk.slice(8, 16)}-${pk.slice(16, 24)}-${pk.slice(24, 32)}-${pk.slice(32, 40)}-${pk.slice(40, 48)}-${pk.slice(48, 56)}-${pk.slice(56, 64)}`,
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(identity, null, 2));
    console.log(`   Identity saved to: ${CONFIG_PATH}`);

    console.log(`
╔══════════════════════════════════════════════╗
║   QVAC P2P Provider — Active!               ║
╚══════════════════════════════════════════════╝

  📡 Public Key:
  ${pk}

  📱 iOS Sync Key (manual entry):
  ${identity.syncKey}

  🔗 iOS Setup Page (QR code):
  http://localhost:3000/ios.html

  Provider is listening on the Pear P2P network.
  iPhone should be able to discover this device
  if both are on the same LAN.

  Press Ctrl+C to stop.
`);
  } catch (e) {
    console.error("❌ Provider error:", e.message);
    process.exit(1);
  }
}

async function shutdown() {
  console.log("\n🛑 Stopping provider...");
  try {
    await stopQVACProvider();
    console.log("✅ Provider stopped");
  } catch (e) {
    console.error("Error:", e.message);
  }
  await close();
  process.exit(0);
}

main();
