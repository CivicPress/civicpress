// Minimal CivicPress coding-assistant runner (OpenAI-compatible).
// Works with LM Studio, Ollama (with OpenAI proxy), or vLLM.
// Usage: pnpm run assist "Add CLI: sync-sessions with tests and docs"

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Config (env or defaults) ----------
const RAW_BASE = (process.env.CIVIC_LLM_BASE || "http://localhost:1234/v1").replace(/\/$/, "");
const BASE_URL = RAW_BASE.endsWith("/v1") ? RAW_BASE : `${RAW_BASE}/v1`;
const API_KEY  = process.env.CIVIC_LLM_KEY || process.env.OPENAI_API_KEY || "lm-studio";
const MODEL    = process.env.CIVIC_LLM_MODEL|| "local-model";
const TOP_K    = Number(process.env.CIVIC_TOP_K || 12);
const IS_OPENAI = /api\.openai\.com/.test(BASE_URL);
const TIMEOUT_MS = Number(process.env.CIVIC_LLM_TIMEOUT_MS || 1500);

// Where your assistant brain lives
const ROOT = path.resolve(__dirname, "../.."); // repo root
const AGENTS = path.join(ROOT, "agent", "coding-assistant");

// ---------- Helpers ----------
function read(p) { return fs.readFileSync(p, "utf8"); }
function safeRead(p) { try { return read(p); } catch { return ""; } }
function listFiles(globs) {
  // Tiny glob impl: expand '**/*' under a base dir set; keep simple & fast.
  // We only need a few known dirs, so walk them.
  const out = [];
  const bases = new Set();
  for (const g of globs) {
    const base = g.split("/**")[0];
    bases.add(path.resolve(ROOT, base));
  }
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) stack.push(p);
        else out.push(p);
      }
    }
  }
  return out;
}

function keywordScore(text, q) {
  const s = q.toLowerCase();
  const t = text.toLowerCase();
  let score = 0;
  if (t.includes(s)) score += 5;
  for (const w of s.split(/\s+/)) if (w && t.includes(w)) score += 1;
  return score;
}

function topKFiles(query, include, exclude, k = TOP_K) {
  const files = listFiles(include)
    .filter(p => {
      const rel = path.relative(ROOT, p).split(path.sep).join("/");
      return !exclude.some(e => globToRegExp(e).test(rel));
    });
  const scored = [];
  for (const f of files) {
    const txt = safeRead(f);
    if (!txt) continue;
    const s = keywordScore(txt, query);
    if (s > 0) scored.push({ path: f, score: s, text: txt.slice(0, 8000) }); // cap
  }
  scored.sort((a,b) => b.score - a.score);
  return scored.slice(0, k);
}

// robust glob -> regex (supports **, *, ? ; path-style semantics)
function globToRegExp(glob) {
  const GLOBSTAR = "\x00GLOBSTAR\x00";
  let pattern = String(glob).replace(/\*\*/g, GLOBSTAR);
  // Escape regex specials except glob tokens * and ?
  pattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Convert single-segment wildcards
  pattern = pattern.replace(/\*/g, "[^/]*").replace(/\?/g, ".");
  // Restore ** to match across path separators
  pattern = pattern.replace(new RegExp(GLOBSTAR, "g"), ".*");
  return new RegExp("^" + pattern + "$");
}

// ---------- Load assistant “brain” ----------
const focus    = safeRead(path.join(AGENTS, "prompts/focus.md"));
const codegen  = safeRead(path.join(AGENTS, "prompts/codegen.md"));
const project  = safeRead(path.join(AGENTS, "project.yml"));
const glossary = safeRead(path.join(AGENTS, "glossary.yml"));
const rules    = safeRead(path.join(AGENTS, "conventions.md"));
const registries = [
  safeRead(path.join(AGENTS, "registries/cli.yml")),
  safeRead(path.join(AGENTS, "registries/endpoints.yml")),
  safeRead(path.join(AGENTS, "registries/components.yml"))
].join("\n---\n");

const retrievalCfgPath = path.join(AGENTS, "retrieval.config.json");
const retrievalCfg = fs.existsSync(retrievalCfgPath)
  ? JSON.parse(read(retrievalCfgPath))
  : {
      include: [
        "agent/coding-assistant/**",
        "modules/**/{components,composables,pages,server,docs,tests}/**/*",
        "tools/cli/**/*",
        "README*.md","roadmap*.md","manifesto*.md"
      ],
      exclude: ["node_modules/**",".git/**","**/dist/**","**/.nuxt/**","**/.output/**"]
    };

