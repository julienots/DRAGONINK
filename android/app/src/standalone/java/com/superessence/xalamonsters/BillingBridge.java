package com.superessence.xalamonsters;

import android.app.Activity;

/**
 * Variante "standalone" (APK de test hors Play Store, compilable sans la
 * bibliothèque Play Billing) : le magasin réel est déclaré indisponible et le
 * jeu bascule sur son magasin de test local, clairement signalé à l'écran.
 */
public class BillingBridge {
    private final NativeBridge bridge;

    BillingBridge(Activity activity, NativeBridge bridge) {
        this.bridge = bridge;
    }

    boolean isSupported() { return false; }

    void call(String id, String method, String argJson) {
        bridge.reply(id, false, "{\"code\":\"unavailable\",\"message\":\"Google Play Billing indisponible dans cette version\"}");
    }

    void dispose() { }
}
