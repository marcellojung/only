using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

internal sealed class MoaLauncher : Form
{
    private readonly string root;
    private readonly Label status = new Label();
    private readonly FlowLayoutPanel actions = new FlowLayoutPanel();
    private bool working;

    private MoaLauncher(string projectRoot)
    {
        root = projectRoot;
        Text = "모아 · 가족 자산";
        ClientSize = new Size(530, 255);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(247, 250, 248);
        Font = new Font("Malgun Gothic", 10);
        Controls.Add(new Label { Text = "우리 집 자산, 한 번에 열기", AutoSize = true, Location = new Point(25, 23), Font = new Font("Malgun Gothic", 17, FontStyle.Bold) });
        status.Text = "실행 환경을 확인하고 있어요…";
        status.SetBounds(27, 72, 475, 65);
        Controls.Add(status);
        actions.SetBounds(24, 145, 485, 42);
        Controls.Add(actions);
        AddButton("앱 열기", async () => await Run("Start", true));
        AddButton("재시작", async () => await Run("Restart", true));
        AddButton("종료", async () => await Run("Stop", false));
        AddButton("로그 보기", () => { Process.Start(new ProcessStartInfo(Path.Combine(root, "data")) { UseShellExecute = true }); return Task.FromResult(0); });
        Controls.Add(new Label { Text = "이 창을 닫아도 앱은 계속 실행됩니다. 종료 버튼으로 끌 수 있어요.", AutoSize = false, Location = new Point(27, 207), Size = new Size(480, 38), ForeColor = Color.DimGray, Font = new Font("Malgun Gothic", 9) });
        Shown += async (sender, args) => await Run("Start", true);
        FormClosing += (sender, args) => { if (working) { args.Cancel = true; status.Text = "현재 작업이 끝난 뒤 창을 닫아 주세요."; } };
    }
    private void AddButton(string text, Func<Task> action)
    {
        var button = new Button { Text = text, Width = 108, Height = 34, FlatStyle = FlatStyle.Flat, BackColor = Color.White, Margin = new Padding(2, 0, 8, 0) };
        button.Click += async (sender, args) => { try { await action(); } catch (Exception error) { status.Text = error.Message; } };
        actions.Controls.Add(button);
    }
    private async Task Run(string action, bool open)
    {
        if (working) return;
        working = true; actions.Enabled = false;
        status.Text = action == "Stop" ? "앱을 종료하고 있어요…" : "앱을 준비하고 있어요. 잠시만 기다려 주세요…";
        try
        {
            var result = await Task.Run(() => Execute(root, action));
            status.Text = result.Item2.Trim();
            if (result.Item1 == 0 && open) Process.Start(new ProcessStartInfo("http://127.0.0.1:3000") { UseShellExecute = true });
        }
        catch (Exception error) { status.Text = "실행 실패: " + error.Message; }
        finally { working = false; actions.Enabled = true; }
    }
    private static Tuple<int, string> Execute(string projectRoot, string action)
    {
        string script = Path.Combine(projectRoot, "scripts", "windows", "control.ps1");
        if (!File.Exists(script)) throw new FileNotFoundException("프로젝트 실행 파일이 없습니다. 프로젝트를 이동했다면 실행기를 다시 만들어 주세요.");
        var info = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe"))
        {
            Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\" -Action " + action,
            WorkingDirectory = projectRoot, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        using (var process = Process.Start(info))
        {
            var output = process.StandardOutput.ReadToEndAsync();
            var error = process.StandardError.ReadToEndAsync();
            process.WaitForExit();
            return Tuple.Create(process.ExitCode, output.Result + error.Result);
        }
    }
    [STAThread]
    public static int Main(string[] args)
    {
        string projectRoot;
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Moa.ProjectRoot"))
        using (var reader = new StreamReader(stream, Encoding.UTF8)) projectRoot = reader.ReadToEnd().Trim();
        if (args.Length == 1 && args[0] == "--check") return File.Exists(Path.Combine(projectRoot, "scripts", "windows", "control.ps1")) ? 0 : 1;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MoaLauncher(projectRoot));
        return 0;
    }
}
