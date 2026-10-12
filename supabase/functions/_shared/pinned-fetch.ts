import { validateProductFetchUrl, type DnsResolver } from "./url-security.ts";

export interface PinnedSocket {
  read(buffer: Uint8Array): Promise<number | null>;
  write(buffer: Uint8Array): Promise<number>;
  close(): void;
}

export interface PinnedFetchTransport {
  connect(address: string, port: number): Promise<PinnedSocket>;
  startTls(socket: PinnedSocket, hostname: string): Promise<PinnedSocket>;
}

export interface PinnedHttpResponse {
  status: number;
  headers: Headers;
  body: Uint8Array;
  truncated: boolean;
  finalUrl: URL;
}

export class UnsafeProductUrlError extends Error {}

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function joinChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    const copyLength = Math.min(chunk.length, length - offset);
    result.set(chunk.subarray(0, copyLength), offset);
    offset += copyLength;
    if (offset === length) break;
  }
  return result;
}

function decodeChunkedBody(input: Uint8Array, maxBytes: number): { body: Uint8Array; truncated: boolean } {
  const body: number[] = [];
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset < input.length) {
    const lineEnd = findBytes(input.subarray(offset), new Uint8Array([13, 10]));
    if (lineEnd < 0) return { body: new Uint8Array(body), truncated: true };
    const line = decoder.decode(input.subarray(offset, offset + lineEnd)).split(";", 1)[0].trim();
    const chunkLength = Number.parseInt(line, 16);
    if (!Number.isFinite(chunkLength) || chunkLength < 0) throw new Error("Invalid chunked HTTP response.");
    offset += lineEnd + 2;
    if (chunkLength === 0) return { body: new Uint8Array(body), truncated: false };
    if (offset + chunkLength + 2 > input.length) {
      const available = input.subarray(offset, Math.min(input.length, offset + chunkLength));
      const remaining = Math.max(0, maxBytes - body.length);
      for (const byte of available.subarray(0, remaining)) body.push(byte);
      return { body: new Uint8Array(body), truncated: true };
    }
    const remaining = Math.max(0, maxBytes - body.length);
    for (const byte of input.subarray(offset, offset + Math.min(chunkLength, remaining))) body.push(byte);
    if (body.length >= maxBytes && chunkLength > remaining) return { body: new Uint8Array(body), truncated: true };
    offset += chunkLength + 2;
  }
  return { body: new Uint8Array(body), truncated: true };
}

function parseResponse(bytes: Uint8Array, maxBodyBytes: number, wireTruncated: boolean): Omit<PinnedHttpResponse, "finalUrl"> {
  const delimiter = new Uint8Array([13, 10, 13, 10]);
  const headerEnd = findBytes(bytes, delimiter);
  if (headerEnd < 0 || headerEnd > 64 * 1024) throw new Error("Retailer returned invalid or oversized HTTP headers.");
  const decoder = new TextDecoder("latin1");
  let responseHeaderStart = 0;
  let responseHeaderEnd = headerEnd;
  let statusCode: number;
  let headerLines: string[];
  while (true) {
    const lines = decoder.decode(bytes.subarray(responseHeaderStart, responseHeaderEnd)).split("\r\n");
    const statusMatch = lines.shift()?.match(/^HTTP\/1\.[01]\s+(\d{3})(?:\s|$)/) || null;
    if (!statusMatch) throw new Error("Retailer returned an invalid HTTP status line.");
    const code = Number(statusMatch[1]);
    if (code < 100 || code >= 200 || code === 101) {
      statusCode = code;
      headerLines = lines;
      break;
    }
    responseHeaderStart = responseHeaderEnd + delimiter.length;
    const nextEndRelative = findBytes(bytes.subarray(responseHeaderStart), delimiter);
    if (nextEndRelative < 0) throw new Error("Retailer returned an incomplete informational response.");
    responseHeaderEnd = responseHeaderStart + nextEndRelative;
    if (responseHeaderEnd > 64 * 1024) throw new Error("Retailer returned oversized HTTP headers.");
  }
  const headers = new Headers();
  for (const line of headerLines) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  const rawBody = bytes.subarray(responseHeaderEnd + delimiter.length);
  const encoding = headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") throw new Error("Retailer returned an unsupported compressed response.");

  let body = rawBody;
  let truncated = wireTruncated;
  if (headers.get("transfer-encoding")?.toLowerCase().split(",").map((part) => part.trim()).includes("chunked")) {
    const decoded = decodeChunkedBody(rawBody, maxBodyBytes);
    body = decoded.body;
    truncated ||= decoded.truncated;
  } else {
    const contentLength = Number(headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength >= 0 && contentLength > rawBody.length) truncated = true;
    if (body.length > maxBodyBytes) truncated = true;
    body = body.subarray(0, maxBodyBytes);
  }
  return { status: statusCode, headers, body, truncated };
}

