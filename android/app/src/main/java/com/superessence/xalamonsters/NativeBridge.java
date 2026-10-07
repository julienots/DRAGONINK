package com.superessence.xalamonsters;

import android.app.Activity;
import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Pont JavaScript ↔ Android exposé sous window.XalaNative.
 * La sauvegarde est écrite de façon atomique : fichier temporaire + fsync +
 * renommage, pour résister à une fermeture brutale de l'application.
 */
public class NativeBridge {
    private final Activity activity;
    private final WebView web;
    private final File dir;
    private final BillingBridge billing;

    NativeBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        this.dir = new File(activity.getFilesDir(), "saves");
        if (!dir.exists()) dir.mkdirs();
        this.billing = new BillingBridge(activity, this);
    }

    private File fileFor(String key) {
        return new File(dir, key.replaceAll("[^A-Za-z0-9._-]", "_") + ".json");
    }

    @JavascriptInterface
    public boolean saveWrite(String key, String value) {
        File target = fileFor(key);
        File tmp = new File(dir, target.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(value.getBytes(StandardCharsets.UTF_8));
            out.flush();
            out.getFD().sync();
        } catch (IOException e) {
            return false;
        }
        return tmp.renameTo(target);
    }

    @JavascriptInterface
    public String saveRead(String key) {
        File f = fileFor(key);
        if (!f.exists()) return null;
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toString("UTF-8");
        } catch (IOException e) {
            return null;
        }
    }

    @JavascriptInterface
    public void saveRemove(String key) {
        //noinspection ResultOfMethodCallIgnored
        fileFor(key).delete();
    }

    @JavascriptInterface
    public void vibrate(int ms) {
        Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null) return;
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), VibrationEffect.DEFAULT_AMPLITUDE));
        else v.vibrate(ms);
    }

    @JavascriptInterface
    public String platform() {
        return "android:" + Build.VERSION.SDK_INT + ":" + Build.MODEL;
    }

    @JavascriptInterface
    public boolean billingAvailable() {
        return billing.isSupported();
    }

    /** Appel asynchrone : la réponse revient via window.__xalaBilling(id, ok, json). */
    @JavascriptInterface
    public void billingCall(final String id, final String method, final String argJson) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() { billing.call(id, method, argJson); }
        });
    }

    void reply(String id, boolean ok, String payload) {
        final String js = "window.__xalaBilling && window.__xalaBilling(" + JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(payload == null ? "null" : payload) + ")";
        web.post(new Runnable() {
            @Override
            public void run() { web.evaluateJavascript(js, null); }
        });
    }

    void dispose() {
        billing.dispose();
    }
}
