import SwiftUI

/// Shared, thumb-friendly button style with a glowing capsule, large hit area
/// and a satisfying press animation + click SFX. Used across all menus.
struct AscendantButtonStyle: ButtonStyle {
    var tint: Color = .cyan
    var prominent: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(prominent ? Color.black : Color.white)
            .padding(.vertical, 16)
            .padding(.horizontal, 28)
            .frame(minWidth: 200, minHeight: 52) // generous tap target
            .background(
                Capsule().fill(prominent
                    ? AnyShapeStyle(LinearGradient(colors: [tint, tint.opacity(0.7)],
                                                   startPoint: .top, endPoint: .bottom))
                    : AnyShapeStyle(Color.white.opacity(0.12)))
            )
            .overlay(Capsule().strokeBorder(tint.opacity(0.6), lineWidth: prominent ? 0 : 1.5))
            .shadow(color: tint.opacity(prominent ? 0.5 : 0), radius: 12, y: 4)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, pressed in
                if pressed { AudioManager.shared.play(.button) }
            }
    }
}

/// A labelled progress bar used for the floor objective and XP.
struct AscendantProgressBar: View {
    var value: Double
    var tint: Color = .cyan

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.12))
                Capsule()
                    .fill(LinearGradient(colors: [tint, tint.opacity(0.6)],
                                         startPoint: .leading, endPoint: .trailing))
                    .frame(width: geo.size.width * CGFloat(min(1, max(0, value))))
                    .animation(.easeOut(duration: 0.3), value: value)
            }
        }
        .frame(height: 12)
    }
}

/// A frosted card container.
struct CardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(20)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20)
                .strokeBorder(Color.white.opacity(0.08), lineWidth: 1))
    }
}

extension View {
    func ascendantCard() -> some View { modifier(CardBackground()) }
}
