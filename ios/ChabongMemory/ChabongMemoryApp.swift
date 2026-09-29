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

        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear

        let controller = CameraHostViewController(webView: webView)

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
        }, cameraProvider: { [weak self] in
            (self?.window?.rootViewController as? CameraHostViewController)?.cameraController()
        })
        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true
        return configuration
    }
}

private final class CameraHostViewController: UIViewController {
    private let webView: WKWebView
    private let cameraViewController = CameraViewController()

    init(webView: WKWebView) {
        self.webView = webView
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        addChild(cameraViewController)
        cameraViewController.view.frame = view.bounds
        cameraViewController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(cameraViewController.view)
        cameraViewController.didMove(toParent: self)

        webView.frame = view.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.layer.zPosition = 10
        view.addSubview(webView)
    }

    func cameraController() -> CameraViewController { cameraViewController }
}