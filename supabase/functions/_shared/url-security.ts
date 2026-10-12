export function isPrivateOrReservedIpv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.map(Number).slice(1);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || (b === 88 && c === 99) || b === 168))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}

export function isPrivateOrReservedIpv6(address: string): boolean {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mappedIpv4 = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  const segments = value.split(":");
  const firstSegment = Number.parseInt(segments[0] || "0", 16);
  const secondSegment = Number.parseInt(segments[1] || "0", 16);
  return value === "::" || value === "::1" || firstSegment < 0x2000 || firstSegment > 0x3fff
    || (firstSegment === 0x2001 && [0x0, 0x2, 0x10, 0x20, 0xdb8].includes(secondSegment))
    || firstSegment === 0x2002
    || value.startsWith("fc") || value.startsWith("fd")
    || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")
    || value.startsWith("ff") || Boolean(mappedIpv4 && isPrivateOrReservedIpv4(mappedIpv4));
}

export type DnsResolver = (hostname: string, recordType: "A" | "AAAA") => Promise<string[]>;

export async function validateProductFetchUrl(
  input: string,
  resolveDns: DnsResolver,
): Promise<{ safe: boolean; error?: string; url?: URL; pinnedAddresses?: string[] }> {
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { safe: false, error: "Only HTTP and HTTPS protocols are permitted." };
    if (url.username || url.password) return { safe: false, error: "URLs containing credentials are forbidden." };
    if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
      return { safe: false, error: "Only standard HTTP and HTTPS ports are permitted." };
    }

    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host.includes(":")) return { safe: false, error: "IPv6 literal addresses are not supported." };
    if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") {
      return { safe: false, error: "Loopback or local addresses are forbidden." };
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      if (isPrivateOrReservedIpv4(host)) return { safe: false, error: "Private or reserved IP blocks are forbidden." };
      return { safe: true, url, pinnedAddresses: [host] };
    }

    const records = await Promise.all((["A", "AAAA"] as const).map(async (type) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            resolveDns(host, type),
            new Promise<string[]>((resolve) => { timeout = setTimeout(() => resolve([]), 2_000); }),
          ]);
        } catch { return []; }
        finally { if (timeout) clearTimeout(timeout); }
    }));
    const addresses = records.flat();
    if (!addresses.length) return { safe: false, error: "The retailer hostname could not be resolved safely." };
    const isValidAddress = (address: string) => {
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return !isPrivateOrReservedIpv4(address) && address.split(".").every((part) => Number(part) <= 255);
      if (!address.includes(":")) return false;
      try { new URL(`http://[${address}]/`); } catch { return false; }
      return !isPrivateOrReservedIpv6(address);
    };
    if (addresses.some((address) => !isValidAddress(address))) {
      return { safe: false, error: "The retailer hostname resolves to a private, reserved, or invalid address." };
    }
    return { safe: true, url, pinnedAddresses: [...new Set(addresses)] };
  } catch {
    return { safe: false, error: "Invalid URL string format." };
  }
}
