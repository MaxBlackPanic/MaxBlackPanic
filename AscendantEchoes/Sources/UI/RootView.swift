import SwiftUI

/// The router. Maps `AppState.route` to a screen and layers global overlays
/// (the daily-login reward) on top with smooth cross-fades.
struct RootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        ZStack {
            AscendantBackground()

            Group {
                switch appState.route {
                case .menu:
                    MainMenuView()
                case .tutorial:
                    TutorialView()
                case .floorIntro(let floor):
                    FloorIntroView(floor: floor)
                case .playing(let floor):
                    GameView(floor: floor, progress: appState.progress)
                case .shop:
                    ShopView()
                case .settings:
                    SettingsView()
                }
            }
            .transition(.opacity.combined(with: .scale(scale: 0.98)))

            if appState.showDailyReward {
                DailyRewardOverlay(amount: appState.dailyRewardAmount) {
                    withAnimation { appState.showDailyReward = false }
                }
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: appState.route)
        .animation(.easeInOut(duration: 0.3), value: appState.showDailyReward)
    }
}

/// Reusable cosmic gradient backdrop for menus.
struct AscendantBackground: View {
    var body: some View {
        LinearGradient(colors: [Color(red: 0.05, green: 0.04, blue: 0.14),
                                Color(red: 0.13, green: 0.07, blue: 0.26),
                                Color(red: 0.04, green: 0.10, blue: 0.20)],
                       startPoint: .top, endPoint: .bottom)
        .overlay(
            // Faint starfield using a noise of dots.
            GeometryReader { geo in
                ForEach(0..<60, id: \.self) { i in
                    Circle()
                        .fill(Color.white.opacity(Double.random(in: 0.05...0.4)))
                        .frame(width: CGFloat.random(in: 1...3))
                        .position(x: CGFloat.random(in: 0...geo.size.width),
                                  y: CGFloat.random(in: 0...geo.size.height))
                }
            }
        )
        .ignoresSafeArea()
    }
}

struct DailyRewardOverlay: View {
    let amount: Int
    let dismiss: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea().onTapGesture(perform: dismiss)
            VStack(spacing: 16) {
                Image(systemName: "gift.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.yellow)
                Text("Daily Resonance")
                    .font(.title2.bold())
                Text("+\(amount) Essence")
                    .font(.title3)
                    .foregroundStyle(.cyan)
                Button("Claim", action: dismiss)
                    .buttonStyle(AscendantButtonStyle())
            }
            .padding(32)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
            .padding(40)
        }
    }
}
