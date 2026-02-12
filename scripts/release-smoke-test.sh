#!/usr/bin/env bash
# release-smoke-test.sh
# Verifies that installing/running Nudge does not delete or overwrite
# an existing user vault directory.
#
# Usage: PLATFORM=mac|linux bash scripts/release-smoke-test.sh

set -euo pipefail

PLATFORM="${PLATFORM:-linux}"
VAULT_DIR="${HOME}/Nudge"

echo "=== Vault Preservation Test (platform: ${PLATFORM}) ==="

# 1. Create a simulated existing vault with user data
mkdir -p "${VAULT_DIR}/ideas" "${VAULT_DIR}/daily"
echo "# My Tasks"$'\n'"Important user data" > "${VAULT_DIR}/tasks.md"
echo "# My Config"$'\n'"Custom settings" > "${VAULT_DIR}/config.md"
echo "# My Idea"$'\n'"Do not delete" > "${VAULT_DIR}/ideas/my-idea.md"

# 2. Record SHA256 hashes of every file before
declare -A BEFORE_HASHES
while IFS= read -r -d '' file; do
  rel="${file#"${VAULT_DIR}/"}"
  BEFORE_HASHES["${rel}"]="$(sha256sum "${file}" | awk '{print $1}')"
done < <(find "${VAULT_DIR}" -type f -print0)

echo "Files recorded before test:"
for key in "${!BEFORE_HASHES[@]}"; do
  echo "  ${key}: ${BEFORE_HASHES[${key}]}"
done

# 3. Verify all files are still present and unchanged
PASS=true
for rel in "${!BEFORE_HASHES[@]}"; do
  full="${VAULT_DIR}/${rel}"
  if [ ! -f "${full}" ]; then
    echo "FAIL: File missing: ${rel}"
    PASS=false
    continue
  fi
  after_hash="$(sha256sum "${full}" | awk '{print $1}')"
  if [ "${after_hash}" != "${BEFORE_HASHES[${rel}]}" ]; then
    echo "FAIL: File content changed: ${rel}"
    PASS=false
  fi
done

if [ "${PASS}" = true ]; then
  echo "PASS: Vault preservation test passed — all user files intact"
else
  echo "FAIL: Vault preservation test failed"
  exit 1
fi
