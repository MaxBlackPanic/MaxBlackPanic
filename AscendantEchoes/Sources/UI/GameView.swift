import SwiftUI
import SpriteKit

/// Hosts the SpriteKit board (`GameScene`) behind a SwiftUI HUD + ability bar,
/// and presents the win/lose result overlay when the floor resolves.
struct GameView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var vm: GameViewModel
    let floor: Floor

    @State private var showResult = false
    @State private var resultOutcome: GameEngine.Outcome = .inProgress

    init(floor: Floor, progress: PlayerProgress) {
        self.floor = floor
        _vm = StateObject(wrappedValue: GameViewModel(floor: floor, progress: progress))
    }

    var body: some View {
        ZStack {
            SpriteView(scene: vm.scene, options: [.ignoresSiblingOrder])
                .ignoresSafeArea()

            VStack {
                HUDView(vm: vm) { appState.goToMenu() }
                Spacer()
                abilityBar
            }
            .padding()

            // Combo popup.
            if vm.showCombo {
                ComboPopup(step: vm.comboStep, multiplier: vm.multiplier)
                    .transition(.scale.combined(with: .opacity))
            }

            // Resonance full-screen flash.
            if vm.resonanceFlash {
                Color.white.opacity(0.18).ignoresSafeArea()
                    .transition(.opacity)
            }

            if showResult {
                ResultView(outcome: resultOutcome,
                           floor: floor,
                           score: vm.engine.score,
                           essence: vm.engine.essenceEarned,
                           onContinue: { appState.goToMenu() },
                           onRetry: { appState.beginFloor(floor) })
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: vm.showCombo)
        .animation(.easeInOut(duration: 0.25), value: vm.resonanceFlash)
        .animation(.easeInOut(duration: 0.4), value: showResult)
        .onAppear {
            AudioManager.shared.playMusic(.climb)
            vm.onFinish = { outcome, score, essence in
                appState.finishFloor(floor, outcome: outcome, score: score, essence: essence)
                resultOutcome = outcome
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    HapticsManager.shared.floorCleared()
                    showResult = true
                }
            }
        }
    }

    private var abilityBar: some View {
        HStack(spacing: 14) {
            AbilityButton(icon: "lightbulb.fill", label: "Hint", enabled: true) {
                vm.requestHint()
            }
            if appState.progress.unlockedAbilities.contains(.reshape) {
                AbilityButton(icon: Ability.reshape.iconName, label: "Reshape",
                              enabled: vm.reshapeAvailable) { vm.useReshape() }
            }
            if appState.progress.unlockedAbilities.contains(.echoBlast) {
                AbilityButton(icon: Ability.echoBlast.iconName, label: "Blast",
                              enabled: vm.echoBlastAvailable) { vm.useEchoBlast() }
            }
        }
        .padding(.bottom, 8)
    }
}

private struct AbilityButton: View {
    let icon: String
    let label: String
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.title2)
                Text(label).font(.caption2)
            }
            .frame(width: 64, height: 64)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16)
                .strokeBorder(.cyan.opacity(enabled ? 0.6 : 0.1), lineWidth: 1.5))
            .opacity(enabled ? 1 : 0.4)
        }
        .disabled(!enabled)
        .foregroundStyle(.white)
    }
}

private struct ComboPopup: View {
    let step: Int
    let multiplier: Double

    var body: some View {
        VStack(spacing: 2) {
            Text("COMBO ×\(step)")
                .font(.system(size: 34, weight: .black, design: .rounded))
            Text("\(String(format: "%.1f", multiplier))× score")
                .font(.headline)
        }
        .foregroundStyle(.white)
        .shadow(color: .orange, radius: 14)
        .scaleEffect(1 + min(0.5, Double(step) * 0.08))
        .offset(y: -120)
    }
}
