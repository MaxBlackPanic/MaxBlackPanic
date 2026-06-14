import SwiftUI

/// Atmospheric card shown before each floor: the biome, a narrative "vision",
/// the objective and move budget. Builds anticipation and delivers the light
/// story beats requested for retention.
struct FloorIntroView: View {
    @EnvironmentObject private var appState: AppState
    let floor: Floor

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("FLOOR \(floor.displayNumber)")
                .font(.system(size: 44, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .shadow(color: .cyan.opacity(0.6), radius: 12)

            Text(floor.biome.displayName.uppercased())
                .font(.headline)
                .tracking(6)
                .foregroundStyle(LinearGradient(colors: floor.biome.skyColors,
                                                startPoint: .leading, endPoint: .trailing))

            Text("“\(floor.vision)”")
                .font(.body.italic())
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.85))
                .padding(.horizontal)

            VStack(spacing: 12) {
                Label(floor.objective.summary, systemImage: "target")
                Label("\(floor.moveBudget) moves", systemImage: "hand.draw.fill")
                Label("\(floor.columns)×\(floor.rows) board", systemImage: "square.grid.3x3.fill")
            }
            .font(.headline)
            .foregroundStyle(.white)
            .ascendantCard()

            Spacer()

            Button {
                appState.confirmFloorStart(floor)
            } label: {
                Label("Begin Ascent", systemImage: "play.fill")
            }
            .buttonStyle(AscendantButtonStyle())

            Button("Retreat") { appState.goToMenu() }
                .buttonStyle(AscendantButtonStyle(tint: .gray, prominent: false))

            Spacer()
        }
        .padding(24)
    }
}
