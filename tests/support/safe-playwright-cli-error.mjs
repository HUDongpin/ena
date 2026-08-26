function readSanitizedOutput(caught, key, redact) {
  if (!caught || typeof caught !== "object" || !(key in caught)) return "";
  return redact(caught[key]);
}

export function createSafePlaywrightCliError({ caught, label, redact }) {
  const stdout = readSanitizedOutput(caught, "stdout", redact);
  const stderr = readSanitizedOutput(caught, "stderr", redact);
  const details = (stdout + "\n" + stderr).trim().slice(-10_000);

  return new Error(
    "Playwright CLI failed during " + label + (details ? ".\n" + details : "."),
  );
}
