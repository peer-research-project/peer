import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWebRoot } from "./upload-backend";
import { docPath, metaPath, pdfPath, UPLOAD_DIR } from "./upload-store";

// W8 R-H3 (W6 O1): the production build's file tracer reads these modules
// statically. A path call built from the working directory or from
// UPLOAD_DIR without a `turbopackIgnore` comment made it copy the whole
// `web/` tree (~1,300 files) into every server function importing the upload
// backend. The comments change tracing only; the behaviour checks below pin
// the runtime results to what they were.
const here = path.dirname(fileURLToPath(import.meta.url));

/** Every path/fs call whose first argument is a runtime directory. */
function runtimeDirCalls(source: string): { call: string; ignored: boolean }[] {
  // Zero-width (lookahead) so a nested call such as
  // `existsSync(path.join(candidate, …))` is counted at both levels.
  const pattern = /(?=\b(path\.(?:join|resolve)|existsSync)\(\s*(\/\*turbopackIgnore: true\*\/\s*)?(UPLOAD_DIR|cwd|candidate|resolveWebRoot|path\.join)\b)/g;
  return [...source.matchAll(pattern)].map((match) => ({ call: `${match[1]}(${match[3]}`, ignored: Boolean(match[2]) }));
}

describe("W8 R-H3: runtime directory paths are hidden from the file tracer", () => {
  it("annotates every cwd/web-root path call in upload-backend.ts", async () => {
    const calls = runtimeDirCalls(await readFile(path.join(here, "upload-backend.ts"), "utf8"));
    // resolveWebRoot: path.join(cwd, "web"), existsSync(path.join(...)),
    // path.join(candidate, ...); UPLOAD_DIR: path.join(resolveWebRoot(), ...);
    // diskPath: path.resolve(UPLOAD_DIR, name), path.resolve(UPLOAD_DIR).
    expect(calls).toHaveLength(6);
    expect(calls.filter((entry) => !entry.ignored)).toEqual([]);
  });

  it("annotates every UPLOAD_DIR path call in upload-store.ts", async () => {
    const calls = runtimeDirCalls(await readFile(path.join(here, "upload-store.ts"), "utf8"));
    // pdfPath, metaPath, docPath, and the sidecar rename.
    expect(calls).toHaveLength(4);
    expect(calls.filter((entry) => !entry.ignored)).toEqual([]);
  });
});

describe("W8 R-H3: behaviour unchanged", () => {
  let scratch: string | null = null;
  afterEach(async () => {
    if (scratch) await rm(scratch, { recursive: true, force: true });
    scratch = null;
  });

  it("resolveWebRoot picks an invented directory that holds next.config.ts", async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "peer-w8-root-"));
    await writeFile(path.join(scratch, "next.config.ts"), "export default {};\n");
    expect(resolveWebRoot(scratch)).toBe(scratch);
  });

  it("resolveWebRoot picks the invented directory's web/ child when only it holds next.config.ts", async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "peer-w8-repo-"));
    await mkdir(path.join(scratch, "web"));
    await writeFile(path.join(scratch, "web", "next.config.ts"), "export default {};\n");
    expect(resolveWebRoot(scratch)).toBe(path.join(scratch, "web"));
  });

  it("resolveWebRoot falls back to the given directory when neither holds next.config.ts", async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "peer-w8-bare-"));
    expect(resolveWebRoot(scratch)).toBe(scratch);
  });

  it("upload object paths still sit directly inside UPLOAD_DIR", () => {
    const id = "f00dfacecafe0123";
    expect(pdfPath(id)).toBe(path.join(UPLOAD_DIR, `${id}.pdf`));
    expect(metaPath(id)).toBe(path.join(UPLOAD_DIR, `${id}.json`));
    expect(docPath(id)).toBe(path.join(UPLOAD_DIR, `${id}.doc.json`));
    expect(() => metaPath("../../.env")).toThrow("Invalid upload id");
  });
});
