import AVFoundation
import UIKit

final class CameraViewController: UIViewController {
    var onCapture: ((Data, String) -> Void)?
    var onCancel: (() -> Void)?

    private let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer!
    private var currentDevice: AVCaptureDevice?
    private var currentInput: AVCaptureDeviceInput?
    private var isConfigured = false
    private var isUsingFrontCamera = false
    private var flashMode: AVCaptureDevice.FlashMode = .auto
    private var selectedZoom: CGFloat = 1
    private var pinchStartZoom: CGFloat = 1
    private var capturedData: Data?
    private var capturedFilename: String?

    private let controls = UIView()
    private let topBar = UIView()
    private let zoomStack = UIStackView()
    private let gridView = GridOverlayView()
    private let focusRing = FocusRingView()
    private let shutterButton = CameraShutterButton()
    private let flashButton = CameraIconButton(systemName: "bolt.slash")
    private let gridButton = CameraIconButton(systemName: "grid")
    private let switchButton = CameraIconButton(systemName: "arrow.triangle.2.circlepath.camera")
    private let closeButton = CameraIconButton(systemName: "xmark")
    private let reviewView = UIView()
    private let reviewImageView = UIImageView()
    private let retakeButton = UIButton(type: .system)
    private let useButton = UIButton(type: .system)

    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureInterface()
        configureSession()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if isConfigured { startSession() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        gridView.frame = view.bounds
    }

    private func configureInterface() {
        previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)

        gridView.isHidden = true
        view.addSubview(gridView)
        view.addSubview(topBar)
        view.addSubview(controls)
        view.addSubview(focusRing)

        topBar.translatesAutoresizingMaskIntoConstraints = false
        controls.translatesAutoresizingMaskIntoConstraints = false
        focusRing.translatesAutoresizingMaskIntoConstraints = false

        closeButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        flashButton.addTarget(self, action: #selector(toggleFlash), for: .touchUpInside)
        gridButton.addTarget(self, action: #selector(toggleGrid), for: .touchUpInside)
        switchButton.addTarget(self, action: #selector(switchCamera), for: .touchUpInside)
        shutterButton.addTarget(self, action: #selector(takePhoto), for: .touchUpInside)

        [closeButton, flashButton, gridButton, switchButton].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
        }

        topBar.addSubview(closeButton)
        topBar.addSubview(flashButton)
        topBar.addSubview(gridButton)
        topBar.addSubview(switchButton)

        let topBackground = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
        topBackground.translatesAutoresizingMaskIntoConstraints = false
        topBackground.alpha = 0.72
        topBar.insertSubview(topBackground, at: 0)

        NSLayoutConstraint.activate([
            topBar.topAnchor.constraint(equalTo: view.topAnchor),
            topBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            topBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            topBar.heightAnchor.constraint(equalToConstant: 92),
            topBackground.leadingAnchor.constraint(equalTo: topBar.leadingAnchor),
            topBackground.trailingAnchor.constraint(equalTo: topBar.trailingAnchor),
            topBackground.topAnchor.constraint(equalTo: topBar.topAnchor),
            topBackground.bottomAnchor.constraint(equalTo: topBar.bottomAnchor),
            closeButton.leadingAnchor.constraint(equalTo: topBar.leadingAnchor, constant: 18),
            closeButton.bottomAnchor.constraint(equalTo: topBar.bottomAnchor, constant: -10),
            closeButton.widthAnchor.constraint(equalToConstant: 42),
            closeButton.heightAnchor.constraint(equalToConstant: 42),
            flashButton.leadingAnchor.constraint(equalTo: closeButton.trailingAnchor, constant: 12),
            flashButton.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            flashButton.widthAnchor.constraint(equalToConstant: 42),
            flashButton.heightAnchor.constraint(equalToConstant: 42),
            gridButton.leadingAnchor.constraint(equalTo: flashButton.trailingAnchor, constant: 8),
            gridButton.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            gridButton.widthAnchor.constraint(equalToConstant: 42),
            gridButton.heightAnchor.constraint(equalToConstant: 42),
            switchButton.trailingAnchor.constraint(equalTo: topBar.trailingAnchor, constant: -18),
            switchButton.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            switchButton.widthAnchor.constraint(equalToConstant: 42),
            switchButton.heightAnchor.constraint(equalToConstant: 42)
        ])

        let bottomBackground = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
        bottomBackground.translatesAutoresizingMaskIntoConstraints = false
        bottomBackground.alpha = 0.76
        controls.insertSubview(bottomBackground, at: 0)

        let controlsStack = UIStackView()
        controlsStack.axis = .vertical
        controlsStack.spacing = 16
        controlsStack.alignment = .center
        controlsStack.translatesAutoresizingMaskIntoConstraints = false
        controls.addSubview(controlsStack)

        zoomStack.axis = .horizontal
        zoomStack.spacing = 8
        zoomStack.alignment = .center
        zoomStack.translatesAutoresizingMaskIntoConstraints = false
        [0.5, 1, 2].forEach { addZoomButton($0) }
        controlsStack.addArrangedSubview(zoomStack)
        controlsStack.addArrangedSubview(shutterButton)

        NSLayoutConstraint.activate([
            controls.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            controls.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            controls.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            controls.heightAnchor.constraint(equalToConstant: 176),
            bottomBackground.leadingAnchor.constraint(equalTo: controls.leadingAnchor),
            bottomBackground.trailingAnchor.constraint(equalTo: controls.trailingAnchor),
            bottomBackground.topAnchor.constraint(equalTo: controls.topAnchor),
            bottomBackground.bottomAnchor.constraint(equalTo: controls.bottomAnchor),
            controlsStack.centerXAnchor.constraint(equalTo: controls.centerXAnchor),
            controlsStack.topAnchor.constraint(equalTo: controls.topAnchor, constant: 15),
            shutterButton.widthAnchor.constraint(equalToConstant: 76),
            shutterButton.heightAnchor.constraint(equalToConstant: 76)
        ])

        let tap = UITapGestureRecognizer(target: self, action: #selector(focusTap(_:)))
        view.addGestureRecognizer(tap)
        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        view.addGestureRecognizer(pinch)

        configureReviewInterface()
    }

    private func addZoomButton(_ value: CGFloat) {
        let button = UIButton(type: .system)
        button.tag = Int(value * 10)
        button.setTitle(value == 1 ? "1×" : "\(value)×", for: .normal)
        button.setTitleColor(.white, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 12, weight: .semibold)
        button.backgroundColor = UIColor.black.withAlphaComponent(0.42)
        button.layer.cornerRadius = 17
        button.widthAnchor.constraint(equalToConstant: 38).isActive = true
        button.heightAnchor.constraint(equalToConstant: 34).isActive = true
        button.addTarget(self, action: #selector(selectZoom(_:)), for: .touchUpInside)
        zoomStack.addArrangedSubview(button)
    }

    private func configureReviewInterface() {
        reviewView.translatesAutoresizingMaskIntoConstraints = false
        reviewView.backgroundColor = .black
        reviewView.isHidden = true
        view.addSubview(reviewView)

        reviewImageView.translatesAutoresizingMaskIntoConstraints = false
        reviewImageView.contentMode = .scaleAspectFit
        reviewView.addSubview(reviewImageView)

        retakeButton.translatesAutoresizingMaskIntoConstraints = false
        retakeButton.setTitle("Retake", for: .normal)
        retakeButton.setTitleColor(.white, for: .normal)
        retakeButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .medium)
        retakeButton.addTarget(self, action: #selector(retake), for: .touchUpInside)

        useButton.translatesAutoresizingMaskIntoConstraints = false
        useButton.setTitle("Use Photo", for: .normal)
        useButton.setTitleColor(.black, for: .normal)
        useButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        useButton.backgroundColor = .white
        useButton.layer.cornerRadius = 22
        useButton.contentEdgeInsets = UIEdgeInsets(top: 11, left: 22, bottom: 11, right: 22)
        useButton.addTarget(self, action: #selector(usePhoto), for: .touchUpInside)

        reviewView.addSubview(retakeButton)
        reviewView.addSubview(useButton)

        NSLayoutConstraint.activate([
            reviewView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            reviewView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            reviewView.topAnchor.constraint(equalTo: view.topAnchor),
            reviewView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            reviewImageView.leadingAnchor.constraint(equalTo: reviewView.leadingAnchor),
            reviewImageView.trailingAnchor.constraint(equalTo: reviewView.trailingAnchor),
            reviewImageView.topAnchor.constraint(equalTo: reviewView.topAnchor),
            reviewImageView.bottomAnchor.constraint(equalTo: reviewView.bottomAnchor),
            retakeButton.leadingAnchor.constraint(equalTo: reviewView.leadingAnchor, constant: 26),
            retakeButton.bottomAnchor.constraint(equalTo: reviewView.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            useButton.trailingAnchor.constraint(equalTo: reviewView.trailingAnchor, constant: -26),
            useButton.bottomAnchor.constraint(equalTo: reviewView.safeAreaLayoutGuide.bottomAnchor, constant: -18)
        ])
    }

    private func configureSession() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureAuthorizedSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    granted ? self?.configureAuthorizedSession() : self?.showPermissionError()
                }
            }
        default:
            showPermissionError()
        }
    }

    private func configureAuthorizedSession() {
        session.beginConfiguration()
        session.sessionPreset = .photo
        defer { session.commitConfiguration() }

        guard addCameraInput(position: .back) else {
            showCameraError()
            return
        }

        guard session.canAddOutput(output) else {
            showCameraError()
            return
        }
        session.addOutput(output)
        output.maxPhotoQualityPrioritization = .quality
        if let connection = output.connection(with: .video), connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
        isConfigured = true
    }

    @discardableResult
    private func addCameraInput(position: AVCaptureDevice.Position) -> Bool {
        let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
        guard let device, let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else { return false }
        session.addInput(input)
        currentDevice = device
        currentInput = input
        return true
    }

    private func startSession() {
        guard !session.isRunning else { return }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.startRunning()
        }
    }

    private func stopSession() {
        guard session.isRunning else { return }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.stopRunning()
        }
    }

