import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { Plugin } from "vite";

let sharpWarned = false;
function warnSharpMissing() {
  if (sharpWarned) return;
  sharpWarned = true;
  // biome-ignore lint/suspicious/noConsole: intentional build-time warning
  console.warn(
    "\n[zero:image] sharp not installed — images will not be optimized. Install for full support: bun add -D sharp\n",
  );
}

// ─── Image processing Vite plugin ──────────────────────────────────────────
//
// Processes images at build time:
// - Generates multiple sizes for responsive srcset
// - Converts to modern formats (WebP, AVIF)
// - Creates tiny blur placeholders (base64 inline)
// - Outputs optimized images to the build directory
//
// Usage in code:
//   import heroImg from "./hero.jpg?optimize"
//   // → { src, srcset, width, height, placeholder }
//
// Or use the component helper:
//   import { Image } from "@pyreon/zero/image"
//   <Image src="/hero.jpg" width={1920} height={1080} optimize />

export interface ImagePluginConfig {
  /** Output directory for processed images. Default: "assets/img" */
  outDir?: string;
  /** Default widths for responsive images. Default: [640, 1024, 1920] */
  widths?: number[];
  /** Output formats. Default: ["webp"] */
  formats?: ImageFormat[];
  /** Quality for lossy formats (1-100). Default: 80 */
  quality?: number;
  /** Blur placeholder size in px. Default: 16 */
  placeholderSize?: number;
  /** File patterns to process. Default: /\.(jpe?g|png|webp|avif)$/i */
  include?: RegExp;
}

export type ImageFormat = "webp" | "avif" | "jpeg" | "png";

/** Per-format source set for <picture> <source> elements. */
export interface FormatSource {
  /** MIME type. e.g. "image/webp", "image/avif" */
  type: string;
  /** srcset string for this format. e.g. "/img-640.webp 640w, /img-1920.webp 1920w" */
  srcset: string;
}

export interface ProcessedImage {
  /** Fallback source path (last format, largest width). */
  src: string;
  /** Fallback srcset string (last format). */
  srcset: string;
  /** Intrinsic width. */
  width: number;
  /** Intrinsic height. */
  height: number;
  /** Base64 blur placeholder data URI. */
  placeholder: string;
  /** Per-format source sets for <picture> element. Ordered by priority (best format first). */
  formats: FormatSource[];
  /** Flat list of all sources. */
  sources: Array<{ src: string; width: number; format: string }>;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|avif)$/i;

/**
 * Zero image processing Vite plugin.
 *
 * Transforms image imports with query params into optimized responsive images:
 *
 * @example
 * // vite.config.ts
 * import { imagePlugin } from "@pyreon/zero/image-plugin"
 *
 * export default {
 *   plugins: [
 *     pyreon(),
 *     zero(),
 *     imagePlugin({ widths: [480, 960, 1440], quality: 85 }),
 *   ],
 * }
 *
 * @example
 * // In a component — import with ?optimize
 * import hero from "./images/hero.jpg?optimize"
 * // hero = { src, srcset, width, height, placeholder }
 *
 * <Image {...hero} alt="Hero" priority />
 */
export function imagePlugin(config: ImagePluginConfig = {}): Plugin {
  const defaultWidths = config.widths ?? [640, 1024, 1920];
  const defaultFormats = config.formats ?? ["webp"];
  const quality = config.quality ?? 80;
  const placeholderSize = config.placeholderSize ?? 16;
  const outSubDir = config.outDir ?? "assets/img";
  const include = config.include ?? IMAGE_EXT_RE;

  let root = "";
  let outDir = "";
  let isBuild = false;

  return {
    name: "pyreon-zero-images",
    enforce: "pre",

    configResolved(resolvedConfig) {
      root = resolvedConfig.root;
      outDir = resolvedConfig.build.outDir;
      isBuild = resolvedConfig.command === "build";
    },

    async resolveId(id) {
      // Handle ?optimize query on image imports
      if (id.includes("?optimize") && include.test(id.split("?")[0]!)) {
        return `\0virtual:zero-image:${id}`;
      }
      return null;
    },

    async load(id) {
      if (!id.startsWith("\0virtual:zero-image:")) return null;

      const rawPath = id.replace("\0virtual:zero-image:", "").split("?")[0] ?? id;
      const absPath = rawPath.startsWith("/") ? join(root, "public", rawPath) : rawPath;

      if (!isBuild) {
        const result = await loadDevImage(absPath, rawPath, placeholderSize);
        return `export default ${JSON.stringify(result)}`;
      }

      const processed = await processImage(absPath, {
        widths: defaultWidths,
        formats: defaultFormats,
        quality,
        placeholderSize,
        outSubDir,
        outDir: join(root, outDir),
      });

      await emitProcessedSources(processed, outSubDir, this);
      rebuildFormatSrcsets(processed, absPath);

      return `export default ${JSON.stringify(processed)}`;
    },
  };
}

