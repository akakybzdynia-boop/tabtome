const result = document.querySelector<HTMLParagraphElement>("#result")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const loadTest = document.querySelector<HTMLButtonElement>("#load-test")!;
const grayscale = document.querySelector<HTMLInputElement>("#grayscale")!;
const senderEmail = document.querySelector<HTMLInputElement>("#sender-email")!;
const kindleEmail = document.querySelector<HTMLInputElement>("#kindle-email")!;
const amazonApproved = document.querySelector<HTMLInputElement>("#amazon-approved")!;

type NativeSettings = {
  senderEmail: string;
  kindleEmail: string;
  amazonSenderApproved: boolean;
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

function renderChecklist(hostOk: boolean, settings?: NativeSettings) {
  setCheck("host", hostOk ? "ok" : "error", hostOk ? "Локальный компонент подключён" : "Локальный компонент недоступен");
  const addressesOk = Boolean(settings?.senderEmail && settings?.kindleEmail);
  setCheck("addresses", addressesOk ? "ok" : "error", addressesOk ? "Адреса почты указаны" : "Укажите оба адреса почты");
  setCheck("password", settings?.passwordProtected ? "ok" : "error", settings?.passwordProtected
    ? "Пароль приложения защищён Windows"
    : "Пароль приложения не настроен");
  setCheck("amazon", settings?.amazonSenderApproved ? "ok" : "error", settings?.amazonSenderApproved
    ? "Адрес отправителя разрешён в Amazon"
    : "Подтвердите разрешение адреса в Amazon");
  setCheck("smtp", "pending", "SMTP ещё не проверен");
}

function validateAddresses() {
  if (!senderEmail.reportValidity() || !kindleEmail.reportValidity()) return false;
  return true;
}

async function init() {
  const stored = await browser.storage.local.get("grayscaleImages");
  grayscale.checked = stored.grayscaleImages !== false;
  renderChecklist(false);
  try {
    const data = await browser.runtime.sendMessage({ type: "native-settings-get" }) as NativeReply;
    if (!data?.ok || !data.settings) throw new Error(data?.error || "Локальный компонент не поддерживает настройки адресов. Обновите его до версии 0.9.1.");
    hostAvailable = true;
    currentSettings = data.settings;
    senderEmail.value = data.settings.senderEmail;
    kindleEmail.value = data.settings.kindleEmail;
    amazonApproved.checked = data.settings.amazonSenderApproved;
    approvedSenderEmail = data.settings.amazonSenderApproved ? data.settings.senderEmail.toLowerCase() : "";
    renderChecklist(true, data.settings);
  } catch (error) {
    hostAvailable = false;
    renderChecklist(false);
    show(error instanceof Error ? error.message : String(error));
  }
}

save.addEventListener("click", async () => {
  if (!validateAddresses()) return;
  save.disabled = true;
  loadTest.disabled = true;
  show("Сохраняю адреса и проверяю SMTP…");
  try {
    await browser.storage.local.set({ grayscaleImages: grayscale.checked });
    const saved = await browser.runtime.sendMessage({
      type: "native-settings-save",
      senderEmail: senderEmail.value.trim(),
      kindleEmail: kindleEmail.value.trim(),
      amazonSenderApproved: amazonApproved.checked
    }) as NativeReply;
    if (!saved?.ok || !saved.settings) {
      if (saved?.code?.startsWith("NATIVE_")) hostAvailable = false;
      throw new Error(saved?.error || "Не удалось сохранить настройки.");
    }
    hostAvailable = true;
    currentSettings = saved.settings;
    approvedSenderEmail = saved.settings.amazonSenderApproved ? saved.settings.senderEmail.toLowerCase() : "";
    renderChecklist(true, currentSettings);
    if (!saved.configOk) throw new Error(saved.error || "Настройки сохранены, но конфигурация локального компонента неполна.");

    const diagnostic = await browser.runtime.sendMessage({ type: "native-diagnostics" }) as NativeReply;
    if (!diagnostic?.ok) {
      if (diagnostic?.code?.startsWith("NATIVE_")) hostAvailable = false;
      throw new Error(diagnostic?.error || "SMTP-проверка завершилась ошибкой.");
    }
    setCheck("smtp", "ok", "SMTP-соединение работает");
    show(`Настройки сохранены. Локальный компонент v${diagnostic.hostVersion || "0.9.1"} и SMTP работают.`, true);
  } catch (error) {
    renderChecklist(hostAvailable, currentSettings);
    setCheck("smtp", "error", "SMTP-проверка не пройдена");
    show(error instanceof Error ? error.message : String(error));
  } finally {
    save.disabled = false;
    loadTest.disabled = false;
  }
});

senderEmail.addEventListener("input", () => {
  if (senderEmail.value.trim().toLowerCase() !== approvedSenderEmail) amazonApproved.checked = false;
  setCheck("addresses", senderEmail.validity.valid && kindleEmail.validity.valid && Boolean(senderEmail.value && kindleEmail.value) ? "ok" : "error",
    senderEmail.validity.valid && kindleEmail.validity.valid && Boolean(senderEmail.value && kindleEmail.value) ? "Адреса почты указаны" : "Укажите оба адреса почты");
  setCheck("amazon", amazonApproved.checked ? "ok" : "error", amazonApproved.checked ? "Адрес отправителя разрешён в Amazon" : "Подтвердите разрешение адреса в Amazon");
});
kindleEmail.addEventListener("input", () => {
  const valid = senderEmail.validity.valid && kindleEmail.validity.valid && Boolean(senderEmail.value && kindleEmail.value);
  setCheck("addresses", valid ? "ok" : "error", valid ? "Адреса почты указаны" : "Укажите оба адреса почты");
});
amazonApproved.addEventListener("change", () => {
  approvedSenderEmail = amazonApproved.checked ? senderEmail.value.trim().toLowerCase() : "";
  setCheck("amazon", amazonApproved.checked ? "ok" : "error", amazonApproved.checked ? "Адрес отправителя разрешён в Amazon" : "Подтвердите разрешение адреса в Amazon");
});

loadTest.addEventListener("click", async () => {
  save.disabled = true;
  loadTest.disabled = true;
  show("Передаю тестовые 20 МБ через Firefox…");
  try {
    const data = await browser.runtime.sendMessage({ type: "native-load-test" }) as NativeReply;
    if (!data?.ok) throw new Error(data?.error || "Нагрузочная проверка завершилась ошибкой.");
    const megabytes = ((data.payloadBytes || 0) / 1024 / 1024).toFixed(0);
    show(`Канал Firefox → локальный компонент передал ${megabytes} МБ за ${data.elapsedMs || 0} мс.`, true);
  } catch (error) {
    show(error instanceof Error ? error.message : String(error));
  } finally {
    save.disabled = false;
    loadTest.disabled = false;
  }
});

void init();
