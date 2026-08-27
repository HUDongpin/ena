#!/usr/bin/env node

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import {
  link,
  lstat,
  open,
  realpath,
  unlink,
} from "node:fs/promises";
import {
  basename,
  isAbsolute,
  join,
  resolve,
  sep,
  win32,
} from "node:path";
import { isDeepStrictEqual } from "node:util";
import { gunzipSync, inflateRawSync, inflateSync } from "node:zlib";

const MANIFEST_SCHEMA = "open-ena.production-browser-run.v1";
const VERIFICATION_SCHEMA = "open-ena.production-browser-run-verification.v1";
const CONTROL_PLANE_SCHEMA = "open-ena.vercel-production-binding.v1";
const PRODUCTION_ROUTE = "https://ena.hk/en/open-ena";
const PRODUCTION_ORIGIN = "https://ena.hk";
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const HEX_64 = /^[0-9a-f]{64}$/u;
const HEX_40 = /^[0-9a-f]{40}$/u;
const JSON_MAX_DEPTH = 256;
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_ARCHIVE_BYTES = 40 * 1024 * 1024;
const MAX_PNG_DECODED_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_ARTIFACT_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_PNG_PIXELS = 64 * 1024 * 1024;
const MAX_TOTAL_PNG_DECODED_BYTES = 256 * 1024 * 1024;
const MAX_VENDORED_ARCHIVE_BYTES = 4 * 1024 * 1024;
const EXPECTED_ARTIFACT_COUNT = 29;
const VENDORED_JENA_VERSION = "0.7.0-ona.0";
const VENDORED_JENA_COMMIT = "90790856f00bdef63dbd27fc3a5b502e8cffe65f";
const VENDORED_JENA_TARBALL_INTEGRITY =
  "sha512-gBhKP9d7C3akXTPlU03AJHBs+dBBDt1TUFGx96P/pB/s0GEGGX2aZFLJGWf9HLc+wuBJIjrJn7tIGicg1WQflQ==";
const VENDORED_SDK_VERSION = "0.2.0-implemented-unverified.12";
const VENDORED_SDK_BUILD_ID = "a8b63e853c28be665282eaa4e8010d4198319106";
const VENDORED_SDK_TARBALL_SHA256 =
  "218faeb50147cff157e617cd43c7030ee38541de7e93b019510c4f75da684c28";
const VENDORED_JENA_BUILD_ID =
  "jena-js@" + VENDORED_JENA_VERSION + "+" + VENDORED_JENA_COMMIT
  + ":" + VENDORED_SDK_BUILD_ID;

class VerificationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "VerificationError";
  }
}

function fail(message) {
  throw new VerificationError(message);
}

function writeWarning(message) {
  try {
    process.stderr.write("WARN: " + message + "\n");
  } catch {
    // A diagnostics stream failure after the commit point cannot invalidate a receipt.
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function equalHex(left, right) {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "ascii"), Buffer.from(right, "ascii"));
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    fail(label + " is not valid UTF-8: " + error.message);
  }
}

class StrictJsonParser {
  constructor(source, label) {
    this.source = source;
    this.label = label;
    this.index = 0;
  }

  parse() {
    this.skipWhitespace();
    const value = this.parseValue("$", 0);
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      this.syntax("unexpected trailing content");
    }
    return value;
  }

  parseValue(path, depth) {
    if (depth > JSON_MAX_DEPTH) {
      this.syntax("JSON nesting exceeds " + JSON_MAX_DEPTH + " levels");
    }
    const character = this.source[this.index];
    if (character === "{") return this.parseObject(path, depth + 1);
    if (character === "[") return this.parseArray(path, depth + 1);
    if (character === '"') return this.parseString();
    if (character === "t") return this.parseLiteral("true", true);
    if (character === "f") return this.parseLiteral("false", false);
    if (character === "n") return this.parseLiteral("null", null);
    if (character === "-" || (character >= "0" && character <= "9")) {
      return this.parseNumber();
    }
    this.syntax("expected a JSON value");
  }

  parseObject(path, depth) {
    const object = {};
    const keys = new Set();
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return object;
    }
    while (true) {
      if (this.source[this.index] !== '"') {
        this.syntax("expected an object key string");
      }
      const key = this.parseString();
      if (keys.has(key)) {
        fail(this.label + " contains duplicate JSON key " + key + " at " + path);
      }
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.index] !== ":") {
        this.syntax("expected ':' after object key");
      }
      this.index += 1;
      this.skipWhitespace();
      const childPath = path === "$" ? "$." + key : path + "." + key;
      const value = this.parseValue(childPath, depth);
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      this.skipWhitespace();
      const separator = this.source[this.index];
      if (separator === "}") {
        this.index += 1;
        return object;
      }
      if (separator !== ",") {
        this.syntax("expected ',' or '}' in object");
      }
      this.index += 1;
      this.skipWhitespace();
    }
  }

  parseArray(path, depth) {
    const array = [];
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return array;
    }
    while (true) {
      array.push(this.parseValue(path + "[" + array.length + "]", depth));
      this.skipWhitespace();
      const separator = this.source[this.index];
      if (separator === "]") {
        this.index += 1;
        return array;
      }
      if (separator !== ",") {
        this.syntax("expected ',' or ']' in array");
      }
      this.index += 1;
      this.skipWhitespace();
    }
  }

  parseString() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === '"') {
        this.index += 1;
        const raw = this.source.slice(start, this.index);
        try {
          return JSON.parse(raw);
        } catch (error) {
          this.syntax("invalid JSON string: " + error.message);
        }
      }
      if (character === "\\") {
        const escape = this.source[this.index + 1];
        if (!'"\\/bfnrtu'.includes(escape ?? "")) {
          this.syntax("invalid JSON string escape");
        }
        if (escape === "u") {
          const digits = this.source.slice(this.index + 2, this.index + 6);
          if (!/^[0-9a-fA-F]{4}$/u.test(digits)) {
            this.syntax("invalid JSON Unicode escape");
          }
          this.index += 6;
          continue;
        }
        this.index += 2;
        continue;
      }
      if (character.charCodeAt(0) <= 0x1f) {
        this.syntax("unescaped control character in JSON string");
      }
      this.index += 1;
    }
    this.syntax("unterminated JSON string");
  }

  parseNumber() {
    const remainder = this.source.slice(this.index);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(remainder);
    if (!match) this.syntax("invalid JSON number");
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      this.syntax("JSON number must be finite");
    }
    return value;
  }

  parseLiteral(literal, value) {
    if (!this.source.startsWith(literal, this.index)) {
      this.syntax("invalid JSON literal");
    }
    this.index += literal.length;
    return value;
  }

  skipWhitespace() {
    while (
      this.source[this.index] === " "
      || this.source[this.index] === "\t"
      || this.source[this.index] === "\n"
      || this.source[this.index] === "\r"
    ) {
      this.index += 1;
    }
  }

  syntax(message) {
    fail(this.label + " is invalid JSON at byte/character " + this.index + ": " + message);
  }
}

function parseStrictJson(bytes, label) {
  const source = decodeUtf8(bytes, label);
  return new StrictJsonParser(source, label).parse();
}

function expectObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path + " must be an object");
  }
  return value;
}

function exactKeys(value, expectedKeys, path) {
  expectObject(value, path);
  const expected = new Set(expectedKeys);
  const actualKeys = Object.keys(value);
  const unknown = actualKeys.filter((key) => !expected.has(key));
  const missing = expectedKeys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0 || actualKeys.length !== expectedKeys.length) {
    const details = [];
    if (unknown.length > 0) details.push("unknown field(s): " + unknown.join(", "));
    if (missing.length > 0) details.push("missing field(s): " + missing.join(", "));
    fail(path + " exact keys violation (" + details.join("; ") + ")");
  }
}

function expectArray(value, path) {
  if (!Array.isArray(value)) fail(path + " must be an array");
  return value;
}

function expectString(value, path, options = {}) {
  if (typeof value !== "string") fail(path + " must be a string");
  if (options.nonEmpty && value.length === 0) fail(path + " must not be empty");
  return value;
}

function expectBoolean(value, expected, path) {
  if (typeof value !== "boolean") fail(path + " must be a boolean");
  if (expected !== undefined && value !== expected) {
    fail(path + " must be " + expected);
  }
}

function expectInteger(value, path, options = {}) {
  if (!Number.isSafeInteger(value)) fail(path + " must be a safe integer");
  if (options.minimum !== undefined && value < options.minimum) {
    fail(path + " must be at least " + options.minimum);
  }
  if (options.exact !== undefined && value !== options.exact) {
    fail(path + " must be exactly " + options.exact);
  }
  return value;
}

function expectNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path + " must be a finite number");
  }
  return value;
}

function expectLiteral(value, expected, path) {
  if (value !== expected) {
    fail(path + " must be " + JSON.stringify(expected) + "; received " + JSON.stringify(value));
  }
}

function expectHex(value, expression, path) {
  expectString(value, path);
  if (!expression.test(value)) fail(path + " has an invalid hexadecimal digest/identifier");
  return value;
}

function expectIsoTimestamp(value, path) {
  expectString(value, path);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail(path + " must be a canonical ISO-8601 UTC timestamp");
  }
  return milliseconds;
}

function expectDeep(actual, expected, path, detail) {
  if (!isDeepStrictEqual(actual, expected)) {
    fail(path + " " + detail);
  }
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("canonical JSON cannot contain a non-finite number");
    return Object.is(value, -0) ? "-0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
}

function hashCanonical(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

const V12_SCHEMA_FILES = new Set([
  "package/schemas/longitudinal-analysis-bundle.v2.json",
  "package/schemas/trajectory-run-spec.v2.json",
  "package/schemas/trajectory-inference-task.v2.json",
  "package/schemas/typed-key.v1.json",
  "package/schemas/typed-scalar.v1.json",
]);
let cachedV12Schemas;

function parseTarOctal(bytes, path) {
  const text = bytes.toString("ascii").replace(/\0.*$/u, "").trim();
  if (!/^[0-7]+$/u.test(text)) fail(path + " is not a valid tar octal integer");
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) fail(path + " exceeds the safe integer range");
  return value;
}

function tarHeaderChecksum(header) {
  let sum = 0;
  for (let index = 0; index < header.length; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  return sum;
}

function readExactFromDescriptorSync(descriptor, size, label) {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_VENDORED_ARCHIVE_BYTES) {
    fail(label + " size limit must be checked before buffer allocation");
  }
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < bytes.length) {
    const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
    if (count === 0) fail(label + " descriptor ended before its fstat size");
    offset += count;
  }
  return bytes;
}

function readVendoredArchiveSnapshot(archivePath) {
  let descriptor;
  try {
    const pathBefore = lstatSync(archivePath, { bigint: true });
    if (pathBefore.isSymbolicLink()) {
      fail("vendored V12 schema archive is a symlink; descriptor custody requires O_NOFOLLOW");
    }
    if (
      !pathBefore.isFile()
      || pathBefore.nlink !== 1n
      || pathBefore.size < 1n
      || pathBefore.size > BigInt(MAX_VENDORED_ARCHIVE_BYTES)
    ) {
      fail("vendored V12 schema archive is not a bounded, singly linked regular file");
    }
    if (typeof fsConstants.O_NOFOLLOW !== "number") {
      fail("vendored V12 schema archive custody requires O_NOFOLLOW support");
    }
    descriptor = openSync(
      archivePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const descriptorBefore = fstatSync(descriptor, { bigint: true });
    if (
      !descriptorBefore.isFile()
      || descriptorBefore.nlink !== 1n
      || descriptorBefore.dev !== pathBefore.dev
      || descriptorBefore.ino !== pathBefore.ino
      || descriptorBefore.size !== pathBefore.size
      || descriptorBefore.size > BigInt(MAX_VENDORED_ARCHIVE_BYTES)
    ) {
      fail("vendored V12 schema archive descriptor does not match its bounded path inode");
    }
    const size = Number(descriptorBefore.size);
    const firstRead = readExactFromDescriptorSync(
      descriptor,
      size,
      "vendored V12 schema archive",
    );
    const descriptorMiddle = fstatSync(descriptor, { bigint: true });
    if (!stableStats(descriptorBefore, descriptorMiddle)) {
      fail("vendored V12 schema archive changed during its first descriptor read");
    }
    const secondRead = readExactFromDescriptorSync(
      descriptor,
      size,
      "vendored V12 schema archive revalidation",
    );
    const descriptorAfter = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatSync(archivePath, { bigint: true });
    if (
      !stableStats(descriptorBefore, descriptorAfter)
      || pathAfter.isSymbolicLink()
      || pathAfter.dev !== descriptorAfter.dev
      || pathAfter.ino !== descriptorAfter.ino
      || !firstRead.equals(secondRead)
      || !equalHex(sha256(firstRead), sha256(secondRead))
    ) {
      fail("vendored V12 schema archive failed descriptor/path read revalidation");
    }
    return firstRead;
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    fail("vendored V12 schema archive descriptor custody failed: " + error.message);
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch (error) {
        fail("vendored V12 schema archive descriptor close failed: " + error.message);
      }
    }
  }
}

function loadVendoredV12Schemas() {
  if (cachedV12Schemas) return cachedV12Schemas;
  const defaultArchivePath = join(
    import.meta.dirname,
    "..",
    "vendor/j-3dena/j-3dena-0.2.0-implemented-unverified.12.tgz",
  );
  const archivePath = process.env.NODE_ENV === "test"
    && process.env.OPEN_ENA_VERIFIER_TEST_VENDORED_ARCHIVE_PATH
    ? process.env.OPEN_ENA_VERIFIER_TEST_VENDORED_ARCHIVE_PATH
    : defaultArchivePath;
  const compressed = readVendoredArchiveSnapshot(archivePath);
  if (!equalHex(sha256(compressed), VENDORED_SDK_TARBALL_SHA256)) {
    fail("vendored V12 schema archive SHA-256 does not match the pinned SDK");
  }
  let tar;
  try {
    tar = gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
  } catch (error) {
    fail("vendored V12 schema archive cannot be safely decompressed: " + error.message);
  }
  const schemas = new Map();
  let cursor = 0;
  while (cursor + 512 <= tar.length) {
    const header = tar.subarray(cursor, cursor + 512);
    if (header.every((byte) => byte === 0)) break;
    const storedChecksum = parseTarOctal(
      header.subarray(148, 156),
      "vendored V12 tar checksum",
    );
    if (tarHeaderChecksum(header) !== storedChecksum) {
      fail("vendored V12 tar header checksum mismatch");
    }
    const name = decodeUtf8(
      header.subarray(0, 100).subarray(0, header.subarray(0, 100).indexOf(0) < 0
        ? 100
        : header.subarray(0, 100).indexOf(0)),
      "vendored V12 tar path",
    );
    const prefixField = header.subarray(345, 500);
    const prefixEnd = prefixField.indexOf(0);
    const prefix = decodeUtf8(
      prefixField.subarray(0, prefixEnd < 0 ? prefixField.length : prefixEnd),
      "vendored V12 tar prefix",
    );
    const path = prefix === "" ? name : prefix + "/" + name;
    const size = parseTarOctal(header.subarray(124, 136), "vendored V12 tar size");
    const dataStart = cursor + 512;
    const dataEnd = dataStart + size;
    const paddedEnd = dataStart + Math.ceil(size / 512) * 512;
    if (dataEnd > tar.length || paddedEnd > tar.length) {
      fail("vendored V12 tar member is truncated");
    }
    const type = header[156];
    if (V12_SCHEMA_FILES.has(path)) {
      if (type !== 0 && type !== 0x30) fail("vendored V12 schema is not a regular tar member");
      const schema = parseStrictJson(tar.subarray(dataStart, dataEnd), path);
      const id = expectString(schema.$id, path + ".$id", { nonEmpty: true });
      if (schemas.has(id)) fail("vendored V12 schemas contain duplicate $id " + id);
      schemas.set(id, schema);
    }
    cursor = paddedEnd;
  }
  if (schemas.size !== V12_SCHEMA_FILES.size) {
    fail("vendored V12 schema archive is missing a required exact schema");
  }
  cachedV12Schemas = schemas;
  return schemas;
}

function resolveJsonSchemaReference(reference, schemas) {
  const hashIndex = reference.indexOf("#");
  const id = hashIndex < 0 ? reference : reference.slice(0, hashIndex);
  const fragment = hashIndex < 0 ? "" : reference.slice(hashIndex + 1);
  let schema = schemas.get(id);
  if (!schema) fail("V12 schema contains an unknown $ref " + reference);
  if (fragment !== "") {
    if (!fragment.startsWith("/")) fail("V12 schema $ref uses an unsupported fragment");
    for (const token of fragment.slice(1).split("/")) {
      const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
      if (schema === null || typeof schema !== "object" || !Object.hasOwn(schema, key)) {
        fail("V12 schema $ref pointer does not resolve: " + reference);
      }
      schema = schema[key];
    }
  }
  return schema;
}

function schemaValueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function validateJsonSchema(value, inputSchema, path, schemas) {
  const schema = inputSchema.$ref
    ? resolveJsonSchemaReference(inputSchema.$ref, schemas)
    : inputSchema;
  if (schema.oneOf) {
    let matches = 0;
    for (const candidate of schema.oneOf) {
      try {
        validateJsonSchema(value, candidate, path, schemas);
        matches += 1;
      } catch (error) {
        if (!(error instanceof VerificationError)) throw error;
      }
    }
    if (matches !== 1) fail(path + " must match exactly one V12 schema branch");
  }
  if (Object.hasOwn(schema, "const") && !isDeepStrictEqual(value, schema.const)) {
    fail(path + " does not match the V12 schema const");
  }
  if (schema.enum && !schema.enum.some((entry) => isDeepStrictEqual(value, entry))) {
    fail(path + " is outside the V12 schema enum");
  }
  if (schema.type) {
    const actual = schemaValueType(value);
    const valid = schema.type === "number"
      ? actual === "number" || actual === "integer"
      : actual === schema.type;
    if (!valid) fail(path + " must have V12 schema type " + schema.type);
  }
  if (schema.type === "object") {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) fail(path + " is missing required V12 field " + required);
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateJsonSchema(child, properties[key], path + "." + key, schemas);
      } else if (schema.additionalProperties === false) {
        fail(path + " contains unknown V12 field " + key);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateJsonSchema(child, schema.additionalProperties, path + "." + key, schemas);
      }
    }
  }
  if (schema.type === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(path + " has fewer than the V12 minimum items");
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      fail(path + " has more than the V12 maximum items");
    }
    if (schema.uniqueItems) {
      const identities = value.map(canonicalJson);
      if (new Set(identities).size !== identities.length) {
        fail(path + " violates V12 uniqueItems");
      }
    }
    if (schema.items) {
      value.forEach((entry, index) => {
        validateJsonSchema(entry, schema.items, path + "[" + index + "]", schemas);
      });
    }
  }
  if (schema.type === "string") {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) {
      fail(path + " is shorter than the V12 minimum length");
    }
    if (schema.maxLength !== undefined && length > schema.maxLength) {
      fail(path + " is longer than the V12 maximum length");
    }
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
      fail(path + " does not match the V12 schema pattern");
    }
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (!Number.isFinite(value)) fail(path + " must be a finite V12 number");
    if (schema.minimum !== undefined && value < schema.minimum) {
      fail(path + " is below the V12 minimum");
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      fail(path + " is above the V12 maximum");
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      fail(path + " is not above the V12 exclusive minimum");
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      fail(path + " is not below the V12 exclusive maximum");
    }
  }
  for (const clause of schema.allOf ?? []) {
    validateJsonSchema(value, clause, path, schemas);
  }
  if (schema.if) {
    let condition = false;
    try {
      validateJsonSchema(value, schema.if, path, schemas);
      condition = true;
    } catch (error) {
      if (!(error instanceof VerificationError)) throw error;
    }
    if (condition && schema.then) validateJsonSchema(value, schema.then, path, schemas);
    if (!condition && schema.else) validateJsonSchema(value, schema.else, path, schemas);
  }
}

function validateAggregateAgainstVendoredV12(analysis, label) {
  const {
    sourceEnvelopeSchemaVersion,
    privacy: _privacy,
    ...sourceEnvelope
  } = analysis;
  sourceEnvelope.schemaVersion = sourceEnvelopeSchemaVersion;
  const schemas = loadVendoredV12Schemas();
  const main = schemas.get(
    "https://3dena.com/schemas/longitudinal-analysis-bundle.v2.json",
  );
  validateJsonSchema(sourceEnvelope, main, label, schemas);
}

function validateStrictRelativePath(value, label) {
  expectString(value, label, { nonEmpty: true });
  if (
    isAbsolute(value)
    || win32.isAbsolute(value)
    || value.includes("\\")
    || value.includes("\0")
  ) {
    fail(label + " must be a strict relative path using '/' separators");
  }
  const segments = value.split("/");
  if (
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    fail(label + " strict relative path contains an empty, '.', or '..' path segment");
  }
  return segments;
}

function withinRoot(root, candidate) {
  return candidate === root || candidate.startsWith(root + sep);
}

function stableStats(left, right) {
  return (
    left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
  );
}

async function rejectSymlinkedAbsoluteComponents(absolute, label) {
  const resolved = resolve(absolute);
  const segments = resolved.split(sep).filter((segment) => segment.length > 0);
  let current = sep;
  let rootStats;
  try {
    rootStats = await lstat(current, { bigint: true });
  } catch (error) {
    fail(label + " filesystem root cannot be inspected: " + error.message);
  }
  if (rootStats.isSymbolicLink()) fail(label + " filesystem root is a symlink");
  for (const segment of segments) {
    current = join(current, segment);
    let stats;
    try {
      stats = await lstat(current, { bigint: true });
    } catch (error) {
      fail(label + " path component cannot be inspected: " + error.message);
    }
    if (stats.isSymbolicLink()) {
      fail(label + " has a symlink ancestor/component at " + current);
    }
  }
}

async function establishRoot(rootArgument) {
  expectString(rootArgument, "evidence root", { nonEmpty: true });
  if (!isAbsolute(rootArgument)) fail("evidence root must be an absolute path");
  const inputRoot = resolve(rootArgument);
  await rejectSymlinkedAbsoluteComponents(inputRoot, "evidence root");
  let rootStats;
  try {
    rootStats = await lstat(inputRoot, { bigint: true });
  } catch (error) {
    fail("cannot inspect evidence root: " + error.message);
  }
  if (rootStats.isSymbolicLink()) fail("evidence root must not be a symlink");
  if (!rootStats.isDirectory()) fail("evidence root must be a directory");
  let canonicalRoot;
  try {
    canonicalRoot = await realpath(inputRoot);
  } catch (error) {
    fail("cannot resolve evidence root: " + error.message);
  }
  if (canonicalRoot !== inputRoot) {
    fail("evidence root canonical path differs despite symlink-free ancestry");
  }
  return { canonicalRoot, inputRoot, openSnapshots: [], rootStats };
}

async function inspectPath(rootContext, relativePath, label, expectedLeafType = "file") {
  const segments = validateStrictRelativePath(relativePath, label);
  let current = rootContext.inputRoot;
  let leafStats;
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]);
    let stats;
    try {
      stats = await lstat(current, { bigint: true });
    } catch (error) {
      fail(label + " cannot be inspected: " + error.message);
    }
    if (stats.isSymbolicLink()) {
      fail(label + " custody rejects symlink path component " + segments.slice(0, index + 1).join("/"));
    }
    const leaf = index === segments.length - 1;
    if (!leaf && !stats.isDirectory()) {
      fail(label + " parent path component is not a directory: " + segments[index]);
    }
    if (leaf) leafStats = stats;
  }
  if (expectedLeafType === "file" && !leafStats.isFile()) {
    fail(label + " must be a regular file");
  }
  if (expectedLeafType === "directory" && !leafStats.isDirectory()) {
    fail(label + " must be a directory");
  }
  let canonical;
  try {
    canonical = await realpath(current);
  } catch (error) {
    fail(label + " cannot be resolved: " + error.message);
  }
  if (!withinRoot(rootContext.canonicalRoot, canonical)) {
    fail(label + " escapes evidence-root custody");
  }
  return { absolute: current, canonical, stats: leafStats };
}

