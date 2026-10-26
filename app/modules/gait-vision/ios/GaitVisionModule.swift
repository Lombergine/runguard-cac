//
//  GaitVisionModule.swift
//  RunGuard 2.0 — camera gait check
//
//  Runs Apple's Vision body-pose detector over a short side-view running
//  clip, entirely on the phone, and reduces the joint tracks to the three
//  numbers the gait channel cares about:
//
//    cadence            steps per minute, from the vertical bounce of the hips
//    vertical bounce    peak-to-peak hip oscillation as a share of torso length
//                       (pixels are not centimetres; torso length is the ruler)
//    contact asymmetry  how much longer one foot stays on the ground than the
//                       other, from each ankle's time near its lowest position
//
//  No video, frame or joint ever leaves the device: the clip is read with
//  AVAssetReader, frames are decimated to ~15 per second, and only the
//  summary numbers cross the bridge. Every number comes with how many frames
//  carried a pose and the mean joint confidence, and the result says "not
//  enough" instead of guessing when the clip is too short or the runner too
//  small in frame. This is a heuristic, not a lab gait analysis.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import AVFoundation
import ExpoModulesCore
import Vision

public class GaitVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GaitVision")

    AsyncFunction("analyzeVideo") { (uri: String, targetFps: Double) -> [String: Any] in
      guard let url = URL(string: uri) else { throw GaitError.badUri(uri) }
      return try GaitAnalyzer.analyze(url: url, targetFps: targetFps)
    }
  }
}

enum GaitError: Error, LocalizedError {
  case badUri(String)
  case noVideoTrack
  case readerFailed(String)

  var errorDescription: String? {
    switch self {
    case .badUri(let u): return "Could not open the video at \(u)."
    case .noVideoTrack: return "The file has no video track."
    case .readerFailed(let m): return "Could not read the video: \(m)."
    }
  }
}

/// One decimated frame's joints, in Vision's normalized coordinates
/// (origin bottom-left, y up). Nil where the joint was missing or
/// below the confidence floor.
struct Frame {
  let t: Double
  let leftAnkle: CGPoint?
  let rightAnkle: CGPoint?
  let hip: CGPoint?
  let torso: Double?
  let confidence: Double
  var hasPose: Bool { hip != nil }
}

enum GaitAnalyzer {
  static let confidenceFloor: Float = 0.3
  static let minimumSeconds = 3.0
  static let minimumPoseFraction = 0.5

  static func analyze(url: URL, targetFps: Double) throws -> [String: Any] {
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first else { throw GaitError.noVideoTrack }
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(
      track: track,
      outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    )
    output.alwaysCopiesSampleData = false
    reader.add(output)
    guard reader.startReading() else { throw GaitError.readerFailed(reader.error?.localizedDescription ?? "unknown") }

    let nominalFps = Double(track.nominalFrameRate > 0 ? track.nominalFrameRate : 30)
    let stride = max(1, Int((nominalFps / max(targetFps, 1)).rounded()))
    let orientation = Self.orientation(for: track.preferredTransform)

    var frames: [Frame] = []
    var index = 0
    var processed = 0
    var firstVisionError: String? = nil
    var frameSize: CGSize = .zero
    while let sample = output.copyNextSampleBuffer() {
      defer { index += 1 }
      if index % stride != 0 { continue }
      guard let pixels = CMSampleBufferGetImageBuffer(sample) else { continue }
      let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
      processed += 1
      if frameSize == .zero {
        frameSize = CGSize(width: CVPixelBufferGetWidth(pixels), height: CVPixelBufferGetHeight(pixels))
      }
      let request = VNDetectHumanBodyPoseRequest()
      let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: orientation, options: [:])
      do {
        try handler.perform([request])
      } catch {
        // Recorded, not thrown: one bad frame should not sink the clip, but
        // the reason must reach the screen when every frame fails.
        if firstVisionError == nil { firstVisionError = error.localizedDescription }
      }
      guard let obs = request.results?.first else {
        frames.append(Frame(t: t, leftAnkle: nil, rightAnkle: nil, hip: nil, torso: nil, confidence: 0))
        continue
      }
      func point(_ name: VNHumanBodyPoseObservation.JointName) -> (CGPoint, Float)? {
        guard let p = try? obs.recognizedPoint(name), p.confidence >= confidenceFloor else { return nil }
        return (p.location, p.confidence)
      }
      let la = point(.leftAnkle), ra = point(.rightAnkle)
      let lh = point(.leftHip), rh = point(.rightHip)
      let neck = point(.neck), root = point(.root)
      var hip: CGPoint? = nil
      if let lh, let rh { hip = CGPoint(x: (lh.0.x + rh.0.x) / 2, y: (lh.0.y + rh.0.y) / 2) }
      else if let root { hip = root.0 }
      var torso: Double? = nil
      if let neck, let root { torso = hypot(Double(neck.0.x - root.0.x), Double(neck.0.y - root.0.y)) }
      let confs = [la?.1, ra?.1, lh?.1, rh?.1, neck?.1, root?.1].compactMap { $0 }
      let conf = confs.isEmpty ? 0 : Double(confs.reduce(0, +)) / Double(confs.count)
      frames.append(Frame(t: t, leftAnkle: la?.0, rightAnkle: ra?.0, hip: hip, torso: torso, confidence: conf))
    }
    reader.cancelReading()

