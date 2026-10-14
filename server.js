// Minimal zero-dependency server for the todo app.
//   1. cp .env.example .env  and put your key in it
//   2. node server.js
//   3. open http://localhost:3000
//
// Serves index.html and proxies POST /api/summarize to the Claude API so the
// API key stays on the server and never reaches the browser.

const http = require("http");
const fs = require("fs");
const path = require("path");

// ---- Load .env (without overriding variables already set in the shell) ----
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const PORT = Number(process.env.PORT) || 3000;

if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100_000) { reject(new Error("Body too large")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function summarize(tasksText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 256,
      output_config: { effort: "low" },
      fallbacks: "default",
      system:
        "You summarize a person's todo list. Reply with exactly one sentence describing what their day looks like. No preamble, no bullet points.",
      messages: [{ role: "user", content: "Here is my todo list:\n\n" + tasksText }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || "HTTP " + res.status);
  }
  if (data.stop_reason === "refusal") {
    throw new Error("The model declined to summarize this list.");
  }
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
  if (!text) throw new Error("No summary returned.");
  return text;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/index.html"))) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(path.join(__dirname, "index.html")).pipe(res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/summarize") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const tasks = typeof body.tasks === "string" ? body.tasks.trim() : "";
      if (!tasks) return sendJson(res, 400, { error: "No tasks provided." });
      const summary = await summarize(tasks);
      return sendJson(res, 200, { summary });
    } catch (err) {
      return sendJson(res, 502, { error: err.message || String(err) });
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("Todo app running at http://localhost:" + PORT);
});
