package com.superessence.xalamonsters;

import android.app.Activity;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Google Play Billing (variante "play"). Le jeu n'accorde la récompense
 * qu'après réception du reçu, la sauvegarde, puis demande la confirmation
 * (consume / acknowledge) : aucun achat perdu, aucune double récompense.
 * Dans une version en ligne, le reçu (purchaseToken + signature) doit être
 * vérifié côté serveur via l'API Google Play Developer avant l'octroi.
 */
public class BillingBridge {
    private final Activity activity;
    private final NativeBridge bridge;
    private final BillingClient client;
    private final Map<String, ProductDetails> details = new HashMap<>();
    private String pendingPurchaseCall = null;

    BillingBridge(Activity activity, NativeBridge bridge) {
        this.activity = activity;
        this.bridge = bridge;
        this.client = BillingClient.newBuilder(activity)
                .setListener(this::onPurchasesUpdated)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
    }

    boolean isSupported() { return true; }

    void call(String id, String method, String argJson) {
        try {
            switch (method) {
                case "init": connect(() -> bridge.reply(id, true, "{}"), id); break;
                case "products": connect(() -> queryProducts(id, new JSONArray(argJson)), id); break;
                case "purchase": connect(() -> purchase(id, new JSONObject(argJson).getString("sku")), id); break;
                case "finish": connect(() -> finish(id, new JSONObject(argJson)), id); break;
                case "pending": connect(() -> queryOwned(id, true), id); break;
                case "owned": connect(() -> queryOwned(id, false), id); break;
                default: bridge.reply(id, false, err("unknown", "Méthode inconnue"));
            }
        } catch (JSONException e) {
            bridge.reply(id, false, err("unknown", e.getMessage()));
        }
    }

    private interface Task { void run() throws JSONException; }

    private void connect(Task then, String id) {
        if (client.isReady()) { safe(then, id); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) safe(then, id);
                else bridge.reply(id, false, err("unavailable", r.getDebugMessage()));
            }
            @Override public void onBillingServiceDisconnected() { /* reconnexion au prochain appel */ }
        });
    }

    private void safe(Task t, String id) {
        try { t.run(); } catch (Exception e) { bridge.reply(id, false, err("unknown", String.valueOf(e.getMessage()))); }
    }

    private void queryProducts(String id, JSONArray skus) throws JSONException {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        for (int i = 0; i < skus.length(); i++) {
            list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(skus.getString(i)).setProductType(BillingClient.ProductType.INAPP).build());
        }
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build(), (r, res) -> {
            JSONArray out = new JSONArray();
            for (ProductDetails d : res.getProductDetailsList()) {
                details.put(d.getProductId(), d);
                try {
                    JSONObject o = new JSONObject();
                    o.put("sku", d.getProductId());
                    o.put("price", d.getOneTimePurchaseOfferDetails() != null ? d.getOneTimePurchaseOfferDetails().getFormattedPrice() : "");
                    out.put(o);
                } catch (JSONException ignored) { }
            }
            bridge.reply(id, r.getResponseCode() == BillingClient.BillingResponseCode.OK, out.toString());
        });
    }

    private void purchase(String id, String sku) {
        ProductDetails d = details.get(sku);
        if (d == null) {
            List<QueryProductDetailsParams.Product> list = new ArrayList<>();
            list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(sku).setProductType(BillingClient.ProductType.INAPP).build());
            client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build(), (r, res) -> {
                if (res.getProductDetailsList().isEmpty()) { bridge.reply(id, false, err("unavailable", "Produit indisponible")); return; }
                details.put(sku, res.getProductDetailsList().get(0));
                activity.runOnUiThread(() -> launch(id, res.getProductDetailsList().get(0)));
            });
            return;
        }
        launch(id, d);
    }

    private void launch(String id, ProductDetails d) {
        if (pendingPurchaseCall != null) { bridge.reply(id, false, err("unknown", "Un achat est déjà en cours")); return; }
        List<BillingFlowParams.ProductDetailsParams> p = new ArrayList<>();
        p.add(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build());
        pendingPurchaseCall = id;
        BillingResult r = client.launchBillingFlow(activity, BillingFlowParams.newBuilder().setProductDetailsParamsList(p).build());
        if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            pendingPurchaseCall = null;
            bridge.reply(id, false, err(code(r.getResponseCode()), r.getDebugMessage()));
        }
    }

    private void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        String id = pendingPurchaseCall;
        pendingPurchaseCall = null;
        if (id == null) return; // les achats hors flux sont récupérés via "pending" au démarrage
        if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            bridge.reply(id, false, err(code(r.getResponseCode()), r.getDebugMessage()));
            return;
        }
        Purchase p = purchases.get(0);
        if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) { bridge.reply(id, false, err("pending", "Paiement en attente")); return; }
        bridge.reply(id, true, receipt(p).toString());
    }

    private void finish(String id, JSONObject a) throws JSONException {
        String token = a.getString("token");
        if (a.getBoolean("consumable")) {
            client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(token).build(), (r, t) ->
                    bridge.reply(id, r.getResponseCode() == BillingClient.BillingResponseCode.OK, "{}"));
        } else {
            client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(), r ->
                    bridge.reply(id, r.getResponseCode() == BillingClient.BillingResponseCode.OK, "{}"));
        }
    }

    /** pendingOnly : achats payés mais non encore confirmés (à réappliquer). */
    private void queryOwned(String id, boolean pendingOnly) {
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (r, list) -> {
            JSONArray out = new JSONArray();
            for (Purchase p : list) {
                if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                if (pendingOnly && p.isAcknowledged()) continue;
                out.put(receipt(p));
            }
            bridge.reply(id, true, out.toString());
        });
    }

    private JSONObject receipt(Purchase p) {
        JSONObject o = new JSONObject();
        try {
            o.put("orderId", p.getOrderId() != null ? p.getOrderId() : p.getPurchaseToken());
            o.put("sku", p.getProducts().get(0));
            o.put("purchaseToken", p.getPurchaseToken());
            o.put("purchaseTime", p.getPurchaseTime());
            o.put("signature", p.getSignature());
            o.put("source", "play");
        } catch (JSONException ignored) { }
        return o;
    }

    private static String code(int c) {
        if (c == BillingClient.BillingResponseCode.USER_CANCELED) return "cancelled";
        if (c == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) return "already_owned";
        if (c == BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE || c == BillingClient.BillingResponseCode.SERVICE_DISCONNECTED || c == BillingClient.BillingResponseCode.NETWORK_ERROR) return "network";
        if (c == BillingClient.BillingResponseCode.BILLING_UNAVAILABLE || c == BillingClient.BillingResponseCode.ITEM_UNAVAILABLE) return "unavailable";
        return "unknown";
    }

    private static String err(String code, String msg) {
        JSONObject o = new JSONObject();
        try { o.put("code", code); o.put("message", msg == null ? "" : msg); } catch (JSONException ignored) { }
        return o.toString();
    }

    void dispose() {
        if (client.isReady()) client.endConnection();
    }
}
