// PyreonPermissionsLocal — the CompositionLocal that carries a
// `<PermissionsProvider>`'s grants to every `usePermissions()` below it.
// Kotlin mirror of PyreonPermissionsEnvironment.swift.
//
// Compiler emit:
//   <PermissionsProvider permissions={['posts.read']}>…</PermissionsProvider>
//   ↓
//   CompositionLocalProvider(LocalPyreonPermissions provides PyreonPermissions(setOf("posts.read"))) { … }
//
//   const can = usePermissions()
//   ↓
//   val can = LocalPyreonPermissions.current
//
// This used to be emitted INLINE — as a `private val` — into each generated
// file that needed it. Being file-private, every file had its OWN local, so a
// provider in the app's root file and a reader on a page in another file named
// two different locals: the reader always saw the empty default and silently
// DENIED everything the provider granted. A file that only provided (nothing in
// it read) did not get the declaration at all and failed to compile
// (`unresolved reference 'LocalPyreonPermissions'`). One app-wide local, here,
// fixes both.
//
// An unprovided local is an EMPTY set — a deny, the safe default for an
// authorization check. It is a DISTINGUISHED empty set (`unprovided()`): the
// first check against it prints a once-per-process warning naming the missing
// provider.
//
// The validation stubs carry a byte-for-byte copy
// (`@pyreon/native-compiler` kotlin-stubs.ts); `runtime-stub-parity.test.ts`
// fails the moment the two disagree.

package com.pyreon.runtime

import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf

// MARK: stub-mirror

val LocalPyreonPermissions: ProvidableCompositionLocal<PyreonPermissions> = compositionLocalOf { PyreonPermissions.unprovided() }
