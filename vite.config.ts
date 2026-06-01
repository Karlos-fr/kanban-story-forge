import { defineConfig } from "vite";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const storiesDir = join(__dirname, "data", "stories");

export default defineConfig({
  plugins: [
    {
      name: "story-files-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? "", "http://localhost");
          if (!url.pathname.startsWith("/api/stories")) {
            next();
            return;
          }

          try {
            await mkdir(storiesDir, { recursive: true });

            if (req.method === "GET" && url.pathname === "/api/stories") {
              const stories = await readStories();
              sendJson(res, 200, { stories });
              return;
            }

            if (req.method === "PUT" && url.pathname === "/api/stories") {
              const body = await readBody(req);
              const parsed = JSON.parse(body);
              const stories = Array.isArray(parsed) ? parsed : parsed.stories;
              if (!Array.isArray(stories)) {
                sendJson(res, 400, { error: "Expected stories array" });
                return;
              }
              await replaceStories(stories);
              sendJson(res, 200, { stories: await readStories() });
              return;
            }

            const storyMatch = url.pathname.match(/^\/api\/stories\/([^/]+)$/);
            if (storyMatch && req.method === "PUT") {
              const previousId = safeId(decodeURIComponent(storyMatch[1]));
              const story = JSON.parse(await readBody(req));
              const nextId = safeId(String(story.id ?? previousId));
              await writeStory(story);
              if (previousId !== nextId) {
                await rm(storyPath(previousId), { force: true });
              }
              sendJson(res, 200, { story });
              return;
            }

            if (storyMatch && req.method === "DELETE") {
              await rm(storyPath(safeId(decodeURIComponent(storyMatch[1]))), { force: true });
              sendJson(res, 200, { ok: true });
              return;
            }

            sendJson(res, 404, { error: "Not found" });
          } catch (error) {
            sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown error" });
          }
        });
      }
    }
  ],
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4190,
    strictPort: true
  }
});

async function readStories(): Promise<unknown[]> {
  const files = await readdir(storiesDir).catch(() => []);
  const stories = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b))
      .map(async (file) => JSON.parse(await readFile(join(storiesDir, file), "utf-8")))
  );
  return stories;
}

async function replaceStories(stories: unknown[]): Promise<void> {
  const files = await readdir(storiesDir).catch(() => []);
  await Promise.all(files.filter((file) => file.endsWith(".json")).map((file) => rm(join(storiesDir, file), { force: true })));
  await Promise.all(stories.map(writeStory));
}

async function writeStory(story: unknown): Promise<void> {
  const id = safeId(String((story as { id?: unknown }).id ?? "US-0000"));
  await writeFile(storyPath(id), `${JSON.stringify(story, null, 2)}\n`, "utf-8");
}

function storyPath(id: string): string {
  return join(storiesDir, `${safeId(id)}.json`);
}

function safeId(id: string): string {
  return id.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "-") || "US-0000";
}

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: NodeJS.WritableStream & { statusCode?: number; setHeader?: (name: string, value: string) => void }, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader?.("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
