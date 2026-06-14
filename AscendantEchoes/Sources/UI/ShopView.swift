import SwiftUI

/// "Sanctum" — the meta-progression & store screen. Spend Essence on permanent
/// abilities, recolour the Wanderer's aura (free cosmetic), and top up energy
/// via placeholder IAPs (wire to StoreKit 2 in production).
struct ShopView: View {
    @EnvironmentObject private var appState: AppState

    private let accentChoices = ["#7DD3FC", "#F472B6", "#34D399", "#FBBF24", "#A78BFA", "#FB7185"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header

                section("Abilities") {
                    ForEach(Ability.allCases) { ability in
                        abilityRow(ability)
                    }
                }

                section("Aura Colour") {
                    HStack(spacing: 14) {
                        ForEach(accentChoices, id: \.self) { hex in
                            Circle()
                                .fill(Color(hex: hex))
                                .frame(width: 40, height: 40)
                                .overlay(Circle().strokeBorder(.white,
                                    lineWidth: appState.progress.accentColorHex == hex ? 3 : 0))
                                .onTapGesture {
                                    appState.progress.accentColorHex = hex
                                    SaveManager.shared.saveProgress(appState.progress)
                                }
                        }
                    }
                }

                section("Energy") {
                    storeRow(title: "Refill Energy", subtitle: "Instantly fill all bolts",
                             price: "$0.99", icon: "bolt.fill") {
                        AnalyticsManager.shared.track(.purchaseTapped(productID: "energy_refill"))
                        appState.energy.refillToFull() // placeholder grant
                    }
                    storeRow(title: "Essence Cache", subtitle: "+2,000 Essence",
                             price: "$2.99", icon: "drop.fill") {
                        AnalyticsManager.shared.track(.purchaseTapped(productID: "essence_2000"))
                        appState.progress.gainEssence(2000)
                        SaveManager.shared.saveProgress(appState.progress)
                    }
                }
            }
            .padding(24)
        }
        .foregroundStyle(.white)
        .safeAreaInset(edge: .bottom) {
            Button("Back") { appState.goToMenu() }
                .buttonStyle(AscendantButtonStyle(tint: .gray, prominent: false))
                .padding()
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading) {
                Text("Sanctum").font(.largeTitle.bold())
                Text("Shape your ascension").font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            Label("\(appState.progress.essence)", systemImage: "drop.fill")
                .font(.headline).foregroundStyle(.cyan)
        }
        .padding(.top, 30)
    }

    private func abilityRow(_ ability: Ability) -> some View {
        let owned = appState.progress.unlockedAbilities.contains(ability)
        let affordable = appState.progress.canUnlock(ability)
        return HStack {
            Image(systemName: ability.iconName)
                .font(.title2).frame(width: 40)
                .foregroundStyle(.cyan)
            VStack(alignment: .leading) {
                Text(ability.title).font(.headline)
                Text(ability.detail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if owned {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            } else {
                Button("\(ability.essenceCost)") { appState.unlock(ability) }
                    .buttonStyle(AscendantButtonStyle(tint: affordable ? .cyan : .gray,
                                                      prominent: affordable))
                    .disabled(!affordable)
            }
        }
        .ascendantCard()
    }

    private func storeRow(title: String, subtitle: String, price: String,
                          icon: String, action: @escaping () -> Void) -> some View {
        HStack {
            Image(systemName: icon).font(.title2).frame(width: 40).foregroundStyle(.yellow)
            VStack(alignment: .leading) {
                Text(title).font(.headline)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button(price, action: action)
                .buttonStyle(AscendantButtonStyle(tint: .green))
        }
        .ascendantCard()
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String,
                                        @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased()).font(.caption.bold()).tracking(2).foregroundStyle(.secondary)
            content()
        }
    }
}