async function requestPinnedAddress(
  url: URL,
  address: string,
  transport: PinnedFetchTransport,
  maxBodyBytes: number,
  timeoutMs: number,
): Promise<Omit<PinnedHttpResponse, "finalUrl">> {
  let socket: PinnedSocket | null = null;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectTimeout: ((error: Error) => void) | undefined;
  const timeout = new Promise<never>((_, reject) => { rejectTimeout = reject; });
  timer = setTimeout(() => {
    expired = true;
    socket?.close();
    rejectTimeout?.(new Error("Retailer request timed out."));
  }, timeoutMs);

  const operation = async () => {
    const port = url.protocol === "https:" ? 443 : 80;
    let connection = await transport.connect(address, port);
    if (expired) { connection.close(); throw new Error("Retailer request timed out."); }
    socket = connection;
    if (url.protocol === "https:") {
      connection = await transport.startTls(connection, url.hostname);
      socket = connection;
    }
    const path = `${url.pathname || "/"}${url.search}`;
    const request = new TextEncoder().encode(
      `GET ${path} HTTP/1.1\r\nHost: ${url.host}\r\nUser-Agent: WishlyProductMetadata/1.0 (+https://wishly.app)\r\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\nAccept-Language: en-US,en;q=0.9,fr;q=0.8,ar;q=0.7\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`,
    );
    let written = 0;
    while (written < request.length) {
      const count = await connection.write(request.subarray(written));
      if (!count) throw new Error("Retailer connection closed before the request was sent.");
      written += count;
    }

    const maxHeaderBytes = 64 * 1024;
    const maxWireBytes = maxHeaderBytes + maxBodyBytes + 32 * 1024;
    const chunks: Uint8Array[] = [];
    let received = 0;
    let wireTruncated = false;
    let headersComplete = false;
    const headerDelimiter = new Uint8Array([13, 10, 13, 10]);
    const buffer = new Uint8Array(16 * 1024);
    while (true) {
      const count = await connection.read(buffer);
      if (count === null) break;
      if (count === 0) continue;
      const remaining = maxWireBytes - received;
      if (count > remaining) {
        chunks.push(buffer.slice(0, remaining));
        received += remaining;
        wireTruncated = true;
        break;
      }
      chunks.push(buffer.slice(0, count));
      received += count;
      if (!headersComplete) {
        const prefix = joinChunks(chunks, received);
        headersComplete = findBytes(prefix, headerDelimiter) >= 0;
        if (!headersComplete && received > maxHeaderBytes) throw new Error("Retailer returned oversized HTTP headers.");
      }
      if (received >= maxWireBytes) { wireTruncated = true; break; }
    }
    return parseResponse(joinChunks(chunks, received), maxBodyBytes, wireTruncated);
  };

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    socket?.close();
  }
}

export async function fetchPinnedProductPage(
  input: string,
  resolveDns: DnsResolver,
  transport: PinnedFetchTransport,
  options: { maxBodyBytes?: number; timeoutMs?: number; maxRedirects?: number } = {},
): Promise<PinnedHttpResponse> {
  const maxBodyBytes = options.maxBodyBytes ?? 2.5 * 1024 * 1024;
  const deadline = Date.now() + (options.timeoutMs ?? 8_000);
  const maxRedirects = options.maxRedirects ?? 5;
  let current = input;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const remainingBeforeValidation = deadline - Date.now();
    if (remainingBeforeValidation <= 0) throw new Error("Retailer request timed out.");
    let validationTimer: ReturnType<typeof setTimeout> | undefined;
    let validation: Awaited<ReturnType<typeof validateProductFetchUrl>>;
    try {
      validation = await Promise.race([
        validateProductFetchUrl(current, resolveDns),
        new Promise<never>((_, reject) => {
          validationTimer = setTimeout(() => reject(new Error("Retailer request timed out.")), remainingBeforeValidation);
        }),
      ]);
    } finally {
      if (validationTimer) clearTimeout(validationTimer);
    }
    if (!validation.safe || !validation.url || !validation.pinnedAddresses?.length) {
      throw new UnsafeProductUrlError(validation.error || "Retailer URL could not be validated.");
    }
    if (Date.now() >= deadline) throw new Error("Retailer request timed out.");
    let response: Omit<PinnedHttpResponse, "finalUrl"> | null = null;
    const failures: unknown[] = [];
    for (const address of validation.pinnedAddresses) {
      try {
        response = await requestPinnedAddress(validation.url, address, transport, maxBodyBytes, deadline - Date.now());
        break;
      } catch (error) {
        failures.push(error);
        if (Date.now() >= deadline) throw new Error("Retailer request timed out.", { cause: error });
      }
    }
    if (!response) throw failures[failures.length - 1] || new Error("Retailer connection failed.");
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { ...response, finalUrl: validation.url };
    }
    if (!location || redirectCount === maxRedirects) throw new UnsafeProductUrlError("Too many or invalid redirects.");
    try { current = new URL(location, validation.url).href; }
    catch { throw new UnsafeProductUrlError("Redirect destination is not a valid URL."); }
  }
  throw new UnsafeProductUrlError("Too many redirects.");
}
