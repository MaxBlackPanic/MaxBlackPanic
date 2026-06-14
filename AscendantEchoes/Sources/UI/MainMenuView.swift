import SwiftUI

/// The hub screen: shows the Wanderer's evolving identity, level/essence
/// progress, energy, and the call-to-action to continue the climb.
struct MainMenuView: View {
    @EnvironmentObject private var appState: AppState

    private var progress: PlayerProgress { appState.progress }

    var body: some View {
        VStack(spacing: 24) {
            header

            wandererCard

            Spacer()

            VStack(spacing: 14) {
                Button {
                    appState.startClimb()
                } label: {
                    Label("Ascend  ·  Floor \(progress.currentFloor)", systemImage: "arrow.up.circle.fill")
                }
                .buttonStyle(AscendantButtonStyle(tint: Color(hex: progress.accentColorHex)))

                HStack(spacing: 12) {
                    Button { appState.route = .shop } label: {
                        Label("Sanctum", systemImage: "bag.fill")
                    }
                    .buttonStyle(AscendantButtonStyle(tint: .purple, prominent: false))

                    Button { appState.route = .settings } label: {
                        Label("Settings", systemImage: "gearshape.fill")
                    }
                    .buttonStyle(AscendantButtonStyle(tint: .gray, prominent: false))
                }
            }

            energyBar
        }
        .padding(24)
        .foregroundStyle(.white)
    }

    private var header: some View {
        VStack(spacing: 4) {
            Text("ASCENDANT")
                .font(.system(size: 40, weight: .black, design: .rounded))
                .tracking(4)
            Text("ECHOES")
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .tracking(12)
                .foregroundStyle(.cyan)
        }
        .shadow(color: .cyan.opacity(0.5), radius: 12)
        .padding(.top, 40)
    }

    private var wandererCard: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(RadialGradient(colors: [Color(hex: progress.accentColorHex).opacity(0.8), .clear],
                                         center: .center, startRadius: 4, endRadius: 80))
                    .frame(width: 150, height: 150)
                Image(systemName: formIcon)
                    .font(.system(size: 70))
                    .foregroundStyle(Color(hex: progress.accentColorHex))
                    .symbolEffect(.pulse)
            }

            Text(progress.form.title)
                .font(.title2.bold())
            Text("Level \(progress.level)")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 6) {
                AscendantProgressBar(value: Double(progress.essence) / Double(max(1, progress.essenceForNextLevel)),
                                     tint: Color(hex: progress.accentColorHex))
                HStack {
                    Text("\(progress.essence) / \(progress.essenceForNextLevel) Essence")
                    Spacer()
                    Text("Highest: Floor \(progress.highestFloor)")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .ascendantCard()
    }

    private var energyBar: some View {
        HStack(spacing: 6) {
            ForEach(0..<EnergySystem.maxEnergy, id: \.self) { i in
                Image(systemName: i < appState.energy.current ? "bolt.fill" : "bolt")
                    .foregroundStyle(i < appState.energy.current ? .yellow : .gray)
            }
            if let seconds = appState.energy.secondsUntilNextRefill() {
                Text(timeString(seconds))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .padding(.leading, 6)
            }
        }
        .font(.title3)
    }

    private var formIcon: String {
        switch progress.form {
        case .wanderer:  return "figure.walk"
        case .adept:     return "sparkle"
        case .luminary:  return "sun.max.fill"
        case .ascendant: return "crown.fill"
        }
    }

    private func timeString(_ seconds: TimeInterval) -> String {
        let m = Int(seconds) / 60, s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }
}
