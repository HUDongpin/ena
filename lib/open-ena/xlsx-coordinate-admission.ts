import { unzipSync } from "fflate";
import { Parser } from "saxen";

/** Native ISO date cells become millisecond Date values in the reader. Admit
 * their source tokens before that irreversible normalization can erase an
 * invalid calendar, unknown time zone, or nonzero sub-millisecond precision.
 */
function assertNativeDateToken(value: string) {
  if (value === "") return; // Match the reader's empty date-cell representation.
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2}))?$/u.exec(value);
  if (!match) throw new Error("Worksheet date cells require ISO dates or datetimes with an explicit offset.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", offset] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new Error("Worksheet date cell contains an invalid calendar date.");
  }
  if (hourText !== undefined) {
    const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
    if (hour > 24 || minute > 59 || second > 59
      || (hour === 24 && (minute !== 0 || second !== 0 || /[1-9]/u.test(fraction)))) {
      throw new Error("Worksheet date cell contains an invalid clock time.");
    }
    if (offset !== "Z") {
      const offsetHour = Number(offset.slice(1, 3)), offsetMinute = Number(offset.slice(4, 6));
      if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0) || offset === "-00:00") {
        throw new Error("Worksheet date cell contains an unsupported or unknown ISO offset.");
      }
    }
    if (/[1-9]/u.test(fraction.slice(3))) {
      throw new Error("Worksheet date cell precision exceeds exact millisecond storage.");
    }
  }
}

/** The ZIP directory/expansion budget must be admitted before this function.
 * Inspect only workbook routing and the selected first worksheet. The reader
 * fills coordinate gaps before it returns rows, so post-parse limits are late.
 */
export function assertXlsxCoordinateAdmission(
  buffer: ArrayBuffer,
  limits: { rows: number; columns: number },
): void {
  const archive = new Uint8Array(buffer);
  const routingNames = new Set(["xl/workbook.xml", "xl/_rels/workbook.xml.rels"]);
  const routing = unzipSync(archive, { filter: (entry) => routingNames.has(entry.name) });
  function decodeXml(bytes: Uint8Array): string {
    // Match XML 1.0 normalization before decoding character references or CDATA.
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\r\n?/gu, "\n"); }
    catch { throw new Error("The XLSX worksheet contains invalid UTF-8 cell text or metadata."); }
  }
  function assertUtf8(bytes: Uint8Array | undefined) {
    if (!bytes) return; // Optional metadata uses the reader's empty fallback.
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
      // Validate without retaining another full shared-string/style XML text.
      for (let offset = 0; offset < bytes.length; offset += 65_536) {
        decoder.decode(bytes.subarray(offset, offset + 65_536), { stream: true });
      }
      decoder.decode();
    } catch { throw new Error("The XLSX worksheet contains invalid UTF-8 cell text or metadata."); }
  }
  function xml(bytes: Uint8Array | undefined, onTag: (name: string, attributes: Record<string, string>) => void, onClose?: (name: string) => void, onText?: (text: string) => void) {
    if (!bytes) throw new Error("The XLSX workbook is missing its first worksheet routing.");
    // Match the reader's namespace and entity handling; never scan XML with
    // regular expressions or trust the optional, advisory dimension element.
    const parser = new Parser({ proxy: true });
    parser.ns();
    parser.on("error", (error) => { throw error; });
    parser.on("openTag", (element, decodeEntities) => {
      const attributes = Object.fromEntries(Object.entries(element.attrs).map(([key, value]) => [key, decodeEntities(value)]));
      onTag(element.originalName.replace(/^.*:/u, ""), attributes);
    });
    if (onClose) parser.on("closeTag", (element) => onClose(element.originalName.replace(/^.*:/u, "")));
    if (onText) {
      parser.on("text", (text, decodeEntities) => onText(decodeEntities(text)));
      // CDATA is literal text, including any entity-like sequences.
      parser.on("cdata", onText);
    }
    parser.parse(decodeXml(bytes));
  }

  let firstSheetSeen = false;
  let relationId: string | undefined;
  xml(routing["xl/workbook.xml"], (name, attributes) => {
    if (name === "sheet" && attributes.name && !firstSheetSeen) {
      firstSheetSeen = true;
      relationId = attributes["r:id"];
    }
  });
  if (!relationId) throw new Error("The XLSX workbook is missing its first worksheet relationship.");
  let worksheetPath: string | undefined;
  let sharedStringsPath = "xl/sharedStrings.xml";
  let stylesPath = "xl/styles.xml";
  const targetPath = (target: string) => target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  xml(routing["xl/_rels/workbook.xml.rels"], (name, attributes) => {
    if (name === "Relationship" && attributes.Id === relationId
      && attributes.Type === "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet") {
      const target = attributes.Target;
      if (!target) throw new Error("The XLSX workbook has an invalid worksheet target.");
      worksheetPath = targetPath(target);
    } else if (name === "Relationship" && attributes.Target) {
      if (attributes.Type === "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings") sharedStringsPath = targetPath(attributes.Target);
      else if (attributes.Type === "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles") stylesPath = targetPath(attributes.Target);
    }
  });
  if (!worksheetPath) throw new Error("The XLSX workbook is missing its first worksheet target.");
  // Match the reader's selected metadata, including relationship overrides and
  // default fallbacks. A replacement decoder can otherwise merge distinct Unit
  // identifiers before scientific validation ever sees the source values.
  const selectedNames = new Set([worksheetPath, sharedStringsPath, stylesPath]);
  const worksheets = unzipSync(archive, { filter: (entry) => selectedNames.has(entry.name) });
  assertUtf8(worksheets[sharedStringsPath]);
  assertUtf8(worksheets[stylesPath]);
  let physicalRows = 0;
  let materializedRows = 0;
  let rowNumber: number | undefined;
  let dateCell = false, inValue = false, dateValue = "";
  function row(value: number) {
    if (!Number.isSafeInteger(value) || value < 1 || value > limits.rows) {
      throw new Error(`Worksheet row coordinates exceed the ${limits.rows.toLocaleString()}-row browser limit (including the header).`);
    }
  }
  xml(worksheets[worksheetPath], (name, attributes) => {
    if (name === "row") {
      row(++physicalRows);
      rowNumber = attributes.r === undefined ? undefined : Number(attributes.r);
      if (rowNumber !== undefined) row(rowNumber);
    } else if (name === "c") {
      dateCell = attributes.t === "d"; inValue = false; dateValue = "";
      const coordinate = /^([A-Z]+)([1-9]\d*)$/u.exec(attributes.r ?? "");
      if (!coordinate) throw new Error("Worksheet cell has an invalid row or column coordinate.");
      row(Number(coordinate[2]));
      rowNumber ??= Number(coordinate[2]);
      let column = 0;
      for (const letter of coordinate[1]) {
        column = column * 26 + letter.charCodeAt(0) - 64;
        if (column > limits.columns) throw new Error(`Worksheet column coordinates exceed the ${limits.columns}-column browser limit.`);
      }
    } else if (name === "v" && dateCell) {
      inValue = true;
    }
  }, (name) => {
    if (name === "v") inValue = false;
    else if (name === "c") {
      if (dateCell) assertNativeDateToken(dateValue);
      dateCell = false; inValue = false;
    } else if (name === "row") {
      // Implicit empty rows after an explicit sparse row still consume slots.
      materializedRows = Math.max(materializedRows + 1, rowNumber ?? 0);
      row(materializedRows);
      rowNumber = undefined;
    }
  }, (text) => {
    if (dateCell && inValue) dateValue += text;
  });
}
