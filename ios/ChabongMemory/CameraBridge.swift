import Foundation
import WebKit

final class CameraBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private var cameraProvider: (() -> CameraViewController?)?

    func attach(to controller: WKUserContentController, webViewProvider: @escaping () -> WKWebView?, cameraProvider: @escaping () -> CameraViewController?) {
        controller.add(self, name: "chabongCamera")
        self.webViewProvider = webViewProvider
        self.cameraProvider = cameraProvider
    }

    private var webViewProvider: (() -> WKWebView?)?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "chabongCamera" else { return }
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        guard let webView = webViewProvider?(), let camera = cameraProvider?() else { return }
        self.webView = webView
        camera.onCapture = { [weak self] data, filename in self?.deliver(data: data, filename: filename) }

        DispatchQueue.main.async {
            switch action {
            case "start": camera.startCamera()
            case "stop": camera.stopCamera()
            case "capture": camera.capturePhoto()
            case "zoom":
                if let value = body["value"] as? Double { camera.setZoom(CGFloat(value)) }
            case "flash":
                let state = camera.toggleFlash()
                self.send(event: "chabong-native-flash", detail: ["state": state])
            case "switch": camera.switchCamera()
            case "focus":
                if let x = body["x"] as? Double, let y = body["y"] as? Double {
                    camera.focus(at: CGPoint(x: x, y: y))
                }
            default: break
            }
        }
    }

    private func send(event: String, detail: [String: String]) {
        guard let webView,
              let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('" + event + "',{detail:" + json + "}));")
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