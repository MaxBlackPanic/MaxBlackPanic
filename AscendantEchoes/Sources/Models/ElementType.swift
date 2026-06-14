import SwiftUI

/// The six resonant elements that flow through the Tower of Ascension.
///
/// Each element carries its own colour identity, symbol and a colour-blind
/// friendly glyph so the board is readable without relying on hue alone.
/// New elements (e.g. a seventh "Aether" type for late floors) can be added
/// here and everything downstream — board fill, matching, scoring, particles —
/// will pick them up automatically.
enum ElementType: Int, CaseIterable, Codable, Identifiable, Hashable {
    case flame
    case storm
    case verdant
    case crystal
    case shadow
    case radiant

    var id: Int { rawValue }

    /// Human readable name used in narrative snippets and accessibility labels.
    var displayName: String {
        switch self {
        case .flame:   return "Flame"
        case .storm:   return "Storm"
        case .verdant: return "Verdant"
        case .crystal: return "Crystal"
        case .shadow:  return "Shadow"
        case .radiant: return "Radiant"
        }
    }

    /// Core fill colour for the orb.
    var coreColor: Color {
        switch self {
        case .flame:   return Color(red: 1.00, green: 0.36, blue: 0.18)
        case .storm:   return Color(red: 0.42, green: 0.45, blue: 0.98)
        case .verdant: return Color(red: 0.28, green: 0.85, blue: 0.46)
        case .crystal: return Color(red: 0.70, green: 0.96, blue: 1.00)
        case .shadow:  return Color(red: 0.48, green: 0.26, blue: 0.66)
        case .radiant: return Color(red: 1.00, green: 0.84, blue: 0.28)
        }
    }

    /// Brighter rim/glow colour used for the outer halo and particle bursts.
    var glowColor: Color {
        switch self {
        case .flame:   return Color(red: 1.00, green: 0.70, blue: 0.30)
        case .storm:   return Color(red: 0.65, green: 0.78, blue: 1.00)
        case .verdant: return Color(red: 0.60, green: 1.00, blue: 0.70)
        case .crystal: return Color(red: 0.90, green: 1.00, blue: 1.00)
        case .shadow:  return Color(red: 0.78, green: 0.55, blue: 1.00)
        case .radiant: return Color(red: 1.00, green: 0.96, blue: 0.60)
        }
    }

    /// SF Symbol used as a placeholder glyph (also doubles as the colour-blind
    /// shape cue). Swap these for bespoke art in `Assets.xcassets` later.
    var symbolName: String {
        switch self {
        case .flame:   return "flame.fill"
        case .storm:   return "bolt.fill"
        case .verdant: return "leaf.fill"
        case .crystal: return "diamond.fill"
        case .shadow:  return "moon.fill"
        case .radiant: return "sun.max.fill"
        }
    }

    /// A small per-element score nudge so different boards feel distinct.
    var scoreBonus: Int {
        switch self {
        case .radiant: return 4
        case .shadow:  return 3
        default:       return 0
        }
    }

    /// Returns a random element, optionally restricted to a subset (used by the
    /// level generator to introduce elements gradually on early floors).
    static func random(in pool: [ElementType] = ElementType.allCases) -> ElementType {
        pool.randomElement() ?? .flame
    }
}
