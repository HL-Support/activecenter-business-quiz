const { execFileSync } = require('child_process');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const branch = git(['branch', '--show-current']);
if (branch !== 'main') {
  fail(`Production deploy blocked: expected branch main, got ${branch || '(detached)'}.`);
}

git(['fetch', 'origin', 'main']);

const status = git(['status', '--porcelain']);
if (status) {
  fail(`Production deploy blocked: working tree is not clean.\n${status}`);
}

const head = git(['rev-parse', 'HEAD']);
const originHead = git(['rev-parse', 'origin/main']);
if (head !== originHead) {
  fail('Production deploy blocked: HEAD is not pushed to origin/main.');
}

console.log('Production deploy guard passed: clean main matches origin/main.');
