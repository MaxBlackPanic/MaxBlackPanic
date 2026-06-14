import SwiftUI
import Combine

/// Top-level, app-wide state and navigation. Owns the persistent player
/// profile, the energy economy and the current screen route. Injected into the
/// SwiftUI environment so any view can read/observe it.
final class AppState: ObservableObject {

    /// The screens the app can show. `floorIntro` carries the floor about to be
    /// played so the intro card can describe it.
    enum Route: Equatable {
        case menu
        case tutorial
        case floorIntro(Floor)
        case playing(Floor)
        case shop
        case settings

        static func == (lhs: Route, rhs: Route) -> Bool {
            switch (lhs, rhs) {
            case (.menu, .menu), (.tutorial, .tutorial), (.shop, .shop), (.settings, .settings):
                return true
            case let (.floorIntro(a), .floorIntro(b)): return a.id == b.id
            case let (.playing(a), .playing(b)): return a.id == b.id
            default: return false
            }
        }
    }

    @Published var route: Route = .menu
    @Published var progress: PlayerProgress
    @Published var energy: EnergySystem
    @Published var dailyRewardAmount: Int = 0
    @Published var showDailyReward = false
    @Published var hasSeenTutorial: Bool

    /// Forwards changes from the nested observable models (progress/energy) up to
    /// observers of `AppState`, since nested `ObservableObject`s don't propagate.
    private var cancellables = Set<AnyCancellable>()

    init() {
        let savedProgress = SaveManager.shared.loadProgress()
        self.progress = savedProgress
        self.energy = EnergySystem()
        self.hasSeenTutorial = UserDefaults.standard.bool(forKey: "ae.tutorial.seen")

        // Daily login reward.
        let reward = savedProgress.registerDailyLogin()
        if reward > 0 {
            savedProgress.gainEssence(reward)
            dailyRewardAmount = reward
            showDailyReward = true
            SaveManager.shared.saveProgress(savedProgress)
        }

        bindNestedModels()
    }

    /// (Re)subscribes to the nested models' change publishers.
    private func bindNestedModels() {
        cancellables.removeAll()
        progress.objectWillChange
            .sink { [weak self] in self?.objectWillChange.send() }
            .store(in: &cancellables)
        energy.objectWillChange
            .sink { [weak self] in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }

    // MARK: - Flow

    /// The next floor the player should attempt.
    var nextFloor: Floor { LevelGenerator.makeFloor(progress.currentFloor) }

    func startClimb() {
        if hasSeenTutorial {
            beginFloor(nextFloor)
        } else {
            route = .tutorial
        }
    }

    func completeTutorial() {
        hasSeenTutorial = true
        UserDefaults.standard.set(true, forKey: "ae.tutorial.seen")
        beginFloor(nextFloor)
    }

    /// Spends energy and shows the floor intro, or routes to the shop if drained.
    func beginFloor(_ floor: Floor) {
        guard energy.canStartFloor else {
            AnalyticsManager.shared.track(.energyDepleted)
            route = .shop
            return
        }
        route = .floorIntro(floor)
    }

    func confirmFloorStart(_ floor: Floor) {
        guard energy.consumeForFloor() else { route = .shop; return }
        route = .playing(floor)
    }

    /// Called when a floor finishes. Awards essence, advances progress, persists.
    func finishFloor(_ floor: Floor, outcome: GameEngine.Outcome, score: Int, essence: Int) {
        progress.gainEssence(essence)
        if outcome == .won {
            progress.recordFloorCleared(floor.id)
            AnalyticsManager.shared.track(.floorCleared(floor: floor.id, score: score,
                                                        moves: floor.moveBudget))
            GameCenterManager.shared.report(floor: floor.id, score: score)
        } else {
            AnalyticsManager.shared.track(.floorFailed(floor: floor.id, score: score))
        }
        SaveManager.shared.saveProgress(progress)
    }

    func unlock(_ ability: Ability) {
        if progress.unlock(ability) {
            AnalyticsManager.shared.track(.abilityUnlocked(ability))
            SaveManager.shared.saveProgress(progress)
        }
    }

    func goToMenu() { route = .menu }

    /// Replaces the profile (used by the Settings "reset progress" action) and
    /// rebinds change forwarding to the new instance.
    func resetProgress(_ fresh: PlayerProgress = PlayerProgress()) {
        progress = fresh
        bindNestedModels()
        SaveManager.shared.saveProgress(fresh)
    }
}
