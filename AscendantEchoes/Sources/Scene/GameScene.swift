import SpriteKit
import SwiftUI

/// Bridges board events back to the SwiftUI layer (HUD, win/lose flow).
protocol GameSceneDelegate: AnyObject {
    func scene(_ scene: GameScene, didChangeScore score: Int, movesRemaining: Int, progress: Double)
    func scene(_ scene: GameScene, didProduce wave: CascadeWave)
    func sceneDidResolve(_ scene: GameScene, outcome: GameEngine.Outcome)
}

/// Renders the board and plays back the engine's `SwapResolution`/cascade waves
/// as juicy animation: swaps slide, matches burst into particles, survivors
/// fall with gravity easing and fresh orbs rain in from above. All gameplay
/// truth lives in `GameEngine`; this class is pure presentation + input.
final class GameScene: SKScene {
    weak var gameDelegate: GameSceneDelegate?
    let engine: GameEngine

    private let boardLayer = SKNode()
    private let effectsLayer = SKNode()
    private let labelLayer = SKNode()

    private var nodes: [UUID: OrbNode] = [:]
    private var cellSize: CGFloat = 44
    private var boardOrigin: CGPoint = .zero
    private var displayedScore = 0
    private var inputLocked = false

    /// Targeting state for tap-driven abilities.
    private enum InputMode: Equatable {
        case normal
        case reshapeFirst
        case reshapeSecond(GridPosition)
        case echoBlast
    }
    private var inputMode: InputMode = .normal
    private var selectionMarker: SKShapeNode?

    private var dragStartCell: GridPosition?
    private var dragStartPoint: CGPoint = .zero

