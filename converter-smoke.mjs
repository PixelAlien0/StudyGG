import fs from 'node:fs';

const port = Number(process.argv[2] || 9555);
const inputPath = process.argv[3];
const screenshotPath = process.argv[4];
const endpoint = `http://127.0.0.1:${port}`;

if (!inputPath) throw new Error('Provide a PPTX path for the converter smoke test.');

async function findPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
      const page = targets.find((item) => item.type === 'page' && item.url.includes('/converter.html'));
      if (page) return page;
    } catch {
      // Browser startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Could not find the converter page.');
}

const page = await findPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let sequence = 0;

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  sequence += 1;
  return new Promise((resolve, reject) => {
    pending.set(sequence, { resolve, reject });
    socket.send(JSON.stringify({ id: sequence, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, label, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

await send('Runtime.enable');
await send('DOM.enable');
await waitFor('document.readyState === "complete"', 'page load');
await waitFor('document.querySelector("#engine-state").classList.contains("is-ready")', 'PowerPoint engine');

const documentNode = await send('DOM.getDocument', { depth: 1 });
const inputNode = await send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: '#pptx-file' });
await send('DOM.setFileInputFiles', { nodeId: inputNode.nodeId, files: [inputPath] });
await waitFor('!document.querySelector("#selected-file").hidden && !document.querySelector("#convert-button").disabled', 'selected file');

const checks = [];
checks.push(['converter title', (await evaluate('document.title')).includes('PPTX to PDF')]);
checks.push(['PowerPoint ready', await evaluate('document.querySelector("#engine-state-text").textContent.includes("ready")')]);
checks.push(['PPTX selected', await evaluate('document.querySelector("#selected-file-name").textContent.toLowerCase().endsWith(".pptx")')]);

await evaluate('document.querySelector("#convert-button").click(); true');
await waitFor('document.querySelector("#conversion-status").dataset.state === "success"', 'successful PDF conversion');
checks.push(['PDF conversion completes', await evaluate('document.querySelector("#conversion-status-text").textContent.includes("PDF created")')]);

if (screenshotPath) {
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' });
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(screenshotPath, Buffer.from(capture.data, 'base64'));
}

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(checks.map(([name, passed]) => `${passed ? 'PASS' : 'FAIL'}: ${name}`).join('\n'));
await send('Browser.close');
socket.close();
if (failures.length) process.exit(1);
