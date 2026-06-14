import SwiftUI
import SpriteKit

/// Shared visual constants and small conversion helpers bridging SwiftUI colours
/// into SpriteKit, plus the accessibility (colour-blind) toggle that the board
/// renderer consults when drawing element glyphs.
enum Theme {
    /// When true, orbs render with bold, distinct glyph shapes and brighter rims
    /// so they're distinguishable without relying on hue.
    static var colorBlindMode = false

    /// Animation timings tuned for snappy-but-readable juice.
    enum Timing {
        static let swap = 0.16
        static let clear = 0.22
        static let collapse = 0.26
        static let spawn = 0.3
    }

    static func sk(_ color: Color) -> SKColor { SKColor(color) }

    static func coreColor(_ element: ElementType) -> SKColor { sk(element.coreColor) }
    static func glowColor(_ element: ElementType) -> SKColor { sk(element.glowColor) }
}

extension Color {
    /// Initialise from a `#RRGGBB` hex string (used for the player accent).
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        let r = Double((value & 0xFF0000) >> 16) / 255
        let g = Double((value & 0x00FF00) >> 8) / 255
        let b = Double(value & 0x0000FF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
