// MapViewUITests — `<MapView map={map}>` on iOS (MAP-2): a SwiftUI `Map`
// (MapKit, no key) bound to a `useMap()` state. The page is
// `src/MapPage.tsx`. Android has no renderer yet (MAP-3).
//
// Proven through the accessibility tree: the map renders with one pin per
// marker in the state (titled), selecting from code selects on the map's
// binding (`Selected: castle`), and tapping a pin on the map writes the state
// (`Selected: old-town`) — the binding is two-way.

import XCTest

private extension XCUIElement {
    /// `waitForExistence(timeout:)` without its one-second first poll (see
    /// `PyreonRouterDemoUITests.swift`).
    func waitToExist(timeout: TimeInterval) -> Bool {
        if exists { return true }
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            if exists { return true }
        }
        return false
    }
}

final class MapViewUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func waitForLabel(_ app: XCUIApplication, _ id: String, _ want: String) -> Bool {
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline {
            if app.staticTexts[id].firstMatch.label == want { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        return false
    }

    func test_mapViewRendersTheStateAndBindsSelectionBothWays() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://map")))
        XCTAssertTrue(app.otherElements["map-page"].firstMatch.waitToExist(timeout: 20), "the map page did not open")
        XCTAssertTrue(waitForLabel(app, "map-count", "Markers: 2"), "the state did not hold the two markers")

        let map = app.descendants(matching: .any).matching(identifier: "map-view").firstMatch
        XCTAssertTrue(map.waitToExist(timeout: 15), "the MapView did not render")

        // One pin per marker, titled. The titles are ones no map point of interest carries: MapKit labels real places
        // ("Prague Castle") on its own, and a label it draws would satisfy this without any pin.
        // A Marker is an annotation view the accessibility tree lists BESIDE the map, not inside it; the exact label is
        // the pin itself (MapKit's own point feature for it reads "<title>, <title>").
        let castle = app.otherElements.matching(NSPredicate(format: "label == 'Pyreon pin Castle'")).firstMatch
        let oldTown = app.otherElements.matching(NSPredicate(format: "label == 'Pyreon pin Old Town'")).firstMatch
        XCTAssertTrue(castle.waitToExist(timeout: 20), "no 'Pyreon pin Castle' pin on the map:\n\(app.debugDescription)")
        XCTAssertTrue(oldTown.exists, "no 'Pyreon pin Old Town' pin on the map")

        // State → map: selecting from code is reflected (and read back) through the binding.
        app.buttons["map-select-castle"].tap()
        XCTAssertTrue(waitForLabel(app, "map-selected", "Selected: castle"), "selecting from code did not take")

        // Map → state: tapping a pin selects it in the state.
        oldTown.tap()
        XCTAssertTrue(
            waitForLabel(app, "map-selected", "Selected: old-town"),
            "tapping the Old Town pin did not select it (\(app.staticTexts["map-selected"].firstMatch.label))")
        app.terminate()
    }
}
