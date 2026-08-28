const result = document.querySelector<HTMLParagraphElement>("#result")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const loadTest = document.querySelector<HTMLButtonElement>("#load-test")!;
const grayscale = document.querySelector<HTMLInputElement>("#grayscale")!;
const senderEmail = document.querySelector<HTMLInputElement>("#sender-email")!;
const kindleEmail = document.querySelector<HTMLInputElement>("#kindle-email")!;
const amazonApproved = document.querySelector<HTMLInputElement>("#amazon-approved")!;
const pocketBookEmail = document.querySelector<HTMLInputElement>("#pocketbook-email")!;
const pocketBookApproved = document.querySelector<HTMLInputElement>("#pocketbook-approved")!;
const defaultDestination = document.querySelector<HTMLSelectElement>("#default-destination")!;
const uiLanguage = document.querySelector<HTMLSelectElement>("#ui-language")!;

type DestinationId = "kindle" | "pocketbook";
type DeliveryDestination = {
  id: DestinationId;
  kind: DestinationId;
  email: string;
  senderApproved: boolean;
};
type NativeSettings = {
  senderEmail: string;
  destinations: DeliveryDestination[];
  defaultDestinationId: DestinationId;
  passwordConfigured: boolean;
  passwordProtected: boolean;
};
type NativeReply = {
  ok?: boolean;
  configOk?: boolean;
  error?: string;
  code?: string;
  hostVersion?: string;
  payloadBytes?: number;
  elapsedMs?: number;
  settings?: NativeSettings;
};

let currentSettings: NativeSettings | undefined;
let hostAvailable = false;
let approvedSenderEmail = "";

function show(message: string, ok = false) {
  result.textContent = message;
  result.className = ok ? "ok" : "error";
}

function setCheck(name: string, state: "ok" | "error" | "pending", text: string) {
  const item = document.querySelector<HTMLLIElement>(`[data-check="${name}"]`)!;
  item.className = state === "pending" ? "" : state;
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.classList.add("status-icon");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  const paths = state === "ok" ? ["M3 8.5 6.2 12 13 4"]
    : state === "error" ? ["M4 4 12 12", "M12 4 4 12"]
    : ["M3 8h10"];
  for (const data of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", data);
    icon.append(path);
  }
  const label = document.createElement("span");
  label.textContent = text;
  item.replaceChildren(icon, label);
}

function formDestinations(): DeliveryDestination[] {
  const destinations: DeliveryDestination[] = [];
  const kindle = kindleEmail.value.trim();
  const pocketbook = pocketBookEmail.value.trim();
  if (kindle) destinations.push({ id: "kindle", kind: "kindle", email: kindle, senderApproved: amazonApproved.checked });
  if (pocketbook) destinations.push({ id: "pocketbook", kind: "pocketbook", email: pocketbook, senderApproved: pocketBookApproved.checked });
  return destinations;
}

function formSettings(): NativeSettings {
  return {
    senderEmail: senderEmail.value.trim(),
    destinations: formDestinations(),
    defaultDestinationId: defaultDestination.value as DestinationId,
    passwordConfigured: Boolean(currentSettings?.passwordConfigured),
    passwordProtected: Boolean(currentSettings?.passwordProtected)
  };
}

function updateDefaultOptions() {
  const ids = new Set(formDestinations().map(destination => destination.id));
  for (const option of defaultDestination.options) option.disabled = !ids.has(option.value as DestinationId);
  if (!ids.has(defaultDestination.value as DestinationId)) {
    defaultDestination.value = ids.has("kindle") ? "kindle" : ids.has("pocketbook") ? "pocketbook" : "kindle";
  }
}

function renderChecklist(hostOk: boolean, settings?: NativeSettings) {
  setCheck("host", hostOk ? "ok" : "error", ptMessage(hostOk ? "host_connected" : "host_unavailable"));
  const targets = settings?.destinations || formDestinations();
  const addressesOk = Boolean((settings?.senderEmail || senderEmail.value.trim()) && targets.length);
  setCheck("addresses", addressesOk ? "ok" : "error", addressesOk
    ? ptMessage("configured_recipients", [ptFormatNumber(targets.length)])
    : ptMessage("configure_addresses"));
  setCheck("password", settings?.passwordProtected ? "ok" : "error", settings?.passwordProtected
    ? ptMessage("password_protected")
    : ptMessage("password_missing"));
  const approvalsOk = targets.length > 0 && targets.every(destination => destination.senderApproved);
  setCheck("approvals", approvalsOk ? "ok" : "error", approvalsOk
    ? ptMessage("approvals_ready")
    : ptMessage("approvals_missing"));
  setCheck("smtp", "pending", ptMessage("smtp_not_checked"));
}

function validateSettings() {
  if (!senderEmail.reportValidity() || !kindleEmail.reportValidity() || !pocketBookEmail.reportValidity()) return undefined;
  const destinations = formDestinations();
  if (!destinations.length) { show(ptMessage("enter_recipient")); return undefined; }
  const pocketbook = destinations.find(destination => destination.kind === "pocketbook");
  if (pocketbook && !pocketbook.email.toLowerCase().endsWith("@pbsync.com")) {
    show(ptMessage("invalid_pocketbook_address"));
    pocketBookEmail.focus();
    return undefined;
  }
  if (destinations.some(destination => !destination.senderApproved)) {
    show(ptMessage("confirm_allowlists"));
    return undefined;
  }
  updateDefaultOptions();
  return destinations;
}