async function loadDevImage(
  absPath: string,
  rawPath: string,
  placeholderSize: number,
): Promise<ProcessedImage> {
  const metadata = await getImageMetadata(absPath);
  const publicPath = rawPath.startsWith("/") ? rawPath : `/@fs/${absPath}`;

  return {
    src: publicPath,
    srcset: "",
    width: metadata.width,
    height: metadata.height,
    placeholder: await generateBlurPlaceholder(absPath, placeholderSize),
    formats: [],
    sources: [{ src: publicPath, width: metadata.width, format: "original" }],
  };
}

async function emitProcessedSources(
  processed: ProcessedImage,
  outSubDir: string,
  ctx: {
    emitFile: (f: { type: "asset"; fileName: string; source: Uint8Array }) => void;
  },
) {
  for (const source of processed.sources) {
    const fileName = join(outSubDir, basename(source.src));
    const content = await readFile(source.src);
    ctx.emitFile({ type: "asset", fileName, source: content });
    source.src = `/${fileName}`;
  }
}

function rebuildFormatSrcsets(processed: ProcessedImage, fallbackPath: string) {
  const formatGroups = new Map<string, string[]>();
  for (const s of processed.sources) {
    let group = formatGroups.get(s.format);
    if (!group) {
      group = [];
      formatGroups.set(s.format, group);
    }
    group.push(`${s.src} ${s.width}w`);
  }
  processed.formats = [...formatGroups.entries()].map(([fmt, entries]) => ({
    type: `image/${fmt}`,
    srcset: entries.join(", "),
  }));

  const lastFormat = processed.formats.at(-1);
  processed.srcset = lastFormat?.srcset ?? "";
  processed.src = processed.sources.at(-1)?.src ?? fallbackPath;
}

// ─── Image processing utilities ─────────────────────────────────────────────

interface ProcessOptions {
  widths: number[];
  formats: ImageFormat[];
  quality: number;
  placeholderSize: number;
  outSubDir: string;
  outDir: string;
}

async function processImage(absPath: string, opts: ProcessOptions): Promise<ProcessedImage> {
  const metadata = await getImageMetadata(absPath);
  const ext = extname(absPath);
  const name = basename(absPath, ext);
  const sources: Array<{ src: string; width: number; format: string }> = [];

  // Ensure output directory exists
  const processedDir = join(opts.outDir, opts.outSubDir);
  if (!existsSync(processedDir)) {
    await mkdir(processedDir, { recursive: true });
  }

  // Generate resized variants — iterate formats first so sources are grouped by format
  for (const format of opts.formats) {
    for (const targetWidth of opts.widths) {
      // Don't upscale
      const width = Math.min(targetWidth, metadata.width);
      const outName = `${name}-${width}.${format}`;
      const outPath = join(processedDir, outName);

      await resizeImage(absPath, outPath, width, format, opts.quality);
      sources.push({ src: outPath, width, format });
    }
  }

  // Build per-format source sets for <picture>
  const formatGroups = new Map<string, Array<{ src: string; width: number }>>();
  for (const s of sources) {
    let group = formatGroups.get(s.format);
    if (!group) {
      group = [];
      formatGroups.set(s.format, group);
    }
    group.push({ src: s.src, width: s.width });
  }

  const formats: FormatSource[] = [...formatGroups.entries()].map(([fmt, group]) => ({
    type: `image/${fmt === "jpeg" ? "jpeg" : fmt}`,
    srcset: group.map((s) => `${s.src} ${s.width}w`).join(", "),
  }));

  // Fallback: last format's srcset
  const fallbackFormat = formats[formats.length - 1];
  const fallbackSources = formatGroups.get([...formatGroups.keys()].pop()!)!;

  // Generate blur placeholder
  const placeholder = await generateBlurPlaceholder(absPath, opts.placeholderSize);

  return {
    src: fallbackSources[fallbackSources.length - 1]?.src ?? absPath,
    srcset: fallbackFormat?.srcset ?? "",
    width: metadata.width,
    height: metadata.height,
    placeholder,
    formats,
    sources,
  };
}

