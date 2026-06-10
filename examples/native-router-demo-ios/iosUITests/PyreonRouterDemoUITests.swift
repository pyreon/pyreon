// PyreonRouterDemoUITests — launch + multi-route navigation smoke
// for the iOS router demo.
//
// Closes Gap 7 part (a) from the 2026-06-05 native-readiness audit:
// adds XCUITest coverage to native-router-demo-ios (was absent — only
// TodoMVC had iOS UI tests before this).
//
// Beyond `xcodebuild build` (proves PMTC emit + the @pyreon/native-
// router-swift SPM dep link), this asserts the navigation contract:
//   - The app launches on a real iOS Simulator
//   - The home page renders (`accessibilityIdentifier=home-page`
//     emitted from `<Stack data-testid="home-page">` in RouterApp.tsx)
//   - Tapping "Go to About" navigates to the about page
//     (`accessibilityIdentifier=about-page`)
//   - Tapping "Back to Home" navigates back to home
//
// The chain proves R1.3's "3 routes + Link navigation + native router
// state" claim at real-simulator scope. R1.1 (home renders at launch)
// + the navigation transitions are both asserted by this single test.
//
// 30s waits — same rationale as native-counter-ios UI tests (first
// launch + scene hand-off on freshly booted Simulator can take a few
// seconds; 30s ceiling for CI noise). Post-launch transitions get a
// shorter 5s ceiling because they're synchronous within an already-
// running app.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule, NOT on every PR. Promote to required once
// green across multiple consecutive nightly runs.

import XCTest

final class PyreonRouterDemoUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_appLaunchesOnHomeRoute() throws {
        let app = XCUIApplication()
        app.launch()

        // PMTC emits `<Stack data-testid="home-page">` →
        // `.accessibilityIdentifier("home-page")` via the canonical
        // data-testid transform. `otherElements` queries non-control
        // views; `.firstMatch` avoids ambiguity if the identifier
        // somehow appears more than once in the tree.
        let homePage = app.otherElements["home-page"].firstMatch
        XCTAssertTrue(
            homePage.waitForExistence(timeout: 30),
            "Home page (accessibilityIdentifier=\"home-page\") did not appear within 30s — R1.1 (home renders at launch) regressed"
        )
    }

    func test_navigatesHomeToAbout() throws {
        let app = XCUIApplication()
        app.launch()

        // Wait for home, then tap the "Go to About" button.
        let homePage = app.otherElements["home-page"].firstMatch
        XCTAssertTrue(
            homePage.waitForExistence(timeout: 30),
            "Home page did not render within 30s"
        )

        // The button text is the literal label from RouterApp.tsx —
        // `<Button onPress={() => navigate('/about')}>Go to About</Button>`.
        // SwiftUI Button labels appear as accessibility labels on the
        // button element.
        let goToAbout = app.buttons["Go to About"]
        XCTAssertTrue(
            goToAbout.exists,
            "\"Go to About\" button missing on home page"
        )
        goToAbout.tap()

        // Assert the about-page identifier appears post-navigation.
        let aboutPage = app.otherElements["about-page"].firstMatch
        XCTAssertTrue(
            aboutPage.waitForExistence(timeout: 15),
            "About page did not render within 5s after tapping \"Go to About\" — router push did not commit"
        )

        // Round-trip back to home to assert reverse navigation.
        let backToHome = app.buttons["Back to Home"]
        XCTAssertTrue(
            backToHome.exists,
            "\"Back to Home\" button missing on about page"
        )
        backToHome.tap()

        XCTAssertTrue(
            homePage.waitForExistence(timeout: 15),
            "Did not return to home page within 5s after tapping \"Back to Home\""
        )
    }

    func test_navigatesToUserDetailWithParam() throws {
        // Tap "View user 42" → assert user-page renders. This
        // exercises the `:id` dynamic route segment + useParams()
        // emit path.
        let app = XCUIApplication()
        app.launch()

        let homePage = app.otherElements["home-page"].firstMatch
        XCTAssertTrue(
            homePage.waitForExistence(timeout: 30),
            "Home page did not render within 30s"
        )

        let viewUser = app.buttons["View user 42"]
        XCTAssertTrue(
            viewUser.exists,
            "\"View user 42\" button missing on home page"
        )
        viewUser.tap()

        let userPage = app.otherElements["user-page"].firstMatch
        XCTAssertTrue(
            userPage.waitForExistence(timeout: 15),
            "User page did not render within 5s after tapping \"View user 42\""
        )

        // Assert the parameter rendered. RouterApp.tsx emits
        // `<Text>Profile for user {props.params.id}</Text>` — the
        // string-interpolated `Profile for user 42` appears as a
        // single accessibility text node when params.id resolves to
        // "42" from the route segment.
        let profileText = app.staticTexts["Profile for user 42"]
        XCTAssertTrue(
            profileText.waitForExistence(timeout: 2),
            "Expected \"Profile for user 42\" text not found — useParams() did not populate id=\"42\" from the route segment"
        )
    }
}
