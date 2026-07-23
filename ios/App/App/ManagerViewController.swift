import UIKit
import Capacitor

/// Custom bridge view controller for SafePass Manager.
///
/// Exists (for now) solely to register app-target Capacitor plugins: plugins
/// compiled into the App target (vs. Swift Packages or npm packages) are not
/// auto-discovered in Capacitor 6+ and must be registered explicitly in
/// capacitorDidLoad — the same pattern the kiosk app uses
/// (KioskViewController). Main.storyboard points its view controller at this
/// class.
class ManagerViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureStoragePlugin())
    }
}