    @objc private func takePhoto() {
        guard isConfigured, !reviewView.isHidden else { return }
        let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
        settings.photoQualityPrioritization = .quality
        if output.supportedFlashModes.contains(flashMode), !isUsingFrontCamera {
            settings.flashMode = flashMode
        }
        if let connection = output.connection(with: .video), connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        shutterButton.animatePress()
        output.capturePhoto(with: settings, delegate: self)
    }

    @objc private func toggleFlash() {
        let next: AVCaptureDevice.FlashMode
        switch flashMode {
        case .auto: next = .on
        case .on: next = .off
        default: next = .auto
        }
        flashMode = next
        flashButton.setSymbol(next == .auto ? "bolt.badge.a" : next == .on ? "bolt.fill" : "bolt.slash")
    }

    @objc private func toggleGrid() {
        gridView.isHidden.toggle()
        gridButton.alpha = gridView.isHidden ? 1 : 0.65
    }

    @objc private func switchCamera() {
        guard isConfigured, let oldInput = currentInput else { return }
        let position: AVCaptureDevice.Position = isUsingFrontCamera ? .back : .front
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let newInput = try? AVCaptureDeviceInput(device: device) else { return }

        session.beginConfiguration()
        session.removeInput(oldInput)
        if session.canAddInput(newInput) {
            session.addInput(newInput)
            currentInput = newInput
            currentDevice = device
            isUsingFrontCamera.toggle()
            selectedZoom = 1
            applyZoom(1)
        } else {
            session.addInput(oldInput)
        }
        if let connection = previewLayer.connection, connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
        if let connection = output.connection(with: .video), connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
        session.commitConfiguration()
        flashButton.isHidden = isUsingFrontCamera
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    @objc private func selectZoom(_ sender: UIButton) {
        let value = CGFloat(sender.tag) / 10
        if value == 0.5 && !isUsingFrontCamera {
            switchToLens(.builtInUltraWideCamera, requestedZoom: 1)
        } else if value >= 1 && !isUsingFrontCamera && selectedZoom < 1.0 {
            switchToLens(.builtInWideAngleCamera, requestedZoom: value)
        } else {
            applyZoom(value)
        }
    }

    private func applyZoom(_ value: CGFloat) {
        guard let device = currentDevice else { return }
        let maxZoom = min(device.activeFormat.videoMaxZoomFactor, 6)
        let clamped = min(max(value, 1), maxZoom)
        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = clamped
            device.unlockForConfiguration()
            selectedZoom = clamped
            for case let button as UIButton in zoomStack.arrangedSubviews {
                let buttonValue = CGFloat(button.tag) / 10
                button.backgroundColor = abs(buttonValue - clamped) < 0.01 ? UIColor.white.withAlphaComponent(0.28) : UIColor.black.withAlphaComponent(0.42)
            }
        } catch { }
    }

    @objc private func handlePinch(_ gesture: UIPinchGestureRecognizer) {
        guard currentDevice != nil else { return }
        if gesture.state == .began { pinchStartZoom = selectedZoom }
        if gesture.state == .changed || gesture.state == .ended {
            let requested = pinchStartZoom * gesture.scale
            if requested < 0.95 && !isUsingFrontCamera {
                switchToLens(.builtInUltraWideCamera, requestedZoom: 1)
            } else {
                applyZoom(requested)
            }
        }
    }

