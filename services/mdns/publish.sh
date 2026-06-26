#!/bin/bash
# QVAC iOS mDNS Publisher
# Advertises the QVAC server on the LAN so iOS can discover it
# Uses Avahi (Linux mDNS/Bonjour implementation)
# Run: bash monitoring/mdns-publish.sh

set -e

PORT=11435
HOST=$(hostname)
AVAHI_SERVICE_NAME="QVAC Server on ${HOST}"
AVAHI_SERVICE_TYPE="_qvac._tcp"

# Get primary LAN IP (not Docker)
LAN_IP=$(ip -4 addr show scope global 2>/dev/null | grep -v "docker\|br-\|veth" | grep inet | awk '{print $2}' | cut -d/ -f1 | head -1)

echo "📡 Publishing QVAC server via mDNS..."
echo "   Host:   ${HOST} (${LAN_IP})"
echo "   Port:   ${PORT}"
echo "   Service: ${AVAHI_SERVICE_TYPE}"
echo ""
echo "   iPhone should auto-discover as: '${AVAHI_SERVICE_NAME}'"
echo "   Press Ctrl+C to stop"
echo ""

# Publish service (keeps running in foreground)
avahi-publish-service \
  "${AVAHI_SERVICE_NAME}" \
  "${AVAHI_SERVICE_TYPE}" \
  "${PORT}" \
  "path=/v1" \
  "server=${HOST}" \
  "ip=${LAN_IP}" \
  "api=openai" \
  "models=qvac"
