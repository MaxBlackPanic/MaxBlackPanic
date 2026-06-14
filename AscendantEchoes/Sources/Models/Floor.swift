import SwiftUI

/// The win condition for a floor of the Tower.
enum FloorObjective: Codable, Equatable {
    /// Reach a target score within the move budget.
    case reachScore(target: Int)
    /// Clear a number of tiles of a given element.
    case collect(element: ElementType, count: Int)
    /// Survive / keep scoring across a fixed number of moves (endurance).
    case survive(moves: Int, minScore: Int)

    var summary: String {
        switch self {
        case .reachScore(let target):
            return "Score \(target.formatted())"
        case .collect(let element, let count):
            return "Collect \(count) \(element.displayName)"
        case .survive(let moves, let minScore):
            return "Score \(minScore.formatted()) in \(moves) moves"
        }
    }
}

/// The visual / atmospheric biome a floor belongs to. Drives the parallax
/// background and the colour grading of the scene.
enum Biome: Int, CaseIterable, Codable {
    case etherealClouds
    case ancientRuins
    case cosmicVoid
    case lushRealm

    var displayName: String {
        switch self {
        case .etherealClouds: return "Ethereal Reaches"
        case .ancientRuins:   return "Sunken Ruins"
        case .cosmicVoid:     return "The Cosmic Void"
        case .lushRealm:      return "Verdant Sanctum"
        }
    }

    /// Two-stop gradient for the parallax backdrop.
    var skyColors: [Color] {
        switch self {
        case .etherealClouds:
            return [Color(red: 0.20, green: 0.28, blue: 0.55), Color(red: 0.55, green: 0.42, blue: 0.78)]
        case .ancientRuins:
            return [Color(red: 0.10, green: 0.16, blue: 0.22), Color(red: 0.28, green: 0.40, blue: 0.42)]
        case .cosmicVoid:
            return [Color(red: 0.03, green: 0.02, blue: 0.10), Color(red: 0.18, green: 0.06, blue: 0.30)]
        case .lushRealm:
            return [Color(red: 0.06, green: 0.20, blue: 0.16), Color(red: 0.16, green: 0.42, blue: 0.30)]
        }
    }
}

/// A single, fully-described floor of the Tower of Ascension.
struct Floor: Identifiable, Codable {
    let id: Int            // floor number, 1-based
    let columns: Int
    let rows: Int
    let moveBudget: Int
    let objective: FloorObjective
    let elementPool: [ElementType]
    let biome: Biome
    /// One-line atmospheric vision shown on the floor intro card.
    let vision: String

    var displayNumber: Int { id }
}