async function inspectParentDirectory(rootContext, relativePath, label) {
  const segments = validateStrictRelativePath(relativePath, label);
  if (segments.length === 1) {
    return {
      absolute: rootContext.inputRoot,
      canonical: rootContext.canonicalRoot,
      stats: rootContext.rootStats,
    };
  }
  const parent = segments.slice(0, -1).join("/");
  return inspectPath(rootContext, parent, label + " parent", "directory");
}

async function readBytesFromHandle(handle, size, label, maxBytes) {
  if (size > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail(label + " is too large to read safely");
  }
  if (maxBytes !== undefined && size > BigInt(maxBytes)) {
    fail(
      label + " descriptor size exceeds the " + maxBytes
      + "-byte size limit before buffer allocation",
    );
  }
  const length = Number(size);
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const result = await handle.read(bytes, offset, length - offset, offset);
    if (result.bytesRead === 0) {
      fail(label + " ended before its declared descriptor size");
    }
    offset += result.bytesRead;
  }
  return bytes;
}

async function readCustodiedFile(rootContext, relativePath, label, options = {}) {
  const inspected = await inspectPath(rootContext, relativePath, label, "file");
  const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
  let handle;
  try {
    handle = await open(inspected.absolute, fsConstants.O_RDONLY | noFollow);
  } catch (error) {
    fail(label + " could not be opened without following symlinks: " + error.message);
  }
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) fail(label + " must be a regular file");
    if (before.nlink !== 1n) {
      fail(label + " violates exclusive inode custody because it has a hard link/nlink count other than 1");
    }
    if (before.dev !== inspected.stats.dev || before.ino !== inspected.stats.ino) {
      fail(label + " changed identity during custody inspection");
    }
    if (options.maxBytes !== undefined && before.size > BigInt(options.maxBytes)) {
      fail(
        label + " descriptor size exceeds the " + options.maxBytes
        + "-byte size limit before buffer allocation",
      );
    }
    if (
      options.expectedBytes !== undefined
      && before.size !== BigInt(options.expectedBytes)
    ) {
      fail(
        label + " bytes descriptor size differs from its declared byte receipt before reading",
      );
    }
    const bytes = await readBytesFromHandle(
      handle,
      before.size,
      label,
      options.maxBytes,
    );
    const after = await handle.stat({ bigint: true });
    if (!stableStats(before, after) || BigInt(bytes.length) !== after.size) {
      fail(label + " changed while it was being read");
    }
    const pathAfter = await lstat(inspected.absolute, { bigint: true });
    if (
      pathAfter.isSymbolicLink()
      || pathAfter.dev !== after.dev
      || pathAfter.ino !== after.ino
    ) {
      fail(label + " path identity changed while it was being read");
    }
    const canonicalAfter = await realpath(inspected.absolute);
    if (!withinRoot(rootContext.canonicalRoot, canonicalAfter)) {
      fail(label + " escaped evidence-root custody while it was being read");
    }
    const result = {
      bytes,
      snapshot: {
        ctimeNs: after.ctimeNs,
        dev: after.dev,
        digest: sha256(bytes),
        ino: after.ino,
        mode: after.mode,
        mtimeNs: after.mtimeNs,
        nlink: after.nlink,
        maxBytes: options.maxBytes,
        relativePath,
        size: after.size,
        handle,
      },
    };
    rootContext.openSnapshots.push(result.snapshot);
    return result;
  } catch (error) {
    try {
      await handle.close();
    } catch {
      // Preserve the primary custody error.
    }
    throw error;
  }
}

async function revalidateSnapshot(rootContext, snapshot, label) {
  const before = await snapshot.handle.stat({ bigint: true });
  if (!before.isFile() || before.nlink !== 1n) {
    fail(label + " no longer has exclusive regular-file inode custody");
  }
  const bytes = await readBytesFromHandle(
    snapshot.handle,
    before.size,
    label,
    snapshot.maxBytes,
  );
  const after = await snapshot.handle.stat({ bigint: true });
  if (!stableStats(before, after) || BigInt(bytes.length) !== after.size) {
    fail(label + " changed while its open descriptor was revalidated");
  }
  const inspected = await inspectPath(
    rootContext,
    snapshot.relativePath,
    label,
    "file",
  );
  const next = {
    ctimeNs: after.ctimeNs,
    dev: after.dev,
    digest: sha256(bytes),
    ino: after.ino,
    mode: after.mode,
    mtimeNs: after.mtimeNs,
    nlink: after.nlink,
    relativePath: snapshot.relativePath,
    size: after.size,
  };
  if (
    next.dev !== snapshot.dev
    || next.ino !== snapshot.ino
    || next.mode !== snapshot.mode
    || next.nlink !== snapshot.nlink
    || next.size !== snapshot.size
    || next.mtimeNs !== snapshot.mtimeNs
    || next.ctimeNs !== snapshot.ctimeNs
    || !equalHex(next.digest, snapshot.digest)
  ) {
    fail(label + " changed after validation and before receipt creation");
  }
  if (inspected.stats.dev !== after.dev || inspected.stats.ino !== after.ino) {
    fail(label + " path no longer names its held-open descriptor inode");
  }
}

async function closeOpenSnapshots(rootContext) {
  const snapshots = [...rootContext.openSnapshots].reverse();
  rootContext.openSnapshots.length = 0;
  for (const snapshot of snapshots) {
    try {
      await snapshot.handle.close();
    } catch {
      // All verification decisions have already been made; close best-effort.
    }
  }
}

function assertUniqueInputInodes(snapshots) {
  const seen = new Map();
  for (const snapshot of snapshots) {
    const key = snapshot.dev.toString() + ":" + snapshot.ino.toString();
    const previous = seen.get(key);
    if (previous) {
      fail(
        "input files violate unique inode custody: "
        + previous + " and " + snapshot.relativePath + " share a duplicate inode",
      );
    }
    seen.set(key, snapshot.relativePath);
  }
}

function validateArtifactReceipt(value, path) {
  exactKeys(value, ["file", "bytes", "sha256", "mediaType"], path);
  validateStrictRelativePath(value.file, path + ".file");
  expectInteger(value.bytes, path + ".bytes", { minimum: 1 });
  expectHex(value.sha256, HEX_64, path + ".sha256");
  expectString(value.mediaType, path + ".mediaType", { nonEmpty: true });
  return value;
}

function validateArtifactDeclarations(manifest) {
  const artifacts = expectArray(manifest.artifacts, "manifest.artifacts");
  if (artifacts.length !== EXPECTED_ARTIFACT_COUNT) {
    fail(
      "manifest.artifacts must contain exactly " + EXPECTED_ARTIFACT_COUNT
      + " declarations before declaration validation or materialization",
    );
  }
  const artifactMap = new Map();
  let previousFile = null;
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = validateArtifactReceipt(
      artifacts[index],
      "manifest.artifacts[" + index + "]",
    );
    if (artifactMap.has(artifact.file)) {
      fail("manifest.artifacts contains duplicate artifact file " + artifact.file);
    }
    if (previousFile !== null && previousFile.localeCompare(artifact.file) >= 0) {
      fail("manifest.artifacts must be strictly sorted by artifact file");
    }
    artifactMap.set(artifact.file, artifact);
    previousFile = artifact.file;
  }
  expectHex(manifest.contentSetHash, HEX_64, "manifest.contentSetHash");
  const computed = hashCanonical(artifacts);
  if (!equalHex(computed, manifest.contentSetHash)) {
    fail(
      "manifest.contentSetHash does not match the canonical SHA-256 of manifest.artifacts",
    );
  }
  const totalBytes = artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_ARTIFACT_BYTES) {
    fail(
      "total artifact bytes exceed the aggregate artifact budget of "
      + MAX_TOTAL_ARTIFACT_BYTES + " bytes before artifact loading",
    );
  }
  return artifactMap;
}

async function loadAndVerifyArtifacts(rootContext, artifactMap) {
  const artifactBytes = new Map();
  const artifactSnapshots = [];
  for (const [file, artifact] of artifactMap) {
    const isZip = file.endsWith(".zip");
    const maxBytes = isZip ? MAX_ZIP_ARCHIVE_BYTES : MAX_ARTIFACT_BYTES;
    if (artifact.bytes > maxBytes) {
      fail(
        "artifact " + file + (isZip ? " compressed ZIP" : "")
        + " byte receipt exceeds the " + maxBytes + "-byte size limit",
      );
    }
    const loaded = await readCustodiedFile(
      rootContext,
      file,
      "artifact " + file + (isZip ? " compressed ZIP" : ""),
      { expectedBytes: artifact.bytes, maxBytes },
    );
    if (loaded.bytes.length !== artifact.bytes) {
      fail(
        "artifact bytes mismatch for " + file
        + ": declared " + artifact.bytes + ", observed " + loaded.bytes.length,
      );
    }
    if (!equalHex(loaded.snapshot.digest, artifact.sha256)) {
      fail("artifact SHA-256 mismatch for " + file);
    }
    artifactBytes.set(file, loaded.bytes);
    artifactSnapshots.push(loaded.snapshot);
  }
  return { artifactBytes, artifactSnapshots };
}

function validateArtifactReference(
  reference,
  path,
  artifactMap,
  referencedArtifacts,
) {
  validateArtifactReceipt(reference, path);
  const declaration = artifactMap.get(reference.file);
  if (!declaration) {
    fail(path + " references undeclared artifact " + reference.file);
  }
  if (!isDeepStrictEqual(reference, declaration)) {
    fail(path + " artifact reference must exactly match its manifest.artifacts declaration");
  }
  referencedArtifacts.add(reference.file);
  return declaration;
}

function preflightArtifactReferenceGraph(manifest, artifactMap) {
  const referenced = new Set();
  const bind = (reference, expectedFile, label) => {
    const artifact = validateArtifactReference(reference, label, artifactMap, referenced);
    expectLiteral(artifact.file, expectedFile, label + ".file");
  };
  bind(
    manifest.deployment.controlPlaneReceipt,
    "control-plane/vercel-production-binding.json",
    "preflight deployment control-plane receipt",
  );
  const viewports = mapExactSet(
    manifest.viewports,
    "name",
    ["desktop", "tablet", "mobile"],
    "preflight viewport artifact graph",
  );
  for (const name of ["desktop", "tablet", "mobile"]) {
    const viewport = viewports.get(name);
    bind(
      viewport.pageScreenshot?.artifact,
      "screenshots/" + name + "-page.png",
      "preflight viewport " + name + " page screenshot",
    );
    bind(
      viewport.plotScreenshot?.artifact,
      "screenshots/" + name + "-plot.png",
      "preflight viewport " + name + " plot screenshot",
    );
  }
  bind(
    manifest.fullscreen?.screenshot?.artifact,
    "screenshots/fullscreen.png",
    "preflight fullscreen screenshot",
  );
  const cameras = mapExactSet(
    manifest.cameras,
    "preset",
    ["isometric", "xy", "xz", "yz", "yx", "zx", "zy"],
    "preflight camera artifact graph",
  );
  for (const preset of ["isometric", "xy", "xz", "yz", "yx", "zx", "zy"]) {
    bind(
      cameras.get(preset).screenshot?.artifact,
      "screenshots/camera-" + preset + ".png",
      "preflight camera " + preset + " screenshot",
    );
  }
  const projections = mapExactSet(
    manifest.projections,
    "projection",
    ["xy", "xz", "yz", "yx", "zx", "zy"],
    "preflight projection artifact graph",
  );
  for (const projection of ["xy", "xz", "yz", "yx", "zx", "zy"]) {
    bind(
      projections.get(projection).screenshot?.artifact,
      "screenshots/projection-" + projection + ".png",
      "preflight projection " + projection + " screenshot",
    );
  }
  bind(
    manifest.browserDiagnostics?.rawEventLedger,
    "browser/raw-event-ledger.json",
    "preflight raw browser event ledger",
  );
  const downloadItems = mapExactSet(
    manifest.downloads?.items,
    "kind",
    Object.keys(DOWNLOAD_SPECS),
    "preflight download artifact graph",
  );
  for (const [kind, spec] of Object.entries(DOWNLOAD_SPECS)) {
    bind(
      downloadItems.get(kind).artifact,
      spec.file,
      "preflight download " + kind,
    );
  }
  bind(
    manifest.downloads?.aggregateBundle?.artifact,
    DOWNLOAD_SPECS.bundle.file,
    "preflight aggregate bundle reference",
  );
  bind(
    manifest.downloads?.participantBundle?.artifact,
    DOWNLOAD_SPECS.participant.file,
    "preflight participant bundle reference",
  );
  const expectedPaths = [
    "browser/raw-event-ledger.json",
    "control-plane/vercel-production-binding.json",
    ...Object.values(DOWNLOAD_SPECS).map((spec) => spec.file),
    "screenshots/fullscreen.png",
    ...["desktop", "tablet", "mobile"].flatMap((name) => [
      "screenshots/" + name + "-page.png",
      "screenshots/" + name + "-plot.png",
    ]),
    ...["isometric", "xy", "xz", "yz", "yx", "zx", "zy"].map(
      (preset) => "screenshots/camera-" + preset + ".png",
    ),
    ...["xy", "xz", "yz", "yx", "zx", "zy"].map(
      (projection) => "screenshots/projection-" + projection + ".png",
    ),
  ].sort((left, right) => left.localeCompare(right, "en"));
  const declaredPaths = [...artifactMap.keys()];
  expectDeep(
    declaredPaths,
    expectedPaths,
    "manifest artifact exact path/count set (unreferenced artifact or missing reference)",
    "must equal the complete reference graph before artifact loading",
  );
  if (referenced.size !== expectedPaths.length) {
    fail("artifact reference graph count does not match the exact artifact path set");
  }
  return referenced;
}

function preflightPngAggregateBudget(artifactMap, artifactBytes) {
  let pixels = 0;
  let decodedBytes = 0;
  let count = 0;
  for (const [file, artifact] of artifactMap) {
    if (artifact.mediaType !== "image/png") continue;
    count += 1;
    const bytes = artifactBytes.get(file);
    if (
      bytes.length < 24
      || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
      || bytes.readUInt32BE(8) !== 13
      || bytes.subarray(12, 16).toString("ascii") !== "IHDR"
    ) {
      fail(
        "artifact " + file
        + " lacks a native PNG signature and bounded IHDR during budget preflight",
      );
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const imagePixels = width * height;
    const imageDecodedBytes = imagePixels * 4 + height;
    if (
      width === 0
      || height === 0
      || !Number.isSafeInteger(imagePixels)
      || !Number.isSafeInteger(imageDecodedBytes)
    ) {
      fail("artifact " + file + " has unsafe PNG dimensions during budget preflight");
    }
    pixels += imagePixels;
    decodedBytes += imageDecodedBytes;
    if (!Number.isSafeInteger(pixels) || !Number.isSafeInteger(decodedBytes)) {
      fail("total PNG decoded budget arithmetic is unsafe");
    }
  }
  if (count !== 20) fail("artifact exact path/count set must contain exactly 20 PNG screenshots");
  if (pixels > MAX_TOTAL_PNG_PIXELS || decodedBytes > MAX_TOTAL_PNG_DECODED_BYTES) {
    fail(
      "total PNG pixel/decoded-byte budget exceeded before PNG decode: pixels="
      + pixels + ", decodedBytes=" + decodedBytes,
    );
  }
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

const ZIP_MAX_ENTRIES = 64;
const ZIP_MAX_MEMBER_BYTES = 8 * 1024 * 1024;
const ZIP_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const ZIP_MAX_PATH_BYTES = 512;

function inspectZipExtra(extra, label) {
  let cursor = 0;
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) fail(label + " ZIP extra field is truncated");
    const headerId = extra.readUInt16LE(cursor);
    const length = extra.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + length > extra.length) fail(label + " ZIP extra field payload is truncated");
    if (headerId === 0x0001) fail(label + " uses unsupported ZIP64 metadata");
    cursor += length;
  }
  if (extra.length !== 0) {
    fail(label + " ZIP extra fields are unsupported and must be empty");
  }
}

function findZipEocd(bytes, label) {
  if (bytes.length < 22) fail(label + " ZIP archive is shorter than an EOCD record");
  const minimum = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = bytes.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === bytes.length) return offset;
  }
  fail(label + " ZIP archive has no terminal EOCD record");
}

function parseZip32(bytes, label) {
  if (bytes.length > MAX_ZIP_ARCHIVE_BYTES) {
    fail(label + " compressed ZIP exceeds the archive size limit");
  }
  const eocdOffset = findZipEocd(bytes, label);
  const diskNumber = bytes.readUInt16LE(eocdOffset + 4);
  const centralDisk = bytes.readUInt16LE(eocdOffset + 6);
  const diskEntries = bytes.readUInt16LE(eocdOffset + 8);
  const totalEntries = bytes.readUInt16LE(eocdOffset + 10);
  const centralSize = bytes.readUInt32LE(eocdOffset + 12);
  const centralOffset = bytes.readUInt32LE(eocdOffset + 16);
  const eocdCommentLength = bytes.readUInt16LE(eocdOffset + 20);
  if (eocdCommentLength !== 0) {
    fail(label + " ZIP EOCD comments are unsupported and must be empty");
  }
  if (
    diskEntries === 0xffff
    || totalEntries === 0xffff
    || centralSize === 0xffffffff
    || centralOffset === 0xffffffff
  ) {
    fail(label + " uses unsupported ZIP64 EOCD sentinels");
  }
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    fail(label + " ZIP archive must be a single-disk archive");
  }
  if (totalEntries > ZIP_MAX_ENTRIES) {
    fail(label + " ZIP entry count exceeds " + ZIP_MAX_ENTRIES);
  }
  if (centralOffset + centralSize !== eocdOffset) {
    fail(label + " ZIP central-directory bounds do not terminate at EOCD");
  }
  const entries = new Map();
  const descriptors = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > eocdOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      fail(label + " ZIP central-directory entry " + index + " is invalid or truncated");
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    if ((flags & 0x0001) !== 0) fail(label + " ZIP encrypted members are unsupported");
    if ((flags & ~0x0800) !== 0) {
      fail(label + " ZIP member flags are unsupported: 0x" + flags.toString(16));
    }
    if (method !== 0 && method !== 8) {
      fail(label + " ZIP compression method " + method + " is unsupported");
    }
    if (
      compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff
      || localOffset === 0xffffffff
      || diskStart === 0xffff
    ) {
      fail(label + " uses unsupported ZIP64 member metadata");
    }
    if (diskStart !== 0) fail(label + " ZIP member starts on a non-zero disk");
    if (commentLength !== 0) {
      fail(label + " ZIP entry comments are unsupported and must be empty");
    }
    if (uncompressedSize > ZIP_MAX_MEMBER_BYTES) {
      fail(label + " ZIP member exceeds the uncompressed size limit");
    }
    const variableEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      nameLength === 0
      || nameLength > ZIP_MAX_PATH_BYTES
      || variableEnd > eocdOffset
    ) {
      fail(label + " ZIP central-directory variable fields are invalid");
    }
    const path = decodeUtf8(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      label + " ZIP member name",
    );
    try {
      validateStrictRelativePath(path, label + " ZIP archive path");
    } catch (error) {
      if (error instanceof VerificationError) {
        fail(label + " ZIP archive contains unsafe path " + JSON.stringify(path)
          + ": " + error.message);
      }
      throw error;
    }
    if (entries.has(path)) fail(label + " ZIP contains duplicate archive path " + path);
    inspectZipExtra(
      bytes.subarray(
        cursor + 46 + nameLength,
        cursor + 46 + nameLength + extraLength,
      ),
      label + " ZIP central entry " + path,
    );
    const descriptor = {
      checksum,
      compressedSize,
      flags,
      localOffset,
      method,
      path,
      uncompressedSize,
    };
    entries.set(path, descriptor);
    descriptors.push(descriptor);
    cursor = variableEnd;
  }
  if (cursor !== eocdOffset || cursor !== centralOffset + centralSize) {
    fail(label + " ZIP central-directory size/count mismatch");
  }

  let totalUncompressed = 0;
  const localRanges = [];
  for (const descriptor of descriptors) {
    const offset = descriptor.localOffset;
    if (offset + 30 > centralOffset || bytes.readUInt32LE(offset) !== 0x04034b50) {
      fail(label + " ZIP local header is invalid for " + descriptor.path);
    }
    const flags = bytes.readUInt16LE(offset + 6);
    const method = bytes.readUInt16LE(offset + 8);
    const checksum = bytes.readUInt32LE(offset + 14);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const uncompressedSize = bytes.readUInt32LE(offset + 22);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const localHeaderEnd = offset + 30 + nameLength + extraLength;
    const dataEnd = localHeaderEnd + descriptor.compressedSize;
    if (localHeaderEnd > centralOffset || dataEnd > centralOffset) {
      fail(label + " ZIP local member bounds are invalid for " + descriptor.path);
    }
    const localPath = decodeUtf8(
      bytes.subarray(offset + 30, offset + 30 + nameLength),
      label + " ZIP local member name",
    );
    if (
      localPath !== descriptor.path
      || flags !== descriptor.flags
      || method !== descriptor.method
      || checksum !== descriptor.checksum
      || compressedSize !== descriptor.compressedSize
      || uncompressedSize !== descriptor.uncompressedSize
    ) {
      fail(label + " ZIP local/central metadata mismatch for " + descriptor.path);
    }
    inspectZipExtra(
      bytes.subarray(offset + 30 + nameLength, localHeaderEnd),
      label + " ZIP local entry " + descriptor.path,
    );
    const compressed = bytes.subarray(localHeaderEnd, dataEnd);
    let memberBytes;
    try {
      if (descriptor.method === 0) {
        memberBytes = Buffer.from(compressed);
      } else {
        const inflated = inflateRawSync(compressed, {
          info: true,
          maxOutputLength: Math.max(1, descriptor.uncompressedSize),
        });
        if (inflated.engine.bytesWritten !== compressed.length) {
          fail(
            label + " ZIP deflate stream has trailing/unconsumed compressed bytes for "
            + descriptor.path,
          );
        }
        memberBytes = inflated.buffer;
      }
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      fail(label + " ZIP deflate failed for " + descriptor.path + ": " + error.message);
    }
    if (memberBytes.length !== descriptor.uncompressedSize) {
      fail(label + " ZIP uncompressed size mismatch for " + descriptor.path);
    }
    if (crc32(memberBytes) !== descriptor.checksum) {
      fail(label + " ZIP CRC mismatch for " + descriptor.path);
    }
    descriptor.bytes = memberBytes;
    totalUncompressed += memberBytes.length;
    if (totalUncompressed > ZIP_MAX_TOTAL_BYTES) {
      fail(label + " ZIP total uncompressed size exceeds the safety limit");
    }
    localRanges.push({ end: dataEnd, path: descriptor.path, start: offset });
  }
  localRanges.sort((left, right) => left.start - right.start);
  let expectedLocalOffset = 0;
  for (const range of localRanges) {
    if (range.start !== expectedLocalOffset) {
      fail(
        label + " ZIP local member ranges must be contiguous without unowned gaps; "
        + range.path + " starts at " + range.start
        + " instead of " + expectedLocalOffset,
      );
    }
    expectedLocalOffset = range.end;
  }
  if (expectedLocalOffset !== centralOffset) {
    fail(label + " ZIP local member ranges must end exactly at the central directory");
  }
  return entries;
}

function containsObjectKey(value, targetKey) {
  if (value === null || typeof value !== "object") return false;
  if (!Array.isArray(value) && Object.hasOwn(value, targetKey)) return true;
  return (Array.isArray(value) ? value : Object.values(value))
    .some((child) => containsObjectKey(child, targetKey));
}

