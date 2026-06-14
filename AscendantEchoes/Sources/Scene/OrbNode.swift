import SpriteKit
import UIKit

/// The visual representation of a single tile. Built from simple shapes plus an
/// SF Symbol glyph rendered to a texture, so it needs zero bundled art while
/// still looking vibrant. Restyle in place when a tile becomes special.
final class OrbNode: SKNode {
    let tileID: UUID
    private(set) var element: ElementType
    private(set) var special: SpecialKind

    private let glow: SKShapeNode
    private let body: SKShapeNode
    private let glyph: SKSpriteNode
    private var badge: SKSpriteNode?

    private let radius: CGFloat

    init(tile: Tile, radius: CGFloat) {
        self.tileID = tile.id
        self.element = tile.element
        self.special = tile.special
        self.radius = radius

        glow = SKShapeNode(circleOfRadius: radius * 1.18)
        body = SKShapeNode(circleOfRadius: radius)
        glyph = SKSpriteNode(texture: OrbNode.glyphTexture(for: tile.element))

        super.init()

        glow.strokeColor = .clear
        glow.fillColor = Theme.glowColor(tile.element).withAlphaComponent(0.35)
        glow.blendMode = .add
        glow.zPosition = -1
        addChild(glow)

        body.fillColor = Theme.coreColor(tile.element)
        body.strokeColor = Theme.glowColor(tile.element)
        body.lineWidth = max(1.5, radius * 0.08)
        addChild(body)

        glyph.size = CGSize(width: radius * 1.05, height: radius * 1.05)
        glyph.alpha = 0.95
        addChild(glyph)

        applySpecialBadge()
        startIdleShimmer()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    // MARK: - Restyle

    /// Updates the orb to a new element / special (used when an anchor becomes
    /// a special orb mid-cascade) with a quick pop so the change reads.
    func restyle(to tile: Tile) {
        element = tile.element
        special = tile.special
        body.fillColor = Theme.coreColor(tile.element)
        body.strokeColor = Theme.glowColor(tile.element)
        glow.fillColor = Theme.glowColor(tile.element).withAlphaComponent(0.35)
        glyph.texture = OrbNode.glyphTexture(for: tile.element)
        applySpecialBadge()
        run(.sequence([.scale(to: 1.25, duration: 0.08), .scale(to: 1.0, duration: 0.1)]))
    }

    private func applySpecialBadge() {
        badge?.removeFromParent()
        badge = nil
        guard special.isSpecial else {
            glow.run(.fadeAlpha(to: 1, duration: 0.1))
            return
        }
        let badgeNode = SKSpriteNode(texture: OrbNode.badgeTexture(for: special))
        badgeNode.size = CGSize(width: radius * 1.4, height: radius * 1.4)
        badgeNode.blendMode = .add
        badgeNode.alpha = 0.9
        addChild(badgeNode)
        badge = badgeNode
        // Specials pulse to draw the eye toward strategic detonations.
        badgeNode.run(.repeatForever(.sequence([
            .scale(to: 1.12, duration: 0.5),
            .scale(to: 1.0, duration: 0.5)
        ])))
    }

    private func startIdleShimmer() {
        glow.run(.repeatForever(.sequence([
            .fadeAlpha(to: 0.55, duration: Double.random(in: 1.0...1.6)),
            .fadeAlpha(to: 0.30, duration: Double.random(in: 1.0...1.6))
        ])))
    }

    // MARK: - Texture caches

    private static var glyphCache: [Int: SKTexture] = [:]
    private static var badgeCache: [String: SKTexture] = [:]

    private static func glyphTexture(for element: ElementType) -> SKTexture {
        if let cached = glyphCache[element.rawValue] { return cached }
        let config = UIImage.SymbolConfiguration(pointSize: 64, weight: .bold)
        let image = UIImage(systemName: element.symbolName, withConfiguration: config)?
            .withTintColor(.white, renderingMode: .alwaysOriginal) ?? UIImage()
        let texture = SKTexture(image: image)
        glyphCache[element.rawValue] = texture
        return texture
    }

    private static func badgeTexture(for special: SpecialKind) -> SKTexture {
        let symbol: String
        switch special {
        case .surgeRow:    symbol = "arrow.left.and.right"
        case .surgeColumn: symbol = "arrow.up.and.down"
        case .echoBomb:    symbol = "burst.fill"
        case .cataclysm:   symbol = "sparkles"
        case .none:        symbol = "circle"
        }
        if let cached = badgeCache[symbol] { return cached }
        let config = UIImage.SymbolConfiguration(pointSize: 48, weight: .heavy)
        let image = UIImage(systemName: symbol, withConfiguration: config)?
            .withTintColor(.white, renderingMode: .alwaysOriginal) ?? UIImage()
        let texture = SKTexture(image: image)
        badgeCache[symbol] = texture
        return texture
    }
}
