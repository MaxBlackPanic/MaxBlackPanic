import AVFoundation

/// Lightweight audio layer. It is written so that *dropping* sound files named
/// after the `SFX` / `Music` raw values into the asset bundle is all that's
/// needed to make it sing — until then it no-ops safely (so the game is fully
/// playable with zero audio assets checked in).
///
/// Combo intensity is modelled by raising the pitch of the match cue as chains
/// grow, giving the classic "rising scale" satisfaction without bespoke clips.
final class AudioManager {
    static let shared = AudioManager()

    var musicEnabled = true { didSet { musicEnabled ? resumeMusic() : stopMusic() } }
    var sfxEnabled = true

    enum SFX: String, CaseIterable {
        case match, swap, special, resonance, cleared, button
    }
    enum Music: String { case menu, climb }

    private var players: [String: AVAudioPlayer] = [:]
    private var musicPlayer: AVAudioPlayer?

    private init() {
        configureSession()
    }

    private func configureSession() {
        // `.ambient` lets the game mix politely with the user's own music.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    // MARK: - SFX

    /// Plays a one-shot effect. `pitch` is a multiplier (1.0 = normal); used to
    /// climb the scale with combos.
    func play(_ sfx: SFX, pitch: Float = 1.0) {
        guard sfxEnabled, let player = player(for: sfx.rawValue) else { return }
        player.enableRate = true
        player.rate = max(0.5, min(2.0, pitch))
        player.currentTime = 0
        player.play()
    }

    /// Convenience that maps a combo step to a rising pitch.
    func playCombo(step: Int) {
        play(.match, pitch: 1.0 + Float(step) * 0.07)
    }

    // MARK: - Music

    func playMusic(_ track: Music) {
        guard musicEnabled, let url = url(for: track.rawValue) else { return }
        musicPlayer = try? AVAudioPlayer(contentsOf: url)
        musicPlayer?.numberOfLoops = -1
        musicPlayer?.volume = 0.5
        musicPlayer?.play()
    }

    func stopMusic() { musicPlayer?.stop() }
    private func resumeMusic() { musicPlayer?.play() }

    // MARK: - Loading (graceful when assets are absent)

    private func player(for name: String) -> AVAudioPlayer? {
        if let cached = players[name] { return cached }
        guard let url = url(for: name), let player = try? AVAudioPlayer(contentsOf: url) else {
            return nil
        }
        player.prepareToPlay()
        players[name] = player
        return player
    }

    private func url(for name: String) -> URL? {
        for ext in ["caf", "wav", "m4a", "mp3"] {
            if let url = Bundle.main.url(forResource: name, withExtension: ext) { return url }
        }
        return nil
    }
}
