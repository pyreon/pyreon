import { FileUpload, Title } from '@pyreon/ui-components'
import type { FileUploadState } from '@pyreon/ui-primitives'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileUploadDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">File Upload</Title>

      <FileUpload
        multiple
        maxFiles={5}
        maxSize={10 * 1024 * 1024}
        accept={['image/*', '.pdf']}
        onChange={(files: File[]) => console.log('Files:', files)}
      >
        {(state: FileUploadState) => (
          <div style="max-width: 400px;">
            {/*
              `dropZoneProps` is a plain OBJECT, not a getter — spread it with NO
              call parens. It carries the primitive's ARIA/handlers AND the
              FileUpload component's rocketstyle class (the dashed zone: border,
              radius, padding, bg, hover). radius/padding/text-align/cursor/
              transition now come from the theme; the border + background COLOURS
              stay inline because they are state-driven (isDragging) — the theme
              has only the static ones.
            */}
            <div
              {...state.dropZoneProps}
              onClick={() => state.openPicker()}
              style={() => `border: 2px dashed ${state.isDragging() ? '#3b82f6' : '#d1d5db'}; background: ${state.isDragging() ? '#eff6ff' : '#f9fafb'};`}
            >
              <div style="font-size: 32px; margin-bottom: 8px;">📁</div>
              <p style="font-size: 14px; color: #374151; font-weight: 500;">
                Drop files here or click to browse
              </p>
              <p style="font-size: 12px; color: #9ca3af; margin-top: 4px;">
                Images and PDFs, up to 10 MB each, max 5 files
              </p>
            </div>

            <input ref={state.inputRef} {...state.inputProps} />

            {() => state.files().length > 0 ? (
              <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                {state.files().map((file, i) => (
                  <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f3f4f6; border-radius: 8px; font-size: 13px;">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px;">
                      {file.name}
                    </span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="color: #6b7280;">{formatSize(file.size)}</span>
                      <button
                        onClick={() => state.removeFile(i)}
                        style="border: none; background: none; cursor: pointer; color: #ef4444; font-size: 16px; padding: 0;"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => state.clear()}
                  style="align-self: flex-start; border: none; background: none; cursor: pointer; color: #6b7280; font-size: 13px; padding: 4px 0;"
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>
        )}
      </FileUpload>
    </div>
  )
}
