using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Management;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("BomDia Radar")]
[assembly: AssemblyDescription("Bandeja do agente local do radar do Bom Dia.")]
[assembly: AssemblyProduct("BomDia Radar")]
[assembly: AssemblyCompany("Rafastos")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace BomDiaRadar
{
    internal static class Program
    {
        private const string MutexName = "BomDia.Radar.Tray";
        private const string ShortcutName = "BomDia Radar";
        private const string ShortcutDescription = "Bandeja do agente local do radar do Bom Dia";

        [STAThread]
        private static void Main(string[] args)
        {
            if (args.Length > 0)
            {
                string action = args[0].ToLowerInvariant();
                if (action == "--instalar" || action == "/instalar")
                {
                    InstallShortcuts();
                    return;
                }
                if (action == "--desinstalar" || action == "/desinstalar")
                {
                    RemoveShortcuts();
                    return;
                }
            }

            bool created;
            using (Mutex mutex = new Mutex(true, MutexName, out created))
            {
                if (!created)
                {
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayContext());
            }
        }

        private static string ShortcutPath(Environment.SpecialFolder folder)
        {
            return Path.Combine(Environment.GetFolderPath(folder), ShortcutName + ".lnk");
        }

        private static void InstallShortcuts()
        {
            try
            {
                string exe = Application.ExecutablePath;
                DirectoryInfo trayDir = Directory.GetParent(Path.GetDirectoryName(exe));
                string agentDir = trayDir.Parent == null ? trayDir.FullName : trayDir.Parent.FullName;
                CreateShortcut(ShortcutPath(Environment.SpecialFolder.Startup), exe, agentDir);
                CreateShortcut(ShortcutPath(Environment.SpecialFolder.DesktopDirectory), exe, agentDir);
            }
            catch (Exception error)
            {
                MessageBox.Show("Nao consegui criar os atalhos: " + error.Message, "BomDia Radar");
            }
        }

        private static void RemoveShortcuts()
        {
            try
            {
                File.Delete(ShortcutPath(Environment.SpecialFolder.Startup));
                File.Delete(ShortcutPath(Environment.SpecialFolder.DesktopDirectory));
            }
            catch (Exception error)
            {
                MessageBox.Show("Nao consegui remover os atalhos: " + error.Message, "BomDia Radar");
            }
        }

        private static void CreateShortcut(string path, string target, string workDir)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null)
            {
                throw new InvalidOperationException("WScript.Shell indisponivel.");
            }

            dynamic shell = Activator.CreateInstance(shellType);
            dynamic shortcut = shell.CreateShortcut(path);
            shortcut.TargetPath = target;
            shortcut.WorkingDirectory = workDir;
            shortcut.IconLocation = target + ",0";
            shortcut.Description = ShortcutDescription;
            shortcut.Save();
        }
    }

    internal sealed class TrayContext : ApplicationContext
    {
        private const string RadarUrl = "https://bomdia.rafastos.com.br/radar";

        private readonly string _agentDir;
        private readonly string _logPath;
        private readonly AgentRunner _runner;
        private readonly NotifyIcon _icon;
        private readonly System.Windows.Forms.Timer _timer;
        private readonly ToolStripMenuItem _statusItem;
        private readonly ToolStripMenuItem _toggleItem;

        public TrayContext()
        {
            string trayDir = Path.GetDirectoryName(Application.ExecutablePath);
            DirectoryInfo parent = Directory.GetParent(trayDir);
            _agentDir = parent == null ? trayDir : parent.FullName;
            _logPath = Path.Combine(_agentDir, "radar-agent.log");
            _runner = new AgentRunner(_agentDir, _logPath);

            _statusItem = new ToolStripMenuItem("Agente: verificando...");
            _statusItem.Enabled = false;
            _toggleItem = new ToolStripMenuItem("Iniciar agente");

            ToolStripMenuItem openItem = new ToolStripMenuItem("Abrir o Radar");
            ToolStripMenuItem onceItem = new ToolStripMenuItem("Rodar agora");
            ToolStripMenuItem logItem = new ToolStripMenuItem("Abrir log");
            ToolStripMenuItem folderItem = new ToolStripMenuItem("Abrir pasta do agente");
            ToolStripMenuItem exitItem = new ToolStripMenuItem("Sair (para o agente)");

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add(_statusItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(openItem);
            menu.Items.Add(onceItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(_toggleItem);
            menu.Items.Add(logItem);
            menu.Items.Add(folderItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(exitItem);

            _icon = new NotifyIcon();
            _icon.Icon = LoadIcon();
            _icon.Text = "BomDia Radar";
            _icon.ContextMenuStrip = menu;
            _icon.Visible = true;
            _icon.DoubleClick += delegate { Open(RadarUrl); };

            openItem.Click += delegate { Open(RadarUrl); };
            onceItem.Click += delegate { RunOnce(); };
            _toggleItem.Click += delegate { ToggleAgent(); };
            logItem.Click += delegate { OpenLog(); };
            folderItem.Click += delegate { Open(_agentDir); };
            exitItem.Click += delegate { ExitApp(); };

            _timer = new System.Windows.Forms.Timer();
            _timer.Interval = 5000;
            _timer.Tick += delegate { UpdateStatus(); };
            _timer.Start();

            if (!AnyAgentRunning())
            {
                _runner.Start();
            }
            UpdateStatus();
            Balloon("BomDia Radar", "Agente ativo. Clique duas vezes no icone para abrir o Radar.");
        }

        private static Icon LoadIcon()
        {
            try
            {
                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("bandeja.ico"))
                {
                    if (stream != null)
                    {
                        return new Icon(stream);
                    }
                }
            }
            catch (ArgumentException)
            {
            }
            return SystemIcons.Application;
        }

        private static List<int> FindProcessIds(string processName, params string[] tokens)
        {
            List<int> ids = new List<int>();
            try
            {
                ManagementObjectSearcher searcher = new ManagementObjectSearcher(
                    "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name='" + processName + "'");
                try
                {
                    foreach (ManagementBaseObject item in searcher.Get())
                    {
                        try
                        {
                            string command = item["CommandLine"] as string;
                            if (command == null)
                            {
                                continue;
                            }
                            bool matches = true;
                            foreach (string token in tokens)
                            {
                                if (command.IndexOf(token, StringComparison.OrdinalIgnoreCase) < 0)
                                {
                                    matches = false;
                                    break;
                                }
                            }
                            if (matches)
                            {
                                ids.Add(Convert.ToInt32(item["ProcessId"]));
                            }
                        }
                        finally
                        {
                            item.Dispose();
                        }
                    }
                }
                finally
                {
                    searcher.Dispose();
                }
            }
            catch (Exception)
            {
            }
            return ids;
        }

        private static void Kill(int processId)
        {
            try
            {
                Process process = Process.GetProcessById(processId);
                process.Kill();
                process.WaitForExit(3000);
            }
            catch (Exception)
            {
            }
        }

        private static void StopStrayAgent()
        {
            foreach (int id in FindProcessIds("node.exe", "index.js", "watch"))
            {
                Kill(id);
            }
            foreach (int id in FindProcessIds("cmd.exe", "run-forever"))
            {
                Kill(id);
            }
            Thread.Sleep(400);
        }

        private static void Open(string urlOrPath)
        {
            try
            {
                Process.Start(urlOrPath);
            }
            catch (Exception)
            {
            }
        }

        private bool AnyAgentRunning()
        {
            if (_runner.HasLiveProcess)
            {
                return true;
            }
            return FindProcessIds("node.exe", "index.js", "watch").Count > 0;
        }

        private void UpdateStatus()
        {
            if (AnyAgentRunning())
            {
                _statusItem.Text = "Agente: ativo";
                _toggleItem.Text = "Parar agente";
            }
            else
            {
                _statusItem.Text = "Agente: parado (o Radar nao atualiza)";
                _toggleItem.Text = "Iniciar agente";
            }
        }

        private void ToggleAgent()
        {
            if (AnyAgentRunning())
            {
                _runner.Stop();
                StopStrayAgent();
                Balloon("BomDia Radar", "Agente parado. O Radar para de atualizar ate voce iniciar de novo.");
            }
            else
            {
                _runner.Start();
                Balloon("BomDia Radar", "Agente iniciado.");
            }
            UpdateStatus();
        }

        private void RunOnce()
        {
            _runner.RunOnce();
            Balloon("BomDia Radar", "Rodada rapida iniciada. Abra o Radar em instantes.");
        }

        private void OpenLog()
        {
            if (File.Exists(_logPath))
            {
                try
                {
                    Process.Start("notepad.exe", "\"" + _logPath + "\"");
                }
                catch (Exception error)
                {
                    Balloon("BomDia Radar", "Nao consegui abrir o log: " + error.Message);
                }
            }
            else
            {
                Balloon("BomDia Radar", "Ainda nao ha log do agente.");
            }
        }

        private void Balloon(string title, string text)
        {
            _icon.BalloonTipTitle = title;
            _icon.BalloonTipText = text;
            _icon.ShowBalloonTip(3000);
        }

        private void ExitApp()
        {
            _timer.Stop();
            _runner.Stop();
            StopStrayAgent();
            _icon.Visible = false;
            _icon.Dispose();
            ExitThread();
        }
    }

    internal sealed class AgentRunner
    {
        private const int RestartDelayMs = 10000;

        private static readonly string NodePath = FindNode();

        private readonly string _agentDir;
        private readonly string _logPath;
        private readonly object _logLock = new object();
        private readonly object _runnerLock = new object();
        private Thread _thread;
        private Process _current;
        private volatile bool _stop;

        public AgentRunner(string agentDir, string logPath)
        {
            _agentDir = agentDir;
            _logPath = logPath;
        }

        public bool HasLiveProcess
        {
            get
            {
                Process process = _current;
                if (process == null)
                {
                    return false;
                }
                try
                {
                    return !process.HasExited;
                }
                catch (InvalidOperationException)
                {
                    return false;
                }
            }
        }

        public void Start()
        {
            lock (_runnerLock)
            {
                if (_thread != null && _thread.IsAlive)
                {
                    return;
                }
                _stop = false;
                _thread = new Thread(WatchLoop);
                _thread.IsBackground = true;
                _thread.Start();
            }
        }

        public void Stop()
        {
            _stop = true;
            lock (_runnerLock)
            {
                Process process = _current;
                if (process != null)
                {
                    try
                    {
                        if (!process.HasExited)
                        {
                            process.Kill();
                        }
                    }
                    catch (Exception)
                    {
                    }
                }
                Thread thread = _thread;
                if (thread != null)
                {
                    thread.Join(3000);
                    _thread = null;
                }
                _current = null;
            }
        }

        public void RunOnce()
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    Process process = Spawn("once");
                    process.WaitForExit();
                    process.Dispose();
                }
                catch (Exception error)
                {
                    Append("[bandeja] falha na rodada rapida: " + error.Message);
                }
            });
        }

        private void WatchLoop()
        {
            while (!_stop)
            {
                try
                {
                    Process process = Spawn("watch");
                    _current = process;
                    process.WaitForExit();
                    process.Dispose();
                }
                catch (Exception error)
                {
                    Append("[bandeja] falha ao iniciar o agente: " + error.Message);
                }
                _current = null;
                SleepWhileRunning(RestartDelayMs);
            }
        }

        private void SleepWhileRunning(int milliseconds)
        {
            int remaining = milliseconds;
            while (remaining > 0 && !_stop)
            {
                int step = Math.Min(200, remaining);
                Thread.Sleep(step);
                remaining -= step;
            }
        }

        private Process Spawn(string mode)
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = NodePath;
            info.Arguments = "--env-file-if-exists=.env src\\index.js " + mode;
            info.WorkingDirectory = _agentDir;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;

            Process process = new Process();
            process.StartInfo = info;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args) { Append(args.Data); };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args) { Append(args.Data); };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return process;
        }

        private void Append(string line)
        {
            if (line == null)
            {
                return;
            }
            lock (_logLock)
            {
                try
                {
                    File.AppendAllText(_logPath, line + Environment.NewLine);
                }
                catch (IOException)
                {
                }
                catch (UnauthorizedAccessException)
                {
                }
            }
        }

        private static string FindNode()
        {
            string path = Environment.GetEnvironmentVariable("PATH");
            if (path != null)
            {
                foreach (string part in path.Split(';'))
                {
                    string dir = part.Trim();
                    if (dir.Length == 0)
                    {
                        continue;
                    }
                    try
                    {
                        string candidate = Path.Combine(dir, "node.exe");
                        if (File.Exists(candidate))
                        {
                            return candidate;
                        }
                    }
                    catch (ArgumentException)
                    {
                    }
                }
            }
            string fallback = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
            if (File.Exists(fallback))
            {
                return fallback;
            }
            return "node";
        }
    }
}