function validateHashArray(value, path) {
  const values = expectArray(value, path);
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const digest = expectHex(values[index], HEX_64, path + "[" + index + "]");
    if (seen.has(digest)) fail(path + " must not contain duplicate hashes");
    seen.add(digest);
  }
}

const AGGREGATE_ANALYSIS_KEYS = [
  "schemaVersion",
  "sourceEnvelopeSchemaVersion",
  "identity",
  "runSpec",
  "model",
  "paths",
  "inference",
  "pathComparisons",
  "bootstrap",
  "codeGeometry",
  "networkOverlays",
  "diagnostics",
  "execution",
  "privacy",
];
const AGGREGATE_OMITTED_FIELDS = [
  "paths[].dynamics.participantPeriods",
  "pathComparisons[].result.sideA.participantPeriods",
  "pathComparisons[].result.sideB.participantPeriods",
  "pathComparisons[].result.permutation.unitOrder",
  "bootstrap[].result.base.participantPeriods",
];
function requireEmptyArray(value, path) {
  const entries = expectArray(value, path);
  if (entries.length !== 0) fail(path + " must be an empty redacted array");
}

function validateAggregateRedactionPaths(analysis, label) {
  analysis.paths.forEach((pathEntry, index) => {
    const path = label + ".paths[" + index + "]";
    expectObject(pathEntry, path);
    expectObject(pathEntry.dynamics, path + ".dynamics");
    requireEmptyArray(
      pathEntry.dynamics.participantPeriods,
      path + ".dynamics.participantPeriods",
    );
  });
  analysis.pathComparisons.forEach((comparison, index) => {
    const path = label + ".pathComparisons[" + index + "].result";
    expectObject(comparison, label + ".pathComparisons[" + index + "]");
    expectObject(comparison.result, path);
    for (const side of ["sideA", "sideB"]) {
      expectObject(comparison.result[side], path + "." + side);
      requireEmptyArray(
        comparison.result[side].participantPeriods,
        path + "." + side + ".participantPeriods",
      );
    }
    expectObject(comparison.result.permutation, path + ".permutation");
    requireEmptyArray(
      comparison.result.permutation.unitOrder,
      path + ".permutation.unitOrder",
    );
  });
  analysis.bootstrap.forEach((entry, index) => {
    const path = label + ".bootstrap[" + index + "].result.base";
    expectObject(entry, label + ".bootstrap[" + index + "]");
    expectObject(entry.result, label + ".bootstrap[" + index + "].result");
    expectObject(entry.result.base, path);
    requireEmptyArray(entry.result.base.participantPeriods, path + ".participantPeriods");
  });
}

function parseRfc4180Csv(bytes, label) {
  const text = decodeUtf8(bytes, label);
  if (text.startsWith("\ufeff")) fail(label + " must not contain a UTF-8 BOM");
  if (!text.endsWith("\r\n")) fail(label + " must end with canonical CRLF");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < text.length;) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
        } else {
          quoted = false;
          closedQuote = true;
          index += 1;
        }
      } else {
        field += character;
        index += 1;
      }
      continue;
    }
    if (closedQuote && character !== "," && character !== "\r") {
      fail(label + " has characters after a closing RFC4180 quote");
    }
    if (character === '"') {
      if (field !== "" || closedQuote) fail(label + " contains a quote inside an unquoted field");
      quoted = true;
      index += 1;
      continue;
    }
    if (character === ",") {
      row.push(field);
      field = "";
      closedQuote = false;
      index += 1;
      continue;
    }
    if (character === "\r") {
      if (text[index + 1] !== "\n") fail(label + " contains a bare CR");
      row.push(field);
      if (row.length > 1024) fail(label + " CSV row exceeds the column safety limit");
      rows.push(row);
      if (rows.length > 1_000_000) fail(label + " CSV exceeds the row safety limit");
      row = [];
      field = "";
      closedQuote = false;
      index += 2;
      continue;
    }
    if (character === "\n") fail(label + " contains a bare LF");
    field += character;
    index += 1;
  }
  if (quoted) fail(label + " contains an unterminated RFC4180 quoted field");
  if (row.length !== 0 || field !== "" || closedQuote) {
    fail(label + " contains data after its final CRLF");
  }
  if (rows.length === 0) fail(label + " must contain a header row");
  return rows;
}

function validateCanonicalCsvHeader(bytes, expectedColumns, label) {
  const rows = parseRfc4180Csv(bytes, label);
  if (!isDeepStrictEqual(rows[0], expectedColumns)) {
    fail(label + " frozen CSV header mismatch");
  }
  const records = rows.slice(1);
  records.forEach((record, index) => {
    if (record.length !== expectedColumns.length) {
      fail(label + " row " + (index + 2) + " has a non-canonical column count");
    }
  });
  return records;
}

function needsSpreadsheetNeutralization(value) {
  for (const character of value) {
    if (character === "\t" || character === "\r") return true;
    const codePoint = character.codePointAt(0) ?? 0;
    if (/\s/u.test(character) || codePoint < 0x20 || codePoint === 0x7f) continue;
    return character === "=" || character === "+" || character === "-" || character === "@";
  }
  return false;
}

function exportedCsvScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" && needsSpreadsheetNeutralization(value)) return "'" + value;
  return String(value);
}

function expectCsvScalar(actual, expected, path) {
  const text = exportedCsvScalar(expected);
  if (actual !== text) fail(path + " does not match the V12 analysis value");
}

function validateTrajectoryPathCsv(bytes, analysis, manifest, label) {
  const columns = longitudinalPathColumns(
    manifest.selectedDimensions,
    manifest.fullRotationDimensions,
  );
  const records = validateCanonicalCsvHeader(bytes, columns, label);
  const expected = analysis.paths.flatMap((pathEntry) => (
    pathEntry.dynamics.periods.map((period, periodIndex) => ({
      pathEntry,
      period,
      periodIndex,
    }))
  ));
  if (records.length !== expected.length) {
    fail(label + " row count does not match analysis.paths periods");
  }
  for (let index = 0; index < records.length; index += 1) {
    const row = records[index];
    const { pathEntry, period, periodIndex } = expected[index];
    const values = [
      pathEntry.group.canonical,
      pathEntry.group.display,
      period.index,
      period.time.canonical,
      period.time.display,
      canonicalJson(period.timeValue),
      period.nRows,
      period.nParticipantPeriods,
      period.nParticipantPeriods,
      null,
      period.nUsed,
      period.nCohortExcluded,
      period.nDuplicateRows,
      null,
      ...(period.selectedCentroid ?? manifest.selectedDimensions.map(() => null)),
      ...(period.selected3d.delta ?? manifest.selectedDimensions.map(() => null)),
      ...(period.fullCentroid ?? manifest.fullRotationDimensions.map(() => null)),
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
    if (values.length !== columns.length) fail(label + " internal V12 path column mismatch");
    for (let column = 0; column < values.length; column += 1) {
      // Complete-cohort and cross-period contributor counts are intentionally
      // not derivable after participant rows have been redacted. They remain
      // numeric-only; every other cell is bound to the aggregate envelope.
      if (column === 9 || column === 13) {
        if (column === 13 && periodIndex === 0) {
          if (row[column] !== "") fail(label + " first-row contributor overlap must be empty");
        } else if (!/^(?:0|[1-9][0-9]*)$/u.test(row[column])) {
          fail(label + " row " + (index + 2) + " has a non-integer private count field");
        }
      } else {
        expectCsvScalar(
          row[column],
          values[column],
          label + " row " + (index + 2) + " column " + columns[column],
        );
      }
    }
  }
  return records;
}

function validateTrajectoryMetadataCsv(bytes, analysis, label) {
  const records = validateCanonicalCsvHeader(
    bytes,
    ["section", "key", "value"],
    label,
  );
  const expected = [
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
  for (const pathEntry of analysis.paths) {
    expected.push([
      "time-contract",
      pathEntry.group.canonical,
      canonicalJson(pathEntry.dynamics.timeContract),
    ]);
    expected.push([
      "cohort-complete-count",
      pathEntry.group.canonical,
      Symbol.for("aggregate-redacted-count"),
    ]);
  }
  for (const diagnostic of analysis.diagnostics) {
    expected.push([
      "diagnostic:" + diagnostic.severity,
      diagnostic.code,
      canonicalJson(diagnostic),
    ]);
  }
  if (records.length !== expected.length) {
    fail(label + " row count does not match the exact V12 metadata contract");
  }
  records.forEach((row, index) => {
    const expectedRow = expected[index];
    for (let column = 0; column < 3; column += 1) {
      if (typeof expectedRow[column] === "symbol") {
        if (!/^(?:0|[1-9][0-9]*)$/u.test(row[column])) {
          fail(label + " cohort-complete-count must be a non-negative integer");
        }
      } else {
        expectCsvScalar(
          row[column],
          expectedRow[column],
          label + " row " + (index + 2) + " column " + column,
        );
      }
    }
  });
  return records;
}

function parseTypedCanonicalKey(value, expectedNames, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(label + " must be a non-empty canonical typed tuple");
  }
  let tuple;
  try {
    tuple = parseStrictJson(Buffer.from(value, "utf8"), label + " typed tuple");
  } catch (error) {
    fail(label + " must be a canonical typed tuple: " + error.message);
  }
  if (!Array.isArray(tuple) || tuple.length !== expectedNames.length) {
    fail(label + " typed tuple component count does not match the run specification");
  }
  const values = [];
  tuple.forEach((component, index) => {
    const path = label + " typed tuple[" + index + "]";
    if (!Array.isArray(component) || component.length !== 4) {
      fail(path + " must contain [name, declaredType, scalarType, token]");
    }
    const [name, declaredType, scalarType, token] = component;
    expectLiteral(name, expectedNames[index], path + " name");
    expectString(declaredType, path + " declaredType", { nonEmpty: true });
    expectString(token, path + " token");
    if (scalarType === "string") {
      values.push(token);
    } else if (scalarType === "boolean") {
      if (token !== "true" && token !== "false") {
        fail(path + " boolean token must be true or false");
      }
      values.push(token === "true");
    } else if (scalarType === "number") {
      if (
        !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/iu.test(token)
        || !Number.isFinite(Number(token))
        || (token !== "-0" && String(Number(token)) !== token)
      ) {
        fail(path + " number token is not the canonical finite JavaScript scalar");
      }
      values.push(Number(token));
    } else {
      fail(path + " scalarType must be string, number, or boolean");
    }
  });
  if (JSON.stringify(tuple) !== value) {
    fail(label + " must use the canonical compact typed tuple encoding");
  }
  return values;
}

function parseCanonicalCsvNumber(value, label, options = {}) {
  if (
    !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/iu.test(value)
    || !Number.isFinite(Number(value))
    || (value !== "-0" && String(Number(value)) !== value)
  ) {
    fail(label + " must be a canonical finite number");
  }
  const number = Number(value);
  if (options.strictlyPositive && !(number > 0)) {
    fail(label + " must be strictly positive");
  }
  return number;
}

function assertCsvFormulaNeutralized(value, label) {
  if (/^(?:[\t\r\n]|\s*[=+\-@])/u.test(value)) {
    fail(label + " is not spreadsheet-formula neutralized");
  }
}

function validateParticipantCsv(bytes, analysis, manifest, label) {
  const columns = [
    "group_key_v1",
    "participant_key_v1",
    "participant_display",
    "time_key_v1",
    "time_display",
    "included",
    "source_row_count",
    ...manifest.selectedDimensions.map((dimension) => "selected:" + dimension),
    ...manifest.fullRotationDimensions.map((dimension) => "full:" + dimension),
    "participant_weight",
  ];
  const records = validateCanonicalCsvHeader(bytes, columns, label);
  if (records.length === 0) fail(label + " must contain participant history rows");
  const groupMap = new Map(analysis.paths.map((pathEntry) => [
    pathEntry.group.canonical,
    pathEntry,
  ]));
  const participantNames = analysis.runSpec.participantColumns;
  const groupNames = [analysis.runSpec.groupColumn];
  const timeNames = [analysis.runSpec.timeColumn];
  const seenRows = new Set();
  const participantDisplays = new Map();
  return records.map((record, rowIndex) => {
    const path = label + " row " + (rowIndex + 2);
    if (record.length !== columns.length) fail(path + " has a non-canonical column count");
    for (let index = 0; index < 5; index += 1) {
      assertCsvFormulaNeutralized(record[index], path + " column " + columns[index]);
    }
    parseTypedCanonicalKey(record[0], groupNames, path + " group_key_v1");
    const participantValues = parseTypedCanonicalKey(
      record[1],
      participantNames,
      path + " participant_key_v1",
    );
    parseTypedCanonicalKey(record[3], timeNames, path + " time_key_v1");
    const pathEntry = groupMap.get(record[0]);
    if (!pathEntry) fail(path + " participant group_key_v1 is unknown to aggregate paths");
    const period = pathEntry.dynamics.periods.find(
      (candidate) => candidate.time.canonical === record[3],
    );
    if (!period) fail(path + " participant time_key_v1 is unknown to its aggregate group");
    expectCsvScalar(record[4], period.time.display, path + " time_display");
    const expectedParticipantDisplay = participantValues.map(String).join(" · ");
    expectCsvScalar(
      record[2],
      expectedParticipantDisplay,
      path + " participant_display",
    );
    const displayKey = record[0] + "\0" + record[1];
    const previousDisplay = participantDisplays.get(displayKey);
    if (previousDisplay !== undefined && previousDisplay !== record[2]) {
      fail(path + " participant_display is inconsistent across participant history rows");
    }
    participantDisplays.set(displayKey, record[2]);
    if (record[5] !== "true" && record[5] !== "false") {
      fail(path + " included must be the canonical boolean true or false");
    }
    if (!/^[1-9][0-9]*$/u.test(record[6]) || !Number.isSafeInteger(Number(record[6]))) {
      fail(path + " source_row_count must be a positive safe integer");
    }
    const selectedStart = 7;
    const fullStart = selectedStart + manifest.selectedDimensions.length;
    const weightIndex = fullStart + manifest.fullRotationDimensions.length;
    const selectedCoordinates = record.slice(selectedStart, fullStart).map(
      (value, index) => parseCanonicalCsvNumber(
        value,
        path + " selected coordinate " + manifest.selectedDimensions[index],
      ),
    );
    const fullCoordinates = record.slice(fullStart, weightIndex).map(
      (value, index) => parseCanonicalCsvNumber(
        value,
        path + " full coordinate " + manifest.fullRotationDimensions[index],
      ),
    );
    const selectedFromFull = manifest.selectedDimensions.map((dimension) => {
      const fullIndex = manifest.fullRotationDimensions.indexOf(dimension);
      if (fullIndex < 0) {
        fail(path + " selected dimension " + dimension + " is absent from full rotation");
      }
      return fullCoordinates[fullIndex];
    });
    if (!isDeepStrictEqual(selectedCoordinates, selectedFromFull)) {
      fail(path + " selected coordinates do not equal the selected slice of full coordinates");
    }
    const participantWeight = parseCanonicalCsvNumber(
      record[weightIndex],
      path + " participant_weight",
      { strictlyPositive: true },
    );
    const rowKey = record[0] + "\0" + record[1] + "\0" + record[3];
    if (seenRows.has(rowKey)) fail(path + " duplicates a participant/group/time history row");
    seenRows.add(rowKey);
    return {
      groupCanonical: record[0],
      included: record[5] === "true",
      participantCanonical: record[1],
      participantDisplay: record[2],
      participantWeight,
      selectedCoordinates,
      fullCoordinates,
      sourceRowCount: Number(record[6]),
      timeCanonical: record[3],
      timeDisplay: record[4],
    };
  });
}

function expectDerivedCsvInteger(actual, expected, label, nullable = false) {
  if (nullable && expected === null) {
    if (actual !== "") fail(label + " must be empty for the first period");
    return;
  }
  if (actual !== String(expected)) {
    fail(label + " does not match the value derived from participant histories");
  }
}

function expectExactFiniteNumber(actual, expected, label) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || actual !== expected) {
    fail(label + " does not match the value derived from participant histories");
  }
}

function validateParticipantHistoryBindings(rows, aggregate, label) {
  const { analysis, manifest, pathRecords, metadataRecords } = aggregate;
  if (analysis.runSpec.estimand.kind === "equal-participant") {
    for (const row of rows) {
      if (row.participantWeight !== 1) {
        fail(label + " equal-participant estimand requires unit participant weights");
      }
    }
  }
  const columns = longitudinalPathColumns(
    manifest.selectedDimensions,
    manifest.fullRotationDimensions,
  );
  const column = new Map(columns.map((name, index) => [name, index]));
  let recordIndex = 0;
  for (const pathEntry of analysis.paths) {
    const groupRows = rows.filter(
      (row) => row.groupCanonical === pathEntry.group.canonical,
    );
    if (groupRows.length === 0) {
      fail(label + " has no participant histories for aggregate group " + pathEntry.group.canonical);
    }
    const participantPeriods = new Map();
    for (const row of groupRows) {
      const periods = participantPeriods.get(row.participantCanonical) ?? new Set();
      periods.add(row.timeCanonical);
      participantPeriods.set(row.participantCanonical, periods);
    }
    const expectedPeriods = new Set(
      pathEntry.dynamics.periods.map((period) => period.time.canonical),
    );
    const participantIsComplete = new Map(
      [...participantPeriods.entries()].map(([participant, periods]) => [
        participant,
        [...expectedPeriods].every((period) => periods.has(period)),
      ]),
    );
    for (const row of groupRows) {
      const expectedIncluded = analysis.runSpec.cohortPolicy === "available"
        ? true
        : participantIsComplete.get(row.participantCanonical) === true;
      if (row.included !== expectedIncluded) {
        fail(
          label + " " + analysis.runSpec.cohortPolicy
          + " cohort included flag does not match available analytical participant-periods",
        );
      }
    }
    const complete = [...participantPeriods.values()].filter((periods) => (
      [...expectedPeriods].every((period) => periods.has(period))
    )).length;
    const metadataCompleteRows = metadataRecords.filter((record) => (
      record[0] === "cohort-complete-count"
      && record[1] === pathEntry.group.canonical
    ));
    if (metadataCompleteRows.length !== 1) {
      fail(label + " metadata must contain exactly one derived cohort-complete-count per group");
    }
    expectDerivedCsvInteger(
      metadataCompleteRows[0][2],
      complete,
      label + " metadata complete count",
    );
    let previousIncluded = null;
    for (const period of pathEntry.dynamics.periods) {
      const record = pathRecords[recordIndex];
      recordIndex += 1;
      const periodRows = groupRows.filter(
        (row) => row.timeCanonical === period.time.canonical,
      );
      const includedRows = periodRows.filter((row) => row.included);
      const includedSet = new Set(includedRows.map((row) => row.participantCanonical));
      const sourceRows = periodRows.reduce((sum, row) => sum + row.sourceRowCount, 0);
      const duplicates = sourceRows - periodRows.length;
      const excluded = periodRows.length - includedRows.length;
      const overlap = previousIncluded === null
        ? null
        : [...includedSet].filter((participant) => previousIncluded.has(participant)).length;
      const derivedCells = [
        ["rows", sourceRows],
        ["participant_periods", periodRows.length],
        ["available", periodRows.length],
        ["complete", complete],
        ["included", includedRows.length],
        ["excluded", excluded],
        ["duplicate_rows", duplicates],
        ["contributor_overlap_previous", overlap],
      ];
      for (const [name, expected] of derivedCells) {
        expectDerivedCsvInteger(
          record[column.get(name)],
          expected,
          label + " trajectory-path.csv " + name,
          name === "contributor_overlap_previous",
        );
      }
      for (const [field, expected] of [
        ["nRows", sourceRows],
        ["nParticipantPeriods", periodRows.length],
        ["nUsed", includedRows.length],
        ["nCohortExcluded", excluded],
        ["nDuplicateRows", duplicates],
      ]) {
        if (period[field] !== expected) {
          fail(
            label + " aggregate analysis period." + field
            + " does not match participant histories",
          );
        }
      }
      const weightSum = includedRows.reduce((sum, row) => sum + row.participantWeight, 0);
      const weightSquareSum = includedRows.reduce(
        (sum, row) => sum + row.participantWeight * row.participantWeight,
        0,
      );
      const effectiveParticipantN = weightSum * weightSum / weightSquareSum;
      expectExactFiniteNumber(period.weightSum, weightSum, label + " aggregate weightSum");
      expectExactFiniteNumber(
        period.effectiveParticipantN,
        effectiveParticipantN,
        label + " aggregate effectiveParticipantN",
      );
      const fullCentroid = manifest.fullRotationDimensions.map((_, dimensionIndex) => (
        includedRows.reduce(
          (sum, row) => (
            sum + row.fullCoordinates[dimensionIndex] * row.participantWeight
          ),
          0,
        ) / weightSum
      ));
      const selectedCentroid = manifest.selectedDimensions.map((dimension) => (
        fullCentroid[manifest.fullRotationDimensions.indexOf(dimension)]
      ));
      if (
        !isDeepStrictEqual(period.fullCentroid, fullCentroid)
        || !isDeepStrictEqual(period.selectedCentroid, selectedCentroid)
      ) {
        fail(label + " aggregate centroid coordinates do not match participant histories");
      }
      previousIncluded = includedSet;
    }
    const summary = pathEntry.dynamics.summary;
    const expectedSummary = {
      inputRows: groupRows.reduce((sum, row) => sum + row.sourceRowCount, 0),
      participants: new Set(groupRows.map((row) => row.participantCanonical)).size,
      participantPeriods: groupRows.length,
      periods: pathEntry.dynamics.periods.length,
      observedPeriods: pathEntry.dynamics.periods.filter((period) => (
        groupRows.some((row) => row.timeCanonical === period.time.canonical)
      )).length,
      missingPeriods: pathEntry.dynamics.periods.filter((period) => (
        !groupRows.some((row) => row.timeCanonical === period.time.canonical)
      )).length,
      duplicateRows: groupRows.reduce((sum, row) => sum + row.sourceRowCount - 1, 0),
      cohortExcludedParticipants: new Set(
        groupRows.filter((row) => !row.included).map((row) => row.participantCanonical),
      ).size,
    };
    for (const [field, expected] of Object.entries(expectedSummary)) {
      if (summary[field] !== expected) {
        fail(label + " aggregate summary." + field + " does not match participant histories");
      }
    }
  }
  if (recordIndex !== pathRecords.length) {
    fail(label + " aggregate path row count does not match participant-bound periods");
  }
}

function inferenceCsvRows(analysis) {
  const rows = [];
  for (const inference of analysis.inference) {
    if (inference.rows.length === 0) {
      rows.push([
        inference.request.kind,
        inference.status,
        inference.reason,
        inference.familyId,
        inference.familySize,
        null, null, null, null, null, null, null, null, null,
        canonicalJson(inference.request),
      ]);
      continue;
    }
    for (const row of inference.rows) {
      rows.push([
        inference.request.kind,
        inference.status,
        inference.reason,
        String(row.familyId ?? inference.familyId),
        Number(row.familySize ?? inference.familySize),
        String(row.memberId ?? ""),
        String(row.test ?? ""),
        String(row.design ?? ""),
        String(row.estimand ?? ""),
        typeof row.n === "number"
          ? row.n
          : typeof row.nPrimary === "number" && typeof row.nSecondary === "number"
            ? row.nPrimary + "/" + row.nSecondary
            : null,
        typeof row.effect === "number" ? row.effect : null,
        typeof row.statistic === "number" ? row.statistic : null,
        typeof row.pRaw === "number" ? row.pRaw : null,
        typeof row.pHolm === "number" ? row.pHolm : null,
        canonicalJson(row),
      ]);
    }
  }
  for (const comparison of analysis.pathComparisons) {
    for (const entry of comparison.result.tests) {
      rows.push([
        "path-comparison",
        "available",
        null,
        "path-comparison:" + comparison.groups.join(":"),
        comparison.result.tests.length,
        entry.id,
        "permutation",
        comparison.design,
        analysis.runSpec.estimand.kind,
        null,
        entry.observed,
        entry.observed,
        entry.pValue,
        entry.holmAdjustedPValue,
        canonicalJson({
          groups: comparison.groups,
          seed: comparison.seed,
          planHash: comparison.planHash,
          test: entry,
        }),
      ]);
    }
  }
  return rows;
}

