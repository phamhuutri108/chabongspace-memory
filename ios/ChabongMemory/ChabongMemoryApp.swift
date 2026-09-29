import UIKit
import WebKit

@main
final class ChabongMemoryApp: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var bridge: CameraBridge?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let webView = WKWebView(frame: .zero, configuration: makeConfiguration())
        webView.allowsBackForwardNavigationGestures = false

        let controller = UIViewController()
        controller.view = webView

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        self.window = window

        let url = URL(string: "https://memory.chabongspace.com")!
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy))
        return true
    }

    private func makeConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        let contentController = WKUserContentController()
        let cameraBridge = CameraBridge()
        bridge = cameraBridge
        cameraBridge.attach(to: contentController, webViewProvider: { [weak self] in
            self?.window?.rootViewController?.view as? WKWebView
        })
        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true
        return configuration
    }
}