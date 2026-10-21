import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "../lib/open-ena/csv";
import {
  CSV_DOWNLOAD_MEDIA_TYPE,
  csvDownloadBytes,
  csvDownloadPart,
  csvDownloadPayload,
} from "../lib/open-ena/csv-download";
import { rowsToCsv } from "../lib/open-ena/export";

const UTF8_BOM = Uint8Array.of(0xef, 0xbb, 0xbf);

function assertBomPrefix(bytes: Uint8Array) {
  assert.deepEqual([...bytes.subarray(0, 3)], [...UTF8_BOM]);
  assert.notDeepEqual([...bytes.subarray(3, 6)], [...UTF8_BOM]);
}

test("downloaded CSV bytes start with a single UTF-8 BOM and charset media type", () => {
  const csv = rowsToCsv([{ 单元: "学生甲", SVD1: 0.12 }]);
  assert.equal(csv.startsWith("\uFEFF"), false, "rowsToCsv stays BOM-free for hashes and exact-text tests");

  const downloaded = csvDownloadPayload(csv, "text/csv");
  const bytes = new TextEncoder().encode(downloaded.contents);
  assertBomPrefix(bytes);
  assert.equal(downloaded.type, CSV_DOWNLOAD_MEDIA_TYPE);
  assert.equal(downloaded.type, "text/csv;charset=utf-8");
  assert.equal(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes), `\uFEFF${csv}`);

  const alreadyMarked = csvDownloadPayload(downloaded.contents, downloaded.type);
  assert.equal(alreadyMarked.contents, downloaded.contents);
  assertBomPrefix(new TextEncoder().encode(alreadyMarked.contents));

  const fromBytes = csvDownloadBytes(new TextEncoder().encode(csv), "text/csv;charset=utf-8");
  assertBomPrefix(fromBytes.bytes);
  assert.equal(fromBytes.type, CSV_DOWNLOAD_MEDIA_TYPE);
  const doubled = csvDownloadBytes(fromBytes.bytes, fromBytes.type);
  assert.equal(doubled.bytes.byteLength, fromBytes.bytes.byteLength);
  assertBomPrefix(doubled.bytes);

  const json = csvDownloadPayload('{"单元":"学生甲"}\n', "application/json;charset=utf-8");
  assert.equal(json.contents.startsWith("\uFEFF"), false);
  assert.equal(json.type, "application/json;charset=utf-8");
  const zip = csvDownloadPart(Uint8Array.of(0x50, 0x4b, 0x03, 0x04), "application/zip");
  assert.equal(zip.type, "application/zip");
  assert.deepEqual([...(zip.part as Uint8Array)], [0x50, 0x4b, 0x03, 0x04]);
});

test("a downloaded CSV with Chinese labels round-trips through parseCsv", () => {
  const csv = rowsToCsv([{ 单元: "学生甲", 群組: "甲組", SVD1: 0.12 }]);
  const downloaded = csvDownloadBytes(new TextEncoder().encode(csv), "text/csv");
  assertBomPrefix(downloaded.bytes);
  const text = new TextDecoder().decode(downloaded.bytes);
  const parsed = parseCsv(text, { name: "open-ena-coordinates.csv", source: "upload" });
  assert.deepEqual(parsed.headers, ["单元", "群組", "SVD1"]);
  assert.equal(parsed.rows[0]?.单元, "学生甲");
  assert.equal(parsed.rows[0]?.群組, "甲組");
  assert.equal(parsed.rows[0]?.SVD1, "0.12");
});