function validateTrajectoryInferenceCsv(bytes, analysis, label) {
  const columns = [
    "request_kind", "status", "reason", "family_id", "family_size",
    "member_id", "test", "design", "estimand", "n", "effect",
    "statistic", "p_raw", "p_holm", "audit_json",
  ];
  const records = validateCanonicalCsvHeader(bytes, columns, label);
  const expected = inferenceCsvRows(analysis);
  if (records.length !== expected.length) {
    fail(label + " row count does not match analysis inference/pathComparisons");
  }
  records.forEach((row, index) => {
    expected[index].forEach((value, column) => {
      expectCsvScalar(
        row[column],
        value,
        label + " row " + (index + 2) + " column " + columns[column],
      );
    });
    if (row[14] !== "") {
      parseStrictJson(Buffer.from(row[14], "utf8"), label + " row audit_json");
    }
  });
}

function longitudinalPathColumns(selectedDimensions, fullRotationDimensions) {
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
    ...selectedDimensions.map((dimension) => "selected:" + dimension),
    ...selectedDimensions.map((dimension) => "delta:" + dimension),
    ...fullRotationDimensions.map((dimension) => "full:" + dimension),
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

function expectCoordinateArray(value, expected, label) {
  const observed = expectArray(value, label);
  if (observed.length !== expected.length) {
    fail(label + " coordinate length does not match the aggregate analysis");
  }
  for (let index = 0; index < expected.length; index += 1) {
    const candidate = observed[index];
    if (candidate === null && expected[index] === null) continue;
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
      fail(label + " must contain only finite numeric/null coordinates");
    }
    if (candidate !== expected[index]) {
      fail(label + " geometry does not match the aggregate analysis");
    }
  }
}

function validatePlotlySpec(
  plotly,
  analysis,
  manifest,
  participantLevelIncluded,
  participantRows,
  label,
) {
  exactKeys(
    plotly,
    ["schemaVersion", "resultHash", "data", "layout", "config"],
    label,
  );
  expectLiteral(plotly.schemaVersion, "3dena.trajectory-plotly-spec.v2", label + ".schemaVersion");
  expectLiteral(plotly.resultHash, manifest.resultHash, label + ".resultHash");
  const traces = expectArray(plotly.data, label + ".data");
  const allowedRoles = new Set([
    "axis-shaft",
    "axis-arrowhead",
    "trajectory-path",
    "centroid",
    "direction-arrow",
    "network-node",
    ...(participantLevelIncluded ? ["participant", "individual-path"] : []),
  ]);
  const roleCounts = new Map();
  const groupMap = new Map(analysis.paths.map((pathEntry) => [
    pathEntry.group.canonical,
    pathEntry,
  ]));
  const directionIndexes = new Map();
  const participantGroups = new Set();
  const individualPaths = new Set();
  const axisColors = ["#dc2626", "#2563eb", "#16a34a"];
  const groupColors = ["#2563eb", "#b45309"];
  for (let index = 0; index < traces.length; index += 1) {
    const trace = expectObject(traces[index], label + ".data[" + index + "]");
    const meta = expectObject(trace.meta, label + ".data[" + index + "].meta");
    const role = expectString(meta.role, label + ".data[" + index + "].meta.role", {
      nonEmpty: true,
    });
    if (!allowedRoles.has(role)) {
      fail(label + " Plotly role " + role + " is outside the strict privacy allowlist");
    }
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    const metaKeys = ["role", "resultHash"];
    if (["axis-shaft", "axis-arrowhead"].includes(role)) metaKeys.push("axis");
    if (["trajectory-path", "centroid", "direction-arrow", "participant", "individual-path"].includes(role)) {
      metaKeys.push("groupCanonical");
    }
    if (role === "individual-path") metaKeys.push("participantCanonical");
    exactKeys(meta, metaKeys, label + ".data[" + index + "].meta");
    expectLiteral(meta.resultHash, manifest.resultHash, label + ".data[" + index + "].meta.resultHash");

    if (role === "axis-shaft") {
      exactKeys(
        trace,
        ["type", "mode", "name", "x", "y", "z", "text", "line", "showlegend", "hoverinfo", "meta"],
        label + " axis-shaft trace",
      );
      expectLiteral(trace.type, "scatter3d", label + " axis-shaft type");
      expectLiteral(trace.mode, "lines+text", label + " axis-shaft mode");
      const axisIndex = manifest.selectedDimensions.indexOf(meta.axis);
      if (axisIndex < 0) {
        fail(label + " axis-shaft references an unknown selected dimension");
      }
      expectLiteral(trace.name, meta.axis + " axis", label + " axis-shaft public name");
      expectDeep(trace.text, ["", meta.axis], label + " axis-shaft text", "must label only its public dimension");
      exactKeys(trace.line, ["color", "width"], label + " axis-shaft line");
      expectLiteral(trace.line.color, axisColors[axisIndex], label + " axis-shaft line.color");
      expectLiteral(trace.line.width, 5, label + " axis-shaft line.width");
      expectBoolean(trace.showlegend, false, label + " axis-shaft showlegend");
      expectLiteral(trace.hoverinfo, "skip", label + " axis-shaft hoverinfo");
      const end = [0, 0, 0];
      end[axisIndex] = 20;
      expectCoordinateArray(trace.x, [0, end[0]], label + " axis-shaft x");
      expectCoordinateArray(trace.y, [0, end[1]], label + " axis-shaft y");
      expectCoordinateArray(trace.z, [0, end[2]], label + " axis-shaft z");
    } else if (role === "axis-arrowhead") {
      exactKeys(
        trace,
        ["type", "x", "y", "z", "u", "v", "w", "anchor", "sizemode", "sizeref", "colorscale", "showscale", "showlegend", "hoverinfo", "meta"],
        label + " axis-arrowhead trace",
      );
      expectLiteral(trace.type, "cone", label + " axis-arrowhead type");
      const axisIndex = manifest.selectedDimensions.indexOf(meta.axis);
      if (axisIndex < 0) {
        fail(label + " axis-arrowhead references an unknown selected dimension");
      }
      const end = [0, 0, 0];
      end[axisIndex] = 20;
      const direction = [0, 0, 0];
      direction[axisIndex] = 1;
      expectCoordinateArray(trace.x, [end[0]], label + " axis-arrowhead x");
      expectCoordinateArray(trace.y, [end[1]], label + " axis-arrowhead y");
      expectCoordinateArray(trace.z, [end[2]], label + " axis-arrowhead z");
      expectCoordinateArray(trace.u, [direction[0]], label + " axis-arrowhead u");
      expectCoordinateArray(trace.v, [direction[1]], label + " axis-arrowhead v");
      expectCoordinateArray(trace.w, [direction[2]], label + " axis-arrowhead w");
      expectLiteral(trace.anchor, "tip", label + " axis-arrowhead anchor");
      expectLiteral(trace.sizemode, "absolute", label + " axis-arrowhead sizemode");
      expectLiteral(trace.sizeref, 1.6, label + " axis-arrowhead sizeref");
      expectDeep(
        trace.colorscale,
        [[0, axisColors[axisIndex]], [1, axisColors[axisIndex]]],
        label + " axis-arrowhead colorscale",
        "must match its public dimension color",
      );
      expectBoolean(trace.showscale, false, label + " axis-arrowhead showscale");
      expectBoolean(trace.showlegend, false, label + " axis-arrowhead showlegend");
      expectLiteral(trace.hoverinfo, "skip", label + " axis-arrowhead hoverinfo");
    } else if (role === "trajectory-path") {
      exactKeys(
        trace,
        ["type", "mode", "name", "x", "y", "z", "connectgaps", "line", "text", "hovertemplate", "meta"],
        label + " trajectory-path trace",
      );
      const pathEntry = groupMap.get(meta.groupCanonical);
      if (!pathEntry) fail(label + " trajectory-path references an unknown aggregate group");
      expectLiteral(trace.type, "scatter3d", label + " trajectory-path type");
      expectLiteral(trace.mode, "lines", label + " trajectory-path line-only mode");
      expectLiteral(
        trace.name,
        pathEntry.group.display + " trajectory",
        label + " trajectory-path public name bound to group",
      );
      expectBoolean(trace.connectgaps, false, label + " trajectory-path connectgaps");
      exactKeys(trace.line, ["color", "width"], label + " trajectory-path line");
      expectLiteral(trace.line.color, "#000000", label + " trajectory-path black line color");
      expectLiteral(trace.line.width, 4, label + " trajectory-path line.width");
      const centroids = pathEntry.dynamics.periods.map((period) => period.selectedCentroid);
      expectCoordinateArray(trace.x, centroids.map((point) => point?.[0] ?? null), label + " trajectory-path x");
      expectCoordinateArray(trace.y, centroids.map((point) => point?.[1] ?? null), label + " trajectory-path y");
      expectCoordinateArray(trace.z, centroids.map((point) => point?.[2] ?? null), label + " trajectory-path z");
      expectDeep(
        trace.text,
        pathEntry.dynamics.periods.map((period) => period.time.display),
        label + " trajectory-path text",
        "must contain only aggregate period labels",
      );
      expectLiteral(trace.hovertemplate, "%{text}<extra></extra>", label + " trajectory-path hovertemplate");
    } else if (role === "centroid") {
      exactKeys(
        trace,
        ["type", "mode", "name", "x", "y", "z", "text", "customdata", "marker", "hovertemplate", "meta"],
        label + " centroid trace",
      );
      const pathEntry = groupMap.get(meta.groupCanonical);
      if (!pathEntry) fail(label + " centroid references an unknown aggregate group");
      const groupIndex = analysis.paths.indexOf(pathEntry);
      if (groupIndex >= groupColors.length) {
        fail(label + " centroid group color is outside the frozen public palette");
      }
      expectLiteral(trace.type, "scatter3d", label + " centroid type");
      expectLiteral(trace.mode, "markers+text", label + " centroid mode");
      expectLiteral(
        trace.name,
        pathEntry.group.display + " centroids",
        label + " centroid public name bound to group",
      );
      const centroids = pathEntry.dynamics.periods.map((period) => period.selectedCentroid);
      expectCoordinateArray(trace.x, centroids.map((point) => point?.[0] ?? null), label + " centroid x");
      expectCoordinateArray(trace.y, centroids.map((point) => point?.[1] ?? null), label + " centroid y");
      expectCoordinateArray(trace.z, centroids.map((point) => point?.[2] ?? null), label + " centroid z");
      expectDeep(trace.text, pathEntry.dynamics.periods.map((period) => period.time.display), label + " centroid text", "must contain only period labels");
      expectDeep(trace.customdata, pathEntry.dynamics.periods.map((period) => [period.nUsed]), label + " centroid customdata", "must contain only aggregate counts");
      exactKeys(trace.marker, ["color", "size", "symbol", "line"], label + " centroid marker");
      expectLiteral(trace.marker.color, groupColors[groupIndex], label + " centroid marker.color public palette");
      expectLiteral(trace.marker.size, 7, label + " centroid marker size seven");
      expectLiteral(trace.marker.symbol, "square", label + " centroid square marker");
      exactKeys(trace.marker.line, ["color", "width"], label + " centroid marker.line");
      expectLiteral(trace.marker.line.color, "#ffffff", label + " centroid marker.line.color");
      expectLiteral(trace.marker.line.width, 1.5, label + " centroid marker.line.width");
      expectLiteral(trace.hovertemplate, "%{text}<br>n=%{customdata[0]}<extra></extra>", label + " centroid hovertemplate");
    } else if (role === "direction-arrow") {
      exactKeys(
        trace,
        ["type", "x", "y", "z", "u", "v", "w", "anchor", "sizemode", "sizeref", "colorscale", "showscale", "showlegend", "hoverinfo", "meta"],
        label + " direction-arrow trace",
      );
      const pathEntry = groupMap.get(meta.groupCanonical);
      if (!pathEntry) fail(label + " direction-arrow references an unknown aggregate group");
      const transitionIndex = (directionIndexes.get(meta.groupCanonical) ?? 0) + 1;
      directionIndexes.set(meta.groupCanonical, transitionIndex);
      if (transitionIndex >= pathEntry.dynamics.periods.length) {
        fail(label + " has too many direction-arrow traces for the aggregate path");
      }
      const previous = pathEntry.dynamics.periods[transitionIndex - 1].selectedCentroid;
      const current = pathEntry.dynamics.periods[transitionIndex].selectedCentroid;
      if (previous === null || current === null) {
        fail(label + " direction-arrow cannot bridge a missing aggregate centroid");
      }
      const midpoint = current.map((value, axis) => previous[axis] + (value - previous[axis]) * 0.5);
      const delta = current.map((value, axis) => value - previous[axis]);
      expectCoordinateArray(trace.x, [midpoint[0]], label + " direction-arrow midpoint x");
      expectCoordinateArray(trace.y, [midpoint[1]], label + " direction-arrow midpoint y");
      expectCoordinateArray(trace.z, [midpoint[2]], label + " direction-arrow midpoint z");
      expectCoordinateArray(trace.u, [delta[0]], label + " direction-arrow delta u");
      expectCoordinateArray(trace.v, [delta[1]], label + " direction-arrow delta v");
      expectCoordinateArray(trace.w, [delta[2]], label + " direction-arrow delta w");
      expectLiteral(trace.type, "cone", label + " direction-arrow type");
      expectLiteral(trace.anchor, "tip", label + " direction-arrow anchor");
      expectLiteral(trace.sizemode, "absolute", label + " direction-arrow sizemode");
      expectLiteral(trace.sizeref, 1, label + " direction-arrow sizeref");
      expectDeep(trace.colorscale, [[0, "#000000"], [1, "#000000"]], label + " direction-arrow colorscale", "must be black");
      expectBoolean(trace.showscale, false, label + " direction-arrow showscale");
      expectBoolean(trace.showlegend, false, label + " direction-arrow showlegend");
      expectLiteral(trace.hoverinfo, "skip", label + " direction-arrow hoverinfo");
    } else if (role === "network-node") {
      exactKeys(
        trace,
        ["type", "mode", "name", "x", "y", "z", "text", "textposition", "textfont", "marker", "meta"],
        label + " network-node trace",
      );
      expectLiteral(trace.type, "scatter3d", label + " network-node type");
      expectLiteral(trace.mode, "markers+text", label + " network-node mode");
      expectLiteral(trace.name, "ENA codes", label + " network-node public name");
      expectDeep(trace.text, analysis.codeGeometry.nodes.map((node) => node.code), label + " network-node labels", "must bind codeGeometry");
      expectCoordinateArray(trace.x, analysis.codeGeometry.nodes.map((node) => node.coordinates[0]), label + " network-node x");
      expectCoordinateArray(trace.y, analysis.codeGeometry.nodes.map((node) => node.coordinates[1]), label + " network-node y");
      expectCoordinateArray(trace.z, analysis.codeGeometry.nodes.map((node) => node.coordinates[2]), label + " network-node z");
      expectLiteral(trace.textposition, "top center", label + " network-node textposition");
      exactKeys(trace.textfont, ["color", "size"], label + " network-node textfont");
      expectLiteral(trace.textfont.color, "#0f172a", label + " network-node textfont.color");
      expectLiteral(trace.textfont.size, 13, label + " network-node textfont.size");
      exactKeys(trace.marker, ["size", "symbol", "color", "line"], label + " network-node marker");
      expectLiteral(trace.marker.size, 7, label + " network-node marker.size");
      expectLiteral(trace.marker.symbol, "circle-open", label + " network-node marker.symbol");
      expectLiteral(trace.marker.color, "#ffffff", label + " network-node marker.color");
      exactKeys(trace.marker.line, ["color", "width"], label + " network-node marker.line");
      expectLiteral(trace.marker.line.color, "#0f172a", label + " network-node marker.line.color");
      expectLiteral(trace.marker.line.width, 2, label + " network-node marker.line.width");
    } else if (role === "participant") {
      exactKeys(
        trace,
        ["type", "mode", "name", "x", "y", "z", "text", "customdata", "hovertemplate", "marker", "meta"],
        label + " participant trace",
      );
      if (!participantLevelIncluded) fail(label + " aggregate Plotly leaked a participant trace");
      const pathEntry = groupMap.get(meta.groupCanonical);
      if (!pathEntry) fail(label + " participant trace has unknown group");
      if (!participantRows) fail(label + " participant Plotly lacks canonical CSV histories");
      if (participantGroups.has(meta.groupCanonical)) {
        fail(label + " participant trace count duplicates an aggregate group");
      }
      participantGroups.add(meta.groupCanonical);
      const groupIndex = analysis.paths.indexOf(pathEntry);
      if (groupIndex >= groupColors.length) {
        fail(label + " participant trace group color is outside the frozen public palette");
      }
      const groupRows = participantRows.filter((row) => (
        row.groupCanonical === meta.groupCanonical && row.included
      ));
      expectLiteral(trace.type, "scatter3d", label + " participant type");
      expectLiteral(trace.mode, "markers", label + " participant mode");
      expectLiteral(
        trace.name,
        pathEntry.group.display + " participant-periods",
        label + " participant trace name bound to public group",
      );
      expectCoordinateArray(
        trace.x,
        groupRows.map((row) => row.selectedCoordinates[0]),
        label + " participant trace coordinates x bound to histories",
      );
      expectCoordinateArray(
        trace.y,
        groupRows.map((row) => row.selectedCoordinates[1]),
        label + " participant trace coordinates y bound to histories",
      );
      expectCoordinateArray(
        trace.z,
        groupRows.map((row) => row.selectedCoordinates[2]),
        label + " participant trace coordinates z bound to histories",
      );
      expectDeep(
        trace.text,
        groupRows.map((row) => row.participantDisplay),
        label + " participant trace text",
        "must bind canonical participant history displays in CSV order",
      );
      expectDeep(
        trace.customdata,
        groupRows.map((row) => [row.timeDisplay]),
        label + " participant trace customdata",
        "must bind canonical participant history periods in CSV order",
      );
      expectLiteral(
        trace.hovertemplate,
        "%{text}<br>%{customdata[0]}<extra></extra>",
        label + " participant hovertemplate",
      );
      exactKeys(trace.marker, ["color", "size", "opacity"], label + " participant marker");
      expectLiteral(trace.marker.color, groupColors[groupIndex], label + " participant marker.color");
      expectLiteral(trace.marker.size, 6, label + " participant marker.size");
      expectLiteral(trace.marker.opacity, 0.55, label + " participant marker.opacity");
    } else if (role === "individual-path") {
      exactKeys(
        trace,
        ["type", "mode", "name", "x", "y", "z", "connectgaps", "showlegend", "line", "marker", "meta"],
        label + " individual-path trace",
      );
      if (!participantLevelIncluded) fail(label + " aggregate Plotly leaked an individual-path trace");
      const pathEntry = groupMap.get(meta.groupCanonical);
      if (!pathEntry) fail(label + " individual-path trace has unknown group");
      if (!participantRows) fail(label + " individual-path Plotly lacks canonical CSV histories");
      parseTypedCanonicalKey(
        meta.participantCanonical,
        analysis.runSpec.participantColumns,
        label + " individual-path participantCanonical",
      );
      expectLiteral(trace.type, "scatter3d", label + " individual-path type");
      expectLiteral(trace.mode, "lines+markers", label + " individual-path mode");
      expectBoolean(trace.connectgaps, false, label + " individual-path connectgaps");
      expectBoolean(trace.showlegend, false, label + " individual-path showlegend");
      const pathKey = meta.groupCanonical + "\0" + meta.participantCanonical;
      if (individualPaths.has(pathKey)) {
        fail(label + " individual-path trace count duplicates a canonical history");
      }
      individualPaths.add(pathKey);
      const groupIndex = analysis.paths.indexOf(pathEntry);
      if (groupIndex >= groupColors.length) {
        fail(label + " individual-path group color is outside the frozen public palette");
      }
      const rows = participantRows.filter((row) => (
        row.groupCanonical === meta.groupCanonical
        && row.participantCanonical === meta.participantCanonical
        && row.included
      ));
      if (rows.length === 0) {
        fail(label + " individual-path trace has no canonical participant history");
      }
      expectLiteral(
        trace.name,
        rows[0].participantDisplay,
        label + " individual-path name bound to participant history",
      );
      expectCoordinateArray(
        trace.x,
        rows.map((row) => row.selectedCoordinates[0]),
        label + " individual-path coordinates/order x bound to history",
      );
      expectCoordinateArray(
        trace.y,
        rows.map((row) => row.selectedCoordinates[1]),
        label + " individual-path coordinates/order y bound to history",
      );
      expectCoordinateArray(
        trace.z,
        rows.map((row) => row.selectedCoordinates[2]),
        label + " individual-path coordinates/order z bound to history",
      );
      exactKeys(trace.line, ["color", "width"], label + " individual-path line");
      expectLiteral(trace.line.color, "#000000", label + " individual-path line.color");
      expectLiteral(trace.line.width, 1.4, label + " individual-path line.width");
      exactKeys(trace.marker, ["color", "size"], label + " individual-path marker");
      expectLiteral(trace.marker.color, groupColors[groupIndex], label + " individual-path marker.color");
      expectLiteral(trace.marker.size, 5, label + " individual-path marker.size");
    }
  }
  const expectedRoleCounts = new Map([
    ["axis-shaft", 3],
    ["axis-arrowhead", 3],
    ["trajectory-path", analysis.paths.length],
    ["centroid", analysis.paths.length],
    ["direction-arrow", analysis.paths.reduce(
      (sum, pathEntry) => sum + Math.max(0, pathEntry.dynamics.periods.length - 1),
      0,
    )],
    ["network-node", 1],
  ]);
  for (const [role, expected] of expectedRoleCounts) {
    if ((roleCounts.get(role) ?? 0) !== expected) {
      fail(label + " exact " + role + " trace count does not match the aggregate analysis");
    }
  }
  if (participantLevelIncluded && (roleCounts.get("participant") ?? 0) !== analysis.paths.length) {
    fail(label + " participant Plotly must contain one participant trace per aggregate group");
  }
  if (participantLevelIncluded) {
    const expectedIndividualPaths = new Set(participantRows.filter((row) => row.included).map(
      (row) => row.groupCanonical + "\0" + row.participantCanonical,
    ));
    if (
      (roleCounts.get("individual-path") ?? 0) !== expectedIndividualPaths.size
      || individualPaths.size !== expectedIndividualPaths.size
      || [...expectedIndividualPaths].some((key) => !individualPaths.has(key))
    ) {
      fail(label + " individual-path trace count does not match canonical participant histories");
    }
  }

  exactKeys(
    plotly.layout,
    ["autosize", "showlegend", "hovermode", "paper_bgcolor", "plot_bgcolor", "margin", "uirevision", "meta", "scene"],
    label + ".layout",
  );
  expectBoolean(plotly.layout.autosize, true, label + ".layout.autosize");
  expectBoolean(plotly.layout.showlegend, true, label + ".layout.showlegend");
  expectLiteral(plotly.layout.hovermode, "closest", label + ".layout.hovermode");
  expectLiteral(plotly.layout.paper_bgcolor, "rgba(0,0,0,0)", label + ".layout.paper_bgcolor");
  expectLiteral(plotly.layout.plot_bgcolor, "rgba(0,0,0,0)", label + ".layout.plot_bgcolor");
  expectDeep(
    plotly.layout.margin,
    { l: 56, r: 24, t: 32, b: 56 },
    label + ".layout.margin",
    "must match the frozen public layout",
  );
  expectLiteral(
    plotly.layout.uirevision,
    manifest.resultHash + ":3d",
    label + ".layout.uirevision public result binding",
  );
  exactKeys(plotly.layout.meta, ["scientificResultHash", "scientificTaskExecuted", "projection"], label + ".layout.meta");
  expectLiteral(plotly.layout.meta.scientificResultHash, manifest.resultHash, label + ".layout.meta.scientificResultHash");
  expectBoolean(plotly.layout.meta.scientificTaskExecuted, false, label + ".layout.meta.scientificTaskExecuted");
  expectLiteral(plotly.layout.meta.projection, "3d", label + ".layout.meta.projection");
  exactKeys(plotly.layout.scene, ["xaxis", "yaxis", "zaxis", "aspectmode", "uirevision"], label + ".layout.scene");
  expectLiteral(plotly.layout.scene.aspectmode, "data", label + ".layout.scene.aspectmode");
  expectLiteral(
    plotly.layout.scene.uirevision,
    JSON.stringify([
      "3dena.trajectory-camera-ui.v1",
      manifest.resultHash,
      "camera",
      null,
    ]),
    label + ".layout.scene.uirevision",
  );
  for (const [axis, dimension] of [["xaxis", "SVD1"], ["yaxis", "SVD2"], ["zaxis", "SVD3"]]) {
    exactKeys(plotly.layout.scene[axis], ["title", "zeroline", "showgrid"], label + ".layout.scene." + axis);
    expectLiteral(plotly.layout.scene[axis].title, dimension, label + ".layout.scene." + axis + ".title");
    expectBoolean(plotly.layout.scene[axis].zeroline, true, label + ".layout.scene." + axis + ".zeroline");
    expectBoolean(plotly.layout.scene[axis].showgrid, true, label + ".layout.scene." + axis + ".showgrid");
  }
  exactKeys(plotly.config, ["responsive", "displaylogo", "scrollZoom", "toImageButtonOptions"], label + ".config");
  expectBoolean(plotly.config.responsive, true, label + ".config.responsive");
  expectBoolean(plotly.config.displaylogo, false, label + ".config.displaylogo");
  expectBoolean(plotly.config.scrollZoom, true, label + ".config.scrollZoom");
  exactKeys(plotly.config.toImageButtonOptions, ["format", "filename"], label + ".config.toImageButtonOptions");
  expectLiteral(plotly.config.toImageButtonOptions.format, "png", label + ".config.toImageButtonOptions.format");
  expectLiteral(
    plotly.config.toImageButtonOptions.filename,
    "3dena-longitudinal-trajectory",
    label + ".config.toImageButtonOptions.filename public export name",
  );
  return { roleCounts, traceCount: traces.length };
}

