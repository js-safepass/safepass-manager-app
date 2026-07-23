package com.safepass.manager;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.security.KeyStore;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import org.json.JSONObject;

/**
 * SafePass Manager: persists the Cognito REFRESH TOKEN, encrypted with a
 * hardware-backed Android Keystore key, so the app can silently restore its
 * session after any WebView reload (app update, cold start, OS kill).
 *
 * Android counterpart of ios/App/App/SecureStoragePlugin.swift — same
 * 3-method surface (set/get/remove), same opaque-UTF-8-payload contract
 * (JSON encoded by src/lib/sessionPersistence.js). Deliberately NOT
 * androidx.security-crypto (deprecated): a direct Keystore AES-GCM cipher is
 * ~the same size and keeps the Tier-2 path natural (the planned biometric
 * gate sets setUserAuthenticationRequired(true) on this same key — a key
 * attribute change, not a storage migration; see
 * docs/session-persistence-plan.md).
 *
 * Storage: app-private SharedPreferences holding base64(iv || ciphertext).
 * The Keystore key never leaves hardware; prefs contents are useless without
 * it. A failed decrypt (key invalidated, corrupt data) resolves as "absent"
 * so the JS layer falls back to a normal login rather than crashing.
 */
@CapacitorPlugin(name = "SecureStorage")
public class SecureStoragePlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "safepass.manager.securestorage";
    private static final String PREFS = "safepass_secure_storage";
    private static final int GCM_TAG_BITS = 128;
    private static final int GCM_IV_BYTES = 12;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        KeyStore.Entry existing = ks.getEntry(KEY_ALIAS, null);
        if (existing instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.isEmpty()) {
            call.reject("Missing or empty 'key'");
            return;
        }
        if (value == null) {
            call.reject("Missing 'value'");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] iv = cipher.getIV();
            byte[] ct = cipher.doFinal(value.getBytes("UTF-8"));
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            prefs().edit().putString(key, Base64.encodeToString(out, Base64.NO_WRAP)).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Keystore set failed: " + e.getClass().getSimpleName());
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("Missing or empty 'key'");
            return;
        }
        JSObject result = new JSObject();
        String stored = prefs().getString(key, null);
        if (stored == null) {
            result.put("value", JSONObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            byte[] in = Base64.decode(stored, Base64.NO_WRAP);
            byte[] iv = Arrays.copyOfRange(in, 0, GCM_IV_BYTES);
            byte[] ct = Arrays.copyOfRange(in, GCM_IV_BYTES, in.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            result.put("value", new String(cipher.doFinal(ct), "UTF-8"));
            call.resolve(result);
        } catch (Exception e) {
            // Key invalidated / corrupt payload — treat as absent (JS wipes and
            // falls back to a normal login) rather than failing the boot path.
            prefs().edit().remove(key).apply();
            result.put("value", JSONObject.NULL);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("Missing or empty 'key'");
            return;
        }
        prefs().edit().remove(key).apply();
        call.resolve();
    }
}
