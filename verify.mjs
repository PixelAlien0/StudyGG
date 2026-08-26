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
  'assets/study-data.js',
  'assets/source-deck.pdf',
  'assets/vendor/gsap.min.js',
  'assets/vendor/ScrollTrigger.min.js'
];
required.forEach((file) => {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
});

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/study-data.js'), 'utf8'), context);
const data = context.window.STUDY_DATA;

if (data.meta.slideCount !== 113) failures.push(`Expected 113 slides, found ${data.meta.slideCount}`);
if (data.slides.length !== data.meta.slideCount) failures.push('Slide metadata count does not match meta.slideCount');
if (data.qa.length !== data.meta.qaCount) failures.push('Q&A count does not match meta.qaCount');
if (data.mcq.length !== data.meta.mcqCount) failures.push('MCQ count does not match meta.mcqCount');
if (!data.meta.curated || !data.meta.exactSourceSupport) failures.push('Study bank is not marked as curated and source-supported');
if (data.qa.length < 150) failures.push(`Expected at least 150 curated Q&A cards, found ${data.qa.length}`);
if (data.mcq.length < 120) failures.push(`Expected at least 120 curated MCQs, found ${data.mcq.length}`);

const qaIds = new Set();
const genericPrompt = /^(?:Which exact|What exact statement|Recite all points|PPT statement belongs)/i;
data.qa.forEach((item) => {
  if (qaIds.has(item.id)) failures.push(`Duplicate Q&A id ${item.id}`);
  qaIds.add(item.id);
  if (!item.answer.trim()) failures.push(`Empty answer in ${item.id}`);
  if (!item.sourceLine?.trim()) failures.push(`Missing source support in ${item.id}`);
  if (genericPrompt.test(item.prompt)) failures.push(`Generic prompt remains in ${item.id}`);
});

const mcqIds = new Set();
const sourceListMarker = /^\s*(?:[A-Z][.)]|\(?[ivx]+\)[.)]?|[ivx]+[.)]|\d+[.)])\s*/i;
data.mcq.forEach((item) => {
  if (mcqIds.has(item.id)) failures.push(`Duplicate MCQ id ${item.id}`);
  mcqIds.add(item.id);
  if (item.options.length !== 4) failures.push(`MCQ ${item.id} does not have four options`);
  if (item.options[item.correctIndex] !== item.answer) failures.push(`Correct index mismatch in ${item.id}`);
  if (new Set(item.options.map((option) => option.toLowerCase())).size !== 4) failures.push(`Duplicate options in ${item.id}`);
  if (item.options.some((option) => sourceListMarker.test(option))) failures.push(`Source list marker remains in ${item.id}`);
  if (!item.sourceLine?.trim()) failures.push(`Missing MCQ source support in ${item.id}`);
  if (genericPrompt.test(item.prompt)) failures.push(`Generic MCQ prompt remains in ${item.id}`);
});

const slideImages = fs.readdirSync(path.join(root, 'assets/slides')).filter((file) => /^slide-\d{3}\.png$/.test(file));
if (slideImages.length !== 113) failures.push(`Expected 113 slide images, found ${slideImages.length}`);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) failures.push(`Duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Verified: ${data.slides.length} slides, ${data.qa.length} Q&A cards, ${data.mcq.length} MCQs, ${slideImages.length} slide images.`);