function validateLongitudinalZipBundle(
  bytes,
  label,
  participantLevelIncluded,
  expectedResultHash,
) {
  const archive = parseZip32(bytes, label);
  const provenanceEntry = archive.get("provenance-manifest.json");
  if (!provenanceEntry) fail(label + " ZIP omitted provenance-manifest.json");
  const manifest = parseStrictJson(
    provenanceEntry.bytes,
    label + " provenance-manifest.json",
  );
  exactKeys(
    manifest,
    [
      "schemaVersion",
      "datasetHash",
      "specHash",
      "sourceResultHash",
      "resultHash",
      "runId",
      "jenaBuildId",
      "jena",
      "sdk",
      "executionTarget",
      "seed",
      "permutationPlanHashes",
      "resamplingPlanHashes",
      "evidenceStatus",
      "selectedDimensions",
      "fullRotationDimensions",
      "participantLevelIncluded",
      "privacyWarning",
      "members",
      "contentSetHash",
    ],
    label + " provenance manifest",
  );
  expectLiteral(
    manifest.schemaVersion,
    "3dena.longitudinal-provenance-manifest.v2",
    label + " provenance schemaVersion",
  );
  for (const field of ["datasetHash", "specHash", "sourceResultHash", "resultHash"]) {
    expectHex(manifest[field], HEX_64, label + " provenance." + field);
  }
  if (manifest.resultHash !== expectedResultHash) {
    fail(label + " bundle resultHash has result hash drift from browser analysis");
  }
  expectString(manifest.runId, label + " provenance.runId", { nonEmpty: true });
  expectLiteral(
    manifest.jenaBuildId,
    VENDORED_JENA_BUILD_ID,
    label + " provenance.jenaBuildId (must match the vendored build)",
  );
  exactKeys(manifest.jena, ["version", "commit", "tarballIntegrity"], label + " provenance.jena");
  expectLiteral(
    manifest.jena.version,
    VENDORED_JENA_VERSION,
    label + " provenance.jena.version (must match vendored jENA)",
  );
  expectLiteral(
    manifest.jena.commit,
    VENDORED_JENA_COMMIT,
    label + " provenance.jena.commit (must match vendored jENA)",
  );
  expectLiteral(
    manifest.jena.tarballIntegrity,
    VENDORED_JENA_TARBALL_INTEGRITY,
    label + " provenance.jena.tarballIntegrity (must match vendored jENA)",
  );
  exactKeys(manifest.sdk, ["version", "buildId"], label + " provenance.sdk");
  expectLiteral(
    manifest.sdk.version,
    VENDORED_SDK_VERSION,
    label + " provenance.sdk.version (must match the vendored SDK)",
  );
  expectLiteral(
    manifest.sdk.buildId,
    VENDORED_SDK_BUILD_ID,
    label + " provenance.sdk.buildId (must match the vendored SDK build)",
  );
  expectLiteral(
    manifest.executionTarget,
    "browser-worker",
    label + " provenance.executionTarget",
  );
  expectInteger(manifest.seed, label + " provenance.seed", { minimum: 0 });
  if (manifest.seed > 0xffffffff) fail(label + " provenance.seed exceeds uint32");
  validateHashArray(
    manifest.permutationPlanHashes,
    label + " provenance.permutationPlanHashes",
  );
  validateHashArray(
    manifest.resamplingPlanHashes,
    label + " provenance.resamplingPlanHashes",
  );
  expectLiteral(
    manifest.evidenceStatus,
    "IMPLEMENTED_UNVERIFIED",
    label + " provenance.evidenceStatus (must not self-promote scientific authority)",
  );
  expectDeep(
    manifest.selectedDimensions,
    ["SVD1", "SVD2", "SVD3"],
    label + " provenance.selectedDimensions",
    "must preserve SVD1/SVD2/SVD3",
  );
  const fullDimensions = expectArray(
    manifest.fullRotationDimensions,
    label + " provenance.fullRotationDimensions",
  );
  if (
    fullDimensions.length < 3
    || fullDimensions.some((dimension) => typeof dimension !== "string")
    || manifest.selectedDimensions.some((dimension) => !fullDimensions.includes(dimension))
  ) {
    fail(label + " provenance.fullRotationDimensions must include selected dimensions");
  }
  fullDimensions.forEach((dimension, index) => {
    if (dimension !== "SVD" + (index + 1)) {
      fail(label + " provenance.fullRotationDimensions must be ordered SVD dimensions");
    }
  });
  expectBoolean(
    manifest.participantLevelIncluded,
    participantLevelIncluded,
    label + " provenance.participantLevelIncluded",
  );
  if (participantLevelIncluded) {
    const warning = expectString(
      manifest.privacyWarning,
      label + " provenance.privacyWarning",
      { nonEmpty: true },
    );
    if (!/privacy|re-identification/iu.test(warning)) {
      fail(label + " participant bundle privacyWarning must state privacy risk");
    }
  } else {
    expectLiteral(manifest.privacyWarning, null, label + " provenance.privacyWarning");
  }

  const required = [
    "analysis.json",
    "trajectory-inference.csv",
    "trajectory-metadata.csv",
    "trajectory-path.csv",
    "plotly-spec.json",
  ];
  if (participantLevelIncluded) required.push("trajectory-participants.csv");
  required.sort((left, right) => left.localeCompare(right, "en"));
  const members = expectArray(manifest.members, label + " provenance.members");
  const declaresParticipantCsv = members.some(
    (member) => member && member.path === "trajectory-participants.csv",
  );
  if (participantLevelIncluded && !declaresParticipantCsv) {
    fail("participant ZIP omitted required trajectory-participants.csv participant CSV");
  }
  if (!participantLevelIncluded && declaresParticipantCsv) {
    fail("aggregate ZIP must not contain trajectory-participants.csv participant CSV");
  }
  if (members.length !== required.length) {
    fail(label + " ZIP required member set is incomplete or contains extras");
  }
  const memberMap = new Map();
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    const path = label + " provenance.members[" + index + "]";
    exactKeys(member, ["path", "mediaType", "byteLength", "sha256"], path);
    validateStrictRelativePath(member.path, path + ".path");
    if (memberMap.has(member.path)) fail(label + " provenance has duplicate member " + member.path);
    expectInteger(member.byteLength, path + ".byteLength", { minimum: 1 });
    expectHex(member.sha256, HEX_64, path + ".sha256");
    const expectedMediaType = member.path.endsWith(".json")
      ? "application/json"
      : "text/csv";
    expectLiteral(member.mediaType, expectedMediaType, path + ".mediaType");
    memberMap.set(member.path, member);
  }
  expectDeep(
    [...memberMap.keys()],
    required,
    label + " provenance.members",
    "must be the exact sorted longitudinal member set",
  );
  const archivePaths = [...archive.keys()].sort((left, right) => left.localeCompare(right, "en"));
  const expectedArchivePaths = [...required, "provenance-manifest.json"]
    .sort((left, right) => left.localeCompare(right, "en"));
  expectDeep(
    archivePaths,
    expectedArchivePaths,
    label + " ZIP archive entries",
    "must exactly match provenance members plus provenance-manifest.json",
  );
  for (const [path, member] of memberMap) {
    const entry = archive.get(path);
    if (!entry) fail(label + " ZIP omitted required member " + path);
    if (entry.bytes.length !== member.byteLength) {
      fail(label + " ZIP member receipt byteLength mismatch for " + path);
    }
    const digest = sha256(entry.bytes);
    if (!equalHex(digest, member.sha256)) {
      fail(label + " ZIP member " + path + " SHA-256 does not match its member receipt");
    }
  }
  expectHex(manifest.contentSetHash, HEX_64, label + " provenance.contentSetHash");
  const contentSetHash = hashCanonical(members);
  if (!equalHex(contentSetHash, manifest.contentSetHash)) {
    fail(label + " bundle provenance contentSetHash does not match canonical members");
  }

  const analysis = parseStrictJson(
    archive.get("analysis.json").bytes,
    label + " analysis.json",
  );
  exactKeys(analysis, AGGREGATE_ANALYSIS_KEYS, label + " analysis.json");
  expectLiteral(
    analysis.schemaVersion,
    "3dena.longitudinal-aggregate-export.v2",
    label + " analysis.schemaVersion",
  );
  expectLiteral(
    analysis.sourceEnvelopeSchemaVersion,
    "3dena.longitudinal-analysis-bundle.v2",
    label + " analysis.sourceEnvelopeSchemaVersion",
  );
  validateAggregateAgainstVendoredV12(analysis, label + " analysis source envelope");
  exactKeys(
    analysis.identity,
    [
      "datasetHash",
      "specHash",
      "sourceResultHash",
      "requestHash",
      "resultHash",
      "runId",
      "jenaBuildId",
    ],
    label + " analysis.identity",
  );
  for (const field of [
    "datasetHash",
    "specHash",
    "sourceResultHash",
    "resultHash",
    "runId",
    "jenaBuildId",
  ]) {
    if (analysis.identity[field] !== manifest[field]) {
      fail(label + " analysis.identity." + field + " does not match provenance manifest");
    }
  }
  expectHex(analysis.identity.requestHash, HEX_64, label + " analysis.identity.requestHash");
  expectObject(analysis.runSpec, label + " analysis.runSpec");
  if (analysis.runSpec.sourceResultHash !== analysis.identity.sourceResultHash) {
    fail(label + " analysis.runSpec.sourceResultHash must match analysis.identity");
  }
  expectObject(analysis.model, label + " analysis.model");
  expectDeep(
    analysis.model.selectedDimensions,
    manifest.selectedDimensions,
    label + " analysis.model.selectedDimensions",
    "must match provenance selected dimensions",
  );
  expectDeep(
    analysis.model.fullRotationDimensions,
    manifest.fullRotationDimensions,
    label + " analysis.model.fullRotationDimensions",
    "must match provenance full rotation dimensions",
  );
  for (const field of [
    "paths",
    "inference",
    "pathComparisons",
    "bootstrap",
    "networkOverlays",
    "diagnostics",
  ]) {
    expectArray(analysis[field], label + " analysis." + field);
  }
  validateAggregateRedactionPaths(analysis, label + " analysis");
  if (analysis.bootstrap.length !== 0) {
    fail(label + " analysis.bootstrap must be empty because bootstrapTasks is zero");
  }
  if (analysis.networkOverlays.length !== 0) {
    fail(
      label + " analysis.networkOverlays must be empty because networkOverlayTasks is zero",
    );
  }
  expectObject(analysis.codeGeometry, label + " analysis.codeGeometry");
  exactKeys(
    analysis.execution,
    [
      "target",
      "jenaVersion",
      "jenaCommit",
      "jenaTarballIntegrity",
      "sdkVersion",
      "buildId",
      "seed",
      "permutationPlanHashes",
      "resamplingPlanHashes",
      "evidenceStatus",
    ],
    label + " analysis.execution",
  );
  expectLiteral(
    analysis.execution.target,
    "browser-worker",
    label + " analysis.execution.target",
  );
  expectLiteral(
    analysis.execution.jenaVersion,
    VENDORED_JENA_VERSION,
    label + " analysis.execution.jenaVersion",
  );
  expectLiteral(
    analysis.execution.jenaCommit,
    VENDORED_JENA_COMMIT,
    label + " analysis.execution.jenaCommit",
  );
  expectLiteral(
    analysis.execution.jenaTarballIntegrity,
    VENDORED_JENA_TARBALL_INTEGRITY,
    label + " analysis.execution.jenaTarballIntegrity",
  );
  expectLiteral(
    analysis.execution.sdkVersion,
    VENDORED_SDK_VERSION,
    label + " analysis.execution.sdkVersion",
  );
  expectLiteral(
    analysis.execution.buildId,
    VENDORED_SDK_BUILD_ID,
    label + " analysis.execution.buildId",
  );
  expectInteger(analysis.execution.seed, label + " analysis.execution.seed", {
    minimum: 0,
  });
  if (analysis.execution.seed !== manifest.seed) {
    fail(label + " analysis.execution.seed must match provenance seed");
  }
  validateHashArray(
    analysis.execution.permutationPlanHashes,
    label + " analysis.execution.permutationPlanHashes",
  );
  validateHashArray(
    analysis.execution.resamplingPlanHashes,
    label + " analysis.execution.resamplingPlanHashes",
  );
  expectDeep(
    analysis.execution.permutationPlanHashes,
    manifest.permutationPlanHashes,
    label + " analysis.execution.permutationPlanHashes",
    "must match provenance",
  );
  expectDeep(
    analysis.execution.resamplingPlanHashes,
    manifest.resamplingPlanHashes,
    label + " analysis.execution.resamplingPlanHashes",
    "must match provenance",
  );
  expectLiteral(
    analysis.execution.evidenceStatus,
    "IMPLEMENTED_UNVERIFIED",
    label + " analysis.execution.evidenceStatus",
  );
  expectObject(analysis.privacy, label + " analysis.privacy");
  exactKeys(
    analysis.privacy,
    ["participantLevelIncluded", "omittedFields"],
    label + " analysis.privacy",
  );
  expectBoolean(
    analysis.privacy.participantLevelIncluded,
    false,
    label + " analysis.privacy.participantLevelIncluded",
  );
  expectDeep(
    analysis.privacy.omittedFields,
    AGGREGATE_OMITTED_FIELDS,
    label + " analysis.privacy.omittedFields",
    "must enumerate the exact participant-level redactions",
  );
  // Participant privacy is enforced by the pinned V12 exact schema above plus
  // the exporter-specific redaction paths. This is deliberately an allowlist,
  // not a participant-key blacklist that can be bypassed by new aliases.

  const pathRecords = validateTrajectoryPathCsv(
    archive.get("trajectory-path.csv").bytes,
    analysis,
    manifest,
    label + " trajectory-path.csv",
  );
  const metadataRecords = validateTrajectoryMetadataCsv(
    archive.get("trajectory-metadata.csv").bytes,
    analysis,
    label + " trajectory-metadata.csv",
  );
  validateTrajectoryInferenceCsv(
    archive.get("trajectory-inference.csv").bytes,
    analysis,
    label + " trajectory-inference.csv",
  );
  const participantRows = participantLevelIncluded
    ? validateParticipantCsv(
      archive.get("trajectory-participants.csv").bytes,
      analysis,
      manifest,
      label + " trajectory-participants.csv",
    )
    : null;
  const plotly = parseStrictJson(
    archive.get("plotly-spec.json").bytes,
    label + " plotly-spec.json",
  );
  const plotlyValidation = validatePlotlySpec(
    plotly,
    analysis,
    manifest,
    participantLevelIncluded,
    participantRows,
    label + " plotly-spec.json",
  );
  return {
    analysis,
    archive,
    manifest,
    metadataRecords,
    pathRecords,
    plotly,
    plotlyValidation,
  };
}

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function unfilterPngRows(inflated, rowBytes, height, bytesPerPixel, path) {
  const outputLength = rowBytes * height;
  if (!Number.isSafeInteger(outputLength) || outputLength > MAX_PNG_DECODED_BYTES) {
    fail(path + " PNG unfiltered raster exceeds the safety limit before allocation");
  }
  const output = Buffer.alloc(outputLength);
  for (let row = 0; row < height; row += 1) {
    const inputStart = row * (rowBytes + 1);
    const outputStart = row * rowBytes;
    const filterType = inflated[inputStart];
    if (filterType > 4) fail(path + " PNG scanline contains an invalid filter type");
    for (let column = 0; column < rowBytes; column += 1) {
      const encoded = inflated[inputStart + 1 + column];
      const left = column >= bytesPerPixel
        ? output[outputStart + column - bytesPerPixel]
        : 0;
      const above = row > 0 ? output[outputStart - rowBytes + column] : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel
        ? output[outputStart - rowBytes + column - bytesPerPixel]
        : 0;
      let predictor = 0;
      if (filterType === 1) predictor = left;
      else if (filterType === 2) predictor = above;
      else if (filterType === 3) predictor = Math.floor((left + above) / 2);
      else if (filterType === 4) predictor = paethPredictor(left, above, upperLeft);
      output[outputStart + column] = (encoded + predictor) & 0xff;
    }
  }
  return output;
}

function readPackedPngSample(row, bitDepth, sampleIndex) {
  if (bitDepth === 8) return row[sampleIndex];
  if (bitDepth === 16) return row.readUInt16BE(sampleIndex * 2);
  const samplesPerByte = 8 / bitDepth;
  const byte = row[Math.floor(sampleIndex / samplesPerByte)];
  const shift = 8 - bitDepth * ((sampleIndex % samplesPerByte) + 1);
  return (byte >>> shift) & ((1 << bitDepth) - 1);
}

function scalePngSample(sample, bitDepth) {
  if (bitDepth === 8) return sample;
  if (bitDepth === 16) return Math.round(sample / 257);
  return Math.round(sample * 255 / ((1 << bitDepth) - 1));
}

function normalizePngPixels(
  unfiltered,
  ihdr,
  rowBytes,
  channels,
  palette,
  transparency,
  path,
) {
  const pixels = ihdr.width * ihdr.height;
  const rgbaBytes = pixels * 4;
  if (!Number.isSafeInteger(rgbaBytes) || rgbaBytes > MAX_PNG_DECODED_BYTES) {
    fail(path + " PNG normalized RGBA raster exceeds the safety limit before allocation");
  }
  const normalized = Buffer.alloc(rgbaBytes);
  let visiblePixels = 0;
  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  let redSum = 0;
  let redSquareSum = 0;
  let greenSum = 0;
  let greenSquareSum = 0;
  let blueSum = 0;
  let blueSquareSum = 0;
  let pixelIndex = 0;
  for (let rowIndex = 0; rowIndex < ihdr.height; rowIndex += 1) {
    const row = unfiltered.subarray(rowIndex * rowBytes, (rowIndex + 1) * rowBytes);
    for (let column = 0; column < ihdr.width; column += 1) {
      const sampleOffset = column * channels;
      let red;
      let green;
      let blue;
      let alpha = 255;
      if (ihdr.colorType === 6 && ihdr.bitDepth === 8) {
        red = row[sampleOffset];
        green = row[sampleOffset + 1];
        blue = row[sampleOffset + 2];
        alpha = row[sampleOffset + 3];
      } else {
        const samples = Array.from({ length: channels }, (_, channel) => (
          readPackedPngSample(row, ihdr.bitDepth, sampleOffset + channel)
        ));
        if (ihdr.colorType === 0) {
        red = green = blue = scalePngSample(samples[0], ihdr.bitDepth);
        if (transparency && samples[0] === transparency.readUInt16BE(0)) alpha = 0;
        } else if (ihdr.colorType === 2) {
          [red, green, blue] = samples.map((sample) => scalePngSample(sample, ihdr.bitDepth));
          if (
            transparency
            && samples[0] === transparency.readUInt16BE(0)
            && samples[1] === transparency.readUInt16BE(2)
            && samples[2] === transparency.readUInt16BE(4)
          ) alpha = 0;
        } else if (ihdr.colorType === 3) {
          const paletteIndex = samples[0];
          const paletteOffset = paletteIndex * 3;
          if (!palette || paletteOffset + 2 >= palette.length) {
            fail(path + " PNG indexed pixel references a missing PLTE entry");
          }
          red = palette[paletteOffset];
          green = palette[paletteOffset + 1];
          blue = palette[paletteOffset + 2];
          alpha = transparency && paletteIndex < transparency.length
            ? transparency[paletteIndex]
            : 255;
        } else if (ihdr.colorType === 4) {
          red = green = blue = scalePngSample(samples[0], ihdr.bitDepth);
          alpha = scalePngSample(samples[1], ihdr.bitDepth);
        } else {
          red = scalePngSample(samples[0], ihdr.bitDepth);
          green = scalePngSample(samples[1], ihdr.bitDepth);
          blue = scalePngSample(samples[2], ihdr.bitDepth);
          alpha = scalePngSample(samples[3], ihdr.bitDepth);
        }
      }
      const compositeRed = alpha === 255
        ? red
        : Math.round((red * alpha + 255 * (255 - alpha)) / 255);
      const compositeGreen = alpha === 255
        ? green
        : Math.round((green * alpha + 255 * (255 - alpha)) / 255);
      const compositeBlue = alpha === 255
        ? blue
        : Math.round((blue * alpha + 255 * (255 - alpha)) / 255);
      const normalizedOffset = pixelIndex * 4;
      normalized[normalizedOffset] = compositeRed;
      normalized[normalizedOffset + 1] = compositeGreen;
      normalized[normalizedOffset + 2] = compositeBlue;
      normalized[normalizedOffset + 3] = 255;
      if (
        alpha >= 16
        && Math.max(
          255 - compositeRed,
          255 - compositeGreen,
          255 - compositeBlue,
        ) >= 8
      ) visiblePixels += 1;
      const luminance = 0.2126 * compositeRed
        + 0.7152 * compositeGreen
        + 0.0722 * compositeBlue;
      luminanceSum += luminance;
      luminanceSquareSum += luminance * luminance;
      redSum += compositeRed;
      redSquareSum += compositeRed * compositeRed;
      greenSum += compositeGreen;
      greenSquareSum += compositeGreen * compositeGreen;
      blueSum += compositeBlue;
      blueSquareSum += compositeBlue * compositeBlue;
      pixelIndex += 1;
    }
  }
  const variance = (sum, squareSum) => Math.max(0, squareSum / pixels - (sum / pixels) ** 2);
  const luminanceVariance = variance(luminanceSum, luminanceSquareSum);
  const colorVariance = (
    variance(redSum, redSquareSum)
    + variance(greenSum, greenSquareSum)
    + variance(blueSum, blueSquareSum)
  ) / 3;
  const minimumVisiblePixels = Math.max(64, Math.ceil(pixels * 0.0005));
  if (visiblePixels < minimumVisiblePixels) {
    fail(
      path + " PNG has fewer than the minimum visible pixels required for visual evidence",
    );
  }
  if (luminanceVariance < 4 && colorVariance < 4) {
    fail(path + " PNG is solid/low-variance and is not substantive visual evidence");
  }
  const hashHeader = Buffer.alloc(8);
  hashHeader.writeUInt32BE(ihdr.width, 0);
  hashHeader.writeUInt32BE(ihdr.height, 4);
  return {
    colorVariance,
    decodedVisualSha256: createHash("sha256")
      .update(hashHeader)
      .update(normalized)
      .digest("hex"),
    luminanceVariance,
    visiblePixels,
  };
}