// ---------- Build query from CLI args ----------
const task = process.argv.slice(2).join(" ").trim();
if (!task) {
  console.error("Usage: node tools/coding-assistant/index.mjs \"<your task>\"");
  process.exit(1);
}

// ---------- Retrieve context ----------
const hits = topKFiles(task, retrievalCfg.include, retrievalCfg.exclude, TOP_K);
const contextBlob = [
  "### PROJECT.YML", project,
  "\n### GLOSSARY.YML", glossary,
  "\n### CONVENTIONS.MD", rules,
  "\n### REGISTRIES", registries,
  "\n### MATCHED REPO CONTEXT (top-k)",
  ...hits.map(h => `\n---\n# ${path.relative(ROOT, h.path)}\n${h.text}`)
].join("\n");

// ---------- Connectivity/status check ----------
function authHeaders() {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : undefined;
}

async function checkLLMStatus() {
  const url = BASE_URL.replace(/\/$/, "");
  const probe = `${url}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(probe, { method: "GET", headers: authHeaders(), signal: controller.signal });
    clearTimeout(timer);
    if (res.status === 401) return { reachable: true, unauthorized: true };
    return { reachable: res.ok, unauthorized: false };
  } catch {
    clearTimeout(timer);
    return { reachable: false, unauthorized: false };
  }
}

async function checkLLMReachable() {
  const status = await checkLLMStatus();
  return status.reachable && !status.unauthorized;
}

// (detectOllamaServer removed; use detectOllamaAnywhere)
async function detectOllamaAnywhere() {
  const candidates = [
    BASE_URL.replace(/\/?v1$/, ""),
    "http://127.0.0.1:11434",
    "http://localhost:11434"
  ];
  const seen = new Set();
  for (const base of candidates) {
    if (!base || seen.has(base)) continue;
    seen.add(base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/api/tags`, { method: "GET", signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return base;
    } catch {
      clearTimeout(timer);
    }
  }
  return null;
}

// ---------- Call local LLM ----------
const client = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY });

const messages = [
  { role: "system", content: focus },
  { role: "system", content: codegen },
  { role: "user", content:
`Task: ${task}

Follow the CONSISTENCY CONTRACT.
Return in this order:
1) Plan (files to add/modify; reference templates & registries)
2) Code
3) Tests (Vitest)
4) Doc stub (Markdown)
5) Next steps (lint/test/registry commands)

Context:
${contextBlob}
` }
];

