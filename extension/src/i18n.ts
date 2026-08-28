type PtUiLocale = "en" | "ru";
type PtUiLanguage = "auto" | PtUiLocale;
type PtMessageEntry = { message: string };

const PT_UI_LANGUAGE_KEY = "uiLanguage";
let ptUiLocale: PtUiLocale = (browser.i18n.getUILanguage() || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
let ptMessages: Record<string, PtMessageEntry> = {};
let ptLoadedLocale: PtUiLocale | undefined;

function ptResolveLocale(setting: unknown): PtUiLocale {
  if (setting === "ru" || setting === "en") return setting;
  return (browser.i18n.getUILanguage() || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
}

async function ptInitializeI18n() {
  const stored = await browser.storage.local.get(PT_UI_LANGUAGE_KEY);
  ptUiLocale = ptResolveLocale(stored[PT_UI_LANGUAGE_KEY]);
  if (ptLoadedLocale !== ptUiLocale) {
    const response = await fetch(browser.runtime.getURL(`_locales/${ptUiLocale}/messages.json`));
    if (!response.ok) throw new Error(`Could not load ${ptUiLocale} translations.`);
    ptMessages = await response.json() as Record<string, PtMessageEntry>;
    ptLoadedLocale = ptUiLocale;
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = ptUiLocale;
    ptApplyDocumentTranslations();
  }
  return ptUiLocale;
}

function ptMessage(key: string, substitutions: Array<string | number> = []) {
  const template = ptMessages[key]?.message || browser.i18n.getMessage(key, substitutions.map(String)) || key;
  return substitutions.reduce<string>(
    (value, substitution, index) => value.replace(new RegExp(`\\$${index + 1}`, "gi"), String(substitution)),
    template
  ).replace(/\$\$/g, "$");
}

function ptApplyDocumentTranslations(root: ParentNode = document) {
  if (typeof document === "undefined") return;
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach(element => {
    element.textContent = ptMessage(element.dataset.i18n || "");
  });
  for (const attribute of ["aria-label", "placeholder", "title", "data-placeholder"] as const) {
    const dataName = `i18n${attribute.split("-").map(part => part[0].toUpperCase() + part.slice(1)).join("")}`;
    root.querySelectorAll<HTMLElement>(`[data-i18n-${attribute}]`).forEach(element => {
      const key = element.dataset[dataName as keyof DOMStringMap];
      if (key) element.setAttribute(attribute, ptMessage(key));
    });
  }
  document.title = ptMessage(document.body.dataset.i18nDocumentTitle || "extension_name");
}

function ptFormatNumber(value: number) {
  return new Intl.NumberFormat(ptUiLocale).format(value);
}

function ptFormatDate(value: Date) {
  return new Intl.DateTimeFormat(ptUiLocale).format(value);
}

function ptFormatDateTime(value: Date) {
  return new Intl.DateTimeFormat(ptUiLocale, { dateStyle: "short", timeStyle: "short" }).format(value);
}

function ptPluralKey(prefix: string, count: number) {
  const category = new Intl.PluralRules(ptUiLocale).select(count);
  const candidate = `${prefix}_${category}`;
  return ptMessages[candidate] ? candidate : `${prefix}_other`;
}

function ptCountMessage(prefix: string, count: number) {
  return ptMessage(ptPluralKey(prefix, count), [ptFormatNumber(count)]);
}

function ptNativeProgress(message: unknown, status?: unknown) {
  if (message === "Собираю EPUB…") return ptMessage("progress_building_epub");
  if (message === "Отправляю книгу через SMTP…") return ptMessage("progress_sending_smtp");
  if (typeof message === "string" && message) return message;
  return status === "sending" ? ptMessage("progress_sending_smtp") : ptMessage("progress_building_epub");
}
