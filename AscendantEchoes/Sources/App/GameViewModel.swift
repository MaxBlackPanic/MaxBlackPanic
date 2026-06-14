import SwiftUI
import SpriteKit
import UIKit

/// Drives a single floor: creates the engine + scene, observes board events via
/// `GameSceneDelegate`, and republishes them for the SwiftUI HUD. Also brokers
/// the player's unlocked abilities into the scene.
///
/// Not annotated `@MainActor` so it can satisfy `GameSceneDelegate` callbacks
/// invoked from `SKScene` (which the SDK does not mark main-actor isolated);
/// in practice every call happens on the main thread.
final class GameViewModel: ObservableObject, GameSceneDelegate {
    let floor: Floor
    let engine: GameEngine
    let scene: GameScene

    @Published var score = 0
    @Published var movesRemaining: Int
    @Published var progress: Double = 0
    @Published var comboStep = 0
    @Published var multiplier: Double = 1
    @Published var showCombo = false
    @Published var resonanceFlash = false
    @Published var outcome: GameEngine.Outcome = .inProgress

    @Published var reshapeAvailable: Bool
    @Published var echoBlastAvailable: Bool

    /// Invoked once the floor reaches a terminal outcome.
    var onFinish: ((GameEngine.Outcome, Int, Int) -> Void)?

    private var comboHideWork: DispatchWorkItem?

    init(floor: Floor, progress playerProgress: PlayerProgress,
         sceneSize: CGSize = UIScreen.main.bounds.size) {
        self.floor = floor
        let extraMoves = playerProgress.unlockedAbilities.contains(.steadfast) ? 3 : 0
        let engine = GameEngine(floor: floor, extraMoves: extraMoves)
        engine.reshapeCharges = playerProgress.unlockedAbilities.contains(.reshape) ? 1 : 0
        self.engine = engine
        self.movesRemaining = engine.movesRemaining
        self.reshapeAvailable = engine.reshapeCharges > 0
        self.echoBlastAvailable = playerProgress.unlockedAbilities.contains(.echoBlast)
        self.scene = GameScene(engine: engine, size: sceneSize)
        self.scene.gameDelegate = self
        AnalyticsManager.shared.track(.floorStarted(floor: floor.id))
    }

    // MARK: - Abilities

    func useReshape() {
        guard reshapeAvailable else { return }
        scene.armReshape()
        reshapeAvailable = false
    }

    func useEchoBlast() {
        guard echoBlastAvailable else { return }
        scene.armEchoBlast()
        echoBlastAvailable = false
    }

    func requestHint() { scene.showHint() }

    // MARK: - GameSceneDelegate

    func scene(_ scene: GameScene, didChangeScore score: Int,
               movesRemaining: Int, progress: Double) {
        self.score = score
        self.movesRemaining = movesRemaining
        self.progress = progress
    }

    func scene(_ scene: GameScene, didProduce wave: CascadeWave) {
        comboStep = wave.comboStep
        multiplier = wave.multiplier
        if wave.comboStep >= 2 {
            showCombo = true
            scheduleComboHide()
            AnalyticsManager.shared.track(.comboAchieved(step: wave.comboStep,
                                                         multiplier: wave.multiplier))
        }
        if wave.isResonance {
            resonanceFlash = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                self?.resonanceFlash = false
            }
        }
    }

    func sceneDidResolve(_ scene: GameScene, outcome: GameEngine.Outcome) {
        self.outcome = outcome
        if outcome != .inProgress {
            onFinish?(outcome, engine.score, engine.essenceEarned)
        }
    }

    private func scheduleComboHide() {
        comboHideWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.showCombo = false }
        comboHideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.1, execute: work)
    }
}