interface ImageMetadata {
  width: number;
  height: number;
  format: string;
}

/**
 * Read basic image metadata.
 * Uses minimal binary header parsing — no external dependencies.
 */
async function getImageMetadata(absPath: string): Promise<ImageMetadata> {
  const buffer = await readFile(absPath);
  const ext = extname(absPath).toLowerCase();

  if (ext === ".png") {
    // PNG: width at bytes 16-19, height at 20-23 (big-endian)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height, format: "png" };
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    // JPEG: scan for SOF markers
    const dimensions = parseJpegDimensions(buffer);
    return { ...dimensions, format: "jpeg" };
  }

  if (ext === ".webp") {
    // WebP: VP8 header
    const dimensions = parseWebPDimensions(buffer);
    return { ...dimensions, format: "webp" };
  }

  // Fallback
  return { width: 0, height: 0, format: ext.slice(1) };
}

/** @internal Exported for testing */
export function parseJpegDimensions(buffer: Buffer): {
  width: number;
  height: number;
} {
  let offset = 2; // Skip SOI marker
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1]!;
    // SOF markers (0xC0-0xCF except 0xC4, 0xC8, 0xCC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return { width: 0, height: 0 };
}

/** @internal Exported for testing */
export function parseWebPDimensions(buffer: Buffer): {
  width: number;
  height: number;
} {
  // RIFF header: bytes 0-3 = "RIFF", 8-11 = "WEBP"
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    // Lossy VP8
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (chunk === "VP8L") {
    // Lossless VP8L
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  if (chunk === "VP8X") {
    // Extended VP8X
    const width = 1 + ((buffer[24]! | (buffer[25]! << 8) | (buffer[26]! << 16)) & 0xffffff);
    const height = 1 + ((buffer[27]! | (buffer[28]! << 8) | (buffer[29]! << 16)) & 0xffffff);
    return { width, height };
  }
  return { width: 0, height: 0 };
}

/**
 * Resize an image using native platform capabilities.
 * Uses sharp if available, falls back to canvas API.
 */
async function resizeImage(
  input: string,
  output: string,
  width: number,
  format: ImageFormat,
  quality: number,
): Promise<void> {
  try {
    // Try sharp (the standard Node.js image processing library)
    const sharp = await import("sharp").then((m) => m.default ?? m);
    let pipeline = sharp(input).resize(width);

    switch (format) {
      case "webp":
        pipeline = pipeline.webp({ quality });
        break;
      case "avif":
        pipeline = pipeline.avif({ quality });
        break;
      case "jpeg":
        pipeline = pipeline.jpeg({ quality, mozjpeg: true });
        break;
      case "png":
        pipeline = pipeline.png({ compressionLevel: 9 });
        break;
    }

    await pipeline.toFile(output);
  } catch {
    // sharp not available — copy original as fallback
    warnSharpMissing();
    const content = await readFile(input);
    await writeFile(output, content);
  }
}

/**
 * Generate a tiny blur placeholder as a base64 data URI.
 */
async function generateBlurPlaceholder(input: string, size: number): Promise<string> {
  try {
    const sharp = await import("sharp").then((m) => m.default ?? m);
    const buffer = await sharp(input)
      .resize(size, size, { fit: "inside" })
      .blur(2)
      .webp({ quality: 20 })
      .toBuffer();

    return `data:image/webp;base64,${buffer.toString("base64")}`;
  } catch {
    // sharp not available — return a transparent placeholder
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
  }
}
