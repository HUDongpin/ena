import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  link,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { deflateRawSync, deflateSync } from "node:zlib";

const projectRoot = join(import.meta.dirname, "..");
const verifierPath = join(import.meta.dirname, "verify-open-ena-production-browser-run.mjs");
const MANIFEST_PATH = "manifest.json";
const RECEIPT_PATH = "receipts/verification.json";
const RESULT_HASH = "a".repeat(64);
const GIT_SHA = "4".repeat(40);
const DEPLOYMENT_ID = "dpl_open_ena_production_20260827";
const DEPLOYMENT_URL = "https://ena-production-20260827.vercel.app";
const PRODUCTION_ROUTE = "https://ena.hk/en/open-ena";
const SELECTED_DIMENSIONS = ["SVD1", "SVD2", "SVD3"];
const FULL_ROTATION_DIMENSIONS = Array.from({ length: 15 }, (_, index) => "SVD" + (index + 1));
const JENA_VERSION = "0.7.0-ona.0";
const JENA_COMMIT = "90790856f00bdef63dbd27fc3a5b502e8cffe65f";
const JENA_TARBALL_INTEGRITY =
  "sha512-gBhKP9d7C3akXTPlU03AJHBs+dBBDt1TUFGx96P/pB/s0GEGGX2aZFLJGWf9HLc+wuBJIjrJn7tIGicg1WQflQ==";
const SDK_VERSION = "0.2.0-implemented-unverified.12";
const SDK_BUILD_ID = "a8b63e853c28be665282eaa4e8010d4198319106";
const JENA_BUILD_ID = "jena-js@" + JENA_VERSION + "+" + JENA_COMMIT + ":" + SDK_BUILD_ID;
const REQUEST_HASH = "6".repeat(64);
const AGGREGATE_OMITTED_FIELDS = [
  "paths[].dynamics.participantPeriods",
  "pathComparisons[].result.sideA.participantPeriods",
  "pathComparisons[].result.sideB.participantPeriods",
  "pathComparisons[].result.permutation.unitOrder",
  "bootstrap[].result.base.participantPeriods",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value));
    return Object.is(value, -0) ? "-0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
}

