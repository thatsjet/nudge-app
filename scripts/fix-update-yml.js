/**
 * afterAllArtifactBuild hook for electron-builder.
 * Fixes the sha512 line-wrapping issue in latest-*.yml files where
 * base64 strings wrap at 76 chars without YAML multiline syntax,
 * causing js-yaml parse failures in electron-updater.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function (context) {
  const outputDir = context.outDir;
  const ymlFiles = fs.readdirSync(outputDir).filter(f => f.match(/^latest.*\.yml$/));

  for (const file of ymlFiles) {
    const filePath = path.join(outputDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Fix sha512 values that are split across lines.
    // Match "sha512: <base64>" where the base64 continues on the next line
    // (next line starts with non-space content that looks like base64 continuation)
    content = content.replace(
      /^(\s+sha512:\s+)(\S+)\n(\s+)(\S+==)$/gm,
      (match, prefix, part1, indent, part2) => {
        return `${prefix}${part1}${part2}`;
      }
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed YAML line wrapping in ${file}`);
  }

  return [];
};
