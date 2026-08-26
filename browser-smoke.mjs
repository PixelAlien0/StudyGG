import fs from 'node:fs';

const port = Number(process.argv[2] || 9223);
const screenshotPath = process.argv[3];
const quizScreenshotPath = process.argv[4];
const endpoint = `http://127.0.0.1:${port}`;

async function target() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
      const page = targets.find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1:4173'));
      if (page) return page;
    } catch {
      // Browser is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Could not connect to the Edge debugging endpoint.');
}

const page = await target();
const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let sequence = 0;

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
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

await send('Runtime.enable');
for (let attempt = 0; attempt < 30; attempt += 1) {
  if (await evaluate('document.readyState === "complete" && Boolean(window.STUDY_DATA) && Boolean(window.CONCEPTS_DATA)')) break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}

const checks = [];
checks.push(['Topic 1 title', (await evaluate('document.title')).includes('Concepts of Computer')]);
checks.push(['both curated data sets', await evaluate('window.CONCEPTS_DATA.slides.length === 59 && window.CONCEPTS_DATA.qa.length >= 180 && window.CONCEPTS_DATA.mcq.length >= 90 && window.CONCEPTS_DATA.meta.curated && window.STUDY_DATA.slides.length === 113 && window.STUDY_DATA.qa.length >= 150 && window.STUDY_DATA.mcq.length >= 120 && window.STUDY_DATA.meta.curated')]);
checks.push(['Topic 1 selected', await evaluate('document.querySelector("#topic-select").value === "concepts" && document.querySelector("#stat-slides").textContent === "59"')]);
checks.push(['GSAP 3.15', await evaluate('window.gsap?.version === "3.15.0" && Boolean(window.ScrollTrigger) && Boolean(window.StudyMotion)')]);
await evaluate('new Promise((resolve) => setTimeout(resolve, 900))');
checks.push(['hero settles', await evaluate('Number(getComputedStyle(document.querySelector(".hero-copy h1")).opacity) > 0.99')]);
await evaluate('window.scrollTo(0, document.querySelector(".study-dashboard").offsetTop - 120); new Promise((resolve) => setTimeout(resolve, 120))');
checks.push(['dashboard stays visible', await evaluate('[...document.querySelectorAll(".study-dashboard > *")].every((node) => Number(getComputedStyle(node).opacity) > 0.99)')]);
if (screenshotPath) {
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(screenshotPath, Buffer.from(capture.data, 'base64'));
}

await evaluate('document.querySelector("[data-view-link=mcq]").click(); document.querySelector("#quiz-start").click(); true');
checks.push(['quiz starts', await evaluate('!document.querySelector("#quiz-stage").hidden && document.querySelectorAll(".option-button").length === 4')]);
checks.push(['quiz option text is clean', await evaluate('[...document.querySelectorAll(".option-button > span:last-child")].every((node) => !/^\\s*(?:[A-Z][.)]|\\d+[.)])\\s*/i.test(node.textContent))')]);
if (quizScreenshotPath) {
  await evaluate('window.scrollTo(0, 0); new Promise((resolve) => setTimeout(resolve, 250))');
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(quizScreenshotPath, Buffer.from(capture.data, 'base64'));
}
await evaluate('document.querySelector(".option-button").click(); true');
checks.push(['quiz answers', await evaluate('!document.querySelector("#quiz-feedback").hidden && [...document.querySelectorAll(".option-button")].every((button) => button.disabled)')]);

await evaluate('document.querySelector("[data-view-link=recall]").click(); document.querySelector("#recall-reveal").click(); true');
checks.push(['recall reveals', await evaluate('!document.querySelector("#recall-answer").hidden && document.querySelector("#recall-answer-text").textContent.length > 0')]);

await evaluate(`document.querySelector("[data-view-link=notes]").click(); const input=document.querySelector("#notes-search"); input.value="RAM"; input.dispatchEvent(new Event("input", {bubbles:true})); true`);
checks.push(['notes search', await evaluate('document.querySelectorAll(".slide-note").length > 0 && document.querySelector("#notes-result-count").textContent.includes("slides")')]);

await evaluate('localStorage.setItem("studyg-active-topic", "networks"); location.hash = "overview"; location.reload(); true');
for (let attempt = 0; attempt < 30; attempt += 1) {
  if (await evaluate('document.readyState === "complete" && document.querySelector("#topic-select")?.value === "networks"')) break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}
checks.push(['Topic 2 switches correctly', await evaluate('document.querySelector("#topic-select").value === "networks" && document.querySelector("#stat-slides").textContent === "113" && document.title.includes("Computer Networks I")')]);

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(checks.map(([name, passed]) => `${passed ? 'PASS' : 'FAIL'}: ${name}`).join('\n'));
await send('Browser.close');
socket.close();
if (failures.length) process.exit(1);
