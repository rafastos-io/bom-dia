/**
 * Gera os assets do mascote/ilustrações do Bom Dia v3 via Runway.
 *
 * Uso: node web/scripts/runway-mascot.mjs [--only slug1,slug2] [--force] [--list]
 * Requer RUNWAYML_API_SECRET no ambiente (nunca gravado em arquivo).
 * Saída: web/public/brand/*.png + web/public/brand/generated-assets.json (proveniência).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const API = "https://api.dev.runwayml.com/v1";
const API_VERSION = "2024-11-06";
const OUT_DIR = join(ROOT, "web", "public", "brand");
const MANIFEST = join(OUT_DIR, "generated-assets.json");
const AVATAR = join(ROOT, "artifacts", "AVATAR.png");
const POLL_MS = 5000;
const CONCURRENCY = 3;
const TIMEOUT = 10 * 60_000;

const CHARACTER =
  "@Rafael is a friendly 3D cartoon character: dark curly hair, black rectangular glasses, short beard, warm brown skin, black crew-neck sweater with a small yellow sun emblem on the chest, dark trousers and white sneakers. Same face, same proportions, same colors, Pixar-like clean 3D render, soft studio lighting, matte materials.";

const TRANSPARENT =
  "Isolated on a fully transparent background, no floor, no shadow, no backdrop, no text, no logos, no watermark.";

const BUST =
  "Bust framing (head, shoulders and upper torso), centered, facing the camera.";

const POSE = {
  thinking:
    `${CHARACTER} Thoughtful but cheerful pose: one hand on his chin, eyes slightly up and to the side, gentle smile. ${BUST} ${TRANSPARENT} Keep @Rafael exactly the same character.`,
  thumbsup:
    `${CHARACTER} Cheerful pose with the right arm raised in a confident thumbs up, warm smile. ${BUST} ${TRANSPARENT} Keep @Rafael exactly the same character.`,
  checklist:
    `${CHARACTER} Holding a white clipboard against his chest with one hand, proud smile; the clipboard shows simple blank lines like a checklist, no readable text. ${BUST} ${TRANSPARENT} Keep @Rafael exactly the same character.`,
  avatar:
    `${CHARACTER} Head and shoulders portrait, centered, facing the camera, confident friendly smile. ${TRANSPARENT} Keep @Rafael exactly the same character.`,
  phone:
    `${CHARACTER} Full body, standing, holding a smartphone up in his right hand as if about to send a message, smiling at the camera. Full body framing with white sneakers visible. ${TRANSPARENT} Keep @Rafael exactly the same character.`,
  pockets:
    `${CHARACTER} Full body, standing relaxed with both hands in his pockets, subtle friendly smile. Full body framing with white sneakers visible. ${TRANSPARENT} Keep @Rafael exactly the same character.`,
};

const OBJECT_STYLE =
  "Clean minimal 3D render, soft studio lighting, matte materials, subtle soft shadows, high detail, centered, no text, no logos.";

const ASSETS = [
  { slug: "mascot-thinking", model: "gpt_image_2", ratio: "1920:1920", quality: "high", background: "transparent", reference: AVATAR, referenceTag: "Rafael", promptText: POSE.thinking },
  { slug: "mascot-thumbsup", model: "gpt_image_2", ratio: "1920:1920", quality: "high", background: "transparent", reference: AVATAR, referenceTag: "Rafael", promptText: POSE.thumbsup },
  { slug: "mascot-checklist", model: "gpt_image_2", ratio: "1920:1920", quality: "high", background: "transparent", reference: AVATAR, referenceTag: "Rafael", promptText: POSE.checklist },
  { slug: "mascot-avatar", model: "gpt_image_2", ratio: "1920:1920", quality: "high", background: "transparent", reference: AVATAR, referenceTag: "Rafael", promptText: POSE.avatar },
  { slug: "mascot-phone", model: "gpt_image_2", ratio: "1280:1920", quality: "high", background: "transparent", reference: AVATAR, referenceTag: "Rafael", promptText: POSE.phone },
  { slug: "mascot-pockets", model: "gpt_image_2", ratio: "1280:1920", quality: "high", background: "transparent", reference: AVATAR, referenceTag: "Rafael", promptText: POSE.pockets },
  {
    slug: "illus-archive",
    model: "gpt_image_2",
    ratio: "1920:1920",
    quality: "high",
    background: "transparent",
    promptText: `A minimal 3D archive box in soft light gray, slightly open lid with a few paper sheets inside, tiny motion lines above it suggesting items being safely stored. ${OBJECT_STYLE} ${TRANSPARENT}`,
  },
  {
    slug: "illus-document",
    model: "gpt_image_2",
    ratio: "1920:1920",
    quality: "high",
    background: "transparent",
    promptText: `A minimal 3D white document sheet with soft gray lines standing upright, a small violet circular check badge at its lower right corner, tiny motion strokes around it. ${OBJECT_STYLE} ${TRANSPARENT}`,
  },
];

function parseArgs(argv) {
  const args = { force: false, list: false, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") args.force = true;
    else if (arg === "--list") args.list = true;
    else if (arg === "--only") args.only = (argv[i + 1] ?? "").split(",").filter(Boolean);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, body) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(`${API}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`,
          "X-Runway-Version": API_VERSION,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json = text;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      if (!res.ok) {
        const detail = typeof json === "string" ? json : JSON.stringify(json);
        throw new Error(`${path} → ${res.status} ${res.statusText}: ${detail}`);
      }
      return json;
    } catch (error) {
      lastError = error;
      const message = String(error?.message ?? error);
      const retryable = message.includes("fetch failed") || message.includes("ECONNRESET") || message.includes("socket");
      if (!retryable || attempt === 4) throw error;
      console.error(`  (${path}) tentativa ${attempt} falhou (${message}); repetindo…`);
      await sleep(2000 * attempt);
    }
  }
  throw lastError;
}

async function runTask(path, payload, timeout) {
  const { id } = await api(path, payload);
  const started = Date.now();
  for (;;) {
    const task = await api(`/tasks/${id}`);
    if (task.status === "SUCCEEDED") return { id, task };
    if (task.status === "FAILED") {
      throw new Error(`tarefa ${id} falhou: ${task.failure ?? task.failureCode ?? "motivo desconhecido"}`);
    }
    if (Date.now() - started > timeout) {
      throw new Error(`tarefa ${id} excedeu o tempo limite (${task.status})`);
    }
    await sleep(POLL_MS);
  }
}

async function download(url, slug) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download falhou: ${res.status} ${res.statusText}`);
  const file = join(OUT_DIR, `${slug}.png`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function dataUri(filePath) {
  const mime = filePath.endsWith(".jpg") || filePath.endsWith(".jpeg") ? "image/jpeg" : filePath.endsWith(".webp") ? "image/webp" : "image/png";
  return `data:${mime};base64,${readFileSync(filePath).toString("base64")}`;
}

async function runPool(items, limit, worker) {
  const results = [];
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

function readManifest() {
  if (!existsSync(MANIFEST)) return { assets: [] };
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return { assets: [] };
  }
}

function writeManifest(entries) {
  const manifest = readManifest();
  const bySlug = new Map((manifest.assets ?? []).map((entry) => [entry.slug, entry]));
  for (const entry of entries) bySlug.set(entry.slug, { ...(bySlug.get(entry.slug) ?? {}), ...entry });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    MANIFEST,
    `${JSON.stringify(
      {
        provider: "Runway Dev",
        endpoint: "POST /v1/text_to_image",
        updatedAt: new Date().toISOString(),
        assets: [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
      },
      null,
      2,
    )}\n`,
  );
}

const args = parseArgs(process.argv.slice(2));

if (args.list) {
  for (const asset of ASSETS) console.log(`${asset.slug}\t${asset.model}\t${asset.ratio}\t${asset.reference ? "ref" : "txt"}`);
  process.exit(0);
}

if (!process.env.RUNWAYML_API_SECRET) {
  console.error("RUNWAYML_API_SECRET ausente no ambiente.");
  process.exit(1);
}

if (!existsSync(AVATAR)) {
  console.error(`Referência do avatar ausente: ${AVATAR}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const selected = args.only ? ASSETS.filter((asset) => args.only.includes(asset.slug)) : ASSETS;
const pending = selected.filter((asset) => args.force || !existsSync(join(OUT_DIR, `${asset.slug}.png`)));
const skipped = selected.length - pending.length;

if (pending.length === 0) {
  console.log(`Nada a gerar (${skipped} já no disco; use --force para refazer).`);
  process.exit(0);
}

console.log(`Gerando ${pending.length} asset(s) — pool de ${CONCURRENCY}…`);
const entries = await runPool(pending, CONCURRENCY, async (asset) => {
  const payload = {
    model: asset.model,
    ratio: asset.ratio,
    promptText: asset.promptText,
    ...(asset.quality ? { quality: asset.quality } : {}),
    ...(asset.background ? { background: asset.background } : {}),
  };
  if (asset.reference) {
    const referenceImage = { uri: dataUri(asset.reference) };
    if (asset.referenceTag) referenceImage.tag = asset.referenceTag;
    payload.referenceImages = [referenceImage];
  }
  try {
    const { id, task } = await runTask("/text_to_image", payload, TIMEOUT);
    const file = await download(task.output[0], asset.slug);
    console.log(`${asset.slug} ok — ${file} (task ${id})`);
    return {
      slug: asset.slug,
      kind: "image",
      file: `web/public/brand/${asset.slug}.png`,
      model: asset.model,
      ratio: asset.ratio,
      prompt: asset.promptText,
      taskId: id,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`${asset.slug} falhou: ${error.message}`);
    return null;
  }
});

writeManifest(entries.filter(Boolean));
console.log("\nManifesto:");
for (const entry of readManifest().assets ?? []) console.log(`- ${entry.slug} → ${entry.file}`);
