import SwiftUI

/// A quick (~45s) onboarding carousel that teaches the core loop before the
/// first floor. Kept light and skippable; the real teaching happens on Floor 1
/// which is generated to be gentle.
struct TutorialView: View {
    @EnvironmentObject private var appState: AppState
    @State private var page = 0

    private struct Page: Identifiable {
        let id = UUID()
        let icon: String
        let title: String
        let body: String
        let tint: Color
    }

    private let pages: [Page] = [
        .init(icon: "hand.draw.fill", title: "Swap to Match",
              body: "Drag an orb into a neighbour to line up three or more of the same element. Matches shatter into Essence.",
              tint: .cyan),
        .init(icon: "burst.fill", title: "Chase the Echo",
              body: "Match 4 for a Surge Orb, 5 for a Cataclysm, and make L or T shapes for an Echo Resonance — score multiplies wildly!",
              tint: .orange),
        .init(icon: "arrow.up.circle.fill", title: "Ascend the Tower",
              body: "Each floor sets an objective. Clear it within your moves to climb higher, evolve your Wanderer, and unlock new powers.",
              tint: .green)
    ]

    var body: some View {
        VStack {
            HStack {
                Spacer()
                Button("Skip") { appState.completeTutorial() }
                    .foregroundStyle(.white.opacity(0.7))
            }
            .padding()

            TabView(selection: $page) {
                ForEach(Array(pages.enumerated()), id: \.element.id) { index, p in
                    VStack(spacing: 24) {
                        Image(systemName: p.icon)
                            .font(.system(size: 90))
                            .foregroundStyle(p.tint)
                            .symbolEffect(.pulse)
                            .shadow(color: p.tint.opacity(0.6), radius: 20)
                        Text(p.title).font(.title.bold())
                        Text(p.body)
                            .font(.body)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.white.opacity(0.85))
                            .padding(.horizontal, 32)
                    }
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .foregroundStyle(.white)

            Button(page == pages.count - 1 ? "Begin Your Ascent" : "Next") {
                if page == pages.count - 1 {
                    appState.completeTutorial()
                } else {
                    withAnimation { page += 1 }
                }
            }
            .buttonStyle(AscendantButtonStyle())
            .padding(.bottom, 40)
        }
    }
}