function hashCanonical(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function rgbaPng(width, height, leftColor, rightColor, filterType = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pixelBytes = width * 4;
  const rawRow = Buffer.alloc(pixelBytes);
  const split = Math.max(1, Math.floor(width / 2)) * 4;
  rawRow.fill(Buffer.from(leftColor), 0, split);
  rawRow.fill(Buffer.from(rightColor), split);
  const encodedRow = Buffer.from(rawRow);
  if (filterType === 1) {
    for (let offset = encodedRow.length - 1; offset >= 0; offset -= 1) {
      encodedRow[offset] = (rawRow[offset] - (offset >= 4 ? rawRow[offset - 4] : 0)) & 0xff;
    }
  } else {
    assert.equal(filterType, 0, "fixture PNG only supports None/Sub filters");
  }
  const rowBytes = pixelBytes + 1;
  const rows = Buffer.alloc(rowBytes * height);
  for (let row = 0; row < height; row += 1) {
    const start = row * rowBytes;
    rows[start] = filterType;
    encodedRow.copy(rows, start + 1);
  }
  const compressed = deflateSync(rows);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function colorBlockPng(width, height, blockOrBlocks) {
  const blocks = Array.isArray(blockOrBlocks) ? blockOrBlocks : [blockOrBlocks];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rowBytes = width * 4;
  const rows = Buffer.alloc((rowBytes + 1) * height, 255);
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * (rowBytes + 1);
    rows[rowOffset] = 0;
    for (const block of blocks) {
      if (row < block.y || row >= block.y + block.height) continue;
      for (let column = block.x; column < block.x + block.width; column += 1) {
        const offset = rowOffset + 1 + column * 4;
        rows[offset] = block.color[0];
        rows[offset + 1] = block.color[1];
        rows[offset + 2] = block.color[2];
        rows[offset + 3] = 255;
      }
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function nativePng(
  width,
  height,
  seed = 1,
  filterType = 0,
  includeBlackTrajectory = true,
  trajectoryColor = [12, 12, 12, 255],
) {
  assert.ok(filterType === 0 || filterType === 1);
  const rowBytes = width * 4;
  const pixels = Buffer.alloc(rowBytes * height, 255);
  const setPixel = (x, y, color) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = y * rowBytes + x * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  };
  const line = (x0, y0, x1, y1, color, thickness = 2) => {
    const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(x0 + (x1 - x0) * step / steps);
      const y = Math.round(y0 + (y1 - y0) * step / steps);
      for (let dx = -thickness; dx <= thickness; dx += 1) {
        for (let dy = -thickness; dy <= thickness; dy += 1) setPixel(x + dx, y + dy, color);
      }
    }
  };
  const grid = [230, 234, 236, 255];
  for (let index = 1; index < 8; index += 1) {
    line(0, Math.round(height * index / 8), width - 1, Math.round(height * index / 8), grid, 0);
    line(Math.round(width * index / 8), 0, Math.round(width * index / 8), height - 1, grid, 0);
  }
  const shift = Math.round(((seed * 17) % 9 - 4) * Math.max(1, width * 0.004));
  line(Math.round(width * 0.1), Math.round(height * 0.72), Math.round(width * 0.6) + shift, Math.round(height * 0.42), [220, 38, 38, 255]);
  line(Math.round(width * 0.32), Math.round(height * 0.55), Math.round(width * 0.74), Math.round(height * 0.7), [35, 96, 220, 255]);
  line(Math.round(width * 0.45), Math.round(height * 0.78), Math.round(width * 0.48) + shift, Math.round(height * 0.18), [26, 156, 82, 255]);
  if (includeBlackTrajectory) {
    line(
      Math.round(width * 0.16),
      Math.round(height * 0.78),
      Math.round(width * 0.68) + shift,
      Math.round(height * 0.34),
      trajectoryColor,
      2,
    );
    line(
      Math.round(width * 0.43) + shift,
      Math.round(height * 0.55),
      Math.round(width * 0.39) + shift,
      Math.round(height * 0.54),
      trajectoryColor,
      2,
    );
    line(
      Math.round(width * 0.43) + shift,
      Math.round(height * 0.55),
      Math.round(width * 0.42) + shift,
      Math.round(height * 0.59),
      trajectoryColor,
      2,
    );
  }
  for (const [x, y, color] of [
    [0.31, 0.56, [114, 51, 234, 255]],
    [0.45, 0.49, [171, 73, 13, 255]],
    [0.58, 0.43, [114, 51, 234, 255]],
  ]) {
    const centerX = Math.round(width * x) + shift;
    const centerY = Math.round(height * y);
    for (let dx = -4; dx <= 4; dx += 1) {
      for (let dy = -4; dy <= 4; dy += 1) setPixel(centerX + dx, centerY + dy, color);
    }
  }
  const rows = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const outputOffset = y * (rowBytes + 1);
    rows[outputOffset] = filterType;
    const source = pixels.subarray(y * rowBytes, (y + 1) * rowBytes);
    if (filterType === 0) source.copy(rows, outputOffset + 1);
    else {
      for (let offset = 0; offset < source.length; offset += 1) {
        rows[outputOffset + 1 + offset] = (
          source[offset] - (offset >= 4 ? source[offset - 4] : 0)
        ) & 0xff;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function solidPng(width, height, color) {
  return rgbaPng(width, height, color, color);
}

function solidRgba16Png(width, height, color = [4096, 8192, 12288, 65535]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 16;
  ihdr[9] = 6;
  const row = Buffer.alloc(width * 8 + 1);
  row[0] = 0;
  for (let column = 0; column < width; column += 1) {
    const offset = 1 + column * 8;
    for (let channel = 0; channel < 4; channel += 1) {
      row.writeUInt16BE(color[channel], offset + channel * 2);
    }
  }
  const rows = Buffer.alloc(row.length * height);
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    row.copy(rows, rowIndex * row.length);
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function sparseVisiblePng(width, height) {
  const rows = Buffer.alloc((width * 4 + 1) * height, 255);
  for (let row = 0; row < height; row += 1) rows[row * (width * 4 + 1)] = 0;
  rows[1] = 0;
  rows[2] = 0;
  rows[3] = 0;
  rows[4] = 255;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function zipArchive(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const source = Buffer.from(entry.bytes);
    const method = entry.method ?? 0;
    const flags = entry.flags ?? 0;
    const compressedPayload = method === 8 ? deflateRawSync(source) : source;
    const compressed = Buffer.concat([
      compressedPayload,
      Buffer.from(entry.compressedSuffix ?? []),
    ]);
    const localExtra = Buffer.from(entry.localExtra ?? []);
    const centralExtra = Buffer.from(entry.centralExtra ?? []);
    const gapAfter = Buffer.from(entry.gapAfter ?? []);
    const checksum = entry.crc32 ?? crc32(source);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    localParts.push(local, name, localExtra, compressed, gapAfter);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(centralExtra.length, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name, centralExtra);
    localOffset += local.length + name.length + localExtra.length
      + compressed.length + gapAfter.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function jsonMember(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function csvHeader(columns) {
  return Buffer.from(columns.join(",") + "\r\n", "utf8");
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function csvDocument(columns, rows) {
  return Buffer.from(
    [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n",
    "utf8",
  );
}

function typedCanonical(name, value, declaredType = typeof value) {
  const scalarType = typeof value;
  const scalarToken = scalarType === "boolean"
    ? (value ? "true" : "false")
    : Object.is(value, -0) ? "-0" : String(value);
  return JSON.stringify([[name, declaredType, scalarType, scalarToken]]);
}

function typedIdentity(name, value, display = String(value), declaredType = typeof value) {
  return {
    components: [{ name, type: typeof value, value, declaredType }],
    canonical: typedCanonical(name, value, declaredType),
    display,
  };
}

function participantFixtureRows() {
  const definitions = [
    ["G1", "P1", 0, true, 1, 1],
    ["G1", "P1", 1, true, 1, 1],
    ["G1", "P1", 2, true, 1, 1],
    ["G1", "P1", 3, true, 1, 1],
    ["G1", "P2", 0, true, 1, 2],
    ["G1", "P2", 1, true, 1, 1],
    ["G1", "P5", 1, true, 1, 1],
    ["G2", "P3", 0, true, 1, 1],
    ["G2", "P3", 1, true, 1, 1],
    ["G2", "P3", 2, true, 1, 1],
    ["G2", "P3", 3, true, 1, 1],
    ["G2", "P4", 1, true, 1, 1],
    ["G2", "P4", 2, true, 1, 2],
    ["G2", "P4", 3, true, 1, 1],
  ];
  return definitions.map(([group, participant, periodIndex, included, weight, sourceRows], rowIndex) => {
    const base = (group === "G1" ? 1 : 10) + Number(participant.slice(1)) + periodIndex;
    const fullCoordinates = FULL_ROTATION_DIMENSIONS.map((_, dimensionIndex) => (
      base + dimensionIndex / 10
    ));
    return {
      group: typedIdentity("group", group, "Group " + group.slice(1), "string"),
      participant: typedIdentity(
        "participant",
        participant,
        participant,
        "string",
      ),
      time: typedIdentity("time", periodIndex + 1, "Time " + (periodIndex + 1), "number"),
      includedInCohort: included,
      sourceRowIndexes: Array.from({ length: sourceRows }, (_, index) => rowIndex * 3 + index),
      selectedCoordinates: fullCoordinates.slice(0, 3),
      fullCoordinates,
      participantWeight: weight,
    };
  });
}

const V12_SCHEMA_FILES = [
  "longitudinal-analysis-bundle.v2.json",
  "trajectory-run-spec.v2.json",
  "trajectory-inference-task.v2.json",
  "typed-key.v1.json",
  "typed-scalar.v1.json",
];

function loadV12Schemas() {
  const archive = join(
    projectRoot,
    "vendor/j-3dena/j-3dena-0.2.0-implemented-unverified.12.tgz",
  );
  const schemas = new Map();
  for (const file of V12_SCHEMA_FILES) {
    const extracted = spawnSync(
      "tar",
      ["-xOzf", archive, "package/schemas/" + file],
      { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
    );
    assert.equal(extracted.status, 0, extracted.stderr);
    const schema = JSON.parse(extracted.stdout);
    schemas.set(schema.$id, schema);
  }
  return schemas;
}

const V12_SCHEMAS = loadV12Schemas();
const V12_MAIN_SCHEMA = V12_SCHEMAS.get(
  "https://3dena.com/schemas/longitudinal-analysis-bundle.v2.json",
);
let generatedStringCounter = 0;

function resolveSchemaReference(reference) {
  const [id, fragment = ""] = reference.split("#", 2);
  let schema = V12_SCHEMAS.get(id);
  assert.ok(schema, "missing fixture schema reference " + id);
  if (fragment !== "") {
    for (const encoded of fragment.replace(/^\//u, "").split("/")) {
      const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
      schema = schema[key];
      assert.notEqual(schema, undefined, "invalid fixture schema pointer " + reference);
    }
  }
  return schema;
}

function generatedString(pattern) {
  generatedStringCounter += 1;
  if (pattern === "^[a-f0-9]{64}$") return "b".repeat(64);
  if (pattern === "^[a-f0-9]{16}$") return "b".repeat(16);
  if (pattern === "^[0-9]{4}-[0-9]{2}-[0-9]{2}$") return "2026-08-27";
  if (pattern?.includes("[0-9]*")) return "0";
  return "fixture-value-" + generatedStringCounter;
}

function conditionMatches(value, condition) {
  if (condition.properties) {
    return Object.entries(condition.properties).every(([key, child]) => (
      !Object.hasOwn(value, key)
      || child.const === undefined
      || value[key] === child.const
    ));
  }
  return true;
}

function generateFromSchema(inputSchema) {
  const schema = inputSchema.$ref ? resolveSchemaReference(inputSchema.$ref) : inputSchema;
  if (Object.hasOwn(schema, "const")) return structuredClone(schema.const);
  if (schema.enum) return structuredClone(schema.enum[0]);
  if (schema.oneOf) return generateFromSchema(schema.oneOf[0]);
  let value;
  switch (schema.type) {
    case "object": {
      value = {};
      for (const key of schema.required ?? []) {
        value[key] = generateFromSchema(schema.properties[key]);
      }
      break;
    }
    case "array": {
      const length = schema.minItems ?? 0;
      value = Array.from({ length }, () => generateFromSchema(schema.items));
      break;
    }
    case "string":
      value = generatedString(schema.pattern);
      break;
    case "integer":
      value = Number.isFinite(schema.minimum) ? Math.ceil(schema.minimum) : 0;
      if (Number.isFinite(schema.exclusiveMinimum)) value = Math.floor(schema.exclusiveMinimum) + 1;
      if (Number.isFinite(schema.maximum) && value > schema.maximum) value = Math.floor(schema.maximum);
      if (Number.isFinite(schema.exclusiveMaximum) && value >= schema.exclusiveMaximum) {
        value = Math.ceil(schema.exclusiveMaximum) - 1;
      }
      break;
    case "number":
      if (Number.isFinite(schema.exclusiveMinimum) && Number.isFinite(schema.exclusiveMaximum)) {
        value = (schema.exclusiveMinimum + schema.exclusiveMaximum) / 2;
      } else if (Number.isFinite(schema.minimum)) {
        value = schema.minimum;
      } else if (Number.isFinite(schema.exclusiveMinimum)) {
        value = schema.exclusiveMinimum + 1;
      } else if (Number.isFinite(schema.exclusiveMaximum)) {
        value = schema.exclusiveMaximum - 1;
      } else {
        value = 0;
      }
      break;
    case "boolean":
      value = false;
      break;
    case "null":
      value = null;
      break;
    default:
      assert.fail("fixture generator does not understand schema " + JSON.stringify(schema));
  }
  if (schema.type === "object") {
    for (const clause of schema.allOf ?? []) {
      if (!clause.if || conditionMatches(value, clause.if)) {
        const applied = clause.then ?? clause;
        for (const [key, child] of Object.entries(applied.properties ?? {})) {
          if (Object.hasOwn(value, key)) value[key] = generateFromSchema(child);
        }
      }
    }
  }
  if (schema.type === "array" && schema.uniqueItems) {
    value = value.map((entry, index) => (
      typeof entry === "string" ? entry + "-" + index : entry
    ));
  }
  return value;
}

function createV12AggregateAnalysis(
  participantRows = participantFixtureRows(),
  options = {},
) {
  const raw = generateFromSchema(V12_MAIN_SCHEMA);
  raw.identity = {
    datasetHash: "1".repeat(64),
    specHash: "2".repeat(64),
    sourceResultHash: "3".repeat(64),
    requestHash: REQUEST_HASH,
    resultHash: RESULT_HASH,
    runId: "open-ena-longitudinal-production-20260827",
    jenaBuildId: JENA_BUILD_ID,
  };
  raw.runSpec.sourceResultHash = raw.identity.sourceResultHash;
  raw.runSpec.participantColumns = ["participant"];
  raw.runSpec.timeColumn = "time";
  raw.runSpec.groupColumn = "group";
  raw.runSpec.cohortPolicy = options.cohortPolicy ?? "available";
  raw.runSpec.estimand = options.estimand ?? { kind: "equal-participant" };
  raw.runSpec.selectedDimensions = [...SELECTED_DIMENSIONS];
  raw.runSpec.orderedPeriods = Array.from({ length: 4 }, (_, periodIndex) => {
    const time = typedIdentity(
      "time",
      periodIndex + 1,
      "Time " + (periodIndex + 1),
      "number",
    );
    return {
      identity: { components: time.components },
      sourceTimeCanonical: time.canonical,
      displayLabel: time.display,
      expected: true,
      value: { type: "numeric-v1", value: periodIndex + 1, unit: "period" },
    };
  });
  raw.model = {
    type: "SeparateTrajectory",
    selectedDimensions: [...SELECTED_DIMENSIONS],
    fullRotationDimensions: [...FULL_ROTATION_DIMENSIONS],
  };
  if (raw.paths.length === 0) {
    raw.paths.push(generateFromSchema(V12_MAIN_SCHEMA.properties.paths.items));
  }
  const pathTemplate = raw.paths[0];
  if (pathTemplate.dynamics.periods.length === 0) {
    pathTemplate.dynamics.periods.push(generateFromSchema(
      V12_MAIN_SCHEMA.properties.paths.items.properties.dynamics
        .properties.periods.items,
    ));
  }
  raw.paths = [structuredClone(pathTemplate), structuredClone(pathTemplate)];
  for (const [groupIndex, path] of raw.paths.entries()) {
    const groupName = "G" + (groupIndex + 1);
    const groupIdentity = typedIdentity(
      "group",
      groupName,
      "Group " + (groupIndex + 1),
      "string",
    );
    path.group = {
      canonical: groupIdentity.canonical,
      display: groupIdentity.display,
    };
    path.dynamics.dimensions = [...FULL_ROTATION_DIMENSIONS];
    path.dynamics.selectedDimensions = [...SELECTED_DIMENSIONS];
    path.dynamics.participantPeriods = [];
    const periodTemplate = path.dynamics.periods[0];
    path.dynamics.periods = Array.from(
      { length: 4 },
      () => structuredClone(periodTemplate),
    );
    let selectedCumulative = 0;
    let fullCumulative = 0;
    let previousSelected = null;
    let previousFull = null;
    for (const [periodIndex, period] of path.dynamics.periods.entries()) {
      const time = typedIdentity(
        "time",
        periodIndex + 1,
        "Time " + (periodIndex + 1),
        "number",
      );
      const rows = participantRows.filter((row) => (
        row.group.canonical === groupIdentity.canonical
        && row.time.canonical === time.canonical
      ));
      const includedRows = rows.filter((row) => row.includedInCohort);
      const weightedMean = (dimensionIndex) => (
        includedRows.reduce(
          (sum, row) => sum + row.fullCoordinates[dimensionIndex] * row.participantWeight,
          0,
        ) / includedRows.reduce((sum, row) => sum + row.participantWeight, 0)
      );
      const fullCentroid = FULL_ROTATION_DIMENSIONS.map((_, index) => weightedMean(index));
      const selectedCentroid = fullCentroid.slice(0, 3);
      const selectedDelta = previousSelected === null
        ? null
        : selectedCentroid.map((value, index) => value - previousSelected[index]);
      const fullDelta = previousFull === null
        ? null
        : fullCentroid.map((value, index) => value - previousFull[index]);
      const distance = (delta) => delta === null
        ? null
        : Math.sqrt(delta.reduce((sum, value) => sum + value * value, 0));
      const selectedStep = distance(selectedDelta);
      const fullStep = distance(fullDelta);
      if (selectedStep !== null) selectedCumulative += selectedStep;
      if (fullStep !== null) fullCumulative += fullStep;
      const weightSum = includedRows.reduce((sum, row) => sum + row.participantWeight, 0);
      const weightSquareSum = includedRows.reduce(
        (sum, row) => sum + row.participantWeight * row.participantWeight,
        0,
      );
      period.index = periodIndex;
      period.time = time;
      period.timeValue = { type: "numeric-v1", value: periodIndex + 1, unit: "period" };
      period.elapsedFromPrevious = periodIndex === 0 ? null : 1;
      period.elapsedFromStart = periodIndex;
      period.selectedCentroid = selectedCentroid;
      period.fullCentroid = fullCentroid;
      period.selected3d.dimensions = [...SELECTED_DIMENSIONS];
      period.selected3d.delta = selectedDelta;
      period.selected3d.stepDistance = selectedStep;
      period.selected3d.cumulativeDistance = selectedCumulative;
      period.selected3d.speed = selectedStep;
      period.fullSpace.dimensions = [...FULL_ROTATION_DIMENSIONS];
      period.fullSpace.delta = fullDelta;
      period.fullSpace.stepDistance = fullStep;
      period.fullSpace.cumulativeDistance = fullCumulative;
      period.fullSpace.speed = fullStep;
      period.nRows = rows.reduce((sum, row) => sum + row.sourceRowIndexes.length, 0);
      period.nParticipantPeriods = rows.length;
      period.nUsed = includedRows.length;
      period.nDuplicateRows = period.nRows - rows.length;
      period.nCohortExcluded = rows.length - includedRows.length;
      period.weightSum = weightSum;
      period.effectiveParticipantN = weightSum * weightSum / weightSquareSum;
      previousSelected = selectedCentroid;
      previousFull = fullCentroid;
    }
    const groupRows = participantRows.filter((row) => row.group.canonical === groupIdentity.canonical);
    path.dynamics.summary = {
      inputRows: groupRows.reduce((sum, row) => sum + row.sourceRowIndexes.length, 0),
      participants: new Set(groupRows.map((row) => row.participant.canonical)).size,
      participantPeriods: groupRows.length,
      periods: path.dynamics.periods.length,
      observedPeriods: path.dynamics.periods.filter((period) => period.nParticipantPeriods > 0).length,
      missingPeriods: path.dynamics.periods.filter((period) => period.nParticipantPeriods === 0).length,
      duplicateRows: groupRows.reduce(
        (sum, row) => sum + row.sourceRowIndexes.length - 1,
        0,
      ),
      cohortExcludedParticipants: new Set(
        groupRows.filter((row) => !row.includedInCohort)
          .map((row) => row.participant.canonical),
      ).size,
    };
  }
  raw.codeGeometry = {
    schemaVersion: "3dena.longitudinal-code-geometry.v2",
    dimensions: [...SELECTED_DIMENSIONS],
    nodes: [
      { index: 0, code: "Collaboration", coordinates: [-1, 0, 0.5] },
      { index: 1, code: "Reflection", coordinates: [0.5, 1, -0.5] },
      { index: 2, code: "Integration", coordinates: [1, -0.5, 0.25] },
    ],
  };
  raw.inference = [generateFromSchema(V12_MAIN_SCHEMA.properties.inference.items)];
  raw.execution = {
    target: "browser-worker",
    jenaVersion: JENA_VERSION,
    jenaCommit: JENA_COMMIT,
    jenaTarballIntegrity: JENA_TARBALL_INTEGRITY,
    sdkVersion: SDK_VERSION,
    buildId: SDK_BUILD_ID,
    seed: 42,
    permutationPlanHashes: [],
    resamplingPlanHashes: [],
    evidenceStatus: "IMPLEMENTED_UNVERIFIED",
  };
  return {
    ...raw,
    schemaVersion: "3dena.longitudinal-aggregate-export.v2",
    sourceEnvelopeSchemaVersion: raw.schemaVersion,
    privacy: {
      participantLevelIncluded: false,
      omittedFields: AGGREGATE_OMITTED_FIELDS,
    },
  };
}

function completeParticipantCount(rows, path) {
  const expected = new Set(path.dynamics.periods.map((period) => period.time.canonical));
  const observed = new Map();
  for (const row of rows.filter((candidate) => candidate.group.canonical === path.group.canonical)) {
    const periods = observed.get(row.participant.canonical) ?? new Set();
    periods.add(row.time.canonical);
    observed.set(row.participant.canonical, periods);
  }
  return [...observed.values()].filter((periods) => (
    [...expected].every((period) => periods.has(period))
  )).length;
}

function trajectoryPathRows(analysis, participantRows) {
  return analysis.paths.flatMap((path) => path.dynamics.periods.map((period, periodIndex) => {
    const current = new Set(participantRows.filter((row) => (
      row.group.canonical === path.group.canonical
      && row.time.canonical === period.time.canonical
      && row.includedInCohort
    )).map((row) => row.participant.canonical));
    const previous = periodIndex === 0 ? null : new Set(participantRows.filter((row) => (
      row.group.canonical === path.group.canonical
      && row.time.canonical === path.dynamics.periods[periodIndex - 1].time.canonical
      && row.includedInCohort
    )).map((row) => row.participant.canonical));
    return [
    path.group.canonical,
    path.group.display,
    period.index,
    period.time.canonical,
    period.time.display,
    canonicalJson(period.timeValue),
    period.nRows,
    period.nParticipantPeriods,
    period.nParticipantPeriods,
    completeParticipantCount(participantRows, path),
    period.nUsed,
    period.nCohortExcluded,
    period.nDuplicateRows,
    previous === null
      ? null
      : [...current].filter((participant) => previous.has(participant)).length,
    ...(period.selectedCentroid ?? SELECTED_DIMENSIONS.map(() => null)),
    ...(period.selected3d.delta ?? SELECTED_DIMENSIONS.map(() => null)),
    ...(period.fullCentroid ?? FULL_ROTATION_DIMENSIONS.map(() => null)),
    period.selected3d.stepDistance,
    period.selected3d.cumulativeDistance,
    period.elapsedFromPrevious,
    period.selected3d.speed,
    period.fullSpace.stepDistance,
    period.fullSpace.cumulativeDistance,
    period.elapsedFromPrevious,
    period.fullSpace.speed,
    period.weightSum,
    period.effectiveParticipantN,
    ];
  }));
}

function trajectoryMetadataRows(analysis, participantRows) {
  const rows = [
    ["mapping", "participant_columns", canonicalJson(analysis.runSpec.participantColumns)],
    ["mapping", "time_column", analysis.runSpec.timeColumn],
    ["mapping", "group_column", analysis.runSpec.groupColumn],
    ["cohort", "policy", analysis.runSpec.cohortPolicy],
    ["missing", "policy", analysis.runSpec.missingValuePolicy],
    ["estimand", "contract", canonicalJson(analysis.runSpec.estimand)],
    ["dimensions", "selected", canonicalJson(analysis.model.selectedDimensions)],
    ["dimensions", "full_rotation", canonicalJson(analysis.model.fullRotationDimensions)],
    ["codes", "fitted_geometry", canonicalJson(analysis.codeGeometry)],
    ["time", "ordered_periods", canonicalJson(analysis.runSpec.orderedPeriods)],
    ["binding", "request_hash", analysis.identity.requestHash],
    ["execution", "target", analysis.execution.target],
    ["execution", "evidence_status", analysis.execution.evidenceStatus],
  ];
  for (const path of analysis.paths) {
    rows.push([
      "time-contract",
      path.group.canonical,
      canonicalJson(path.dynamics.timeContract),
    ]);
    rows.push([
      "cohort-complete-count",
      path.group.canonical,
      completeParticipantCount(participantRows, path),
    ]);
  }
  for (const diagnostic of analysis.diagnostics) {
    rows.push([
      "diagnostic:" + diagnostic.severity,
      diagnostic.code,
      canonicalJson(diagnostic),
    ]);
  }
  return rows;
}

function trajectoryPathColumns() {
  return [
    "group_key_v1",
    "group_display",
    "period_index",
    "time_key_v1",
    "time_display",
    "time_value_v1",
    "rows",
    "participant_periods",
    "available",
    "complete",
    "included",
    "excluded",
    "duplicate_rows",
    "contributor_overlap_previous",
    ...SELECTED_DIMENSIONS.map((dimension) => "selected:" + dimension),
    ...SELECTED_DIMENSIONS.map((dimension) => "delta:" + dimension),
    ...FULL_ROTATION_DIMENSIONS.map((dimension) => "full:" + dimension),
    "selected_step_distance",
    "selected_cumulative_distance",
    "selected_elapsed",
    "selected_speed",
    "full_step_distance",
    "full_cumulative_distance",
    "full_elapsed",
    "full_speed",
    "weight_sum",
    "effective_participant_n",
  ];
}

function longitudinalSharedMembers(participantRows = participantFixtureRows(), options = {}) {
  const analysis = createV12AggregateAnalysis(participantRows, options);
  const members = new Map([
    [
      "analysis.json",
      jsonMember(analysis),
    ],
    [
      "trajectory-path.csv",
      csvDocument(trajectoryPathColumns(), trajectoryPathRows(analysis, participantRows)),
    ],
    [
      "trajectory-metadata.csv",
      csvDocument(
        ["section", "key", "value"],
        trajectoryMetadataRows(analysis, participantRows),
      ),
    ],
    [
      "trajectory-inference.csv",
      csvDocument([
        "request_kind",
        "status",
        "reason",
        "family_id",
        "family_size",
        "member_id",
        "test",
        "design",
        "estimand",
        "n",
        "effect",
        "statistic",
        "p_raw",
        "p_holm",
        "audit_json",
      ], inferenceCsvFixtureRows(analysis)),
    ],
  ]);
  members.participantRows = participantRows;
  members.analysis = analysis;
  return members;
}

function inferenceCsvFixtureRows(analysis) {
  return analysis.inference.map((inference) => [
    inference.request.kind,
    inference.status,
    inference.reason,
    inference.familyId,
    inference.familySize,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    canonicalJson(inference.request),
  ]);
}

function participantCsvFixture(rows = participantFixtureRows()) {
  return csvDocument([
    "group_key_v1",
    "participant_key_v1",
    "participant_display",
    "time_key_v1",
    "time_display",
    "included",
    "source_row_count",
    ...SELECTED_DIMENSIONS.map((dimension) => "selected:" + dimension),
    ...FULL_ROTATION_DIMENSIONS.map((dimension) => "full:" + dimension),
    "participant_weight",
  ], rows.map((row) => [
    row.group.canonical,
    row.participant.canonical,
    row.participant.display,
    row.time.canonical,
    row.time.display,
    row.includedInCohort,
    row.sourceRowIndexes.length,
    ...row.selectedCoordinates,
    ...row.fullCoordinates,
    row.participantWeight,
  ]));
}

function longitudinalPlotly(participantLevelIncluded, analysis, participantRows) {
  const data = [];
  const axisColors = ["#dc2626", "#2563eb", "#16a34a"];
  for (const [axisIndex, axis] of SELECTED_DIMENSIONS.entries()) {
    const end = [0, 0, 0];
    end[axisIndex] = 20;
    data.push({
      type: "scatter3d",
      mode: "lines+text",
      name: axis + " axis",
      x: [0, end[0]],
      y: [0, end[1]],
      z: [0, end[2]],
      text: ["", axis],
      line: { color: axisColors[axisIndex], width: 5 },
      showlegend: false,
      hoverinfo: "skip",
      meta: { role: "axis-shaft", resultHash: RESULT_HASH, axis },
    });
    const direction = [0, 0, 0];
    direction[axisIndex] = 1;
    data.push({
      type: "cone",
      x: [end[0]],
      y: [end[1]],
      z: [end[2]],
      u: [direction[0]],
      v: [direction[1]],
      w: [direction[2]],
      anchor: "tip",
      sizemode: "absolute",
      sizeref: 1.6,
      colorscale: [[0, axisColors[axisIndex]], [1, axisColors[axisIndex]]],
      showscale: false,
      showlegend: false,
      hoverinfo: "skip",
      meta: { role: "axis-arrowhead", resultHash: RESULT_HASH, axis },
    });
  }
  for (const [groupIndex, path] of analysis.paths.entries()) {
    const groupColor = groupIndex === 0 ? "#2563eb" : "#b45309";
    const groupRows = participantRows.filter((row) => (
      row.group.canonical === path.group.canonical && row.includedInCohort
    ));
    if (participantLevelIncluded) {
      data.push({
        type: "scatter3d",
        mode: "markers",
        name: path.group.display + " participant-periods",
        x: groupRows.map((row) => row.selectedCoordinates[0]),
        y: groupRows.map((row) => row.selectedCoordinates[1]),
        z: groupRows.map((row) => row.selectedCoordinates[2]),
        text: groupRows.map((row) => row.participant.display),
        customdata: groupRows.map((row) => [row.time.display]),
        hovertemplate: "%{text}<br>%{customdata[0]}<extra></extra>",
        marker: { color: groupColor, size: 6, opacity: 0.55 },
        meta: {
          role: "participant",
          resultHash: RESULT_HASH,
          groupCanonical: path.group.canonical,
        },
      });
      const participantKeys = [...new Set(groupRows.map((row) => row.participant.canonical))];
      for (const participantCanonical of participantKeys) {
        const rows = groupRows.filter((row) => row.participant.canonical === participantCanonical);
        data.push({
          type: "scatter3d",
          mode: "lines+markers",
          name: rows[0].participant.display,
          x: rows.map((row) => row.selectedCoordinates[0]),
          y: rows.map((row) => row.selectedCoordinates[1]),
          z: rows.map((row) => row.selectedCoordinates[2]),
          connectgaps: false,
          showlegend: false,
          line: { color: "#000000", width: 1.4 },
          marker: { color: groupColor, size: 5 },
          meta: {
            role: "individual-path",
            resultHash: RESULT_HASH,
            groupCanonical: path.group.canonical,
            participantCanonical,
          },
        });
      }
    }
    const centroids = path.dynamics.periods.map((period) => period.selectedCentroid);
    data.push({
      type: "scatter3d",
      mode: "lines",
      name: path.group.display + " trajectory",
      x: centroids.map((point) => point[0]),
      y: centroids.map((point) => point[1]),
      z: centroids.map((point) => point[2]),
      connectgaps: false,
      line: { color: "#000000", width: 4 },
      text: path.dynamics.periods.map((period) => period.time.display),
      hovertemplate: "%{text}<extra></extra>",
      meta: {
        role: "trajectory-path",
        resultHash: RESULT_HASH,
        groupCanonical: path.group.canonical,
      },
    });
    data.push({
      type: "scatter3d",
      mode: "markers+text",
      name: path.group.display + " centroids",
      x: centroids.map((point) => point[0]),
      y: centroids.map((point) => point[1]),
      z: centroids.map((point) => point[2]),
      text: path.dynamics.periods.map((period) => period.time.display),
      customdata: path.dynamics.periods.map((period) => [period.nUsed]),
      marker: {
        color: groupColor,
        size: 7,
        symbol: "square",
        line: { color: "#ffffff", width: 1.5 },
      },
      hovertemplate: "%{text}<br>n=%{customdata[0]}<extra></extra>",
      meta: {
        role: "centroid",
        resultHash: RESULT_HASH,
        groupCanonical: path.group.canonical,
      },
    });
    for (let index = 1; index < centroids.length; index += 1) {
      const previous = centroids[index - 1];
      const current = centroids[index];
      const midpoint = current.map((value, axisIndex) => (
        previous[axisIndex] + (value - previous[axisIndex]) * 0.5
      ));
      const delta = current.map((value, axisIndex) => value - previous[axisIndex]);
      data.push({
        type: "cone",
        x: [midpoint[0]],
        y: [midpoint[1]],
        z: [midpoint[2]],
        u: [delta[0]],
        v: [delta[1]],
        w: [delta[2]],
        anchor: "tip",
        sizemode: "absolute",
        sizeref: 1,
        colorscale: [[0, "#000000"], [1, "#000000"]],
        showscale: false,
        showlegend: false,
        hoverinfo: "skip",
        meta: {
          role: "direction-arrow",
          resultHash: RESULT_HASH,
          groupCanonical: path.group.canonical,
        },
      });
    }
  }
  data.push({
    type: "scatter3d",
    mode: "markers+text",
    name: "ENA codes",
    x: analysis.codeGeometry.nodes.map((node) => node.coordinates[0]),
    y: analysis.codeGeometry.nodes.map((node) => node.coordinates[1]),
    z: analysis.codeGeometry.nodes.map((node) => node.coordinates[2]),
    text: analysis.codeGeometry.nodes.map((node) => node.code),
    textposition: "top center",
    textfont: { color: "#0f172a", size: 13 },
    marker: {
      size: 7,
      symbol: "circle-open",
      color: "#ffffff",
      line: { color: "#0f172a", width: 2 },
    },
    meta: { role: "network-node", resultHash: RESULT_HASH },
  });
  return jsonMember({
    schemaVersion: "3dena.trajectory-plotly-spec.v2",
    resultHash: RESULT_HASH,
    data,
    layout: {
      autosize: true,
      showlegend: true,
      hovermode: "closest",
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 56, r: 24, t: 32, b: 56 },
      uirevision: RESULT_HASH + ":3d",
      meta: {
        scientificResultHash: RESULT_HASH,
        scientificTaskExecuted: false,
        projection: "3d",
      },
      scene: {
        xaxis: { title: "SVD1", zeroline: true, showgrid: true },
        yaxis: { title: "SVD2", zeroline: true, showgrid: true },
        zaxis: { title: "SVD3", zeroline: true, showgrid: true },
        aspectmode: "data",
        uirevision: JSON.stringify([
          "3dena.trajectory-camera-ui.v1",
          RESULT_HASH,
          "camera",
          null,
        ]),
      },
    },
    config: {
      responsive: true,
      displaylogo: false,
      scrollZoom: true,
      toImageButtonOptions: {
        format: "png",
        filename: "3dena-longitudinal-trajectory",
      },
    },
  });
}

function createLongitudinalZipBundle({
  participantLevelIncluded,
  sharedMembers,
  omitParticipantCsv = false,
  forceParticipantCsv = false,
  manifestTransform = null,
  extraEntries = [],
  entryTransform = null,
  participantCsvBytes = null,
  plotlyBytes = null,
}) {
  const files = new Map(sharedMembers);
  const analysis = sharedMembers.analysis
    ?? JSON.parse(sharedMembers.get("analysis.json").toString("utf8"));
  const participantRows = sharedMembers.participantRows ?? participantFixtureRows();
  files.set(
    "plotly-spec.json",
    plotlyBytes ?? longitudinalPlotly(participantLevelIncluded, analysis, participantRows),
  );
  if ((participantLevelIncluded && !omitParticipantCsv) || forceParticipantCsv) {
    files.set(
      "trajectory-participants.csv",
      participantCsvBytes ?? participantCsvFixture(participantRows),
    );
  }
  const members = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([path, bytes]) => ({
      path,
      mediaType: path.endsWith(".json") ? "application/json" : "text/csv",
      byteLength: bytes.length,
      sha256: sha256(bytes),
    }));
  const manifest = {
    schemaVersion: "3dena.longitudinal-provenance-manifest.v2",
    datasetHash: "1".repeat(64),
    specHash: "2".repeat(64),
    sourceResultHash: "3".repeat(64),
    resultHash: RESULT_HASH,
    runId: "open-ena-longitudinal-production-20260827",
    jenaBuildId: JENA_BUILD_ID,
    jena: {
      version: JENA_VERSION,
      commit: JENA_COMMIT,
      tarballIntegrity: JENA_TARBALL_INTEGRITY,
    },
    sdk: {
      version: SDK_VERSION,
      buildId: SDK_BUILD_ID,
    },
    executionTarget: "browser-worker",
    seed: 42,
    permutationPlanHashes: [],
    resamplingPlanHashes: [],
    evidenceStatus: "IMPLEMENTED_UNVERIFIED",
    selectedDimensions: [...SELECTED_DIMENSIONS],
    fullRotationDimensions: [...FULL_ROTATION_DIMENSIONS],
    participantLevelIncluded,
    privacyWarning: participantLevelIncluded
      ? "Participant-level histories can increase privacy and re-identification risk."
      : null,
    members,
    contentSetHash: hashCanonical(members),
  };
  if (manifestTransform) manifestTransform(manifest);
  const entries = [
    ...files.entries().map(([path, bytes], index) => {
      const entry = {
        path,
        bytes,
        method: index % 2 === 0 ? 0 : 8,
      };
      return entryTransform ? entryTransform(entry, index) : entry;
    }),
    {
      path: "provenance-manifest.json",
      bytes: jsonMember(manifest),
      method: 8,
    },
    ...extraEntries,
  ];
  return {
    bytes: zipArchive(entries),
    files,
    manifest,
  };
}

async function writeArtifact(root, artifacts, file, bytes, mediaType) {
  const absolutePath = join(root, ...file.split("/"));
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);
  const receipt = { file, bytes: bytes.length, sha256: sha256(bytes), mediaType };
  artifacts.push(receipt);
  return receipt;
}

function screenshot(artifact, rawWidth, rawHeight, options = {}) {
  const target = options.target ?? "element";
  const requestedViewport = options.requestedViewport ?? {
    width: Math.max(rawWidth, 800),
    height: Math.max(rawHeight, 600),
  };
  const observedViewport = options.observedViewport ?? {
    width: requestedViewport.width,
    height: requestedViewport.height,
    devicePixelRatio: 1,
  };
  return {
    artifact,
    capture: {
      method: "browser-native-direct",
      target,
      requestedViewport,
      observedViewport,
      rawPngRaster: { width: rawWidth, height: rawHeight },
      elementRect: target === "element"
        ? (options.elementRect ?? { x: 0, y: 0, width: rawWidth, height: rawHeight })
        : null,
      cropRect: target === "crop"
        ? (options.cropRect ?? { x: 0, y: 0, width: rawWidth, height: rawHeight })
        : null,
      resized: false,
    },
  };
}

function cameraState(center, eye, up, projectionType) {
  return { center, eye, up, projection: { type: projectionType } };
}

function runtimeTraceAudit() {
  return {
    resultHashes: [RESULT_HASH],
    workerRunCount: 1,
    trajectoryPathCount: 2,
    blackTrajectoryPathCount: 2,
    directionArrowCount: 4,
    blackDirectionArrowCount: 4,
    trajectoryCoordinatesFinite: true,
    directionArrowCoordinatesFinite: true,
    allTrajectoryTracesVisible: true,
    allDirectionArrowTracesVisible: true,
  };
}

async function createFixture(options = {}) {
  const root = await realpath(
    await mkdtemp(join(projectRoot, ".tmp-open-ena-production-browser-run-")),
  );
  const artifacts = [];
  const deploymentReceiptPayload = {
    schemaVersion: "open-ena.vercel-production-binding.v1",
    aliasHost: "ena.hk",
    deploymentId: DEPLOYMENT_ID,
    deploymentUrl: DEPLOYMENT_URL,
    target: "production",
    readyState: "READY",
    gitSha: GIT_SHA,
    observedAt: "2026-08-27T08:00:00.000Z",
  };
  const controlPlaneReceipt = await writeArtifact(
    root,
    artifacts,
    "control-plane/vercel-production-binding.json",
    Buffer.from(JSON.stringify(deploymentReceiptPayload), "utf8"),
    "application/json",
  );

  const viewportSpecs = [
    { name: "desktop", requestedWidth: 1920, requestedHeight: 1080, observedWidth: 1920, observedHeight: 818, plotWidth: 1000, plotHeight: 620 },
    { name: "tablet", requestedWidth: 1024, requestedHeight: 768, observedWidth: 1024, observedHeight: 768, plotWidth: 900, plotHeight: 540 },
    { name: "mobile", requestedWidth: 390, requestedHeight: 844, observedWidth: 390, observedHeight: 844, plotWidth: 390, plotHeight: 500 },
  ];
  const viewports = [];
  for (const [viewportIndex, spec] of viewportSpecs.entries()) {
    const pageArtifact = await writeArtifact(
      root,
      artifacts,
      `screenshots/${spec.name}-page.png`,
      nativePng(spec.observedWidth, spec.observedHeight, 10 + viewportIndex * 2),
      "image/png",
    );
    const plotArtifact = await writeArtifact(
      root,
      artifacts,
      `screenshots/${spec.name}-plot.png`,
      nativePng(spec.plotWidth, spec.plotHeight, 11 + viewportIndex * 2),
      "image/png",
    );
    viewports.push({
      name: spec.name,
      requested: { width: spec.requestedWidth, height: spec.requestedHeight },
      observed: {
        innerWidth: spec.observedWidth,
        innerHeight: spec.observedHeight,
        visualViewportWidth: spec.observedWidth,
        visualViewportHeight: spec.observedHeight,
        devicePixelRatio: 1,
      },
      overflow: {
        documentClientWidth: spec.observedWidth,
        documentScrollWidth: spec.observedWidth,
        bodyClientWidth: spec.observedWidth,
        bodyScrollWidth: spec.observedWidth,
        clippedInteractiveControls: [],
      },
      resultHash: RESULT_HASH,
      scientificTaskCount: 1,
      runtimeTraceAudit: runtimeTraceAudit(),
      pageScreenshot: screenshot(pageArtifact, spec.observedWidth, spec.observedHeight, {
        target: "viewport",
        requestedViewport: { width: spec.requestedWidth, height: spec.requestedHeight },
        observedViewport: { width: spec.observedWidth, height: spec.observedHeight, devicePixelRatio: 1 },
      }),
      plotScreenshot: screenshot(plotArtifact, spec.plotWidth, spec.plotHeight, {
        requestedViewport: { width: spec.requestedWidth, height: spec.requestedHeight },
        observedViewport: { width: spec.observedWidth, height: spec.observedHeight, devicePixelRatio: 1 },
        elementRect: { x: 0, y: 0, width: spec.plotWidth, height: spec.plotHeight },
      }),
    });
  }

  const fullscreenArtifact = await writeArtifact(
    root,
    artifacts,
    "screenshots/fullscreen.png",
    nativePng(1440, 1000, 20),
    "image/png",
  );

  const cameraDefinitions = {
    isometric: cameraState(
      { x: 0, y: 0, z: 0 },
      { x: 1.45 / 1.5, y: 1.45 / 1.5, z: 1.25 / 1.5 },
      { x: 0, y: 0, z: 1 },
      "perspective",
    ),
    xy: cameraState(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 2.5 },
      { x: 0, y: 1, z: 0 },
      "orthographic",
    ),
    xz: cameraState(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 2.5, z: 0 },
      { x: 0, y: 0, z: 1 },
      "orthographic",
    ),
    yz: cameraState(
      { x: 0, y: 0, z: 0 },
      { x: 2.5, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      "orthographic",
    ),
    yx: cameraState(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -2.5 },
      { x: 1, y: 0, z: 0 },
      "orthographic",
    ),
    zx: cameraState(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 2.5, z: 0 },
      { x: 1, y: 0, z: 0 },
      "orthographic",
    ),
    zy: cameraState(
      { x: 0, y: 0, z: 0 },
      { x: -2.5, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      "orthographic",
    ),
  };
  const cameras = [];
  for (const [cameraIndex, [preset, runtimeCamera]] of Object.entries(cameraDefinitions).entries()) {
    const artifact = await writeArtifact(
      root,
      artifacts,
      `screenshots/camera-${preset}.png`,
      nativePng(800, 600, 30 + cameraIndex),
      "image/png",
    );
    cameras.push({
      preset,
      selectedValue: preset,
      visibleLabel: preset.toUpperCase(),
      runtimeCamera,
      resultHash: RESULT_HASH,
      scientificTaskCount: 1,
      runtimeTraceAudit: runtimeTraceAudit(),
      screenshot: screenshot(artifact, 800, 600),
    });
  }

  const dimensionLabels = { x: "SVD1", y: "SVD2", z: "SVD3" };
  const projections = [];
  for (const [projectionIndex, projection] of ["xy", "xz", "yz", "yx", "zx", "zy"].entries()) {
    const artifact = await writeArtifact(
      root,
      artifacts,
      `screenshots/projection-${projection}.png`,
      nativePng(800, 600, 40 + projectionIndex),
      "image/png",
    );
    projections.push({
      projection,
      selectedValue: projection,
      traceTypes: ["scatter"],
      xTitle: dimensionLabels[projection[0]],
      yTitle: dimensionLabels[projection[1]],
      resultHash: RESULT_HASH,
      scientificTaskCount: 1,
      runtimeTraceAudit: runtimeTraceAudit(),
      screenshot: screenshot(artifact, 800, 600),
    });
  }

  const sharedLongitudinalMembers = longitudinalSharedMembers(
    options.participantRows ?? participantFixtureRows(),
    options,
  );
  const aggregateBundle = createLongitudinalZipBundle({
    participantLevelIncluded: false,
    sharedMembers: sharedLongitudinalMembers,
  });
  const participantBundle = createLongitudinalZipBundle({
    participantLevelIncluded: true,
    sharedMembers: sharedLongitudinalMembers,
  });
  const downloadDefinitions = [
    ["bundle", "Analysis bundle ZIP", "downloads/aggregate.zip", aggregateBundle.bytes, "application/zip"],
    ["path", "Path CSV", "downloads/path.csv", aggregateBundle.files.get("trajectory-path.csv"), "text/csv"],
    ["metadata", "Metadata CSV", "downloads/metadata.csv", aggregateBundle.files.get("trajectory-metadata.csv"), "text/csv"],
    ["inference", "Inference CSV", "downloads/inference.csv", aggregateBundle.files.get("trajectory-inference.csv"), "text/csv"],
    ["analysis", "Analysis JSON", "downloads/analysis.json", aggregateBundle.files.get("analysis.json"), "application/json"],
    ["plotly", "Plotly spec JSON", "downloads/plotly.json", aggregateBundle.files.get("plotly-spec.json"), "application/json"],
    ["participant", "Participant-level ZIP (opt-in)", "downloads/participant.zip", participantBundle.bytes, "application/zip"],
  ];
  const downloadItems = [];
  for (const [kind, buttonLabel, file, bytes, mediaType] of downloadDefinitions) {
    const artifact = await writeArtifact(root, artifacts, file, bytes, mediaType);
    const suggestedFilename = kind === "bundle" || kind === "participant"
      ? "3dena-longitudinal-analysis.zip"
      : "open-ena-" + RESULT_HASH.slice(0, 12) + "-trajectory-" + ({
        path: "path.csv",
        metadata: "metadata.csv",
        inference: "inference.csv",
        analysis: "analysis.json",
        plotly: "plotly-spec.json",
      })[kind];
    downloadItems.push({
      kind,
      buttonLabel,
      triggerPageUrl: PRODUCTION_ROUTE,
      downloadObserved: true,
      suggestedFilename,
      downloadGuid: `browser-download-${kind}-guid`,
      downloadUrl: `blob:https://ena.hk/browser-download-${kind}`,
      receivedBytes: artifact.bytes,
      artifact,
    });
  }
  const aggregateArtifact = downloadItems.find(({ kind }) => kind === "bundle").artifact;
  const participantArtifact = downloadItems.find(({ kind }) => kind === "participant").artifact;
  const privacyMessage = "Participant-level data may increase re-identification risk.";
  const rawEvents = [];
  const event = (source, type, raw) => {
    const sequence = rawEvents.length + 1;
    rawEvents.push({
      sequence,
      observedAt: new Date(Date.parse("2026-08-27T08:00:00.000Z") + sequence * 1000)
      .toISOString(),
      source,
      type,
      raw,
      canonicalPayloadSha256: sha256(Buffer.from(canonicalJson(raw), "utf8")),
    });
  };
  const screenshotGeometryObservation = (contextKind, contextValue, capture, traceAudit) => {
    event("app-dom-observation", "screenshot-geometry-observation", {
      contextKind,
      contextValue,
      artifactFile: capture.artifact.file,
      target: capture.capture.target,
      boundingClientRect: capture.capture.elementRect,
      observedViewport: capture.capture.observedViewport,
      rawPngRaster: capture.capture.rawPngRaster,
      runtimeTraceAudit: traceAudit,
    });
  };
  event("app-dom-observation", "worker-event", {
    kind: "dispatch",
    dispatchId: "open-ena-worker-dispatch-1",
    beforeResultHash: null,
    scientificTaskCountBefore: 0,
    workerDispatchCount: 1,
  });
  const phaseCheckpointEvent = (phase, traceAudit = runtimeTraceAudit()) => {
    event("app-dom-observation", "phase-checkpoint-observation", {
      phase,
      resultHash: RESULT_HASH,
      scientificTaskCount: 1,
      runtimeTraceAudit: traceAudit,
    });
  };
  event("app-dom-observation", "worker-event", {
    kind: "complete",
    dispatchId: "open-ena-worker-dispatch-1",
    resultHash: RESULT_HASH,
    scientificTaskCountAfter: 1,
    workerDispatchCount: 1,
  });
  phaseCheckpointEvent("initial-run");
  for (const viewport of viewports) {
    screenshotGeometryObservation(
      "viewport-plot",
      viewport.name,
      viewport.plotScreenshot,
      viewport.runtimeTraceAudit,
    );
  }
  const fullscreenTraceAudit = runtimeTraceAudit();
  screenshotGeometryObservation(
    "fullscreen",
    "fullscreen",
    screenshot(fullscreenArtifact, 1440, 1000, { target: "viewport" }),
    fullscreenTraceAudit,
  );
  for (const camera of cameras) {
    const preset = camera.preset;
    event("automation-command", "automation-command-receipt", {
      command: "select-camera",
      value: preset,
      before: {
        resultHash: RESULT_HASH,
        scientificTaskCount: 1,
        workerDispatchCount: 1,
        runtimeTraceAudit: camera.runtimeTraceAudit,
      },
      after: {
        resultHash: RESULT_HASH,
        scientificTaskCount: 1,
        workerDispatchCount: 1,
        runtimeTraceAudit: camera.runtimeTraceAudit,
      },
    });
    screenshotGeometryObservation(
      "camera",
      preset,
      camera.screenshot,
      camera.runtimeTraceAudit,
    );
  }
  phaseCheckpointEvent("after-cameras");
  for (const projectionEvidence of projections) {
    const projection = projectionEvidence.projection;
    event("automation-command", "automation-command-receipt", {
      command: "select-projection",
      value: projection,
      before: {
        resultHash: RESULT_HASH,
        scientificTaskCount: 1,
        workerDispatchCount: 1,
        runtimeTraceAudit: projectionEvidence.runtimeTraceAudit,
      },
      after: {
        resultHash: RESULT_HASH,
        scientificTaskCount: 1,
        workerDispatchCount: 1,
        runtimeTraceAudit: projectionEvidence.runtimeTraceAudit,
      },
    });
    screenshotGeometryObservation(
      "projection",
      projection,
      projectionEvidence.screenshot,
      projectionEvidence.runtimeTraceAudit,
    );
  }
  phaseCheckpointEvent("after-projections");
  for (const item of downloadItems.filter(({ kind }) => kind !== "participant")) {
    event("cdp", "cdp-event", {
      method: "Page.downloadWillBegin",
      params: {
        guid: item.downloadGuid,
        url: item.downloadUrl,
        suggestedFilename: item.suggestedFilename,
      },
    });
    event("download-event", "download-event", {
      phase: "start",
      kind: item.kind,
      file: item.artifact.file,
      resultHash: RESULT_HASH,
      downloadGuid: item.downloadGuid,
      suggestedFilename: item.suggestedFilename,
    });
    event("download-event", "download-event", {
      phase: "complete",
      kind: item.kind,
      file: item.artifact.file,
      resultHash: RESULT_HASH,
      downloadGuid: item.downloadGuid,
      byteLength: item.artifact.bytes,
      sha256: item.artifact.sha256,
    });
  }
  event("cdp", "cdp-event", {
    method: "Page.javascriptDialogOpening",
    params: {
      type: "confirm",
      message: privacyMessage,
      url: PRODUCTION_ROUTE,
      hasBrowserHandler: true,
    },
  });
  event("cdp", "cdp-event", {
    method: "Page.javascriptDialogClosed",
    params: { result: true, userInput: "" },
  });
  const participantItem = downloadItems.find(({ kind }) => kind === "participant");
  event("cdp", "cdp-event", {
    method: "Page.downloadWillBegin",
    params: {
      guid: participantItem.downloadGuid,
      url: participantItem.downloadUrl,
      suggestedFilename: participantItem.suggestedFilename,
    },
  });
  event("download-event", "download-event", {
    phase: "start",
    kind: participantItem.kind,
    file: participantItem.artifact.file,
    resultHash: RESULT_HASH,
    downloadGuid: participantItem.downloadGuid,
    suggestedFilename: participantItem.suggestedFilename,
  });
  event("download-event", "download-event", {
    phase: "complete",
    kind: participantItem.kind,
    file: participantItem.artifact.file,
    resultHash: RESULT_HASH,
    downloadGuid: participantItem.downloadGuid,
    byteLength: participantItem.artifact.bytes,
    sha256: participantItem.artifact.sha256,
  });
  phaseCheckpointEvent("after-downloads");
  event("app-dom-observation", "remote-post-observation", {
    requestCount: 0,
    requests: [],
  });
  const rawEventLedgerArtifact = await writeArtifact(
    root,
    artifacts,
    "browser/raw-event-ledger.json",
    jsonMember({
      schemaVersion: "open-ena.browser-event-ledger.v1",
      runId: "open-ena-production-20260827-080000",
      evidenceLevel: "browser-observation-consistency",
      browserEventAuthenticity: "not-cryptographically-proven",
      events: rawEvents,
    }),
    "application/json",
  );

  artifacts.sort((left, right) => left.file.localeCompare(right.file));
  const manifest = {
    schemaVersion: "open-ena.production-browser-run.v1",
    run: {
      runId: "open-ena-production-20260827-080000",
      startedAt: "2026-08-27T08:00:00.000Z",
      completedAt: "2026-08-27T08:05:00.000Z",
    },
    target: {
      environment: "production",
      requestedUrl: PRODUCTION_ROUTE,
      finalUrl: PRODUCTION_ROUTE,
      origin: "https://ena.hk",
      serverLifecycle: "external",
      httpStatus: 200,
    },
    deployment: {
      provider: "vercel",
      target: "production",
      readyState: "READY",
      deploymentId: DEPLOYMENT_ID,
      deploymentUrl: DEPLOYMENT_URL,
      gitSha: GIT_SHA,
      controlPlaneReceipt,
    },
    source: { gitHead: GIT_SHA },
    browser: {
      name: "Google Chrome",
      channel: "chrome",
      version: "140.0.7339.207",
      userAgent: "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      automationSurface: "codex-chrome-extension",
    },
    analysis: {
      resultHash: RESULT_HASH,
      executionTarget: "browser-worker",
      traceCount: JSON.parse(
        aggregateBundle.files.get("plotly-spec.json").toString("utf8"),
      ).data.length,
      dimensionLabels,
      runtimeTraceAudit: runtimeTraceAudit(),
      taskCounts: {
        scientificTotal: 1,
        workerRuns: 1,
        remotePosts: 0,
        bootstrapTasks: 0,
        networkOverlayTasks: 0,
      },
      phaseCheckpoints: [
        "initial-run",
        "after-cameras",
        "after-projections",
        "after-downloads",
      ].map((phase) => ({
        phase,
        resultHash: RESULT_HASH,
        scientificTaskCount: 1,
        runtimeTraceAudit: runtimeTraceAudit(),
      })),
    },
    viewports,
    fullscreen: {
      viewport: { width: 1440, height: 1000 },
      shell: { width: 1440, height: 1000 },
      plot: { width: 1440, height: 945 },
      canvas: { width: 1440, height: 945 },
      sceneDomain: { x: [0, 1], y: [0, 1] },
      resultHash: RESULT_HASH,
      scientificTaskCount: 1,
      runtimeTraceAudit: fullscreenTraceAudit,
      screenshot: screenshot(fullscreenArtifact, 1440, 1000, { target: "viewport" }),
    },
    cameras,
    projections,
    browserDiagnostics: {
      observationStartedAt: "2026-08-27T08:00:00.000Z",
      observationCompletedAt: "2026-08-27T08:05:00.000Z",
      consoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      pageCrashes: [],
      rawEventLedger: rawEventLedgerArtifact,
    },
    downloads: {
      items: downloadItems,
      aggregateBundle: {
        artifact: aggregateArtifact,
        resultHash: RESULT_HASH,
        contentSetHash: aggregateBundle.manifest.contentSetHash,
        participantLevelIncluded: false,
        participantCsvPresent: false,
      },
      participantBundle: {
        artifact: participantArtifact,
        resultHash: RESULT_HASH,
        contentSetHash: participantBundle.manifest.contentSetHash,
        participantLevelIncluded: true,
        participantCsvPresent: true,
        privacyWarningPresent: true,
        participantCsvSha256: sha256(
          participantBundle.files.get("trajectory-participants.csv"),
        ),
      },
      standaloneMembersMatchAggregate: true,
      privacyDialog: {
        type: "confirm",
        observed: true,
        accepted: true,
        dialogCount: 1,
        message: privacyMessage,
        messageSha256: sha256(Buffer.from(privacyMessage, "utf8")),
        downloadObservedAfterAcceptance: true,
      },
    },
    artifacts,
    contentSetHash: hashCanonical(artifacts),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeFile(join(root, MANIFEST_PATH), manifestBytes);
  await mkdir(join(root, "receipts"), { recursive: true });
  return {
    bundles: {
      aggregate: aggregateBundle,
      participant: participantBundle,
      sharedMembers: sharedLongitudinalMembers,
    },
    root,
    manifest,
    manifestSha256: sha256(manifestBytes),
    manifestPath: join(root, MANIFEST_PATH),
    receiptPath: join(root, RECEIPT_PATH),
  };
}

function runVerifier(fixture, expectedManifestSha256 = fixture.manifestSha256) {
  return spawnSync(
    process.execPath,
    [verifierPath, fixture.root, MANIFEST_PATH, expectedManifestSha256, RECEIPT_PATH],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function runVerifierWithEnvironment(fixture, environment) {
  return spawnSync(
    process.execPath,
    [verifierPath, fixture.root, MANIFEST_PATH, fixture.manifestSha256, RECEIPT_PATH],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, ...environment },
    },
  );
}

function runVerifierAtRoot(fixture, root) {
  return spawnSync(
    process.execPath,
    [verifierPath, root, MANIFEST_PATH, fixture.manifestSha256, RECEIPT_PATH],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function runVerifierWithPaths(
  fixture,
  manifestRelativePath,
  expectedManifestSha256,
  receiptRelativePath,
) {
  return spawnSync(
    process.execPath,
    [
      verifierPath,
      fixture.root,
      manifestRelativePath,
      expectedManifestSha256,
      receiptRelativePath,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

async function persistManifest(fixture, bytes = null) {
  const manifestBytes = bytes ?? Buffer.from(JSON.stringify(fixture.manifest, null, 2) + "\n", "utf8");
  await writeFile(fixture.manifestPath, manifestBytes);
  fixture.manifestSha256 = sha256(manifestBytes);
}

function updateArtifactReferences(value, file, replacement) {
  if (!value || typeof value !== "object") return;
  if (
    !Array.isArray(value)
    && value.file === file
    && Object.hasOwn(value, "bytes")
    && Object.hasOwn(value, "sha256")
    && Object.hasOwn(value, "mediaType")
  ) {
    Object.assign(value, replacement);
    return;
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    updateArtifactReferences(child, file, replacement);
  }
}

async function replaceArtifactBytes(fixture, file, bytes) {
  const previous = fixture.manifest.artifacts.find((artifact) => artifact.file === file);
  assert.ok(previous, "fixture artifact must exist: " + file);
  const replacement = {
    file,
    bytes: bytes.length,
    sha256: sha256(bytes),
    mediaType: previous.mediaType,
  };
  await writeFile(join(fixture.root, ...file.split("/")), bytes);
  updateArtifactReferences(fixture.manifest, file, replacement);
  const downloadItem = fixture.manifest.downloads?.items?.find(
    (item) => item.artifact?.file === file,
  );
  if (downloadItem) {
    downloadItem.receivedBytes = replacement.bytes;
  }
  fixture.manifest.contentSetHash = hashCanonical(fixture.manifest.artifacts);
  await persistManifest(fixture);
}

async function mutateRawBrowserEventLedger(fixture, mutate) {
  const file = "browser/raw-event-ledger.json";
  const ledger = JSON.parse(await readFile(join(fixture.root, file), "utf8"));
  mutate(ledger.events, ledger);
  for (const event of ledger.events) {
    if (event.raw && typeof event.raw === "object") {
      event.canonicalPayloadSha256 = sha256(Buffer.from(canonicalJson(event.raw), "utf8"));
    }
  }
  await replaceArtifactBytes(fixture, file, jsonMember(ledger));
}

async function synchronizeRawDownloadReceipts(fixture, files) {
  const changed = new Set(files);
  await mutateRawBrowserEventLedger(fixture, (events) => {
    for (const event of events) {
      if (
        event.type !== "download-event"
        || event.raw?.phase !== "complete"
        || !changed.has(event.raw.file)
      ) continue;
      const artifact = fixture.manifest.artifacts.find(({ file }) => file === event.raw.file);
      assert.ok(artifact, "raw download receipt artifact must exist: " + event.raw.file);
      event.raw.byteLength = artifact.bytes;
      event.raw.sha256 = artifact.sha256;
    }
  });
}

async function replaceBundleBytes(fixture, kind, bundle, synchronizeClaims = true) {
  const file = kind === "aggregate"
    ? "downloads/aggregate.zip"
    : "downloads/participant.zip";
  if (synchronizeClaims) {
    const claims = kind === "aggregate"
      ? fixture.manifest.downloads.aggregateBundle
      : fixture.manifest.downloads.participantBundle;
    claims.contentSetHash = bundle.manifest.contentSetHash;
    if (kind === "participant" && bundle.files.has("trajectory-participants.csv")) {
      claims.participantCsvSha256 = sha256(
        bundle.files.get("trajectory-participants.csv"),
      );
    }
  }
  await replaceArtifactBytes(fixture, file, bundle.bytes);
}

async function replaceSharedLongitudinalMember(fixture, memberPath, bytes) {
  const sharedMembers = new Map(fixture.bundles.sharedMembers);
  sharedMembers.set(memberPath, bytes);
  const aggregate = createLongitudinalZipBundle({
    participantLevelIncluded: false,
    sharedMembers,
  });
  const participant = createLongitudinalZipBundle({
    participantLevelIncluded: true,
    sharedMembers,
  });
  fixture.bundles = {
    ...fixture.bundles,
    aggregate,
    participant,
    sharedMembers,
  };
  await replaceBundleBytes(fixture, "aggregate", aggregate);
  await replaceBundleBytes(fixture, "participant", participant);
  const standaloneFiles = {
    "analysis.json": "downloads/analysis.json",
    "trajectory-path.csv": "downloads/path.csv",
    "trajectory-metadata.csv": "downloads/metadata.csv",
    "trajectory-inference.csv": "downloads/inference.csv",
    "plotly-spec.json": "downloads/plotly.json",
  };
  const standaloneFile = standaloneFiles[memberPath];
  assert.ok(standaloneFile, "shared longitudinal member needs a standalone mapping");
  await replaceArtifactBytes(fixture, standaloneFile, bytes);
}

async function replaceParticipantCsv(fixture, bytes) {
  const participant = createLongitudinalZipBundle({
    participantLevelIncluded: true,
    sharedMembers: fixture.bundles.sharedMembers,
    participantCsvBytes: bytes,
  });
  fixture.bundles.participant = participant;
  await replaceBundleBytes(fixture, "participant", participant);
  await synchronizeRawDownloadReceipts(fixture, ["downloads/participant.zip"]);
}

async function replaceAggregatePlotly(fixture, plotly) {
  const bytes = Buffer.isBuffer(plotly) ? plotly : jsonMember(plotly);
  const aggregate = createLongitudinalZipBundle({
    participantLevelIncluded: false,
    sharedMembers: fixture.bundles.sharedMembers,
    plotlyBytes: bytes,
  });
  fixture.bundles.aggregate = aggregate;
  await replaceBundleBytes(fixture, "aggregate", aggregate);
  await replaceArtifactBytes(fixture, "downloads/plotly.json", bytes);
  await synchronizeRawDownloadReceipts(
    fixture,
    ["downloads/aggregate.zip", "downloads/plotly.json"],
  );
}

async function replaceParticipantPlotly(fixture, plotly) {
  const bytes = Buffer.isBuffer(plotly) ? plotly : jsonMember(plotly);
  const participant = createLongitudinalZipBundle({
    participantLevelIncluded: true,
    sharedMembers: fixture.bundles.sharedMembers,
    plotlyBytes: bytes,
  });
  fixture.bundles.participant = participant;
  await replaceBundleBytes(fixture, "participant", participant);
  await synchronizeRawDownloadReceipts(fixture, ["downloads/participant.zip"]);
}

async function rejectFixture(fixture, expectedError, options = {}) {
  const result = options.result ?? runVerifier(fixture, options.expectedManifestSha256);
  assert.notEqual(result.status, 0, "tampered evidence was accepted");
  assert.match(result.stderr, expectedError);
  await assert.rejects(readFile(fixture.receiptPath), { code: "ENOENT" });
}

async function assertNoConsumablePassReceipt(receiptPath) {
  try {
    const bytes = await readFile(receiptPath);
    let value;
    try {
      value = JSON.parse(bytes.toString("utf8"));
    } catch {
      return;
    }
    assert.notEqual(value?.status, "PASS", "a consumable PASS receipt remained");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function withFixture(run) {
  const fixture = await createFixture();
  try {
    await run(fixture);
  } finally {
    await removeFixture(fixture);
  }
}

async function withFixtureOptions(options, run) {
  const fixture = await createFixture(options);
  try {
    await run(fixture);
  } finally {
    await removeFixture(fixture);
  }
}

async function removeFixture(fixture) {
  await rm(fixture.root, { recursive: true, force: true });
}

test("valid production browser evidence writes a verifier PASS receipt", async () => {
  const fixture = await createFixture();
  try {
    const desktop = fixture.manifest.viewports.find(({ name }) => name === "desktop");
    assert.deepEqual(desktop.requested, { width: 1920, height: 1080 });
    assert.equal(desktop.observed.innerWidth, 1920);
    assert.equal(desktop.observed.innerHeight, 818);
    assert.deepEqual(
      desktop.pageScreenshot.capture.rawPngRaster,
      { width: 1920, height: 818 },
    );
    const result = runVerifier(fixture);
    assert.equal(result.status, 0, result.stderr);
    const receiptBytes = await readFile(fixture.receiptPath);
    const receipt = JSON.parse(receiptBytes.toString("utf8"));
    assert.deepEqual(Object.keys(receipt).sort(), [
      "artifactCount",
      "browserEventAuthenticity",
      "contentSetHash",
      "custodyModel",
      "deploymentId",
      "evidenceLevel",
      "gitSha",
      "input",
      "resultHash",
      "runId",
      "schemaVersion",
      "status",
      "verifiedAt",
    ]);
    assert.equal(receipt.schemaVersion, "open-ena.production-browser-run-verification.v1");
    assert.equal(receipt.status, "PASS");
    assert.equal(receipt.evidenceLevel, "browser-observation-consistency");
    assert.equal(
      receipt.browserEventAuthenticity,
      "not-cryptographically-proven",
    );
    // Node does not expose openat2-style directory pinning here. This deliberately
    // narrow model proves held-open file snapshots under a single-writer root; it
    // does not claim protection against an active same-UID directory replacement.
    assert.equal(receipt.custodyModel, "single-writer-open-descriptor-snapshot-v1");
    assert.deepEqual(receipt.input, {
      manifestFile: MANIFEST_PATH,
      manifestSha256: fixture.manifestSha256,
    });
    assert.equal(receipt.contentSetHash, fixture.manifest.contentSetHash);
    assert.equal(receipt.runId, fixture.manifest.run.runId);
    assert.equal(receipt.deploymentId, DEPLOYMENT_ID);
    assert.equal(receipt.gitSha, GIT_SHA);
    assert.equal(receipt.resultHash, RESULT_HASH);
    assert.equal(receipt.artifactCount, fixture.manifest.artifacts.length);
    assert.equal(Number.isNaN(Date.parse(receipt.verifiedAt)), false);
    assert.match(result.stdout, new RegExp("receiptSha256=" + sha256(receiptBytes), "u"));
  } finally {
    await removeFixture(fixture);
  }
});

test("rejects unknown top-level and nested manifest fields", async (t) => {
  await t.test("top-level", async () => withFixture(async (fixture) => {
    fixture.manifest.untrustedPass = true;
    await persistManifest(fixture);
    await rejectFixture(fixture, /top-level|unknown field|exact keys/iu);
  }));
  await t.test("nested", async () => withFixture(async (fixture) => {
    fixture.manifest.browser.untrustedRuntime = "chrome";
    await persistManifest(fixture);
    await rejectFixture(fixture, /browser|unknown field|exact keys/iu);
  }));
});

test("rejects duplicate JSON keys including escape-equivalent keys", async () => {
  await withFixture(async (fixture) => {
    const source = await readFile(fixture.manifestPath, "utf8");
    const marker = '"schemaVersion": "open-ena.production-browser-run.v1"';
    const duplicate = marker + ',\n  "schema\\u0056ersion": "open-ena.production-browser-run.v1"';
    assert.ok(source.includes(marker));
    await persistManifest(fixture, Buffer.from(source.replace(marker, duplicate), "utf8"));
    await rejectFixture(fixture, /duplicate JSON key.*schemaVersion/iu);
  });
});

test("rejects manifest bytes that are not valid UTF-8", async () => {
  await withFixture(async (fixture) => {
    const source = await readFile(fixture.manifestPath);
    await persistManifest(fixture, Buffer.concat([source.subarray(0, -2), Buffer.from([0xff, 0x0a])]));
    await rejectFixture(fixture, /UTF-8/iu);
  });
});

test("rejects non-strict manifest and receipt paths", async (t) => {
  await t.test("manifest path traversal segment", async () => withFixture(async (fixture) => {
    const result = runVerifierWithPaths(
      fixture,
      "manifest-parent/../manifest.json",
      fixture.manifestSha256,
      RECEIPT_PATH,
    );
    await rejectFixture(fixture, /manifest.*relative path|\.\.|path segment/iu, { result });
  }));
  await t.test("receipt dot-dot segment", async () => withFixture(async (fixture) => {
    const result = runVerifierWithPaths(
      fixture,
      MANIFEST_PATH,
      fixture.manifestSha256,
      "receipts/../verification.json",
    );
    assert.notEqual(result.status, 0, "non-strict receipt path was accepted");
    assert.match(result.stderr, /receipt.*relative path|\.\.|path segment/iu);
  }));
});

test("rejects artifact path escape", async () => {
  await withFixture(async (fixture) => {
    fixture.manifest.artifacts[0].file = "../escape.png";
    fixture.manifest.contentSetHash = hashCanonical(fixture.manifest.artifacts);
    await persistManifest(fixture);
    await rejectFixture(fixture, /artifact.*relative path|\.\.|path segment/iu);
  });
});

test("rejects leaf and parent symlinks in artifact custody", async (t) => {
  await t.test("leaf symlink", async () => withFixture(async (fixture) => {
    const file = "screenshots/desktop-page.png";
    const absolute = join(fixture.root, ...file.split("/"));
    const target = absolute + ".target";
    await rename(absolute, target);
    await symlink(basename(target), absolute);
    await rejectFixture(fixture, /symlink/iu);
  }));
  await t.test("parent symlink", async () => withFixture(async (fixture) => {
    const directory = join(fixture.root, "screenshots");
    const target = join(fixture.root, "screenshots-real");
    await rename(directory, target);
    await symlink("screenshots-real", directory);
    await rejectFixture(fixture, /symlink/iu);
  }));
});

test("rejects a declared artifact that is not a regular file", async () => {
  await withFixture(async (fixture) => {
    const file = "screenshots/desktop-page.png";
    const absolute = join(fixture.root, ...file.split("/"));
    await rm(absolute);
    await mkdir(absolute);
    await rejectFixture(fixture, /regular file/iu);
  });
});

test("rejects a stale externally pinned manifest SHA-256", async () => {
  await withFixture(async (fixture) => {
    await rejectFixture(fixture, /manifest SHA-256.*externally pinned/iu, {
      expectedManifestSha256: "0".repeat(64),
    });
  });
});

test("rejects production target identity drift", async () => {
  await withFixture(async (fixture) => {
    fixture.manifest.target.origin = "https://preview.ena.hk";
    await persistManifest(fixture);
    await rejectFixture(fixture, /target\.origin|final origin|https:\/\/ena\.hk/iu);
  });
});

test("rejects control-plane deployment binding drift after bytes are rehashed", async () => {
  await withFixture(async (fixture) => {
    const file = fixture.manifest.deployment.controlPlaneReceipt.file;
    const payload = JSON.parse(await readFile(join(fixture.root, ...file.split("/")), "utf8"));
    payload.deploymentId = "dpl_different_production";
    await replaceArtifactBytes(fixture, file, Buffer.from(JSON.stringify(payload), "utf8"));
    await rejectFixture(fixture, /control-plane.*deploymentId|deploymentId.*manifest/iu);
  });
});

test("accepts a freshly resolved production binding immediately before diagnostics begin", async () => {
  await withFixture(async (fixture) => {
    const file = fixture.manifest.deployment.controlPlaneReceipt.file;
    const payload = JSON.parse(await readFile(join(fixture.root, ...file.split("/")), "utf8"));
    payload.observedAt = "2026-08-27T07:59:30.000Z";
    await replaceArtifactBytes(fixture, file, Buffer.from(JSON.stringify(payload), "utf8"));
    const result = runVerifier(fixture);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("rejects a stale, future, or post-run production binding", async (t) => {
  for (const [label, observedAt] of [
    ["stale", "2026-08-27T07:58:59.999Z"],
    ["future", "2026-08-27T08:00:00.001Z"],
    ["post-run", "2026-08-27T08:05:00.001Z"],
  ]) {
    await t.test(label, async () => withFixture(async (fixture) => {
      const file = fixture.manifest.deployment.controlPlaneReceipt.file;
      const payload = JSON.parse(await readFile(join(fixture.root, ...file.split("/")), "utf8"));
      payload.observedAt = observedAt;
      await replaceArtifactBytes(fixture, file, Buffer.from(JSON.stringify(payload), "utf8"));
      await rejectFixture(fixture, /control-plane\.observedAt|fresh|run window/iu);
    }));
  }
});

test("rejects browser runtime identity drift", async () => {
  await withFixture(async (fixture) => {
    fixture.manifest.browser.automationSurface = "playwright-cli";
    await persistManifest(fixture);
    await rejectFixture(fixture, /automationSurface|codex-chrome-extension/iu);
  });
});

test("rejects JPEG bytes masquerading behind a PNG artifact", async () => {
  await withFixture(async (fixture) => {
    const jpeg = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");
    await replaceArtifactBytes(fixture, "screenshots/desktop-page.png", jpeg);
    await rejectFixture(fixture, /PNG signature|native PNG|image\/png/iu);
  });
});

test("rejects a 390x844 mobile page screenshot raster mismatch", async () => {
  await withFixture(async (fixture) => {
    await replaceArtifactBytes(fixture, "screenshots/mobile-page.png", nativePng(389, 844));
    await rejectFixture(fixture, /mobile.*page.*390.*844|page screenshot.*dimension|IHDR/iu);
  });
});

test("rejects screenshot geometry that masquerades post-processing as native capture", async (t) => {
  await t.test("resized flag", async () => withFixture(async (fixture) => {
    fixture.manifest.viewports[0].pageScreenshot.capture.resized = true;
    await persistManifest(fixture);
    await rejectFixture(fixture, /screenshot.*resized|post-processed/iu);
  }));
  await t.test("post-processing method", async () => withFixture(async (fixture) => {
    fixture.manifest.viewports[0].pageScreenshot.capture.method = "image-resize";
    await persistManifest(fixture);
    await rejectFixture(fixture, /browser-native-direct|post-processed|capture\.method/iu);
  }));
  await t.test("half-size raster cannot claim full observed viewport", async () => {
    await withFixture(async (fixture) => {
      const screenshotValue = fixture.manifest.viewports[0].pageScreenshot;
      screenshotValue.capture.rawPngRaster = { width: 960, height: 409 };
      await replaceArtifactBytes(
        fixture,
        "screenshots/desktop-page.png",
        nativePng(960, 409),
      );
      await rejectFixture(fixture, /raw PNG raster.*geometry|direct browser geometry/iu);
    });
  });
  await t.test("self-reported observed viewport cannot drift from browser observation", async () => {
    await withFixture(async (fixture) => {
      const capture = fixture.manifest.viewports[0].pageScreenshot.capture;
      capture.observedViewport = { width: 960, height: 409, devicePixelRatio: 1 };
      capture.rawPngRaster = { width: 960, height: 409 };
      await replaceArtifactBytes(
        fixture,
        "screenshots/desktop-page.png",
        nativePng(960, 409),
      );
      await rejectFixture(fixture, /observedViewport.*browser observation|capture.*observed/iu);
    });
  });
  await t.test("element rectangle must bind its raw raster", async () => {
    await withFixture(async (fixture) => {
      fixture.manifest.viewports[1].plotScreenshot.capture.elementRect.width = 899;
      await persistManifest(fixture);
      await rejectFixture(fixture, /raw PNG raster.*geometry|elementRect/iu);
    });
  });
  await t.test("crop target must disclose a crop rectangle", async () => {
    await withFixture(async (fixture) => {
      const capture = fixture.manifest.viewports[1].plotScreenshot.capture;
      capture.target = "crop";
      capture.elementRect = null;
      capture.cropRect = null;
      await persistManifest(fixture);
      await rejectFixture(fixture, /cropRect|capture.*crop/iu);
    });
  });
});

test("rejects structurally incomplete or corrupted PNG screenshots", async (t) => {
  await t.test("IHDR-only truncation", async () => {
    await withFixture(async (fixture) => {
      const png = nativePng(1440, 1000);
      await replaceArtifactBytes(fixture, "screenshots/desktop-page.png", png.subarray(0, 33));
      await rejectFixture(fixture, /PNG.*IDAT|PNG.*IEND|truncated.*PNG/iu);
    });
  });

  await t.test("missing IDAT", async () => {
    await withFixture(async (fixture) => {
      const png = nativePng(1440, 1000);
      const withoutIdat = Buffer.concat([
        png.subarray(0, 33),
        png.subarray(png.length - 12),
      ]);
      await replaceArtifactBytes(fixture, "screenshots/desktop-page.png", withoutIdat);
      await rejectFixture(fixture, /PNG.*IDAT|image data.*missing/iu);
    });
  });

  await t.test("missing IEND", async () => {
    await withFixture(async (fixture) => {
      const png = nativePng(1440, 1000);
      await replaceArtifactBytes(
        fixture,
        "screenshots/desktop-page.png",
        png.subarray(0, png.length - 12),
      );
      await rejectFixture(fixture, /PNG.*IEND|truncated.*PNG/iu);
    });
  });

  await t.test("bad non-IHDR chunk CRC", async () => {
    await withFixture(async (fixture) => {
      const png = Buffer.from(nativePng(1440, 1000));
      assert.equal(png.subarray(37, 41).toString("ascii"), "IDAT");
      png[41] ^= 0x01;
      await replaceArtifactBytes(fixture, "screenshots/desktop-page.png", png);
      await rejectFixture(fixture, /PNG.*CRC|PNG.*checksum/iu);
    });
  });

  await t.test("trailing bytes after IEND", async () => {
    await withFixture(async (fixture) => {
      const png = Buffer.concat([
        nativePng(1440, 1000),
        Buffer.from("hidden-after-iend", "utf8"),
      ]);
      await replaceArtifactBytes(fixture, "screenshots/desktop-page.png", png);
      await rejectFixture(fixture, /PNG.*trailing|IEND.*last|bytes after IEND/iu);
    });
  });
});

test("rejects viewport observation drift and horizontal overflow", async (t) => {
  await t.test("accepts an exact 390x844 Chrome surface with a bounded classic vertical scrollbar", async () => {
    await withFixture(async (fixture) => {
      const mobile = fixture.manifest.viewports.find(({ name }) => name === "mobile");
      mobile.observed.visualViewportWidth = 375;
      mobile.overflow.documentClientWidth = 375;
      mobile.overflow.documentScrollWidth = 375;
      mobile.overflow.bodyClientWidth = 375;
      mobile.overflow.bodyScrollWidth = 375;
      await persistManifest(fixture);
      const result = runVerifier(fixture);
      assert.equal(result.status, 0, result.stderr);
    });
  });
  await t.test("observed viewport", async () => withFixture(async (fixture) => {
    fixture.manifest.viewports.find(({ name }) => name === "mobile").observed.innerHeight = 843;
    await persistManifest(fixture);
    await rejectFixture(fixture, /mobile.*observed|innerHeight|390x844/iu);
  }));
  await t.test("document overflow", async () => withFixture(async (fixture) => {
    fixture.manifest.viewports[0].overflow.documentScrollWidth = 1441;
    await persistManifest(fixture);
    await rejectFixture(fixture, /overflow|documentScrollWidth/iu);
  }));
  await t.test("oversized native-scrollbar claim", async () => withFixture(async (fixture) => {
    const mobile = fixture.manifest.viewports.find(({ name }) => name === "mobile");
    mobile.observed.visualViewportWidth = 350;
    for (const field of [
      "documentClientWidth",
      "documentScrollWidth",
      "bodyClientWidth",
      "bodyScrollWidth",
    ]) mobile.overflow[field] = 350;
    await persistManifest(fixture);
    await rejectFixture(fixture, /scrollbar|visual viewport|gutter/iu);
  }));
  await t.test("mobile requested viewport must be exactly 390x844", async () => {
    await withFixture(async (fixture) => {
      const mobile = fixture.manifest.viewports.find(({ name }) => name === "mobile");
      mobile.requested.width = 391;
      mobile.pageScreenshot.capture.requestedViewport.width = 391;
      mobile.plotScreenshot.capture.requestedViewport.width = 391;
      await persistManifest(fixture);
      await rejectFixture(fixture, /mobile.*requested.*390.*844|exact.*390x844/iu);
    });
  });
  await t.test("mobile observed viewport must be exactly 390x844", async () => {
    await withFixture(async (fixture) => {
      const mobile = fixture.manifest.viewports.find(({ name }) => name === "mobile");
      mobile.observed.innerHeight = 843;
      mobile.observed.visualViewportHeight = 843;
      mobile.pageScreenshot.capture.observedViewport.height = 843;
      mobile.pageScreenshot.capture.rawPngRaster.height = 843;
      mobile.plotScreenshot.capture.observedViewport.height = 843;
      await replaceArtifactBytes(
        fixture,
        "screenshots/mobile-page.png",
        nativePng(390, 843, 14),
      );
      await mutateRawBrowserEventLedger(fixture, (events) => {
        const observation = events.find((entry) => (
          entry.type === "screenshot-geometry-observation"
          && entry.raw.contextKind === "viewport-plot"
          && entry.raw.contextValue === "mobile"
        ));
        observation.raw.observedViewport.height = 843;
      });
      await rejectFixture(fixture, /mobile.*observed.*390.*844|exact.*390x844/iu);
    });
  });
});

test("rejects missing and duplicate camera presets", async (t) => {
  await t.test("missing", async () => withFixture(async (fixture) => {
    fixture.manifest.cameras.pop();
    await persistManifest(fixture);
    await rejectFixture(fixture, /camera.*exact set|camera.*missing/iu);
  }));
  await t.test("duplicate", async () => withFixture(async (fixture) => {
    fixture.manifest.cameras.at(-1).preset = "xy";
    fixture.manifest.cameras.at(-1).selectedValue = "xy";
    fixture.manifest.cameras.at(-1).visibleLabel = "XY";
    await persistManifest(fixture);
    await rejectFixture(fixture, /camera.*duplicate|camera.*exact set/iu);
  }));
});

test("rejects non-canonical camera state including isometric projection drift", async () => {
  await withFixture(async (fixture) => {
    fixture.manifest.cameras[0].runtimeCamera.projection.type = "orthographic";
    await persistManifest(fixture);
    await rejectFixture(fixture, /isometric.*perspective|runtimeCamera/iu);
  });
});

test("rejects missing and duplicate projection planes", async (t) => {
  await t.test("missing", async () => withFixture(async (fixture) => {
    fixture.manifest.projections.pop();
    await persistManifest(fixture);
    await rejectFixture(fixture, /projection.*exact set|projection.*missing/iu);
  }));
  await t.test("duplicate", async () => withFixture(async (fixture) => {
    fixture.manifest.projections.at(-1).projection = "xy";
    fixture.manifest.projections.at(-1).selectedValue = "xy";
    await persistManifest(fixture);
    await rejectFixture(fixture, /projection.*duplicate|projection.*exact set/iu);
  }));
});

test("rejects forbidden 3D traces and frozen projection-axis drift", async (t) => {
  await t.test("forbidden trace", async () => withFixture(async (fixture) => {
    fixture.manifest.projections[0].traceTypes.push("scatter3d");
    await persistManifest(fixture);
    await rejectFixture(fixture, /scatter3d|traceTypes/iu);
  }));
  await t.test("axis order", async () => withFixture(async (fixture) => {
    fixture.manifest.projections.find(({ projection }) => projection === "yx").xTitle = "SVD1";
    await persistManifest(fixture);
    await rejectFixture(fixture, /projection yx.*xTitle|axis.*order/iu);
  }));
});

test("rejects result-hash and scientific-task drift", async (t) => {
  await t.test("result hash", async () => withFixture(async (fixture) => {
    fixture.manifest.cameras[2].resultHash = "e".repeat(64);
    await persistManifest(fixture);
    await rejectFixture(fixture, /camera.*resultHash|result hash.*drift/iu);
  }));
  await t.test("task count", async () => withFixture(async (fixture) => {
    fixture.manifest.analysis.phaseCheckpoints[2].scientificTaskCount = 2;
    await persistManifest(fixture);
    await rejectFixture(fixture, /scientificTaskCount|task count.*drift/iu);
  }));
  await t.test("runtime black trajectory trace drift", async () => withFixture(async (fixture) => {
    fixture.manifest.cameras[0].runtimeTraceAudit.blackTrajectoryPathCount = 1;
    await persistManifest(fixture);
    await rejectFixture(fixture, /runtimeTraceAudit|black.*trajectory|live Plotly/iu);
  }));
  await t.test("phase runtime worker count drift", async () => withFixture(async (fixture) => {
    fixture.manifest.analysis.phaseCheckpoints[2].runtimeTraceAudit.workerRunCount = 2;
    await persistManifest(fixture);
    await rejectFixture(fixture, /runtimeTraceAudit|workerRunCount|single observed Worker/iu);
  }));
});

test("rejects missing required phase checkpoints", async () => {
  await withFixture(async (fixture) => {
    fixture.manifest.analysis.phaseCheckpoints.pop();
    await persistManifest(fixture);
    await rejectFixture(fixture, /phaseCheckpoints|after-downloads/iu);
  });
});

test("accepts a fullscreen WebGL canvas that visibly covers at least 94% of the full plot", async () => {
  await withFixture(async (fixture) => {
    fixture.manifest.fullscreen.canvas = { width: 1408, height: 897 };
    await persistManifest(fixture);
    const result = runVerifier(fixture);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("rejects a fullscreen WebGL canvas that leaves a material unused plot area", async () => {
  await withFixture(async (fixture) => {
    fixture.manifest.fullscreen.canvas = { width: 1300, height: 800 };
    await persistManifest(fixture);
    await rejectFixture(fixture, /fullscreen.*canvas|cover.*plot|94%/iu);
  });
});

test("rejects a fullscreen WebGL canvas that exceeds the fullscreen plot shell", async (t) => {
  await t.test("width", async () => withFixture(async (fixture) => {
    fixture.manifest.fullscreen.canvas = { width: 1441, height: 945 };
    await persistManifest(fixture);
    await rejectFixture(fixture, /fullscreen.*canvas|cover.*plot|94%/iu);
  }));
  await t.test("height", async () => withFixture(async (fixture) => {
    fixture.manifest.fullscreen.canvas = { width: 1440, height: 946 };
    await persistManifest(fixture);
    await rejectFixture(fixture, /fullscreen.*canvas|cover.*plot|94%/iu);
  }));
});

test("rejects fullscreen scene-domain drift", async () => {
  await withFixture(async (fixture) => {
    fixture.manifest.fullscreen.sceneDomain.x = [0, 0.9];
    await persistManifest(fixture);
    await rejectFixture(fixture, /sceneDomain|full domain/iu);
  });
});

test("rejects non-empty console and page error ledgers", async (t) => {
  await t.test("console", async () => withFixture(async (fixture) => {
    fixture.manifest.browserDiagnostics.consoleErrors.push({ text: "boom" });
    await persistManifest(fixture);
    await rejectFixture(fixture, /consoleErrors.*empty|browser diagnostics/iu);
  }));
  await t.test("page", async () => withFixture(async (fixture) => {
    fixture.manifest.browserDiagnostics.pageErrors.push("page boom");
    await persistManifest(fixture);
    await rejectFixture(fixture, /pageErrors.*empty|browser diagnostics/iu);
  }));
});

test("rejects raw browser event ledger omissions, drift, and ordering fraud", async (t) => {
  await t.test("missing camera action", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      events.splice(events.findIndex(({ raw }) => raw.command === "select-camera"), 1);
    });
    await rejectFixture(fixture, /raw event ledger.*(?:sequence|exact ordered|camera)/iu);
  }));
  await t.test("camera action order", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const cameras = events.filter(({ raw }) => raw.command === "select-camera");
      [cameras[0].raw, cameras[1].raw] = [cameras[1].raw, cameras[0].raw];
    });
    await rejectFixture(fixture, /raw event ledger.*(?:order|expected result hash|worker dispatch)/iu);
  }));
  await t.test("projection before/after hash drift", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      events.find(({ raw }) => raw.command === "select-projection")
        .raw.after.resultHash = "e".repeat(64);
    });
    await rejectFixture(fixture, /raw event ledger.*(?:result hash|raw does not bind)/iu);
  }));
  await t.test("worker dispatch count drift", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      events.find(({ raw }) => raw.kind === "complete").raw.workerDispatchCount = 2;
    });
    await rejectFixture(fixture, /raw event ledger.*(?:worker dispatch|raw does not bind)/iu);
  }));
  await t.test("remote POST self-attestation", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const remote = events.find(({ type }) => type === "remote-post-observation");
      remote.raw = { requestCount: 1, requests: [{ url: "https://remote.invalid" }] };
    });
    await rejectFixture(fixture, /raw event ledger.*(?:remote POST|raw does not bind)/iu);
  }));
  await t.test("dialog accepted before opening", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const opening = events.find(({ raw }) => raw.method === "Page.javascriptDialogOpening");
      const closed = events.find(({ raw }) => raw.method === "Page.javascriptDialogClosed");
      [opening.raw, closed.raw] = [closed.raw, opening.raw];
    });
    await rejectFixture(fixture, /raw event ledger.*(?:dialog|type\/order)/iu);
  }));
  await t.test("participant download before acceptance", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const closed = events.find(({ raw }) => raw.method === "Page.javascriptDialogClosed");
      const participantStart = events.find(
        ({ raw }) => raw.phase === "start" && raw.kind === "participant",
      );
      [closed.source, participantStart.source] = [participantStart.source, closed.source];
      [closed.type, participantStart.type] = [participantStart.type, closed.type];
      [closed.raw, participantStart.raw] = [participantStart.raw, closed.raw];
    });
    await rejectFixture(fixture, /raw event ledger.*(?:dialog|download|type\/order)/iu);
  }));
  await t.test("download completion before start", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const start = events.find(({ raw }) => raw.phase === "start" && raw.kind === "path");
      const complete = events.find(
        ({ raw }) => raw.phase === "complete" && raw.kind === "path",
      );
      [start.raw, complete.raw] = [complete.raw, start.raw];
    });
    await rejectFixture(fixture, /raw event ledger.*(?:download|type\/order)/iu);
  }));
  await t.test("CDP suggested filename drift", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const observed = events.find(
        ({ raw }) => raw.method === "Page.downloadWillBegin"
          && raw.params?.suggestedFilename === "3dena-longitudinal-analysis.zip",
      );
      assert.ok(observed, "fixture must carry the browser-observed CDP download filename");
      observed.raw.params.suggestedFilename = "unexpected-browser-name.zip";
    });
    await rejectFixture(fixture, /downloadWillBegin|suggestedFilename|download receipt/iu);
  }));
  await t.test("CDP download GUID drift", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const observed = events.find(
        ({ raw }) => raw.phase === "complete" && raw.kind === "bundle",
      );
      observed.raw.downloadGuid = "different-browser-download-guid";
    });
    await rejectFixture(fixture, /downloadGuid|download receipt|raw does not bind/iu);
  }));
  await t.test("missing browser download completion", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      events.splice(events.findIndex(
        ({ raw }) => raw.phase === "complete" && raw.kind === "bundle",
      ), 1);
    });
    await rejectFixture(fixture, /raw event ledger.*(?:sequence|download|exact ordered)/iu);
  }));
  await t.test("fake Page.javascriptDialogAccepted event", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const closed = events.find(({ raw }) => raw.method === "Page.javascriptDialogClosed");
      closed.raw.method = "Page.javascriptDialogAccepted";
    });
    await rejectFixture(fixture, /raw event ledger.*(?:dialog|raw does not bind)/iu);
  }));
  await t.test("synthetic summary cannot masquerade as raw payload", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      events.find(({ raw }) => raw.command === "select-camera").data = {
        cameraChanged: true,
        taskCountUnchanged: true,
      };
    });
    await rejectFixture(fixture, /raw event ledger.*(?:exact keys|unknown field|raw payload)/iu);
  }));
  await t.test("missing DOM screenshot geometry observation", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      events.splice(events.findIndex(
        ({ type, raw }) => type === "screenshot-geometry-observation"
          && raw.contextKind === "camera",
      ), 1);
    });
    await rejectFixture(fixture, /raw event ledger.*(?:geometry|exact ordered|sequence)/iu);
  }));
  await t.test("DOM boundingClientRect drift", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const geometry = events.find(
        ({ type, raw }) => type === "screenshot-geometry-observation"
          && raw.contextKind === "projection",
      );
      geometry.raw.boundingClientRect.width -= 1;
    });
    await rejectFixture(fixture, /raw event ledger.*(?:geometry|boundingClientRect|raw does not bind)/iu);
  }));
  await t.test("DOM runtime trace observation drift", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const geometry = events.find(
        ({ type, raw }) => type === "screenshot-geometry-observation"
          && raw.contextKind === "camera",
      );
      geometry.raw.runtimeTraceAudit.directionArrowCoordinatesFinite = false;
    });
    await rejectFixture(fixture, /raw event ledger.*(?:runtimeTraceAudit|raw does not bind)/iu);
  }));
  await t.test("phase checkpoint observation drift", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const checkpoint = events.find(
        ({ type, raw }) => type === "phase-checkpoint-observation"
          && raw.phase === "after-cameras",
      );
      checkpoint.raw.runtimeTraceAudit.workerRunCount = 2;
    });
    await rejectFixture(fixture, /raw event ledger.*(?:phase|runtimeTraceAudit|raw does not bind)/iu);
  }));
  await t.test("synthetic command cannot masquerade as DOM geometry", async () => withFixture(async (fixture) => {
    await mutateRawBrowserEventLedger(fixture, (events) => {
      const geometry = events.find(
        ({ type }) => type === "screenshot-geometry-observation",
      );
      geometry.source = "automation-command";
    });
    await rejectFixture(fixture, /raw event ledger.*(?:geometry|source|type\/order)/iu);
  }));
});

