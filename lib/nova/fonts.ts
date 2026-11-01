import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

type FontEnvironment = Readonly<Record<string, string | undefined>>;
const MAX_FONT_BYTES = 2_000_000;
/** Names match the owner-downloaded assets. Binaries remain outside the source/public bundle. */
export const NOVA_FONT_FILES = Object.freeze({
  "sans-roman": "AnthropicSans_Roman_Web-s.p.1e3n6bt4oqimz.woff2",
  "sans-italic": "AnthropicSans_Italic_Web-s.p.212cqpul8-axk.woff2",
  "mono-roman": "AnthropicMono_Roman_Web-s.p.16xhthj2n-pap.woff2",
  "mono-italic": "AnthropicMono_Italic_Web-s.p.0x1wr-4z1xgw3.woff2",
});
function fontDirectory(environment: FontEnvironment) {
  const value = environment.ENA_NOVA_FONT_DIRECTORY?.trim();
  return value && isAbsolute(value) && !value.includes("\0") ? value : null;
}
/** The page serializes only this switch, never the configured filesystem directory. */
export function novaWebFontsEnabled(environment: FontEnvironment = process.env): boolean {
  return fontDirectory(environment) !== null;
}
function notFound() { return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }); }

export async function serveNovaFont(style: string, environment: FontEnvironment = process.env): Promise<Response> {
  const directory = fontDirectory(environment);
  if (!directory || !Object.hasOwn(NOVA_FONT_FILES, style)) return notFound();
  try {
    const root = await realpath(directory);
    const filename = NOVA_FONT_FILES[style as keyof typeof NOVA_FONT_FILES];
    // Fixed basename only, with no final symlink traversal outside the configured folder.
    const file = await open(join(root, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await file.stat();
      if (!metadata.isFile() || metadata.size < 4 || metadata.size > MAX_FONT_BYTES) return notFound();
      // A bounded read also rejects files that grow after stat; never read an unbounded asset.
      const buffer = Buffer.alloc(MAX_FONT_BYTES + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead !== metadata.size || bytesRead > MAX_FONT_BYTES || buffer.toString("ascii", 0, 4) !== "wOF2") return notFound();
      return new Response(new Uint8Array(buffer.subarray(0, bytesRead)), { headers: {
        "content-type": "font/woff2", "content-length": String(bytesRead),
        "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff",
      } });
    } finally { await file.close(); }
  } catch { return notFound(); }
}
