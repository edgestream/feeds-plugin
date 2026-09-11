import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async file => JSON.parse(await readFile(join(root, file), "utf8"));

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(buffer.readUInt32BE(12), 0x49484452);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

test("portable and Codex metadata reference the packaged square branding asset", async () => {
  const portable = await readJson("plugin.json");
  const codex = await readJson(".codex-plugin/plugin.json");
  const portableInterface = portable.extensions["com.openai"].interface;
  assert.deepEqual(portableInterface, codex.interface);
  for (const field of ["composerIcon", "logo"]) {
    assert.match(portableInterface[field], /^\.\/assets\/.+\.png$/u);
    const assetPath = join(root, portableInterface[field].slice(2));
    const asset = await readFile(assetPath);
    const [width, height] = pngDimensions(asset);
    assert.equal(width, 128);
    assert.equal(height, 128);
    assert.ok((await stat(assetPath)).size < 10_000);
  }
});
