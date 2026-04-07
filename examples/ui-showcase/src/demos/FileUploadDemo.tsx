import { signal } from '@pyreon/reactivity'
import { FileUpload } from '@pyreon/ui-components'

export function FileUploadDemo() {
  const uploadedFiles = signal<File[]>([])

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">FileUpload</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Drag-and-drop file upload with accepted types, file list, and size limits.
      </p>

      {/* Basic drop zone */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Drop Zone</h3>
      <div style="max-width: 500px; margin-bottom: 32px;">
        <FileUpload
          multiple
          onChange={(files: File[]) => uploadedFiles.set(files)}
        >
          {(state: any) => (
            <div>
              <div
                {...state.dropZoneProps}
                style={`border: 2px dashed ${state.isDragging() ? '#3b82f6' : '#d1d5db'}; border-radius: 12px; padding: 40px 20px; text-align: center; cursor: pointer; transition: border-color 0.2s; background: ${state.isDragging() ? '#eff6ff' : '#fafafa'};`}
                onClick={() => state.openPicker()}
              >
                <p style="font-size: 16px; font-weight: 500; margin-bottom: 4px;">
                  {() => state.isDragging() ? 'Drop files here' : 'Click or drag files to upload'}
                </p>
                <p style="color: #6b7280; font-size: 14px;">Any file type accepted</p>
              </div>
              <input
                type="file"
                multiple
                ref={state.inputRef}
                style="display: none;"
                onChange={(e: Event) => {
                  const input = e.target as HTMLInputElement
                  if (input.files) uploadedFiles.set(Array.from(input.files))
                }}
              />
              {/* File list */}
              {() => {
                const files = state.files()
                return files.length > 0 ? (
                  <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                    {files.map((file: File, i: number) => (
                      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f9fafb; border-radius: 8px; font-size: 14px;">
                        <div>
                          <span style="font-weight: 500;">{file.name}</span>
                          <span style="color: #6b7280; margin-left: 8px;">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <button
                          onClick={() => state.removeFile(i)}
                          style="border: none; background: none; color: #ef4444; cursor: pointer; font-size: 16px;"
                        >
                          x
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => state.clear()}
                      style="align-self: flex-start; font-size: 13px; color: #6b7280; border: none; background: none; cursor: pointer; text-decoration: underline;"
                    >
                      Clear all
                    </button>
                  </div>
                ) : null
              }}
            </div>
          )}
        </FileUpload>
      </div>

      {/* With accepted types */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Images Only</h3>
      <div style="max-width: 500px; margin-bottom: 32px;">
        <FileUpload
          accept={['image/*']}
          multiple
          maxFiles={5}
          maxSize={5 * 1024 * 1024}
        >
          {(state: any) => (
            <div>
              <div
                {...state.dropZoneProps}
                style={`border: 2px dashed ${state.isDragging() ? '#10b981' : '#d1d5db'}; border-radius: 12px; padding: 32px 20px; text-align: center; cursor: pointer; background: ${state.isDragging() ? '#ecfdf5' : '#fafafa'};`}
                onClick={() => state.openPicker()}
              >
                <p style="font-size: 16px; font-weight: 500; margin-bottom: 4px;">Upload Images</p>
                <p style="color: #6b7280; font-size: 13px;">PNG, JPG, GIF up to 5MB. Max 5 files.</p>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                ref={state.inputRef}
                style="display: none;"
              />
              {() => {
                const files = state.files()
                return files.length > 0 ? (
                  <div style="margin-top: 12px;">
                    <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">{files.length} file(s) selected</p>
                    {files.map((file: File, i: number) => (
                      <div style="display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 14px;">
                        <span style="color: #10b981;">IMG</span>
                        <span>{file.name}</span>
                        <button onClick={() => state.removeFile(i)} style="border: none; background: none; color: #ef4444; cursor: pointer; margin-left: auto;">x</button>
                      </div>
                    ))}
                  </div>
                ) : null
              }}
            </div>
          )}
        </FileUpload>
      </div>

      {/* Single file */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Single File (PDF)</h3>
      <div style="max-width: 500px; margin-bottom: 32px;">
        <FileUpload
          accept={['.pdf']}
          maxFiles={1}
        >
          {(state: any) => (
            <div>
              <div
                {...state.dropZoneProps}
                style={`border: 2px dashed #d1d5db; border-radius: 12px; padding: 24px 20px; text-align: center; cursor: pointer; background: #fafafa;`}
                onClick={() => state.openPicker()}
              >
                <p style="font-weight: 500;">Upload PDF document</p>
                <p style="color: #6b7280; font-size: 13px;">.pdf files only</p>
              </div>
              <input
                type="file"
                accept=".pdf"
                ref={state.inputRef}
                style="display: none;"
              />
              {() => {
                const files = state.files()
                return files.length > 0 ? (
                  <div style="margin-top: 8px; padding: 8px 12px; background: #fef3c7; border-radius: 8px; font-size: 14px; display: flex; justify-content: space-between; align-items: center;">
                    <span>{files[0].name}</span>
                    <button onClick={() => state.clear()} style="border: none; background: none; color: #92400e; cursor: pointer;">Remove</button>
                  </div>
                ) : null
              }}
            </div>
          )}
        </FileUpload>
      </div>

      {/* Disabled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="max-width: 500px; margin-bottom: 32px;">
        <FileUpload disabled>
          {(state: any) => (
            <div
              style="border: 2px dashed #e5e7eb; border-radius: 12px; padding: 32px 20px; text-align: center; background: #f9fafb; color: #9ca3af; cursor: not-allowed;"
            >
              <p style="font-weight: 500;">Upload disabled</p>
              <p style="font-size: 13px;">File uploads are currently unavailable.</p>
            </div>
          )}
        </FileUpload>
      </div>
    </div>
  )
}
