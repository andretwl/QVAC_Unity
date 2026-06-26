#!/usr/bin/env node
// QVAC iOS Pairing Script
// Sets up the desktop server for iOS connection via P2P/LAN
// Run: node monitoring/ios-pair.js

import { execSync } from "node:child_process";
import os from "node:os";
import dns from "node:dns";
import http from "node:http";

const QVAC_PORT = 11435;
const ROUTER_PORT = 3001;
const DASHBOARD_PORT = 3000;

function getLANIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    // Skip Docker/bridge/veth interfaces
    if (name.startsWith("docker") || name.startsWith("br-") || name.startsWith("veth")) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        ips.push({ name, ip: addr.address });
      }
    }
  }
  return ips;
}

function getHostname() {
  return os.hostname();
}

async function checkServer(url, label) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return { label, status: res.ok ? "🟢" : "🔴", url };
  } catch {
    return { label, status: "🔴", url, error: "unreachable" };
  }
}

async function resolveMDNS() {
  // Try to resolve our own hostname via mDNS
  try {
    const hostname = getHostname();
    return new Promise((resolve) => {
      dns.resolve(hostname + ".local", "A", (err, addresses) => {
        if (err) resolve(null);
        else resolve(addresses);
      });
    });
  } catch {
    return null;
  }
}

console.log(`
╔══════════════════════════════════════════════╗
║   QVAC — iOS Pairing Assistant               ║
║   Connects your iPhone QVAC app to this PC   ║
╚══════════════════════════════════════════════╝
`);

// ─── Network Info ───────────────────────────────
const ips = getLANIPs();
const hostname = getHostname();

console.log(`📡 Desktop Network Info:`);
console.log(`   Hostname: ${hostname}`);
console.log(`   LAN IPs:`);
for (const { name, ip } of ips) {
  console.log(`     • ${name}: ${ip}`);
}

const mdnsName = await resolveMDNS();
if (mdnsName) {
  console.log(`   mDNS: ${hostname}.local → ${mdnsName.join(", ")}`);
} else {
  console.log(`   mDNS: ${hostname}.local (not resolved — use IP directly)`);
}

console.log(``);

// ─── Server Health ─────────────────────────────
console.log(`🔍 Checking running servers...`);

const results = await Promise.all([
  checkServer(`http://localhost:${QVAC_PORT}/v1/models`, "QVAC Server"),
  checkServer(`http://localhost:${ROUTER_PORT}/health`, "Model Router"),
  checkServer(`http://localhost:${DASHBOARD_PORT}/api/health`, "Dashboard"),
]);

for (const r of results) {
  console.log(`   ${r.status} ${r.label}: ${r.url}`);
}

console.log(``);

// ─── iOS Connection Info ────────────────────────
console.log(`📱 iOS QVAC App Connection:`);
console.log(``);
console.log(`   To connect your iPhone to this server:`);
console.log(``);

for (const { name, ip } of ips) {
  console.log(`   Option: ${name}`);
  console.log(`   ┌─────────────────────────────────────────┐`);
  console.log(`   │ Server URL: http://${ip}:${QVAC_PORT}          │`);
  console.log(`   │ Dashboard:  http://${ip}:${DASHBOARD_PORT}     │`);
  console.log(`   │ Router:     http://${ip}:${ROUTER_PORT}        │`);
  console.log(`   └─────────────────────────────────────────┘`);
  console.log(``);
}

console.log(`   mDNS name: http://${hostname}.local:${QVAC_PORT}`);
console.log(`   (only works if mDNS/Bonjour is configured on the network)`);
console.log(``);

// ─── Generate QR Code URL ──────────────────────
const ip = ips[0]?.ip || "localhost";
const qrData = JSON.stringify({
  server: `http://${ip}:${QVAC_PORT}`,
  name: `qvac-${hostname}`,
  type: "openai",
});

console.log(`📱 Scan this from the QVAC iOS app:`);
console.log(`   Open http://localhost:${DASHBOARD_PORT}/ios.html`);
console.log(`   Or manually enter: http://${ip}:${QVAC_PORT}`);
console.log(``);

// ─── Firewall Check ────────────────────────────
console.log(`🔓 Firewall Check:`);
try {
  const fw = execSync("sudo ufw status 2>/dev/null || echo 'inactive'", { encoding: "utf8" });
  if (fw.includes("inactive")) {
    console.log(`   ✅ UFW firewall is inactive — server reachable on LAN`);
  } else {
    console.log(`   ⚠️  UFW active. May need: sudo ufw allow ${QVAC_PORT}`);
    console.log(`   ⚠️  May also need: sudo ufw allow ${DASHBOARD_PORT}`);
  }
} catch {
  console.log(`   ℹ️  Could not check firewall status`);
}

console.log(``);
console.log(`✅ iOS pairing check complete`);