test("rejects missing, unaccepted, and miscounted privacy confirmation", async (t) => {
  await t.test("missing", async () => withFixture(async (fixture) => {
    delete fixture.manifest.downloads.privacyDialog;
    await persistManifest(fixture);
    await rejectFixture(fixture, /privacyDialog|exact keys/iu);
  }));
  await t.test("not accepted", async () => withFixture(async (fixture) => {
    fixture.manifest.downloads.privacyDialog.accepted = false;
    await persistManifest(fixture);
    await rejectFixture(fixture, /privacyDialog.*accepted|accepted.*true/iu);
  }));
  await t.test("wrong count", async () => withFixture(async (fixture) => {
    fixture.manifest.downloads.privacyDialog.dialogCount = 2;
    await persistManifest(fixture);
    await rejectFixture(fixture, /dialogCount|exactly one/iu);
  }));
});

test("rejects a missing participant opt-in download", async () => {
  await withFixture(async (fixture) => {
    fixture.manifest.downloads.items = fixture.manifest.downloads.items.filter(
      ({ kind }) => kind !== "participant",
    );
    await persistManifest(fixture);
    await rejectFixture(fixture, /downloads.*exact set|participant/iu);
  });
});

test("rejects an evidence archive basename masquerading as the browser suggested filename", async () => {
  await withFixture(async (fixture) => {
    fixture.manifest.downloads.items.find(({ kind }) => kind === "bundle").suggestedFilename = "aggregate.zip";
    await persistManifest(fixture);
    await rejectFixture(fixture, /suggestedFilename|link\.download|browser.*filename/iu);
  });
});

