using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Mail;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("TabTome Settings")]
[assembly: System.Reflection.AssemblyProduct("TabTome")]
[assembly: System.Reflection.AssemblyCompany("TabTome contributors")]
[assembly: System.Reflection.AssemblyVersion("0.11.1.0")]
[assembly: System.Reflection.AssemblyFileVersion("0.11.1.0")]

internal static class TabTomeSettingsProgram
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SettingsForm());
    }
}

internal sealed class SavedSettings
{
    public string senderEmail { get; set; }
    public DeliveryDestination[] destinations { get; set; }
    public string defaultDestinationId { get; set; }
}

internal sealed class DeliveryDestination
{
    public string id { get; set; }
    public string kind { get; set; }
    public string email { get; set; }
    public bool senderApproved { get; set; }
}

internal sealed class LegacySavedSettings
{
    public string senderEmail { get; set; }
    public string kindleEmail { get; set; }
    public bool amazonSenderApproved { get; set; }
}

internal sealed class SettingsForm : Form
{
    private static readonly UTF8Encoding Utf8NoBom = new UTF8Encoding(false);
    private readonly string appRoot;
    private readonly string dataRoot;
    private readonly string environmentFile;
    private readonly string passwordFile;
    private readonly string settingsFile;
    private readonly TextBox senderEmail = new TextBox();
    private readonly TextBox kindleEmail = new TextBox();
    private readonly TextBox pocketBookEmail = new TextBox();
    private readonly ComboBox defaultDestination = new ComboBox();
    private readonly ComboBox smtpPreset = new ComboBox();
    private readonly TextBox smtpHost = new TextBox();
    private readonly NumericUpDown smtpPort = new NumericUpDown();
    private readonly CheckBox smtpSecure = new CheckBox();
    private readonly TextBox smtpPassword = new TextBox();
    private readonly CheckBox amazonApproved = new CheckBox();
    private readonly CheckBox pocketBookApproved = new CheckBox();
    private readonly Button saveButton = new Button();
    private readonly Button saveAndTestButton = new Button();
    private readonly Button logButton = new Button();
    private readonly TextBox status = new TextBox();
    private bool passwordExists;

    internal SettingsForm()
    {
        appRoot = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        dataRoot = Environment.GetEnvironmentVariable("PAGE_TO_EREADER_DATA_ROOT");
        if (String.IsNullOrWhiteSpace(dataRoot))
            dataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PageToEreaderLocal");
        dataRoot = Path.GetFullPath(dataRoot);
        environmentFile = Path.Combine(dataRoot, ".env");
        passwordFile = Path.Combine(dataRoot, ".smtp-pass");
        settingsFile = Path.Combine(dataRoot, "data", "settings.json");

        Text = "TabTome — настройки";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(650, 610);
        Size = new Size(720, 680);
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

        BuildLayout();
        LoadSettings();
    }

