const result = document.querySelector<HTMLParagraphElement>("#result")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const loadTest = document.querySelector<HTMLButtonElement>("#load-test")!;
const grayscale = document.querySelector<HTMLInputElement>("#grayscale")!;

type DiagnosticsReply = {
  ok?: boolean;
  error?: string;
  code?: string;
  hostVersion?: string;
  payloadBytes?: number;
  elapsedMs?: number;
};

function show(message: string, ok = false) {
  result.textContent = message;
  result.className = ok ? "ok" : "error";
}

async function init() {
  const stored = await browser.storage.local.get("grayscaleImages");
  grayscale.checked = stored.grayscaleImages !== false;
}

save.addEventListener("click", async () => {
  save.disabled = true;
  loadTest.disabled = true;
  show("Проверяю локальный компонент и SMTP…");
  try {
    await browser.storage.local.set({ grayscaleImages: grayscale.checked });
    const data = await browser.runtime.sendMessage({ type: "native-diagnostics" }) as DiagnosticsReply;
    if (!data?.ok) throw new Error(data?.error || "Диагностика завершилась ошибкой.");
    show(`Настройки сохранены. Локальный компонент v${data.hostVersion || "0.8.0"} и SMTP работают.`, true);
  } catch (error) {
    show(error instanceof Error ? error.message : String(error));
  } finally {
    save.disabled = false;
    loadTest.disabled = false;
  }
});

loadTest.addEventListener("click", async () => {
  save.disabled = true;
  loadTest.disabled = true;
  show("Передаю тестовые 20 МБ через Firefox…");
  try {
    const data = await browser.runtime.sendMessage({ type: "native-load-test" }) as DiagnosticsReply;
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
