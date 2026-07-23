package com.safepass.manager;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local Capacitor plugins must be registered before the bridge
        // initializes (super.onCreate). Android counterpart of the iOS
        // ManagerViewController.capacitorDidLoad registration.
        registerPlugin(SecureStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
