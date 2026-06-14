import Foundation

/// A tile sliding from one cell to another (swap or collapse).
struct TileMove: Equatable {
    let id: UUID
    let from: GridPosition
    let to: GridPosition
}

/// A brand new tile dropping in from above to refill the board.
struct TileSpawn: Equatable {
    let tile: Tile
    let position: GridPosition
    /// Virtual row above the board to animate the drop from.
    let dropFrom: Int
}

/// A tile being removed, captured *before* deletion so the renderer still knows
/// its element/special for the correct particle burst.
struct ClearEvent: Equatable {
    let position: GridPosition
    let tile: Tile
}

/// An orb that was upgraded into a special in place. Carries the *stable tile
/// id* so the renderer can restyle exactly the right surviving node.
struct SpecialPlacement: Equatable {
    let tileID: UUID
    let position: GridPosition
    let kind: SpecialKind
    let element: ElementType
}

/// One cascade "wave": everything that happens in a single resolve pass.
/// The renderer animates a wave's phases in order (clears → create → collapse →
/// refill) and then moves to the next wave, producing the satisfying chain feel.
struct CascadeWave {
    var clears: [ClearEvent] = []
    var placements: [SpecialPlacement] = []
    var collapses: [TileMove] = []
    var spawns: [TileSpawn] = []

    var comboStep: Int = 0
    var multiplier: Double = 1
    var scoreDelta: Int = 0
    var essenceDelta: Int = 0
    var topRunLength: Int = 0
    var detonatedSpecials: Bool = false
    var isResonance: Bool = false   // L/T/+ or 5-match → "Echo Resonance"

    /// Per-element clear tally for collection objectives.
    var elementCounts: [ElementType: Int] = [:]
}

/// The full result of attempting a swap, ready for the scene to animate.
struct SwapResolution {
    let isValid: Bool
    let swapA: TileMove
    let swapB: TileMove
    let waves: [CascadeWave]

    var totalScore: Int { waves.reduce(0) { $0 + $1.scoreDelta } }
    var totalEssence: Int { waves.reduce(0) { $0 + $1.essenceDelta } }
    var maxCombo: Int { waves.map(\.comboStep).max() ?? 0 }
    var furyTriggered: Bool { maxCombo >= ComboSystem.furyThreshold }

    var elementCounts: [ElementType: Int] {
        var totals: [ElementType: Int] = [:]
        for wave in waves {
            for (element, count) in wave.elementCounts {
                totals[element, default: 0] += count
            }
        }
        return totals
    }
}
