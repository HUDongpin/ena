import assert from "node:assert/strict";
import test from "node:test";
import writeXlsxFile from "write-excel-file/universal";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseXlsx } from "../lib/open-ena/spreadsheet";

const options = { name: "synthetic.xlsx", source: "upload" as const };

async function workbook() {
  const blob = await writeXlsxFile([
    [{ value: "unit", type: String }, { value: "A", type: String }],
    [{ value: "u1", type: String }, { value: 1, type: Number }],
  ]).toBlob();
  const bytes = await blob.arrayBuffer();
  const view = new DataView(bytes);
  const end = bytes.byteLength - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  return { bytes, view, end };
}

test("XLSX admission and the reader agree on the number of directory entries", async () => {
  const { bytes, view, end } = await workbook();
  const entriesReadByFflate = view.getUint16(end + 8, true);
  assert.ok(entriesReadByFflate > 0);
  // The browser reader's unzip() uses the per-disk count at +8; the old guard
  // used only +10. Forging an empty total/directory bypassed all entry budgets
  // while the real reader still decompressed every original workbook entry.
  view.setUint16(end + 10, 0, true);
  view.setUint32(end + 12, 0, true);
  await assert.rejects(parseXlsx(bytes, options), /ZIP directory/i);
});

test("ordinary single-disk workbooks retain their typed source data", async () => {
  const { bytes } = await workbook();
  const parsed = await parseXlsx(bytes, options);
  assert.deepEqual(parsed.dataset.headers, ["unit", "A"]);
  assert.deepEqual(parsed.dataset.rows, [{ unit: "u1", A: 1 }]);
});

test("valid stored ZIP entries remain supported", async () => {
  const { bytes } = await workbook();
  const stored = Uint8Array.from(zipSync(unzipSync(new Uint8Array(bytes)), { level: 0 })).buffer;
  assert.deepEqual((await parseXlsx(stored, options)).dataset.rows, [{ unit: "u1", A: 1 }]);
});

test("a ZIP64 locator cannot replace the directory admitted by the guard", async () => {
  const original = await workbook();
  const directoryOffset = original.view.getUint32(original.end + 16, true);
  const entryCount = original.view.getUint16(original.end + 8, true);
  const firstEntryBytes = 46
    + original.view.getUint16(directoryOffset + 28, true)
    + original.view.getUint16(directoryOffset + 30, true)
    + original.view.getUint16(directoryOffset + 32, true);
  const bytes = new Uint8Array(original.bytes.byteLength + 76);
  bytes.set(new Uint8Array(original.bytes, 0, original.end));
  bytes.set(new Uint8Array(original.bytes, original.end), original.end + 76);
  const view = new DataView(bytes.buffer);
  // The actual reader switches to these ZIP64 counts/offsets merely on seeing
  // the locator, even without sentinel fields in the ordinary end record.
  view.setUint32(original.end, 0x06064b50, true);
  view.setUint32(original.end + 4, 44, true);
  view.setUint32(original.end + 32, entryCount, true);
  view.setUint32(original.end + 48, directoryOffset, true);
  view.setUint32(original.end + 56, 0x07064b50, true);
  view.setUint32(original.end + 64, original.end, true);
  view.setUint32(original.end + 72, 1, true);
  const end = original.end + 76;
  view.setUint16(end + 8, 1, true);
  view.setUint16(end + 10, 1, true);
  view.setUint32(end + 12, firstEntryBytes, true);
  await assert.rejects(parseXlsx(bytes.buffer, options), /ZIP64/i);
});

test("stored ZIP entries cannot underreport bytes that the reader copies", async () => {
  const { bytes, view, end } = await workbook();
  const firstEntry = view.getUint32(end + 16, true);
  // This package metadata is not used as worksheet data. unzip() copies
  // compressedSize bytes for method 0, independent of uncompressedSize.
  view.setUint16(firstEntry + 10, 0, true);
  view.setUint32(firstEntry + 24, 0, true);
  assert.ok(view.getUint32(firstEntry + 20, true) > 0);
  await assert.rejects(parseXlsx(bytes, options), /ZIP directory/i);
});

test("duplicate ZIP member names reject even when both tiny marker payloads are harmless", async () => {
  const { bytes } = await workbook();
  const entries = {
    ...unzipSync(new Uint8Array(bytes)),
    "notes/first.xml": strToU8("<marker>first</marker>"),
    "notes/other.xml": strToU8("<marker>other</marker>"),
  };
  const archive = Uint8Array.from(zipSync(entries, { level: 0 }));
  assert.ok(archive.byteLength < 16_384, "fixture stays small and contains no resource-pressure payload");
  assert.deepEqual((await parseXlsx(archive.buffer, options)).dataset.rows, [{ unit: "u1", A: 1 }]);
  const view = new DataView(archive.buffer);
  const end = archive.byteLength - 22;
  let offset = view.getUint32(end + 16, true);
  let renamed = false;
  for (let index = 0; index < view.getUint16(end + 10, true); index++) {
    const nameBytes = view.getUint16(offset + 28, true);
    const name = strFromU8(archive.subarray(offset + 46, offset + 46 + nameBytes));
    if (name === "notes/other.xml") {
      const replacement = strToU8("notes/first.xml");
      assert.equal(replacement.length, nameBytes);
      archive.set(replacement, offset + 46);
      // Keep local and central names in agreement; only the duplicate identity
      // is ambiguous. The two payloads remain distinct, short marker text.
      const localOffset = view.getUint32(offset + 42, true);
      archive.set(replacement, localOffset + 30);
      renamed = true;
    }
    offset += 46 + nameBytes + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  assert.ok(renamed);
  assert.equal(strFromU8(unzipSync(archive)["notes/first.xml"]), "<marker>other</marker>");
  await assert.rejects(parseXlsx(archive.buffer, options), /duplicate ZIP.*name/i);
});
