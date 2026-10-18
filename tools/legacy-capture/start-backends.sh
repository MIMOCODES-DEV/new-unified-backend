#!/usr/bin/env bash
# CAP-01: start the three old backends locally, sandboxed, against the *_cap database copies.
# Usage: bash tools/legacy-capture/start-backends.sh <revampDir> <logDir>
# Fake keys only — they must match tools/legacy-capture/capture.cjs.
set -euo pipefail
REVAMP="$1"; LOGS="$2"
PRELOAD="$(cd "$(dirname "$0")" && pwd)/sandbox-preload.cjs"
mkdir -p "$LOGS"

COMMON=(
  ANDROID_AES_SECRET=fake-aes-old ANDROID_AES_NEW_SECRET=fake-aes-new-v2 TV_AES_NEW_SECRET=fake-aes-tv-v3
  ANDROID_V3_AES_NEW_SECRET=fake-aes-android-v3 ANDROID_SIGNING_SECRET=fake-sign-android
  ANDROID_V3_SIGNING_SECRET=fake-sign-android-v3 TV_SIGNING_SECRET=fake-sign-tv
  STORE_API_KEY=fake-store-key TOKEN_KEY=fake-token-key-123 TV_KEY_V4=fake-tv-key-v4 Android_KEY_V4=fake-android-key-v4
  ANDROID_KEY_V4=fake-android-key-v4 SESSION_SECRET=fake-session JWT_SECRET=fake-jwt JWT_DEVICE_SECRET=fake-jwt-device
  PLATFORM_KEY=fake-platform-key SITE_SECRET=fake-site-secret ENABLE_APP_SWITCHER=0 ENABLE_IBO_SAMSUNG_TRANSFER=0
  CLEAN_ANDROID_FAKE_ON_STARTUP=0 MAINTANCE_MODE=0
)

start() { # name dir port extra-env...
  local name="$1" dir="$2" port="$3"; shift 3
  ( cd "$REVAMP/$dir" && env -i PATH="$PATH" SYSTEMROOT="${SYSTEMROOT:-C:\\Windows}" "${COMMON[@]}" PORT="$port" "$@" \
      node -r "$PRELOAD" server.js > "$LOGS/$name.log" 2>&1 & echo $! > "$LOGS/$name.pid" )
  echo "started $name on :$port (pid $(cat "$LOGS/$name.pid"))"
}

start ibo iboplayer-backend 5101 NODE_ENV=atlas MONGO_DB_SERVER=mongodb://127.0.0.1:27017/ibo_cap ADMIN_ENABLED=1
start bob bobplayer-backend 5102 NODE_ENV=atlas MONGO_DB_SERVER=mongodb://127.0.0.1:27017/BobPlayer_cap
start cr cr-unified-backend 5103 NODE_ENV=develop TENANTS=cr7,family DEFAULT_TENANT=cr7 \
  APP_CR7_DB_URI=mongodb://127.0.0.1:27017/cr7_cap APP_FAMILY_DB_URI=mongodb://127.0.0.1:27017/family_cap ADMIN_ENABLED=1