test("rejects browser download lifecycle and byte-binding drift", async (t) => {
  await t.test("foreign URL", async () => withFixture(async (fixture) => {
    fixture.manifest.downloads.items.find(({ kind }) => kind === "path").downloadUrl =
      "https://attacker.example/path.csv";
    await persistManifest(fixture);
    await rejectFixture(fixture, /downloadUrl|ena\.hk/iu);
  }));
  await t.test("received bytes", async () => withFixture(async (fixture) => {
    fixture.manifest.downloads.items.find(({ kind }) => kind === "path").receivedBytes += 1;
    await persistManifest(fixture);
    await rejectFixture(fixture, /receivedBytes|artifact byte length/iu);
  }));
  await t.test("unsafe GUID", async () => withFixture(async (fixture) => {
    fixture.manifest.downloads.items.find(({ kind }) => kind === "path").downloadGuid =
      "../not-a-guid";
    await persistManifest(fixture);
    await rejectFixture(fixture, /downloadGuid|bounded browser download GUID/iu);
  }));
});

test("rejects artifact byte/SHA and content-set hash tampering", async (t) => {
  await t.test("artifact bytes", async () => withFixture(async (fixture) => {
    const file = "downloads/path.csv";
    await writeFile(join(fixture.root, ...file.split("/")), Buffer.from("tampered\n", "utf8"));
    await rejectFixture(fixture, /artifact.*SHA-256|artifact.*bytes/iu);
  }));
  await t.test("content-set hash", async () => withFixture(async (fixture) => {
    fixture.manifest.contentSetHash = "f".repeat(64);
    await persistManifest(fixture);
    await rejectFixture(fixture, /contentSetHash/iu);
  }));
});