try {
  const status = await checkLLMStatus();
  if (status.unauthorized) {
    console.error(
      `OpenAI authorization failed (401).\n` +
      `Set your API key and retry:\n` +
      `  export OPENAI_API_KEY=sk-...\n` +
      `  pnpm run assist:openai \"Your task here\"`
    );
    process.exit(1);
  }
  if (!status.reachable) {
    if (IS_OPENAI) {
      console.error(
        `Could not reach OpenAI at ${BASE_URL}.\n` +
        `- Ensure network connectivity, and\n` +
        `- Set your API key (OPENAI_API_KEY or CIVIC_LLM_KEY), e.g.:\n` +
        `    export OPENAI_API_KEY=sk-...\n` +
        `    pnpm run assist:openai \"Your task here\"`
      );
    } else {
      const ollama = await detectOllamaAnywhere();
      if (ollama) {
        console.error(
          `Detected an Ollama server at ${ollama}, but the assistant expects an OpenAI-compatible /v1 API.\n` +
          `You can run a local OpenAI-compatible proxy (LiteLLM) that forwards to Ollama:\n` +
          `  pipx run litellm --model ollama/llama3.1:8b --host 127.0.0.1 --port 1234 --ollama_base_url ${ollama}\n` +
          `If the model is missing, pull it first:\n` +
          `  ollama pull llama3.1:8b\n` +
          `Then set CIVIC_LLM_BASE to the proxy (we append /v1 automatically):\n` +
          `  export CIVIC_LLM_BASE=http://127.0.0.1:1234\n` +
          `Or switch to OpenAI directly:\n` +
          `  pnpm run assist:openai \"Your task here\"`
        );
      } else {
        console.error(
          `Could not connect to LLM server at ${BASE_URL}.\n` +
          `- Start your local server (e.g., LM Studio / Ollama proxy / vLLM).\n` +
          `  Example (vLLM):\n` +
          `    python -m vllm.entrypoints.openai.api_server --model meta-llama/Meta-Llama-3.1-8B-Instruct --host 127.0.0.1 --port 1234\n` +
          `  Example (Ollama via LiteLLM proxy):\n` +
          `    pipx run litellm --model ollama/llama3.1:8b --host 127.0.0.1 --port 1234 --ollama_base_url http://localhost:11434\n` +
          `    (If the model is missing, run: ollama pull llama3.1:8b)\n` +
          `- Or use: pnpm run assist:openai \"Your task here\", or\n` +
          `- Set CIVIC_LLM_BASE/CIVIC_LLM_KEY/CIVIC_LLM_MODEL as needed.`
        );
      }
    }
    process.exit(1);
  }

  const resp = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages
  });
  console.log(resp.choices?.[0]?.message?.content ?? "(no content)");
} catch (err) {
  const msg = err?.message ?? '';
  const code = err?.code ?? err?.cause?.code ?? '';
  const name = err?.name ?? '';
  const details = typeof err === 'object' && err ? JSON.stringify(err, null, 2) : '';
  const haystack = `${msg}\n${details}`.toLowerCase();

  const looksLikeNetworkIssue =
    /APIConnectionError/i.test(String(name)) ||
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(String(code)) ||
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|fetch failed|AbortError|network|timeout/i.test(msg);

  if (looksLikeNetworkIssue) {
    if (!IS_OPENAI) {
      const ollama = await detectOllamaAnywhere().catch(() => null);
      if (ollama) {
        console.error(`❌ Detected an Ollama server at ${ollama}, but an OpenAI-compatible /v1 API is required.
Use a local proxy (LiteLLM) that forwards to Ollama:
  pipx run litellm --model ollama/llama3.1:8b --host 127.0.0.1 --port 1234 --ollama_base_url ${ollama}
If the model is missing, pull it first:
  ollama pull llama3.1:8b
Then set:
  export CIVIC_LLM_BASE=http://127.0.0.1:1234
Or switch to OpenAI directly:
  pnpm run assist:openai "Your task here"`);
      } else {
        console.error(`❌ Could not reach LLM server at ${BASE_URL}.
Make sure your local model is running (LM Studio/Ollama/vLLM) or switch to OpenAI:
  pnpm run assist:openai "Your task here"
Example (vLLM):
  python -m vllm.entrypoints.openai.api_server --model meta-llama/Meta-Llama-3.1-8B-Instruct --host 127.0.0.1 --port 1234
Example (Ollama via LiteLLM proxy):
  pipx run litellm --model ollama/llama3.1:8b --host 127.0.0.1 --port 1234 --ollama_base_url http://localhost:11434
  (If the model is missing, run: ollama pull llama3.1:8b)`);
      }
    } else {
      console.error(`❌ Could not reach OpenAI at ${BASE_URL}.
Set your API key and retry:
  export OPENAI_API_KEY=sk-...
  pnpm run assist:openai "Your task here"`);
    }
    process.exit(1);
  }

  if (/unauthorized|invalid[_\s-]?api[_\s-]?key|incorrect api key/i.test(haystack)) {
    console.error(`❌ OpenAI authorization failed.
Set your API key and retry:
  export OPENAI_API_KEY=sk-...
  pnpm run assist:openai "Your task here"`);
    process.exit(1);
  }

  // Model-not-found guidance (Ollama/LiteLLM/vLLM)
  if (/model\s+.*not\s+found|unknown\s+model|no\s+such\s+model/.test(haystack)) {
    console.error(`❌ Model not available on the backend.
If you're using Ollama, pull the model first:
  ollama pull llama3.1:8b
If you're proxying via LiteLLM, ensure it references the same model:
  pipx run litellm --model ollama/llama3.1:8b --host 127.0.0.1 --port 1234 --ollama_base_url http://127.0.0.1:11434
Then make sure this env matches your proxy:
  export CIVIC_LLM_BASE=http://127.0.0.1:1234
  export CIVIC_LLM_MODEL=ollama/llama3.1:8b
(For vLLM, use: meta-llama/Meta-Llama-3.1-8B-Instruct)
Raw error: ${msg}`);
    process.exit(1);
  }

  console.error('❌ LLM request failed:', msg || err);
  process.exit(1);
}