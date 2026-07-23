import Foundation
import Capacitor
import Security

// SafePass Manager: persists the Cognito REFRESH TOKEN to the iOS Keychain so
// the app can silently restore its session after any WebView reload (app
// update, cold start, OS memory recycle). Ported from the kiosk chassis
// (safepass-kiosk-web SecureStoragePlugin.swift) per D12 copy-per-app; the
// custody decision + wipe rules live in docs/session-persistence-plan.md.
//
// The payload is opaque UTF-8 text to this plugin (JSON encoded by the JS
// caller, src/lib/sessionPersistence.js). ID/access tokens are NEVER stored —
// restore mints fresh ones via the refresh grant.
//
// ACL: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
//   - AfterFirstUnlock: available once the device has been unlocked after
//     boot — the norm for a staff phone/tablet in use.
//   - ThisDeviceOnly: keeps entries out of iCloud Keychain backups.
// Tier 2 (planned) adds a SecAccessControl biometry policy to this same item
// — an attribute change, not a storage migration.

@objc(SecureStoragePlugin)
public class SecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureStoragePlugin"
    public let jsName = "SecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private let service = "com.safepass.manager"

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Missing or empty 'key'")
            return
        }
        guard let value = call.getString("value") else {
            call.reject("Missing 'value'")
            return
        }
        guard let data = value.data(using: .utf8) else {
            call.reject("Value must be valid UTF-8")
            return
        }

        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        // Try to update first; if the item doesn't exist, add it.
        let updateAttrs: [String: Any] = [kSecValueData as String: data]
        var status = SecItemUpdate(baseQuery as CFDictionary, updateAttrs as CFDictionary)

        if status == errSecItemNotFound {
            var addQuery = baseQuery
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(addQuery as CFDictionary, nil)
        }

        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Keychain set failed (OSStatus \(status))")
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Missing or empty 'key'")
            return
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true,
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        switch status {
        case errSecSuccess:
            guard let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
                call.resolve(["value": NSNull()])
                return
            }
            call.resolve(["value": value])
        case errSecItemNotFound:
            call.resolve(["value": NSNull()])
        default:
            call.reject("Keychain get failed (OSStatus \(status))")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Missing or empty 'key'")
            return
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        let status = SecItemDelete(query as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("Keychain remove failed (OSStatus \(status))")
        }
    }
}
