const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HTML_PATH = path.join(ROOT, "frontend", "notion_db_trend_viewer_yellow.html");
const ENV_PATH = path.join(ROOT, ".env");
const CACHE_PATH = path.join(ROOT, "notion_mock_cache.json");

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = loadEnvFile(ENV_PATH);
const config = {
  notionToken: process.env.NOTION_ACCESS_TOKEN || fileEnv.NOTION_ACCESS_TOKEN || "",
  databaseId: process.env.NOTION_DATABASE_ID || fileEnv.NOTION_DATABASE_ID || "",
  filterText: process.env.NOTION_FILTER_TEXT || fileEnv.NOTION_FILTER_TEXT || "",
  notionVersion: process.env.NOTION_VERSION || fileEnv.NOTION_VERSION || "2026-03-11",
  port: Number(process.env.PORT || fileEnv.PORT || 8787)
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function sendFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    json(res, 404, { message: "File not found" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(fs.readFileSync(filePath));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function notionFetch(apiPath, { method = "GET", body, version = config.notionVersion } = {}) {
  if (!config.notionToken) {
    throw new Error("NOTION_ACCESS_TOKEN is missing in .env");
  }

  const response = await fetch(`https://api.notion.com${apiPath}`, {
    method,
    headers: {
      "Authorization": `Bearer ${config.notionToken}`,
      "Notion-Version": version,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = { raw: text };
  }

  if (!response.ok) {
    const err = new Error(data?.message || `${response.status} ${response.statusText}`);
    err.status = response.status;
    err.payload = data;
    throw err;
  }

  return data;
}

async function fetchAllPagesForDataSource(dataSourceId, version) {
  const results = [];
  let cursor = null;

  do {
    const body = cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 };
    const response = await notionFetch(`/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body,
      version
    });
    results.push(...(response.results || []).filter(item => item.object === "page"));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return results;
}

async function fetchAllPagesLegacyDatabase(databaseId) {
  const results = [];
  let cursor = null;

  do {
    const body = cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 };
    const response = await notionFetch(`/v1/databases/${databaseId}/query`, {
      method: "POST",
      body,
      version: "2022-06-28"
    });
    results.push(...(response.results || []).filter(item => item.object === "page"));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return results;
}

function propertyContainsText(property, needle) {
  if (!property || !needle) return false;
  const keyword = String(needle).trim().toLowerCase();
  if (!keyword) return false;

  switch (property.type) {
    case "title":
      return richTextToPlain(property.title).toLowerCase().includes(keyword);
    case "rich_text":
      return richTextToPlain(property.rich_text).toLowerCase().includes(keyword);
    case "select":
      return String(property.select?.name || "").toLowerCase().includes(keyword);
    case "status":
      return String(property.status?.name || "").toLowerCase().includes(keyword);
    case "multi_select":
      return (property.multi_select || []).some(item => String(item.name || "").toLowerCase().includes(keyword));
    case "formula":
      if (property.formula?.type === "string") {
        return String(property.formula.string || "").toLowerCase().includes(keyword);
      }
      return false;
    default:
      return false;
  }
}

function propertyHasExactTag(property, needle) {
  if (!property || !needle) return false;
  const keyword = String(needle).trim().toLowerCase();
  if (!keyword) return false;

  switch (property.type) {
    case "select":
      return String(property.select?.name || "").trim().toLowerCase() === keyword;
    case "status":
      return String(property.status?.name || "").trim().toLowerCase() === keyword;
    case "multi_select":
      return (property.multi_select || []).some(item => String(item.name || "").trim().toLowerCase() === keyword);
    default:
      return false;
  }
}

function pageMatchesFilter(page, filterText) {
  if (!filterText) return true;
  const tagProperty = page.properties?.["태그"];
  if (!tagProperty) return false;
  return propertyHasExactTag(tagProperty, filterText) || propertyContainsText(tagProperty, filterText);
}

function richTextToPlain(list) {
  if (!Array.isArray(list)) return "";
  return list.map(item => item.plain_text || item.text?.content || "").join("");
}

function parseDateValue(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getPageDateTimestamp(page) {
  return parseDateValue(page?.created_time) ?? Number.MAX_SAFE_INTEGER;
}

function sortPagesByDate(pages) {
  return [...pages].sort((left, right) => {
    const leftTime = getPageDateTimestamp(left);
    const rightTime = getPageDateTimestamp(right);
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
}

async function resolveSource(id, version) {
  try {
    const ds = await notionFetch(`/v1/data_sources/${id}`, { version });
    return {
      sourceType: "data_source",
      sourceId: ds.id,
      sourceTitle: richTextToPlain(ds.title),
      databaseId: ds.parent?.database_id || "",
      databaseTitle: ""
    };
  } catch (error) {
    // fallback to database lookup
  }

  const db = await notionFetch(`/v1/databases/${id}`, { version });
  const firstSource = db.data_sources?.[0];
  return {
    sourceType: firstSource?.id ? "database" : "legacy_database",
    sourceId: firstSource?.id || "",
    sourceTitle: "",
    databaseId: db.id,
    databaseTitle: richTextToPlain(db.title || [])
  };
}

async function buildDataset(notionVersion) {
  const databaseId = String(config.databaseId || "").trim();
  if (!databaseId) {
    throw new Error("NOTION_DATABASE_ID is missing in .env");
  }

  const resolved = await resolveSource(databaseId, notionVersion);
  const rawPages = (resolved.sourceType === "data_source" || resolved.sourceType === "database")
    ? await fetchAllPagesForDataSource(resolved.sourceId, notionVersion)
    : await fetchAllPagesLegacyDatabase(databaseId);
  const pages = sortPagesByDate(rawPages);

  return {
    ...resolved,
    notionVersion,
    filterText: config.filterText,
    totalPagesBeforeFilter: rawPages.length,
    cachedAt: new Date().toISOString(),
    pages
  };
}

function writeCacheFile(payload) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/notion_db_trend_viewer.html")) {
      sendHtml(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/data/notion_mock_cache.json") {
      if (!fs.existsSync(CACHE_PATH)) {
        const dataset = await buildDataset(config.notionVersion);
        writeCacheFile(dataset);
      }
      sendFile(res, CACHE_PATH, "application/json; charset=utf-8");
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      json(res, 200, {
        notionVersion: config.notionVersion,
        hasToken: Boolean(config.notionToken),
        hasDatabaseId: Boolean(config.databaseId),
        filterText: config.filterText,
        hasCache: fs.existsSync(CACHE_PATH)
      });
      return;
    }

    if (req.method === "POST" && (url.pathname === "/api/load" || url.pathname === "/api/refresh")) {
      const body = await readJsonBody(req);
      const notionVersion = String(body.notionVersion || config.notionVersion || "2026-03-11").trim();
      const dataset = await buildDataset(notionVersion);
      writeCacheFile(dataset);
      json(res, 200, dataset);
      return;
    }

    json(res, 404, { message: "Not found" });
  } catch (error) {
    json(res, error.status || 500, {
      message: error.message || "Internal server error",
      payload: error.payload || null
    });
  }
});

server.listen(config.port, () => {
  console.log(`Notion proxy server running at http://localhost:${config.port}`);
});
