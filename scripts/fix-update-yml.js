/**
 * afterAllArtifactBuild hook for electron-builder.
 * Fixes the sha512 line-wrapping issue in latest-*.yml files where
 * base64 strings wrap at 76 chars without YAML multiline syntax,
 * causing js-yaml parse failures in electron-updater.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function (buildResult) {
  const outputDir = buildResult.outDir;
  const ymlFiles = fs.readdirSync(outputDir).filter(f => f.match(/^latest.*\.yml$/));

  for (const file of ymlFiles) {
    const filePath = path.join(outputDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Fix sha512 values that are split across lines.
    // electron-builder wraps base64 at 76 chars, with the continuation
    // on the next line with no indentation — join them back together.
    content = content.replace(
      /(sha512:\s+\S+)\n(\S+==)/g,
      '$1$2'
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed YAML line wrapping in ${file}`);
  }

  return [];
};