    // A real clip has the runner in frame for stretches, not the whole time:
    // they walk in, run, stop, talk. Judge the longest continuous stretch
    // with a pose (gaps under half a second allowed), not the whole clip.
    let segment = longestPosedSegment(frames, maxGap: 1.0)
    let posed = segment.filter(\.hasPose)
    let duration = (segment.last?.t ?? 0) - (segment.first?.t ?? 0)
    let clipDuration = (frames.last?.t ?? 0) - (frames.first?.t ?? 0)
    let fps = frames.count > 1 ? Double(frames.count - 1) / max(clipDuration, 0.001) : 0
    var result: [String: Any] = [
      "durationS": clipDuration,
      "fps": fps,
      "framesProcessed": processed,
      "framesWithPose": frames.filter(\.hasPose).count,
      "segmentS": duration,
      "segmentFrames": segment.count,
      "meanConfidence": posed.isEmpty ? 0 : posed.map(\.confidence).reduce(0, +) / Double(posed.count),
      "frameWidth": Int(frameSize.width),
      "frameHeight": Int(frameSize.height),
      "orientation": orientation.rawValue,
      "ok": false,
    ]
    if let firstVisionError { result["visionError"] = firstVisionError }
    guard duration >= minimumSeconds else {
      result["reason"] = firstVisionError.map { "The pose detector could not run: \($0)" }
        ?? "The runner was in frame for \(String(format: "%.1f", duration)) s at a stretch; it needs at least \(Int(minimumSeconds)) seconds of running. Film from the side, whole body in frame, phone steady."
      return result
    }
    guard !segment.isEmpty, Double(posed.count) / Double(segment.count) >= minimumPoseFraction else {
      result["reason"] = firstVisionError.map { "The pose detector could not run: \($0)" }
        ?? "A runner was found in \(posed.count) of \(frames.count) frames. Film from the side, whole body in frame, phone steady."
      return result
    }
    let torsoLengths = posed.compactMap(\.torso)
    guard torsoLengths.count >= 10 else {
      result["reason"] = "The torso was not visible enough to use as a ruler. Film the whole body from the side."
      return result
    }
    let torso = median(torsoLengths)

    // Vertical bounce: hip height, detrended with a one-second moving mean so
    // slow drift (camera, treadmill incline) does not count as bounce.
    let hipY = posed.map { Double($0.hip!.y) }
    let window = max(3, Int(fps.rounded()))
    let detrended = detrend(hipY, window: window)
    let amplitude = 2 * 2.0.squareRoot() * standardDeviation(detrended)
    result["oscillationPctTorso"] = amplitude / torso * 100

    // Cadence: one bounce per step. Peaks at least 0.25 s apart and at least
    // a fifth of the amplitude tall, counted per second of posed footage.
    let times = posed.map(\.t)
    let peaks = countPeaks(detrended, times: times, minGap: 0.25, minHeight: amplitude * 0.2)
    let posedSpan = (times.last ?? 0) - (times.first ?? 0)
    result["cadenceSpm"] = posedSpan > 0 ? Double(peaks) / posedSpan * 60 : 0

