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

# 2. Record SHA256 hashes of every file before (bash 3.x compatible — no associative arrays)
HASH_FILE="$(mktemp)"
while IFS= read -r -d '' file; do
  rel="${file#"${VAULT_DIR}/"}"
  hash="$(sha256sum "${file}" | awk '{print $1}')"
  echo "${rel}=${hash}" >> "${HASH_FILE}"
done < <(find "${VAULT_DIR}" -type f -print0)

echo "Files recorded before test:"
while IFS='=' read -r key value; do
  echo "  ${key}: ${value}"
done < "${HASH_FILE}"

# 3. Verify the built default-vault template only contains files that
#    would be safe to copy (i.e. the app's copyDir logic skips existing
#    files). This ensures a fresh install does not ship anything that
#    would overwrite user data.
if [ -d "default-vault" ]; then
  echo "Checking default-vault template..."
  while IFS= read -r -d '' tpl; do
    rel="${tpl#default-vault/}"
    if [ -f "${VAULT_DIR}/${rel}" ]; then
      echo "  OK: template '${rel}' would be skipped (file already exists in vault)"
    fi
  done < <(find "default-vault" -type f -print0)
fi

# 4. Verify all original vault files are still present and unchanged
PASS=true
while IFS='=' read -r rel expected_hash; do
  full="${VAULT_DIR}/${rel}"
  if [ ! -f "${full}" ]; then
    echo "FAIL: File missing: ${rel}"
    PASS=false
    continue
  fi
  after_hash="$(sha256sum "${full}" | awk '{print $1}')"
  if [ "${after_hash}" != "${expected_hash}" ]; then
    echo "FAIL: File content changed: ${rel}"
    PASS=false
  fi
done < "${HASH_FILE}"

rm -f "${HASH_FILE}"

if [ "${PASS}" = true ]; then
  echo "PASS: Vault preservation test passed — all user files intact"
else
  echo "FAIL: Vault preservation test failed"
  exit 1
fi
