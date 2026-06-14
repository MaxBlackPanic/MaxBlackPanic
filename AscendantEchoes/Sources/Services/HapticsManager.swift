import UIKit
import CoreHaptics

/// Centralised Taptic Engine feedback. Uses Core Haptics for rich combo bursts
/// where available and falls back to `UIFeedbackGenerator` everywhere else, so
/// it behaves gracefully on every iPhone and respects the user's settings.
final class HapticsManager {
    static let shared = HapticsManager()

    /// User toggle (wired to Settings). When false, all feedback is suppressed.
    var isEnabled = true

    private var engine: CHHapticEngine?
    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let impactHeavy = UIImpactFeedbackGenerator(style: .heavy)
    private let notification = UINotificationFeedbackGenerator()

    private init() {
        prepareEngine()
    }

    private func prepareEngine() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        engine = try? CHHapticEngine()
        engine?.isAutoShutdownEnabled = true
        engine?.resetHandler = { [weak self] in try? self?.engine?.start() }
        try? engine?.start()
    }

    // MARK: - Simple cues

    func match() { guard isEnabled else { return }; impactLight.impactOccurred() }
    func swap()  { guard isEnabled else { return }; impactLight.impactOccurred(intensity: 0.6) }
    func invalid() { guard isEnabled else { return }; notification.notificationOccurred(.warning) }
    func floorCleared() { guard isEnabled else { return }; notification.notificationOccurred(.success) }

    /// Feedback whose punch scales with the combo depth.
    func combo(step: Int) {
        guard isEnabled else { return }
        switch step {
        case ..<2: impactLight.impactOccurred()
        case 2..<4: impactMedium.impactOccurred()
        default:   impactHeavy.impactOccurred()
        }
    }

    // MARK: - Rich burst for big moments (Echo Resonance / Cataclysm)

    func resonanceBurst() {
        guard isEnabled else { return }
        guard let engine else { impactHeavy.impactOccurred(); return }
        var events: [CHHapticEvent] = []
        for i in 0..<5 {
            let t = Double(i) * 0.06
            let intensity = CHHapticEventParameter(parameterID: .hapticIntensity,
                                                   value: Float(0.6 + Double(i) * 0.1))
            let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.7)
            events.append(CHHapticEvent(eventType: .hapticTransient,
                                        parameters: [intensity, sharpness],
                                        relativeTime: t))
        }
        if let pattern = try? CHHapticPattern(events: events, parameters: []),
           let player = try? engine.makePlayer(with: pattern) {
            try? player.start(atTime: 0)
        }
    }
}