    init(engine: GameEngine, size: CGSize) {
        self.engine = engine
        super.init(size: size)
        scaleMode = .resizeFill
        anchorPoint = CGPoint(x: 0.5, y: 0.5)
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func didMove(to view: SKView) {
        view.isMultipleTouchEnabled = false
        addBackdrop()
        addChild(boardLayer)
        addChild(effectsLayer)
        addChild(labelLayer)
        effectsLayer.zPosition = 10
        labelLayer.zPosition = 20
        computeLayout()
        buildBoard()
        gameDelegate?.scene(self, didChangeScore: 0,
                            movesRemaining: engine.movesRemaining,
                            progress: engine.objectiveProgress)
    }

    // MARK: - Layout

    private func computeLayout() {
        let cols = CGFloat(engine.floor.columns)
        let rows = CGFloat(engine.floor.rows)
        let usableW = size.width * 0.92
        let usableH = size.height * 0.60
        cellSize = min(usableW / cols, usableH / rows)
        let boardW = cellSize * cols
        let boardH = cellSize * rows
        boardOrigin = CGPoint(x: -boardW / 2 + cellSize / 2,
                              y: -boardH / 2 + cellSize / 2 - size.height * 0.04)
    }

    private func position(_ p: GridPosition) -> CGPoint {
        CGPoint(x: boardOrigin.x + CGFloat(p.col) * cellSize,
                y: boardOrigin.y + CGFloat(p.row) * cellSize)
    }

    private func gridPosition(at point: CGPoint) -> GridPosition? {
        let col = Int(((point.x - boardOrigin.x) / cellSize).rounded())
        let row = Int(((point.y - boardOrigin.y) / cellSize).rounded())
        let p = GridPosition(col: col, row: row)
        return engine.grid.contains(p) ? p : nil
    }

    // MARK: - Board construction

    private func buildBoard() {
        boardLayer.removeAllChildren()
        nodes.removeAll()

        // Subtle board frame for readability.
        let cols = CGFloat(engine.floor.columns), rows = CGFloat(engine.floor.rows)
        let frame = SKShapeNode(rectOf: CGSize(width: cellSize * cols + 16,
                                               height: cellSize * rows + 16),
                                cornerRadius: 18)
        frame.position = CGPoint(x: 0, y: boardOrigin.y + (rows - 1) * cellSize / 2)
        frame.fillColor = SKColor.black.withAlphaComponent(0.22)
        frame.strokeColor = SKColor.white.withAlphaComponent(0.10)
        frame.zPosition = -1
        boardLayer.addChild(frame)

        let radius = cellSize * 0.44
        for p in engine.grid.allPositions {
            guard let tile = engine.grid[p] else { continue }
            let node = OrbNode(tile: tile, radius: radius)
            node.position = position(p)
            boardLayer.addChild(node)
            nodes[tile.id] = node
        }
    }

    private func addBackdrop() {
        let texture = GameScene.gradientTexture(colors: engine.floor.biome.skyColors, size: size)
        let backdrop = SKSpriteNode(texture: texture)
        backdrop.size = CGSize(width: size.width * 1.2, height: size.height * 1.2)
        backdrop.zPosition = -100
        addChild(backdrop)

        // Slow parallax drift for atmosphere.
        backdrop.run(.repeatForever(.sequence([
            .moveBy(x: 14, y: 8, duration: 6),
            .moveBy(x: -14, y: -8, duration: 6)
        ])))

        // Floating ambient motes.
        let motes = ParticleManager.essenceTrail(color: Theme.sk(engine.floor.biome.skyColors[1]))
        motes.position = CGPoint(x: 0, y: -size.height / 2)
        motes.particlePositionRange = CGVector(dx: size.width, dy: 0)
        motes.particleSpeed = 30
        motes.emissionAngle = .pi / 2
        motes.particleLifetime = 6
        motes.particleBirthRate = 8
        motes.zPosition = -90
        addChild(motes)
    }

    // MARK: - Input

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard !inputLocked, let touch = touches.first else { return }
        let location = touch.location(in: self)

        switch inputMode {
        case .normal:
            dragStartCell = gridPosition(at: location)
            dragStartPoint = location
        case .echoBlast:
            if let p = gridPosition(at: location) { performEchoBlast(at: p) }
            endAbilityTargeting()
        case .reshapeFirst:
            if let p = gridPosition(at: location) {
                inputMode = .reshapeSecond(p)
                showSelectionMarker(at: p)
            }
        case .reshapeSecond(let first):
            if let second = gridPosition(at: location), second != first {
                performReshape(first, second)
            }
            endAbilityTargeting()
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard !inputLocked, inputMode == .normal,
              let touch = touches.first, let start = dragStartCell else { return }
        let location = touch.location(in: self)
        let dx = location.x - dragStartPoint.x
        let dy = location.y - dragStartPoint.y
        guard max(abs(dx), abs(dy)) > cellSize * 0.35 else { return }

        let target: GridPosition
        if abs(dx) > abs(dy) {
            target = GridPosition(col: start.col + (dx > 0 ? 1 : -1), row: start.row)
        } else {
            target = GridPosition(col: start.col, row: start.row + (dy > 0 ? 1 : -1))
        }
        dragStartCell = nil
        guard engine.grid.contains(target) else { return }
        animate(engine.attemptSwap(start, target))
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        dragStartCell = nil
    }

    // MARK: - Ability entry points (called by the view model)

    func armReshape() {
        guard engine.reshapeCharges > 0 else { return }
        inputMode = .reshapeFirst
    }

    func armEchoBlast() { inputMode = .echoBlast }

    private func endAbilityTargeting() {
        inputMode = .normal
        selectionMarker?.removeFromParent()
        selectionMarker = nil
    }

    private func showSelectionMarker(at p: GridPosition) {
        selectionMarker?.removeFromParent()
        let marker = SKShapeNode(circleOfRadius: cellSize * 0.5)
        marker.position = position(p)
        marker.strokeColor = .white
        marker.lineWidth = 3
        marker.fillColor = .clear
        marker.zPosition = 5
        marker.run(.repeatForever(.sequence([.scale(to: 1.1, duration: 0.4),
                                             .scale(to: 1.0, duration: 0.4)])))
        boardLayer.addChild(marker)
        selectionMarker = marker
    }

    private func performReshape(_ a: GridPosition, _ b: GridPosition) {
        guard let res = engine.reshape(a, b) else { return }
        animate(res)
    }

    private func performEchoBlast(at p: GridPosition) {
        guard let waves = engine.echoBlast(at: p) else { return }
        inputLocked = true
        AudioManager.shared.play(.special)
        animateWaves(waves, index: 0)
    }

    // MARK: - Public helpers

    /// Briefly pulses a valid move to help the player.
    func showHint() {
        guard !inputLocked, let (a, b) = engine.board.findHint() else { return }
        for p in [a, b] {
            guard let tile = engine.grid[p], let node = nodes[tile.id] else { continue }
            node.run(.sequence([.scale(to: 1.3, duration: 0.18),
                                .scale(to: 1.0, duration: 0.18)]))
        }
    }

    // MARK: - Animation

    private func animate(_ resolution: SwapResolution) {
        inputLocked = true
        let nodeA = nodes[resolution.swapA.id]
        let nodeB = nodes[resolution.swapB.id]
        let destA = position(resolution.swapA.to)
        let destB = position(resolution.swapB.to)
        let dur = Theme.Timing.swap

        guard resolution.isValid else {
            HapticsManager.shared.invalid()
            AudioManager.shared.play(.swap)
            nodeA?.run(.sequence([.move(to: destA, duration: dur),
                                  .move(to: position(resolution.swapA.from), duration: dur)]))
            nodeB?.run(.sequence([.move(to: destB, duration: dur),
                                  .move(to: position(resolution.swapB.from), duration: dur)])) {
                [weak self] in self?.inputLocked = false
            }
            return
        }

        HapticsManager.shared.swap()
        AudioManager.shared.play(.swap)
        nodeA?.run(.move(to: destA, duration: dur))
        nodeB?.run(.move(to: destB, duration: dur)) { [weak self] in
            self?.animateWaves(resolution.waves, index: 0)
        }
    }

    private func animateWaves(_ waves: [CascadeWave], index: Int) {
        guard index < waves.count else { finishResolution(); return }
        animate(wave: waves[index]) { [weak self] in
            self?.animateWaves(waves, index: index + 1)
        }
    }

    private func animate(wave: CascadeWave, completion: @escaping () -> Void) {
        gameDelegate?.scene(self, didProduce: wave)
        displayedScore += wave.scoreDelta
        gameDelegate?.scene(self, didChangeScore: displayedScore,
                            movesRemaining: engine.movesRemaining,
                            progress: engine.objectiveProgress)

        AudioManager.shared.playCombo(step: wave.comboStep)
        HapticsManager.shared.combo(step: wave.comboStep)
        if wave.isResonance {
            HapticsManager.shared.resonanceBurst()
            AudioManager.shared.play(.resonance)
            showResonanceLabel(multiplier: wave.multiplier)
            shake()
        }

        // Phase 1 — clears + special placements.
        for clear in wave.clears {
            let point = position(clear.position)
            let color = Theme.glowColor(clear.tile.element)
            let burst = (clear.tile.special.isSpecial || wave.isResonance)
                ? ParticleManager.resonanceBurst(color: color, at: point)
                : ParticleManager.matchBurst(color: color, at: point)
            effectsLayer.addChild(burst)

            if let node = nodes[clear.tile.id] {
                node.run(.sequence([
                    .group([.scale(to: 1.4, duration: 0.10),
                            .fadeOut(withDuration: Theme.Timing.clear)]),
                    .removeFromParent()
                ]))
                nodes[clear.tile.id] = nil
            }
        }
        for placement in wave.placements {
            nodes[placement.tileID]?.restyle(to: Tile(id: placement.tileID,
                                                       element: placement.element,
                                                       special: placement.kind))
        }

        // Phase 2 — collapse + refill, after the clear has read on screen.
        run(.wait(forDuration: Theme.Timing.clear)) { [weak self] in
            guard let self else { return }
            for move in wave.collapses {
                let action = SKAction.move(to: self.position(move.to), duration: Theme.Timing.collapse)
                action.timingMode = .easeIn
                self.nodes[move.id]?.run(action)
            }
            let radius = self.cellSize * 0.44
            for spawn in wave.spawns {
                let node = OrbNode(tile: spawn.tile, radius: radius)
                node.position = self.position(GridPosition(col: spawn.position.col, row: spawn.dropFrom))
                self.boardLayer.addChild(node)
                self.nodes[spawn.tile.id] = node
                let action = SKAction.move(to: self.position(spawn.position), duration: Theme.Timing.spawn)
                action.timingMode = .easeIn
                node.run(action)
            }
            self.run(.wait(forDuration: Theme.Timing.collapse)) { completion() }
        }
    }

    private func finishResolution() {
        reconcileNodePositions()
        let outcome = engine.outcome
        if outcome != .inProgress {
            // Floor is over — keep input locked so no extra swap can fire a
            // second completion before the result overlay appears.
            gameDelegate?.sceneDidResolve(self, outcome: outcome)
        } else {
            inputLocked = false
        }
    }

    /// Safety net: snap every node to its authoritative grid position. Handles
    /// the rare auto-shuffle (no legal moves) without desyncing the view.
    private func reconcileNodePositions() {
        for p in engine.grid.allPositions {
            guard let tile = engine.grid[p], let node = nodes[tile.id] else { continue }
            let target = position(p)
            if node.position.distance(to: target) > 1 {
                node.run(.move(to: target, duration: 0.18))
            }
        }
    }

    // MARK: - Juice

    private func shake() {
        let amount: CGFloat = 8
        boardLayer.run(.sequence([
            .moveBy(x: amount, y: 0, duration: 0.03),
            .moveBy(x: -amount * 2, y: 0, duration: 0.06),
            .moveBy(x: amount * 2, y: 0, duration: 0.06),
            .moveBy(x: -amount, y: 0, duration: 0.03)
        ]))
    }

    private func showResonanceLabel(multiplier: Double) {
        let label = SKLabelNode(text: "ECHO RESONANCE  ×\(Int(multiplier))")
        label.fontName = "AvenirNext-Heavy"
        label.fontSize = 26
        label.fontColor = .white
        label.position = CGPoint(x: 0, y: size.height * 0.18)
        label.setScale(0.3)
        label.zPosition = 30
        labelLayer.addChild(label)
        label.run(.sequence([
            .group([.scale(to: 1.0, duration: 0.18), .fadeIn(withDuration: 0.12)]),
            .wait(forDuration: 0.5),
            .group([.scale(to: 1.4, duration: 0.3), .fadeOut(withDuration: 0.3)]),
            .removeFromParent()
        ]))
    }

    // MARK: - Texture helpers

    private static func gradientTexture(colors: [Color], size: CGSize) -> SKTexture {
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { ctx in
            let cgColors = colors.map { UIColor($0).cgColor } as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                      colors: cgColors, locations: [0, 1])!
            ctx.cgContext.drawLinearGradient(gradient,
                                             start: CGPoint(x: 0, y: 0),
                                             end: CGPoint(x: 0, y: size.height),
                                             options: [])
        }
        return SKTexture(image: image)
    }
}

private extension CGPoint {
    func distance(to other: CGPoint) -> CGFloat {
        hypot(x - other.x, y - other.y)
    }
}