    @objc private func focusTap(_ gesture: UITapGestureRecognizer) {
        guard let device = currentDevice, reviewView.isHidden else { return }
        let point = gesture.location(in: view)
        let devicePoint = previewLayer.captureDevicePointConverted(fromLayerPoint: point)
        do {
            try device.lockForConfiguration()
            if device.isFocusPointOfInterestSupported {
                device.focusPointOfInterest = devicePoint
                device.focusMode = .autoFocus
            }
            if device.isExposurePointOfInterestSupported {
                device.exposurePointOfInterest = devicePoint
                device.exposureMode = .continuousAutoExposure
            }
            device.unlockForConfiguration()
        } catch { return }

        focusRing.center = point
        focusRing.isHidden = false
        focusRing.transform = CGAffineTransform(scaleX: 1.35, y: 1.35)
        UIView.animate(withDuration: 0.18, animations: {
            self.focusRing.transform = .identity
        }) { _ in
            UIView.animate(withDuration: 0.25, delay: 0.55, options: []) {
                self.focusRing.alpha = 0
            } completion: { _ in
                self.focusRing.isHidden = true
                self.focusRing.alpha = 1
            }
        }
    }

    private func switchToLens(_ type: AVCaptureDevice.DeviceType, requestedZoom: CGFloat) {
        guard !isUsingFrontCamera else { return }
        guard let oldInput = currentInput,
              let device = AVCaptureDevice.default(type, for: .video, position: .back),
              let newInput = try? AVCaptureDeviceInput(device: device) else {
            if type == .builtInUltraWideCamera { applyZoom(1) }
            return
        }

        session.beginConfiguration()
        session.removeInput(oldInput)
        guard session.canAddInput(newInput) else {
            session.addInput(oldInput)
            session.commitConfiguration()
            return
        }
        session.addInput(newInput)
        currentInput = newInput
        currentDevice = device
        session.commitConfiguration()
        applyZoom(requestedZoom)
    }

    @objc private func retake() {
        capturedData = nil
        capturedFilename = nil
        reviewView.isHidden = true
        startSession()
    }

    @objc private func usePhoto() {
        guard let data = capturedData, let filename = capturedFilename else { return }
        reviewView.isHidden = true
        dismiss(animated: true) { [weak self] in
            self?.onCapture?(data, filename)
        }
    }

    @objc private func cancel() {
        dismiss(animated: true) { [weak self] in self?.onCancel?() }
    }

    private func showReview(data: Data, filename: String) {
        capturedData = data
        capturedFilename = filename
        reviewImageView.image = UIImage(data: data)
        reviewView.isHidden = false
        stopSession()
    }

    private func showPermissionError() {
        let alert = UIAlertController(title: "Camera access needed", message: "Allow camera access in Settings to take a memory.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in self?.dismiss(animated: true) })
        present(alert, animated: true)
    }

    private func showCameraError() {
        let alert = UIAlertController(title: "Camera unavailable", message: "The native camera could not be configured.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in self?.dismiss(animated: true) })
        present(alert, animated: true)
    }
}

extension CameraViewController: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else { return }
        let filename = "memory-\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
        DispatchQueue.main.async { [weak self] in
            self?.showReview(data: data, filename: filename)
        }
    }
}

private final class CameraIconButton: UIButton {
    init(systemName: String) {
        super.init(frame: .zero)
        setImage(UIImage(systemName: systemName), for: .normal)
        tintColor = .white
        backgroundColor = UIColor.black.withAlphaComponent(0.38)
        layer.cornerRadius = 21
        imageView?.contentMode = .scaleAspectFit
        accessibilityTraits = .button
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func setSymbol(_ name: String) {
        setImage(UIImage(systemName: name), for: .normal)
    }
}

private final class CameraShutterButton: UIButton {
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .white
        layer.cornerRadius = 38
        layer.borderWidth = 4
        layer.borderColor = UIColor.white.withAlphaComponent(0.65).cgColor
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.35
        layer.shadowRadius = 8
        layer.shadowOffset = CGSize(width: 0, height: 3)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func animatePress() {
        UIView.animate(withDuration: 0.08, animations: {
            self.transform = CGAffineTransform(scaleX: 0.9, y: 0.9)
        }) { _ in
            UIView.animate(withDuration: 0.12) { self.transform = .identity }
        }
    }
}

private final class GridOverlayView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func draw(_ rect: CGRect) {
        let path = UIBezierPath()
        for fraction in [1.0 / 3.0, 2.0 / 3.0] {
            let x = rect.width * fraction
            path.move(to: CGPoint(x: x, y: 0)); path.addLine(to: CGPoint(x: x, y: rect.height))
            let y = rect.height * fraction
            path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: rect.width, y: y))
        }
        UIColor.white.withAlphaComponent(0.34).setStroke()
        path.lineWidth = 0.7
        path.stroke()
    }
}

private final class FocusRingView: UIView {
    override init(frame: CGRect) {
        super.init(frame: CGRect(x: 0, y: 0, width: 68, height: 68))
        isHidden = true
        backgroundColor = .clear
        layer.borderColor = UIColor.systemYellow.cgColor
        layer.borderWidth = 1.5
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}