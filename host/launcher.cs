using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

[assembly: System.Reflection.AssemblyTitle("TabTome Native Host")]
[assembly: System.Reflection.AssemblyProduct("TabTome")]
[assembly: System.Reflection.AssemblyCompany("TabTome contributors")]
[assembly: System.Reflection.AssemblyVersion("0.11.1.0")]
[assembly: System.Reflection.AssemblyFileVersion("0.11.1.0")]

internal static class TabTomeLauncher
{
    private static void Pump(Stream input, Stream output)
    {
        var buffer = new byte[64 * 1024];
        int count;
        while ((count = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            output.Write(buffer, 0, count);
            output.Flush();
        }
    }

    private static string ReadDataRoot(string hostDirectory, string serverRoot)
    {
        var marker = Path.Combine(hostDirectory, "data-root.txt");
        if (!File.Exists(marker)) return serverRoot;
        var configured = File.ReadAllText(marker).Trim();
        if (String.IsNullOrWhiteSpace(configured) || !Path.IsPathRooted(configured))
            throw new InvalidDataException("data-root.txt must contain an absolute path.");
        return Path.GetFullPath(configured);
    }

    private static void WriteFailure(string dataRoot, Exception error)
    {
        try
        {
            var directory = Path.Combine(dataRoot, "logs");
            Directory.CreateDirectory(directory);
            File.AppendAllText(
                Path.Combine(directory, "service.log"),
                "[" + DateTime.UtcNow.ToString("o") + "] Native launcher failed: " + error.GetType().Name + ": " + error.Message + Environment.NewLine
            );
        }
        catch { }
    }

    [STAThread]
    private static int Main()
    {
        var hostDirectory = AppDomain.CurrentDomain.BaseDirectory;
        var serverRoot = Path.GetFullPath(Path.Combine(hostDirectory, "..", "server"));
        var dataRoot = serverRoot;
        try
        {
            dataRoot = ReadDataRoot(hostDirectory, serverRoot);
            var nodePath = File.ReadAllText(Path.Combine(hostDirectory, "node-path.txt")).Trim();
            var entryPoint = Path.Combine(serverRoot, "dist", "native-host.js");
            var startInfo = new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = "\"" + entryPoint + "\"",
                WorkingDirectory = serverRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            startInfo.EnvironmentVariables["PAGE_TO_EREADER_SERVER_ROOT"] = serverRoot;
            startInfo.EnvironmentVariables["PAGE_TO_EREADER_DATA_ROOT"] = dataRoot;

            using (var child = Process.Start(startInfo))
            {
                if (child == null) throw new InvalidOperationException("Could not start node.exe.");
                var inputThread = new Thread(() =>
                {
                    try { Pump(Console.OpenStandardInput(), child.StandardInput.BaseStream); }
                    catch { }
                    finally { try { child.StandardInput.Close(); } catch { } }
                });
                var outputThread = new Thread(() =>
                {
                    try { Pump(child.StandardOutput.BaseStream, Console.OpenStandardOutput()); } catch { }
                });
                var errorThread = new Thread(() =>
                {
                    try { Pump(child.StandardError.BaseStream, Console.OpenStandardError()); } catch { }
                });
                inputThread.IsBackground = true;
                outputThread.IsBackground = true;
                errorThread.IsBackground = true;
                inputThread.Start();
                outputThread.Start();
                errorThread.Start();
                child.WaitForExit();
                outputThread.Join(5000);
                errorThread.Join(5000);
                return child.ExitCode;
            }
        }
        catch (Exception error)
        {
            WriteFailure(dataRoot, error);
            return 1;
        }
    }
}
