import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const failures = [];
const required = [
  'index.html',
  'styles.css',
  'app.js',
  'motion.js',
  'assets/concepts-data.js',
  'assets/study-data.js',
  'assets/concepts/source-deck.pdf',
  'assets/source-deck.pdf',
  'assets/vendor/gsap.min.js',
  'assets/vendor/ScrollTrigger.min.js'
];
required.forEach((file) => {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
});

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/concepts-data.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/study-data.js'), 'utf8'), context);
const genericPrompt = /^(?:Which exact|What exact statement|Recite all points|PPT statement belongs)/i;
const sourceListMarker = /^\s*(?:[A-Z][.)]|\(?[ivx]+\)[.)]?|[ivx]+[.)]|\d+[.)])\s*/i;

function validateTopic(data, label, minimumQa, minimumMcq) {
  if (data.slides.length !== data.meta.slideCount) failures.push(`${label}: slide metadata count mismatch`);
  if (data.qa.length !== data.meta.qaCount) failures.push(`${label}: Q&A count mismatch`);
  if (data.mcq.length !== data.meta.mcqCount) failures.push(`${label}: MCQ count mismatch`);
  if (!data.meta.curated || !data.meta.exactSourceSupport) failures.push(`${label}: bank is not curated and source-supported`);
  if (data.qa.length < minimumQa) failures.push(`${label}: expected at least ${minimumQa} Q&A cards, found ${data.qa.length}`);
  if (data.mcq.length < minimumMcq) failures.push(`${label}: expected at least ${minimumMcq} MCQs, found ${data.mcq.length}`);
  const qaIds = new Set();
  data.qa.forEach((item) => {
    if (qaIds.has(item.id)) failures.push(`${label}: duplicate Q&A id ${item.id}`);
    qaIds.add(item.id);
    if (!item.answer.trim()) failures.push(`${label}: empty answer in ${item.id}`);
    if (!item.sourceLine?.trim()) failures.push(`${label}: missing source support in ${item.id}`);
    if (genericPrompt.test(item.prompt)) failures.push(`${label}: generic prompt remains in ${item.id}`);
  });
  const mcqIds = new Set();
  data.mcq.forEach((item) => {
    if (mcqIds.has(item.id)) failures.push(`${label}: duplicate MCQ id ${item.id}`);
    mcqIds.add(item.id);
    if (item.options.length !== 4) failures.push(`${label}: MCQ ${item.id} does not have four options`);
    if (item.options[item.correctIndex] !== item.answer) failures.push(`${label}: correct index mismatch in ${item.id}`);
    if (new Set(item.options.map((option) => option.toLowerCase())).size !== 4) failures.push(`${label}: duplicate options in ${item.id}`);
    if (item.options.some((option) => sourceListMarker.test(option))) failures.push(`${label}: source list marker remains in ${item.id}`);
    if (!item.sourceLine?.trim()) failures.push(`${label}: missing MCQ source support in ${item.id}`);
    if (genericPrompt.test(item.prompt)) failures.push(`${label}: generic MCQ prompt remains in ${item.id}`);
  });
}

const concepts = context.window.CONCEPTS_DATA;
const networks = context.window.STUDY_DATA;
validateTopic(concepts, 'Topic 1', 180, 90);
validateTopic(networks, 'Topic 2', 150, 120);

const slideImages = fs.readdirSync(path.join(root, 'assets/slides')).filter((file) => /^slide-\d{3}\.png$/.test(file));
if (slideImages.length !== 113) failures.push(`Expected 113 slide images, found ${slideImages.length}`);
const conceptImages = fs.readdirSync(path.join(root, 'assets/concepts/slides')).filter((file) => /^slide-\d{3}\.png$/.test(file));
if (conceptImages.length !== 59) failures.push(`Expected 59 Topic 1 slide images, found ${conceptImages.length}`);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) failures.push(`Duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Verified Topic 1: ${concepts.slides.length} slides, ${concepts.qa.length} Q&A cards, ${concepts.mcq.length} MCQs.`);
console.log(`Verified Topic 2: ${networks.slides.length} slides, ${networks.qa.length} Q&A cards, ${networks.mcq.length} MCQs.`);