test("rejects declared but unreferenced artifacts", async () => {
  await withFixture(async (fixture) => {
    const extra = await writeArtifact(
      fixture.root,
      fixture.manifest.artifacts,
      "downloads/unreferenced.csv",
      Buffer.from("unused\n", "utf8"),
      "text/csv",
    );
    assert.equal(extra.file, "downloads/unreferenced.csv");
    fixture.manifest.artifacts.sort((left, right) => left.file.localeCompare(right.file));
    fixture.manifest.contentSetHash = hashCanonical(fixture.manifest.artifacts);
    await persistManifest(fixture);
    await rejectFixture(
      fixture,
      /exactly 29 declarations|unreferenced artifact/iu,
    );
  });
});

test("rejects an oversized compressed ZIP before allocating its file buffer", async () => {
  await withFixture(async (fixture) => {
    const aggregatePath = join(fixture.root, "downloads", "aggregate.zip");
    await truncate(aggregatePath, 64 * 1024 * 1024 + 1);
    await rejectFixture(
      fixture,
      /aggregate\.zip.*compressed.*size limit|ZIP.*too large.*before.*read|artifact.*size limit/iu,
    );
  });
});

test("rejects oversized manifest and regular artifact descriptors before allocation", async (t) => {
  await t.test("manifest", async () => {
    await withFixture(async (fixture) => {
      await truncate(join(fixture.root, MANIFEST_PATH), 64 * 1024 * 1024 + 1);
      await rejectFixture(
        fixture,
        /manifest.*size limit.*before buffer allocation|manifest.*too large/iu,
      );
    });
  });
  await t.test("regular artifact", async () => {
    await withFixture(async (fixture) => {
      await truncate(
        join(fixture.root, "screenshots", "desktop-page.png"),
        64 * 1024 * 1024 + 1,
      );
      await rejectFixture(
        fixture,
        /desktop-page\.png.*size limit.*before buffer allocation|artifact.*too large/iu,
      );
    });
  });
});

