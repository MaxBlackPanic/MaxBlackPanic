import SwiftUI

/// Settings & accessibility. Toggles persist via `@AppStorage` and are applied
/// to the shared service singletons. Includes a colour-blind mode and a guarded
/// progress reset.
struct SettingsView: View {
    @EnvironmentObject private var appState: AppState

    @AppStorage("ae.music") private var musicEnabled = true
    @AppStorage("ae.sfx") private var sfxEnabled = true
    @AppStorage("ae.haptics") private var hapticsEnabled = true
    @AppStorage("ae.colorblind") private var colorBlind = false

    @State private var showResetConfirm = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Settings").font(.largeTitle.bold()).padding(.top, 30)

                group("Audio") {
                    toggle("Music", systemImage: "music.note", isOn: $musicEnabled)
                        .onChange(of: musicEnabled) { _, v in AudioManager.shared.musicEnabled = v }
                    toggle("Sound Effects", systemImage: "speaker.wave.2.fill", isOn: $sfxEnabled)
                        .onChange(of: sfxEnabled) { _, v in AudioManager.shared.sfxEnabled = v }
                }

                group("Feel") {
                    toggle("Haptics", systemImage: "iphone.radiowaves.left.and.right", isOn: $hapticsEnabled)
                        .onChange(of: hapticsEnabled) { _, v in HapticsManager.shared.isEnabled = v }
                }

                group("Accessibility") {
                    toggle("Colour-Blind Glyphs", systemImage: "eye.fill", isOn: $colorBlind)
                        .onChange(of: colorBlind) { _, v in Theme.colorBlindMode = v }
                    Text("Adds bold distinct symbols to every orb so matches are readable without colour.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                group("Account") {
                    button("Restore Purchases", systemImage: "arrow.clockwise") {
                        // Hook StoreKit restore here.
                    }
                    button("Sign in to Game Center", systemImage: "gamecontroller.fill") {
                        GameCenterManager.shared.authenticate { _ in }
                    }
                    button("Reset Progress", systemImage: "trash.fill", tint: .red) {
                        showResetConfirm = true
                    }
                }

                Text("Ascendant Echoes v1.0 — an original resonance.")
                    .font(.caption2).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .padding(24)
        }
        .foregroundStyle(.white)
        .safeAreaInset(edge: .bottom) {
            Button("Back") { appState.goToMenu() }
                .buttonStyle(AscendantButtonStyle(tint: .gray, prominent: false))
                .padding()
        }
        .onAppear {
            // Reflect stored settings into the live services on entry.
            AudioManager.shared.musicEnabled = musicEnabled
            AudioManager.shared.sfxEnabled = sfxEnabled
            HapticsManager.shared.isEnabled = hapticsEnabled
            Theme.colorBlindMode = colorBlind
        }
        .alert("Reset all progress?", isPresented: $showResetConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Reset", role: .destructive) {
                appState.resetProgress()
                appState.goToMenu()
            }
        } message: {
            Text("This permanently erases your level, essence and floor progress.")
        }
    }

    // MARK: - Builders

    @ViewBuilder
    private func group<Content: View>(_ title: String,
                                      @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased()).font(.caption.bold()).tracking(2).foregroundStyle(.secondary)
            content()
        }
        .ascendantCard()
    }

    private func toggle(_ title: String, systemImage: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            Label(title, systemImage: systemImage)
        }
        .tint(.cyan)
    }

    private func button(_ title: String, systemImage: String,
                        tint: Color = .white, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .foregroundStyle(tint)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
