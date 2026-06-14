import SwiftUI

/// Win / lose celebration shown when a floor resolves. On victory it teases the
/// next floor; on defeat it offers a retry. Awards are already applied by
/// `AppState.finishFloor` before this appears.
struct ResultView: View {
    let outcome: GameEngine.Outcome
    let floor: Floor
    let score: Int
    let essence: Int
    let onContinue: () -> Void
    let onRetry: () -> Void

    private var won: Bool { outcome == .won }

    var body: some View {
        ZStack {
            Color.black.opacity(0.7).ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: won ? "checkmark.seal.fill" : "xmark.seal.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(won ? .green : .red)
                    .symbolEffect(.bounce, value: won)

                Text(won ? "Floor \(floor.id) Ascended!" : "The Echo Fades")
                    .font(.title.bold())
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)

                VStack(spacing: 10) {
                    statRow(icon: "star.fill", label: "Score", value: "\(score)", tint: .yellow)
                    statRow(icon: "drop.fill", label: "Essence", value: "+\(essence)", tint: .cyan)
                }
                .ascendantCard()

                if won {
                    Button {
                        onContinue()
                    } label: {
                        Label("Continue Climb", systemImage: "arrow.up.circle.fill")
                    }
                    .buttonStyle(AscendantButtonStyle(tint: .green))
                } else {
                    Button {
                        onRetry()
                    } label: {
                        Label("Try Again", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(AscendantButtonStyle(tint: .orange))
                }

                Button("Return to Sanctum", action: onContinue)
                    .buttonStyle(AscendantButtonStyle(tint: .gray, prominent: false))
            }
            .padding(28)
        }
    }

    private func statRow(icon: String, label: String, value: String, tint: Color) -> some View {
        HStack {
            Label(label, systemImage: icon).foregroundStyle(tint)
            Spacer()
            Text(value).bold()
        }
        .foregroundStyle(.white)
        .frame(width: 220)
    }
}
