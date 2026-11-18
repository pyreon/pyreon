// RouterFeaturesUITests — the router features no page used before (NAV-1): a
// nested layout route, a static redirect to a nested route, the wildcard 404,
// `replace` through useRouter(), and a global afterEach hook. The Android twin
// is `RouterFeaturesInstrumentedTest.kt`; the pages are the Mail* components in
// `src/RouterApp.tsx`. Every page is reached by a warm deep link.

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

final class RouterFeaturesUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
    }

    override func tearDownWithError() throws {
        app.terminate()
    }

    private func open(_ link: String) throws {
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://\(link)")))
    }

    private func page(_ id: String) -> XCUIElement { app.otherElements[id].firstMatch }

    private func navCount() -> Int {
        let label = app.staticTexts["mail-nav-count"].firstMatch.label
        return Int(label.replacingOccurrences(of: "Navigations: ", with: "")) ?? -1
    }

    // A child route renders INSIDE its layout, and afterEach runs once per committed navigation.
    func test_nestedLayoutWrapsItsChildAndAfterEachCountsNavigations() throws {
        try open("mail/inbox")
        XCTAssertTrue(page("mail-inbox").waitToExist(timeout: 20), "the inbox did not open")
        XCTAssertTrue(page("mail-shell").exists, "the inbox rendered without its layout")
        let before = navCount()
        XCTAssertGreaterThanOrEqual(before, 1, "afterEach never ran for the deep-link navigation")

        app.buttons["Open sent"].firstMatch.tap()
        XCTAssertTrue(page("mail-sent").waitToExist(timeout: 10), "the sent child did not open")
        XCTAssertTrue(page("mail-shell").exists, "the sent child rendered without its layout")
        XCTAssertEqual(navCount(), before + 1, "afterEach did not run exactly once for one navigation")
    }

    // Before the fix a router with any nested route dropped every redirect, and the path fell through to the 404.
    func test_redirectRendersItsNestedTarget() throws {
        try open("old-inbox")
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline && !page("mail-inbox").exists && !page("not-found-page").exists {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTAssertFalse(page("not-found-page").exists, "/old-inbox rendered the 404 page — the redirect was dropped")
        XCTAssertTrue(page("mail-inbox").exists, "/old-inbox did not render the inbox")
        XCTAssertTrue(page("mail-shell").exists, "/old-inbox rendered the inbox without its layout")
    }

    func test_unknownPathRendersTheWildcardPage() throws {
        try open("no/such/page")
        XCTAssertTrue(page("not-found-page").waitToExist(timeout: 20), "an unknown path did not render the wildcard page")
        XCTAssertTrue(app.staticTexts["No page at this address"].exists)
    }

    // home → inbox, replace with sent, back → HOME. A push in its place would leave the inbox under sent.
    func test_replaceSwapsTheEntrySoBackSkipsIt() throws {
        try open("mail/inbox")
        XCTAssertTrue(page("mail-inbox").waitToExist(timeout: 20), "the inbox did not open")
        app.buttons["Replace with sent"].firstMatch.tap()
        XCTAssertTrue(page("mail-sent").waitToExist(timeout: 10), "replace did not show the sent page")
        app.buttons["Go back"].firstMatch.tap()
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline && !page("home-page").isHittable && !page("mail-inbox").exists {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTAssertFalse(page("mail-inbox").exists, "Back after replace landed on the inbox — replace pushed instead of swapping")
        XCTAssertTrue(page("home-page").exists, "Back after replace did not return home")
    }
}
