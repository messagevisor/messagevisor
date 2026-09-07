import * as http from "http";
import * as path from "path";
import * as zlib from "zlib";

export function getContentType(filePath: string) {
  const extension = path.extname(filePath);

  switch (extension) {
    case ".js":
      return "text/javascript";
    case ".css":
      return "text/css";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    default:
      return "text/html";
  }
}

function getAcceptedEncodingQuality(header: string | undefined, encoding: string) {
  if (!header) {
    return 0;
  }

  let wildcardQuality: number | undefined;

  for (const value of header.toLowerCase().split(",")) {
    const parts = value.trim().split(";");
    const name = parts.shift()?.trim();
    const qualityPart = parts.find((part) => part.trim().startsWith("q="));
    const quality = qualityPart ? Number(qualityPart.trim().slice(2)) : 1;

    if (!Number.isFinite(quality) || quality < 0) {
      continue;
    }

    if (name === encoding) {
      return quality;
    }

    if (name === "*") {
      wildcardQuality = quality;
    }
  }

  return wildcardQuality ?? 0;
}

// The no-cache, no-transform directive on mutable data files binds
// intermediaries: it stops a proxy or CDN from altering a response in transit.
// It does not restrict this origin from serving a negotiated representation,
// so compressing here alongside that directive is correct, not a conflict.
export function getCatalogCompressionEncoding(request: http.IncomingMessage, filePath: string) {
  if (![".css", ".html", ".js", ".json"].includes(path.extname(filePath))) {
    return undefined;
  }

  const acceptEncoding = request.headers["accept-encoding"];
  const header = Array.isArray(acceptEncoding) ? acceptEncoding.join(",") : acceptEncoding;
  const brotliQuality = getAcceptedEncodingQuality(header, "br");
  const gzipQuality = getAcceptedEncodingQuality(header, "gzip");

  if (
    brotliQuality > 0 &&
    typeof zlib.brotliCompress === "function" &&
    brotliQuality >= gzipQuality
  ) {
    return "br" as const;
  }

  if (gzipQuality > 0) {
    return "gzip" as const;
  }

  return undefined;
}

export function sendCatalogResponse(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  filePath: string,
  content: Buffer,
  headers: Record<string, string>,
) {
  const compressionEncoding = getCatalogCompressionEncoding(request, filePath);
  const responseHeaders = {
    ...headers,
    Vary: "Accept-Encoding",
  };

  if (!compressionEncoding) {
    response.writeHead(200, responseHeaders);
    response.end(content);
    return;
  }

  const compressedHeaders = {
    ...responseHeaders,
    "Content-Encoding": compressionEncoding,
  };
  const compress = compressionEncoding === "br" ? zlib.brotliCompress : zlib.gzip;

  compress(content, (error, compressedContent) => {
    if (error) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Unable to compress Catalog response.");
      return;
    }

    response.writeHead(200, compressedHeaders);
    response.end(compressedContent);
  });
}

export function getCatalogCacheControl(filePath: string, outputDirectoryPath: string) {
  const relativePath = path.relative(outputDirectoryPath, filePath).split(path.sep).join("/");

  if (/(^|\/)blocks\/[^/]+\/(?!ranges\.json$)[^/]+\.json$/.test(relativePath)) {
    return "public, max-age=31536000, immutable";
  }

  // All generated data metadata is mutable and must be revalidated. This
  // includes layered index files and entity/history files whose names are not
  // known here. Without an explicit directive, browsers may heuristically
  // cache an old index and pair it with blocks from a newer export.
  if (relativePath.startsWith("data/") && relativePath.endsWith(".json")) {
    return "no-cache, no-transform";
  }

  return undefined;
}

function getCatalogLiveReloadClientScript() {
  return [
    "<script>",
    "(() => {",
    '  const source = new EventSource("/__messagevisor_catalog_reload");',
    '  source.addEventListener("reload", () => window.location.reload());',
    "  source.onerror = () => {",
    "    source.close();",
    "    setTimeout(() => window.location.reload(), 1000);",
    "  };",
    "})();",
    "</script>",
  ].join("");
}

export function injectCatalogLiveReloadClient(html: string) {
  const script = getCatalogLiveReloadClientScript();

  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}</body>`);
  }

  return `${html}${script}`;
}

export function decodeCatalogRequestUrl(url: string) {
  try {
    return decodeURIComponent(url.split("?")[0]);
  } catch {
    return undefined;
  }
}

export function resolveCatalogRequestFilePath(outputDirectoryPath: string, requestedUrl: string) {
  const requestedPath = requestedUrl === "/" ? "/index.html" : requestedUrl;
  const filePath = path.resolve(outputDirectoryPath, requestedPath.replace(/^\/+/, ""));
  const relativeFilePath = path.relative(outputDirectoryPath, filePath);

  if (
    relativeFilePath === "" ||
    relativeFilePath.startsWith("..") ||
    path.isAbsolute(relativeFilePath)
  ) {
    return undefined;
  }

  return { requestedPath, filePath };
}
