package com.pyreon.runtime

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import kotlinx.serialization.Serializable

/**
 * One choice of a `<Select>` — `SelectOption` from `@pyreon/primitives`.
 *
 * `disabled` is NULLABLE, mirroring `disabled?: boolean`: an emitted literal that
 * leaves it out constructs the type directly, and `null` reads as enabled.
 */
@Serializable
data class PyreonSelectOption(
    var value: String,
    var label: String,
    var disabled: Boolean? = null,
)

/** The name `@pyreon/primitives` exports, so `signal<SelectOption[]>(…)` emits a type that exists. */
typealias SelectOption = PyreonSelectOption

/**
 * `<Select value options onChange placeholder? enabled?>` — a Material 3
 * `ExposedDropdownMenuBox`: a read-only field showing the selected option's
 * label, which opens a menu of the options.
 *
 * Matches the web `<select>` the same source renders:
 * - A value no option has (`""` included) selects nothing; the field then shows
 *   the placeholder (empty without one), which is not itself a menu item, as the
 *   web's disabled `<option value="">` cannot be chosen.
 * - A disabled option is listed but not selectable.
 * - Choosing an option calls `onChange` with its value; the field shows whatever
 *   `value` the caller passes back, so a handler that rejects the choice wins.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PyreonSelect(
    value: String,
    options: List<PyreonSelectOption>,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    enabled: Boolean = true,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = options.firstOrNull { it.value == value }
    ExposedDropdownMenuBox(
        expanded = expanded && enabled,
        onExpandedChange = { if (enabled) expanded = it },
        modifier = modifier,
    ) {
        OutlinedTextField(
            value = selected?.label ?: "",
            onValueChange = {},
            readOnly = true,
            enabled = enabled,
            singleLine = true,
            placeholder = if (placeholder != null) ({ Text(placeholder) }) else null,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable, enabled)
                .fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = expanded && enabled, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    onClick = {
                        expanded = false
                        onChange(option.value)
                    },
                    enabled = option.disabled != true,
                )
            }
        }
    }
}
