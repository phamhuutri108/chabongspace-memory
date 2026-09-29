import AVFoundation
import UIKit

final class CameraViewController: UIViewController {
    var onCapture: ((Data, String) -> Void)?
    var onCancel: (() -> Void)?

    private let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer!
    private var isConfigured = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureSession()
        configureControls()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if isConfigured { session.startRunning() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        session.stopRunning()
    }

    private func configureSession() {
        guard AVCaptureDevice.authorizationStatus(for: .video) != .denied else {
            showPermissionError()
            return
        }

        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            DispatchQueue.main.async {
                guard granted else { self?.showPermissionError(); return }
                self?.configureAuthorizedSession()
            }
        }
    }

    private func configureAuthorizedSession() {
        session.beginConfiguration()
        session.sessionPreset = .photo

        defer { session.commitConfiguration() }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input),
              session.canAddOutput(output) else {
            showCameraError()
            return
        }

        session.addInput(input)
        session.addOutput(output)
        output.maxPhotoQualityPrioritization = .quality

        previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.frame = view.bounds
        view.layer.insertSublayer(previewLayer, at: 0)
        isConfigured = true
        session.startRunning()
    }

    private func configureControls() {
        let capture = UIButton(type: .system)
        capture.translatesAutoresizingMaskIntoConstraints = false
        capture.tintColor = .white
        capture.backgroundColor = .white
        capture.layer.cornerRadius = 34
        capture.layer.borderWidth = 5
        capture.layer.borderColor = UIColor(white: 1, alpha: 0.45).cgColor
        capture.addTarget(self, action: #selector(takePhoto), for: .touchUpInside)

        let close = UIButton(type: .system)
        close.translatesAutoresizingMaskIntoConstraints = false
        close.setTitle("Close", for: .normal)
        close.setTitleColor(.white, for: .normal)
        close.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        close.layer.cornerRadius = 18
        close.contentEdgeInsets = UIEdgeInsets(top: 8, left: 14, bottom: 8, right: 14)
        close.addTarget(self, action: #selector(cancel), for: .touchUpInside)

        view.addSubview(capture)
        view.addSubview(close)
        NSLayoutConstraint.activate([
            capture.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            capture.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -28),
            capture.widthAnchor.constraint(equalToConstant: 68),
            capture.heightAnchor.constraint(equalToConstant: 68),
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            close.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16)
        ])
    }

    @objc private func takePhoto() {
        let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
        settings.photoQualityPrioritization = .quality
        output.capturePhoto(with: settings, delegate: self)
    }

    @objc private func cancel() {
        dismiss(animated: true) { [weak self] in self?.onCancel?() }
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
        dismiss(animated: true) { [weak self] in
            self?.onCapture?(data, filename)
        }
    }
}