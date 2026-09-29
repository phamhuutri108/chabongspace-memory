import AVFoundation
import UIKit

final class CameraViewController: UIViewController {
    var onCapture: ((Data, String) -> Void)?
    var onReady: (() -> Void)?

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer!
    private let sessionQueue = DispatchQueue(label: "com.chabongspace.camera.session")
    private var currentDevice: AVCaptureDevice?
    private var currentInput: AVCaptureDeviceInput?
    private var configured = false
    private var frontCamera = false
    private var flashMode: AVCaptureDevice.FlashMode = .auto
    private var zoomFactor: CGFloat = 1

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        if let connection = previewLayer?.connection, connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
    }

    func startCamera() {
        if configured {
            sessionQueue.async { [weak self] in
                guard let self, !self.session.isRunning else { return }
                self.session.startRunning()
                DispatchQueue.main.async { self.onReady?() }
            }
            return
        }
        configureSession()
    }

    func stopCamera() {
        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }

    func capturePhoto() {
        sessionQueue.async { [weak self] in
            guard let self, self.configured else { return }
            let settings = AVCapturePhotoSettings()
            settings.photoQualityPrioritization = .quality
            if !self.frontCamera && self.photoOutput.supportedFlashModes.contains(self.flashMode) {
                settings.flashMode = self.flashMode
            }
            if let connection = self.photoOutput.connection(with: .video), connection.isVideoOrientationSupported {
                connection.videoOrientation = .portrait
            }
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    func setZoom(_ requested: CGFloat) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if requested < 1, !self.frontCamera,
               let ultraWide = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back),
               let ultraInput = try? AVCaptureDeviceInput(device: ultraWide) {
                self.session.beginConfiguration()
                if let oldInput = self.currentInput { self.session.removeInput(oldInput) }
                if self.session.canAddInput(ultraInput) {
                    self.session.addInput(ultraInput)
                    self.currentInput = ultraInput
                    self.currentDevice = ultraWide
                }
                self.session.commitConfiguration()
            } else if requested >= 1, !self.frontCamera,
                      self.currentDevice?.deviceType == .builtInUltraWideCamera,
                      let wide = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                      let wideInput = try? AVCaptureDeviceInput(device: wide) {
                self.session.beginConfiguration()
                if let oldInput = self.currentInput { self.session.removeInput(oldInput) }
                if self.session.canAddInput(wideInput) {
                    self.session.addInput(wideInput)
                    self.currentInput = wideInput
                    self.currentDevice = wide
                }
                self.session.commitConfiguration()
            }
            guard let activeDevice = self.currentDevice else { return }
            let maxZoom = min(activeDevice.activeFormat.videoMaxZoomFactor, 8)
            let value = min(max(requested, 1), maxZoom)
            do {
                try activeDevice.lockForConfiguration()
                activeDevice.videoZoomFactor = value
                activeDevice.unlockForConfiguration()
                self.zoomFactor = value
            } catch { }
        }
    }

    func toggleFlash() -> String {
        switch flashMode {
        case .auto: flashMode = .on
        case .on: flashMode = .off
        default: flashMode = .auto
        }
        return flashMode == .auto ? "auto" : flashMode == .on ? "on" : "off"
    }

    func switchCamera() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            let position: AVCaptureDevice.Position = self.frontCamera ? .back : .front
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
                  let input = try? AVCaptureDeviceInput(device: device) else { return }

            self.session.beginConfiguration()
            let oldInput = self.currentInput
            if let oldInput { self.session.removeInput(oldInput) }
            guard self.session.canAddInput(input) else {
                if let oldInput { self.session.addInput(oldInput) }
                self.session.commitConfiguration()
                return
            }
            self.session.addInput(input)
            self.currentInput = input
            self.currentDevice = device
            self.frontCamera.toggle()
            self.zoomFactor = 1
            self.session.commitConfiguration()
            DispatchQueue.main.async { self.onReady?() }
        }
    }

    func focus(at normalizedPoint: CGPoint) {
        sessionQueue.async { [weak self] in
            guard let self, let device = self.currentDevice else { return }
            do {
                try device.lockForConfiguration()
                if device.isFocusPointOfInterestSupported {
                    device.focusPointOfInterest = normalizedPoint
                    device.focusMode = .autoFocus
                }
                if device.isExposurePointOfInterestSupported {
                    device.exposurePointOfInterest = normalizedPoint
                    device.exposureMode = .continuousAutoExposure
                }
                device.unlockForConfiguration()
            } catch { }
        }
    }

    private func configureSession() {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                guard granted else { return }
                self?.configureSession()
            }
            return
        }

        sessionQueue.async { [weak self] in
            guard let self, !self.configured else { return }
            self.session.beginConfiguration()
            self.session.sessionPreset = .photo

            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                  let input = try? AVCaptureDeviceInput(device: device),
                  self.session.canAddInput(input) else {
                self.session.commitConfiguration()
                return
            }
            self.session.addInput(input)
            self.currentInput = input
            self.currentDevice = device

            guard self.session.canAddOutput(self.photoOutput) else {
                self.session.commitConfiguration()
                return
            }
            self.session.addOutput(self.photoOutput)
            self.photoOutput.maxPhotoQualityPrioritization = .quality
            self.session.commitConfiguration()
            self.configured = true

            DispatchQueue.main.async { [weak self] in self?.onReady?() }
        }
    }
}

extension CameraViewController: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else { return }
        let filename = "memory-\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
        DispatchQueue.main.async { [weak self] in
            self?.stopCamera()
            self?.onCapture?(data, filename)
        }
    }
}