function readPngIhdr(bytes, path) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail(path + " must contain native PNG bytes with the PNG signature");
  }
  let cursor = 8;
  let ihdr = null;
  let sawPlte = false;
  let palette = null;
  let transparency = null;
  let sawIdat = false;
  let idatEnded = false;
  let sawIend = false;
  let idatBytes = 0;
  const idatParts = [];
  let chunkIndex = 0;
  while (cursor < bytes.length) {
    if (sawIend) fail(path + " PNG contains trailing bytes after IEND");
    if (cursor + 12 > bytes.length) {
      fail(path + " contains a truncated PNG chunk header or checksum");
    }
    const length = bytes.readUInt32BE(cursor);
    const typeStart = cursor + 4;
    const dataStart = cursor + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > bytes.length) {
      fail(path + " contains a truncated PNG chunk payload");
    }
    const typeBytes = bytes.subarray(typeStart, dataStart);
    if (!/^[A-Za-z]{4}$/u.test(typeBytes.toString("ascii"))) {
      fail(path + " contains an invalid PNG chunk type");
    }
    if ((typeBytes[2] & 0x20) !== 0) {
      fail(path + " contains a PNG chunk with the reserved type bit set");
    }
    const type = typeBytes.toString("ascii");
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    const observedCrc = crc32(bytes.subarray(typeStart, dataEnd));
    if (expectedCrc !== observedCrc) {
      fail(path + " PNG " + type + " chunk checksum is invalid");
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (chunkIndex === 0 && type !== "IHDR") {
      fail(path + " PNG IHDR must be the unique first chunk");
    }
    if (type === "IHDR") {
      if (ihdr !== null || chunkIndex !== 0 || length !== 13) {
        fail(path + " must begin with one unique 13-byte PNG IHDR chunk");
      }
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const compression = data[10];
      const filter = data[11];
      const interlace = data[12];
      if (width === 0 || height === 0) {
        fail(path + " PNG IHDR dimensions must be positive");
      }
      const validDepths = new Map([
        [0, new Set([1, 2, 4, 8, 16])],
        [2, new Set([8, 16])],
        [3, new Set([1, 2, 4, 8])],
        [4, new Set([8, 16])],
        [6, new Set([8, 16])],
      ]);
      if (!validDepths.get(colorType)?.has(bitDepth)) {
        fail(path + " PNG IHDR bit-depth/color-type combination is invalid");
      }
      if (compression !== 0 || filter !== 0 || interlace !== 0) {
        fail(path + " PNG uses unsupported compression, filter, or interlace method");
      }
      ihdr = { bitDepth, colorType, height, width };
    } else if (type === "IDAT") {
      if (ihdr === null || idatEnded) {
        fail(path + " PNG IDAT chunks must be consecutive after IHDR");
      }
      if (ihdr.colorType === 3 && !sawPlte) {
        fail(path + " indexed-color PNG must contain PLTE before IDAT");
      }
      sawIdat = true;
      idatBytes += data.length;
      if (idatBytes > MAX_ARTIFACT_BYTES) {
        fail(path + " PNG compressed image data exceeds the safety limit");
      }
      idatParts.push(data);
    } else {
      if (sawIdat) idatEnded = true;
      if (type === "PLTE") {
        if (
          ihdr === null
          || sawPlte
          || sawIdat
          || length === 0
          || length > 768
          || length % 3 !== 0
          || ihdr.colorType === 0
          || ihdr.colorType === 4
        ) {
          fail(path + " PNG PLTE chunk is invalid, duplicated, or out of order");
        }
        sawPlte = true;
        palette = Buffer.from(data);
      } else if (type === "tRNS") {
        if (ihdr === null || sawIdat || transparency !== null) {
          fail(path + " PNG tRNS chunk is duplicated or out of order");
        }
        if (
          (ihdr.colorType === 0 && length !== 2)
          || (ihdr.colorType === 2 && length !== 6)
          || (ihdr.colorType === 3 && (!sawPlte || length === 0 || length > palette.length / 3))
          || ihdr.colorType === 4
          || ihdr.colorType === 6
        ) {
          fail(path + " PNG tRNS chunk is incompatible with IHDR/PLTE");
        }
        transparency = Buffer.from(data);
      } else if (type === "IEND") {
        if (length !== 0 || sawIend) fail(path + " PNG IEND chunk is invalid or duplicated");
        sawIend = true;
        if (chunkEnd !== bytes.length) {
          fail(path + " PNG contains trailing bytes after IEND");
        }
      } else if ((typeBytes[0] & 0x20) === 0 && type !== "PLTE") {
        fail(path + " PNG contains unsupported critical chunk " + type);
      }
    }
    cursor = chunkEnd;
    chunkIndex += 1;
  }
  if (ihdr === null) fail(path + " PNG omitted IHDR");
  if (!sawIdat) fail(path + " PNG must contain at least one IDAT chunk");
  if (!sawIend) fail(path + " PNG must end with one IEND chunk");
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(
    ihdr.colorType,
  );
  const rowBytes = Math.ceil((ihdr.width * ihdr.bitDepth * channels) / 8);
  const decodedBytes = ihdr.height * (rowBytes + 1);
  if (!Number.isSafeInteger(decodedBytes) || decodedBytes > MAX_PNG_DECODED_BYTES) {
    fail(path + " PNG decoded raster exceeds the safety limit");
  }
  const compressed = Buffer.concat(idatParts, idatBytes);
  let inflated;
  try {
    inflated = inflateSync(compressed, {
      info: true,
      maxOutputLength: Math.max(1, decodedBytes + 1),
    });
  } catch (error) {
    fail(path + " PNG IDAT zlib stream is invalid: " + error.message);
  }
  if (inflated.engine.bytesWritten !== compressed.length) {
    fail(path + " PNG IDAT zlib stream has trailing compressed bytes");
  }
  if (inflated.buffer.length !== decodedBytes) {
    fail(path + " PNG decoded raster byte length does not match IHDR");
  }
  const bytesPerPixel = Math.max(1, Math.ceil(ihdr.bitDepth * channels / 8));
  const unfiltered = unfilterPngRows(
    inflated.buffer,
    rowBytes,
    ihdr.height,
    bytesPerPixel,
    path,
  );
  const visual = normalizePngPixels(
    unfiltered,
    ihdr,
    rowBytes,
    channels,
    palette,
    transparency,
    path,
  );
  return {
    decodedBytes,
    decodedVisualSha256: visual.decodedVisualSha256,
    height: ihdr.height,
    luminanceVariance: visual.luminanceVariance,
    pixels: ihdr.width * ihdr.height,
    visiblePixels: visual.visiblePixels,
    width: ihdr.width,
  };
}

function validateScreenshot(
  value,
  path,
  expectedFile,
  expectedContext,
  artifactMap,
  artifactBytes,
  referencedArtifacts,
) {
  exactKeys(value, ["artifact", "capture"], path);
  const artifact = validateArtifactReference(
    value.artifact,
    path + ".artifact",
    artifactMap,
    referencedArtifacts,
  );
  expectLiteral(artifact.file, expectedFile, path + ".artifact.file");
  expectLiteral(artifact.mediaType, "image/png", path + ".artifact.mediaType");
  const capture = value.capture;
  exactKeys(
    capture,
    [
      "method",
      "target",
      "requestedViewport",
      "observedViewport",
      "rawPngRaster",
      "elementRect",
      "cropRect",
      "resized",
    ],
    path + ".capture",
  );
  expectLiteral(
    capture.method,
    "browser-native-direct",
    path + ".capture.method (must not be a post-processed screenshot)",
  );
  if (!["viewport", "element", "crop"].includes(capture.target)) {
    fail(path + ".capture.target must be viewport, element, or crop");
  }
  expectBoolean(capture.resized, false, path + ".capture.resized");
  const validateDimensions = (dimensions, dimensionsPath, integer = true) => {
    exactKeys(dimensions, ["width", "height"], dimensionsPath);
    for (const field of ["width", "height"]) {
      const number = expectNumber(dimensions[field], dimensionsPath + "." + field);
      if (number <= 0 || number > 32768 || (integer && !Number.isSafeInteger(number))) {
        fail(dimensionsPath + "." + field + " must be a bounded positive dimension");
      }
    }
  };
  validateDimensions(capture.requestedViewport, path + ".capture.requestedViewport");
  exactKeys(
    capture.observedViewport,
    ["width", "height", "devicePixelRatio"],
    path + ".capture.observedViewport",
  );
  validateDimensions(
    {
      width: capture.observedViewport.width,
      height: capture.observedViewport.height,
    },
    path + ".capture.observedViewport dimensions",
    false,
  );
  const dpr = expectNumber(
    capture.observedViewport.devicePixelRatio,
    path + ".capture.observedViewport.devicePixelRatio",
  );
  if (dpr <= 0 || dpr > 8) fail(path + ".capture devicePixelRatio is outside safe bounds");
  if (
    capture.observedViewport.width > capture.requestedViewport.width
    || capture.observedViewport.height > capture.requestedViewport.height
  ) {
    fail(path + ".capture observed viewport must fit within the requested browser surface");
  }
  validateDimensions(capture.rawPngRaster, path + ".capture.rawPngRaster");
  if (capture.rawPngRaster.width < 240 || capture.rawPngRaster.height < 180) {
    fail(path + ".capture screenshot is below the 240x180 minimum visual evidence size");
  }
  const validateRect = (rect, rectPath) => {
    exactKeys(rect, ["x", "y", "width", "height"], rectPath);
    for (const field of ["x", "y", "width", "height"]) {
      expectNumber(rect[field], rectPath + "." + field);
    }
    if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0) {
      fail(rectPath + " must be a positive in-viewport rectangle");
    }
    if (
      rect.x + rect.width > capture.observedViewport.width
      || rect.y + rect.height > capture.observedViewport.height
    ) {
      fail(rectPath + " must be contained in the observed viewport");
    }
  };
  let cssRaster;
  if (capture.target === "viewport") {
    expectLiteral(capture.elementRect, null, path + ".capture.elementRect");
    expectLiteral(capture.cropRect, null, path + ".capture.cropRect");
    cssRaster = capture.observedViewport;
  } else if (capture.target === "element") {
    validateRect(capture.elementRect, path + ".capture.elementRect");
    expectLiteral(capture.cropRect, null, path + ".capture.cropRect");
    cssRaster = capture.elementRect;
  } else {
    expectLiteral(capture.elementRect, null, path + ".capture.elementRect");
    validateRect(capture.cropRect, path + ".capture.cropRect");
    cssRaster = capture.cropRect;
  }
  if (
    cssRaster.width < 240
    || cssRaster.height < 180
    || cssRaster.width / capture.observedViewport.width < 0.25
    || cssRaster.height / capture.observedViewport.height < 0.25
  ) {
    fail(path + ".capture element/crop viewport ratio is too small for visual evidence");
  }
  const nativeWidth = cssRaster.width * dpr;
  const nativeHeight = cssRaster.height * dpr;
  if (
    !Number.isSafeInteger(nativeWidth)
    || !Number.isSafeInteger(nativeHeight)
    || capture.rawPngRaster.width !== nativeWidth
    || capture.rawPngRaster.height !== nativeHeight
  ) {
    fail(path + ".capture raw PNG raster is inconsistent with direct browser geometry/DPR");
  }
  if (expectedContext) {
    if (expectedContext.target) {
      expectLiteral(capture.target, expectedContext.target, path + ".capture.target");
    }
    if (
      expectedContext.requestedViewport
      && !isDeepStrictEqual(capture.requestedViewport, expectedContext.requestedViewport)
    ) {
      fail(path + ".capture requestedViewport does not match the browser observation");
    }
    if (
      expectedContext.observedViewport
      && !isDeepStrictEqual(capture.observedViewport, expectedContext.observedViewport)
    ) {
      fail(path + ".capture observedViewport does not match the browser observation");
    }
  }
  const dimensions = readPngIhdr(artifactBytes.get(artifact.file), path);
  if (
    dimensions.width !== capture.rawPngRaster.width
    || dimensions.height !== capture.rawPngRaster.height
  ) {
    fail(
      path + " PNG raster/IHDR dimension mismatch: declared "
      + capture.rawPngRaster.width + "x" + capture.rawPngRaster.height
      + ", observed " + dimensions.width + "x" + dimensions.height,
    );
  }
  return dimensions;
}

function mapExactSet(items, key, expectedValues, label) {
  expectArray(items, label);
  if (items.length !== expectedValues.length) {
    fail(
      label + " exact set must contain " + expectedValues.length
      + " entries (" + expectedValues.join(", ") + ")",
    );
  }
  const map = new Map();
  for (const item of items) {
    expectObject(item, label + " item");
    const value = expectString(item[key], label + " item." + key, { nonEmpty: true });
    if (map.has(value)) fail(label + " contains duplicate " + key + " " + value);
    map.set(value, item);
  }
  const missing = expectedValues.filter((value) => !map.has(value));
  const unexpected = [...map.keys()].filter((value) => !expectedValues.includes(value));
  if (missing.length > 0 || unexpected.length > 0) {
    fail(
      label + " exact set mismatch; missing: " + (missing.join(", ") || "none")
      + "; unexpected: " + (unexpected.join(", ") || "none"),
    );
  }
  return map;
}

function validateRun(value) {
  exactKeys(value, ["runId", "startedAt", "completedAt"], "manifest.run");
  const runId = expectString(value.runId, "manifest.run.runId", { nonEmpty: true });
  if (!/^[a-z0-9][a-z0-9-]{7,127}$/u.test(runId)) {
    fail("manifest.run.runId has an invalid stable identifier");
  }
  const startedAt = expectIsoTimestamp(value.startedAt, "manifest.run.startedAt");
  const completedAt = expectIsoTimestamp(value.completedAt, "manifest.run.completedAt");
  if (completedAt < startedAt) {
    fail("manifest.run.completedAt must not precede manifest.run.startedAt");
  }
  return { completedAt, runId, startedAt };
}

function validateTarget(value) {
  exactKeys(
    value,
    [
      "environment",
      "requestedUrl",
      "finalUrl",
      "origin",
      "serverLifecycle",
      "httpStatus",
    ],
    "manifest.target",
  );
  expectLiteral(value.environment, "production", "manifest.target.environment");
  expectLiteral(value.requestedUrl, PRODUCTION_ROUTE, "manifest.target.requestedUrl");
  expectLiteral(value.finalUrl, PRODUCTION_ROUTE, "manifest.target.finalUrl");
  expectLiteral(
    value.origin,
    PRODUCTION_ORIGIN,
    "manifest.target.origin (final origin must be https://ena.hk)",
  );
  expectLiteral(value.serverLifecycle, "external", "manifest.target.serverLifecycle");
  expectInteger(value.httpStatus, "manifest.target.httpStatus", { exact: 200 });
}

function validateDeployment(value) {
  exactKeys(
    value,
    [
      "provider",
      "target",
      "readyState",
      "deploymentId",
      "deploymentUrl",
      "gitSha",
      "controlPlaneReceipt",
    ],
    "manifest.deployment",
  );
  expectLiteral(value.provider, "vercel", "manifest.deployment.provider");
  expectLiteral(value.target, "production", "manifest.deployment.target");
  expectLiteral(value.readyState, "READY", "manifest.deployment.readyState");
  const deploymentId = expectString(
    value.deploymentId,
    "manifest.deployment.deploymentId",
    { nonEmpty: true },
  );
  if (!/^dpl_[A-Za-z0-9_-]+$/u.test(deploymentId)) {
    fail("manifest.deployment.deploymentId must be a Vercel deployment id");
  }
  const deploymentUrl = expectString(
    value.deploymentUrl,
    "manifest.deployment.deploymentUrl",
    { nonEmpty: true },
  );
  let parsedUrl;
  try {
    parsedUrl = new URL(deploymentUrl);
  } catch (error) {
    fail("manifest.deployment.deploymentUrl must be a valid URL: " + error.message);
  }
  if (
    parsedUrl.protocol !== "https:"
    || !parsedUrl.hostname.endsWith(".vercel.app")
    || parsedUrl.username !== ""
    || parsedUrl.password !== ""
    || parsedUrl.search !== ""
    || parsedUrl.hash !== ""
  ) {
    fail("manifest.deployment.deploymentUrl must identify an HTTPS Vercel deployment");
  }
  const gitSha = expectHex(value.gitSha, HEX_40, "manifest.deployment.gitSha");
  return {
    controlPlaneReceipt: value.controlPlaneReceipt,
    deploymentId,
    deploymentUrl,
    gitSha,
  };
}

function validateSource(value, deployment) {
  exactKeys(value, ["gitHead"], "manifest.source");
  expectHex(value.gitHead, HEX_40, "manifest.source.gitHead");
  if (value.gitHead !== deployment.gitSha) {
    fail("manifest.source.gitHead must match manifest.deployment.gitSha");
  }
}

function validateBrowser(value) {
  exactKeys(
    value,
    ["name", "channel", "version", "userAgent", "automationSurface"],
    "manifest.browser",
  );
  expectLiteral(value.name, "Google Chrome", "manifest.browser.name");
  expectLiteral(value.channel, "chrome", "manifest.browser.channel");
  expectLiteral(
    value.automationSurface,
    "codex-chrome-extension",
    "manifest.browser.automationSurface (must be codex-chrome-extension)",
  );
  const version = expectString(value.version, "manifest.browser.version", { nonEmpty: true });
  if (!/^[0-9]+(?:\.[0-9]+){3}$/u.test(version)) {
    fail("manifest.browser.version must be a four-part Chrome version");
  }
  const userAgent = expectString(value.userAgent, "manifest.browser.userAgent", {
    nonEmpty: true,
  });
  const userAgentChrome = /(?:^|[ (])Chrome\/([0-9]+(?:\.[0-9]+){3})(?:[ )]|$)/u.exec(
    userAgent,
  );
  if (
    !userAgentChrome
    || userAgentChrome[1].split(".")[0] !== version.split(".")[0]
    || userAgent.includes("HeadlessChrome/")
  ) {
    fail("manifest.browser.userAgent must identify the declared non-headless Chrome runtime");
  }
}

function validateAnalysis(value) {
  exactKeys(
    value,
    [
      "resultHash",
      "executionTarget",
      "traceCount",
      "dimensionLabels",
      "taskCounts",
      "phaseCheckpoints",
    ],
    "manifest.analysis",
  );
  const resultHash = expectHex(value.resultHash, HEX_64, "manifest.analysis.resultHash");
  expectLiteral(
    value.executionTarget,
    "browser-worker",
    "manifest.analysis.executionTarget",
  );
  expectInteger(value.traceCount, "manifest.analysis.traceCount", { exact: 17 });
  exactKeys(value.dimensionLabels, ["x", "y", "z"], "manifest.analysis.dimensionLabels");
  expectDeep(
    value.dimensionLabels,
    { x: "SVD1", y: "SVD2", z: "SVD3" },
    "manifest.analysis.dimensionLabels",
    "must preserve the frozen SVD1/SVD2/SVD3 axes",
  );
  exactKeys(
    value.taskCounts,
    [
      "scientificTotal",
      "workerRuns",
      "remotePosts",
      "bootstrapTasks",
      "networkOverlayTasks",
    ],
    "manifest.analysis.taskCounts",
  );
  expectDeep(
    value.taskCounts,
    {
      scientificTotal: 1,
      workerRuns: 1,
      remotePosts: 0,
      bootstrapTasks: 0,
      networkOverlayTasks: 0,
    },
    "manifest.analysis.taskCounts",
    "must prove exactly one local browser-worker scientific task and no remote/bootstrap/overlay tasks",
  );
  const phases = [
    "initial-run",
    "after-cameras",
    "after-projections",
    "after-downloads",
  ];
  const checkpoints = expectArray(
    value.phaseCheckpoints,
    "manifest.analysis.phaseCheckpoints",
  );
  if (checkpoints.length !== phases.length) {
    fail(
      "manifest.analysis.phaseCheckpoints must contain initial-run, after-cameras, "
      + "after-projections, and after-downloads",
    );
  }
  for (let index = 0; index < phases.length; index += 1) {
    const checkpoint = checkpoints[index];
    const path = "manifest.analysis.phaseCheckpoints[" + index + "]";
    exactKeys(checkpoint, ["phase", "resultHash", "scientificTaskCount"], path);
    expectLiteral(checkpoint.phase, phases[index], path + ".phase");
    if (checkpoint.resultHash !== resultHash) {
      fail(path + ".resultHash has result hash drift");
    }
    expectInteger(checkpoint.scientificTaskCount, path + ".scientificTaskCount", {
      exact: 1,
    });
  }
  return {
    dimensionLabels: value.dimensionLabels,
    resultHash,
    traceCount: value.traceCount,
  };
}

const VIEWPORT_SPECS = {
  desktop: { minimumWidth: 1200, maximumWidth: 32768 },
  tablet: { minimumWidth: 700, maximumWidth: 1199 },
  mobile: { minimumWidth: 240, maximumWidth: 699 },
};

function validateViewportDimensions(value, width, height, path) {
  exactKeys(value, ["width", "height"], path);
  expectInteger(value.width, path + ".width", { exact: width });
  expectInteger(value.height, path + ".height", { exact: height });
}

