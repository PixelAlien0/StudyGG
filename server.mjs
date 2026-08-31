import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const execFileAsync = promisify(execFile);
const maximumUploadBytes = 200 * 1024 * 1024;
const powerPointAvailable = process.platform === 'win32' && [
  'C:\\Program Files\\Microsoft Office\\root\\Office16\\POWERPNT.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\POWERPNT.EXE'
].some((candidate) => fs.existsSync(candidate));
let conversionBusy = false;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.pdf': 'application/pdf'
};

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function safeDownloadName(value) {
  const base = path.basename(String(value || 'presentation.pptx'), path.extname(String(value || 'presentation.pptx')));
  const cleaned = base.replace(/[^a-z0-9 _.-]+/gi, '').trim().slice(0, 120) || 'presentation';
  return `${cleaned}.pdf`;
}

async function readUpload(request) {
  const declaredLength = Number(request.headers['content-length'] || 0);
  if (declaredLength > maximumUploadBytes) throw Object.assign(new Error('The PPTX exceeds the 200 MB limit.'), { status: 413 });
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > maximumUploadBytes) throw Object.assign(new Error('The PPTX exceeds the 200 MB limit.'), { status: 413 });
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw Object.assign(new Error('The uploaded file is not a valid PPTX package.'), { status: 400 });
  }
  return buffer;
}

async function convertPresentation(request, response) {
  if (!powerPointAvailable) return json(response, 503, { error: 'High-fidelity conversion requires Windows and Microsoft PowerPoint.' });
  if (conversionBusy) return json(response, 429, { error: 'Another presentation is being converted. Please try again in a moment.' });
  let originalName;
  try {
    originalName = decodeURIComponent(String(request.headers['x-file-name'] || 'presentation.pptx'));
  } catch {
    return json(response, 400, { error: 'The uploaded filename is invalid.' });
  }
  if (path.extname(originalName).toLowerCase() !== '.pptx') return json(response, 400, { error: 'Choose a .pptx PowerPoint file.' });

  conversionBusy = true;
  let temporaryDirectory;
  try {
    const upload = await readUpload(request);
    temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'studyg-pptx-'));
    const inputPath = path.join(temporaryDirectory, 'input.pptx');
    const outputPath = path.join(temporaryDirectory, 'output.pdf');
    await fs.promises.writeFile(inputPath, upload);
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', path.join(root, 'tools', 'convert-pptx.ps1'),
      '-InputPath', inputPath,
      '-OutputPath', outputPath
    ], { timeout: 5 * 60 * 1000, windowsHide: true, maxBuffer: 1024 * 1024 });

    const pdf = await fs.promises.readFile(outputPath);
    if (pdf.length < 5 || pdf.subarray(0, 4).toString('ascii') !== '%PDF') throw new Error('PowerPoint returned an invalid PDF.');
    response.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': `attachment; filename="${safeDownloadName(originalName)}"`,
      'Cache-Control': 'no-store'
    });
    response.end(pdf);
  } catch (error) {
    if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : 'PowerPoint could not convert this presentation. Confirm that Microsoft PowerPoint is installed, then try again.' });
  } finally {
    conversionBusy = false;
    if (temporaryDirectory) await fs.promises.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

const server = http.createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (request.method === 'GET' && requestPath === '/api/converter-status') {
    return json(response, 200, { available: powerPointAvailable, engine: 'Microsoft PowerPoint', maximumUploadMB: maximumUploadBytes / 1024 / 1024 });
  }
  if (request.method === 'POST' && requestPath === '/api/convert') {
    await convertPresentation(request, response);
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD, POST' }).end('Method not allowed');
    return;
  }
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`StudyGG: http://127.0.0.1:${port}`);
});
