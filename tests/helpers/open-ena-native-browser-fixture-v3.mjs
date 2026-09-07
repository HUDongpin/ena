// Researcher UI actions only. Imported datasets, compiler and Worker remain authoritative.
export async function prepareNativeFixtureV3(page, { codes = ["CODE_A", "CODE_B", "CODE_C", "CODE_D", "CODE_E"], family = "standard", sourcePreparation = true, units = ["Group", "Name"], horizons = ["Conversation"], group = "Group", backward = 5 } = {}) {
  const tab = name => page.getByRole("tab", { name: new RegExp(`^${name}(,|$)`) });
  const button = name => page.getByRole("button", { name, exact: true });
  if (sourcePreparation) {
    await button("Confirm types and create typed XLSX").waitFor();
    for (const code of codes) await page.getByRole("combobox", { name: `Source type: ${code}`, exact: true }).selectOption("number");
    const turn = page.getByRole("combobox", { name: "Source type: Turn", exact: true });
    if (await turn.count()) await turn.selectOption("number");
    await button("Confirm types and create typed XLSX").click();
  }
  await page.getByRole("navigation", { name: "Analysis modes" }).getByRole("button", { name: "Model", exact: true }).click();
  await tab("Codes").click();
  await page.getByRole("radio", { name: family === "ona" ? /^Ordered Network Analysis/ : /^Standard ENA/ }).check();
  await tab("Units").click();
  const unitRegion = page.getByRole("region", { name: "Unit fields", exact: true });
  await button("Add or remove Unit fields fields").click();
  for (const name of units) await unitRegion.getByRole("checkbox", { name, exact: true }).check();
  const selectedUnits = await unitRegion.getByRole("checkbox").evaluateAll(nodes => nodes.filter(node => node.checked).map(node => node.parentElement.textContent.trim()));
  if (JSON.stringify(selectedUnits) !== JSON.stringify(units)) throw new Error("native Unit identity differs from explicit ordered fixture fields");
  await button("Add or remove Unit fields fields").click();
  await page.getByRole("combobox", { name: "Create Sample / Group", exact: true }).selectOption(group);
  await tab("Horizons").click();
  await button("Add or remove Horizon identity fields").click();
  for (const name of horizons) await page.getByRole("region", { name: "Horizon identity", exact: true }).getByRole("checkbox", { name, exact: true }).check();
  await button("Add or remove Horizon identity fields").click();
  await tab("Codes").click();
  await page.getByRole("toolbar", { name: "Code actions", exact: true }).getByRole("button", { name: "Manage Codes", exact: true }).click();
  for (const code of codes) await page.getByRole("checkbox", { name: `Select ${code} as a Code`, exact: true }).check();
  await button("Close Code manager").click();
  await tab("Windows").click();
  if (family === "standard") {
    await page.getByRole("combobox", { name: "Model", exact: true }).selectOption("EndPoint");
    await page.getByRole("combobox", { name: "Window", exact: true }).selectOption("MovingStanzaWindow");
  }
  {
    await page.getByLabel("Use source order", { exact: true }).check();
    await button("Review source-order statement").click();
    await button("Accept statement").click();
    await page.getByRole("group", { name: "Backward context", exact: true }).getByRole("textbox", { name: "Rows", exact: true }).fill(String(backward));
  }
  return { units: selectedUnits, codes, family, horizons };
}
export async function runNativeFixtureV3(page) {
  const run = page.getByRole("button", { name: "Run model", exact: true });
  if (!await run.isEnabled()) throw new Error("native fixture compilation did not enable Run model");
  await run.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current", null, { timeout: 60000 });
}

export async function nativeFixtureIdentitiesV3(page) {
  return page.evaluate(() => {
    const audit = window.__openEnaNativeAudit;
    const response = audit?.responses.at(-1);
    const request = audit?.requests.find(value => value.id === response?.id);
    const result = response?.result;
    if (!request || response.executionPlanSha256 !== request.plan.header.executionPlanSha256 || response.executionPlanSha256 !== result.binding.executionPlanSha256 || result.binding.datasetSha256 !== request.plan.header.datasetSha256) throw new Error("native fixture identity lacks matching current request/result binding");
    if (document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") !== "current") throw new Error("native fixture identity is stale");
    const labels = result.executionProvenance.labels.codes;
    if (new Set(labels.map(value => value.sourceColumn)).size !== labels.length || new Set(labels.map(value => value.column)).size !== labels.length) throw new Error("native Code source/rendered mapping must be bijective");
    return { codes: labels, dictionary: result.executionProvenance.identityDictionary, binding: result.binding, configuration: result.configuration };
  });
}
