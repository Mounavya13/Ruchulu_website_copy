import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const ROOT = fileURLToPath(new URL(".", import.meta.url));

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
};

function sendError(response, status, message, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    ...headers,
  });
  response.end(message);
}

function resolveFilePath(requestUrl, host) {
  const pathname = decodeURIComponent(
    new URL(requestUrl, `http://${host}`).pathname,
  );
  const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(ROOT, requestedPath));
  const pathFromRoot = relative(ROOT, filePath);

  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) return null;
  return filePath;
}

function parseRange(rangeHeader, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;

  const start = match[1] ? Number(match[1]) : 0;
  const end = Math.min(match[2] ? Number(match[2]) : fileSize - 1, fileSize - 1);

  if (start > end || start >= fileSize) return null;
  return { start, end };
}

function streamFile(response, filePath, options = {}) {
  createReadStream(filePath, options).pipe(response);
}

const server = createServer(async (request, response) => {
  let filePath;
  try {
    filePath = resolveFilePath(request.url, request.headers.host);
  } catch {
    sendError(response, 400, "Bad request");
    return;
  }

  if (!filePath) {
    sendError(response, 403, "Forbidden");
    return;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) {
      sendError(response, 404, "Not found");
      return;
    }

    const contentType = MIME_TYPES[extname(filePath)] || "application/octet-stream";
    const rangeHeader = request.headers.range;
    const isVideo = contentType === "video/mp4";

    if (rangeHeader && isVideo) {
      const range = parseRange(rangeHeader, file.size);
      if (!range) {
        sendError(response, 416, "", {
          "Content-Range": `bytes */${file.size}`,
        });
        return;
      }

      response.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Length": range.end - range.start + 1,
        "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
        "Content-Type": contentType,
      });
      streamFile(response, filePath, range);
      return;
    }

    response.writeHead(200, {
      "Accept-Ranges": isVideo ? "bytes" : "none",
      "Cache-Control": "no-store",
      "Content-Length": file.size,
      "Content-Type": contentType,
    });
    streamFile(response, filePath);
  } catch {
    sendError(response, 404, "Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mr. Biriyaniwala is serving at http://${HOST}:${PORT}`);
});
