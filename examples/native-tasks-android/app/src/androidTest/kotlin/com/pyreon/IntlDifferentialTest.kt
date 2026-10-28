// IntlDifferentialTest — the Android half of the `Intl` differential (#3980).
//
// `PyreonDateTimeFormat` / `PyreonNumberFormat` are `android.icu`, which exists
// only on a device, so the table generated from the compiler's
// `intl-cases.ts` (`IntlDifferentialCases.kt`, expected strings from Node's V8)
// runs HERE, against the emulator's own ICU. The iOS half runs in
// `intl-differential.test.ts` on a Mac.
//
// STABLE cases must match the web exactly. The SWEEP differs from V8 only by
// CLDR data (each Android release ships its own ICU), so it is reported with a
// tripwire sized to catch a broken LOWERING (a lost skeleton, a lost rounding
// mode), not the data gap.

package com.pyreon

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class IntlDifferentialTest {
    private val tag = "PyreonIntlDiff"

    @Test
    fun stableCasesMatchTheWebExactly() {
        val stable = INTL_CASES.filter { it.stable }
        assertTrue("the generated table is empty", stable.size > 20)
        val off = stable.mapNotNull { c ->
            val native = c.native()
            if (native == c.web) null else "${c.id}: native ${'"'}$native${'"'} / web ${'"'}${c.web}${'"'}"
        }
        off.forEach { Log.e(tag, it) }
        assertEquals("STABLE Intl cases that differ from the web:\n" + off.joinToString("\n"), emptyList<String>(), off)
    }

    @Test
    fun theSweepDiffersOnlyByCldrData() {
        val sweep = INTL_CASES.filter { !it.stable }
        val dates = sweep.filter { it.kind == "datetime" }
        val numbers = sweep.filter { it.kind == "number" }
        fun differing(cs: List<IntlCase>) = cs.filter { it.native() != it.web }
        val dateOff = differing(dates)
        val numberOff = differing(numbers)
        Log.i(tag, "Android vs V8: dates ${dateOff.size}/${dates.size} differ, numbers ${numberOff.size}/${numbers.size} differ")
        (dateOff + numberOff).take(40).forEach { Log.i(tag, "  ${it.id}: native '${it.native()}' / web '${it.web}'") }
        assertTrue("date sweep: ${dateOff.size}/${dates.size} differ", dateOff.size.toDouble() / dates.size < 0.45)
        assertTrue("number sweep: ${numberOff.size}/${numbers.size} differ", numberOff.size.toDouble() / numbers.size < 0.12)
    }
}
