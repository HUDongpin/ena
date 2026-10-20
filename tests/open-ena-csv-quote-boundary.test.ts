import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "../lib/open-ena/csv";

const options = { name: "synthetic.csv", source: "upload" as const };

test("CSV rejects characters after a closing quote instead of joining them into a different source value", () => {
  for (const cell of ['"1"0', '"u1"suffix', '""2', '"1" ', '"1"\t']) {
    assert.throws(() => parseCsv(`unit,A\nu1,${cell}`, options), /after.*quote/iu, cell);
  }
  assert.throws(() => parseCsv('unit,"A"B\nu1,1', options), /after.*quote/iu, "headers must not be silently joined either");
});

test("CSV preserves escaped quotes, quoted newlines, and every valid closing-quote delimiter", () => {
  for (const newline of ["\n", "\r", "\r\n"]) {
    const result = parseCsv(`"unit","A","note"${newline}"u1","1","say ""hi"""${newline}"u2","2","line one${newline}line two"`, options);
    assert.deepEqual(result.rows, [
      { unit: "u1", A: "1", note: 'say "hi"' },
      { unit: "u2", A: "2", note: `line one${newline}line two` },
    ]);
  }
});
