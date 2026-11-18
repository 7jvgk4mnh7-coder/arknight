package com.arktios.lore;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 方舟剧情库 · 安卓外壳
 *
 * 把一个离线 HTML 装进 WebView。页面默认来自 assets/lore.html；
 * 如果之前更新过，优先用 filesDir/lore.html（页面自带检索、档案、时间轴的全部逻辑）。
 *
 * 更新：页面通过 window.arkUpdate.check() / apply() 调这里，
 * 这里去 GitHub raw 拉 version.json / lore.html，下完替换本地文件再重新加载。
 */
public class MainActivity extends Activity {

    // 与 update.json 保持一致，由 scripts/build-android.mjs 注入
    static final String UPDATE_REPO = "__REPO__";
    static final String UPDATE_BRANCH = "__BRANCH__";
    static final String APP_VERSION = "__VERSION__";

    private static final String ASSET_URL = "file:///android_asset/lore.html";
    private static final int BG = 0xFFF7F6F3;

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        if (window != null) window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(BG));

        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "arkUpdate");
        setContentView(web);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            loadPage(null);
        }
    }

    /** 更新过的页面优先；没有就用内置的 */
    private void loadPage(String verOverride) {
        File local = new File(getFilesDir(), "lore.html");
        String ver = verOverride != null ? verOverride : readVersion();
        if (local.exists() && local.length() > 1024 * 512) {
            web.loadUrl("file://" + local.getAbsolutePath() + "?ver=" + ver + "&repo=" + UPDATE_REPO);
        } else {
            web.loadUrl(ASSET_URL + "?ver=" + ver + "&repo=" + UPDATE_REPO);
        }
    }

    private String readVersion() {
        try {
            File f = new File(getFilesDir(), "version.txt");
            if (f.exists()) {
                byte[] b = new byte[(int) f.length()];
                java.io.FileInputStream in = new java.io.FileInputStream(f);
                in.read(b);
                in.close();
                return new String(b, "UTF-8").trim();
            }
        } catch (Exception ignored) { }
        return APP_VERSION;
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", "");
    }

    private static String 取(JSONObject o, String k, String 默认) {
        String v = o.optString(k, "");
        return v.length() > 0 ? v : 默认;
    }

    private static String 读入口(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(60000);
        c.setRequestProperty("User-Agent", "ArknightsLore/" + APP_VERSION);
        c.setRequestProperty("Cache-Control", "no-cache");
        int code = c.getResponseCode();
        if (code / 100 != 2) throw new Exception("HTTP " + code);
        InputStream in = new BufferedInputStream(c.getInputStream());
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        c.disconnect();
        return new String(out.toByteArray(), "UTF-8");
    }

    /** 把 Java 字符串安全地塞进 JS（替代 JS 的 JSON.stringify） */
    private static String js(String s) {
        if (s == null) s = "";
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                default: b.append(c);
            }
        }
        return b.append("\"").toString();
    }

    private void 回调(final String js) {
        runOnUiThread(new Runnable() {
            public void run() {
                try { web.evaluateJavascript(js, null); } catch (Exception ignored) { }
            }
        });
    }

    /** 暴露给页面的对象：window.arkUpdate */
    private class Bridge {
        @JavascriptInterface
        public String version() {
            return readVersion();
        }

        @JavascriptInterface
        public String repo() {
            return UPDATE_REPO;
        }

        @JavascriptInterface
        public void check() {
            new Thread(new Runnable() {
                public void run() {
                    try {
                        String base = "https://raw.githubusercontent.com/" + UPDATE_REPO + "/" + UPDATE_BRANCH
                                + "/dist/release/";
                        String body = 读入口(base + "version.json?t=" + (System.currentTimeMillis() / 1000));
                        JSONObject o = new JSONObject(body);
                        String latest = o.optString("version", "");
                        String notes = o.optString("notes", "");
                        long size = o.optLong("size", 0);
                        boolean newer = latest.length() > 0 && !latest.equals(readVersion());
                        回调("window.__arkUpdate && window.__arkUpdate.result({ok:true,current:" + js(readVersion())
                                + ",latest:" + js(latest) + ",notes:" + js(notes)
                                + ",size:" + size + ",newer:" + (newer ? "true" : "false") + "})");
                    } catch (Exception e) {
                        回调("window.__arkUpdate && window.__arkUpdate.result({ok:false,error:" + js(String.valueOf(e.getMessage())) + "})");
                    }
                }
            }).start();
        }

        @JavascriptInterface
        public void apply() {
            new Thread(new Runnable() {
                public void run() {
                    try {
                        String base = "https://raw.githubusercontent.com/" + UPDATE_REPO + "/" + UPDATE_BRANCH
                                + "/dist/release/";
                        String body = 读入口(base + "version.json?t=" + (System.currentTimeMillis() / 1000));
                        JSONObject o = new JSONObject(body);
                        String latest = o.optString("version", "");

                        HttpURLConnection c = (HttpURLConnection) new URL(base + "lore.html?t=" + (System.currentTimeMillis() / 1000)).openConnection();
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(120000);
                        c.setRequestProperty("User-Agent", "ArknightsLore/" + APP_VERSION);
                        int code = c.getResponseCode();
                        if (code / 100 != 2) throw new Exception("HTTP " + code);

                        long 总数 = c.getContentLength();
                        File 临时 = new File(getFilesDir(), "lore.new.html");
                        FileOutputStream out = new FileOutputStream(临时);
                        InputStream in = new BufferedInputStream(c.getInputStream());
                        byte[] buf = new byte[65536];
                        int n;
                        long 总 = 0;
                        long 上次 = 0;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            总 += n;
                            if (总 - 上次 > 300 * 1024) {
                                上次 = 总;
                                回调("window.__arkUpdate && window.__arkUpdate.progress({received:" + 总 + ",total:" + 总数 + "})");
                            }
                        }
                        out.close();
                        in.close();
                        c.disconnect();
                        回调("window.__arkUpdate && window.__arkUpdate.progress({received:" + 总 + ",total:" + (总数 > 0 ? 总数 : 总) + "})");

                        if (总 < 512 * 1024) throw new Exception("下载内容异常（" + 总 + " 字节）");

                        File 正本 = new File(getFilesDir(), "lore.html");
                        if (正本.exists()) 正本.delete();
                        if (!临时.renameTo(正本)) throw new Exception("写入失败");

                        FileOutputStream vf = new FileOutputStream(new File(getFilesDir(), "version.txt"));
                        vf.write(latest.getBytes("UTF-8"));
                        vf.close();

                        回调("window.__arkUpdate && window.__arkUpdate.done({ok:true,version:" + js(latest) + "})");
                        runOnUiThread(new Runnable() {
                            public void run() { loadPage(null); }
                        });
                    } catch (Exception e) {
                        回调("window.__arkUpdate && window.__arkUpdate.done({ok:false,error:" + js(String.valueOf(e.getMessage())) + "})");
                    }
                }
            }).start();
        }

        @JavascriptInterface
        public void openRepo() {
            try {
                android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW,
                        android.net.Uri.parse("https://github.com/" + UPDATE_REPO));
                startActivity(i);
            } catch (Exception ignored) { }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.setWebViewClient(null);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
