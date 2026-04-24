const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const projectRoot = __dirname;
const sourceHtmlPath = path.join(projectRoot, 'index.html');
const sourceAppPath = path.join(projectRoot, 'src', 'app.entry.js');
const distDir = path.join(projectRoot, 'dist');
const assetsDir = path.join(distDir, 'assets');
const outputJsPath = path.join(assetsDir, 'app.js');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyIfExists(sourcePath, targetPath) {
  if (fs.existsSync(sourcePath)) {
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
    return true;
  }

  return false;
}

function extractInlineApp(html) {
  const match = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/i);
  if (!match) {
    throw new Error(
      'Inline app script <script type="text/babel">...</script> not found in index.html'
    );
  }
  return match[1].trim();
}

function buildHtmlShell(html) {
  const hasLoadAppModule = html.includes('loadAppModule');
  const hasModuleScript = html.includes('<script type="module" src="/assets/app.js">');
  const hasInlineBabel = html.includes('<script type="text/babel">');
  const isShellMode = (hasLoadAppModule || hasModuleScript) && !hasInlineBabel;

  if (isShellMode) {
    return (
      html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim() + '\n'
    );
  }

  const withoutInlineApp = html.replace(/<script type="text\/babel">[\s\S]*?<\/script>/i, '');
  const withoutReactCdns = withoutInlineApp
    .replace(/^\s*<!-- React & React-DOM from CDN -->\s*$/gim, '')
    .replace(
      /^\s*<script crossorigin src="https:\/\/unpkg\.com\/react@18\/umd\/react\.production\.min\.js"><\/script>\s*$/gim,
      ''
    )
    .replace(
      /^\s*<script crossorigin src="https:\/\/unpkg\.com\/react-dom@18\/umd\/react-dom\.production\.min\.js"><\/script>\s*$/gim,
      ''
    )
    .replace(/^\s*<!-- JSX Transformer -->\s*$/gim, '')
    .replace(
      /^\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone\/babel\.min\.js"><\/script>\s*$/gim,
      ''
    )
    .replace(/^\s*<!-- Tracking Script -->\s*$/gim, '')
    .replace(/^\s*<script src="\/ac-track\.js"><\/script>\s*$/gim, '')
    .replace(/<img\s+src="\/api\/entry[^"]*"[^>]*>/gim, '');

  const withBundledApp = withoutReactCdns.replace(
    /<\/body>/i,
    '    <script type="module" src="/assets/app.js"></script>\n</body>'
  );

  return (
    withBundledApp
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

async function main() {
  const sourceHtml = fs.readFileSync(sourceHtmlPath, 'utf8');
  const hasInlineScript = sourceHtml.includes('<script type="text/babel">');

  fs.rmSync(distDir, { recursive: true, force: true });
  ensureDir(assetsDir);

  if (fs.existsSync(sourceAppPath)) {
    await esbuild.build({
      entryPoints: [sourceAppPath],
      bundle: true,
      minify: true,
      sourcemap: false,
      target: ['es2020'],
      format: 'esm',
      outfile: outputJsPath,
      drop: ['console', 'debugger'],
    });
  } else if (hasInlineScript) {
    const inlineApp = extractInlineApp(sourceHtml).replace(
      /ReactDOM\.createRoot\(/g,
      'createRoot('
    );

    const entrySource = [
      "import React from 'react';",
      "import { createRoot } from 'react-dom/client';",
      "import './ac-track.js';",
      '',
      inlineApp,
    ].join('\n');
    await esbuild.build({
      stdin: {
        contents: entrySource,
        loader: 'jsx',
        resolveDir: projectRoot,
        sourcefile: 'inline-app.jsx',
      },
      bundle: true,
      minify: true,
      sourcemap: false,
      target: ['es2020'],
      format: 'esm',
      outfile: outputJsPath,
      drop: ['console', 'debugger'],
    });
  } else {
    throw new Error('Canonical source file src/app.entry.js not found');
  }

  const translationsPath = path.join(projectRoot, 'translations.js');
  if (copyIfExists(translationsPath, path.join(distDir, 'translations.js'))) {
    console.log('translations.js copied to dist');
  }

  const videoConfigPath = path.join(projectRoot, 'video-config.js');
  if (copyIfExists(videoConfigPath, path.join(distDir, 'video-config.js'))) {
    console.log('video-config.js copied to dist');
  }

  const outputHtml = buildHtmlShell(sourceHtml);
  fs.writeFileSync(path.join(distDir, 'index.html'), outputHtml, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