function validateViewports(
  value,
  resultHash,
  artifactMap,
  artifactBytes,
  referencedArtifacts,
) {
  const viewports = mapExactSet(
    value,
    "name",
    ["desktop", "tablet", "mobile"],
    "manifest.viewports",
  );
  for (const [name, spec] of Object.entries(VIEWPORT_SPECS)) {
    const viewport = viewports.get(name);
    const path = "manifest.viewports." + name;
    exactKeys(
      viewport,
      [
        "name",
        "requested",
        "observed",
        "overflow",
        "resultHash",
        "scientificTaskCount",
        "pageScreenshot",
        "plotScreenshot",
      ],
      path,
    );
    expectLiteral(viewport.name, name, path + ".name");
    exactKeys(viewport.requested, ["width", "height"], path + ".requested");
    expectInteger(viewport.requested.width, path + ".requested.width", { minimum: 1 });
    expectInteger(viewport.requested.height, path + ".requested.height", { minimum: 1 });
    if (name === "mobile") {
      if (viewport.requested.width !== 390 || viewport.requested.height !== 844) {
        fail(path + ".requested must be the exact 390x844 mobile viewport");
      }
    }
    if (
      viewport.requested.width < spec.minimumWidth
      || viewport.requested.width > spec.maximumWidth
    ) {
      fail(path + ".requested.width is outside the " + name + " viewport class");
    }
    exactKeys(
      viewport.observed,
      [
        "innerWidth",
        "innerHeight",
        "visualViewportWidth",
        "visualViewportHeight",
        "devicePixelRatio",
      ],
      path + ".observed",
    );
    expectInteger(viewport.observed.innerWidth, path + ".observed.innerWidth", {
      minimum: 1,
    });
    expectInteger(viewport.observed.innerHeight, path + ".observed.innerHeight", {
      minimum: 1,
    });
    expectNumber(
      viewport.observed.visualViewportWidth,
      path + ".observed.visualViewportWidth",
    );
    expectNumber(
      viewport.observed.visualViewportHeight,
      path + ".observed.visualViewportHeight",
    );
    expectLiteral(
      viewport.observed.visualViewportWidth,
      viewport.observed.innerWidth,
      path + ".observed.visualViewportWidth",
    );
    expectLiteral(
      viewport.observed.visualViewportHeight,
      viewport.observed.innerHeight,
      path + ".observed.visualViewportHeight",
    );
    if (
      name === "mobile"
      && (viewport.observed.innerWidth !== 390 || viewport.observed.innerHeight !== 844)
    ) {
      fail(path + ".observed must be the exact 390x844 mobile viewport");
    }
    const viewportDpr = expectNumber(
      viewport.observed.devicePixelRatio,
      path + ".observed.devicePixelRatio",
    );
    if (viewportDpr <= 0 || viewportDpr > 8) {
      fail(path + ".observed.devicePixelRatio is outside safe bounds");
    }
    if (
      viewport.observed.innerWidth > viewport.requested.width
      || viewport.observed.innerHeight > viewport.requested.height
    ) {
      fail(path + ".observed must fit within requested dimensions");
    }
    exactKeys(
      viewport.overflow,
      [
        "documentClientWidth",
        "documentScrollWidth",
        "bodyClientWidth",
        "bodyScrollWidth",
        "clippedInteractiveControls",
      ],
      path + ".overflow",
    );
    for (const field of [
      "documentClientWidth",
      "documentScrollWidth",
      "bodyClientWidth",
      "bodyScrollWidth",
    ]) {
      expectInteger(viewport.overflow[field], path + ".overflow." + field, {
        exact: viewport.observed.innerWidth,
      });
    }
    const clipped = expectArray(
      viewport.overflow.clippedInteractiveControls,
      path + ".overflow.clippedInteractiveControls",
    );
    if (clipped.length !== 0) {
      fail(path + ".overflow must not report clipped interactive controls");
    }
    if (viewport.resultHash !== resultHash) {
      fail(path + ".resultHash has result hash drift");
    }
    expectInteger(viewport.scientificTaskCount, path + ".scientificTaskCount", {
      exact: 1,
    });
    validateScreenshot(
      viewport.pageScreenshot,
      path + " page screenshot",
      "screenshots/" + name + "-page.png",
      {
        target: "viewport",
        requestedViewport: viewport.requested,
        observedViewport: {
          width: viewport.observed.innerWidth,
          height: viewport.observed.innerHeight,
          devicePixelRatio: viewport.observed.devicePixelRatio,
        },
      },
      artifactMap,
      artifactBytes,
      referencedArtifacts,
    );
    validateScreenshot(
      viewport.plotScreenshot,
      path + " plot screenshot",
      "screenshots/" + name + "-plot.png",
      {
        target: "element",
        requestedViewport: viewport.requested,
        observedViewport: {
          width: viewport.observed.innerWidth,
          height: viewport.observed.innerHeight,
          devicePixelRatio: viewport.observed.devicePixelRatio,
        },
      },
      artifactMap,
      artifactBytes,
      referencedArtifacts,
    );
  }
}

function validateFullscreen(
  value,
  resultHash,
  artifactMap,
  artifactBytes,
  referencedArtifacts,
) {
  exactKeys(
    value,
    [
      "viewport",
      "shell",
      "plot",
      "canvas",
      "sceneDomain",
      "resultHash",
      "scientificTaskCount",
      "screenshot",
    ],
    "manifest.fullscreen",
  );
  validateViewportDimensions(value.viewport, 1440, 1000, "manifest.fullscreen.viewport");
  validateViewportDimensions(value.shell, 1440, 1000, "manifest.fullscreen.shell");
  validateViewportDimensions(value.plot, 1440, 945, "manifest.fullscreen.plot");
  validateViewportDimensions(value.canvas, 1440, 945, "manifest.fullscreen.canvas");
  exactKeys(value.sceneDomain, ["x", "y"], "manifest.fullscreen.sceneDomain");
  expectDeep(
    value.sceneDomain,
    { x: [0, 1], y: [0, 1] },
    "manifest.fullscreen.sceneDomain",
    "must cover the full domain x=[0,1], y=[0,1]",
  );
  if (value.resultHash !== resultHash) {
    fail("manifest.fullscreen.resultHash has result hash drift");
  }
  expectInteger(
    value.scientificTaskCount,
    "manifest.fullscreen.scientificTaskCount",
    { exact: 1 },
  );
  validateScreenshot(
    value.screenshot,
    "manifest.fullscreen screenshot",
    "screenshots/fullscreen.png",
    {
      target: "viewport",
      requestedViewport: value.viewport,
      observedViewport: {
        width: value.viewport.width,
        height: value.viewport.height,
        devicePixelRatio: 1,
      },
    },
    artifactMap,
    artifactBytes,
    referencedArtifacts,
  );
}

const CAMERA_STATES = {
  isometric: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 1.45 / 1.5, y: 1.45 / 1.5, z: 1.25 / 1.5 },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "perspective" },
  },
  xy: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 0, z: 2.5 },
    up: { x: 0, y: 1, z: 0 },
    projection: { type: "orthographic" },
  },
  xz: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 2.5, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "orthographic" },
  },
  yz: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 2.5, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "orthographic" },
  },
  yx: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 0, z: -2.5 },
    up: { x: 1, y: 0, z: 0 },
    projection: { type: "orthographic" },
  },
  zx: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 2.5, z: 0 },
    up: { x: 1, y: 0, z: 0 },
    projection: { type: "orthographic" },
  },
  zy: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: -2.5, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    projection: { type: "orthographic" },
  },
};

function validateVector(value, path) {
  exactKeys(value, ["x", "y", "z"], path);
  expectNumber(value.x, path + ".x");
  expectNumber(value.y, path + ".y");
  expectNumber(value.z, path + ".z");
}

function validateCameraState(value, preset, path) {
  exactKeys(value, ["center", "eye", "up", "projection"], path);
  validateVector(value.center, path + ".center");
  validateVector(value.eye, path + ".eye");
  validateVector(value.up, path + ".up");
  exactKeys(value.projection, ["type"], path + ".projection");
  expectString(value.projection.type, path + ".projection.type", { nonEmpty: true });
  expectDeep(
    value,
    CAMERA_STATES[preset],
    path,
    "must match the canonical runtimeCamera state; isometric is perspective "
      + "and all six plane presets are orthographic",
  );
}

function validateCameras(
  value,
  resultHash,
  artifactMap,
  artifactBytes,
  referencedArtifacts,
) {
  const presets = ["isometric", "xy", "xz", "yz", "yx", "zx", "zy"];
  const cameras = mapExactSet(value, "preset", presets, "manifest.cameras camera");
  const visualHashes = new Set();
  for (const preset of presets) {
    const camera = cameras.get(preset);
    const path = "manifest.cameras." + preset;
    exactKeys(
      camera,
      [
        "preset",
        "selectedValue",
        "visibleLabel",
        "runtimeCamera",
        "resultHash",
        "scientificTaskCount",
        "screenshot",
      ],
      path,
    );
    expectLiteral(camera.preset, preset, path + ".preset");
    expectLiteral(camera.selectedValue, preset, path + ".selectedValue");
    expectLiteral(camera.visibleLabel, preset.toUpperCase(), path + ".visibleLabel");
    validateCameraState(camera.runtimeCamera, preset, path + ".runtimeCamera");
    if (camera.resultHash !== resultHash) {
      fail(path + ".resultHash has camera resultHash drift");
    }
    expectInteger(camera.scientificTaskCount, path + ".scientificTaskCount", {
      exact: 1,
    });
    const decodedScreenshot = validateScreenshot(
      camera.screenshot,
      path + " screenshot",
      "screenshots/camera-" + preset + ".png",
      { target: "element" },
      artifactMap,
      artifactBytes,
      referencedArtifacts,
    );
    visualHashes.add(decodedScreenshot.decodedVisualSha256);
  }
  if (visualHashes.size !== presets.length) {
    fail("camera decoded-pixel visual hashes must be pairwise distinct; same pixels are not distinct evidence");
  }
}

function validateProjections(
  value,
  resultHash,
  dimensionLabels,
  artifactMap,
  artifactBytes,
  referencedArtifacts,
) {
  const planes = ["xy", "xz", "yz", "yx", "zx", "zy"];
  const projections = mapExactSet(
    value,
    "projection",
    planes,
    "manifest.projections projection",
  );
  const visualHashes = new Set();
  for (const plane of planes) {
    const projection = projections.get(plane);
    const path = "manifest.projections.projection " + plane;
    exactKeys(
      projection,
      [
        "projection",
        "selectedValue",
        "traceTypes",
        "xTitle",
        "yTitle",
        "resultHash",
        "scientificTaskCount",
        "screenshot",
      ],
      path,
    );
    expectLiteral(projection.projection, plane, path + ".projection");
    expectLiteral(projection.selectedValue, plane, path + ".selectedValue");
    expectDeep(
      projection.traceTypes,
      ["scatter"],
      path + ".traceTypes",
      "must contain only 2D scatter and must never contain scatter3d",
    );
    expectLiteral(
      projection.xTitle,
      dimensionLabels[plane[0]],
      path + ".xTitle (frozen projection axis order)",
    );
    expectLiteral(
      projection.yTitle,
      dimensionLabels[plane[1]],
      path + ".yTitle (frozen projection axis order)",
    );
    if (projection.resultHash !== resultHash) {
      fail(path + ".resultHash has projection result hash drift");
    }
    expectInteger(projection.scientificTaskCount, path + ".scientificTaskCount", {
      exact: 1,
    });
    const decodedScreenshot = validateScreenshot(
      projection.screenshot,
      path + " screenshot",
      "screenshots/projection-" + plane + ".png",
      { target: "element" },
      artifactMap,
      artifactBytes,
      referencedArtifacts,
    );
    visualHashes.add(decodedScreenshot.decodedVisualSha256);
  }
  if (visualHashes.size !== planes.length) {
    fail("projection decoded-pixel visual hashes must be pairwise distinct; same pixels are not distinct evidence");
  }
}

function validateBrowserDiagnostics(
  value,
  run,
  artifactMap,
  artifactBytes,
  referencedArtifacts,
) {
  exactKeys(
    value,
    [
      "observationStartedAt",
      "observationCompletedAt",
      "consoleErrors",
      "consoleWarnings",
      "pageErrors",
      "pageCrashes",
      "rawEventLedger",
    ],
    "manifest.browserDiagnostics",
  );
  const started = expectIsoTimestamp(
    value.observationStartedAt,
    "manifest.browserDiagnostics.observationStartedAt",
  );
  const completed = expectIsoTimestamp(
    value.observationCompletedAt,
    "manifest.browserDiagnostics.observationCompletedAt",
  );
  if (started !== run.startedAt || completed !== run.completedAt) {
    fail("manifest.browserDiagnostics observation window must match the raw browser run window");
  }
  for (const ledger of [
    "consoleErrors",
    "consoleWarnings",
    "pageErrors",
    "pageCrashes",
  ]) {
    const entries = expectArray(value[ledger], "manifest.browserDiagnostics." + ledger);
    if (entries.length !== 0) {
      fail(
        "manifest.browserDiagnostics." + ledger
        + " must be empty in the raw browser diagnostics",
      );
    }
  }
  const artifact = validateArtifactReference(
    value.rawEventLedger,
    "manifest.browserDiagnostics.rawEventLedger",
    artifactMap,
    referencedArtifacts,
  );
  expectLiteral(
    artifact.file,
    "browser/raw-event-ledger.json",
    "manifest.browserDiagnostics.rawEventLedger.file",
  );
  expectLiteral(
    artifact.mediaType,
    "application/json",
    "manifest.browserDiagnostics.rawEventLedger.mediaType",
  );
  const ledger = parseStrictJson(
    artifactBytes.get(artifact.file),
    "browser raw event ledger",
  );
  exactKeys(
    ledger,
    [
      "schemaVersion",
      "runId",
      "evidenceLevel",
      "browserEventAuthenticity",
      "events",
    ],
    "browser raw event ledger",
  );
  expectLiteral(
    ledger.schemaVersion,
    "open-ena.browser-event-ledger.v1",
    "browser raw event ledger.schemaVersion",
  );
  expectLiteral(ledger.runId, run.runId, "browser raw event ledger.runId");
  expectLiteral(
    ledger.evidenceLevel,
    "browser-observation-consistency",
    "browser raw event ledger.evidenceLevel",
  );
  expectLiteral(
    ledger.browserEventAuthenticity,
    "not-cryptographically-proven",
    "browser raw event ledger.browserEventAuthenticity",
  );
  const events = expectArray(ledger.events, "browser raw event ledger.events");
  let previousObservedAt = -Infinity;
  events.forEach((event, index) => {
    const path = "browser raw event ledger.events[" + index + "]";
    exactKeys(
      event,
      [
        "sequence",
        "observedAt",
        "source",
        "type",
        "raw",
        "canonicalPayloadSha256",
      ],
      path,
    );
    expectInteger(event.sequence, path + ".sequence", { exact: index + 1 });
    const observedAt = expectIsoTimestamp(event.observedAt, path + ".observedAt");
    if (
      observedAt < run.startedAt
      || observedAt > run.completedAt
      || observedAt <= previousObservedAt
    ) {
      fail(path + ".observedAt must be strictly ordered inside the run window");
    }
    previousObservedAt = observedAt;
    const source = expectString(event.source, path + ".source", { nonEmpty: true });
    if (![
      "cdp",
      "app-dom-observation",
      "download-event",
      "automation-command",
    ].includes(source)) {
      fail(path + ".source is not an allowed observation/command source");
    }
    expectString(event.type, path + ".type", { nonEmpty: true });
    expectObject(event.raw, path + ".raw");
    expectHex(
      event.canonicalPayloadSha256,
      HEX_64,
      path + ".canonicalPayloadSha256",
    );
    const observedCanonicalPayloadSha256 = hashCanonical(event.raw);
    if (!equalHex(observedCanonicalPayloadSha256, event.canonicalPayloadSha256)) {
      fail(
        path
        + ".canonicalPayloadSha256 does not bind the canonical observation payload/command receipt",
      );
    }
  });
  return events;
}

function expectedScreenshotGeometry(contextKind, contextValue, screenshot) {
  return {
    source: "app-dom-observation",
    type: "screenshot-geometry-observation",
    raw: {
      contextKind,
      contextValue,
      artifactFile: screenshot.artifact.file,
      target: screenshot.capture.target,
      boundingClientRect: screenshot.capture.elementRect,
      observedViewport: screenshot.capture.observedViewport,
      rawPngRaster: screenshot.capture.rawPngRaster,
    },
  };
}

function expectedRawBrowserEvents(manifest) {
  const resultHash = manifest.analysis.resultHash;
  const expected = [
    {
      source: "app-dom-observation",
      type: "worker-event",
      raw: {
        kind: "dispatch",
        dispatchId: "open-ena-worker-dispatch-1",
        beforeResultHash: null,
        scientificTaskCountBefore: 0,
        workerDispatchCount: 1,
      },
    },
    {
      source: "app-dom-observation",
      type: "worker-event",
      raw: {
        kind: "complete",
        dispatchId: "open-ena-worker-dispatch-1",
        resultHash,
        scientificTaskCountAfter: 1,
        workerDispatchCount: 1,
      },
    },
    {
      source: "app-dom-observation",
      type: "remote-post-observation",
      raw: { requestCount: 0, requests: [] },
    },
  ];
  for (const viewport of manifest.viewports) {
    expected.push(expectedScreenshotGeometry(
      "viewport-plot",
      viewport.name,
      viewport.plotScreenshot,
    ));
  }
  for (const camera of manifest.cameras) {
    const preset = camera.preset;
    expected.push({
      source: "automation-command",
      type: "automation-command-receipt",
      raw: {
        command: "select-camera",
        value: preset,
        before: { resultHash, scientificTaskCount: 1, workerDispatchCount: 1 },
        after: { resultHash, scientificTaskCount: 1, workerDispatchCount: 1 },
      },
    });
    expected.push(expectedScreenshotGeometry("camera", preset, camera.screenshot));
  }
  for (const projectionEvidence of manifest.projections) {
    const projection = projectionEvidence.projection;
    expected.push({
      source: "automation-command",
      type: "automation-command-receipt",
      raw: {
        command: "select-projection",
        value: projection,
        before: { resultHash, scientificTaskCount: 1, workerDispatchCount: 1 },
        after: { resultHash, scientificTaskCount: 1, workerDispatchCount: 1 },
      },
    });
    expected.push(expectedScreenshotGeometry(
      "projection",
      projection,
      projectionEvidence.screenshot,
    ));
  }
  const items = new Map(manifest.downloads.items.map((item) => [item.kind, item]));
  const appendDownload = (kind) => {
    const item = items.get(kind);
    expected.push({
      source: "download-event",
      type: "download-event",
      raw: {
        phase: "start",
        kind,
        file: item.artifact.file,
        resultHash,
        suggestedFilename: item.suggestedFilename,
      },
    });
    expected.push({
      source: "download-event",
      type: "download-event",
      raw: {
        phase: "complete",
        kind,
        file: item.artifact.file,
        resultHash,
        byteLength: item.artifact.bytes,
        sha256: item.artifact.sha256,
      },
    });
  };
  for (const kind of ["bundle", "path", "metadata", "inference", "analysis", "plotly"]) {
    appendDownload(kind);
  }
  const dialog = manifest.downloads.privacyDialog;
  expected.push({
    source: "cdp",
    type: "cdp-event",
    raw: {
      method: "Page.javascriptDialogOpening",
      params: {
        type: dialog.type,
        message: dialog.message,
        url: PRODUCTION_ROUTE,
        hasBrowserHandler: true,
      },
    },
  });
  expected.push({
    source: "cdp",
    type: "cdp-event",
    raw: {
      method: "Page.javascriptDialogClosed",
      params: { result: true, userInput: "" },
    },
  });
  appendDownload("participant");
  return expected;
}

function validateRawBrowserEventSemantics(events, manifest) {
  const expected = expectedRawBrowserEvents(manifest);
  if (events.length !== expected.length) {
    fail(
      "browser raw event ledger must contain the exact ordered worker, remote, "
      + "camera, projection, screenshot geometry, dialog, and download event set",
    );
  }
  events.forEach((event, index) => {
    const path = "browser raw event ledger.events[" + index + "]";
    expectLiteral(event.source, expected[index].source, path + ".source/order");
    expectLiteral(event.type, expected[index].type, path + ".type/order");
    if (!isDeepStrictEqual(event.raw, expected[index].raw)) {
      fail(
        path + ".raw does not bind the expected result hash, scientific task count, "
        + "worker dispatch count, remote POST ledger, screenshot geometry, dialog, "
        + "or download receipt",
      );
    }
  });
}

const DOWNLOAD_SPECS = {
  bundle: {
    buttonLabel: "Analysis bundle ZIP",
    file: "downloads/aggregate.zip",
    mediaType: "application/zip",
  },
  path: {
    buttonLabel: "Path CSV",
    file: "downloads/path.csv",
    mediaType: "text/csv",
  },
  metadata: {
    buttonLabel: "Metadata CSV",
    file: "downloads/metadata.csv",
    mediaType: "text/csv",
  },
  inference: {
    buttonLabel: "Inference CSV",
    file: "downloads/inference.csv",
    mediaType: "text/csv",
  },
  analysis: {
    buttonLabel: "Analysis JSON",
    file: "downloads/analysis.json",
    mediaType: "application/json",
  },
  plotly: {
    buttonLabel: "Plotly spec JSON",
    file: "downloads/plotly.json",
    mediaType: "application/json",
  },
  participant: {
    buttonLabel: "Participant-level ZIP (opt-in)",
    file: "downloads/participant.zip",
    mediaType: "application/zip",
  },
};

function validateZipMagic(bytes, path) {
  if (
    bytes.length < 4
    || bytes[0] !== 0x50
    || bytes[1] !== 0x4b
    || !(
      (bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08)
    )
  ) {
    fail(path + " must contain ZIP bytes with a PK signature");
  }
}

