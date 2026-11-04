package com.pyreon.runtime

// PyreonNavigation — the runtime half of the `<Tabs>` and `<Split>` canonical
// primitives (`@pyreon/primitives`). Kotlin mirror of PyreonNavigation.swift.
//
// PMTC lowers `<Tabs value onChange>` + its `<Tab>` children to
//
//   PyreonTabs(selected = tab, onSelect = { tab = it }, items = listOf(...)) { pyreonTab ->
//     when (pyreonTab) { "feed" -> { ... } }
//   }
//
// and `<Split sidebar showDetail onBack>detail</Split>` to
//
//   PyreonSplit(showDetail = ..., onBack = { ... }, sidebar = { ... }) { detail }
//
// Both adapt on the WINDOW width with the 600dp breakpoint `useSizeClass()`
// uses (`LocalConfiguration.current.screenWidthDp`), so the hook and the
// layout always agree about which class a window is in.

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.BottomNavigation
import androidx.compose.material.BottomNavigationItem
import androidx.compose.material.Icon
import androidx.compose.material.MaterialTheme
import androidx.compose.material.NavigationRail
import androidx.compose.material.NavigationRailItem
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp

/** The window width at and above which tabs become a rail and a split shows two panes. */
private const val PYREON_WIDE_DP = 600

/**
 * One entry of a [PyreonTabs] bar. [icon] is the Material glyph, already
 * resolved from the canonical `<Icon>` name at compile time; [testTag] is the
 * `<Tab data-testid>` and lands on the bar item. [T] is the selection type —
 * `String`, or the enum PMTC emits for a string-literal union.
 */
data class PyreonTabItem<T>(
    val value: T,
    val label: String,
    val icon: ImageVector? = null,
    val testTag: String? = null,
)

/**
 * `<Tabs>` → Material `BottomNavigation` below 600dp of window width,
 * `NavigationRail` at 600dp and wider.
 *
 * Every visited tab STAYS COMPOSED — the hidden ones in a zero-size,
 * clipped, semantics-cleared box — so a tab's `remember` state, scroll
 * position and anything else it holds survive switching away and back. A
 * `when (selected)` would recompose each tab from scratch on every switch,
 * which is what SwiftUI's `TabView` and the web runtime both avoid. The panel
 * box is at the SAME composition position in both layouts (the rail and the
 * bar are separate conditional groups around it), so rotating the device
 * does not reset the tabs either.
 */
@Composable
fun <T> PyreonTabs(
    selected: T,
    onSelect: (T) -> Unit,
    items: List<PyreonTabItem<T>>,
    modifier: Modifier = Modifier,
    content: @Composable (T) -> Unit,
) {
    val wide = LocalConfiguration.current.screenWidthDp >= PYREON_WIDE_DP
    // A plain (non-observable) set: a selection change already recomposes this
    // function, so recording the visit here is seen in the same pass — and
    // writing Compose STATE during composition would schedule a needless
    // second one.
    val visited = remember { mutableSetOf<T>() }
    visited.add(selected)

    Row(modifier = modifier.fillMaxSize()) {
        if (wide) {
            NavigationRail {
                items.forEach { item ->
                    NavigationRailItem(
                        selected = item.value == selected,
                        onClick = { if (item.value != selected) onSelect(item.value) },
                        icon = { PyreonTabIcon(item) },
                        label = { Text(item.label) },
                        modifier = if (item.testTag != null) Modifier.testTag(item.testTag) else Modifier,
                    )
                }
            }
        }
        Column(modifier = Modifier.weight(1f).fillMaxHeight()) {
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                items.forEach { item ->
                    if (item.value in visited) {
                        key(item.value) {
                            val shown = item.value == selected
                            Box(
                                modifier = if (shown) {
                                    Modifier.fillMaxSize()
                                } else {
                                    Modifier.size(0.dp).clipToBounds().clearAndSetSemantics {}
                                },
                            ) {
                                content(item.value)
                            }
                        }
                    }
                }
            }
            if (!wide) {
                BottomNavigation {
                    items.forEach { item ->
                        BottomNavigationItem(
                            selected = item.value == selected,
                            onClick = { if (item.value != selected) onSelect(item.value) },
                            icon = { PyreonTabIcon(item) },
                            label = { Text(item.label) },
                            modifier = if (item.testTag != null) Modifier.testTag(item.testTag) else Modifier,
                        )
                    }
                }
            }
        }
    }
}

/** The item's glyph, or nothing — both Material items require an icon slot. */
@Composable
private fun PyreonTabIcon(item: PyreonTabItem<*>) {
    val icon = item.icon ?: return
    Icon(imageVector = icon, contentDescription = null)
}

/**
 * `<Split>` → two panes at 600dp of window width and wider; below it ONE pane
 * — the sidebar, or the detail while [showDetail] — with the system back
 * gesture calling [onBack] from the detail.
 *
 * Both panes stay COMPOSED in every layout (the hidden one in a zero-size,
 * clipped, semantics-cleared box), so the list keeps its scroll position and
 * state across a detail visit on a phone and across a rotation — the same
 * contract as the web runtime.
 */
@Composable
fun PyreonSplit(
    showDetail: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    sidebar: @Composable () -> Unit,
    detail: @Composable () -> Unit,
) {
    val wide = LocalConfiguration.current.screenWidthDp >= PYREON_WIDE_DP
    BackHandler(enabled = !wide && showDetail) { onBack() }
    Row(modifier = modifier.fillMaxSize()) {
        val sidebarShown = wide || !showDetail
        Box(
            modifier = when {
                wide -> Modifier.width(320.dp).fillMaxHeight()
                sidebarShown -> Modifier.weight(1f).fillMaxHeight()
                else -> Modifier.size(0.dp).clipToBounds().clearAndSetSemantics {}
            },
        ) {
            sidebar()
        }
        if (wide) {
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .fillMaxHeight()
                    .background(MaterialTheme.colors.onSurface.copy(alpha = 0.12f)),
            )
        }
        val detailShown = wide || showDetail
        Box(
            modifier = if (detailShown) {
                Modifier.weight(1f).fillMaxHeight()
            } else {
                Modifier.size(0.dp).clipToBounds().clearAndSetSemantics {}
            },
        ) {
            detail()
        }
    }
}
