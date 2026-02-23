/**
 * afterAllArtifactBuild hook for electron-builder.
 * Fixes the sha512 line-wrapping issue in latest-*.yml files where
 * base64 strings wrap at 76 chars without YAML multiline syntax,
 * causing js-yaml parse failures in electron-updater.
 *
 * Handles edge cases:
 *  - Any hash field (sha512, sha256, etc.)
 *  - Base64 with =, ==, or no padding
 *  - Multiple continuation lines from very long values
 *  - Continuation lines with or without leading whitespace
 */
const fs = require('fs');
const path = require('path');

function fixWrappedHashes(content) {
  const lines = content.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Match a line containing a hash field with a base64 value
    // Handles both indented (  sha512: ...) and top-level (sha512: ...)
    const hashMatch = line.match(/^(\s*sha\d+:\s+)([A-Za-z0-9+/]+=*)$/);

    if (hashMatch) {
      // Check if subsequent lines are base64 continuations:
      // - only base64 characters (letters, digits, +, /, =)
      // - not a YAML key (no colon after text)
      // - optionally preceded by whitespace
      let joined = line;
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const contMatch = nextLine.match(/^\s*([A-Za-z0-9+/]+=*)\s*$/);
        // Stop if it looks like a YAML key (contains ": " or ends with ":")
        if (contMatch && !nextLine.includes(': ') && !nextLine.match(/:\s*$/)) {
          joined += contMatch[1];
          i++;
        } else {
          break;
        }
      }
      result.push(joined);
    } else {
      result.push(line);
    }
    i++;
  }

  return result.join('\n');
}

module.exports = async function (buildResult) {
  const outputDir = buildResult.outDir;
  const ymlFiles = fs.readdirSync(outputDir).filter(f => f.match(/^latest.*\.yml$/));

  for (const file of ymlFiles) {
    const filePath = path.join(outputDir, file);
    const original = fs.readFileSync(filePath, 'utf8');
    const fixed = fixWrappedHashes(original);

    if (fixed !== original) {
      fs.writeFileSync(filePath, fixed, 'utf8');
      console.log(`Fixed YAML line wrapping in ${file}`);
    }
  }

  return [];
};

// Allow direct invocation for testing: node fix-update-yml.js <file>
if (require.main === module && process.argv[2]) {
  const filePath = process.argv[2];
  const original = fs.readFileSync(filePath, 'utf8');
  const fixed = fixWrappedHashes(original);
  if (fixed !== original) {
    fs.writeFileSync(filePath, fixed, 'utf8');
    console.log('Fixed:', filePath);
  } else {
    console.log('No changes needed:', filePath);
  }
}