async function init() {
  const stored = await browser.storage.local.get(["grayscaleImages", PT_UI_LANGUAGE_KEY]);
  grayscale.checked = stored.grayscaleImages !== false;
  uiLanguage.value = stored[PT_UI_LANGUAGE_KEY] === "ru" || stored[PT_UI_LANGUAGE_KEY] === "en"
    ? String(stored[PT_UI_LANGUAGE_KEY])
    : "auto";
  renderChecklist(false);
  try {
    const data = await browser.runtime.sendMessage({ type: "native-settings-get" }) as NativeReply;
    if (!data?.ok || !data.settings) throw new Error(data?.error || ptMessage("destination_support_upgrade"));
    hostAvailable = true;
    currentSettings = data.settings;
    senderEmail.value = data.settings.senderEmail;
    const kindle = data.settings.destinations.find(destination => destination.kind === "kindle");
    const pocketbook = data.settings.destinations.find(destination => destination.kind === "pocketbook");
    kindleEmail.value = kindle?.email || "";
    amazonApproved.checked = Boolean(kindle?.senderApproved);
    pocketBookEmail.value = pocketbook?.email || "";
    pocketBookApproved.checked = Boolean(pocketbook?.senderApproved);
    defaultDestination.value = data.settings.defaultDestinationId;
    approvedSenderEmail = data.settings.destinations.every(destination => destination.senderApproved)
      ? data.settings.senderEmail.toLowerCase()
      : "";
    updateDefaultOptions();
    renderChecklist(true, data.settings);
  } catch (error) {
    hostAvailable = false;
    renderChecklist(false);
    show(error instanceof Error ? error.message : String(error));
  }
}

save.addEventListener("click", async () => {
  const destinations = validateSettings();
  if (!destinations) return;
  save.disabled = true;
  loadTest.disabled = true;
  show(ptMessage("saving_settings"));
  try {
    await browser.storage.local.set({ grayscaleImages: grayscale.checked });
    const saved = await browser.runtime.sendMessage({
      type: "native-settings-save",
      senderEmail: senderEmail.value.trim(),
      destinations,
      defaultDestinationId: defaultDestination.value
    }) as NativeReply;
    if (!saved?.ok || !saved.settings) {
      if (saved?.code?.startsWith("NATIVE_")) hostAvailable = false;
      throw new Error(saved?.error || ptMessage("settings_save_failed"));
    }
    hostAvailable = true;
    currentSettings = saved.settings;
    approvedSenderEmail = saved.settings.senderEmail.toLowerCase();
    renderChecklist(true, currentSettings);
    if (!saved.configOk) throw new Error(saved.error || ptMessage("settings_incomplete"));

    const diagnostic = await browser.runtime.sendMessage({ type: "native-diagnostics" }) as NativeReply;
    if (!diagnostic?.ok) {
      if (diagnostic?.code?.startsWith("NATIVE_")) hostAvailable = false;
      throw new Error(diagnostic?.error || ptMessage("smtp_check_failed"));
    }
    setCheck("smtp", "ok", ptMessage("smtp_working"));
    show(ptMessage("settings_saved", [diagnostic.hostVersion || "0.11.1"]), true);
  } catch (error) {
    renderChecklist(hostAvailable, currentSettings);
    setCheck("smtp", "error", ptMessage("smtp_not_working"));
    show(error instanceof Error ? error.message : String(error));
  } finally {
    save.disabled = false;
    loadTest.disabled = false;
  }
});

function onRecipientInput() {
  updateDefaultOptions();
  renderChecklist(hostAvailable, formSettings());
}

senderEmail.addEventListener("input", () => {
  if (senderEmail.value.trim().toLowerCase() !== approvedSenderEmail) {
    amazonApproved.checked = false;
    pocketBookApproved.checked = false;
  }
  renderChecklist(hostAvailable, formSettings());
});
kindleEmail.addEventListener("input", onRecipientInput);
pocketBookEmail.addEventListener("input", onRecipientInput);
amazonApproved.addEventListener("change", () => {
  approvedSenderEmail = amazonApproved.checked && (!pocketBookEmail.value.trim() || pocketBookApproved.checked)
    ? senderEmail.value.trim().toLowerCase() : "";
  renderChecklist(hostAvailable, formSettings());
});
pocketBookApproved.addEventListener("change", () => {
  approvedSenderEmail = pocketBookApproved.checked && (!kindleEmail.value.trim() || amazonApproved.checked)
    ? senderEmail.value.trim().toLowerCase() : "";
  renderChecklist(hostAvailable, formSettings());
});

loadTest.addEventListener("click", async () => {
  save.disabled = true;
  loadTest.disabled = true;
  show(ptMessage("testing_20mb"));
  try {
    const data = await browser.runtime.sendMessage({ type: "native-load-test" }) as NativeReply;
    if (!data?.ok) throw new Error(data?.error || ptMessage("load_test_failed"));
    const megabytes = ((data.payloadBytes || 0) / 1024 / 1024).toFixed(0);
    show(ptMessage("load_test_success", [megabytes, ptFormatNumber(data.elapsedMs || 0)]), true);
  } catch (error) {
    show(error instanceof Error ? error.message : String(error));
  } finally {
    save.disabled = false;
    loadTest.disabled = false;
  }
});

uiLanguage.addEventListener("change", async () => {
  const setting = uiLanguage.value as PtUiLanguage;
  await browser.storage.local.set({ [PT_UI_LANGUAGE_KEY]: setting });
  location.reload();
});

void ptInitializeI18n().then(init).catch(error => show(error instanceof Error ? error.message : String(error)));