test("rejects ZIP bundles whose payload is not independently verifiable", async (t) => {
  await t.test("aggregate and participant cannot be the same empty ZIP", async () => {
    await withFixture(async (fixture) => {
      const emptyZip = Buffer.from("504b0506" + "00".repeat(18), "hex");
      await replaceArtifactBytes(fixture, "downloads/aggregate.zip", emptyZip);
      await replaceArtifactBytes(fixture, "downloads/participant.zip", emptyZip);
      await rejectFixture(fixture, /ZIP|archive|provenance-manifest|required member/iu);
    });
  });

  await t.test("tampered member payload fails CRC and member receipt validation", async () => {
    await withFixture(async (fixture) => {
      const bytes = Buffer.from(fixture.bundles.aggregate.bytes);
      const member = fixture.bundles.aggregate.files.get("analysis.json");
      const offset = bytes.indexOf(member);
      assert.ok(offset >= 0, "stored analysis member must be present in ZIP bytes");
      bytes[offset + Math.floor(member.length / 2)] ^= 0x01;
      await replaceArtifactBytes(fixture, "downloads/aggregate.zip", bytes);
      await rejectFixture(fixture, /CRC|analysis\.json.*SHA-256|member.*mismatch/iu);
    });
  });

  await t.test("participant ZIP must contain participant CSV", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: true,
        sharedMembers: fixture.bundles.sharedMembers,
        omitParticipantCsv: true,
      });
      await replaceBundleBytes(fixture, "participant", bundle);
      await rejectFixture(
        fixture,
        /participant.*trajectory-participants\.csv|participant CSV.*missing/iu,
      );
    });
  });

  await t.test("aggregate ZIP must not contain participant CSV", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        forceParticipantCsv: true,
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(
        fixture,
        /aggregate.*trajectory-participants\.csv|aggregate.*participant CSV/iu,
      );
    });
  });

  await t.test("standalone member bytes must equal aggregate ZIP members", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "downloads/path.csv",
        Buffer.from("group_key_v1,period_index,time_key_v1\nDRIFT,9,T9\n", "utf8"),
      );
      await rejectFixture(
        fixture,
        /standalone.*path|path.*aggregate|standaloneMembersMatchAggregate/iu,
      );
    });
  });

  await t.test("manifest member receipt cannot self-attest a false SHA", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.members.find(({ path }) => path === "analysis.json").sha256 =
            "0".repeat(64);
          manifest.contentSetHash = hashCanonical(manifest.members);
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(fixture, /analysis\.json.*SHA-256|member.*receipt/iu);
    });
  });

  await t.test("manifest contentSetHash must be independently recomputed", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.contentSetHash = "f".repeat(64);
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(fixture, /bundle.*contentSetHash|provenance.*contentSetHash/iu);
    });
  });

  await t.test("bundle resultHash cannot drift from browser analysis", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.resultHash = "e".repeat(64);
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(fixture, /bundle.*resultHash|result hash.*drift/iu);
    });
  });

  await t.test("bundle executionTarget must remain browser-worker", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.executionTarget = "node-service";
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(fixture, /executionTarget.*browser-worker|browser-worker.*bundle/iu);
    });
  });

  await t.test("bundle SDK version must match the vendored export", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.sdk.version = "0.2.0-implemented-unverified.999";
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(fixture, /sdk\.version|vendored.*version/iu);
    });
  });

  await t.test("bundle SDK build id must match the vendored export", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.sdk.buildId = "f".repeat(40);
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(fixture, /sdk\.buildId|vendored.*build/iu);
    });
  });

  await t.test("bundle jENA identity must match the vendored export", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.jena.version = "0.7.0-unreviewed";
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(fixture, /jena\.version|vendored.*jENA/iu);
    });
  });

  await t.test("bundle jENA commit must match the vendored export", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.jena.commit = "f".repeat(40);
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(fixture, /jena\.commit|vendored.*jENA/iu);
    });
  });

  await t.test("bundle jENA integrity must match the vendored export", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.jena.tarballIntegrity = "sha512-ZHJpZnQ=";
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(fixture, /jena\.tarballIntegrity|vendored.*jENA/iu);
    });
  });

  await t.test("bundle jenaBuildId must match the vendored export", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.jenaBuildId = "jena-js@drift";
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(fixture, /jenaBuildId|vendored.*build/iu);
    });
  });

  await t.test("bundle evidence status cannot self-promote", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.evidenceStatus = "PRODUCTION_READY";
        },
      });
      await replaceBundleBytes(fixture, "aggregate", bundle);
      await rejectFixture(
        fixture,
        /evidenceStatus.*IMPLEMENTED_UNVERIFIED|self-promot|unapproved.*authority/iu,
      );
    });
  });
});

