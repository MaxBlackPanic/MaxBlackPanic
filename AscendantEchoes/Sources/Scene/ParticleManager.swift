import SpriteKit
import UIKit

/// Builds particle effects entirely in code (no `.sks` files required), so the
/// visual juice ships with the source. All emitters are one-shot bursts that
/// remove themselves once spent, keeping the node graph clean at 60 FPS.
enum ParticleManager {

    /// A soft circular spark texture generated once and reused by every emitter.
    static let sparkTexture: SKTexture = {
        let size = CGSize(width: 16, height: 16)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: size)
            let colors = [UIColor.white.cgColor, UIColor.white.withAlphaComponent(0).cgColor]
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                      colors: colors as CFArray, locations: [0, 1])!
            ctx.cgContext.drawRadialGradient(gradient,
                                             startCenter: CGPoint(x: 8, y: 8), startRadius: 0,
                                             endCenter: CGPoint(x: 8, y: 8), endRadius: 8,
                                             options: [])
        }
        return SKTexture(image: image)
    }()

    /// Burst played when an orb is matched/cleared.
    static func matchBurst(color: SKColor, at position: CGPoint) -> SKEmitterNode {
        let emitter = baseEmitter(color: color)
        emitter.position = position
        emitter.numParticlesToEmit = 14
        emitter.particleBirthRate = 1400
        emitter.particleLifetime = 0.5
        emitter.particleSpeed = 130
        emitter.particleSpeedRange = 70
        emitter.particleScale = 0.45
        emitter.particleScaleRange = 0.2
        autoRemove(emitter, after: 0.7)
        return emitter
    }

    /// Bigger, brighter explosion for special detonations and resonance.
    static func resonanceBurst(color: SKColor, at position: CGPoint) -> SKEmitterNode {
        let emitter = baseEmitter(color: color)
        emitter.position = position
        emitter.numParticlesToEmit = 60
        emitter.particleBirthRate = 6000
        emitter.particleLifetime = 0.8
        emitter.particleSpeed = 320
        emitter.particleSpeedRange = 180
        emitter.particleScale = 0.7
        emitter.particleScaleRange = 0.4
        emitter.particleColorBlendFactor = 1
        autoRemove(emitter, after: 1.1)
        return emitter
    }

    /// A lingering trail used by flying essence motes (toward the HUD).
    static func essenceTrail(color: SKColor) -> SKEmitterNode {
        let emitter = baseEmitter(color: color)
        emitter.particleBirthRate = 90
        emitter.particleLifetime = 0.35
        emitter.particleSpeed = 10
        emitter.particleScale = 0.3
        emitter.particleAlpha = 0.9
        return emitter
    }

    // MARK: - Helpers

    private static func baseEmitter(color: SKColor) -> SKEmitterNode {
        let emitter = SKEmitterNode()
        emitter.particleTexture = sparkTexture
        emitter.particleColor = color
        emitter.particleColorBlendFactor = 1
        emitter.particleBlendMode = .add
        emitter.emissionAngleRange = .pi * 2
        emitter.particleAlphaSpeed = -1.6
        emitter.particleScaleSpeed = -0.6
        return emitter
    }

    private static func autoRemove(_ node: SKEmitterNode, after seconds: TimeInterval) {
        node.run(.sequence([.wait(forDuration: seconds), .removeFromParent()]))
    }
}
