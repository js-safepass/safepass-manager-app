#!/bin/sh
#
# Xcode Run Script build phase: pick the Capacitor server.url at build time
# based on the active Xcode configuration (Debug vs Release).
#
#   Debug   -> https://manage-staging.safepass.com  (Cloudflare staging)
#   Release -> https://manage.safepass.com          (production)
#
# The selected URL is baked into ios/App/App/capacitor.config.json by the
# `npx cap sync ios` invocation below. capacitor.config.ts reads
# process.env.CAP_SERVER_URL with the prod URL as fallback.
#
# To wire this up (one-time):
#   1. Open ios/App/App.xcworkspace in Xcode.
#   2. Select the "App" target -> Build Phases -> "+" -> New Run Script Phase.
#   3. Name it "Select Capacitor server.url".
#   4. Drag the new phase ABOVE "[CP] Copy Pods Resources" (or at least
#      above "Copy Bundle Resources") so the sync writes the JSON before the
#      bundle copy reads it.
#   5. Paste this into the script body (note the `../` — $SRCROOT in a
#      Capacitor iOS project resolves to `ios/App/`, NOT the repo root,
#      so the script lives one level up at `ios/scripts/`):
#        "$SRCROOT/../scripts/select-server-url.sh"
#   6. Uncheck "Based on dependency analysis" so it runs every build.
#
# After setup, switching between Debug and Release in the Xcode scheme editor
# (or with the standard Cmd+. scheme picker) flips the target URL automatically.

# Note: deliberately NOT using `set -e` — we want to print diagnostics on
# failure rather than abort silently. Each command checks its own exit code.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/../.."

# Xcode launches build-phase scripts with a stripped PATH that often doesn't
# include node / npx, even when they're on $PATH in an interactive shell.
# Probe every reasonable location and prepend whichever ones contain a node
# binary. Don't rely on `which` here — it uses the existing PATH, which is
# the problem we're solving.
NODE_PATHS=""
for candidate in \
  "$HOME/homebrew/bin" \
  "/opt/homebrew/bin" \
  "/usr/local/bin" \
  "$HOME/.local/bin" \
  "/usr/local/opt/node/bin" \
  "$HOME/.volta/bin" \
  "$HOME/.fnm" \
  "$HOME/n/bin" \
; do
  if [ -x "$candidate/node" ]; then
    NODE_PATHS="$NODE_PATHS:$candidate"
  fi
done

# nvm: not a regular install — source its init script and let it own PATH.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
fi

export PATH="$NODE_PATHS:$PATH"

# Verify we can find npx before going further. If not, print the diagnostic
# the user will need to fix this manually.
if ! command -v npx >/dev/null 2>&1; then
  echo "error: [capacitor] npx not found on PATH" >&2
  echo "error: [capacitor]   PATH=$PATH" >&2
  echo "error: [capacitor]   Checked: $HOME/homebrew/bin, /opt/homebrew/bin, /usr/local/bin, $HOME/.local/bin, /usr/local/opt/node/bin, $HOME/.volta/bin, $HOME/.fnm, $HOME/n/bin, plus nvm" >&2
  echo "error: [capacitor]   Add the directory containing your node/npx to NODE_PATHS in $0" >&2
  exit 1
fi

case "$CONFIGURATION" in
  Debug)
    SERVER_URL="https://manage-staging.safepass.com"
    ;;
  Release|*)
    # Anything other than Debug falls back to production. Treating unknown
    # configurations as "prod by default" avoids accidentally shipping a
    # staging URL on a misnamed scheme.
    SERVER_URL="https://manage.safepass.com"
    ;;
esac

echo "[capacitor] CONFIGURATION=$CONFIGURATION -> $SERVER_URL"
echo "[capacitor] node: $(command -v node) ($(node --version 2>/dev/null))"

cd "$REPO_ROOT" || { echo "error: [capacitor] cd to repo root failed: $REPO_ROOT" >&2; exit 1; }

CAP_SERVER_URL="$SERVER_URL" npx cap sync ios
SYNC_EXIT=$?

if [ $SYNC_EXIT -ne 0 ]; then
  echo "error: [capacitor] cap sync ios failed with exit code $SYNC_EXIT" >&2
  exit $SYNC_EXIT
fi

exit 0
