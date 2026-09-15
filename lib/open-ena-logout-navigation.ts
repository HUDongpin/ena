import { isLocale } from "./i18n";

export const OPEN_ENA_LOGOUT_ACTION = "/api/open-ena/logout";

export type OpenEnaLogoutDomNode = {
  setAttribute(name: string, value: string): void;
  appendChild(node: OpenEnaLogoutDomNode): OpenEnaLogoutDomNode;
  submit(): void;
};

export type OpenEnaLogoutDocumentHost = {
  createElement(tagName: string): OpenEnaLogoutDomNode;
  body: { appendChild(node: OpenEnaLogoutDomNode): OpenEnaLogoutDomNode };
};

export type OpenEnaLogoutSubmitEvent = {
  preventDefault(): void;
  stopPropagation(): void;
  currentTarget: {
    getAttribute(name: string): string | null;
    elements: { namedItem(name: string): unknown };
  };
};

function fieldValue(field: unknown) {
  if (field && typeof field === "object" && "value" in field && typeof field.value === "string") {
    return field.value;
  }
  return "en";
}

function documentHost(host?: OpenEnaLogoutDocumentHost) {
  return host ?? (globalThis as { document?: OpenEnaLogoutDocumentHost }).document;
}

// Detached HTMLFormElement.submit() issues a document POST. That avoids the
// App Router reusing the authenticated /open-ena RSC payload after a same-URL 303.
export function submitOpenEnaLogoutAsDocumentRequest(
  event: OpenEnaLogoutSubmitEvent,
  host?: OpenEnaLogoutDocumentHost,
) {
  event.preventDefault();
  event.stopPropagation();
  const root = documentHost(host);
  if (!root) return;

  const localeValue = fieldValue(event.currentTarget.elements.namedItem("locale"));
  const locale = isLocale(localeValue) ? localeValue : "en";
  const action = event.currentTarget.getAttribute("action") || OPEN_ENA_LOGOUT_ACTION;
  const form = root.createElement("form");
  form.setAttribute("action", action);
  form.setAttribute("method", "post");
  form.setAttribute("hidden", "hidden");
  const localeInput = root.createElement("input");
  localeInput.setAttribute("type", "hidden");
  localeInput.setAttribute("name", "locale");
  localeInput.setAttribute("value", locale);
  form.appendChild(localeInput);
  root.body.appendChild(form);
  form.submit();
}