    // Ground contact per foot: the share of frames each ankle spends within
    // 15% of its own vertical range of its lowest position, turned into
    // milliseconds per step with the cadence.
    func contactMs(_ ys: [Double]) -> Double? {
      guard ys.count >= 10 else { return nil }
      let lo = percentile(ys, 10), hi = percentile(ys, 90)
      guard hi > lo else { return nil }
      let threshold = lo + 0.15 * (hi - lo)
      let fraction = Double(ys.filter { $0 <= threshold }.count) / Double(ys.count)
      let stepsPerSecond = (result["cadenceSpm"] as? Double ?? 0) / 60
      guard stepsPerSecond > 0 else { return nil }
      // Each foot is on the ground once per stride (two steps).
      return fraction / (stepsPerSecond / 2) * 1000
    }
    let left = contactMs(posed.compactMap { $0.leftAnkle.map { Double($0.y) } })
    let right = contactMs(posed.compactMap { $0.rightAnkle.map { Double($0.y) } })
    if let left { result["contactLeftMs"] = left }
    if let right { result["contactRightMs"] = right }
    if let left, let right, (left + right) > 0 {
      result["contactAsymmetryPct"] = (left - right) / ((left + right) / 2) * 100
    }
    result["ok"] = true
    return result
  }

  /// The longest run of frames in which a pose was found, allowing gaps
  /// (frames without a pose) shorter than `maxGap` seconds inside it.
  static func longestPosedSegment(_ frames: [Frame], maxGap: Double) -> [Frame] {
    // Ranked by frames WITH a pose, with trailing pose-less frames trimmed
    // before comparing: otherwise a lone detection followed by a minute of
    // nothing outranks a nine-second run.
    func trimmed(_ seg: [Frame]) -> [Frame] {
      var s = seg
      while let last = s.last, !last.hasPose { s.removeLast() }
      return s
    }
    let posedCount = { (seg: [Frame]) in seg.filter(\.hasPose).count }
    var best: [Frame] = []
    var current: [Frame] = []
    var lastPoseT: Double? = nil
    for f in frames {
      if f.hasPose {
        if let last = lastPoseT, f.t - last > maxGap {
          let done = trimmed(current)
          if posedCount(done) > posedCount(best) { best = done }
          current = []
        }
        current.append(f)
        lastPoseT = f.t
      } else if lastPoseT != nil {
        current.append(f)
      }
    }
    let done = trimmed(current)
    if posedCount(done) > posedCount(best) { best = done }
    return best
  }

  static func orientation(for t: CGAffineTransform) -> CGImagePropertyOrientation {
    if t.a == 0 && t.b == 1 && t.c == -1 && t.d == 0 { return .right }
    if t.a == 0 && t.b == -1 && t.c == 1 && t.d == 0 { return .left }
    if t.a == -1 && t.d == -1 { return .down }
    return .up
  }

  static func median(_ x: [Double]) -> Double {
    let s = x.sorted()
    let m = s.count / 2
    return s.count % 2 == 1 ? s[m] : (s[m - 1] + s[m]) / 2
  }

  static func percentile(_ x: [Double], _ p: Double) -> Double {
    let s = x.sorted()
    if s.count == 1 { return s[0] }
    let rank = p / 100 * Double(s.count - 1)
    let lo = Int(rank.rounded(.down)), hi = Int(rank.rounded(.up))
    return lo == hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (rank - Double(lo))
  }

  static func standardDeviation(_ x: [Double]) -> Double {
    guard x.count > 1 else { return 0 }
    let m = x.reduce(0, +) / Double(x.count)
    return (x.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(x.count - 1)).squareRoot()
  }

  static func detrend(_ x: [Double], window: Int) -> [Double] {
    x.indices.map { i in
      let lo = max(0, i - window / 2), hi = min(x.count - 1, i + window / 2)
      let mean = x[lo...hi].reduce(0, +) / Double(hi - lo + 1)
      return x[i] - mean
    }
  }

  static func countPeaks(_ x: [Double], times: [Double], minGap: Double, minHeight: Double) -> Int {
    var count = 0
    var lastPeakT = -Double.infinity
    for i in 1..<max(1, x.count - 1) {
      if x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] >= minHeight && times[i] - lastPeakT >= minGap {
        count += 1
        lastPeakT = times[i]
      }
    }
    return count
  }
}