function validateDownloads(
  value,
  resultHash,
  analysisTraceCount,
  artifactMap,
  artifactBytes,
  referencedArtifacts,
) {
  exactKeys(
    value,
    [
      "items",
      "aggregateBundle",
      "participantBundle",
      "standaloneMembersMatchAggregate",
      "privacyDialog",
    ],
    "manifest.downloads",
  );
  const kinds = Object.keys(DOWNLOAD_SPECS);
  const items = mapExactSet(
    value.items,
    "kind",
    kinds,
    "manifest.downloads items exact set",
  );
  const itemArtifacts = new Map();
  for (const kind of kinds) {
    const item = items.get(kind);
    const spec = DOWNLOAD_SPECS[kind];
    const path = "manifest.downloads.items." + kind;
    exactKeys(
      item,
      [
        "kind",
        "buttonLabel",
        "triggerPageUrl",
        "downloadObserved",
        "suggestedFilename",
        "artifact",
      ],
      path,
    );
    expectLiteral(item.kind, kind, path + ".kind");
    expectLiteral(item.buttonLabel, spec.buttonLabel, path + ".buttonLabel");
    expectLiteral(item.triggerPageUrl, PRODUCTION_ROUTE, path + ".triggerPageUrl");
    expectBoolean(item.downloadObserved, true, path + ".downloadObserved");
    expectLiteral(
      item.suggestedFilename,
      basename(spec.file),
      path + ".suggestedFilename",
    );
    const artifact = validateArtifactReference(
      item.artifact,
      path + ".artifact",
      artifactMap,
      referencedArtifacts,
    );
    expectLiteral(artifact.file, spec.file, path + ".artifact.file");
    expectLiteral(artifact.mediaType, spec.mediaType, path + ".artifact.mediaType");
    itemArtifacts.set(kind, artifact);
    if (spec.mediaType === "application/zip") {
      validateZipMagic(artifactBytes.get(artifact.file), path + ".artifact");
    }
  }

  exactKeys(
    value.aggregateBundle,
    [
      "artifact",
      "resultHash",
      "contentSetHash",
      "participantLevelIncluded",
      "participantCsvPresent",
    ],
    "manifest.downloads.aggregateBundle",
  );
  const aggregateArtifact = validateArtifactReference(
    value.aggregateBundle.artifact,
    "manifest.downloads.aggregateBundle.artifact",
    artifactMap,
    referencedArtifacts,
  );
  expectLiteral(
    aggregateArtifact.file,
    DOWNLOAD_SPECS.bundle.file,
    "manifest.downloads.aggregateBundle.artifact.file",
  );
  if (value.aggregateBundle.resultHash !== resultHash) {
    fail("manifest.downloads.aggregateBundle.resultHash has result hash drift");
  }
  expectHex(
    value.aggregateBundle.contentSetHash,
    HEX_64,
    "manifest.downloads.aggregateBundle.contentSetHash",
  );
  expectBoolean(
    value.aggregateBundle.participantLevelIncluded,
    false,
    "manifest.downloads.aggregateBundle.participantLevelIncluded",
  );
  expectBoolean(
    value.aggregateBundle.participantCsvPresent,
    false,
    "manifest.downloads.aggregateBundle.participantCsvPresent",
  );

  exactKeys(
    value.participantBundle,
    [
      "artifact",
      "resultHash",
      "contentSetHash",
      "participantLevelIncluded",
      "participantCsvPresent",
      "privacyWarningPresent",
      "participantCsvSha256",
    ],
    "manifest.downloads.participantBundle",
  );
  const participantArtifact = validateArtifactReference(
    value.participantBundle.artifact,
    "manifest.downloads.participantBundle.artifact",
    artifactMap,
    referencedArtifacts,
  );
  expectLiteral(
    participantArtifact.file,
    DOWNLOAD_SPECS.participant.file,
    "manifest.downloads.participantBundle.artifact.file",
  );
  if (value.participantBundle.resultHash !== resultHash) {
    fail("manifest.downloads.participantBundle.resultHash has result hash drift");
  }
  expectHex(
    value.participantBundle.contentSetHash,
    HEX_64,
    "manifest.downloads.participantBundle.contentSetHash",
  );
  expectBoolean(
    value.participantBundle.participantLevelIncluded,
    true,
    "manifest.downloads.participantBundle.participantLevelIncluded",
  );
  expectBoolean(
    value.participantBundle.participantCsvPresent,
    true,
    "manifest.downloads.participantBundle.participantCsvPresent",
  );
  expectBoolean(
    value.participantBundle.privacyWarningPresent,
    true,
    "manifest.downloads.participantBundle.privacyWarningPresent",
  );
  expectHex(
    value.participantBundle.participantCsvSha256,
    HEX_64,
    "manifest.downloads.participantBundle.participantCsvSha256",
  );
  if (
    value.aggregateBundle.contentSetHash
    === value.participantBundle.contentSetHash
  ) {
    fail("aggregate and participant bundle contentSetHash values must differ");
  }
  expectBoolean(
    value.standaloneMembersMatchAggregate,
    true,
    "manifest.downloads.standaloneMembersMatchAggregate",
  );

  const aggregate = validateLongitudinalZipBundle(
    artifactBytes.get(aggregateArtifact.file),
    "aggregate",
    false,
    resultHash,
  );
  const participant = validateLongitudinalZipBundle(
    artifactBytes.get(participantArtifact.file),
    "participant",
    true,
    resultHash,
  );
  if (
    !equalHex(
      value.aggregateBundle.contentSetHash,
      aggregate.manifest.contentSetHash,
    )
  ) {
    fail(
      "manifest.downloads.aggregateBundle.contentSetHash does not match "
      + "the independently verified aggregate bundle",
    );
  }
  if (
    !equalHex(
      value.participantBundle.contentSetHash,
      participant.manifest.contentSetHash,
    )
  ) {
    fail(
      "manifest.downloads.participantBundle.contentSetHash does not match "
      + "the independently verified participant bundle",
    );
  }
  const participantCsv = participant.archive.get("trajectory-participants.csv");
  if (!participantCsv) fail("participant bundle participant CSV is missing");
  const participantCsvSha256 = sha256(participantCsv.bytes);
  if (!equalHex(participantCsvSha256, value.participantBundle.participantCsvSha256)) {
    fail(
      "manifest.downloads.participantBundle.participantCsvSha256 does not match "
      + "the actual trajectory-participants.csv member",
    );
  }
  const participantRows = validateParticipantCsv(
    participantCsv.bytes,
    aggregate.analysis,
    aggregate.manifest,
    "participant trajectory-participants.csv",
  );
  validateParticipantHistoryBindings(
    participantRows,
    aggregate,
    "participant/aggregate longitudinal cross-binding",
  );
  if (aggregate.plotlyValidation.traceCount !== analysisTraceCount) {
    fail(
      "manifest.analysis.traceCount " + analysisTraceCount
      + " does not match the exact aggregate Plotly trace count "
      + aggregate.plotlyValidation.traceCount,
    );
  }
  for (const member of aggregate.manifest.members) {
    if (member.path === "plotly-spec.json") continue;
    const participantMember = participant.manifest.members.find(
      (candidate) => candidate.path === member.path,
    );
    if (!participantMember || !isDeepStrictEqual(participantMember, member)) {
      fail("participant shared non-Plotly member receipt differs: " + member.path);
    }
    if (
      !participant.archive.get(member.path).bytes.equals(
        aggregate.archive.get(member.path).bytes,
      )
    ) {
      fail("participant shared non-Plotly member bytes differ: " + member.path);
    }
  }
  if (
    participant.archive.get("plotly-spec.json").bytes.equals(
      aggregate.archive.get("plotly-spec.json").bytes,
    )
  ) {
    fail("participant Plotly member must differ from aggregate privacy scope");
  }
  const standaloneMapping = {
    path: "trajectory-path.csv",
    metadata: "trajectory-metadata.csv",
    inference: "trajectory-inference.csv",
    analysis: "analysis.json",
    plotly: "plotly-spec.json",
  };
  for (const [kind, memberPath] of Object.entries(standaloneMapping)) {
    const standalone = artifactBytes.get(itemArtifacts.get(kind).file);
    const bundled = aggregate.archive.get(memberPath).bytes;
    if (!standalone.equals(bundled)) {
      fail(
        "standalone " + kind + " download differs from aggregate ZIP member "
        + memberPath + "; standaloneMembersMatchAggregate cannot self-attest",
      );
    }
  }

  exactKeys(
    value.privacyDialog,
    [
      "type",
      "observed",
      "accepted",
      "dialogCount",
      "message",
      "messageSha256",
      "downloadObservedAfterAcceptance",
    ],
    "manifest.downloads.privacyDialog",
  );
  expectLiteral(value.privacyDialog.type, "confirm", "manifest.downloads.privacyDialog.type");
  expectBoolean(
    value.privacyDialog.observed,
    true,
    "manifest.downloads.privacyDialog.observed",
  );
  expectBoolean(
    value.privacyDialog.accepted,
    true,
    "manifest.downloads.privacyDialog.accepted (must be true)",
  );
  expectInteger(
    value.privacyDialog.dialogCount,
    "manifest.downloads.privacyDialog.dialogCount (must be exactly one)",
    { exact: 1 },
  );
  const message = expectString(
    value.privacyDialog.message,
    "manifest.downloads.privacyDialog.message",
    { nonEmpty: true },
  );
  if (!/participant-level/iu.test(message) || !/re-identification/iu.test(message)) {
    fail("manifest.downloads.privacyDialog.message must state participant-level re-identification risk");
  }
  const messageSha256 = expectHex(
    value.privacyDialog.messageSha256,
    HEX_64,
    "manifest.downloads.privacyDialog.messageSha256",
  );
  const observedMessageHash = sha256(Buffer.from(message, "utf8"));
  if (!equalHex(messageSha256, observedMessageHash)) {
    fail("manifest.downloads.privacyDialog.messageSha256 does not match the raw dialog message");
  }
  expectBoolean(
    value.privacyDialog.downloadObservedAfterAcceptance,
    true,
    "manifest.downloads.privacyDialog.downloadObservedAfterAcceptance",
  );
}

function validateControlPlaneBinding(
  deployment,
  run,
  artifactMap,
  artifactBytes,
  referencedArtifacts,
) {
  const receiptArtifact = validateArtifactReference(
    deployment.controlPlaneReceipt,
    "manifest.deployment.controlPlaneReceipt",
    artifactMap,
    referencedArtifacts,
  );
  expectLiteral(
    receiptArtifact.file,
    "control-plane/vercel-production-binding.json",
    "manifest.deployment.controlPlaneReceipt.file",
  );
  expectLiteral(
    receiptArtifact.mediaType,
    "application/json",
    "manifest.deployment.controlPlaneReceipt.mediaType",
  );
  const payload = parseStrictJson(
    artifactBytes.get(receiptArtifact.file),
    "control-plane Vercel production binding",
  );
  exactKeys(
    payload,
    [
      "schemaVersion",
      "aliasHost",
      "deploymentId",
      "deploymentUrl",
      "target",
      "readyState",
      "gitSha",
      "observedAt",
    ],
    "control-plane Vercel production binding",
  );
  expectLiteral(
    payload.schemaVersion,
    CONTROL_PLANE_SCHEMA,
    "control-plane.schemaVersion",
  );
  expectLiteral(payload.aliasHost, "ena.hk", "control-plane.aliasHost");
  if (payload.deploymentId !== deployment.deploymentId) {
    fail("control-plane deploymentId must match manifest deploymentId");
  }
  if (payload.deploymentUrl !== deployment.deploymentUrl) {
    fail("control-plane deploymentUrl must match manifest deploymentUrl");
  }
  expectLiteral(payload.target, "production", "control-plane.target");
  expectLiteral(payload.readyState, "READY", "control-plane.readyState");
  if (payload.gitSha !== deployment.gitSha) {
    fail("control-plane gitSha must match manifest deployment gitSha");
  }
  const observedAt = expectIsoTimestamp(payload.observedAt, "control-plane.observedAt");
  if (observedAt < run.startedAt || observedAt > run.completedAt) {
    fail("control-plane.observedAt must fall within the production browser run window");
  }
}

async function validateManifest(
  rootContext,
  manifest,
  manifestRelativePath,
  receiptRelativePath,
) {
  exactKeys(
    manifest,
    [
      "schemaVersion",
      "run",
      "target",
      "deployment",
      "source",
      "browser",
      "analysis",
      "viewports",
      "fullscreen",
      "cameras",
      "projections",
      "browserDiagnostics",
      "downloads",
      "artifacts",
      "contentSetHash",
    ],
    "manifest top-level",
  );
  expectLiteral(manifest.schemaVersion, MANIFEST_SCHEMA, "manifest.schemaVersion");
  const run = validateRun(manifest.run);
  validateTarget(manifest.target);
  const deployment = validateDeployment(manifest.deployment);
  validateSource(manifest.source, deployment);
  validateBrowser(manifest.browser);
  const analysis = validateAnalysis(manifest.analysis);

  const artifactMap = validateArtifactDeclarations(manifest);
  if (artifactMap.has(manifestRelativePath)) {
    fail("manifest file must not also be declared as an artifact");
  }
  if (artifactMap.has(receiptRelativePath)) {
    fail("receipt path must not also be declared as an artifact");
  }
  const referencedArtifacts = preflightArtifactReferenceGraph(manifest, artifactMap);
  const loadedArtifacts = await loadAndVerifyArtifacts(rootContext, artifactMap);
  preflightPngAggregateBudget(artifactMap, loadedArtifacts.artifactBytes);

  validateControlPlaneBinding(
    deployment,
    run,
    artifactMap,
    loadedArtifacts.artifactBytes,
    referencedArtifacts,
  );
  validateViewports(
    manifest.viewports,
    analysis.resultHash,
    artifactMap,
    loadedArtifacts.artifactBytes,
    referencedArtifacts,
  );
  validateFullscreen(
    manifest.fullscreen,
    analysis.resultHash,
    artifactMap,
    loadedArtifacts.artifactBytes,
    referencedArtifacts,
  );
  validateCameras(
    manifest.cameras,
    analysis.resultHash,
    artifactMap,
    loadedArtifacts.artifactBytes,
    referencedArtifacts,
  );
  validateProjections(
    manifest.projections,
    analysis.resultHash,
    analysis.dimensionLabels,
    artifactMap,
    loadedArtifacts.artifactBytes,
    referencedArtifacts,
  );
  const rawBrowserEvents = validateBrowserDiagnostics(
    manifest.browserDiagnostics,
    run,
    artifactMap,
    loadedArtifacts.artifactBytes,
    referencedArtifacts,
  );
  validateDownloads(
    manifest.downloads,
    analysis.resultHash,
    analysis.traceCount,
    artifactMap,
    loadedArtifacts.artifactBytes,
    referencedArtifacts,
  );
  validateRawBrowserEventSemantics(rawBrowserEvents, manifest);

  const unreferenced = [...artifactMap.keys()].filter(
    (file) => !referencedArtifacts.has(file),
  );
  if (unreferenced.length > 0) {
    fail("manifest contains unreferenced artifact(s): " + unreferenced.join(", "));
  }
  if (referencedArtifacts.size !== artifactMap.size) {
    fail("artifact exact reference set does not match manifest.artifacts");
  }

  return {
    artifactCount: artifactMap.size,
    artifactSnapshots: loadedArtifacts.artifactSnapshots,
    contentSetHash: manifest.contentSetHash,
    deploymentId: deployment.deploymentId,
    gitSha: deployment.gitSha,
    resultHash: analysis.resultHash,
    runId: run.runId,
  };
}

async function ensureRootStable(rootContext) {
  let current;
  try {
    current = await lstat(rootContext.inputRoot, { bigint: true });
  } catch (error) {
    fail("evidence root changed during verification: " + error.message);
  }
  if (
    current.isSymbolicLink()
    || !current.isDirectory()
    || current.dev !== rootContext.rootStats.dev
    || current.ino !== rootContext.rootStats.ino
  ) {
    fail("evidence root changed identity during verification");
  }
  const canonical = await realpath(rootContext.inputRoot);
  if (canonical !== rootContext.canonicalRoot) {
    fail("evidence root changed canonical identity during verification");
  }
}

async function assertReceiptDoesNotExist(rootContext, receiptRelativePath) {
  const parent = await inspectParentDirectory(
    rootContext,
    receiptRelativePath,
    "receipt path",
  );
  const destination = join(
    rootContext.inputRoot,
    ...validateStrictRelativePath(receiptRelativePath, "receipt relative path"),
  );
  try {
    await lstat(destination, { bigint: true });
    fail("receipt already exists; exclusive receipt creation refuses to overwrite it");
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    if (error.code !== "ENOENT") {
      fail("receipt path cannot be inspected: " + error.message);
    }
  }
  return { destination, parent };
}

async function writeReceiptExclusive(
  rootContext,
  receiptRelativePath,
  bytes,
  beforePublish,
) {
  const initial = await assertReceiptDoesNotExist(rootContext, receiptRelativePath);
  const temporaryName = "."
    + basename(receiptRelativePath)
    + ".tmp-"
    + process.pid
    + "-"
    + randomBytes(12).toString("hex");
  const temporaryPath = join(initial.parent.absolute, temporaryName);
  let handle;
  let parentHandle;
  let temporaryStats;
  let published = false;
  const intendedSha256 = sha256(bytes);
  try {
    const directoryFlags = fsConstants.O_RDONLY
      | (typeof fsConstants.O_DIRECTORY === "number" ? fsConstants.O_DIRECTORY : 0)
      | (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);
    parentHandle = await open(initial.parent.absolute, directoryFlags);
    const parentDescriptorStats = await parentHandle.stat({ bigint: true });
    if (
      !parentDescriptorStats.isDirectory()
      || parentDescriptorStats.dev !== initial.parent.stats.dev
      || parentDescriptorStats.ino !== initial.parent.stats.ino
    ) {
      fail("receipt parent descriptor does not match the inspected parent directory");
    }
    handle = await open(
      temporaryPath,
      fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL,
      0o600,
    );
    await handle.writeFile(bytes);
    await handle.sync();
    temporaryStats = await handle.stat({ bigint: true });
    if (
      !temporaryStats.isFile()
      || temporaryStats.size !== BigInt(bytes.length)
      || temporaryStats.nlink !== 1n
    ) {
      fail("temporary receipt was not written as one complete regular file");
    }
    if (
      process.env.NODE_ENV === "test"
      && process.env.OPEN_ENA_VERIFIER_TEST_MUTATE_RECEIPT_SAME_LENGTH === "1"
    ) {
      const mutated = Buffer.from(bytes);
      mutated[Math.floor(mutated.length / 2)] ^= 0x01;
      await handle.write(mutated, 0, mutated.length, 0);
      await handle.sync();
    }
    const preLinkBefore = await handle.stat({ bigint: true });
    const preLinkBytes = await readBytesFromHandle(
      handle,
      preLinkBefore.size,
      "temporary receipt",
      bytes.length,
    );
    const preLinkAfter = await handle.stat({ bigint: true });
    if (
      !stableStats(preLinkBefore, preLinkAfter)
      || !preLinkBytes.equals(bytes)
      || !equalHex(sha256(preLinkBytes), intendedSha256)
    ) {
      fail("temporary receipt bytes/SHA-256 do not match the intended receipt");
    }
    if (beforePublish) await beforePublish();
    await ensureRootStable(rootContext);
    const current = await assertReceiptDoesNotExist(
      rootContext,
      receiptRelativePath,
    );
    if (
      current.parent.stats.dev !== initial.parent.stats.dev
      || current.parent.stats.ino !== initial.parent.stats.ino
    ) {
      fail("receipt parent directory changed identity before exclusive creation");
    }
    const temporaryPathStats = await lstat(temporaryPath, { bigint: true });
    if (
      temporaryPathStats.isSymbolicLink()
      || !temporaryPathStats.isFile()
      || temporaryPathStats.dev !== temporaryStats.dev
      || temporaryPathStats.ino !== temporaryStats.ino
      || temporaryPathStats.size !== temporaryStats.size
      || temporaryPathStats.nlink !== 1n
    ) {
      fail("temporary receipt path changed identity before exclusive creation");
    }
    const finalPreLinkBefore = await handle.stat({ bigint: true });
    const finalPreLinkBytes = await readBytesFromHandle(
      handle,
      finalPreLinkBefore.size,
      "temporary receipt immediately before publication",
      bytes.length,
    );
    const finalPreLinkAfter = await handle.stat({ bigint: true });
    if (
      !stableStats(finalPreLinkBefore, finalPreLinkAfter)
      || finalPreLinkAfter.dev !== temporaryStats.dev
      || finalPreLinkAfter.ino !== temporaryStats.ino
      || !finalPreLinkBytes.equals(bytes)
      || !equalHex(sha256(finalPreLinkBytes), intendedSha256)
    ) {
      fail("temporary receipt bytes/SHA-256 changed before atomic publication");
    }
    try {
      await link(temporaryPath, current.destination);
      published = true;
    } catch (error) {
      if (error.code === "EEXIST") {
        fail("receipt already exists; exclusive receipt creation failed with EEXIST");
      }
      fail("receipt could not be created exclusively: " + error.message);
    }
    // The exclusive hard-link above is the single commit point. All receipt and
    // evidence validation has already completed. From this point onward, cleanup
    // and durability sync are best-effort diagnostics and may never downgrade a
    // visible PASS into a failing process with a residual PASS receipt.
    try {
      if (
        process.env.NODE_ENV === "test"
        && process.env.OPEN_ENA_VERIFIER_TEST_FAIL_POST_PUBLISH_TEMP_UNLINK_PERSISTENT === "1"
      ) {
        const injected = new Error("test-only injected post-publication temporary cleanup EBUSY");
        injected.code = "EBUSY";
        throw injected;
      }
      await unlink(temporaryPath);
    } catch (error) {
      writeWarning(
        "post-publication temporary receipt cleanup failed; committed PASS remains valid: "
        + error.message,
      );
    }
    try {
      await parentHandle.sync();
    } catch (error) {
      writeWarning(
        "post-publication receipt directory sync failed after atomic commit: "
        + error.message,
      );
    }
    return {
      destination: current.destination,
      dev: temporaryStats.dev,
      ino: temporaryStats.ino,
      parentAbsolute: initial.parent.absolute,
      receiptSha256: intendedSha256,
    };
  } catch (error) {
    if (!published) {
      let temporaryCleanupError;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          if (
            process.env.NODE_ENV === "test"
            && process.env.OPEN_ENA_VERIFIER_TEST_FAIL_TEMP_RECEIPT_UNLINK_PERSISTENT === "1"
          ) {
            const injected = new Error("test-only injected persistent temporary unlink EBUSY");
            injected.code = "EBUSY";
            throw injected;
          }
          await unlink(temporaryPath);
          temporaryCleanupError = undefined;
          break;
        } catch (caught) {
          if (caught.code === "ENOENT") {
            temporaryCleanupError = undefined;
            break;
          }
          temporaryCleanupError = caught;
        }
      }
      if (temporaryCleanupError) {
        let destinationAbsent = false;
        try {
          await lstat(initial.destination, { bigint: true });
        } catch (caught) {
          if (caught.code === "ENOENT") destinationAbsent = true;
          else temporaryCleanupError = caught;
        }
        if (!destinationAbsent) {
          fail(
            "HIGH PRIORITY: temporary receipt cleanup failed and receipt destination "
            + "absence could not be proven: " + temporaryCleanupError.message,
          );
        }
        fail(
          "HIGH PRIORITY: temporary receipt cleanup failed while receipt destination "
          + "is proven absent (destination does not exist): "
          + temporaryCleanupError.message
          + "; original verification error: "
          + (error instanceof Error ? error.message : String(error)),
        );
      }
    }
    throw error;
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // Preserve the original verification error.
      }
    }
    if (parentHandle) {
      try {
        await parentHandle.close();
      } catch {
        // Preserve the primary verification error.
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4) {
    fail(
      "usage: verify-open-ena-production-browser-run.mjs "
      + "<evidence-root> <manifest-relative-path> "
      + "<externally-pinned-manifest-sha256> <receipt-relative-path>",
    );
  }
  const [
    rootArgument,
    manifestRelativePath,
    expectedManifestSha256,
    receiptRelativePath,
  ] = args;
  validateStrictRelativePath(manifestRelativePath, "manifest relative path");
  validateStrictRelativePath(receiptRelativePath, "receipt relative path");
  if (manifestRelativePath === receiptRelativePath) {
    fail("manifest and receipt relative paths must be different");
  }
  expectHex(
    expectedManifestSha256,
    HEX_64,
    "externally pinned manifest SHA-256",
  );

  let rootContext;
  let committedReceipt;
  try {
    rootContext = await establishRoot(rootArgument);
    await assertReceiptDoesNotExist(rootContext, receiptRelativePath);
    const loadedManifest = await readCustodiedFile(
      rootContext,
      manifestRelativePath,
      "manifest",
      { maxBytes: MAX_MANIFEST_BYTES },
    );
    if (loadedManifest.bytes.length > MAX_MANIFEST_BYTES) {
      fail("manifest exceeds the " + MAX_MANIFEST_BYTES + "-byte safety limit");
    }
    if (!equalHex(loadedManifest.snapshot.digest, expectedManifestSha256)) {
      fail("manifest SHA-256 does not match the externally pinned digest");
    }
    const manifest = parseStrictJson(loadedManifest.bytes, "manifest");
    const verified = await validateManifest(
      rootContext,
      manifest,
      manifestRelativePath,
      receiptRelativePath,
    );

    assertUniqueInputInodes(rootContext.openSnapshots);
    await ensureRootStable(rootContext);
    for (const snapshot of rootContext.openSnapshots) {
      const label = snapshot.relativePath === manifestRelativePath
        ? "manifest"
        : "artifact " + snapshot.relativePath;
      await revalidateSnapshot(rootContext, snapshot, label);
    }
    await assertReceiptDoesNotExist(rootContext, receiptRelativePath);

    const receipt = {
      schemaVersion: VERIFICATION_SCHEMA,
      status: "PASS",
      custodyModel: "single-writer-open-descriptor-snapshot-v1",
      evidenceLevel: "browser-observation-consistency",
      browserEventAuthenticity: "not-cryptographically-proven",
      input: {
        manifestFile: manifestRelativePath,
        manifestSha256: expectedManifestSha256,
      },
      contentSetHash: verified.contentSetHash,
      runId: verified.runId,
      deploymentId: verified.deploymentId,
      gitSha: verified.gitSha,
      resultHash: verified.resultHash,
      artifactCount: verified.artifactCount,
      verifiedAt: new Date().toISOString(),
    };
    const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2) + "\n", "utf8");
    committedReceipt = await writeReceiptExclusive(
      rootContext,
      receiptRelativePath,
      receiptBytes,
      async () => {
        await ensureRootStable(rootContext);
        assertUniqueInputInodes(rootContext.openSnapshots);
        for (const snapshot of rootContext.openSnapshots) {
          const label = snapshot.relativePath === manifestRelativePath
            ? "manifest final input revalidation before receipt publication"
            : "artifact final input revalidation before receipt publication "
              + snapshot.relativePath;
          await revalidateSnapshot(rootContext, snapshot, label);
        }
        await assertReceiptDoesNotExist(rootContext, receiptRelativePath);
        if (
          process.env.NODE_ENV === "test"
          && process.env.OPEN_ENA_VERIFIER_TEST_FAIL_BEFORE_RECEIPT_PUBLISH === "1"
        ) {
          fail("test-only injected failure before receipt publication after final input revalidation");
        }
      },
    );
    process.stdout.write(
      "PASS: verified production browser evidence and wrote exclusive receipt "
      + receiptRelativePath
      + " receiptSha256=" + committedReceipt.receiptSha256
      + "\n",
    );
  } finally {
    if (rootContext) await closeOpenSnapshots(rootContext);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write("ERROR: " + message + "\n");
  process.exitCode = 1;
});
