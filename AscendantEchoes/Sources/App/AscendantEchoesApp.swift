import SwiftUI

/// App entry point. Boots shared services, seeds audio, and hands off to the
/// router (`RootView`). Portrait-only, dark-mode-first.
@main
struct AscendantEchoesApp: App {
    @StateObject private var appState = AppState()

    init() {
        // Warm up audio + start menu music (no-ops gracefully if assets absent).
        AudioManager.shared.playMusic(.menu)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .preferredColorScheme(.dark)
        }
    }
}
