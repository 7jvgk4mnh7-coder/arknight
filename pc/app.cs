// 方舟剧情库 · Windows 桌面版
// 用 .NET Framework + WebView2 做的极薄外壳：整页 HTML 内嵌在 exe 里，
// 首次运行释放到 %LOCALAPPDATA%\ArknightsLore\lore.html，然后交给 WebView2 显示。
using System;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyVersion("0.4.0.0")]
[assembly: AssemblyTitle("方舟剧情库")]
[assembly: AssemblyProduct("方舟剧情库")]

namespace ArknightsLore
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try { Application.Run(new MainForm()); }
            catch (Exception ex)
            {
                MessageBox.Show("启动失败：\n" + ex.Message, "方舟剧情库", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    public class MainForm : Form
    {
        private WebView2 web;
        private static readonly string Root =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ArknightsLore");

        public MainForm()
        {
            Text = "方舟剧情库";
            Width = 1240;
            Height = 860;
            MinimumSize = new Size(720, 520);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(247, 246, 243);

            try
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.ico"))
                {
                    if (s != null) Icon = new Icon(s);
                }
            }
            catch { /* 图标加载失败不影响使用 */ }

            web = new WebView2();
            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = Color.FromArgb(247, 246, 243);
            Controls.Add(web);
            Load += async delegate { await InitAsync(); };
        }

        private static string ExtractHtml()
        {
            Directory.CreateDirectory(Root);
            string path = Path.Combine(Root, "lore.html");
            string stamp = Path.Combine(Root, "version.txt");
            string ver = Assembly.GetExecutingAssembly().GetName().Version.ToString();

            // 用「内嵌资源长度」判断是否需要重新释放：换版本、换页面都会变，比只看版本号可靠
            long 内嵌长度;
            using (Stream rs = Assembly.GetExecutingAssembly().GetManifestResourceStream("lore.html"))
            {
                if (rs == null) throw new InvalidOperationException("内置页面缺失");
                内嵌长度 = rs.Length;
            }
            bool fresh =
                File.Exists(path) &&
                new FileInfo(path).Length == 内嵌长度 &&
                File.Exists(stamp) &&
                File.ReadAllText(stamp).Trim() == ver + ":" + 内嵌长度;

            if (!fresh)
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("lore.html"))
                using (FileStream f = File.Create(path))
                {
                    s.CopyTo(f);
                }
                File.WriteAllText(stamp, ver + ":" + 内嵌长度);
            }
            return path;
        }

        private async System.Threading.Tasks.Task InitAsync()
        {
            try
            {
                string dataDir = Path.Combine(Root, "webview");
                Directory.CreateDirectory(dataDir);
                CoreWebView2Environment env =
                    await CoreWebView2Environment.CreateAsync(null, dataDir, null);
                await web.EnsureCoreWebView2Async(env);

                CoreWebView2Settings st = web.CoreWebView2.Settings;
                st.AreDevToolsEnabled = false;
                st.IsStatusBarEnabled = false;
                st.AreDefaultContextMenusEnabled = false;
                st.IsZoomControlEnabled = false;
                st.AreBrowserAcceleratorKeysEnabled = true;

                web.CoreWebView2.WebMessageReceived += OnWebMessage;

                // 带上长度做 cache-buster，避免 WebView 拿旧页面
                Navigate();

                // 启动后顺手查一次更新（静默，失败不打扰）
                await System.Threading.Tasks.Task.Delay(1500);
                try { await CheckUpdateAsync(true); } catch { }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "这台电脑缺少 Microsoft Edge WebView2 运行时，无法显示剧情库。\n\n" +
                    "装一下这个（微软官方，Win10/11 一般已自带）：\n" +
                    "https://go.microsoft.com/fwlink/p/?LinkId=2124703\n\n" +
                    "错误信息：" + ex.Message,
                    "方舟剧情库", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        // ---------------- 页面导航 / 更新 ----------------

        private void Navigate()
        {
            string path = ExtractHtml();
            string url = new Uri(path).AbsoluteUri
                + "?v=" + new FileInfo(path).Length
                + "&ver=" + Uri.EscapeDataString(UpdateCfg.Version)
                + "&repo=" + Uri.EscapeDataString(UpdateCfg.Repo);
            web.CoreWebView2.Navigate(url);
        }

        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string json = e.WebMessageAsJson;
                if (json.IndexOf("check-update", StringComparison.Ordinal) >= 0)
                {
                    var ignored = CheckUpdateAsync(false);
                }
                else if (json.IndexOf("do-update", StringComparison.Ordinal) >= 0)
                {
                    var ignored = DoUpdateAsync(false);
                }
                else if (json.IndexOf("open-repo", StringComparison.Ordinal) >= 0)
                {
                    try { System.Diagnostics.Process.Start("https://github.com/" + UpdateCfg.Repo); } catch { }
                }
            }
            catch { }
        }

        private void 回复(string json)
        {
            try { web.CoreWebView2.PostWebMessageAsJson(json); } catch { }
        }

        private static string 转义(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
        }

        private static string 取字段(string json, string 名)
        {
            Match m = Regex.Match(json, "\"" + 名 + "\"\\s*:\\s*\"([^\"]*)\"");
            return m.Success ? m.Groups[1].Value : "";
        }

        private string 当前版本()
        {
            string stamp = Path.Combine(Root, "version.txt");
            try
            {
                if (File.Exists(stamp))
                {
                    string v = File.ReadAllText(stamp).Trim();
                    return v.Split(':')[0];
                }
            }
            catch { }
            return UpdateCfg.Version;
        }

        private async System.Threading.Tasks.Task CheckUpdateAsync(bool silent)
        {
            try
            {
                using (HttpClient http = new HttpClient())
                {
                    http.Timeout = TimeSpan.FromSeconds(20);
                    http.DefaultRequestHeaders.Add("User-Agent", "ArknightsLore/" + UpdateCfg.Version);
                    string url = "https://raw.githubusercontent.com/" + UpdateCfg.Repo + "/" + UpdateCfg.Branch
                        + "/dist/release/version.json?t=" + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    string body = await http.GetStringAsync(url);

                    string 最新 = 取字段(body, "version");
                    string 说明 = 取字段(body, "notes");
                    string 大小 = Regex.Match(body, "\"size\"\\s*:\\s*(\\d+)").Success
                        ? Regex.Match(body, "\"size\"\\s*:\\s*(\\d+)").Groups[1].Value : "0";
                    bool 有新版 = 最新.Length > 0 && 最新 != 当前版本();

                    回复("{\"type\":\"update-result\",\"ok\":true,\"silent\":" + (silent ? "true" : "false")
                        + ",\"current\":\"" + 转义(当前版本()) + "\",\"latest\":\"" + 转义(最新)
                        + "\",\"notes\":\"" + 转义(说明) + "\",\"size\":" + 大小
                        + ",\"newer\":" + (有新版 ? "true" : "false") + "}");
                }
            }
            catch (Exception ex)
            {
                if (!silent)
                {
                    回复("{\"type\":\"update-result\",\"ok\":false,\"error\":\"" + 转义(ex.Message) + "\"}");
                }
            }
        }

        private async System.Threading.Tasks.Task DoUpdateAsync(bool silent)
        {
            try
            {
                using (HttpClient http = new HttpClient())
                {
                    http.Timeout = TimeSpan.FromMinutes(5);
                    http.DefaultRequestHeaders.Add("User-Agent", "ArknightsLore/" + UpdateCfg.Version);
                    string url = "https://raw.githubusercontent.com/" + UpdateCfg.Repo + "/" + UpdateCfg.Branch
                        + "/dist/release/lore.html?t=" + DateTimeOffset.UtcNow.ToUnixTimeSeconds();

                    string 临时 = Path.Combine(Root, "lore.new.html");
                    long 已收 = 0;
                    long 总数 = 0;
                    using (HttpResponseMessage resp = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead))
                    {
                        resp.EnsureSuccessStatusCode();
                        总数 = resp.Content.Headers.ContentLength.HasValue ? resp.Content.Headers.ContentLength.Value : 0;
                        using (Stream src = await resp.Content.ReadAsStreamAsync())
                        using (FileStream fs = File.Create(临时))
                        {
                            byte[] buf = new byte[81920];
                            DateTime 上次 = DateTime.UtcNow;
                            int n;
                            while ((n = await src.ReadAsync(buf, 0, buf.Length)) > 0)
                            {
                                await fs.WriteAsync(buf, 0, n);
                                已收 += n;
                                if ((DateTime.UtcNow - 上次).TotalMilliseconds > 180)
                                {
                                    上次 = DateTime.UtcNow;
                                    回复("{\"type\":\"update-progress\",\"received\":" + 已收 + ",\"total\":" + 总数 + "}");
                                }
                            }
                        }
                    }
                    if (已收 < 1024 * 512) throw new InvalidOperationException("下载内容异常（" + 已收 + " 字节）");
                    回复("{\"type\":\"update-progress\",\"received\":" + 已收 + ",\"total\":" + (总数 > 0 ? 总数 : 已收) + "}");

                    // 版本号从新页面里取不到，就沿用清单里的；这里用长度做标记，下次启动会重算
                    string 清单 = "";
                    try
                    {
                        string vu = "https://raw.githubusercontent.com/" + UpdateCfg.Repo + "/" + UpdateCfg.Branch
                            + "/dist/release/version.json?t=" + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                        string body = await http.GetStringAsync(vu);
                        清单 = 取字段(body, "version");
                    }
                    catch { }

                    string 正本 = Path.Combine(Root, "lore.html");
                    if (File.Exists(正本)) File.Delete(正本);
                    File.Move(临时, 正本);
                    File.WriteAllText(Path.Combine(Root, "version.txt"), (清单.Length > 0 ? 清单 : UpdateCfg.Version) + ":" + 已收);

                    foreach (string 旧 in Directory.GetFiles(Root, "lore.new.*"))
                    {
                        try { File.Delete(旧); } catch { }
                    }

                    回复("{\"type\":\"update-done\",\"ok\":true,\"size\":" + 已收 + ",\"version\":\"" + 转义(清单) + "\"}");
                    Navigate();
                }
            }
            catch (Exception ex)
            {
                if (!silent)
                {
                    回复("{\"type\":\"update-done\",\"ok\":false,\"error\":\"" + 转义(ex.Message) + "\"}");
                }
            }
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            try { if (web != null) web.Dispose(); } catch { }
            base.OnFormClosed(e);
        }
    }
}
