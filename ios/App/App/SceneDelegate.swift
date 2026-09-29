import UIKit
import Capacitor
import Vision

// Keep the app-local plugin in this already-linked source file. The generated
// Xcode project uses explicit source references, so a separate Swift file would
// need an additional project-file change.
@objc(DinOcrPlugin)
public final class DinOcrPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DinOcrPlugin"
    public let jsName = "DinOcr"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "processImage", returnType: CAPPluginReturnPromise)
    ]

    @objc public func processImage(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let inputURL = URL(string: path), inputURL.isFileURL,
              let cacheURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            call.reject("Expected a local cache image URI.", "INVALID_IMAGE_PATH")
            return
        }

        let imageURL = inputURL.standardizedFileURL.resolvingSymlinksInPath()
        let cachePath = cacheURL.standardizedFileURL.resolvingSymlinksInPath().path
        guard imageURL.path.hasPrefix(cachePath + "/"),
              FileManager.default.isReadableFile(atPath: imageURL.path) else {
            call.reject("The image must be a readable file in the app cache.", "INVALID_IMAGE_PATH")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            // DINs are numeric identifiers; word-level language correction can
            // turn digits into letters or otherwise change the printed value.
            request.usesLanguageCorrection = false

            do {
                try VNImageRequestHandler(url: imageURL, options: [:]).perform([request])
                let text = (request.results ?? [])
                    .compactMap { $0.topCandidates(1).first?.string }
                    .joined(separator: "\n")
                DispatchQueue.main.async { call.resolve(["text": text]) }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Could not read text from the image.", "OCR_FAILED", error)
                }
            }
        }
    }
}

final class DinOcrBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(DinOcrPlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = DinOcrBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
