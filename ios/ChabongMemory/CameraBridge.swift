import Foundation
import WebKit

final class CameraBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?

    func attach(to controller: WKUserContentController, webViewProvider: @escaping () -> WKWebView?) {
        controller.add(self, name: "chabongCamera")
        self.webViewProvider = webViewProvider
    }

    private var webViewProvider: (() -> WKWebView?)?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "chabongCamera" else { return }
        guard let body = message.body as? [String: Any],
              (body["action"] as? String) == "capture",
              let webView = webViewProvider?() else { return }
        self.webView = webView

        let camera = CameraViewController()
        camera.onCapture = { [weak self] data, filename in
            self?.deliver(data: data, filename: filename)
        }
        camera.onCancel = { [weak self] in
            self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('chabong-native-camera-cancelled'))")
        }

        DispatchQueue.main.async {
            guard let presenter = webView.window?.rootViewController else { return }
            presenter.present(camera, animated: true)
        }
    }

    private func deliver(data: Data, filename: String) {
        guard let webView else { return }
        let base64 = data.base64EncodedString()
        let dataURL = "data:image/jpeg;base64,\(base64)"
        let payload: [String: String] = ["dataUrl": dataURL, "filename": filename]
        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: jsonData, encoding: .utf8) else { return }
        let script = "window.dispatchEvent(new CustomEvent('chabong-native-photo',{detail:\(json)}));"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(script)
        }
    }
}