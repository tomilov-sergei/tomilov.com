#!/usr/bin/env swift
// Export the original portrait with a circular alpha mask. No generated pixels.
// Usage: swift tools/generate-browser-icons.swift [preview-directory]
import AppKit
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let preview = CommandLine.arguments.count > 1
    ? URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    : root.appendingPathComponent("output/browser-icons", isDirectory: true)
try FileManager.default.createDirectory(at: preview, withIntermediateDirectories: true)

let sourceURL = root.appendingPathComponent("assets/og.png")
guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let portrait = CGImageSourceCreateImageAtIndex(source, 0, nil),
      let crop = portrait.cropping(to: CGRect(x: 80, y: 0, width: 630, height: 630)) else {
    fatalError("Cannot read the original portrait")
}
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

func context(_ width: Int, _ height: Int) -> CGContext {
    CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
              bytesPerRow: width * 4, space: colorSpace,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}

func icon(_ size: Int) -> CGImage {
    // Render the mask at 4x before downsampling for a smooth circular edge.
    let high = size * 4
    let canvas = context(high, high)
    let inset = CGFloat(high) * 0.03
    let bounds = CGRect(x: inset, y: inset, width: CGFloat(high) - 2 * inset,
                        height: CGFloat(high) - 2 * inset)
    canvas.addEllipse(in: bounds)
    canvas.clip()
    canvas.interpolationQuality = .high
    canvas.draw(crop, in: bounds)
    let result = context(size, size)
    result.interpolationQuality = .high
    result.draw(canvas.makeImage()!, in: CGRect(x: 0, y: 0, width: size, height: size))
    return result.makeImage()!
}

func save(_ image: CGImage, _ url: URL) throws {
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        fatalError("Cannot create PNG: \(url.path)")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("Cannot save PNG") }
    print("\(image.width)x\(image.height) \(url.path)")
}

for (size, path) in [(180, "apple-touch-icon.png"),
                     (192, "assets/favicon-192.png"),
                     (512, "assets/favicon-512.png")] {
    try save(icon(size), root.appendingPathComponent(path))
}
try save(icon(1024), preview.appendingPathComponent("avatar-master.png"))

// Preview on light and dark browser surfaces, plus the size shown in Favorites.
let sheet = context(840, 360)
sheet.setFillColor(NSColor(calibratedWhite: 0.94, alpha: 1).cgColor)
sheet.fill(CGRect(x: 0, y: 0, width: 840, height: 360))
let panels: [(CGFloat, CGFloat)] = [(16, 1), (296, 0.12), (576, 0.78)]
let graphics = NSGraphicsContext(cgContext: sheet, flipped: false)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = graphics
for (x, white) in panels {
    let panel = CGRect(x: x, y: 16, width: 248, height: 328)
    sheet.setFillColor(NSColor(calibratedWhite: white, alpha: 1).cgColor)
    sheet.fill(panel)
    let textColor = NSColor(calibratedWhite: white < 0.5 ? 0.9 : 0.18, alpha: 1)
    let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 15), .foregroundColor: textColor]
    let large = x < 576
    let size = large ? 180 : 84
    let imageRect = CGRect(x: x + (248 - CGFloat(size)) / 2, y: large ? 107.0 : 155.0,
                           width: CGFloat(size), height: CGFloat(size))
    sheet.draw(icon(size), in: imageRect)
    let label = large ? "На светлом фоне" : "Избранное Safari · 84 px"
    let title = x == 296 ? "На тёмном фоне" : label
    let titleSize = (title as NSString).size(withAttributes: attributes)
    (title as NSString).draw(at: CGPoint(x: x + (248 - titleSize.width) / 2, y: 43), withAttributes: attributes)
}
NSGraphicsContext.restoreGraphicsState()
try save(sheet.makeImage()!, preview.appendingPathComponent("avatar-preview.png"))
