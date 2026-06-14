import SwiftUI

/// Top-of-screen heads-up display: score, objective progress ring, moves left
/// and a pause/quit control. Reads everything from `GameViewModel`.
struct HUDView: View {
    @ObservedObject var vm: GameViewModel
    let onQuit: () -> Void

    var body: some View {
        HStack(alignment: .top) {
            Button(action: onQuit) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.white.opacity(0.7))
            }

            Spacer()

            VStack(spacing: 2) {
                Text(vm.score, format: .number)
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .contentTransition(.numericText())
                    .animation(.snappy, value: vm.score)
                Text(vm.floor.objective.summary)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
                AscendantProgressBar(value: vm.progress, tint: .green)
                    .frame(width: 160)
            }

            Spacer()

            VStack(spacing: 2) {
                Text("\(vm.movesRemaining)")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(vm.movesRemaining <= 3 ? .red : .white)
                Text("moves")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
    }
}
