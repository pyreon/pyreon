// PyreonUploadAndroid — resolving a picked `content://` URI into an uploadable
// file, for `fileFromUri(uri)` on Android.
//
// The pickers (`useImagePicker` / `useFilePicker` / `useCamera`) hand back a
// `content://` URI: a handle into a ContentProvider, not a path. Its display
// name and size come from the provider (`OpenableColumns`), its type from
// `getType`, and its bytes from `openInputStream` — opened only when the
// request is WRITTEN, so a large video streams straight from the provider
// into the socket instead of being read into memory first.
//
// Kept apart from PyreonHttp.kt, which is deliberately Android-free (it is
// verified alone against stubs and reads `file://` / `data:` itself).

package com.pyreon.runtime

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns

/**
 * A picker / camera URI as an upload. `content://` is read through the app's
 * ContentResolver; every other scheme is [PyreonUploadFiles.from]'s. The
 * compiler passes the composable's `LocalContext.current`.
 */
public fun PyreonUploadFiles.from(context: Context, uri: String, name: String? = null, type: String? = null): PyreonUploadFile {
    if (!uri.startsWith("content:")) return from(uri, name, type)
    val resolver = context.applicationContext.contentResolver
    val parsed = Uri.parse(uri)
    var displayName: String? = null
    var size: Long? = null
    resolver.query(parsed, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (nameColumn >= 0 && !cursor.isNull(nameColumn)) displayName = cursor.getString(nameColumn)
            if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) size = cursor.getLong(sizeColumn)
        }
    } ?: throw PyreonHttpError.UnreadableFile(uri)
    val fileName = name ?: displayName ?: (parsed.lastPathSegment ?: "blob")
    return PyreonUploadFile(fileName, type ?: resolver.getType(parsed) ?: "", size) {
        resolver.openInputStream(parsed) ?: throw PyreonHttpError.UnreadableFile(uri)
    }
}