test("rejects participant-level content hidden in aggregate analysis or CSV", async (t) => {
  for (const alias of ["subjectId", "entityId", "rawHistory", "historyRows"]) {
    await t.test("V12 allowlist rejects alias " + alias, async () => {
      await withFixture(async (fixture) => {
        const analysis = JSON.parse(
          fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
        );
        analysis.diagnostics.push({
          code: "PRIVATE_ALIAS",
          severity: "info",
          message: "must not be exported",
          [alias]: alias.endsWith("Rows") ? [{ id: "P1" }] : "P1",
        });
        await replaceSharedLongitudinalMember(
          fixture,
          "analysis.json",
          jsonMember(analysis),
        );
        await rejectFixture(fixture, new RegExp(alias + "|unknown V12 field", "iu"));
      });
    });
  }

  await t.test("participantCanonical key", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.diagnostics.push({
        code: "PRIVATE_ALIAS",
        severity: "info",
        message: "must not be exported",
        participantCanonical: "P1",
      });
      await replaceSharedLongitudinalMember(
        fixture,
        "analysis.json",
        jsonMember(analysis),
      );
      await rejectFixture(fixture, /participantCanonical|participant-level.*analysis/iu);
    });
  });

  await t.test("non-empty participantPeriods rows", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.paths[0].dynamics.participantPeriods.push(generateFromSchema(
        V12_MAIN_SCHEMA.properties.paths.items.properties.dynamics
          .properties.participantPeriods.items,
      ));
      await replaceSharedLongitudinalMember(
        fixture,
        "analysis.json",
        jsonMember(analysis),
      );
      await rejectFixture(fixture, /participantPeriods.*empty|participant-level.*row/iu);
    });
  });

  await t.test("participantPeriods redaction field must not be omitted", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      delete analysis.paths[0].dynamics.participantPeriods;
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(
        fixture,
        /participantPeriods.*(?:array|missing)|missing.*participantPeriods/iu,
      );
    });
  });

  await t.test("participantRows key", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.diagnostics.push({
        code: "PRIVATE_ALIAS",
        severity: "info",
        message: "must not be exported",
        participantRows: [{ participant: "P1" }],
      });
      await replaceSharedLongitudinalMember(
        fixture,
        "analysis.json",
        jsonMember(analysis),
      );
      await rejectFixture(fixture, /participantRows|participant-level.*analysis/iu);
    });
  });

  await t.test("analysis execution envelope rejects missing fields", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      delete analysis.execution.sdkVersion;
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(fixture, /analysis\.execution.*missing|sdkVersion/iu);
    });
  });

  await t.test("analysis execution envelope rejects extra fields", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.execution.claimedProductionReady = true;
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(fixture, /analysis\.execution.*unknown|claimedProductionReady/iu);
    });
  });

  await t.test("analysis execution must match provenance seed", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.execution.seed += 1;
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(fixture, /execution\.seed.*provenance|seed.*match/iu);
    });
  });

  await t.test("analysis execution plan hashes must match provenance", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.execution.permutationPlanHashes.push("f".repeat(64));
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(fixture, /permutationPlanHashes.*provenance|must match provenance/iu);
    });
  });

  await t.test("analysis execution SDK identity must match the vendored build", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.execution.sdkVersion = "0.2.0-implemented-unverified.999";
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(fixture, /execution\.sdkVersion|vendored.*SDK/iu);
    });
  });

  await t.test("bootstrap payload is forbidden when task count is zero", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      const entry = generateFromSchema(V12_MAIN_SCHEMA.properties.bootstrap.items);
      entry.result.base.participantPeriods = [];
      analysis.bootstrap.push(entry);
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(fixture, /analysis\.bootstrap.*empty|bootstrapTasks.*zero/iu);
    });
  });

  await t.test("network overlay payload is forbidden when task count is zero", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.networkOverlays.push(generateFromSchema(
        V12_MAIN_SCHEMA.properties.networkOverlays.items,
      ));
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(fixture, /networkOverlays.*empty|networkOverlayTasks.*zero/iu);
    });
  });

  const csvCases = [
    ["trajectory-path.csv", "participant_key_v1", /trajectory-path\.csv.*(?:header|column count)/iu],
    ["trajectory-metadata.csv", "participant_key_v1", /trajectory-metadata\.csv.*(?:header|column count)/iu],
    ["trajectory-inference.csv", "participant_key_v1", /trajectory-inference\.csv.*header/iu],
  ];
  for (const [memberPath, injectedColumn, expectedError] of csvCases) {
    await t.test(memberPath + " frozen header", async () => {
      await withFixture(async (fixture) => {
        const original = fixture.bundles.sharedMembers.get(memberPath).toString("utf8");
        const drifted = Buffer.from(
          original.replace("\r\n", "," + injectedColumn + "\r\n"),
          "utf8",
        );
        await replaceSharedLongitudinalMember(fixture, memberPath, drifted);
        await rejectFixture(fixture, expectedError);
      });
    });
  }

  await t.test("trajectory path body cannot substitute a participant label", async () => {
    await withFixture(async (fixture) => {
      const original = fixture.bundles.sharedMembers
        .get("trajectory-path.csv").toString("utf8");
      assert.match(original, /Group 1/u);
      await replaceSharedLongitudinalMember(
        fixture,
        "trajectory-path.csv",
        Buffer.from(original.replace("Group 1", "SUBJECT-P1-PRIVATE"), "utf8"),
      );
      await rejectFixture(fixture, /trajectory-path\.csv.*row|group_display|analysis.*path/iu);
    });
  });

  await t.test("trajectory metadata body cannot replace request binding", async () => {
    await withFixture(async (fixture) => {
      const original = fixture.bundles.sharedMembers
        .get("trajectory-metadata.csv").toString("utf8");
      assert.match(original, new RegExp(REQUEST_HASH, "u"));
      await replaceSharedLongitudinalMember(
        fixture,
        "trajectory-metadata.csv",
        Buffer.from(original.replace(REQUEST_HASH, "participant-private-history"), "utf8"),
      );
      await rejectFixture(
        fixture,
        /trajectory-metadata\.csv.*(?:request_hash|row 12)|requestHash|binding/iu,
      );
    });
  });

  await t.test("trajectory inference audit_json cannot add an unbound participant row", async () => {
    await withFixture(async (fixture) => {
      const columns = [
        "request_kind", "status", "reason", "family_id", "family_size",
        "member_id", "test", "design", "estimand", "n", "effect",
        "statistic", "p_raw", "p_holm", "audit_json",
      ];
      const body = csvDocument(columns, [[
        "path-comparison", "available", "", "family", 1, "member", "permutation",
        "independent", "equal-participant", "", 0, 0, 1, 1,
        JSON.stringify({ subjectId: "P1", historyRows: [{ value: "private" }] }),
      ]]);
      await replaceSharedLongitudinalMember(
        fixture,
        "trajectory-inference.csv",
        body,
      );
      await rejectFixture(fixture, /trajectory-inference\.csv.*row|audit_json|inference.*mismatch/iu);
    });
  });
});

test("binds the exact V12 identity and request hash across provenance and CSV", async (t) => {
  await t.test("identity extra key", async () => withFixture(async (fixture) => {
    const analysis = JSON.parse(
      fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
    );
    analysis.identity.subjectId = "P1";
    await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
    await rejectFixture(fixture, /identity.*(?:subjectId|unknown V12 field|exact)/iu);
  }));
  for (const field of [
    "datasetHash",
    "specHash",
    "sourceResultHash",
    "resultHash",
    "runId",
    "jenaBuildId",
  ]) {
    await t.test("analysis identity " + field + " provenance binding", async () => {
      await withFixture(async (fixture) => {
        const analysis = JSON.parse(
          fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
        );
        analysis.identity[field] = field.endsWith("Hash")
          ? "e".repeat(64)
          : "identity-drift";
        if (field === "sourceResultHash") {
          analysis.runSpec.sourceResultHash = analysis.identity.sourceResultHash;
        }
        await replaceSharedLongitudinalMember(
          fixture,
          "analysis.json",
          jsonMember(analysis),
        );
        await rejectFixture(
          fixture,
          new RegExp("identity\\." + field + ".*(?:provenance|match)|" + field, "iu"),
        );
      });
    });
  }
  await t.test("aggregate and participant provenance identity must agree", async () => {
    await withFixture(async (fixture) => {
      const participant = createLongitudinalZipBundle({
        participantLevelIncluded: true,
        sharedMembers: fixture.bundles.sharedMembers,
        manifestTransform(manifest) {
          manifest.datasetHash = "e".repeat(64);
        },
      });
      await replaceBundleBytes(fixture, "participant", participant);
      await rejectFixture(fixture, /participant.*identity\.datasetHash|datasetHash.*provenance/iu);
    });
  });
  await t.test("requestHash must be a lowercase SHA-256", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.identity.requestHash = "not-a-request-hash";
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(fixture, /requestHash.*(?:pattern|hex|V12)/iu);
    });
  });
  await t.test("requestHash must match metadata binding", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.identity.requestHash = "e".repeat(64);
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(fixture, /metadata.*(?:request_hash|row 12)|requestHash.*binding/iu);
    });
  });
  await t.test("runSpec sourceResultHash must match identity", async () => {
    await withFixture(async (fixture) => {
      const analysis = JSON.parse(
        fixture.bundles.sharedMembers.get("analysis.json").toString("utf8"),
      );
      analysis.runSpec.sourceResultHash = "e".repeat(64);
      await replaceSharedLongitudinalMember(fixture, "analysis.json", jsonMember(analysis));
      await rejectFixture(fixture, /runSpec\.sourceResultHash.*identity|sourceResultHash.*match/iu);
    });
  });
});

test("rejects unsafe or unsupported ZIP central-directory contracts", async (t) => {
  await t.test("duplicate archive path", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        extraEntries: [{
          path: "analysis.json",
          bytes: fixture.bundles.aggregate.files.get("analysis.json"),
          method: 0,
        }],
      });
      await replaceArtifactBytes(fixture, "downloads/aggregate.zip", bundle.bytes);
      await rejectFixture(fixture, /ZIP.*duplicate|duplicate.*analysis\.json/iu);
    });
  });

  await t.test("archive path traversal", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        extraEntries: [{
          path: "../escape.csv",
          bytes: Buffer.from("escape\n", "utf8"),
          method: 0,
        }],
      });
      await replaceArtifactBytes(fixture, "downloads/aggregate.zip", bundle.bytes);
      await rejectFixture(fixture, /ZIP.*unsafe|archive.*path|\.\./iu);
    });
  });

  await t.test("encrypted member flag", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        entryTransform(entry, index) {
          return index === 0 ? { ...entry, flags: 1 } : entry;
        },
      });
      await replaceArtifactBytes(fixture, "downloads/aggregate.zip", bundle.bytes);
      await rejectFixture(fixture, /ZIP.*encrypted|encryption.*unsupported/iu);
    });
  });

  await t.test("unsupported compression method", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        entryTransform(entry, index) {
          return index === 0 ? { ...entry, method: 99 } : entry;
        },
      });
      await replaceArtifactBytes(fixture, "downloads/aggregate.zip", bundle.bytes);
      await rejectFixture(fixture, /ZIP.*compression|unsupported.*method 99/iu);
    });
  });

  await t.test("ZIP64 sentinel", async () => {
    await withFixture(async (fixture) => {
      const bytes = Buffer.from(fixture.bundles.aggregate.bytes);
      const eocd = bytes.length - 22;
      assert.equal(bytes.readUInt32LE(eocd), 0x06054b50);
      bytes.writeUInt16LE(0xffff, eocd + 8);
      bytes.writeUInt16LE(0xffff, eocd + 10);
      await replaceArtifactBytes(fixture, "downloads/aggregate.zip", bytes);
      await rejectFixture(fixture, /ZIP64|ZIP.*entry count/iu);
    });
  });

  await t.test("deflate stream cannot hide trailing bytes", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        entryTransform(entry) {
          return entry.method === 8
            ? { ...entry, compressedSuffix: Buffer.from("hidden-private-bytes", "utf8") }
            : entry;
        },
      });
      await replaceArtifactBytes(fixture, "downloads/aggregate.zip", bundle.bytes);
      await rejectFixture(fixture, /deflate.*trailing|compressed.*consum|ZIP.*hidden/iu);
    });
  });

  await t.test("local member ranges cannot contain unowned gaps", async () => {
    await withFixture(async (fixture) => {
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        entryTransform(entry, index) {
          return index === 0
            ? { ...entry, gapAfter: Buffer.from("hidden-private-bytes", "utf8") }
            : entry;
        },
      });
      await replaceArtifactBytes(fixture, "downloads/aggregate.zip", bundle.bytes);
      await rejectFixture(fixture, /ZIP.*contiguous|ZIP.*gap|unowned.*bytes/iu);
    });
  });

  await t.test("entry extras cannot carry unowned bytes", async () => {
    await withFixture(async (fixture) => {
      const extra = Buffer.from("feca0600736563726574", "hex");
      const bundle = createLongitudinalZipBundle({
        participantLevelIncluded: false,
        sharedMembers: fixture.bundles.sharedMembers,
        entryTransform(entry, index) {
          return index === 0
            ? { ...entry, localExtra: extra, centralExtra: extra }
            : entry;
        },
      });
      await replaceArtifactBytes(fixture, "downloads/aggregate.zip", bundle.bytes);
      await rejectFixture(fixture, /ZIP.*extra.*unsupported|ZIP.*extra.*empty/iu);
    });
  });

  await t.test("EOCD comments cannot carry unowned bytes", async () => {
    await withFixture(async (fixture) => {
      const bytes = Buffer.from(fixture.bundles.aggregate.bytes);
      const eocd = bytes.length - 22;
      const comment = Buffer.from("hidden-private-bytes", "utf8");
      bytes.writeUInt16LE(comment.length, eocd + 20);
      await replaceArtifactBytes(
        fixture,
        "downloads/aggregate.zip",
        Buffer.concat([bytes, comment]),
      );
      await rejectFixture(fixture, /ZIP.*comment.*unsupported|ZIP.*comment.*empty/iu);
    });
  });
});

test("rejects participant CSV drift and derives aggregate counts from participant histories", async (t) => {
  await t.test("participant CSV invalid UTF-8 byte", async () => {
    await withFixture(async (fixture) => {
      await replaceParticipantCsv(fixture, Buffer.from([0xff]));
      await rejectFixture(fixture, /participant.*UTF-8|trajectory-participants.*UTF-8/iu);
    });
  });

  await t.test("participant CSV frozen RFC4180 header", async () => {
    await withFixture(async (fixture) => {
      const original = fixture.bundles.participant.files
        .get("trajectory-participants.csv").toString("utf8");
      await replaceParticipantCsv(
        fixture,
        Buffer.from(original.replace("participant_key_v1", "subject_key_v1"), "utf8"),
      );
      await rejectFixture(fixture, /trajectory-participants.*header|participant CSV.*header/iu);
    });
  });

  await t.test("participant display must preserve spreadsheet formula neutralization", async () => {
    await withFixture(async (fixture) => {
      const rows = participantFixtureRows();
      rows[0].participant.display = "=WEBSERVICE(\"https://private.invalid\")";
      await replaceParticipantCsv(fixture, participantCsvFixture(rows));
      await rejectFixture(fixture, /participant.*formula|spreadsheet.*neutral|participant_display/iu);
    });
  });

  await t.test("participant identity must be a canonical typed tuple", async () => {
    await withFixture(async (fixture) => {
      const rows = participantFixtureRows();
      rows[0].participant.canonical = "P1";
      await replaceParticipantCsv(fixture, participantCsvFixture(rows));
      await rejectFixture(fixture, /participant_key_v1.*typed|typed.*participant|canonical.*tuple/iu);
    });
  });

  await t.test("selected coordinates must equal the selected slice of full coordinates", async () => {
    await withFixture(async (fixture) => {
      const rows = participantFixtureRows();
      rows[0].selectedCoordinates[0] += 100;
      await replaceParticipantCsv(fixture, participantCsvFixture(rows));
      await rejectFixture(fixture, /selected.*full.*coordinate|participant.*coordinate.*binding/iu);
    });
  });

  await t.test("participant weights must be finite and strictly positive", async () => {
    await withFixture(async (fixture) => {
      const rows = participantFixtureRows();
      rows[0].participantWeight = 0;
      await replaceParticipantCsv(fixture, participantCsvFixture(rows));
      await rejectFixture(fixture, /participant_weight|participant.*weight.*positive/iu);
    });
  });

  await t.test("participant group/time identities must bind aggregate paths", async () => {
    await withFixture(async (fixture) => {
      const rows = participantFixtureRows();
      rows[0].group = typedIdentity("group", "PRIVATE", "Private", "string");
      await replaceParticipantCsv(fixture, participantCsvFixture(rows));
      await rejectFixture(fixture, /participant.*group.*aggregate|unknown.*group_key_v1/iu);
    });
  });

  await t.test("complete count cannot self-attest 999999", async () => {
    await withFixture(async (fixture) => {
      const analysis = fixture.bundles.sharedMembers.analysis;
      const rows = trajectoryPathRows(analysis, participantFixtureRows());
      rows[0][9] = 999999;
      await replaceSharedLongitudinalMember(
        fixture,
        "trajectory-path.csv",
        csvDocument(trajectoryPathColumns(), rows),
      );
      await synchronizeRawDownloadReceipts(
        fixture,
        ["downloads/aggregate.zip", "downloads/participant.zip", "downloads/path.csv"],
      );
      await rejectFixture(fixture, /complete.*participant histor|complete.*derived|complete.*999999/iu);
    });
  });

  await t.test("contributor overlap must be derived from adjacent histories", async () => {
    await withFixture(async (fixture) => {
      const analysis = fixture.bundles.sharedMembers.analysis;
      const rows = trajectoryPathRows(analysis, participantFixtureRows());
      rows[1][13] = 999999;
      await replaceSharedLongitudinalMember(
        fixture,
        "trajectory-path.csv",
        csvDocument(trajectoryPathColumns(), rows),
      );
      await synchronizeRawDownloadReceipts(
        fixture,
        ["downloads/aggregate.zip", "downloads/participant.zip", "downloads/path.csv"],
      );
      await rejectFixture(fixture, /overlap.*participant histor|overlap.*derived|overlap.*999999/iu);
    });
  });

  await t.test("available cohort includes every available analytical participant-period", async () => {
    const rows = participantFixtureRows();
    rows.find((row) => row.participant.display === "P5").includedInCohort = false;
    await withFixtureOptions({ participantRows: rows }, async (fixture) => {
      await rejectFixture(
        fixture,
        /available cohort.*included|cohortPolicy.*available|available analytical/iu,
      );
    });
  });

  await t.test("equal-participant estimand requires unit participant weights", async () => {
    const rows = participantFixtureRows();
    rows.find((row) => row.participant.display === "P2").participantWeight = 2;
    await withFixtureOptions({ participantRows: rows }, async (fixture) => {
      await rejectFixture(
        fixture,
        /equal-participant.*weight|participant weight.*unit|estimand/iu,
      );
    });
  });

  await t.test("complete cohort inclusion is derived from complete participant histories", async () => {
    const rows = participantFixtureRows();
    for (const row of rows) {
      const observedPeriods = new Set(rows.filter((candidate) => (
        candidate.group.canonical === row.group.canonical
        && candidate.participant.canonical === row.participant.canonical
      )).map((candidate) => candidate.time.canonical));
      row.includedInCohort = observedPeriods.size === 4;
    }
    await withFixtureOptions(
      { participantRows: rows, cohortPolicy: "complete" },
      async (fixture) => {
        const result = runVerifier(fixture);
        assert.equal(result.status, 0, result.stderr);
      },
    );
  });

  await t.test("weighted-participant estimand accepts bound positive weights", async () => {
    const rows = participantFixtureRows();
    rows.find((row) => row.participant.display === "P2").participantWeight = 2;
    await withFixtureOptions(
      {
        participantRows: rows,
        estimand: { kind: "weighted-participant", metadataField: "weight" },
      },
      async (fixture) => {
        const result = runVerifier(fixture);
        assert.equal(result.status, 0, result.stderr);
      },
    );
  });
});

