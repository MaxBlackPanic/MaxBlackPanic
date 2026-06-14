import GameKit

/// Thin Game Center wrapper for authentication, leaderboard submission and
/// achievements. All calls fail soft so the game works fully offline / when the
/// player is not signed in. Configure the IDs in App Store Connect and update
/// `LeaderboardID` / `AchievementID` to match.
final class GameCenterManager: ObservableObject {
    static let shared = GameCenterManager()

    @Published private(set) var isAuthenticated = false

    enum LeaderboardID {
        static let highestFloor = "com.resonant.ascendantechoes.highestfloor"
        static let topScore = "com.resonant.ascendantechoes.topscore"
    }

    private init() {}

    /// Presents the system sign-in if needed. The optional view controller
    /// closure is invoked when GameKit needs UI presentation (wire to the
    /// active scene's root VC from the App layer).
    func authenticate(present: @escaping (UIViewController) -> Void) {
        GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, error in
            if let viewController {
                present(viewController)
            } else {
                self?.isAuthenticated = GKLocalPlayer.local.isAuthenticated
                if let error { print("GameCenter auth error: \(error.localizedDescription)") }
            }
        }
    }

    func submit(score: Int, to leaderboard: String) {
        guard isAuthenticated else { return }
        Task {
            try? await GKLeaderboard.submitScore(score,
                                                 context: 0,
                                                 player: GKLocalPlayer.local,
                                                 leaderboardIDs: [leaderboard])
        }
    }

    func report(floor: Int, score: Int) {
        submit(score: floor, to: LeaderboardID.highestFloor)
        submit(score: score, to: LeaderboardID.topScore)
    }
}