    private void BuildLayout()
    {
        var main = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            Padding = new Padding(18),
            ColumnCount = 2,
            RowCount = 19
        };
        main.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 205F));
        main.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        Controls.Add(main);

        var heading = new Label
        {
            Text = "Настройка отправки на электронную книгу",
            AutoSize = true,
            Font = new Font(Font, FontStyle.Bold),
            Margin = new Padding(0, 0, 0, 5)
        };
        main.Controls.Add(heading, 0, 0);
        main.SetColumnSpan(heading, 2);

        var intro = new Label
        {
            Text = "Пароль приложения шифруется Windows DPAPI и доступен только текущему пользователю Windows. Расширение браузера пароль не получает.",
            AutoSize = true,
            MaximumSize = new Size(635, 0),
            Margin = new Padding(0, 0, 0, 14)
        };
        main.Controls.Add(intro, 0, 1);
        main.SetColumnSpan(intro, 2);

        AddField(main, 2, "Адрес отправителя", senderEmail);
        AddField(main, 3, "Адрес Send to Kindle", kindleEmail);

        amazonApproved.Text = "Адрес отправителя разрешён в Amazon";
        amazonApproved.AutoSize = true;
        amazonApproved.Margin = new Padding(0, 3, 0, 7);
        main.Controls.Add(amazonApproved, 1, 4);

        AddField(main, 5, "Адрес PocketBook", pocketBookEmail);
        pocketBookApproved.Text = "Адрес отправителя добавлен в белый список PocketBook";
        pocketBookApproved.AutoSize = true;
        pocketBookApproved.Margin = new Padding(0, 3, 0, 7);
        main.Controls.Add(pocketBookApproved, 1, 6);

        defaultDestination.DropDownStyle = ComboBoxStyle.DropDownList;
        defaultDestination.Items.AddRange(new object[] { "Kindle", "PocketBook" });
        defaultDestination.SelectedIndex = 0;
        AddField(main, 7, "Получатель по умолчанию", defaultDestination);

        smtpPreset.DropDownStyle = ComboBoxStyle.DropDownList;
        smtpPreset.Items.AddRange(new object[]
        {
            "Gmail — STARTTLS (порт 587, рекомендуется)",
            "Gmail — TLS/SSL (порт 465)",
            "Другой SMTP — вручную"
        });
        smtpPreset.SelectedIndexChanged += delegate { ApplySmtpPreset(); };
        AddField(main, 8, "Режим SMTP", smtpPreset);

        AddField(main, 9, "SMTP-сервер", smtpHost);

        smtpPort.Minimum = 1;
        smtpPort.Maximum = 65535;
        smtpPort.Value = 587;
        smtpPort.Width = 120;
        AddField(main, 10, "SMTP-порт", smtpPort);

        smtpSecure.Text = "Прямой TLS/SSL (обычно порт 465)";
        smtpSecure.AutoSize = true;
        smtpSecure.Margin = new Padding(0, 7, 0, 7);
        main.Controls.Add(smtpSecure, 1, 11);

        smtpPassword.UseSystemPasswordChar = true;
        AddField(main, 12, "Пароль приложения", smtpPassword);

        var passwordLink = new LinkLabel
        {
            Text = "Как создать пароль приложения Google",
            AutoSize = true,
            Margin = new Padding(0, 0, 0, 8)
        };
        passwordLink.LinkClicked += delegate { OpenUrl("https://support.google.com/accounts/answer/185833"); };
        main.Controls.Add(passwordLink, 1, 13);

        var amazonLink = new LinkLabel
        {
            Text = "Открыть настройки Send to Kindle",
            AutoSize = true,
            Margin = new Padding(0, 0, 0, 12)
        };
        amazonLink.LinkClicked += delegate { OpenUrl("https://www.amazon.com/sendtokindle/email"); };
        main.Controls.Add(amazonLink, 1, 14);

        var buttons = new FlowLayoutPanel
        {
            AutoSize = true,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            Margin = new Padding(0, 6, 0, 10)
        };
        saveButton.Text = "Сохранить";
        saveButton.AutoSize = true;
        saveButton.Click += delegate { SaveOnly(); };
        saveAndTestButton.Text = "Сохранить и проверить SMTP";
        saveAndTestButton.AutoSize = true;
        saveAndTestButton.Click += async delegate { await SaveAndTestAsync(); };
        logButton.Text = "Открыть журнал";
        logButton.AutoSize = true;
        logButton.Click += delegate { OpenLog(); };
        buttons.Controls.Add(saveButton);
        buttons.Controls.Add(saveAndTestButton);
        buttons.Controls.Add(logButton);
        main.Controls.Add(buttons, 0, 15);
        main.SetColumnSpan(buttons, 2);

        status.Multiline = true;
        status.ReadOnly = true;
        status.ScrollBars = ScrollBars.Vertical;
        status.Dock = DockStyle.Fill;
        status.MinimumSize = new Size(0, 120);
        status.BackColor = SystemColors.Window;
        status.Margin = new Padding(0, 0, 0, 4);
        main.Controls.Add(status, 0, 16);
        main.SetColumnSpan(status, 2);
        main.RowStyles.Add(new RowStyle());
        main.RowStyles.Add(new RowStyle());
        for (var index = 2; index <= 15; index++) main.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        main.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));

        var location = new Label
        {
            Text = "Данные: " + dataRoot,
            AutoSize = true,
            ForeColor = SystemColors.GrayText,
            Margin = new Padding(0, 4, 0, 0)
        };
        main.Controls.Add(location, 0, 17);
        main.SetColumnSpan(location, 2);
    }

    private static void AddField(TableLayoutPanel panel, int row, string labelText, Control control)
    {
        var label = new Label
        {
            Text = labelText,
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(0, 8, 10, 8)
        };
        control.Dock = DockStyle.Fill;
        control.Margin = new Padding(0, 4, 0, 4);
        panel.Controls.Add(label, 0, row);
        panel.Controls.Add(control, 1, row);
    }

    private void LoadSettings()
    {
        try
        {
            var environment = ReadEnvironment(environmentFile);
            smtpHost.Text = GetValue(environment, "SMTP_HOST", "smtp.gmail.com");
            int port;
            smtpPort.Value = Int32.TryParse(GetValue(environment, "SMTP_PORT", "587"), out port) && port >= 1 && port <= 65535 ? port : 587;
            smtpSecure.Checked = String.Equals(GetValue(environment, "SMTP_SECURE", "false"), "true", StringComparison.OrdinalIgnoreCase);
            SelectSmtpPreset();

            SavedSettings saved = null;
            LegacySavedSettings legacy = null;
            if (File.Exists(settingsFile))
            {
                var json = File.ReadAllText(settingsFile, Encoding.UTF8);
                saved = new JavaScriptSerializer().Deserialize<SavedSettings>(json);
                if (saved == null || saved.destinations == null)
                    legacy = new JavaScriptSerializer().Deserialize<LegacySavedSettings>(json);
            }
            senderEmail.Text = saved != null && !String.IsNullOrWhiteSpace(saved.senderEmail)
                ? saved.senderEmail : legacy != null && !String.IsNullOrWhiteSpace(legacy.senderEmail)
                    ? legacy.senderEmail : GetValue(environment, "SMTP_FROM", GetValue(environment, "SMTP_USER", ""));
            var kindle = FindDestination(saved, "kindle");
            var pocketbook = FindDestination(saved, "pocketbook");
            kindleEmail.Text = kindle != null ? kindle.email : legacy != null && !String.IsNullOrWhiteSpace(legacy.kindleEmail)
                ? legacy.kindleEmail : GetValue(environment, "KINDLE_EMAIL", "");
            pocketBookEmail.Text = pocketbook != null ? pocketbook.email : "";
            amazonApproved.Checked = kindle != null ? kindle.senderApproved : legacy != null && legacy.amazonSenderApproved;
            pocketBookApproved.Checked = pocketbook != null && pocketbook.senderApproved;
            defaultDestination.SelectedIndex = saved != null && String.Equals(saved.defaultDestinationId, "pocketbook", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
            passwordExists = File.Exists(passwordFile) && new FileInfo(passwordFile).Length > 0;
            status.Text = passwordExists
                ? "Настройки загружены. Защищённый пароль уже существует; оставьте поле пароля пустым, чтобы не менять его."
                : "Укажите адреса и пароль приложения. Для Gmail нужен отдельный 16-значный пароль приложения, а не пароль аккаунта Google.";
        }
        catch (Exception error)
        {
            status.Text = "Не удалось прочитать прежние настройки: " + error.Message;
        }
    }

    private static DeliveryDestination FindDestination(SavedSettings settings, string kind)
    {
        if (settings == null || settings.destinations == null) return null;
        foreach (var destination in settings.destinations)
            if (destination != null && String.Equals(destination.kind, kind, StringComparison.OrdinalIgnoreCase)) return destination;
        return null;
    }

    private static Dictionary<string, string> ReadEnvironment(string path)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(path)) return result;
        foreach (var raw in File.ReadAllLines(path, Encoding.UTF8))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal)) continue;
            var separator = line.IndexOf('=');
            if (separator <= 0) continue;
            result[line.Substring(0, separator).Trim()] = line.Substring(separator + 1).Trim();
        }
        return result;
    }

    private static string GetValue(Dictionary<string, string> values, string key, string fallback)
    {
        string value;
        return values.TryGetValue(key, out value) ? value : fallback;
    }

    private void SelectSmtpPreset()
    {
        if (!String.Equals(smtpHost.Text.Trim(), "smtp.gmail.com", StringComparison.OrdinalIgnoreCase))
        {
            smtpPreset.SelectedIndex = 2;
            return;
        }

        smtpPreset.SelectedIndex = Decimal.ToInt32(smtpPort.Value) == 465 ? 1 : 0;
    }

    private void ApplySmtpPreset()
    {
        if (smtpPreset.SelectedIndex == 0)
        {
            smtpHost.Text = "smtp.gmail.com";
            smtpPort.Value = 587;
            smtpSecure.Checked = false;
        }
        else if (smtpPreset.SelectedIndex == 1)
        {
            smtpHost.Text = "smtp.gmail.com";
            smtpPort.Value = 465;
            smtpSecure.Checked = true;
        }

        var manual = smtpPreset.SelectedIndex == 2;
        smtpHost.Enabled = manual;
        smtpPort.Enabled = manual;
        smtpSecure.Enabled = manual;
    }

    private static bool ValidEmail(string value)
    {
        try
        {
            var address = new MailAddress(value);
            return String.Equals(address.Address, value, StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    private bool ValidateInput()
    {
        if (!ValidEmail(senderEmail.Text.Trim())) return Fail("Укажите корректный адрес отправителя.");
        var kindle = kindleEmail.Text.Trim();
        var pocketbook = pocketBookEmail.Text.Trim();
        if (kindle.Length == 0 && pocketbook.Length == 0) return Fail("Укажите адрес Kindle или PocketBook.");
        if (kindle.Length > 0 && !ValidEmail(kindle)) return Fail("Укажите корректный адрес Send to Kindle.");
        if (pocketbook.Length > 0 && (!ValidEmail(pocketbook) || !pocketbook.EndsWith("@pbsync.com", StringComparison.OrdinalIgnoreCase)))
            return Fail("Адрес Send-to-PocketBook должен оканчиваться на @pbsync.com.");
        if (kindle.Length > 0 && !amazonApproved.Checked)
            return Fail("Подтвердите, что адрес отправителя разрешён в Amazon.");
        if (pocketbook.Length > 0 && !pocketBookApproved.Checked)
            return Fail("Подтвердите, что адрес отправителя добавлен в белый список PocketBook.");
        if (defaultDestination.SelectedIndex == 0 && kindle.Length == 0)
            return Fail("Kindle выбран по умолчанию, но его адрес не указан.");
        if (defaultDestination.SelectedIndex == 1 && pocketbook.Length == 0)
            return Fail("PocketBook выбран по умолчанию, но его адрес не указан.");
        var host = smtpHost.Text.Trim();
        if (String.IsNullOrWhiteSpace(host) || host.IndexOfAny(new[] { '\r', '\n', '=' }) >= 0 ||
            Uri.CheckHostName(host) == UriHostNameType.Unknown) return Fail("Укажите корректный SMTP-сервер.");
        if (String.Equals(host, "smtp.gmail.com", StringComparison.OrdinalIgnoreCase))
        {
            var port = Decimal.ToInt32(smtpPort.Value);
            var validGmailMode = (port == 587 && !smtpSecure.Checked) || (port == 465 && smtpSecure.Checked);
            if (!validGmailMode)
                return Fail("Для Gmail выберите STARTTLS на порту 587 или прямой TLS/SSL на порту 465.");
        }
        if (!passwordExists && String.IsNullOrWhiteSpace(smtpPassword.Text)) return Fail("Укажите пароль приложения SMTP.");
        return true;
    }

    private bool Fail(string message)
    {
        status.Text = message;
        return false;
    }

    private void SaveOnly()
    {
        if (!ValidateInput()) return;
        SetBusy(true);
        try
        {
            SaveSettings();
            status.Text = "Настройки сохранены. Пароль защищён Windows DPAPI.";
        }
        catch (Exception error)
        {
            status.Text = "Ошибка сохранения: " + error.Message;
        }
        finally { SetBusy(false); }
    }

    private async Task SaveAndTestAsync()
    {
        if (!ValidateInput()) return;
        SetBusy(true);
        try
        {
            SaveSettings();
            status.Text = "Настройки сохранены. Проверяю соединение с SMTP…";
            var result = await Task.Run(() => RunDiagnostics());
            status.Text = result;
        }
        catch (Exception error)
        {
            status.Text = "Ошибка: " + error.Message;
        }
        finally { SetBusy(false); }
    }

    private void SaveSettings()
    {
        Directory.CreateDirectory(dataRoot);
        Directory.CreateDirectory(Path.GetDirectoryName(settingsFile));
        var suffix = "." + Guid.NewGuid().ToString("N") + ".tmp";
        var environmentTemporary = environmentFile + suffix;
        var settingsTemporary = settingsFile + suffix;
        var passwordTemporary = passwordFile + suffix;
        try
        {
            var sender = senderEmail.Text.Trim();
            var kindle = kindleEmail.Text.Trim();
            var pocketbook = pocketBookEmail.Text.Trim();
            var environment = String.Join("\r\n", new[]
            {
                "SMTP_HOST=" + smtpHost.Text.Trim(),
                "SMTP_PORT=" + Decimal.ToInt32(smtpPort.Value),
                "SMTP_SECURE=" + (smtpSecure.Checked ? "true" : "false"),
                "SMTP_USER=" + sender,
                "SMTP_FROM=" + sender,
                "KINDLE_EMAIL=" + kindle,
                "# SMTP password is stored only in .smtp-pass through Windows DPAPI.",
                ""
            });
            File.WriteAllText(environmentTemporary, environment, Utf8NoBom);
            var saved = new SavedSettings
            {
                senderEmail = sender,
                destinations = BuildDestinations(kindle, pocketbook),
                defaultDestinationId = defaultDestination.SelectedIndex == 1 ? "pocketbook" : "kindle"
            };
            var json = new JavaScriptSerializer().Serialize(saved);
            File.WriteAllText(settingsTemporary, json + "\n", Utf8NoBom);

            if (!String.IsNullOrWhiteSpace(smtpPassword.Text))
                ProtectPassword(smtpPassword.Text.Trim(), passwordTemporary);

            ReplaceFile(environmentTemporary, environmentFile);
            ReplaceFile(settingsTemporary, settingsFile);
            if (File.Exists(passwordTemporary)) ReplaceFile(passwordTemporary, passwordFile);
            passwordExists = File.Exists(passwordFile) && new FileInfo(passwordFile).Length > 0;
            smtpPassword.Clear();
        }
        finally
        {
            TryDelete(environmentTemporary);
            TryDelete(settingsTemporary);
            TryDelete(passwordTemporary);
        }
    }

    private DeliveryDestination[] BuildDestinations(string kindle, string pocketbook)
    {
        var destinations = new List<DeliveryDestination>();
        if (kindle.Length > 0) destinations.Add(new DeliveryDestination
        {
            id = "kindle", kind = "kindle", email = kindle, senderApproved = amazonApproved.Checked
        });
        if (pocketbook.Length > 0) destinations.Add(new DeliveryDestination
        {
            id = "pocketbook", kind = "pocketbook", email = pocketbook, senderApproved = pocketBookApproved.Checked
        });
        return destinations.ToArray();
    }

    private static void ReplaceFile(string source, string destination)
    {
        if (File.Exists(destination)) File.Replace(source, destination, null);
        else File.Move(source, destination);
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { }
    }

    private static void ProtectPassword(string password, string destination)
    {
        var windows = Environment.GetEnvironmentVariable("SystemRoot");
        if (String.IsNullOrWhiteSpace(windows)) windows = "C:\\Windows";
        var powershell = Path.Combine(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        var script = String.Join(";", new[]
        {
            "$ErrorActionPreference='Stop'",
            "$plain=$env:PAGE_TO_EREADER_SMTP_PASS",
            "$secure=ConvertTo-SecureString $plain -AsPlainText -Force",
            "$encrypted=ConvertFrom-SecureString $secure",
            "$roundtrip=ConvertTo-SecureString $encrypted",
            "$credential=New-Object System.Management.Automation.PSCredential('smtp',$roundtrip)",
            "if($credential.GetNetworkCredential().Password -cne $plain){throw 'DPAPI round-trip failed'}",
            "$utf8=New-Object System.Text.UTF8Encoding($false)",
            "[System.IO.File]::WriteAllText($env:PAGE_TO_EREADER_DPAPI_TEMP,$encrypted,$utf8)"
        });
        var start = new ProcessStartInfo
        {
            FileName = powershell,
            Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"" + script.Replace("\"", "\\\"") + "\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
            RedirectStandardOutput = true
        };
        start.EnvironmentVariables.Remove("SMTP_PASS");
        start.EnvironmentVariables["PAGE_TO_EREADER_SMTP_PASS"] = password;
        start.EnvironmentVariables["PAGE_TO_EREADER_DPAPI_TEMP"] = destination;
        using (var process = Process.Start(start))
        {
            if (process == null) throw new InvalidOperationException("Не удалось запустить защиту пароля Windows.");
            var error = process.StandardError.ReadToEnd();
            if (!process.WaitForExit(20000))
            {
                try { process.Kill(); } catch { }
                throw new TimeoutException("Windows не завершила защиту пароля за 20 секунд.");
            }
            if (process.ExitCode != 0 || !File.Exists(destination))
                throw new InvalidOperationException("Не удалось защитить пароль Windows DPAPI. " + error.Trim());
        }
    }

    private string RunDiagnostics()
    {
        var node = Path.Combine(appRoot, "runtime", "node.exe");
        var serverRoot = Path.Combine(appRoot, "server");
        var diagnostics = Path.Combine(serverRoot, "dist", "diagnose.js");
        if (!File.Exists(node) || !File.Exists(diagnostics))
            throw new FileNotFoundException("Установленные файлы приложения TabTome неполны. Переустановите приложение.");
        var start = new ProcessStartInfo
        {
            FileName = node,
            Arguments = "\"" + diagnostics + "\"",
            WorkingDirectory = serverRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        start.EnvironmentVariables["PAGE_TO_EREADER_SERVER_ROOT"] = serverRoot;
        start.EnvironmentVariables["PAGE_TO_EREADER_DATA_ROOT"] = dataRoot;
        using (var process = Process.Start(start))
        {
            if (process == null) throw new InvalidOperationException("Не удалось запустить диагностику.");
            var outputTask = process.StandardOutput.ReadToEndAsync();
            var errorTask = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit(45000))
            {
                try { process.Kill(); } catch { }
                throw new TimeoutException("SMTP не ответил за 45 секунд.");
            }
            Task.WaitAll(outputTask, errorTask);
            var output = outputTask.Result.Trim();
            var error = errorTask.Result.Trim();
            if (process.ExitCode != 0) throw new InvalidOperationException(error.Length > 0 ? error : output);
            return output + "\r\n\r\nГотово. Теперь полностью перезапустите браузер и откройте настройки расширения.";
        }
    }

    private void SetBusy(bool busy)
    {
        saveButton.Enabled = !busy;
        saveAndTestButton.Enabled = !busy;
        UseWaitCursor = busy;
    }

    private void OpenLog()
    {
        var log = Path.Combine(dataRoot, "logs", "service.log");
        if (!File.Exists(log))
        {
            status.Text = "Журнал пока не создан: " + log;
            return;
        }
        Process.Start(new ProcessStartInfo { FileName = log, UseShellExecute = true });
    }

    private static void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true }); }
        catch (Exception error) { MessageBox.Show(error.Message, "Не удалось открыть ссылку", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}