test("rejects aggregate Plotly aliases, privacy fields, and trace-contract drift", async (t) => {
  await t.test("participant role alias cannot masquerade as aggregate-safe", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.push({
        type: "scatter3d",
        mode: "markers",
        customdata: [["PRIVATE-P1"]],
        meta: { role: "participants", resultHash: RESULT_HASH },
      });
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /Plotly.*role|participants.*alias|aggregate.*privacy/iu);
    });
  });

  await t.test("aggregate trajectory cannot carry participant customdata", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.find(({ meta }) => meta.role === "trajectory-path").customdata = [
        ["PRIVATE-P1"],
      ];
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /trajectory-path.*customdata|aggregate.*customdata|Plotly.*allowlist/iu);
    });
  });

  await t.test("centroid marker is an exact square of size seven", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.find(({ meta }) => meta.role === "centroid").marker.size = 70;
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /centroid.*(?:size|seven|7)|Plotly.*centroid/iu);
    });
  });

  await t.test("trajectory trace is a black line-only aggregate trace", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      const trajectory = plotly.data.find(({ meta }) => meta.role === "trajectory-path");
      trajectory.mode = "lines+markers";
      trajectory.line.color = "#ff00ff";
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /trajectory-path.*(?:black|line-only|mode|color)/iu);
    });
  });

  await t.test("direction arrow tip must be at the adjacent-period midpoint", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.find(({ meta }) => meta.role === "direction-arrow").x[0] += 1;
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /direction-arrow.*midpoint|arrow.*geometry/iu);
    });
  });

  await t.test("network-node coordinates and labels bind aggregate code geometry", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.find(({ meta }) => meta.role === "network-node").text[0] = "PRIVATE-P1";
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /network-node.*codeGeometry|code geometry.*Plotly|network-node.*label/iu);
    });
  });

  await t.test("manifest traceCount binds exact aggregate Plotly trace count", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.push(structuredClone(
        plotly.data.find(({ meta }) => meta.role === "axis-shaft"),
      ));
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /traceCount.*Plotly|Plotly.*trace count/iu);
    });
  });

  await t.test("Plotly dimensions and scientific result binding are exact", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.layout.scene.xaxis.title = "participantId";
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /Plotly.*dimension|xaxis.*SVD1|dimension.*binding/iu);
    });
  });

  await t.test("aggregate traces cannot smuggle confidence intervals", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.find(({ meta }) => meta.role === "centroid").error_x = {
        array: [1, 1, 1],
        visible: true,
      };
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /confidence interval|error_x|Plotly.*allowlist/iu);
    });
  });
});

test("binds every allowed Plotly leaf and participant trace to public source data", async (t) => {
  await t.test("aggregate trace name cannot carry a participant identifier", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.find(({ meta }) => meta.role === "trajectory-path").name =
        "participant=P1 raw trajectory";
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /trajectory-path.*name.*group|Plotly.*public.*name/iu);
    });
  });

  await t.test("allowed marker color cannot carry a raw participant string", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.find(({ meta }) => meta.role === "centroid").marker.color =
        "participantCanonical=P1";
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /centroid.*marker\.color|Plotly.*public.*color/iu);
    });
  });

  await t.test("layout uirevision cannot carry a participant payload", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.layout.uirevision = "rawHistory:P1";
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /layout.*uirevision|Plotly.*layout.*public/iu);
    });
  });

  await t.test("config filename cannot carry a participant payload", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.aggregate.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.config.toImageButtonOptions.filename = "raw-participant-P1";
      await replaceAggregatePlotly(fixture, plotly);
      await rejectFixture(fixture, /config.*filename|Plotly.*filename.*public/iu);
    });
  });

  await t.test("participant trace coordinates bind canonical participant histories", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.participant.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.find(({ meta }) => meta.role === "participant").x[0] += 99;
      await replaceParticipantPlotly(fixture, plotly);
      await rejectFixture(fixture, /participant trace.*(?:coordinates|history)|participant Plotly.*cross-binding/iu);
    });
  });

  await t.test("individual path order binds canonical participant histories", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.participant.files.get("plotly-spec.json").toString("utf8"),
      );
      plotly.data.find(({ meta }) => meta.role === "individual-path").x.reverse();
      await replaceParticipantPlotly(fixture, plotly);
      await rejectFixture(fixture, /individual-path.*(?:coordinates|order|history)/iu);
    });
  });

  await t.test("individual path trace count binds canonical participant histories", async () => {
    await withFixture(async (fixture) => {
      const plotly = JSON.parse(
        fixture.bundles.participant.files.get("plotly-spec.json").toString("utf8"),
      );
      const index = plotly.data.findIndex(({ meta }) => meta.role === "individual-path");
      plotly.data.splice(index, 1);
      await replaceParticipantPlotly(fixture, plotly);
      await rejectFixture(fixture, /individual-path.*(?:count|participant histor)/iu);
    });
  });
});

test("rejects artifact aggregate budgets and screenshot evidence without visual substance", async (t) => {
  await t.test("artifact declaration count is rejected before declaration materialization", async () => {
    await withFixture(async (fixture) => {
      fixture.manifest.artifacts.push({
        file: "unreferenced/tiny.json",
        bytes: 1,
        sha256: sha256(Buffer.from("x")),
        mediaType: "application/json",
      });
      fixture.manifest.artifacts.sort((left, right) => left.file.localeCompare(right.file));
      fixture.manifest.contentSetHash = hashCanonical(fixture.manifest.artifacts);
      await persistManifest(fixture);
      const result = runVerifier(fixture);
      assert.notEqual(result.status, 0, "extra artifact declaration was accepted");
      assert.match(
        result.stderr,
        /manifest\.artifacts must contain exactly 29 declarations before/iu,
      );
      await assert.rejects(readFile(fixture.receiptPath), { code: "ENOENT" });
    });
  });

  await t.test("declared aggregate artifact bytes exceed the run budget before loading", async () => {
    await withFixture(async (fixture) => {
      for (const artifact of fixture.manifest.artifacts) {
        const replacement = { ...artifact, bytes: 6 * 1024 * 1024 };
        updateArtifactReferences(fixture.manifest, artifact.file, replacement);
      }
      fixture.manifest.contentSetHash = hashCanonical(fixture.manifest.artifacts);
      await persistManifest(fixture);
      await rejectFixture(fixture, /total artifact bytes.*budget|aggregate artifact.*limit/iu);
    });
  });

  await t.test("all camera and projection screenshots cannot be one-pixel blanks", async () => {
    await withFixture(async (fixture) => {
      const entries = [
        ...fixture.manifest.cameras,
        ...fixture.manifest.projections,
      ];
      for (const entry of entries) {
        const file = entry.screenshot.artifact.file;
        await replaceArtifactBytes(fixture, file, nativePng(1, 1, 0));
        entry.screenshot.capture.requestedViewport = { width: 1, height: 1 };
        entry.screenshot.capture.observedViewport = {
          width: 1,
          height: 1,
          devicePixelRatio: 1,
        };
        entry.screenshot.capture.rawPngRaster = { width: 1, height: 1 };
        entry.screenshot.capture.elementRect = { x: 0, y: 0, width: 1, height: 1 };
      }
      await persistManifest(fixture);
      await rejectFixture(fixture, /screenshot.*minimum|1x1|visual.*blank|viewport ratio/iu);
    });
  });

  await t.test("camera presets require visually distinct native PNG hashes", async () => {
    await withFixture(async (fixture) => {
      const duplicate = nativePng(800, 600, 77);
      for (const camera of fixture.manifest.cameras) {
        await replaceArtifactBytes(fixture, camera.screenshot.artifact.file, duplicate);
      }
      await rejectFixture(fixture, /camera.*visual.*(?:distinct|hash)|camera.*PNG.*duplicate/iu);
    });
  });

  await t.test("aggregate PNG raster allocation exceeds the decoded pixel budget", async () => {
    await withFixture(async (fixture) => {
      const oversized = nativePng(3000, 3000, 88);
      for (const camera of fixture.manifest.cameras) {
        await replaceArtifactBytes(fixture, camera.screenshot.artifact.file, oversized);
        camera.screenshot.capture.requestedViewport = { width: 3000, height: 3000 };
        camera.screenshot.capture.observedViewport = {
          width: 3000,
          height: 3000,
          devicePixelRatio: 1,
        };
        camera.screenshot.capture.rawPngRaster = { width: 3000, height: 3000 };
        camera.screenshot.capture.elementRect = {
          x: 0,
          y: 0,
          width: 3000,
          height: 3000,
        };
      }
      await persistManifest(fixture);
      await rejectFixture(fixture, /total PNG.*(?:pixel|decoded).*budget|aggregate PNG.*limit/iu);
    });
  });

  await t.test("16-bit PNG scanlines count their full decoded aggregate memory", async () => {
    await withFixture(async (fixture) => {
      const oversized = solidRgba16Png(2000, 2000);
      for (const camera of fixture.manifest.cameras) {
        await replaceArtifactBytes(fixture, camera.screenshot.artifact.file, oversized);
        camera.screenshot.capture.requestedViewport = { width: 2000, height: 2000 };
        camera.screenshot.capture.observedViewport = {
          width: 2000,
          height: 2000,
          devicePixelRatio: 1,
        };
        camera.screenshot.capture.rawPngRaster = { width: 2000, height: 2000 };
        camera.screenshot.capture.elementRect = {
          x: 0,
          y: 0,
          width: 2000,
          height: 2000,
        };
      }
      await persistManifest(fixture);
      await rejectFixture(
        fixture,
        /total PNG.*decoded-byte budget exceeded before PNG decode/iu,
      );
    });
  });

  await t.test("full-size opaque solid-color screenshot is not visual evidence", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/camera-isometric.png",
        solidPng(800, 600, [17, 34, 51, 255]),
      );
      await rejectFixture(fixture, /PNG.*(?:solid|variance|visual evidence)/iu);
    });
  });

  await t.test("a grayscale grid cannot masquerade as visible trajectory geometry", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/camera-isometric.png",
        rgbaPng(800, 600, [248, 248, 248, 255], [176, 176, 176, 255]),
      );
      await rejectFixture(fixture, /camera.*(?:chromatic|colored|trajectory geometry)/iu);
    });
  });

  await t.test("a grayscale projection cannot masquerade as visible trajectory geometry", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/projection-xy.png",
        rgbaPng(800, 600, [248, 248, 248, 255], [176, 176, 176, 255]),
      );
      await rejectFixture(fixture, /projection.*(?:chromatic|colored|trajectory geometry)/iu);
    });
  });

  await t.test("saturated color blocks cannot masquerade as rendered trajectory lines", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/camera-isometric.png",
        rgbaPng(800, 600, [210, 30, 60, 255], [30, 90, 220, 255]),
      );
      await rejectFixture(fixture, /camera.*(?:plot ROI|trajectory line|geometry density)/iu);
    });
  });

  await t.test("a compact saturated rectangle inside the plot ROI is not trajectory geometry", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/camera-isometric.png",
        colorBlockPng(800, 600, {
          x: 120,
          y: 120,
          width: 80,
          height: 60,
          color: [210, 30, 60, 255],
        }),
      );
      await rejectFixture(fixture, /camera.*(?:line-like|boundary|filled rectangle|trajectory geometry)/iu);
    });
  });

  await t.test("distributed legend-like color swatches are not trajectory geometry", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/camera-isometric.png",
        colorBlockPng(800, 600, [
          { x: 100, y: 100, width: 20, height: 12, color: [210, 30, 60, 255] },
          { x: 180, y: 125, width: 20, height: 12, color: [30, 90, 220, 255] },
          { x: 260, y: 150, width: 20, height: 12, color: [20, 150, 80, 255] },
          { x: 340, y: 175, width: 20, height: 12, color: [114, 51, 234, 255] },
        ]),
      );
      await rejectFixture(fixture, /camera.*(?:line-like|distributed|swatch|trajectory geometry)/iu);
    });
  });

  await t.test("colored axes and centroids without a black path or arrow are not trajectory evidence", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/camera-isometric.png",
        nativePng(800, 600, 91, 0, false),
      );
      await rejectFixture(fixture, /camera.*(?:black|dark|path|arrow|trajectory geometry)/iu);
    });
  });

  await t.test("a deep red path cannot masquerade as a neutral black trajectory", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/camera-isometric.png",
        nativePng(800, 600, 92, 0, true, [64, 0, 0, 255]),
      );
      await rejectFixture(fixture, /camera.*(?:neutral|black|dark|path|trajectory geometry)/iu);
    });
  });

  await t.test("a grayscale desktop plot cannot masquerade as visible trajectory geometry", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/desktop-plot.png",
        rgbaPng(1000, 620, [248, 248, 248, 255], [176, 176, 176, 255]),
      );
      await rejectFixture(fixture, /desktop.*plot.*(?:chromatic|colored|trajectory geometry)/iu);
    });
  });

  await t.test("a grayscale fullscreen capture cannot masquerade as visible trajectory geometry", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/fullscreen.png",
        rgbaPng(1440, 1000, [248, 248, 248, 255], [176, 176, 176, 255]),
      );
      await rejectFixture(fixture, /fullscreen.*(?:chromatic|colored|trajectory geometry)/iu);
    });
  });

  await t.test("fully transparent screenshot cannot hide nonzero RGB bytes", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/camera-isometric.png",
        rgbaPng(800, 600, [12, 34, 56, 0], [210, 180, 140, 0]),
      );
      await rejectFixture(fixture, /PNG.*(?:transparent|visible pixel|alpha)/iu);
    });
  });

  await t.test("one visible pixel is below the minimum visual evidence threshold", async () => {
    await withFixture(async (fixture) => {
      await replaceArtifactBytes(
        fixture,
        "screenshots/camera-isometric.png",
        sparseVisiblePng(800, 600),
      );
      await rejectFixture(fixture, /PNG.*minimum visible pixel|visual evidence.*pixel/iu);
    });
  });

  await t.test("visual hash compares decoded pixels rather than PNG encoding bytes", async () => {
    await withFixture(async (fixture) => {
      const none = nativePng(800, 600, 200, 0);
      const sub = nativePng(800, 600, 200, 1);
      assert.notEqual(sha256(none), sha256(sub), "fixture encodings must differ");
      await replaceArtifactBytes(fixture, "screenshots/camera-xy.png", none);
      await replaceArtifactBytes(fixture, "screenshots/camera-xz.png", sub);
      await rejectFixture(fixture, /camera.*decoded.*visual hash|camera.*same.*pixel/iu);
    });
  });
});

test("rejects symlinked root ancestors and non-exclusive inode custody", async (t) => {
  await t.test("symlinked root ancestor", async () => {
    await withFixture(async (fixture) => {
      const aliasContainer = await realpath(
        await mkdtemp(join(projectRoot, ".tmp-open-ena-root-alias-")),
      );
      try {
        const linkedParent = join(aliasContainer, "linked-parent");
        await symlink(dirname(fixture.root), linkedParent);
        const aliasedRoot = join(linkedParent, basename(fixture.root));
        const result = runVerifierAtRoot(fixture, aliasedRoot);
        await rejectFixture(fixture, /evidence root.*symlink|ancestor.*symlink/iu, {
          result,
        });
      } finally {
        await rm(aliasContainer, { recursive: true, force: true });
      }
    });
  });

  await t.test("artifact with an external hard-link alias", async () => {
    await withFixture(async (fixture) => {
      const file = "screenshots/desktop-page.png";
      const absolute = join(fixture.root, ...file.split("/"));
      await link(absolute, absolute + ".external-alias");
      await rejectFixture(fixture, /hard link|nlink|exclusive inode custody/iu);
    });
  });

  await t.test("two declared artifacts share one inode", async () => {
    await withFixture(async (fixture) => {
      const source = join(fixture.root, "screenshots", "camera-xy.png");
      const duplicate = join(fixture.root, "screenshots", "projection-xy.png");
      await rm(duplicate);
      await link(source, duplicate);
      await rejectFixture(fixture, /duplicate inode|hard link|inode custody/iu);
    });
  });
});

test("rejects a same-length temporary receipt mutation and emits receipt SHA on success", async () => {
  await withFixture(async (fixture) => {
    const result = runVerifierWithEnvironment(fixture, {
      NODE_ENV: "test",
      OPEN_ENA_VERIFIER_TEST_MUTATE_RECEIPT_SAME_LENGTH: "1",
    });
    assert.notEqual(result.status, 0, "same-length temporary receipt mutation was accepted");
    assert.match(result.stderr, /receipt.*SHA-256|receipt.*bytes|receipt.*mutation/iu);
    await assert.rejects(readFile(fixture.receiptPath), { code: "ENOENT" });
  });
});

test("publishes a PASS receipt only after final input revalidation succeeds", async () => {
  await withFixture(async (fixture) => {
    const result = runVerifierWithEnvironment(fixture, {
      NODE_ENV: "test",
      OPEN_ENA_VERIFIER_TEST_FAIL_BEFORE_RECEIPT_PUBLISH: "1",
    });
    assert.notEqual(result.status, 0, "pre-publication validation failure was ignored");
    assert.doesNotMatch(result.stdout, /PASS:/u);
    assert.match(result.stderr, /before receipt publication|final input revalidation/iu);
    await assert.rejects(readFile(fixture.receiptPath), { code: "ENOENT" });
  });
});

test("reports persistent private-temp cleanup failure at high priority and proves no receipt", async () => {
  await withFixture(async (fixture) => {
    const result = runVerifierWithEnvironment(fixture, {
      NODE_ENV: "test",
      OPEN_ENA_VERIFIER_TEST_FAIL_BEFORE_RECEIPT_PUBLISH: "1",
      OPEN_ENA_VERIFIER_TEST_FAIL_TEMP_RECEIPT_UNLINK_PERSISTENT: "1",
    });
    assert.notEqual(result.status, 0, "persistent private-temp cleanup failure was ignored");
    assert.doesNotMatch(result.stdout, /PASS:/u);
    assert.match(result.stderr, /HIGH PRIORITY.*temporary receipt.*cleanup/iu);
    assert.match(result.stderr, /receipt destination.*absent|destination.*does not exist/iu);
    await assert.rejects(readFile(fixture.receiptPath), { code: "ENOENT" });
  });
});

test("post-publication private-temp cleanup failure cannot downgrade a committed PASS", async () => {
  await withFixture(async (fixture) => {
    const result = runVerifierWithEnvironment(fixture, {
      NODE_ENV: "test",
      OPEN_ENA_VERIFIER_TEST_FAIL_POST_PUBLISH_TEMP_UNLINK_PERSISTENT: "1",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS:/u);
    assert.match(result.stderr, /WARN:.*post-publication.*temporary.*cleanup/iu);
    const receipt = JSON.parse(await readFile(fixture.receiptPath, "utf8"));
    assert.equal(receipt.status, "PASS");
  });
});

test("receipt creation is exclusive and never overwrites an existing receipt", async () => {
  await withFixture(async (fixture) => {
    const first = runVerifier(fixture);
    assert.equal(first.status, 0, first.stderr);
    const original = await readFile(fixture.receiptPath);
    const second = runVerifier(fixture);
    assert.notEqual(second.status, 0, "existing receipt was overwritten");
    assert.match(second.stderr, /receipt.*exist|EEXIST|exclusive/iu);
    assert.deepEqual(await readFile(fixture.receiptPath), original);
  });
});

test("rejects a symlinked vendored SDK archive through descriptor custody", async () => {
  await withFixture(async (fixture) => {
    const archivePath = join(
      projectRoot,
      "vendor",
      "j-3dena",
      "j-3dena-0.2.0-implemented-unverified.12.tgz",
    );
    const symlinkPath = join(fixture.root, "vendored-sdk-symlink.tgz");
    await symlink(archivePath, symlinkPath);
    const result = runVerifierWithEnvironment(fixture, {
      NODE_ENV: "test",
      OPEN_ENA_VERIFIER_TEST_VENDORED_ARCHIVE_PATH: symlinkPath,
    });
    await rejectFixture(
      fixture,
      /vendored.*(?:symlink|O_NOFOLLOW|descriptor custody)/iu,
      { result },
    );
  });
});
