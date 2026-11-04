package com.pyreon.runtime

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.chrono.IsoChronology
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.format.FormatStyle
import java.util.Locale

/**
 * `<Field kind="date" | "time" | "datetime" value onChangeText min max placeholder>`
 * — a read-only field showing the value in the device's own format, which opens
 * Material 3's date picker, time picker, or both in turn.
 *
 * The VALUE is the web's wall-clock string ([PyreonDateValue]). `min` / `max`
 * bound the selectable days in the date picker; a TIME bound is applied when the
 * choice is confirmed (Material's time picker cannot disable hours), so an
 * out-of-range time is clamped to the bound — where iOS's `DatePicker` stops the
 * wheel there. With no value the field shows the placeholder, or the locale's
 * short pattern (`M/d/yy`) as a browser shows its format hint; the clear button
 * returns to `""`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PyreonDateField(
    value: String,
    onValueChange: (String) -> Unit,
    kind: PyreonDateFieldKind,
    modifier: Modifier = Modifier,
    min: String? = null,
    max: String? = null,
    placeholder: String? = null,
    enabled: Boolean = true,
) {
    val locale = Locale.getDefault()
    val context = LocalContext.current
    val is24Hour = android.text.format.DateFormat.is24HourFormat(context)
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }
    // The day chosen in step one of a `datetime`, held until the time is confirmed.
    var pendingDay by remember { mutableStateOf<LocalDate?>(null) }

    val parsedDate: LocalDate? = when (kind) {
        PyreonDateFieldKind.Date -> PyreonDateValue.parseDate(value)
        PyreonDateFieldKind.DateTime -> PyreonDateValue.parseDateTime(value)?.toLocalDate()
        PyreonDateFieldKind.Time -> null
    }
    val parsedTime: LocalTime? = when (kind) {
        PyreonDateFieldKind.Time -> PyreonDateValue.parseTime(value)
        PyreonDateFieldKind.DateTime -> PyreonDateValue.parseDateTime(value)?.toLocalTime()
        PyreonDateFieldKind.Date -> null
    }

    val display = when (kind) {
        PyreonDateFieldKind.Date -> parsedDate?.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale))
        PyreonDateFieldKind.Time -> parsedTime?.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))
        PyreonDateFieldKind.DateTime -> PyreonDateValue.parseDateTime(value)
            ?.format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale))
    } ?: ""
    val hint = placeholder ?: DateTimeFormatterBuilder.getLocalizedDateTimePattern(
        if (kind == PyreonDateFieldKind.Time) null else FormatStyle.SHORT,
        if (kind == PyreonDateFieldKind.Date) null else FormatStyle.SHORT,
        IsoChronology.INSTANCE,
        locale,
    )

    // The date bounds in the picker's own UTC-midnight milliseconds.
    val dateOf = { s: String? ->
        when {
            s == null -> null
            kind == PyreonDateFieldKind.Date -> PyreonDateValue.parseDate(s)
            kind == PyreonDateFieldKind.DateTime -> PyreonDateValue.parseDateTime(s)?.toLocalDate()
            else -> null
        }
    }
    val minDay = dateOf(min)
    val maxDay = dateOf(max)

    Row(modifier = modifier) {
        Box(modifier = Modifier.weight(1f)) {
            OutlinedTextField(
                value = display,
                onValueChange = {},
                readOnly = true,
                enabled = enabled,
                singleLine = true,
                placeholder = { Text(hint) },
                modifier = Modifier.fillMaxWidth(),
            )
            // A read-only text field does not report taps reliably; the overlay
            // is the control's one tap target.
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .clickable(enabled = enabled) {
                        if (kind == PyreonDateFieldKind.Time) showTime = true else showDate = true
                    },
            )
        }
        if (value.isNotEmpty() && enabled) {
            IconButton(onClick = { onValueChange("") }) {
                Icon(Icons.Filled.Clear, contentDescription = "Clear")
            }
        }
    }

    if (showDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = (parsedDate ?: LocalDate.now().let { today ->
                when {
                    minDay != null && today < minDay -> minDay
                    maxDay != null && today > maxDay -> maxDay
                    else -> today
                }
            }).let(PyreonDateValue::dayToPickerMillis),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                    val day = PyreonDateValue.pickerMillisToDay(utcTimeMillis)
                    return (minDay == null || day >= minDay) && (maxDay == null || day <= maxDay)
                }

                override fun isSelectableYear(year: Int): Boolean =
                    (minDay == null || year >= minDay.year) && (maxDay == null || year <= maxDay.year)
            },
        )
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(onClick = {
                    showDate = false
                    val millis = state.selectedDateMillis
                    if (millis != null) {
                        val day = PyreonDateValue.pickerMillisToDay(millis)
                        if (kind == PyreonDateFieldKind.Date) {
                            onValueChange(PyreonDateValue.clamp(PyreonDateValue.format(day), kind, min, max))
                        } else {
                            pendingDay = day
                            showTime = true
                        }
                    }
                }) { Text(stringResource(android.R.string.ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showDate = false }) { Text(stringResource(android.R.string.cancel)) }
            },
        ) {
            DatePicker(state = state)
        }
    }

    if (showTime) {
        val start = parsedTime ?: LocalTime.now()
        val state = rememberTimePickerState(initialHour = start.hour, initialMinute = start.minute, is24Hour = is24Hour)
        AlertDialog(
            onDismissRequest = {
                showTime = false
                pendingDay = null
            },
            confirmButton = {
                TextButton(onClick = {
                    showTime = false
                    val time = LocalTime.of(state.hour, state.minute)
                    val next = if (kind == PyreonDateFieldKind.Time) {
                        PyreonDateValue.format(time)
                    } else {
                        PyreonDateValue.format(LocalDateTime.of(pendingDay ?: parsedDate ?: LocalDate.now(), time))
                    }
                    pendingDay = null
                    onValueChange(PyreonDateValue.clamp(next, kind, min, max))
                }) { Text(stringResource(android.R.string.ok)) }
            },
            dismissButton = {
                TextButton(onClick = {
                    showTime = false
                    pendingDay = null
                }) { Text(stringResource(android.R.string.cancel)) }
            },
            text = { TimePicker(state = state) },
        )
    }
}
